import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { add, dec, mul, round } from '@/lib/money'
import { stockLevel } from '@/lib/stock-labels'

/**
 * Regle metier : on n'additionne JAMAIS deux devises.
 * Tous les cumuls sont donc regroupes par code devise.
 */

export interface CurrencyTotal {
  currencyCode: string
  amount: string
}

export interface DashboardData {
  revenue: CurrencyTotal[]
  collected: CurrencyTotal[]
  outstanding: CurrencyTotal[]
  purchases: CurrencyTotal[]
  purchasesOutstanding: CurrencyTotal[]
  stock: {
    valueTnd: string
    outOfStock: number
    lowStock: number
    trackedProducts: number
  }
  counts: {
    invoices: number
    drafts: number
    overdue: number
    unpaid: number
    customers: number
    suppliers: number
    products: number
    purchases: number
  }
  monthlySales: Array<{ month: string; label: string; total: number; currencyCode: string }>
  topCustomers: Array<{ id: string; name: string; total: string; currencyCode: string; invoices: number }>
  recentInvoices: Array<{
    id: string
    number: string
    date: Date
    customerName: string
    status: string
    netToPay: string
    currencyCode: string
  }>
}

const MONTH_LABELS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

/** Factures prises en compte dans le chiffre d'affaires : ni brouillon ni annulee. */
const BILLED = { status: { notIn: ['DRAFT', 'CANCELLED'] } } satisfies Prisma.InvoiceWhereInput

export async function getDashboardData(): Promise<DashboardData> {
  const today = new Date()
  const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const twelveMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1))

  const [
    byCurrency,
    invoiceCount,
    draftCount,
    overdueCount,
    unpaidCount,
    customerCount,
    productCount,
    supplierCount,
    purchaseTotals,
    stockProducts,
    monthlyRows,
    topCustomerRows,
    recent,
  ] = await Promise.all([
    prisma.invoice.groupBy({
      by: ['currencyCode'],
      where: BILLED,
      _sum: { netToPay: true, paidAmount: true, balanceDue: true },
    }),
    prisma.invoice.count({ where: BILLED }),
    prisma.invoice.count({ where: { status: 'DRAFT' } }),
    prisma.invoice.count({
      where: { status: { notIn: ['DRAFT', 'CANCELLED', 'PAID'] }, dueDate: { lt: startOfToday } },
    }),
    prisma.invoice.count({ where: { ...BILLED, balanceDue: { gt: 0 } } }),
    prisma.customer.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.purchase.groupBy({
      by: ['currencyCode'],
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
      _sum: { netToPay: true, balanceDue: true },
      _count: { _all: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, trackStock: true },
      select: { stockQuantity: true, minStock: true, purchasePriceTnd: true, trackStock: true },
    }),
    prisma.$queryRaw<Array<{ month: Date; currencyCode: string; total: string }>>`
      SELECT date_trunc('month', "date")::date AS month,
             "currencyCode",
             SUM("netToPay")::text AS total
      FROM "invoices"
      WHERE "status" NOT IN ('DRAFT', 'CANCELLED') AND "date" >= ${twelveMonthsAgo}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `,
    prisma.invoice.groupBy({
      by: ['customerId', 'currencyCode'],
      where: BILLED,
      _sum: { netToPay: true },
      _count: { _all: true },
      orderBy: { _sum: { netToPay: 'desc' } },
      take: 5,
    }),
    prisma.invoice.findMany({
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      select: {
        id: true,
        number: true,
        date: true,
        status: true,
        netToPay: true,
        currencyCode: true,
        customer: { select: { companyName: true } },
      },
    }),
  ])

  const customerIds = topCustomerRows.map((row) => row.customerId)
  const customers = customerIds.length
    ? await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, companyName: true },
      })
    : []
  const customerNames = new Map(customers.map((c) => [c.id, c.companyName]))

  // Serie mensuelle complete (12 mois), meme si certains mois sont vides.
  const monthlyIndex = new Map<string, { total: string; currencyCode: string }>()
  for (const row of monthlyRows) {
    const key = new Date(row.month).toISOString().slice(0, 7)
    monthlyIndex.set(key, { total: row.total, currencyCode: row.currencyCode })
  }

  const monthlySales: DashboardData['monthlySales'] = []
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    const found = monthlyIndex.get(key)
    monthlySales.push({
      month: key,
      label: `${MONTH_LABELS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      total: found ? dec(found.total).toDecimalPlaces(2).toNumber() : 0,
      currencyCode: found?.currencyCode ?? 'EUR',
    })
  }

  const stockValueTnd = stockProducts
    .reduce((acc, product) => add(acc, mul(product.stockQuantity, product.purchasePriceTnd)), dec(0))
    .toDecimalPlaces(3)
    .toFixed(3)

  const levels = stockProducts.map((product) => stockLevel(product))

  return {
    purchases: purchaseTotals.map((r) => ({ currencyCode: r.currencyCode, amount: round(r._sum.netToPay, 3).toFixed(3) })),
    purchasesOutstanding: purchaseTotals.map((r) => ({ currencyCode: r.currencyCode, amount: round(r._sum.balanceDue, 3).toFixed(3) })),
    stock: {
      valueTnd: stockValueTnd,
      outOfStock: levels.filter((l) => l === 'OUT_OF_STOCK').length,
      lowStock: levels.filter((l) => l === 'LOW').length,
      trackedProducts: stockProducts.length,
    },
    revenue: byCurrency.map((r) => ({ currencyCode: r.currencyCode, amount: round(r._sum.netToPay, 2).toFixed(2) })),
    collected: byCurrency.map((r) => ({ currencyCode: r.currencyCode, amount: round(r._sum.paidAmount, 2).toFixed(2) })),
    outstanding: byCurrency.map((r) => ({ currencyCode: r.currencyCode, amount: round(r._sum.balanceDue, 2).toFixed(2) })),
    counts: {
      invoices: invoiceCount,
      drafts: draftCount,
      overdue: overdueCount,
      unpaid: unpaidCount,
      customers: customerCount,
      suppliers: supplierCount,
      products: productCount,
      purchases: purchaseTotals.reduce((acc, r) => acc + r._count._all, 0),
    },
    monthlySales,
    topCustomers: topCustomerRows.map((row) => ({
      id: row.customerId,
      name: customerNames.get(row.customerId) ?? '—',
      total: round(row._sum.netToPay, 2).toFixed(2),
      currencyCode: row.currencyCode,
      invoices: row._count._all,
    })),
    recentInvoices: recent.map((inv) => ({
      id: inv.id,
      number: inv.number,
      date: inv.date,
      customerName: inv.customer.companyName,
      status: inv.status,
      netToPay: round(inv.netToPay, 2).toFixed(2),
      currencyCode: inv.currencyCode,
    })),
  }
}

/** Total multi-devises formate ("13 230,00 € + 1 500,000 DT" -> tableau). */
export function sumByCurrency(rows: CurrencyTotal[]): CurrencyTotal[] {
  const map = new Map<string, string>()
  for (const row of rows) {
    const current = map.get(row.currencyCode) ?? '0'
    map.set(row.currencyCode, add(current, row.amount).toFixed(2))
  }
  return [...map.entries()].map(([currencyCode, amount]) => ({ currencyCode, amount }))
}
