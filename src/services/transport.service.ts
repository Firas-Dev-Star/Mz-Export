import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { BASE_DECIMALS, RATE_DECIMALS, normalizeRate, tndAmounts, toTnd } from '@/lib/exchange'
import { computeInvoiceTotals } from '@/lib/invoice-totals'
import { round, toDbDecimal } from '@/lib/money'
import type { CarrierInput, TransportInvoiceInput } from '@/validations/transport'

/** Le transport est facture en dinars : 3 decimales. */
export const TRANSPORT_DECIMALS = 3

// ---------------------------------------------------------------------------
// Transporteurs
// ---------------------------------------------------------------------------

export interface CarrierListParams {
  search?: string
  activeOnly?: boolean
  page?: number
  perPage?: number
}

export function buildCarrierWhere(params: CarrierListParams): Prisma.CarrierWhereInput {
  const where: Prisma.CarrierWhereInput = {}
  if (params.activeOnly) where.isActive = true

  const search = params.search?.trim()
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { companyName: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { taxId: { contains: search, mode: 'insensitive' } },
    ]
  }
  return where
}

export async function listCarriers(params: CarrierListParams = {}) {
  const page = Math.max(1, params.page ?? 1)
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 20))
  const where = buildCarrierWhere(params)

  const [items, total] = await Promise.all([
    prisma.carrier.findMany({
      where,
      orderBy: [{ companyName: 'asc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, code: true, companyName: true, city: true, phone: true,
        email: true, taxId: true, currencyCode: true, isActive: true,
        _count: { select: { invoices: true } },
      },
    }),
    prisma.carrier.count({ where }),
  ])

  return { items, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) }
}

/** Transporteurs actifs, pour les listes deroulantes. */
export async function listCarrierOptions() {
  return prisma.carrier.findMany({
    where: { isActive: true },
    orderBy: [{ companyName: 'asc' }],
    select: { id: true, code: true, companyName: true, currencyCode: true, paymentTerms: true },
  })
}

export async function getCarrier(id: string) {
  return prisma.carrier.findUnique({
    where: { id },
    include: {
      invoices: {
        orderBy: [{ date: 'desc' }],
        take: 20,
        select: {
          id: true, number: true, carrierReference: true, date: true, status: true,
          shipmentRef: true, currencyCode: true, netToPay: true, balanceDue: true,
        },
      },
      _count: { select: { invoices: true } },
    },
  })
}

/**
 * Totaux d'un transporteur, toutes factures non annulees confondues.
 * Sert la fiche : combien il a facture, combien reste du.
 */
export async function getCarrierTotals(carrierId: string) {
  const rows = await prisma.transportInvoice.groupBy({
    by: ['currencyCode'],
    where: { carrierId, status: { not: 'CANCELLED' } },
    _sum: { netToPay: true, paidAmount: true, balanceDue: true },
    _count: true,
  })
  return rows.map((r) => ({
    currencyCode: r.currencyCode,
    count: r._count,
    netToPay: round(r._sum.netToPay, 3).toFixed(3),
    paidAmount: round(r._sum.paidAmount, 3).toFixed(3),
    balanceDue: round(r._sum.balanceDue, 3).toFixed(3),
  }))
}

export function buildCarrierData(input: CarrierInput) {
  return {
    code: input.code,
    companyName: input.companyName,
    contactName: input.contactName,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    postalCode: input.postalCode,
    city: input.city,
    country: input.country || 'Tunisie',
    phone: input.phone,
    email: input.email,
    taxId: input.taxId,
    tradeRegister: input.tradeRegister,
    paymentTerms: input.paymentTerms,
    currencyCode: input.currencyCode,
    notes: input.notes,
    isActive: input.isActive,
  }
}

// ---------------------------------------------------------------------------
// Factures de transport
// ---------------------------------------------------------------------------

export interface TransportListParams {
  search?: string
  status?: string
  carrierId?: string
  /** `unlinked` : factures qu'aucune vente ne rattache encore. */
  filter?: 'unpaid' | 'overdue' | 'unlinked' | ''
  from?: string
  to?: string
  page?: number
  perPage?: number
}

