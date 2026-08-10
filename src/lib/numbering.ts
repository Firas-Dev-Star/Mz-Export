import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { type SequenceRow, formatSequenceNumber } from '@/lib/numbering-format'

export const SALE_SEQUENCE_KEY = 'SALE'
export const PURCHASE_SEQUENCE_KEY = 'PURCHASE'

/**
 * Table dans laquelle verifier qu'un numero n'est pas deja pris.
 * Sans cela, une sequence d'achat pourrait produire un numero deja utilise
 * (reprise d'historique, import manuel) et violer la contrainte d'unicite.
 */
async function numberExists(tx: Prisma.TransactionClient, key: string, number: string) {
  if (key === PURCHASE_SEQUENCE_KEY) {
    return Boolean(await tx.purchase.findUnique({ where: { number }, select: { id: true } }))
  }
  return Boolean(await tx.invoice.findUnique({ where: { number }, select: { id: true } }))
}

export { formatSequenceNumber }
export type { SequenceRow }

/**
 * Reserve le prochain numero de facture de maniere ATOMIQUE.
 *
 * La ligne de sequence est verrouillee (SELECT ... FOR UPDATE) pour la duree
 * de la transaction : deux requetes simultanees ne peuvent pas obtenir le
 * meme numero. A appeler UNIQUEMENT depuis l'interieur d'une transaction.
 */
export async function reserveNextNumber(
  tx: Prisma.TransactionClient,
  key: string = SALE_SEQUENCE_KEY,
  date: Date = new Date(),
): Promise<string> {
  const rows = await tx.$queryRaw<SequenceRow[]>`
    SELECT * FROM "invoice_sequences" WHERE "key" = ${key} FOR UPDATE
  `
  const seq = rows[0]
  if (!seq) {
    throw new Error(
      `Séquence de numérotation « ${key} » introuvable. Vérifiez les paramètres de numérotation.`,
    )
  }

  const year = date.getUTCFullYear()
  let counter = seq.nextNumber

  // Remise a zero annuelle si demandee
  if (seq.resetYearly && seq.year !== null && seq.year !== year) {
    counter = 1
  }

  // Garde-fou : on saute les numeros deja utilises (import manuel, reprise d'historique)
  let candidate = formatSequenceNumber(seq, counter, year)
  let guard = 0
  while (await numberExists(tx, key, candidate)) {
    counter += 1
    candidate = formatSequenceNumber(seq, counter, year)
    guard += 1
    if (guard > 10_000) throw new Error('Impossible de générer un numéro de facture unique.')
  }

  await tx.invoiceSequence.update({
    where: { id: seq.id },
    data: { nextNumber: counter + 1, year },
  })

  return candidate
}

/** Apercu du prochain numero sans le consommer (affichage dans les parametres). */
export async function previewNextNumber(key: string = SALE_SEQUENCE_KEY): Promise<string> {
  const seq = await prisma.invoiceSequence.findUnique({ where: { key } })
  if (!seq) return ''
  const year = new Date().getUTCFullYear()
  const counter = seq.resetYearly && seq.year !== null && seq.year !== year ? 1 : seq.nextNumber
  return formatSequenceNumber(seq, counter, year)
}
