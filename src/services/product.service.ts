import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { add, round } from '@/lib/money'

export interface ProductListParams {
  search?: string
  categoryId?: string
  status?: 'all' | 'active' | 'inactive'
  page?: number
  perPage?: number
}

export function buildProductWhere(params: ProductListParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {}

  if (params.status === 'active') where.isActive = true
  if (params.status === 'inactive') where.isActive = false
  if (params.categoryId) where.categoryId = params.categoryId

  const search = params.search?.trim()
  if (search) {
    where.OR = [
      { reference: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } },
      { ngp: { contains: search, mode: 'insensitive' } },
      { originCountry: { contains: search, mode: 'insensitive' } },
    ]
  }

  return where
}

export async function listProducts(params: ProductListParams) {
  const page = Math.max(1, params.page ?? 1)
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 20))
  const where = buildProductWhere(params)

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { designation: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { category: { select: { id: true, name: true } } },
    }),
    prisma.product.count({ where }),
  ])

  return { items, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) }
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } })
}

/** Produits proposes dans le formulaire de facture. */
export async function listProductOptions() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { designation: 'asc' },
    select: {
      id: true,
      reference: true,
      designation: true,
      unit: true,
      salePriceEur: true,
      ngp: true,
      originCountry: true,
      vatMode: true,
      vatRate: true,
      description: true,
    },
  })

  return products.map((p) => ({
    ...p,
    salePriceEur: round(p.salePriceEur, 4).toString(),
    vatRate: round(p.vatRate, 3).toString(),
  }))
}

/** Fiche produit + statistiques de vente. */
export async function getProductDetail(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: { category: true } })
  if (!product) return null

  const soldRows = await prisma.invoiceItem.findMany({
    where: { productId: id, invoice: { status: { notIn: ['DRAFT', 'CANCELLED'] } } },
    select: {
      quantity: true,
      lineTotal: true,
      invoice: { select: { id: true, number: true, date: true, currencyCode: true, customer: { select: { companyName: true } } } },
    },
    orderBy: { invoice: { date: 'desc' } },
    take: 50,
  })

  // Cumuls en Decimal : aucun calcul monetaire ne passe par un float JS.
  const totals = new Map<string, { quantity: string; revenue: string }>()
  for (const row of soldRows) {
    const key = row.invoice.currencyCode
    const current = totals.get(key) ?? { quantity: '0', revenue: '0' }
    totals.set(key, {
      quantity: round(add(current.quantity, row.quantity), 3).toString(),
      revenue: round(add(current.revenue, row.lineTotal), 2).toFixed(2),
    })
  }

  return {
    product,
    sales: soldRows,
    totals: [...totals.entries()].map(([currencyCode, v]) => ({ currencyCode, ...v })),
  }
}