export function buildTransportWhere(params: TransportListParams): Prisma.TransportInvoiceWhereInput {
  const where: Prisma.TransportInvoiceWhereInput = {}
  const and: Prisma.TransportInvoiceWhereInput[] = []

  if (params.status) where.status = params.status as Prisma.TransportInvoiceWhereInput['status']
  if (params.carrierId) where.carrierId = params.carrierId

  if (params.filter === 'unpaid') {
    and.push({ status: { notIn: ['DRAFT', 'CANCELLED'] } }, { balanceDue: { gt: 0 } })
  }
  if (params.filter === 'overdue') {
    const today = new Date()
    and.push(
      { status: { notIn: ['DRAFT', 'CANCELLED', 'PAID'] } },
      {
        dueDate: {
          lt: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
        },
      },
    )
  }
  if (params.filter === 'unlinked') {
    and.push({ invoiceId: null }, { status: { not: 'CANCELLED' } })
  }

  if (params.from) and.push({ date: { gte: new Date(`${params.from}T00:00:00.000Z`) } })
  if (params.to) and.push({ date: { lte: new Date(`${params.to}T00:00:00.000Z`) } })

  const search = params.search?.trim()
  if (search) {
    and.push({
      OR: [
        { number: { contains: search, mode: 'insensitive' } },
        { carrierReference: { contains: search, mode: 'insensitive' } },
        { shipmentRef: { contains: search, mode: 'insensitive' } },
        { carrier: { companyName: { contains: search, mode: 'insensitive' } } },
        { invoice: { number: { contains: search, mode: 'insensitive' } } },
      ],
    })
  }

  if (and.length) where.AND = and
  return where
}

export async function listTransportInvoices(params: TransportListParams) {
  const page = Math.max(1, params.page ?? 1)
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 20))
  const where = buildTransportWhere(params)

  const [items, total, sums] = await Promise.all([
    prisma.transportInvoice.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, number: true, carrierReference: true, date: true, dueDate: true,
        status: true, shipmentRef: true, currencyCode: true, totalHt: true,
        netToPay: true, paidAmount: true, balanceDue: true, isDemo: true,
        carrier: { select: { id: true, companyName: true } },
        invoice: { select: { id: true, number: true } },
        _count: { select: { documents: true } },
      },
    }),
    prisma.transportInvoice.count({ where }),
    prisma.transportInvoice.groupBy({
      by: ['currencyCode'],
      where,
      _sum: { netToPay: true, balanceDue: true },
    }),
  ])

  return {
    items,
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    sums: sums.map((s) => ({
      currencyCode: s.currencyCode,
      netToPay: round(s._sum.netToPay, 3).toFixed(3),
      balanceDue: round(s._sum.balanceDue, 3).toFixed(3),
    })),
  }
}

export async function getTransportInvoice(id: string) {
  return prisma.transportInvoice.findUnique({
    where: { id },
    include: {
      carrier: true,
      invoice: {
        select: {
          id: true, number: true, date: true, currencyCode: true, netToPay: true,
          customer: { select: { companyName: true } },
        },
      },
      payments: { orderBy: { date: 'desc' } },
      createdBy: { select: { name: true, email: true } },
    },
  })
}

/**
 * Prepare le payload Prisma d'une facture de transport.
 *
 * Le calcul passe par `computeInvoiceTotals`, comme les ventes et les achats :
 * un seul coeur de calcul pour toute l'application. Les trois montants du
 * transport y entrent comme des frais annexes sans ligne d'article, ce qui est
 * exactement leur nature.
 *
 * `rateToTnd` fige la contrevaleur en dinars. Un transport facture en dinars
 * n'a pas besoin de taux : il vaut 1.
 */
export function buildTransportInvoiceData(
  input: TransportInvoiceInput,
  paidAmount: unknown = 0,
  rateToTnd: unknown = 0,
) {
  const totals = computeInvoiceTotals({
    items: [],
    feesIncluded: false,
    shippingAmount: input.transportAmount,
    transitAmount: input.transitAmount,
    otherFeesAmount: input.otherFeesAmount,
    vatMode: input.vatMode,
    vatRate: input.vatRate,
    stampDutyAmount: input.stampDutyAmount,
    paidAmount,
    decimals: TRANSPORT_DECIMALS,
  })

  const tnd = tndAmounts({
    currencyCode: input.currencyCode,
    rateToTnd,
    netToPay: totals.netToPay,
    paidAmount: totals.paidAmount,
    balanceDue: totals.balanceDue,
  })

  const scalars = {
    carrierId: input.carrierId,
    carrierReference: input.carrierReference,
    date: new Date(`${input.date}T00:00:00.000Z`),
    dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,

    shipmentRef: input.shipmentRef,
    invoiceId: input.invoiceId || null,

    currencyCode: input.currencyCode,
    paymentTerms: input.paymentTerms,

    transportLabel: input.transportLabel || 'Transport',
    transportAmount: toDbDecimal(totals.shippingAmount, TRANSPORT_DECIMALS),
    transitLabel: input.transitLabel || 'Transit et douane',
    transitAmount: toDbDecimal(totals.transitAmount, TRANSPORT_DECIMALS),
    otherFeesLabel: input.otherFeesLabel || 'Autres frais',
    otherFeesAmount: toDbDecimal(totals.otherFeesAmount, TRANSPORT_DECIMALS),

    vatMode: input.vatMode,
    vatRate: toDbDecimal(totals.vatRate, 3),

    stampDutyLabel: input.stampDutyLabel || 'Timbre fiscal',
    stampDutyAmount: toDbDecimal(totals.stampDutyAmount, TRANSPORT_DECIMALS),

    totalHt: toDbDecimal(totals.totalHt, TRANSPORT_DECIMALS),
    vatAmount: toDbDecimal(totals.vatAmount, TRANSPORT_DECIMALS),
    totalTtc: toDbDecimal(totals.totalTtc, TRANSPORT_DECIMALS),
    netToPay: toDbDecimal(totals.netToPay, TRANSPORT_DECIMALS),
    balanceDue: toDbDecimal(totals.balanceDue, TRANSPORT_DECIMALS),

    exchangeRateTnd: toDbDecimal(tnd.exchangeRateTnd, RATE_DECIMALS),
    netToPayTnd: toDbDecimal(tnd.netToPayTnd, BASE_DECIMALS),
    paidAmountTnd: toDbDecimal(tnd.paidAmountTnd, BASE_DECIMALS),
    balanceDueTnd: toDbDecimal(tnd.balanceDueTnd, BASE_DECIMALS),

    notes: input.notes,
  }

  return { scalars, totals }
}

