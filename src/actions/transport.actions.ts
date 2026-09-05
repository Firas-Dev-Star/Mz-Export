'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { BusinessError, isBusinessError } from '@/lib/errors'
import { formatMoney } from '@/lib/format'
import { gt, round, sub } from '@/lib/money'
import { TRANSPORT_SEQUENCE_KEY, reserveNextNumber } from '@/lib/numbering'
import { prisma } from '@/lib/prisma'
import {
  TRANSPORT_DECIMALS,
  buildCarrierData,
  buildTransportInvoiceData,
  refreshTransportPaymentState,
} from '@/services/transport.service'
import type { ActionResult } from '@/validations/common'
import {
  type CarrierInput,
  type TransportInvoiceInput,
  type TransportPaymentInput,
  carrierSchema,
  transportInvoiceSchema,
  transportPaymentSchema,
} from '@/validations/transport'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  if (isBusinessError(error)) return fail(error.message)
  console.error('[transport.action]', error)
  return fail("Une erreur est survenue. Aucune modification n'a été enregistrée.")
}

function draftNumber(id: string) {
  return `BROUILLON-T-${id.slice(-8).toUpperCase()}`
}

/**
 * Une facture de transport validee n'est plus modifiable : son numero est
 * consomme dans la sequence et elle est peut-etre deja reglee.
 */
function assertEditable(facture: { status: string }) {
  if (facture.status !== 'DRAFT') {
    throw new BusinessError(
      'Une facture de transport validée ne peut plus être modifiée. Annulez-la puis ressaisissez-la.',
    )
  }
}

function revalidate(id?: string, invoiceId?: string | null) {
  revalidatePath('/transport')
  if (id) revalidatePath(`/transport/${id}`)
  revalidatePath('/transport/carriers')
  // La vente affiche le cout de transport de son expedition : elle bouge aussi.
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/dashboard')
  revalidatePath('/etats')
}

// ---------------------------------------------------------------------------
// Transporteurs
// ---------------------------------------------------------------------------

/** Code lisible derive de la raison sociale, quand l'utilisateur n'en donne pas. */
async function nextCarrierCode(companyName: string) {
  const base =
    companyName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 12) || 'TRANSP'

  let candidate = base
  let suffix = 1
  while (await prisma.carrier.findUnique({ where: { code: candidate }, select: { id: true } })) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  return candidate
}

