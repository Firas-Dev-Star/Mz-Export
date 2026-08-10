import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { computeInvoiceTotals } from '@/lib/invoice-totals'
import { round, toDbDecimal } from '@/lib/money'
import type { PurchaseInput } from '@/validations/purchase'

/** Les achats sont libelles en dinars : 3 decimales. */
export const PURCHASE_DECIMALS = 3

export interface PurchaseListParams {
  search?: string
  status?: string
  supplierId?: string
  filter?: 'unpaid' | 'overdue' | ''
  from?: string
  to?: string
  page?: number
  perPage?: number
}

export function buildPurchaseWhere(params: PurchaseListParams): Prisma.PurchaseWhereInput {
  const where: Prisma.PurchaseWhereInput = {}
  const and: Prisma.PurchaseWhereInput[] = []

  if (params.status) where.status = params.status as Prisma.PurchaseWhereInput['status']
  if (params.supplierId) where.supplierId = params.supplierId

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
        { supplierReference: { contains: search, mode: 'insensitive' } },
        { supplier: { companyName: { contains: search, mode: 'insensitive' } } },
        { items: { some: { designation: { contains: search, mode: 'insensitive' } } } },
        { items: { some: { reference: { contains: search, mode: 'insensitive' } } } },
      ],
    })
  }

  if (and.length) where.AND = and
  return where
}

export async function listPurchases(params: PurchaseListParams) {
  const page = Math.max(1, params.page ?? 1)
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 20))
  const where = buildPurchaseWhere(params)

  const [items, total, sums] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, number: true, supplierReference: true, date: true, dueDate: true,
        status: true, currencyCode: true, totalHt: true, netToPay: true,
        paidAmount: true, balanceDue: true, isDemo: true,
        supplier: { select: { id: true, companyName: true } },
      },
    }),
    prisma.purchase.count({ where }),
    prisma.purchase.groupBy({ by: ['currencyCode'], where, _sum: { netToPay: true, balanceDue: true } }),
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

export async function getPurchase(id: string) {
  return prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: { orderBy: { position: 'asc' } },
      payments: { orderBy: { date: 'desc' } },
      createdBy: { select: { name: true, email: true } },
    },
  })
}

/**
 * Prepare le payload Prisma d'une facture d'achat.
 * Les frais s'ajoutent toujours au total des lignes (pas de mode "compris"),
 * et les arrondis se font a 3 decimales (millimes).
 */
export function buildPurchaseData(input: PurchaseInput, paidAmount: unknown = 0) {
  const totals = computeInvoiceTotals({
    items: input.items,
    feesIncluded: false,
    shippingAmount: input.shippingAmount,
    otherFeesAmount: input.otherFeesAmount,
    vatMode: input.vatMode,
    vatRate: input.vatRate,
    stampDutyAmount: input.stampDutyAmount,
    paidAmount,
    decimals: PURCHASE_DECIMALS,
  })

  const scalars = {
    supplierId: input.supplierId,
    supplierReference: input.supplierReference,
    date: new Date(`${input.date}T00:00:00.000Z`),
    dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
    currencyCode: input.currencyCode,
    paymentTerms: input.paymentTerms,

    shippingLabel: input.shippingLabel || 'Transport',
    shippingAmount: toDbDecimal(totals.shippingAmount, PURCHASE_DECIMALS),
    otherFeesLabel: input.otherFeesLabel || 'Autres frais',
    otherFeesAmount: toDbDecimal(totals.otherFeesAmount, PURCHASE_DECIMALS),

    vatMode: input.vatMode,
    vatRate: toDbDecimal(totals.vatRate, 3),

    stampDutyLabel: input.stampDutyLabel || 'Timbre fiscal',
    stampDutyAmount: toDbDecimal(totals.stampDutyAmount, PURCHASE_DECIMALS),

    itemsTotal: toDbDecimal(totals.goodsTotal, PURCHASE_DECIMALS),
    discountTotal: toDbDecimal(totals.discountTotal, PURCHASE_DECIMALS),
    totalHt: toDbDecimal(totals.totalHt, PURCHASE_DECIMALS),
    vatAmount: toDbDecimal(totals.vatAmount, PURCHASE_DECIMALS),
    totalTtc: toDbDecimal(totals.totalTtc, PURCHASE_DECIMALS),
    netToPay: toDbDecimal(totals.netToPay, PURCHASE_DECIMALS),
    balanceDue: toDbDecimal(totals.balanceDue, PURCHASE_DECIMALS),

    notes: input.notes,
  }

  const items = input.items.map((item, position) => {
    const lineTotal = computeInvoiceTotals({
      items: [item],
      feesIncluded: true,
      vatMode: 'NONE',
      decimals: PURCHASE_DECIMALS,
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
      lineTotal: toDbDecimal(lineTotal, PURCHASE_DECIMALS),
    }
  })

  return { scalars, items, totals }
}

/** Recalcule montant regle, solde et statut d'une facture d'achat. */
export async function refreshPurchasePaymentState(tx: Prisma.TransactionClient, purchaseId: string) {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, status: true, netToPay: true, dueDate: true },
  })
  if (!purchase) return null

  const aggregate = await tx.purchasePayment.aggregate({ where: { purchaseId }, _sum: { amount: true } })
  const paid = round(aggregate._sum.amount, 3)
  const net = round(purchase.netToPay, 3)
  const balance = round(net.minus(paid), 3)

  let status = purchase.status
  if (status !== 'DRAFT' && status !== 'CANCELLED') {
    const today = new Date()
    const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const overdue = Boolean(purchase.dueDate && purchase.dueDate < startOfToday)

    if (!net.isZero() && paid.greaterThanOrEqualTo(net)) status = 'PAID'
    else if (overdue) status = 'OVERDUE'
    else if (paid.greaterThan(0)) status = 'PARTIALLY_PAID'
    else status = 'CONFIRMED'
  }

  return tx.purchase.update({
    where: { id: purchaseId },
    data: { paidAmount: paid.toFixed(3), balanceDue: balance.toFixed(3), status },
    select: { id: true, status: true },
  })
}

export async function getPurchaseDefaults(supplierId?: string) {
  const [company, supplier] = await Promise.all([
    prisma.company.findUnique({ where: { id: 'company' } }),
    supplierId ? prisma.supplier.findUnique({ where: { id: supplierId } }) : Promise.resolve(null),
  ])

  return {
    currencyCode: supplier?.currencyCode || 'TND',
    paymentTerms: supplier?.paymentTerms || company?.defaultPaymentTerms || '',
    vatRate: company ? round(company.defaultVatRate, 3).toString() : '19',
    stampDutyLabel: company?.defaultStampLabel || 'Timbre fiscal',
    stampDutyAmount: company ? round(company.defaultStampDuty, 3).toFixed(3) : '0',
  }
}
