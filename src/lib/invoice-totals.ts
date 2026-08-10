import { Decimal, add, dec, gt, lineDiscount, lineGross, lineTotal, round, sub } from '@/lib/money'

export type VatModeValue = 'NONE' | 'ZERO' | 'RATE'

export interface TotalsLineInput {
  quantity: unknown
  unitPrice: unknown
  discountPercent?: unknown
}

export interface TotalsInput {
  items: TotalsLineInput[]
  /** Les frais sont-ils deja compris dans le prix des lignes ? */
  feesIncluded: boolean
  shippingAmount?: unknown
  transitAmount?: unknown
  insuranceAmount?: unknown
  otherFeesAmount?: unknown
  vatMode: VatModeValue
  vatRate?: unknown
  /** Timbre fiscal ajoute apres la TVA. */
  stampDutyAmount?: unknown
  paidAmount?: unknown
  /**
   * Nombre de decimales de la devise : 2 pour l'euro, 3 pour le dinar tunisien.
   * Tous les arrondis intermediaires utilisent cette precision.
   */
  decimals?: number
}

export interface TotalsResult {
  /** Somme des lignes, remises deduites. */
  goodsTotal: Decimal
  /** Somme des remises accordees sur les lignes. */
  discountTotal: Decimal
  shippingAmount: Decimal
  transitAmount: Decimal
  insuranceAmount: Decimal
  otherFeesAmount: Decimal
  /** Total des frais annexes. */
  feesTotal: Decimal
  /**
   * Part "marchandise" seule.
   * - frais inclus  : goodsTotal - feesTotal
   * - frais ajoutes : goodsTotal
   */
  merchandiseAmount: Decimal
  totalHt: Decimal
  vatRate: Decimal
  vatAmount: Decimal
  totalTtc: Decimal
  stampDutyAmount: Decimal
  netToPay: Decimal
  paidAmount: Decimal
  balanceDue: Decimal
}

/**
 * Coeur du calcul d'une facture. Fonction pure, utilisee a l'identique
 * cote serveur (source de verite) et cote client (apercu temps reel).
 */
export function computeInvoiceTotals(input: TotalsInput): TotalsResult {
  const d = input.decimals ?? 2

  const goodsTotal = round(
    input.items.reduce<Decimal>(
      (acc, item) =>
        acc.plus(
          lineTotal({
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            decimals: d,
          }),
        ),
      new Decimal(0),
    ),
    d,
  )

  const discountTotal = round(
    input.items.reduce<Decimal>(
      (acc, item) =>
        acc.plus(
          lineDiscount({
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            decimals: d,
          }),
        ),
      new Decimal(0),
    ),
    d,
  )

  const shippingAmount = round(input.shippingAmount, d)
  const transitAmount = round(input.transitAmount, d)
  const insuranceAmount = round(input.insuranceAmount, d)
  const otherFeesAmount = round(input.otherFeesAmount, d)
  const feesTotal = round(add(shippingAmount, transitAmount, insuranceAmount, otherFeesAmount), d)

  const totalHt = input.feesIncluded ? goodsTotal : round(goodsTotal.plus(feesTotal), d)
  const merchandiseAmount = input.feesIncluded ? round(sub(goodsTotal, feesTotal), d) : goodsTotal

  const vatRate = input.vatMode === 'RATE' ? round(input.vatRate, 3) : new Decimal(0)
  const vatAmount =
    input.vatMode === 'RATE' ? round(totalHt.times(vatRate).dividedBy(100), d) : new Decimal(0)

  const totalTtc = round(totalHt.plus(vatAmount), d)
  // Le timbre fiscal n'est pas soumis a la TVA : il s'ajoute au TTC.
  const stampDutyAmount = round(input.stampDutyAmount, d)
  const netToPay = round(totalTtc.plus(stampDutyAmount), d)
  const paidAmount = round(input.paidAmount, d)
  const balanceDue = round(sub(netToPay, paidAmount), d)

  return {
    goodsTotal,
    discountTotal,
    shippingAmount,
    transitAmount,
    insuranceAmount,
    otherFeesAmount,
    feesTotal,
    merchandiseAmount,
    totalHt,
    vatRate,
    vatAmount,
    totalTtc,
    stampDutyAmount,
    netToPay,
    paidAmount,
    balanceDue,
  }
}

/** Detail d'une ligne pour l'affichage (brut, remise, net). */
export function computeLine(item: TotalsLineInput) {
  return {
    gross: lineGross({ quantity: item.quantity, unitPrice: item.unitPrice }),
    discount: lineDiscount(item),
    total: lineTotal(item),
  }
}

/**
 * Statut deduit des montants et de la date d'echeance.
 * Ne s'applique jamais a un brouillon ni a une facture annulee.
 */
export function deriveStatus(params: {
  current: string
  netToPay: unknown
  paidAmount: unknown
  dueDate?: Date | null
  today?: Date
}): 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' {
  if (params.current === 'DRAFT') return 'DRAFT'
  if (params.current === 'CANCELLED') return 'CANCELLED'

  const net = round(params.netToPay, 2)
  const paid = round(params.paidAmount, 2)

  if (!net.isZero() && paid.greaterThanOrEqualTo(net)) return 'PAID'

  const today = params.today ?? new Date()
  const isOverdue =
    !!params.dueDate && params.dueDate.getTime() < new Date(today.toDateString()).getTime()

  if (gt(paid, 0)) return isOverdue ? 'OVERDUE' : 'PARTIALLY_PAID'
  return isOverdue ? 'OVERDUE' : 'CONFIRMED'
}

/** Convertit une valeur Prisma.Decimal (ou autre) en Decimal utilisable. */
export const toDecimal = dec
