import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { Decimal, add, dec, mul, round, gt } from '@/lib/money'
import { stockLevel } from '@/lib/stock-labels'

export interface MovementListParams {
  productId?: string
  type?: string
  from?: string
  to?: string
  search?: string
  page?: number
  perPage?: number
}

export function buildMovementWhere(params: MovementListParams): Prisma.StockMovementWhereInput {
  const where: Prisma.StockMovementWhereInput = {}
  const and: Prisma.StockMovementWhereInput[] = []

  if (params.productId) where.productId = params.productId
  if (params.type) where.type = params.type as Prisma.StockMovementWhereInput['type']
  if (params.from) and.push({ date: { gte: new Date(`${params.from}T00:00:00.000Z`) } })
  if (params.to) and.push({ date: { lte: new Date(`${params.to}T00:00:00.000Z`) } })

  const search = params.search?.trim()
  if (search) {
    and.push({
      OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
        { product: { designation: { contains: search, mode: 'insensitive' } } },
        { product: { reference: { contains: search, mode: 'insensitive' } } },
      ],
    })
  }

  if (and.length) where.AND = and
  return where
}

export async function listStockMovements(params: MovementListParams) {
  const page = Math.max(1, params.page ?? 1)
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 30))
  const where = buildMovementWhere(params)

  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        product: { select: { id: true, reference: true, designation: true, unit: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ])

  return { items, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) }
}

export interface StockRow {
  id: string
  reference: string
  designation: string
  unit: string
  categoryName: string | null
  trackStock: boolean
  stockQuantity: string
  minStock: string
  purchasePriceTnd: string
  stockValueTnd: string
  /**
   * Poids total du stock, en kilogrammes : quantite x poids unitaire.
   *
   * DONNEE DERIVEE, jamais stockee. Une colonne en base devrait etre mise a
   * jour a chaque mouvement et finirait par diverger de la quantite reelle.
   * Calculee ici, elle suit automatiquement chaque achat, vente ou ajustement.
   *
   * Chaine vide si le produit n'a pas de poids unitaire renseigne : mieux vaut
   * ne rien afficher qu'un zero trompeur.
   */
  weightKg: string
  level: ReturnType<typeof stockLevel>
}

export interface StockOverview {
  rows: StockRow[]
  total: number
  page: number
  pageCount: number
  summary: {
    trackedProducts: number
    outOfStock: number
    lowStock: number
    /** Valeur du stock au prix d'achat, en TND. */
    stockValueTnd: string
  }
}

/**
 * Etat du stock produit par produit.
 * La valorisation se fait au prix d'achat (TND) : elle n'est jamais melangee
 * avec le chiffre d'affaires en euros.
 */
export async function getStockOverview(params: {
  search?: string
  level?: 'all' | 'out' | 'low' | 'ok'
  page?: number
  perPage?: number
}): Promise<StockOverview> {
  const page = Math.max(1, params.page ?? 1)
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 25))

  const where: Prisma.ProductWhereInput = { isActive: true }
  const search = params.search?.trim()
  if (search) {
    where.OR = [
      { reference: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ]
  }

  const all = await prisma.product.findMany({
    where,
    orderBy: { designation: 'asc' },
    include: { category: { select: { name: true } } },
  })

  const mapped: StockRow[] = all.map((product) => ({
    id: product.id,
    reference: product.reference,
    designation: product.designation,
    unit: product.unit,
    categoryName: product.category?.name ?? null,
    trackStock: product.trackStock,
    stockQuantity: round(product.stockQuantity, 3).toString(),
    minStock: round(product.minStock, 3).toString(),
    purchasePriceTnd: round(product.purchasePriceTnd, 4).toString(),
    stockValueTnd: round(mul(product.stockQuantity, product.purchasePriceTnd), 3).toFixed(3),
    weightKg: gt(product.unitWeightKg, 0)
      ? round(mul(product.stockQuantity, product.unitWeightKg), 3).toFixed(3)
      : '',
    level: stockLevel(product),
  }))

  const filtered = mapped.filter((row) => {
    if (params.level === 'out') return row.level === 'OUT_OF_STOCK'
    if (params.level === 'low') return row.level === 'LOW'
    if (params.level === 'ok') return row.level === 'OK'
    return true
  })

  const tracked = mapped.filter((row) => row.trackStock)
  const stockValueTnd = tracked
    .reduce<Decimal>((acc, row) => add(acc, row.stockValueTnd), dec(0))
    .toFixed(3)

  return {
    rows: filtered.slice((page - 1) * perPage, page * perPage),
    total: filtered.length,
    page,
    pageCount: Math.max(1, Math.ceil(filtered.length / perPage)),
    summary: {
      trackedProducts: tracked.length,
      outOfStock: tracked.filter((row) => row.level === 'OUT_OF_STOCK').length,
      lowStock: tracked.filter((row) => row.level === 'LOW').length,
      stockValueTnd,
    },
  }
}

/** Produits en rupture ou sous le seuil, pour la page d'alertes et le dashboard. */
export async function getStockAlerts() {
  const products = await prisma.product.findMany({
    where: { isActive: true, trackStock: true },
    orderBy: { designation: 'asc' },
    select: {
      id: true, reference: true, designation: true, unit: true,
      stockQuantity: true, minStock: true, trackStock: true, purchasePriceTnd: true,
      unitWeightKg: true,
    },
  })

  const withLevel = products.map((product) => ({ ...product, level: stockLevel(product) }))
  return {
    outOfStock: withLevel.filter((p) => p.level === 'OUT_OF_STOCK'),
    lowStock: withLevel.filter((p) => p.level === 'LOW'),
  }
}
