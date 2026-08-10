'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { BusinessError, isBusinessError } from '@/lib/errors'
import { formatMoney } from '@/lib/format'
import { gt, round, sub } from '@/lib/money'
import { PURCHASE_SEQUENCE_KEY, reserveNextNumber } from '@/lib/numbering'
import { prisma } from '@/lib/prisma'
import { applyStockMovement, reverseDocumentMovements } from '@/lib/stock'
import {
  PURCHASE_DECIMALS,
  buildPurchaseData,
  refreshPurchasePaymentState,
} from '@/services/purchase.service'
import type { ActionResult } from '@/validations/common'
import {
  type PurchaseInput,
  type PurchasePaymentInput,
  purchasePaymentSchema,
  purchaseSchema,
} from '@/validations/purchase'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  if (isBusinessError(error)) return fail(error.message)
  console.error('[purchase.action]', error)
  return fail("Une erreur est survenue. Aucune modification n'a été enregistrée.")
}

function draftNumber(id: string) {
  return `BROUILLON-A-${id.slice(-8).toUpperCase()}`
}

/** Seul un brouillon d'achat est modifiable : une facture validée a déjà alimenté le stock. */
function assertEditable(purchase: { status: string }) {
  if (purchase.status !== 'DRAFT') {
    throw new BusinessError(
      "Une facture d'achat validée ne peut plus être modifiée. Annulez-la puis dupliquez-la pour la corriger.",
    )
  }
}

function revalidate(id?: string) {
  revalidatePath('/purchases')
  if (id) revalidatePath(`/purchases/${id}`)
  revalidatePath('/stock')
  revalidatePath('/products')
  revalidatePath('/dashboard')
}

/**
 * Cree une facture d'achat.
 * A la validation : numero FAC-A atomique + ENTREE EN STOCK de chaque ligne
 * rattachee a un produit, le tout dans une seule transaction.
 */
export async function createPurchase(
  raw: PurchaseInput,
  options: { confirm?: boolean } = {},
): Promise<ActionResult<{ id: string; number: string }>> {
  try {
    const session = await requirePermission(options.confirm ? 'purchase.confirm' : 'purchase.write')

    const parsed = purchaseSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const input = parsed.data

    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } })
    if (!supplier) return fail('Fournisseur introuvable.')

    const { scalars, items, totals } = buildPurchaseData(input)

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          ...scalars,
          number: `TMP-${crypto.randomUUID()}`,
          status: 'DRAFT',
          paidAmount: '0.000',
          createdById: session.userId,
          items: { create: items },
        },
        select: { id: true },
      })

      const number = options.confirm
        ? await reserveNextNumber(tx, PURCHASE_SEQUENCE_KEY, scalars.date)
        : draftNumber(created.id)

      const saved = await tx.purchase.update({
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
            type: 'PURCHASE_IN',
            quantity: item.quantity,
            date: scalars.date,
            referenceType: 'PURCHASE',
            referenceId: saved.id,
            reference: saved.number,
            note: `Achat ${saved.number}`,
            userId: session.userId,
          })
        }
      }

      await recordAudit(
        {
          session,
          action: options.confirm ? 'CONFIRM_PURCHASE' : 'CREATE_PURCHASE',
          entity: 'Purchase',
          entityId: saved.id,
          reference: saved.number,
          details: { netToPay: totals.netToPay.toFixed(PURCHASE_DECIMALS), currency: input.currencyCode },
        },
        tx,
      )

      return saved
    })

    revalidate(purchase.id)
    return {
      ok: true,
      data: purchase,
      message: options.confirm
        ? `Facture d'achat ${purchase.number} validée. Le stock a été mis à jour.`
        : "Brouillon d'achat enregistré.",
    }
  } catch (error) {
    return handleError(error)
  }
}

export async function updatePurchase(id: string, raw: PurchaseInput): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission('purchase.write')

    const parsed = purchaseSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const existing = await prisma.purchase.findUnique({
      where: { id },
      select: { id: true, number: true, status: true },
    })
    if (!existing) return fail('Facture d’achat introuvable.')
    assertEditable(existing)

    const { scalars, items } = buildPurchaseData(parsed.data)

    await prisma.$transaction(async (tx) => {
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } })
      await tx.purchase.update({ where: { id }, data: { ...scalars, items: { create: items } } })
      await recordAudit(
        { session, action: 'UPDATE_PURCHASE', entity: 'Purchase', entityId: id, reference: existing.number },
        tx,
      )
    })

    revalidate(id)
    return { ok: true, data: { id }, message: "Facture d'achat mise à jour." }
  } catch (error) {
    return handleError(error)
  }
}

