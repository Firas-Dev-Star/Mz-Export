import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { BASE_CURRENCY } from '@/lib/exchange'
import { prisma } from '@/lib/prisma'

export interface RateRow {
  id: string
  currencyCode: string
  rateToTnd: string
  validFrom: Date
  source: string
  note: string
}

/**
 * Taux applicable a une devise pour une date donnee : le plus recent dont
 * `validFrom` ne depasse pas la date demandee.
 *
 * Renvoie '1' pour le dinar et '' si aucun taux n'a encore ete saisi
 * (l'appelant doit alors demander une saisie manuelle plutot que de deviner).
 */
export async function getRateFor(
  currencyCode: string,
  date: Date,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  if (currencyCode === BASE_CURRENCY) return '1'

  const row = await client.exchangeRate.findFirst({
    where: { currencyCode, validFrom: { lte: date } },
    orderBy: { validFrom: 'desc' },
    select: { rateToTnd: true },
  })

  return row ? String(row.rateToTnd) : ''
}

/**
 * Taux courants de toutes les devises, pour pre-remplir les formulaires.
 * Une seule requete : on prend tous les taux en vigueur aujourd'hui et on
 * garde le plus recent par devise.
 */
export async function getCurrentRates(): Promise<Record<string, string>> {
  const today = new Date()
  const rows = await prisma.exchangeRate.findMany({
    where: { validFrom: { lte: today } },
    orderBy: [{ currencyCode: 'asc' }, { validFrom: 'desc' }],
    select: { currencyCode: true, rateToTnd: true },
  })

  const result: Record<string, string> = { [BASE_CURRENCY]: '1' }
  for (const row of rows) {
    // Grace au tri, la premiere occurrence d'une devise est la plus recente.
    if (!(row.currencyCode in result)) result[row.currencyCode] = String(row.rateToTnd)
  }
  return result
}

/** Historique complet, devise par devise, du plus recent au plus ancien. */
export async function listRates(): Promise<RateRow[]> {
  const rows = await prisma.exchangeRate.findMany({
    orderBy: [{ currencyCode: 'asc' }, { validFrom: 'desc' }],
  })
  return rows.map((r) => ({
    id: r.id,
    currencyCode: r.currencyCode,
    rateToTnd: String(r.rateToTnd),
    validFrom: r.validFrom,
    source: r.source,
    note: r.note,
  }))
}
