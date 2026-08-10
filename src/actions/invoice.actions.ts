'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { BusinessError, isBusinessError } from '@/lib/errors'
import { gt } from '@/lib/money'
import { applyStockMovement, assertStockAvailable, reverseDocumentMovements } from '@/lib/stock'
import { amountToFrenchWords } from '@/lib/number-to-words-fr'
import { reserveNextNumber } from '@/lib/numbering'
import { prisma } from '@/lib/prisma'
import { buildInvoiceData } from '@/services/invoice.service'
import type { ActionResult } from '@/validations/common'
import { type InvoiceInput, invoiceSchema } from '@/validations/invoice'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  if (isBusinessError(error)) return fail(error.message)
  console.error('[invoice.action]', error)
  return fail("Une erreur est survenue. Aucune modification n'a été enregistrée.")
}

function draftNumber(id: string) {
  return `BROUILLON-${id.slice(-8).toUpperCase()}`
}

/**
 * Seul un BROUILLON est modifiable.
 * Une facture confirmee porte un numero definitif et a deja impacte le stock :
 * elle doit etre annulee puis dupliquee pour etre corrigee.
 */
function assertEditable(invoice: { status: string }) {
  if (invoice.status !== 'DRAFT') {
    throw new BusinessError(
      'Une facture confirmée ne peut plus être modifiée. Annulez-la puis dupliquez-la pour la corriger.',
    )
  }
}

/**
 * Cree une facture.
 * - En brouillon : aucun numero de sequence n'est consomme (numero provisoire).
 * - Confirmee    : le numero definitif est reserve de maniere atomique.
 * Tout se deroule dans une transaction : en cas d'echec, rien n'est ecrit.
 */
export async function createInvoice(
  raw: InvoiceInput,
  options: { confirm?: boolean } = {},
): Promise<ActionResult<{ id: string; number: string }>> {
  try {
    const session = await requirePermission(options.confirm ? 'invoice.confirm' : 'invoice.write')

    const parsed = invoiceSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const input = parsed.data

    const customer = await prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } })
    if (!customer) return fail('Client introuvable.')

    const { scalars, items, totals } = buildInvoiceData(input)

    const invoice = await prisma.$transaction(async (tx) => {
      // Controle de stock AVANT toute ecriture lorsqu'on confirme directement.
      if (options.confirm) {
        await assertStockAvailable(
          tx,
          items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        )
      }

      const created = await tx.invoice.create({
        data: {
          ...scalars,
          number: `TMP-${crypto.randomUUID()}`,
          status: 'DRAFT',
          paidAmount: '0.00',
          createdById: session.userId,
          items: { create: items },
        },
        select: { id: true },
      })

      const number = options.confirm
        ? await reserveNextNumber(tx, 'SALE', scalars.date)
        : draftNumber(created.id)

      const saved = await tx.invoice.update({
        where: { id: created.id },
        data: {
          number,
          status: options.confirm ? 'CONFIRMED' : 'DRAFT',
          confirmedAt: options.confirm ? new Date() : null,
        },
        select: { id: true, number: true },
      })

      if (options.confirm) {
        for (const item of items) {
          if (!item.productId) continue
          await applyStockMovement(tx, {
            productId: item.productId,
            type: 'SALE_OUT',
            quantity: item.quantity,
            date: scalars.date,
            referenceType: 'INVOICE',
            referenceId: saved.id,
            reference: saved.number,
            note: `Facture ${saved.number}`,
            userId: session.userId,
          })
        }
      }

      await recordAudit(
        {
          session,
          action: options.confirm ? 'CONFIRM_INVOICE' : 'CREATE_INVOICE',
          entity: 'Invoice',
          entityId: saved.id,
          reference: saved.number,
          details: { netToPay: totals.netToPay.toFixed(2), currency: input.currencyCode },
        },
        tx,
      )

      return saved
    })

    revalidatePath('/invoices')
    revalidatePath('/dashboard')
    revalidatePath('/stock')
    return {
      ok: true,
      data: invoice,
      message: options.confirm
        ? `Facture ${invoice.number} créée et confirmée.`
        : 'Brouillon enregistré.',
    }
  } catch (error) {
    return handleError(error)
  }
}

export async function updateInvoice(id: string, raw: InvoiceInput): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission('invoice.write')

    const parsed = invoiceSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const input = parsed.data

    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, number: true, status: true },
    })
    if (!existing) return fail('Facture introuvable.')
    assertEditable(existing)

    const { scalars, items, totals } = buildInvoiceData(input)

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } })
      await tx.invoice.update({
        where: { id },
        data: { ...scalars, items: { create: items } },
      })

      await recordAudit(
        {
          session,
          action: 'UPDATE_INVOICE',
          entity: 'Invoice',
          entityId: id,
          reference: existing.number,
          details: { netToPay: totals.netToPay.toFixed(2) },
        },
        tx,
      )
    })

    revalidatePath('/invoices')
    revalidatePath(`/invoices/${id}`)
    revalidatePath('/dashboard')
    return { ok: true, data: { id }, message: 'Facture mise à jour.' }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Confirme un brouillon : consomme le prochain numero de la sequence,
 * fige le montant en toutes lettres et journalise l'operation.
 */