/** Valide un brouillon d'achat : numérotation + entrée en stock. */
export async function confirmPurchase(id: string): Promise<ActionResult<{ number: string }>> {
  try {
    const session = await requirePermission('purchase.confirm')

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      select: {
        id: true, status: true, date: true, netToPay: true,
        items: { select: { id: true, productId: true, quantity: true } },
      },
    })
    if (!purchase) return fail('Facture d’achat introuvable.')
    if (purchase.status !== 'DRAFT') return fail('Seul un brouillon peut être validé.')
    if (purchase.items.length === 0) return fail('La facture doit comporter au moins une ligne.')
    if (!gt(purchase.netToPay, 0)) return fail('Le net à payer doit être supérieur à zéro.')

    const result = await prisma.$transaction(async (tx) => {
      const number = await reserveNextNumber(tx, PURCHASE_SEQUENCE_KEY, purchase.date)

      const saved = await tx.purchase.update({
        where: { id },
        data: { number, status: 'CONFIRMED', confirmedAt: new Date() },
        select: { number: true },
      })

      let moved = 0
      for (const item of purchase.items) {
        if (!item.productId) continue
        const stockAfter = await applyStockMovement(tx, {
          productId: item.productId,
          type: 'PURCHASE_IN',
          quantity: item.quantity,
          date: purchase.date,
          referenceType: 'PURCHASE',
          referenceId: id,
          reference: saved.number,
          note: `Achat ${saved.number}`,
          userId: session.userId,
        })
        if (stockAfter) moved += 1
      }

      await recordAudit(
        {
          session,
          action: 'CONFIRM_PURCHASE',
          entity: 'Purchase',
          entityId: id,
          reference: saved.number,
          details: { stockMovements: moved },
        },
        tx,
      )

      return saved
    })

    revalidate(id)
    return { ok: true, data: result, message: `Facture d'achat ${result.number} validée. Le stock a été mis à jour.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function cancelPurchase(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('purchase.cancel')

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, _count: { select: { payments: true } } },
    })
    if (!purchase) return fail('Facture d’achat introuvable.')
    if (purchase.status === 'CANCELLED') return fail('Cette facture est déjà annulée.')
    if (purchase._count.payments > 0) {
      return fail('Supprimez d’abord les règlements enregistrés sur cette facture.')
    }

    const reversed = await prisma.$transaction(async (tx) => {
      await tx.purchase.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } })

      // Les entrées en stock de l'achat sont contre-passées (retour fournisseur).
      const count = await reverseDocumentMovements(tx, {
        referenceType: 'PURCHASE',
        referenceId: id,
        reference: purchase.number,
        date: new Date(),
        userId: session.userId,
        note: `Annulation de la facture d'achat ${purchase.number}`,
      })

      await recordAudit(
        {
          session,
          action: 'CANCEL_PURCHASE',
          entity: 'Purchase',
          entityId: id,
          reference: purchase.number,
          details: { stockMovementsReversed: count },
        },
        tx,
      )
      return count
    })

    revalidate(id)
    return {
      ok: true,
      message:
        reversed > 0
          ? `Facture d'achat ${purchase.number} annulée. ${reversed} mouvement(s) de stock contre-passé(s).`
          : `Facture d'achat ${purchase.number} annulée.`,
    }
  } catch (error) {
    return handleError(error)
  }
}

export async function deletePurchase(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('purchase.delete')

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      select: { id: true, number: true, status: true, _count: { select: { payments: true } } },
    })
    if (!purchase) return fail('Facture d’achat introuvable.')
    if (purchase._count.payments > 0) return fail('Supprimez d’abord les règlements de cette facture.')
    if (purchase.status !== 'DRAFT' && purchase.status !== 'CANCELLED') {
      return fail('Seuls un brouillon ou une facture annulée peuvent être supprimés.')
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchase.delete({ where: { id } })
      await recordAudit(
        { session, action: 'DELETE_PURCHASE', entity: 'Purchase', entityId: id, reference: purchase.number },
        tx,
      )
    })

    revalidate()
    return { ok: true, message: `Facture d'achat ${purchase.number} supprimée.` }
  } catch (error) {
    return handleError(error)
  }
}

// ---------------------------------------------------------------------------
// Règlements fournisseurs
// ---------------------------------------------------------------------------

export async function createPurchasePayment(raw: PurchasePaymentInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('payment.write')

    const parsed = purchasePaymentSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const purchase = await prisma.purchase.findUnique({
      where: { id: data.purchaseId },
      select: { id: true, number: true, status: true, currencyCode: true, netToPay: true, paidAmount: true },
    })
    if (!purchase) return fail('Facture d’achat introuvable.')
    if (purchase.status === 'DRAFT') return fail('Validez la facture avant d’enregistrer un règlement.')
    if (purchase.status === 'CANCELLED') return fail('Cette facture est annulée.')

    const remaining = round(sub(purchase.netToPay, purchase.paidAmount), PURCHASE_DECIMALS)
    if (gt(data.amount, remaining)) {
      return fail(
        `Le règlement (${formatMoney(data.amount, purchase.currencyCode)}) dépasse le solde restant dû (${formatMoney(remaining, purchase.currencyCode)}).`,
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchasePayment.create({
        data: {
          purchaseId: purchase.id,
          amount: data.amount,
          currencyCode: purchase.currencyCode,
          date: new Date(`${data.date}T00:00:00.000Z`),
          method: data.method,
          reference: data.reference,
          note: data.note,
          createdById: session.userId,
        },
      })
      await refreshPurchasePaymentState(tx, purchase.id)
      await recordAudit(
        {
          session,
          action: 'CREATE_PURCHASE_PAYMENT',
          entity: 'PurchasePayment',
          entityId: purchase.id,
          reference: purchase.number,
          details: { amount: data.amount, currency: purchase.currencyCode },
        },
        tx,
      )
    })

    revalidate(purchase.id)
    return { ok: true, message: `Règlement de ${formatMoney(data.amount, purchase.currencyCode)} enregistré.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function deletePurchasePayment(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('payment.delete')

    const payment = await prisma.purchasePayment.findUnique({
      where: { id },
      select: { id: true, amount: true, purchase: { select: { id: true, number: true } } },
    })
    if (!payment) return fail('Règlement introuvable.')

    await prisma.$transaction(async (tx) => {
      await tx.purchasePayment.delete({ where: { id } })
      await refreshPurchasePaymentState(tx, payment.purchase.id)
      await recordAudit(
        {
          session,
          action: 'DELETE_PURCHASE_PAYMENT',
          entity: 'PurchasePayment',
          entityId: id,
          reference: payment.purchase.number,
          details: { amount: String(payment.amount) },
        },
        tx,
      )
    })

    revalidate(payment.purchase.id)
    return { ok: true, message: 'Règlement supprimé.' }
  } catch (error) {
    return handleError(error)
  }
}