export async function createCarrier(raw: CarrierInput): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission('carrier.write')

    const parsed = carrierSchema.safeParse(raw)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Formulaire invalide',
        fieldErrors: parsed.error.flatten().fieldErrors,
      }
    }

    const data = buildCarrierData(parsed.data)
    const code = data.code || (await nextCarrierCode(data.companyName))

    const existing = await prisma.carrier.findUnique({ where: { code }, select: { id: true } })
    if (existing) return fail(`Le code « ${code} » est déjà utilisé par un autre transporteur.`)

    const carrier = await prisma.$transaction(async (tx) => {
      const created = await tx.carrier.create({
        data: { ...data, code },
        select: { id: true, companyName: true },
      })
      await recordAudit(
        {
          session,
          action: 'CREATE_CARRIER',
          entity: 'Carrier',
          entityId: created.id,
          reference: created.companyName,
        },
        tx,
      )
      return created
    })

    revalidate()
    return { ok: true, data: { id: carrier.id }, message: `Transporteur ${carrier.companyName} créé.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function updateCarrier(id: string, raw: CarrierInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('carrier.write')

    const parsed = carrierSchema.safeParse(raw)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Formulaire invalide',
        fieldErrors: parsed.error.flatten().fieldErrors,
      }
    }

    const existing = await prisma.carrier.findUnique({ where: { id }, select: { id: true, code: true } })
    if (!existing) return fail('Transporteur introuvable.')

    const data = buildCarrierData(parsed.data)
    const code = data.code || existing.code

    if (code !== existing.code) {
      const clash = await prisma.carrier.findUnique({ where: { code }, select: { id: true } })
      if (clash) return fail(`Le code « ${code} » est déjà utilisé par un autre transporteur.`)
    }

    await prisma.$transaction(async (tx) => {
      const saved = await tx.carrier.update({
        where: { id },
        data: { ...data, code },
        select: { companyName: true },
      })
      await recordAudit(
        {
          session,
          action: 'UPDATE_CARRIER',
          entity: 'Carrier',
          entityId: id,
          reference: saved.companyName,
        },
        tx,
      )
    })

    revalidate()
    revalidatePath(`/transport/carriers/${id}`)
    return { ok: true, message: 'Transporteur mis à jour.' }
  } catch (error) {
    return handleError(error)
  }
}

export async function deleteCarrier(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('carrier.delete')

    const carrier = await prisma.carrier.findUnique({
      where: { id },
      select: { id: true, companyName: true, _count: { select: { invoices: true } } },
    })
    if (!carrier) return fail('Transporteur introuvable.')
    if (carrier._count.invoices > 0) {
      return fail(
        `${carrier.companyName} porte ${carrier._count.invoices} facture(s) de transport. ` +
          'Désactivez-le plutôt que de le supprimer, pour ne pas perdre son historique.',
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.carrier.delete({ where: { id } })
      await recordAudit(
        {
          session,
          action: 'DELETE_CARRIER',
          entity: 'Carrier',
          entityId: id,
          reference: carrier.companyName,
        },
        tx,
      )
    })

    revalidate()
    return { ok: true, message: `Transporteur ${carrier.companyName} supprimé.` }
  } catch (error) {
    return handleError(error)
  }
}

// ---------------------------------------------------------------------------
// Factures de transport
// ---------------------------------------------------------------------------

/** Verifie que la vente a rattacher existe, et renvoie son identifiant. */
async function resolveInvoice(invoiceId: string | undefined) {
  if (!invoiceId) return null
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } })
  if (!invoice) throw new BusinessError('La facture de vente à rattacher est introuvable.')
  return invoice.id
}

export async function createTransportInvoice(
  raw: TransportInvoiceInput,
  options: { confirm?: boolean } = {},
): Promise<ActionResult<{ id: string; number: string }>> {
  try {
    const session = await requirePermission(options.confirm ? 'transport.confirm' : 'transport.write')

    const parsed = transportInvoiceSchema.safeParse(raw)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Formulaire invalide',
        fieldErrors: parsed.error.flatten().fieldErrors,
      }
    }
    const input = parsed.data

    const carrier = await prisma.carrier.findUnique({
      where: { id: input.carrierId },
      select: { id: true },
    })
    if (!carrier) return fail('Transporteur introuvable.')
    await resolveInvoice(input.invoiceId || undefined)

    const { scalars, totals } = buildTransportInvoiceData(input)

    const facture = await prisma.$transaction(async (tx) => {
      const created = await tx.transportInvoice.create({
        data: {
          ...scalars,
          number: `TMP-${crypto.randomUUID()}`,
          status: 'DRAFT',
          paidAmount: '0.000',
          createdById: session.userId,
        },
        select: { id: true },
      })

      const number = options.confirm
        ? await reserveNextNumber(tx, TRANSPORT_SEQUENCE_KEY, scalars.date)
        : draftNumber(created.id)

      const saved = await tx.transportInvoice.update({
        where: { id: created.id },
        data: {
          number,
          status: options.confirm ? 'CONFIRMED' : 'DRAFT',
          confirmedAt: options.confirm ? new Date() : null,
        },
        select: { id: true, number: true },
      })

      await recordAudit(
        {
          session,
          action: options.confirm ? 'CONFIRM_TRANSPORT_INVOICE' : 'CREATE_TRANSPORT_INVOICE',
          entity: 'TransportInvoice',
          entityId: saved.id,
          reference: saved.number,
          details: {
            netToPay: totals.netToPay.toFixed(TRANSPORT_DECIMALS),
            currency: input.currencyCode,
            shipmentRef: input.shipmentRef,
          },
        },
        tx,
      )

      return saved
    })

    revalidate(facture.id, scalars.invoiceId)
    return {
      ok: true,
      data: facture,
      message: options.confirm
        ? `Facture de transport ${facture.number} validée.`
        : 'Brouillon de transport enregistré.',
    }
  } catch (error) {
    return handleError(error)
  }
}

export async function updateTransportInvoice(
  id: string,
  raw: TransportInvoiceInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission('transport.write')

    const parsed = transportInvoiceSchema.safeParse(raw)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Formulaire invalide',
        fieldErrors: parsed.error.flatten().fieldErrors,
      }
    }

    const existing = await prisma.transportInvoice.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, invoiceId: true },
    })
    if (!existing) return fail('Facture de transport introuvable.')
    assertEditable(existing)
    await resolveInvoice(parsed.data.invoiceId || undefined)

    const { scalars } = buildTransportInvoiceData(parsed.data)

    await prisma.$transaction(async (tx) => {
      await tx.transportInvoice.update({ where: { id }, data: scalars })
      await recordAudit(
        {
          session,
          action: 'UPDATE_TRANSPORT_INVOICE',
          entity: 'TransportInvoice',
          entityId: id,
          reference: existing.number,
        },
        tx,
      )
    })

    revalidate(id, scalars.invoiceId ?? existing.invoiceId)
    return { ok: true, data: { id }, message: 'Facture de transport mise à jour.' }
  } catch (error) {
    return handleError(error)
  }
}

/** Valide un brouillon : numerotation atomique. Aucun mouvement de stock. */
export async function confirmTransportInvoice(id: string): Promise<ActionResult<{ number: string }>> {
  try {
    const session = await requirePermission('transport.confirm')

    const facture = await prisma.transportInvoice.findUnique({
      where: { id },
      select: { id: true, status: true, date: true, netToPay: true, invoiceId: true },
    })
    if (!facture) return fail('Facture de transport introuvable.')
    if (facture.status !== 'DRAFT') return fail('Seul un brouillon peut être validé.')
    if (!gt(facture.netToPay, 0)) return fail('Le net à payer doit être supérieur à zéro.')

    const result = await prisma.$transaction(async (tx) => {
      const number = await reserveNextNumber(tx, TRANSPORT_SEQUENCE_KEY, facture.date)
      const saved = await tx.transportInvoice.update({
        where: { id },
        data: { number, status: 'CONFIRMED', confirmedAt: new Date() },
        select: { number: true },
      })
      await recordAudit(
        {
          session,
          action: 'CONFIRM_TRANSPORT_INVOICE',
          entity: 'TransportInvoice',
          entityId: id,
          reference: saved.number,
        },
        tx,
      )
      return saved
    })

    revalidate(id, facture.invoiceId)
    return { ok: true, data: result, message: `Facture de transport ${result.number} validée.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function cancelTransportInvoice(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('transport.cancel')

    const facture = await prisma.transportInvoice.findUnique({
      where: { id },
      select: {
        id: true, number: true, status: true, invoiceId: true,
        _count: { select: { payments: true } },
      },
    })
    if (!facture) return fail('Facture de transport introuvable.')
    if (facture.status === 'CANCELLED') return fail('Cette facture est déjà annulée.')
    if (facture._count.payments > 0) {
      return fail('Supprimez d’abord les règlements enregistrés sur cette facture.')
    }

    await prisma.$transaction(async (tx) => {
      await tx.transportInvoice.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })
      await recordAudit(
        {
          session,
          action: 'CANCEL_TRANSPORT_INVOICE',
          entity: 'TransportInvoice',
          entityId: id,
          reference: facture.number,
        },
        tx,
      )
    })

    revalidate(id, facture.invoiceId)
    return { ok: true, message: `Facture de transport ${facture.number} annulée.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function deleteTransportInvoice(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('transport.delete')

    const facture = await prisma.transportInvoice.findUnique({
      where: { id },
      select: {
        id: true, number: true, status: true, invoiceId: true,
        _count: { select: { payments: true, documents: true } },
      },
    })
    if (!facture) return fail('Facture de transport introuvable.')
    if (facture._count.payments > 0) return fail('Supprimez d’abord les règlements de cette facture.')
    if (facture.status !== 'DRAFT' && facture.status !== 'CANCELLED') {
      return fail('Seuls un brouillon ou une facture annulée peuvent être supprimés.')
    }
    if (facture._count.documents > 0) {
      return fail(
        `Cette facture porte ${facture._count.documents} pièce(s) jointe(s) — la facture originale du ` +
          'transporteur. Supprimez-les explicitement avant de supprimer la facture.',
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.transportInvoice.delete({ where: { id } })
      await recordAudit(
        {
          session,
          action: 'DELETE_TRANSPORT_INVOICE',
          entity: 'TransportInvoice',
          entityId: id,
          reference: facture.number,
        },
        tx,
      )
    })

    revalidate(undefined, facture.invoiceId)
    return { ok: true, message: `Facture de transport ${facture.number} supprimée.` }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Rattache (ou detache) une facture de transport a une vente, sans repasser par
 * le formulaire complet. C'est l'operation la plus courante du module : la
 * facture du transporteur arrive apres la vente, et il faut la raccrocher.
 */
export async function linkTransportInvoiceToSale(
  id: string,
  invoiceId: string | null,
): Promise<ActionResult> {
  try {
    const session = await requirePermission('transport.write')

    const facture = await prisma.transportInvoice.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, invoiceId: true },
    })
    if (!facture) return fail('Facture de transport introuvable.')
    if (facture.status === 'CANCELLED') return fail('Cette facture est annulée.')

    const cible = invoiceId ? await resolveInvoice(invoiceId) : null

    await prisma.$transaction(async (tx) => {
      await tx.transportInvoice.update({ where: { id }, data: { invoiceId: cible } })
      await recordAudit(
        {
          session,
          action: cible ? 'LINK_TRANSPORT_INVOICE' : 'UNLINK_TRANSPORT_INVOICE',
          entity: 'TransportInvoice',
          entityId: id,
          reference: facture.number,
          details: { invoiceId: cible ?? '' },
        },
        tx,
      )
    })

    revalidate(id, cible ?? facture.invoiceId)
    return {
      ok: true,
      message: cible ? 'Facture de transport rattachée à la vente.' : 'Rattachement retiré.',
    }
  } catch (error) {
    return handleError(error)
  }
}

// ---------------------------------------------------------------------------
// Règlements transporteurs
// ---------------------------------------------------------------------------

export async function createTransportPayment(raw: TransportPaymentInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('payment.write')

    const parsed = transportPaymentSchema.safeParse(raw)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Formulaire invalide',
        fieldErrors: parsed.error.flatten().fieldErrors,
      }
    }
    const data = parsed.data

    const facture = await prisma.transportInvoice.findUnique({
      where: { id: data.transportInvoiceId },
      select: {
        id: true, number: true, status: true, currencyCode: true,
        netToPay: true, paidAmount: true, invoiceId: true,
      },
    })
    if (!facture) return fail('Facture de transport introuvable.')
    if (facture.status === 'DRAFT') return fail('Validez la facture avant d’enregistrer un règlement.')
    if (facture.status === 'CANCELLED') return fail('Cette facture est annulée.')

    const remaining = round(sub(facture.netToPay, facture.paidAmount), TRANSPORT_DECIMALS)
    if (gt(data.amount, remaining)) {
      return fail(
        `Le règlement (${formatMoney(data.amount, facture.currencyCode)}) dépasse le solde restant dû (${formatMoney(remaining, facture.currencyCode)}).`,
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.transportPayment.create({
        data: {
          transportInvoiceId: facture.id,
          amount: data.amount,
          currencyCode: facture.currencyCode,
          date: new Date(`${data.date}T00:00:00.000Z`),
          method: data.method,
          reference: data.reference,
          note: data.note,
          createdById: session.userId,
        },
      })
      await refreshTransportPaymentState(tx, facture.id)
      await recordAudit(
        {
          session,
          action: 'CREATE_TRANSPORT_PAYMENT',
          entity: 'TransportPayment',
          entityId: facture.id,
          reference: facture.number,
          details: { amount: data.amount, currency: facture.currencyCode },
        },
        tx,
      )
    })

    revalidate(facture.id, facture.invoiceId)
    return {
      ok: true,
      message: `Règlement de ${formatMoney(data.amount, facture.currencyCode)} enregistré.`,
    }
  } catch (error) {
    return handleError(error)
  }
}

export async function deleteTransportPayment(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('payment.delete')

    const payment = await prisma.transportPayment.findUnique({
      where: { id },
      select: {
        id: true,
        amount: true,
        transportInvoice: { select: { id: true, number: true, invoiceId: true } },
      },
    })
    if (!payment) return fail('Règlement introuvable.')

    await prisma.$transaction(async (tx) => {
      await tx.transportPayment.delete({ where: { id } })
      await refreshTransportPaymentState(tx, payment.transportInvoice.id)
      await recordAudit(
        {
          session,
          action: 'DELETE_TRANSPORT_PAYMENT',
          entity: 'TransportPayment',
          entityId: id,
          reference: payment.transportInvoice.number,
          details: { amount: String(payment.amount) },
        },
        tx,
      )
    })

    revalidate(payment.transportInvoice.id, payment.transportInvoice.invoiceId)
    return { ok: true, message: 'Règlement supprimé.' }
  } catch (error) {
    return handleError(error)
  }
}
