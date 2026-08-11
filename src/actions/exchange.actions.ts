'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { toDbDecimal } from '@/lib/money'
import { RATE_DECIMALS } from '@/lib/exchange'
import { prisma } from '@/lib/prisma'
import type { ActionResult } from '@/validations/common'
import { type ExchangeRateInput, exchangeRateSchema } from '@/validations/exchange'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  console.error('[exchange.action]', error)
  return fail("Une erreur est survenue. Le taux n'a pas été enregistré.")
}

/** Rafraichit tout ce qui affiche des montants convertis. */
function revalidateMoneyViews() {
  revalidatePath('/settings')
  revalidatePath('/dashboard')
  revalidatePath('/reports')
  revalidatePath('/invoices')
}

/**
 * Enregistre un taux pour une devise a une date donnee.
 *
 * Un taux existant a la meme date est REMPLACE plutot que dupliqué : c'est le
 * cas normal quand on corrige une saisie du jour.
 *
 * Important : cette operation ne touche AUCUNE facture deja enregistree.
 * Les documents portent leur propre taux fige.
 */
export async function saveExchangeRate(raw: ExchangeRateInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('settings.write')

    const parsed = exchangeRateSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const currency = await prisma.currency.findUnique({
      where: { code: data.currencyCode },
      select: { code: true, isActive: true },
    })
    if (!currency) return fail(`La devise ${data.currencyCode} n'existe pas.`)

    const validFrom = new Date(`${data.validFrom}T00:00:00.000Z`)
    const rate = toDbDecimal(data.rateToTnd, RATE_DECIMALS)

    const existing = await prisma.exchangeRate.findUnique({
      where: { currencyCode_validFrom: { currencyCode: data.currencyCode, validFrom } },
      select: { id: true },
    })

    await prisma.exchangeRate.upsert({
      where: { currencyCode_validFrom: { currencyCode: data.currencyCode, validFrom } },
      update: { rateToTnd: rate, source: data.source, note: data.note },
      create: {
        currencyCode: data.currencyCode,
        rateToTnd: rate,
        validFrom,
        source: data.source,
        note: data.note,
      },
    })

    await recordAudit({
      session,
      action: existing ? 'UPDATE_EXCHANGE_RATE' : 'CREATE_EXCHANGE_RATE',
      entity: 'ExchangeRate',
      reference: `${data.currencyCode} @ ${data.validFrom}`,
      details: { rateToTnd: rate },
    })

    revalidateMoneyViews()
    return {
      ok: true,
      message: `1 ${data.currencyCode} = ${rate} TND à partir du ${data.validFrom}.`,
    }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Supprime un taux de reference.
 * Sans effet sur les documents existants, qui gardent leur taux fige.
 */
export async function deleteExchangeRate(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('settings.write')

    const rate = await prisma.exchangeRate.findUnique({
      where: { id },
      select: { id: true, currencyCode: true, validFrom: true, rateToTnd: true },
    })
    if (!rate) return fail('Taux introuvable.')

    await prisma.exchangeRate.delete({ where: { id } })

    await recordAudit({
      session,
      action: 'DELETE_EXCHANGE_RATE',
      entity: 'ExchangeRate',
      entityId: id,
      reference: `${rate.currencyCode} @ ${rate.validFrom.toISOString().slice(0, 10)}`,
      details: { rateToTnd: String(rate.rateToTnd) },
    })

    revalidateMoneyViews()
    return { ok: true, message: 'Taux supprimé. Les factures existantes ne sont pas modifiées.' }
  } catch (error) {
    return handleError(error)
  }
}
