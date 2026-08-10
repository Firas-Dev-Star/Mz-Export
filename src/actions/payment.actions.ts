'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { gt, round, sub } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { refreshInvoicePaymentState } from '@/services/invoice.service'
import type { ActionResult } from '@/validations/common'
import { type PaymentInput, paymentSchema } from '@/validations/payment'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  console.error('[payment.action]', error)
  return fail("Une erreur est survenue. Le règlement n'a pas été enregistré.")
}

/**
 * Enregistre un reglement.
 * Le montant paye, le solde et le statut de la facture sont recalcules
 * dans la meme transaction.
 */
export async function createPayment(raw: PaymentInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('payment.write')

    const parsed = paymentSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const invoice = await prisma.invoice.findUnique({
      where: { id: data.invoiceId },
      select: { id: true, number: true, status: true, currencyCode: true, netToPay: true, paidAmount: true },
    })
    if (!invoice) return fail('Facture introuvable.')
    if (invoice.status === 'DRAFT') return fail('Confirmez la facture avant d’enregistrer un règlement.')
    if (invoice.status === 'CANCELLED') return fail('Cette facture est annulée.')

    const remaining = round(sub(invoice.netToPay, invoice.paidAmount), 2)
    if (gt(data.amount, remaining)) {
      return fail(
        `Le règlement (${formatMoney(data.amount, invoice.currencyCode)}) dépasse le solde restant dû (${formatMoney(remaining, invoice.currencyCode)}).`,
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: data.amount,
          currencyCode: invoice.currencyCode,
          date: new Date(`${data.date}T00:00:00.000Z`),
          method: data.method,
          reference: data.reference,
          note: data.note,
          createdById: session.userId,
        },
      })

      await refreshInvoicePaymentState(tx, invoice.id)

      await recordAudit(
        {
          session,
          action: 'CREATE_PAYMENT',
          entity: 'Payment',
          entityId: invoice.id,
          reference: invoice.number,
          details: { amount: data.amount, currency: invoice.currencyCode, method: data.method },
        },
        tx,
      )
    })

    revalidatePath('/invoices')
    revalidatePath(`/invoices/${invoice.id}`)
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    return { ok: true, message: `Règlement de ${formatMoney(data.amount, invoice.currencyCode)} enregistré.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function deletePayment(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('payment.delete')

    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { id: true, amount: true, currencyCode: true, invoice: { select: { id: true, number: true } } },
    })
    if (!payment) return fail('Règlement introuvable.')

    await prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id } })
      await refreshInvoicePaymentState(tx, payment.invoice.id)
      await recordAudit(
        {
          session,
          action: 'DELETE_PAYMENT',
          entity: 'Payment',
          entityId: id,
          reference: payment.invoice.number,
          details: { amount: String(payment.amount) },
        },
        tx,
      )
    })

    revalidatePath('/invoices')
    revalidatePath(`/invoices/${payment.invoice.id}`)
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    return { ok: true, message: 'Règlement supprimé.' }
  } catch (error) {
    return handleError(error)
  }
}
