'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { BusinessError, isBusinessError } from '@/lib/errors'
import { formatQuantity } from '@/lib/format'
import { dec } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { applyStockMovement } from '@/lib/stock'
import { MOVEMENT_LABELS, movementSign } from '@/lib/stock-labels'
import type { ActionResult } from '@/validations/common'
import { type StockAdjustmentInput, stockAdjustmentSchema } from '@/validations/stock'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  if (isBusinessError(error)) return fail(error.message)
  console.error('[stock.action]', error)
  return fail("Une erreur est survenue. Le mouvement n'a pas été enregistré.")
}

/**
 * Ajustement manuel de stock.
 * Comme toute variation de stock, il passe par `applyStockMovement` :
 * la quantité du produit et le mouvement sont écrits dans la même transaction.
 */
export async function adjustStock(raw: StockAdjustmentInput): Promise<ActionResult<{ stockAfter: string }>> {
  try {
    const session = await requirePermission('stock.adjust')

    const parsed = stockAdjustmentSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { id: true, designation: true, unit: true, trackStock: true, stockQuantity: true },
    })
    if (!product) return fail('Produit introuvable.')
    if (!product.trackStock) {
      return fail(`« ${product.designation} » n'est pas suivi en stock. Activez le suivi dans la fiche produit.`)
    }

    // Un mouvement sortant ne peut pas rendre le stock négatif.
    if (movementSign(data.type) === -1) {
      const available = dec(product.stockQuantity)
      if (dec(data.quantity).greaterThan(available)) {
        throw new BusinessError(
          `Stock insuffisant pour ${product.designation}.\n` +
            `Stock disponible : ${formatQuantity(available)} ${product.unit}\n` +
            `Quantité demandée : ${formatQuantity(data.quantity)} ${product.unit}`,
        )
      }
    }

    const stockAfter = await prisma.$transaction(async (tx) => {
      const result = await applyStockMovement(tx, {
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        date: new Date(`${data.date}T00:00:00.000Z`),
        referenceType: 'MANUAL',
        reference: '',
        note: data.note,
        userId: session.userId,
      })

      await recordAudit(
        {
          session,
          action: 'ADJUST_STOCK',
          entity: 'StockMovement',
          entityId: data.productId,
          reference: product.designation,
          details: { type: data.type, quantity: data.quantity, stockAfter: result?.toFixed(3) ?? null },
        },
        tx,
      )

      return result
    })

    revalidatePath('/stock')
    revalidatePath('/products')
    revalidatePath(`/products/${data.productId}`)
    revalidatePath('/dashboard')

    return {
      ok: true,
      data: { stockAfter: stockAfter?.toFixed(3) ?? '0' },
      message: `${MOVEMENT_LABELS[data.type]} enregistré. Nouveau stock : ${formatQuantity(stockAfter ?? 0)} ${product.unit}.`,
    }
  } catch (error) {
    return handleError(error)
  }
}
