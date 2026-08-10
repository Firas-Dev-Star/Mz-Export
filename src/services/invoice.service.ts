import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

import { computeInvoiceTotals } from '@/lib/invoice-totals'
import { dec, round, toDbDecimal } from '@/lib/money'
import { amountToFrenchWords } from '@/lib/number-to-words-fr'
import { buildPriceBreakdownNote } from '@/lib/price-breakdown'
import type { InvoiceInput } from '@/validations/invoice'

export interface InvoiceListParams {
  search?: string
  status?: string
  customerId?: string
  filter?: 'unpaid' | 'overdue' | ''
  from?: string
  to?: string
  page?: number
  perPage?: number
}

export function buildInvoiceWhere(params: InvoiceListParams): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {}
  const and: Prisma.InvoiceWhereInput[] = []

  if (params.status) where.status = params.status as Prisma.InvoiceWhereInput['status']
  if (params.customerId) where.customerId = params.customerId

  if (params.filter === 'unpaid') {
    and.push({ status: { notIn: ['DRAFT', 'CANCELLED'] } }, { balanceDue: { gt: 0 } })
  }
  if (params.filter === 'overdue') {
    const today = new Date()
    and.push(
      { status: { notIn: ['DRAFT', 'CANCELLED', 'PAID'] } },
      { dueDate: { lt: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) } },
    )
  }

  if (params.from) and.push({ date: { gte: new Date(`${params.from}T00:00:00.000Z`) } })
  if (params.to) and.push({ date: { lte: new Date(`${params.to}T00:00:00.000Z`) } })

  const search = params.search?.trim()
  if (search) {
    and.push({
      OR: [
        { number: { contains: search, mode: 'insensitive' } },
        { orderReference: { contains: search, mode: 'insensitive' } },
        { customer: { companyName: { contains: search, mode: 'insensitive' } } },
        { customer: { siret: { contains: search, mode: 'insensitive' } } },
        { items: { some: { designation: { contains: search, mode: 'insensitive' } } } },
        { items: { some: { reference: { contains: search, mode: 'insensitive' } } } },
      ],
    })
  }

  if (and.length) where.AND = and
  return where
}

export async function listInvoices(params: InvoiceListParams) {
  const page = Math.max(1, params.page ?? 1)
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 20))
  const where = buildInvoiceWhere(params)

  const [items, total, sums] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        number: true,
        date: true,
        dueDate: true,
        status: true,
        currencyCode: true,
        totalHt: true,
        netToPay: true,
        paidAmount: true,
        balanceDue: true,
        isDemo: true,
        customer: { select: { id: true, companyName: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({ by: ['currencyCode'], where, _sum: { netToPay: true, balanceDue: true } }),
  ])

  return {
    items,
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    sums: sums.map((s) => ({
      currencyCode: s.currencyCode,
      netToPay: round(s._sum.netToPay, 2).toFixed(2),
      balanceDue: round(s._sum.balanceDue, 2).toFixed(2),
    })),
  }
}

export async function getInvoice(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { orderBy: { position: 'asc' } },
      payments: { orderBy: { date: 'desc' } },
      createdBy: { select: { name: true, email: true } },
    },
  })
}

export type InvoiceWithRelations = NonNullable<Awaited<ReturnType<typeof getInvoice>>>

/**
 * Transforme les donnees validees du formulaire en payload Prisma.
 * TOUS les montants sont recalcules ici, cote serveur : les totaux envoyes
 * par le navigateur ne sont jamais pris en compte.
 */
