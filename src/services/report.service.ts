import 'server-only'
import { prisma } from '@/lib/prisma'
import { add, dec, round } from '@/lib/money'

export interface ReportPeriod {
  from?: string
  to?: string
}

function periodWhere(period: ReportPeriod) {
  const where: Record<string, unknown> = { status: { notIn: ['DRAFT', 'CANCELLED'] } }
  const date: Record<string, Date> = {}
  if (period.from) date.gte = new Date(`${period.from}T00:00:00.000Z`)
  if (period.to) date.lte = new Date(`${period.to}T00:00:00.000Z`)
  if (Object.keys(date).length) where.date = date
  return where as never
}

const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export async function getReports(period: ReportPeriod) {
  const where = periodWhere(period)

  const [monthly, byCustomer, byProduct, unpaid, totals, purchaseMonthly, bySupplier, purchaseTotals, unpaidPurchases] = await Promise.all([
    prisma.$queryRaw<Array<{ month: Date; currencyCode: string; total: string; count: bigint }>>`
      SELECT date_trunc('month', "date")::date AS month,
             "currencyCode",
             SUM("netToPay")::text AS total,
             COUNT(*) AS count
      FROM "invoices"
      WHERE "status" NOT IN ('DRAFT', 'CANCELLED')
        AND (${period.from ?? null}::date IS NULL OR "date" >= ${period.from ?? null}::date)
        AND (${period.to ?? null}::date IS NULL OR "date" <= ${period.to ?? null}::date)
      GROUP BY 1, 2
      ORDER BY 1 DESC
    `,
    prisma.invoice.groupBy({
      by: ['customerId', 'currencyCode'],
      where,
      _sum: { netToPay: true, balanceDue: true },
      _count: { _all: true },
      orderBy: { _sum: { netToPay: 'desc' } },
      take: 20,
    }),
    prisma.$queryRaw<Array<{ designation: string; reference: string; quantity: string; revenue: string; currencyCode: string }>>`
      SELECT i."designation",
             i."reference",
             SUM(i."quantity")::text AS quantity,
             SUM(i."lineTotal")::text AS revenue,
             inv."currencyCode"
      FROM "invoice_items" i
      JOIN "invoices" inv ON inv."id" = i."invoiceId"
      WHERE inv."status" NOT IN ('DRAFT', 'CANCELLED')
        AND (${period.from ?? null}::date IS NULL OR inv."date" >= ${period.from ?? null}::date)
        AND (${period.to ?? null}::date IS NULL OR inv."date" <= ${period.to ?? null}::date)
      GROUP BY i."designation", i."reference", inv."currencyCode"
      ORDER BY SUM(i."lineTotal") DESC
      LIMIT 20
    `,
    prisma.invoice.findMany({
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, balanceDue: { gt: 0 } },
      orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
      take: 50,
      select: {
        id: true, number: true, date: true, dueDate: true, status: true,
        netToPay: true, paidAmount: true, balanceDue: true, currencyCode: true,
        customer: { select: { id: true, companyName: true } },
      },
    }),
    prisma.invoice.groupBy({
      by: ['currencyCode'],
      where,
      _sum: { netToPay: true, paidAmount: true, balanceDue: true, vatAmount: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ month: Date; currencyCode: string; total: string; count: bigint }>>`
      SELECT date_trunc('month', "date")::date AS month,
             "currencyCode",
             SUM("netToPay")::text AS total,
             COUNT(*) AS count
      FROM "purchases"
      WHERE "status" NOT IN ('DRAFT', 'CANCELLED')
        AND (${period.from ?? null}::date IS NULL OR "date" >= ${period.from ?? null}::date)
        AND (${period.to ?? null}::date IS NULL OR "date" <= ${period.to ?? null}::date)
      GROUP BY 1, 2
      ORDER BY 1 DESC
    `,
    prisma.purchase.groupBy({
      by: ['supplierId', 'currencyCode'],
      where: periodWhere(period),
      _sum: { netToPay: true, balanceDue: true },
      _count: { _all: true },
      orderBy: { _sum: { netToPay: 'desc' } },
      take: 20,
    }),
    prisma.purchase.groupBy({
      by: ['currencyCode'],
      where: periodWhere(period),
      _sum: { netToPay: true, paidAmount: true, balanceDue: true, vatAmount: true },
      _count: { _all: true },
    }),
    prisma.purchase.findMany({
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, balanceDue: { gt: 0 } },
      orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
      take: 50,
      select: {
        id: true, number: true, date: true, dueDate: true, status: true,
        netToPay: true, paidAmount: true, balanceDue: true, currencyCode: true,
        supplier: { select: { id: true, companyName: true } },
      },
    }),
  ])

  const supplierIds = bySupplier.map((s) => s.supplierId)
  const suppliers = supplierIds.length
    ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, companyName: true } })
    : []
  const supplierNames = new Map(suppliers.map((s) => [s.id, s.companyName]))

  const customerIds = byCustomer.map((c) => c.customerId)
  const customers = customerIds.length
    ? await prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, companyName: true } })
    : []
  const names = new Map(customers.map((c) => [c.id, c.companyName]))

  return {
    monthly: monthly.map((row) => {
      const d = new Date(row.month)
      return {
        key: d.toISOString().slice(0, 7),
        label: `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        currencyCode: row.currencyCode,
        total: round(row.total, 2).toFixed(2),
        count: Number(row.count),
      }
    }),
    byCustomer: byCustomer.map((row) => ({
      id: row.customerId,
      name: names.get(row.customerId) ?? '—',
      currencyCode: row.currencyCode,
      total: round(row._sum.netToPay, 2).toFixed(2),
      outstanding: round(row._sum.balanceDue, 2).toFixed(2),
      count: row._count._all,
    })),
    byProduct: byProduct.map((row) => ({
      designation: row.designation,
      reference: row.reference,
      quantity: round(row.quantity, 3).toString(),
      revenue: round(row.revenue, 2).toFixed(2),
      currencyCode: row.currencyCode,
    })),
    unpaid,
    purchaseMonthly: purchaseMonthly.map((row) => {
      const d = new Date(row.month)
      return {
        key: d.toISOString().slice(0, 7),
        label: `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        currencyCode: row.currencyCode,
        total: round(row.total, 3).toFixed(3),
        count: Number(row.count),
      }
    }),
    bySupplier: bySupplier.map((row) => ({
      id: row.supplierId,
      name: supplierNames.get(row.supplierId) ?? '—',
      currencyCode: row.currencyCode,
      total: round(row._sum.netToPay, 3).toFixed(3),
      outstanding: round(row._sum.balanceDue, 3).toFixed(3),
      count: row._count._all,
    })),
    purchaseTotals: purchaseTotals.map((row) => ({
      currencyCode: row.currencyCode,
      purchases: row._count._all,
      total: round(row._sum.netToPay, 3).toFixed(3),
      paid: round(row._sum.paidAmount, 3).toFixed(3),
      outstanding: round(row._sum.balanceDue, 3).toFixed(3),
      vat: round(row._sum.vatAmount, 3).toFixed(3),
    })),
    unpaidPurchases,
    totals: totals.map((row) => ({
      currencyCode: row.currencyCode,
      invoices: row._count._all,
      revenue: round(row._sum.netToPay, 2).toFixed(2),
      collected: round(row._sum.paidAmount, 2).toFixed(2),
      outstanding: round(row._sum.balanceDue, 2).toFixed(2),
      vat: round(row._sum.vatAmount, 2).toFixed(2),
    })),
  }
}

/** Total des impayés par devise (utilise dans l'en-tete du rapport). */
export function sumOutstanding(rows: Array<{ currencyCode: string; balanceDue: unknown }>) {
  const map = new Map<string, string>()
  for (const row of rows) {
    const current = map.get(row.currencyCode) ?? '0'
    map.set(row.currencyCode, add(current, dec(row.balanceDue)).toFixed(2))
  }
  return [...map.entries()].map(([currencyCode, amount]) => ({ currencyCode, amount }))
}