export async function confirmInvoice(id: string): Promise<ActionResult<{ number: string }>> {
  try {
    const session = await requirePermission('invoice.confirm')

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true, status: true, date: true, netToPay: true, currencyCode: true,
        items: { select: { id: true, productId: true, quantity: true } },
      },
    })
    if (!invoice) return fail('Facture introuvable.')
    if (invoice.status !== 'DRAFT') return fail('Seul un brouillon peut être confirmé.')
    if (invoice.items.length === 0) return fail('La facture doit comporter au moins une ligne.')
    if (!gt(invoice.netToPay, 0)) return fail('Le net à payer doit être supérieur à zéro.')

    const result = await prisma.$transaction(async (tx) => {
      // Le stock est verifie a l'interieur de la transaction : si une autre
      // facture consomme le meme produit entre-temps, la confirmation echoue.
      await assertStockAvailable(tx, invoice.items)

      const number = await reserveNextNumber(tx, 'SALE', invoice.date)

      const saved = await tx.invoice.update({
        where: { id },
        data: {
          number,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          amountInWords: amountToFrenchWords(invoice.netToPay, invoice.currencyCode),
        },
        select: { number: true },
      })

      for (const item of invoice.items) {
        if (!item.productId) continue
        await applyStockMovement(tx, {
          productId: item.productId,
          type: 'SALE_OUT',
          quantity: item.quantity,
          date: invoice.date,
          referenceType: 'INVOICE',
          referenceId: id,
          reference: saved.number,
          note: `Facture ${saved.number}`,
          userId: session.userId,
        })
      }

      await recordAudit(
        { session, action: 'CONFIRM_INVOICE', entity: 'Invoice', entityId: id, reference: saved.number },
        tx,
      )

      return saved
    })

    revalidatePath('/invoices')
    revalidatePath(`/invoices/${id}`)
    revalidatePath('/dashboard')
    revalidatePath('/stock')
    return { ok: true, data: result, message: `Facture ${result.number} confirmée.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function cancelInvoice(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('invoice.cancel')

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, _count: { select: { payments: true } } },
    })
    if (!invoice) return fail('Facture introuvable.')
    if (invoice.status === 'CANCELLED') return fail('Cette facture est déjà annulée.')
    if (invoice._count.payments > 0) {
      return fail('Supprimez d’abord les règlements enregistrés sur cette facture.')
    }

    const restored = await prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } })

      // Les sorties de stock de la facture sont contre-passees (retour client).
      const count = await reverseDocumentMovements(tx, {
        referenceType: 'INVOICE',
        referenceId: id,
        reference: invoice.number,
        date: new Date(),
        userId: session.userId,
        note: `Annulation de la facture ${invoice.number}`,
      })

      await recordAudit(
        {
          session,
          action: 'CANCEL_INVOICE',
          entity: 'Invoice',
          entityId: id,
          reference: invoice.number,
          details: { stockMovementsReversed: count },
        },
        tx,
      )
      return count
    })

    revalidatePath('/invoices')
    revalidatePath(`/invoices/${id}`)
    revalidatePath('/dashboard')
    revalidatePath('/stock')
    return {
      ok: true,
      message:
        restored > 0
          ? `Facture ${invoice.number} annulée. ${restored} mouvement(s) de stock contre-passé(s).`
          : `Facture ${invoice.number} annulée.`,
    }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Suppression definitive.
 * Une facture confirmee n'est jamais supprimee : elle doit etre annulee,
 * afin de garantir la continuite de la numerotation.
 */
export async function deleteInvoice(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('invoice.delete')

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, _count: { select: { payments: true } } },
    })
    if (!invoice) return fail('Facture introuvable.')
    if (invoice._count.payments > 0) return fail('Supprimez d’abord les règlements de cette facture.')
    if (invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED') {
      return fail('Seuls un brouillon ou une facture annulée peuvent être supprimés. Annulez la facture au préalable.')
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.delete({ where: { id } })
      await recordAudit(
        { session, action: 'DELETE_INVOICE', entity: 'Invoice', entityId: id, reference: invoice.number },
        tx,
      )
    })

    revalidatePath('/invoices')
    revalidatePath('/dashboard')
    return { ok: true, message: `Facture ${invoice.number} supprimée.` }
  } catch (error) {
    return handleError(error)
  }
}

/** Duplique une facture existante sous forme de nouveau brouillon. */
export async function duplicateInvoice(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission('invoice.write')

    const source = await prisma.invoice.findUnique({
      where: { id },
      include: { items: { orderBy: { position: 'asc' } } },
    })
    if (!source) return fail('Facture introuvable.')

    const created = await prisma.$transaction(async (tx) => {
      const {
        id: _id,
        number: _number,
        status: _status,
        confirmedAt: _confirmedAt,
        cancelledAt: _cancelledAt,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        items,
        paidAmount: _paid,
        ...rest
      } = source

      const draft = await tx.invoice.create({
        data: {
          ...rest,
          number: `TMP-${crypto.randomUUID()}`,
          status: 'DRAFT',
          paidAmount: '0.00',
          balanceDue: rest.netToPay,
          confirmedAt: null,
          cancelledAt: null,
          createdById: session.userId,
          date: new Date(),
          items: {
            create: items.map(({ id: _itemId, invoiceId: _invoiceId, ...item }) => item),
          },
        },
        select: { id: true },
      })

      return tx.invoice.update({
        where: { id: draft.id },
        data: { number: draftNumber(draft.id) },
        select: { id: true },
      })
    })

    revalidatePath('/invoices')
    return { ok: true, data: created, message: 'Brouillon créé à partir de la facture.' }
  } catch (error) {
    return handleError(error)
  }
}