export function buildInvoiceData(input: InvoiceInput, paidAmount: unknown = 0) {
  const totals = computeInvoiceTotals({
    items: input.items,
    feesIncluded: input.feesIncluded,
    shippingAmount: input.shippingAmount,
    transitAmount: input.transitAmount,
    insuranceAmount: input.insuranceAmount,
    otherFeesAmount: input.otherFeesAmount,
    vatMode: input.vatMode,
    vatRate: input.vatRate,
    stampDutyAmount: input.stampDutyAmount,
    paidAmount,
  })

  const autoNote = buildPriceBreakdownNote({
    merchandiseAmount: totals.merchandiseAmount,
    shippingLabel: input.shippingLabel || 'Transport',
    shippingAmount: totals.shippingAmount,
    transitLabel: input.transitLabel || 'Transit',
    transitAmount: totals.transitAmount,
    insuranceLabel: input.insuranceLabel || 'Assurance',
    insuranceAmount: totals.insuranceAmount,
    otherFeesLabel: input.otherFeesLabel || 'Autres frais',
    otherFeesAmount: totals.otherFeesAmount,
    currencyCode: input.currencyCode,
  })

  const scalars = {
    customerId: input.customerId,
    date: new Date(`${input.date}T00:00:00.000Z`),
    dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
    currencyCode: input.currencyCode,
    paymentTerms: input.paymentTerms,

    deliveryAddress: input.deliveryAddress,
    deliveryCountry: input.deliveryCountry,

    ngp: input.ngp,
    originCountry: input.originCountry,
    packageCount: input.packageCount,
    packageType: input.packageType,
    packageDimensions: input.packageDimensions,
    grossWeightKg: toDbDecimal(input.grossWeightKg, 3),
    netWeightKg: toDbDecimal(input.netWeightKg, 3),
    incoterm: input.incoterm,
    transportMode: input.transportMode,
    departurePort: input.departurePort,
    destination: input.destination,
    orderReference: input.orderReference,

    feesIncluded: input.feesIncluded,
    shippingLabel: input.shippingLabel || 'Transport',
    shippingAmount: toDbDecimal(totals.shippingAmount),
    transitLabel: input.transitLabel || 'Transit',
    transitAmount: toDbDecimal(totals.transitAmount),
    insuranceLabel: input.insuranceLabel || 'Assurance',
    insuranceAmount: toDbDecimal(totals.insuranceAmount),
    otherFeesLabel: input.otherFeesLabel || 'Autres frais',
    otherFeesAmount: toDbDecimal(totals.otherFeesAmount),

    vatMode: input.vatMode,
    vatRate: toDbDecimal(totals.vatRate, 3),

    stampDutyLabel: input.stampDutyLabel || 'Timbre fiscal',
    stampDutyAmount: toDbDecimal(totals.stampDutyAmount),

    goodsTotal: toDbDecimal(totals.goodsTotal),
    discountTotal: toDbDecimal(totals.discountTotal),
    totalHt: toDbDecimal(totals.totalHt),
    vatAmount: toDbDecimal(totals.vatAmount),
    totalTtc: toDbDecimal(totals.totalTtc),
    netToPay: toDbDecimal(totals.netToPay),
    balanceDue: toDbDecimal(totals.balanceDue),

    amountInWords: amountToFrenchWords(totals.netToPay, input.currencyCode),
    priceBreakdownNote: input.priceBreakdownNote?.trim() || autoNote,
    notes: input.notes,
  }

  const items = input.items.map((item, position) => {
    const lineTotal = computeInvoiceTotals({
      items: [item],
      feesIncluded: true,
      vatMode: 'NONE',
    }).goodsTotal

    return {
      position,
      productId: item.productId || null,
      reference: item.reference,
      designation: item.designation,
      description: item.description,
      unit: item.unit,
      quantity: toDbDecimal(item.quantity, 3),
      unitPrice: toDbDecimal(item.unitPrice, 4),
      discountPercent: toDbDecimal(item.discountPercent, 3),
      lineTotal: toDbDecimal(lineTotal),
      ngp: item.ngp,
      originCountry: item.originCountry,
    }
  })

  return { scalars, items, totals }
}

/**
 * Recalcule le montant paye, le solde et le statut d'une facture
 * a partir de ses reglements. A appeler apres toute modification de paiement.
 */
export async function refreshInvoicePaymentState(tx: Prisma.TransactionClient, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, netToPay: true, dueDate: true },
  })
  if (!invoice) return null

  const aggregate = await tx.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } })
  const paid = round(aggregate._sum.amount, 2)
  const net = round(invoice.netToPay, 2)
  const balance = round(net.minus(paid), 2)

  let status = invoice.status
  if (status !== 'DRAFT' && status !== 'CANCELLED') {
    const today = new Date()
    const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const overdue = Boolean(invoice.dueDate && invoice.dueDate < startOfToday)

    if (!net.isZero() && paid.greaterThanOrEqualTo(net)) status = 'PAID'
    else if (overdue) status = 'OVERDUE'
    else if (paid.greaterThan(0)) status = 'PARTIALLY_PAID'
    else status = 'CONFIRMED'
  }

  return tx.invoice.update({
    where: { id: invoiceId },
    data: { paidAmount: paid.toFixed(2), balanceDue: balance.toFixed(2), status },
    select: { id: true, status: true },
  })
}

/** Met a jour en masse les factures dont l'echeance vient d'etre depassee. */
export async function markOverdueInvoices() {
  const today = new Date()
  const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  return prisma.invoice.updateMany({
    where: {
      status: { in: ['CONFIRMED', 'PARTIALLY_PAID'] },
      dueDate: { lt: startOfToday },
      balanceDue: { gt: 0 },
    },
    data: { status: 'OVERDUE' },
  })
}

/** Valeurs par defaut d'une nouvelle facture (parametres societe + client). */
export async function getInvoiceDefaults(customerId?: string) {
  const [company, customer] = await Promise.all([
    prisma.company.findUnique({ where: { id: 'company' } }),
    customerId ? prisma.customer.findUnique({ where: { id: customerId } }) : Promise.resolve(null),
  ])

  return {
    currencyCode: customer?.currencyCode || company?.defaultCurrency || 'EUR',
    paymentTerms: customer?.paymentTerms || company?.defaultPaymentTerms || '',
    incoterm: company?.defaultIncoterm || '',
    originCountry: company?.defaultOrigin || '',
    vatMode: company?.defaultVatMode ?? 'NONE',
    vatRate: company ? round(company.defaultVatRate, 3).toString() : '0',
    stampDutyLabel: company?.defaultStampLabel || 'Timbre fiscal',
    stampDutyAmount: company ? round(company.defaultStampDuty, 2).toFixed(2) : '0',
    deliveryAddress: customer?.deliveryAddress || '',
    deliveryCountry: customer?.deliveryCountry || customer?.country || '',
  }
}

export { dec }
export { buildPriceBreakdownNote }
