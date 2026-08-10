import 'server-only'
import type { Prisma, StockMovementType, StockReferenceType } from '@/generated/prisma/client'
import { BusinessError } from '@/lib/errors'
import { formatQuantity } from '@/lib/format'
import { Decimal, dec, round } from '@/lib/money'
import { movementSign } from '@/lib/stock-labels'

export {
  INBOUND_TYPES,
  MOVEMENT_LABELS,
  OUTBOUND_TYPES,
  STOCK_LEVEL_LABELS,
  STOCK_LEVEL_VARIANTS,
  movementSign,
  stockLevel,
} from '@/lib/stock-labels'
export type { StockLevel } from '@/lib/stock-labels'

/**
 * Moteur de stock.
 *
 * REGLE ABSOLUE : la quantite en stock d'un produit n'est JAMAIS modifiee
 * sans qu'un mouvement correspondant soit enregistre dans la meme transaction.
 * Toute mise a jour passe donc par `applyStockMovement`.
 */

interface MovementInput {
  productId: string
  type: StockMovementType
  /** Quantite positive : le sens est porte par `type`. */
  quantity: unknown
  date: Date
  referenceType?: StockReferenceType
  referenceId?: string | null
  reference?: string
  note?: string
  userId?: string | null
}

/**
 * Applique un mouvement de stock : enregistre le mouvement ET met a jour la
 * quantite du produit, dans la transaction fournie.
 *
 * La ligne produit est verrouillee (SELECT ... FOR UPDATE) : deux operations
 * concurrentes sur le meme produit ne peuvent pas se marcher dessus.
 */
export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  input: MovementInput,
): Promise<Decimal | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; designation: string; trackStock: boolean; stockQuantity: string }>>`
    SELECT "id", "designation", "trackStock", "stockQuantity"::text
    FROM "products" WHERE "id" = ${input.productId} FOR UPDATE
  `
  const product = rows[0]
  if (!product) return null
  // Un produit non suivi (service, prestation) ne génère aucun mouvement.
  if (!product.trackStock) return null

  const quantity = round(dec(input.quantity).abs(), 3)
  if (quantity.isZero()) return null

  const delta = quantity.times(movementSign(input.type))
  const stockAfter = round(dec(product.stockQuantity).plus(delta), 3)

  await tx.product.update({
    where: { id: input.productId },
    data: { stockQuantity: stockAfter.toFixed(3) },
  })

  await tx.stockMovement.create({
    data: {
      productId: input.productId,
      type: input.type,
      quantity: quantity.toFixed(3),
      stockAfter: stockAfter.toFixed(3),
      referenceType: input.referenceType ?? 'MANUAL',
      referenceId: input.referenceId ?? null,
      reference: input.reference ?? '',
      date: input.date,
      note: input.note ?? '',
      userId: input.userId ?? null,
    },
  })

  return stockAfter
}

export interface StockDemandLine {
  productId: string | null
  quantity: unknown
}

/**
 * Verifie que le stock disponible couvre les quantites demandees.
 * Leve une BusinessError detaillee (produit, disponible, demande) sinon.
 *
 * Les quantites d'un meme produit reparti sur plusieurs lignes sont cumulees.
 */
export async function assertStockAvailable(
  tx: Prisma.TransactionClient,
  lines: StockDemandLine[],
): Promise<void> {
  const demand = new Map<string, Decimal>()
  for (const line of lines) {
    if (!line.productId) continue
    const current = demand.get(line.productId) ?? new Decimal(0)
    demand.set(line.productId, current.plus(dec(line.quantity).abs()))
  }
  if (demand.size === 0) return

  const products = await tx.product.findMany({
    where: { id: { in: [...demand.keys()] } },
    select: { id: true, designation: true, unit: true, trackStock: true, stockQuantity: true },
  })

  const problems: string[] = []
  for (const product of products) {
    if (!product.trackStock) continue
    const required = demand.get(product.id) ?? new Decimal(0)
    const available = dec(product.stockQuantity)
    if (required.greaterThan(available)) {
      problems.push(
        `Stock insuffisant pour ${product.designation}.\n` +
          `Stock disponible : ${formatQuantity(available)} ${product.unit}\n` +
          `Quantité demandée : ${formatQuantity(required)} ${product.unit}`,
      )
    }
  }

  if (problems.length > 0) throw new BusinessError(problems.join('\n\n'))
}

/**
 * Contre-passe les mouvements d'un document (annulation de facture ou d'achat).
 * On ne supprime jamais un mouvement : on en cree un de sens inverse,
 * pour conserver l'historique complet.
 */
export async function reverseDocumentMovements(
  tx: Prisma.TransactionClient,
  params: {
    referenceType: StockReferenceType
    referenceId: string
    reference: string
    date: Date
    userId?: string | null
    note: string
  },
): Promise<number> {
  const movements = await tx.stockMovement.findMany({
    where: { referenceType: params.referenceType, referenceId: params.referenceId },
    select: { productId: true, type: true, quantity: true },
  })

  const reverseType: Record<StockMovementType, StockMovementType> = {
    PURCHASE_IN: 'SUPPLIER_RETURN',
    SALE_OUT: 'CUSTOMER_RETURN',
    ADJUST_IN: 'ADJUST_OUT',
    ADJUST_OUT: 'ADJUST_IN',
    CUSTOMER_RETURN: 'SALE_OUT',
    SUPPLIER_RETURN: 'PURCHASE_IN',
  }

  // On ne contre-passe pas deux fois : les mouvements de contre-passation
  // portent la mention "Annulation" et sont ignores au second passage.
  const alreadyReversed = await tx.stockMovement.count({
    where: {
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      note: { startsWith: 'Annulation' },
    },
  })
  if (alreadyReversed > 0) return 0

  let count = 0
  for (const movement of movements) {
    await applyStockMovement(tx, {
      productId: movement.productId,
      type: reverseType[movement.type],
      quantity: movement.quantity,
      date: params.date,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      reference: params.reference,
      note: params.note,
      userId: params.userId,
    })
    count += 1
  }
  return count
}
