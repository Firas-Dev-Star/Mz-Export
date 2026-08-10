import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { round } from '@/lib/money'
import { slugifyCode } from '@/lib/utils'

export interface SupplierListParams {
  search?: string
  status?: 'all' | 'active' | 'inactive'
  page?: number
  perPage?: number
}

export function buildSupplierWhere(params: SupplierListParams): Prisma.SupplierWhereInput {
  const where: Prisma.SupplierWhereInput = {}
  if (params.status === 'active') where.isActive = true
  if (params.status === 'inactive') where.isActive = false

  const search = params.search?.trim()
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { taxId: { contains: search, mode: 'insensitive' } },
      { contactName: { contains: search, mode: 'insensitive' } },
    ]
  }
  return where
}

export async function listSuppliers(params: SupplierListParams) {
  const page = Math.max(1, params.page ?? 1)
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 20))
  const where = buildSupplierWhere(params)

  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { companyName: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, code: true, companyName: true, city: true, country: true,
        email: true, phone: true, taxId: true, currencyCode: true,
        isActive: true, isDemo: true,
        _count: { select: { purchases: true } },
      },
    }),
    prisma.supplier.count({ where }),
  ])

  return { items, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) }
}

/** Fiche fournisseur : coordonnees + total des achats + impayes + historique. */
export async function getSupplierDetail(id: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id } })
  if (!supplier) return null

  const [totals, purchases] = await Promise.all([
    prisma.purchase.groupBy({
      by: ['currencyCode'],
      where: { supplierId: id, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      _sum: { netToPay: true, paidAmount: true, balanceDue: true },
      _count: { _all: true },
    }),
    prisma.purchase.findMany({
      where: { supplierId: id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 25,
      select: {
        id: true, number: true, supplierReference: true, date: true, dueDate: true,
        status: true, netToPay: true, paidAmount: true, balanceDue: true, currencyCode: true,
      },
    }),
  ])

  return {
    supplier,
    stats: totals.map((t) => ({
      currencyCode: t.currencyCode,
      purchaseCount: t._count._all,
      total: round(t._sum.netToPay, 3).toFixed(3),
      paid: round(t._sum.paidAmount, 3).toFixed(3),
      outstanding: round(t._sum.balanceDue, 3).toFixed(3),
    })),
    purchases,
  }
}

export async function generateSupplierCode(companyName: string, excludeId?: string) {
  const base = slugifyCode(companyName) || 'FOURNISSEUR'
  let candidate = base
  let suffix = 1
  while (true) {
    const existing = await prisma.supplier.findUnique({ where: { code: candidate }, select: { id: true } })
    if (!existing || existing.id === excludeId) return candidate
    suffix += 1
    candidate = `${base.slice(0, 20)}-${suffix}`
  }
}