/**
 * Recalcule le regle, le solde et le statut d'une facture de transport
 * a partir de ses reglements. Meme logique que les achats.
 */
export async function refreshTransportPaymentState(
  tx: Prisma.TransactionClient,
  transportInvoiceId: string,
) {
  const facture = await tx.transportInvoice.findUnique({
    where: { id: transportInvoiceId },
    select: {
      id: true, status: true, netToPay: true, dueDate: true,
      currencyCode: true, exchangeRateTnd: true,
    },
  })
  if (!facture) return null

  const aggregate = await tx.transportPayment.aggregate({
    where: { transportInvoiceId },
    _sum: { amount: true },
  })
  const paid = round(aggregate._sum.amount, 3)
  const net = round(facture.netToPay, 3)
  const balance = round(net.minus(paid), 3)

  let status = facture.status
  if (status !== 'DRAFT' && status !== 'CANCELLED') {
    const today = new Date()
    const startOfToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    )
    const overdue = Boolean(facture.dueDate && facture.dueDate < startOfToday)

    if (!net.isZero() && paid.greaterThanOrEqualTo(net)) status = 'PAID'
    else if (overdue) status = 'OVERDUE'
    else if (paid.greaterThan(0)) status = 'PARTIALLY_PAID'
    else status = 'CONFIRMED'
  }

  // Contrevaleurs au taux fige du document : un reglement ne reevalue jamais
  // la facture au taux du jour.
  const rate = normalizeRate(facture.currencyCode, facture.exchangeRateTnd)

  return tx.transportInvoice.update({
    where: { id: transportInvoiceId },
    data: {
      paidAmount: paid.toFixed(3),
      balanceDue: balance.toFixed(3),
      status,
      netToPayTnd: toTnd(net, rate).toFixed(BASE_DECIMALS),
      paidAmountTnd: toTnd(paid, rate).toFixed(BASE_DECIMALS),
      balanceDueTnd: toTnd(balance, rate).toFixed(BASE_DECIMALS),
    },
    select: { id: true, status: true },
  })
}

// ---------------------------------------------------------------------------
// Rapprochement expedition <-> vente
// ---------------------------------------------------------------------------

/**
 * Cout de transport rattache a une facture de vente.
 * C'est ce qui permet de lire la marge REELLE d'une expedition : le prix de
 * vente ne dit rien tant que l'acheminement n'est pas deduit.
 */
export async function getTransportCostForInvoice(invoiceId: string) {
  const [rows, factures] = await Promise.all([
    prisma.transportInvoice.groupBy({
      by: ['currencyCode'],
      where: { invoiceId, status: { not: 'CANCELLED' } },
      _sum: { netToPay: true, netToPayTnd: true },
      _count: true,
    }),
    prisma.transportInvoice.findMany({
      where: { invoiceId, status: { not: 'CANCELLED' } },
      orderBy: [{ date: 'asc' }],
      select: {
        id: true, number: true, carrierReference: true, date: true, status: true,
        currencyCode: true, netToPay: true,
        carrier: { select: { companyName: true } },
      },
    }),
  ])

  return {
    factures,
    totaux: rows.map((r) => ({
      currencyCode: r.currencyCode,
      count: r._count,
      netToPay: round(r._sum.netToPay, 3).toFixed(3),
      netToPayTnd: round(r._sum.netToPayTnd, 3).toFixed(3),
    })),
  }
}

/**
 * Ventes candidates au rapprochement, pour la liste deroulante du formulaire.
 * Les plus recentes d'abord : c'est la facture de transport qui arrive apres.
 */
export async function listInvoiceOptionsForTransport(limit = 200) {
  return prisma.invoice.findMany({
    where: { status: { not: 'CANCELLED' } },
    orderBy: [{ date: 'desc' }],
    take: limit,
    select: {
      id: true, number: true, date: true, currencyCode: true, netToPay: true,
      customer: { select: { companyName: true } },
    },
  })
}
