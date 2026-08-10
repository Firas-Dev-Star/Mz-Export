import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { round } from '@/lib/money'
import { slugifyCode } from '@/lib/utils'

export interface CustomerListParams {
  search?: string
  country?: string
  status?: 'all' | 'active' | 'inactive'
  page?: number
  perPage?: number
}

export function buildCustomerWhere(params: CustomerListParams): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {}

  if (params.status === 'active') where.isActive = true
  if (params.status === 'inactive') where.isActive = false
  if (params.country) where.country = { equals: params.country, mode: 'insensitive' }

  const search = params.search?.trim()
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { country: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { siret: { contains: search, mode: 'insensitive' } },
      { taxId: { contains: search, mode: 'insensitive' } },
      { contactName: { contains: search, mode: 'insensitive' } },
    ]
  }

  return where
}

export async function listCustomers(params: CustomerListParams) {
  const page = Math.max(1, params.page ?? 1)
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 20))
  const where = buildCustomerWhere(params)

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { companyName: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        code: true,
        companyName: true,
        city: true,
        country: true,
        email: true,
        phone: true,
        siret: true,
        currencyCode: true,
        isActive: true,
        isDemo: true,
        _count: { select: { invoices: true } },
      },
    }),
    prisma.customer.count({ where }),
  ])

  return { items, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) }
}

export async function getCustomerCountries() {
  const rows = await prisma.customer.findMany({
    where: { country: { not: '' } },
    distinct: ['country'],
    select: { country: true },
    orderBy: { country: 'asc' },
  })
  return rows.map((r) => r.country)
}

/** Fiche client complete : coordonnees + indicateurs commerciaux + factures. */
export async function getCustomerDetail(id: string) {
  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) return null

  const [totals, invoices] = await Promise.all([
    prisma.invoice.groupBy({
      by: ['currencyCode'],
      where: { customerId: id, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      _sum: { netToPay: true, paidAmount: true, balanceDue: true },
      _count: { _all: true },
    }),
    prisma.invoice.findMany({
      where: { customerId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 25,
      select: {
        id: true,
        number: true,
        date: true,
        dueDate: true,
        status: true,
        netToPay: true,
        paidAmount: true,
        balanceDue: true,
        currencyCode: true,
      },
    }),
  ])

  return {
    customer,
    stats: totals.map((t) => ({
      currencyCode: t.currencyCode,
      invoiceCount: t._count._all,
      revenue: round(t._sum.netToPay, 2).toFixed(2),
      collected: round(t._sum.paidAmount, 2).toFixed(2),
      outstanding: round(t._sum.balanceDue, 2).toFixed(2),
    })),
    invoices,
  }
}

/** Genere un code client unique a partir de la raison sociale. */
export async function generateCustomerCode(companyName: string, excludeId?: string) {
  const base = slugifyCode(companyName) || 'CLIENT'
  let candidate = base
  let suffix = 1

  while (true) {
    const existing = await prisma.customer.findUnique({ where: { code: candidate }, select: { id: true } })
    if (!existing || existing.id === excludeId) return candidate
    suffix += 1
    candidate = `${base.slice(0, 20)}-${suffix}`
  }
}
