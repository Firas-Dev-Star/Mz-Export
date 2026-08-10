import type { StockMovementType } from '@/generated/prisma/client'
import { dec } from '@/lib/money'

/**
 * Constantes de stock utilisables partout (client comme serveur).
 * La logique d'ecriture, elle, vit dans `src/lib/stock.ts` (server-only).
 */

/** Types de mouvement qui augmentent le stock. */
export const INBOUND_TYPES: StockMovementType[] = ['PURCHASE_IN', 'ADJUST_IN', 'CUSTOMER_RETURN']

/** Types de mouvement qui diminuent le stock. */
export const OUTBOUND_TYPES: StockMovementType[] = ['SALE_OUT', 'ADJUST_OUT', 'SUPPLIER_RETURN']

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  PURCHASE_IN: 'Entrée achat',
  SALE_OUT: 'Sortie vente',
  ADJUST_IN: 'Ajustement positif',
  ADJUST_OUT: 'Ajustement négatif',
  CUSTOMER_RETURN: 'Retour client',
  SUPPLIER_RETURN: 'Retour fournisseur',
}

/** +1 pour une entrée, -1 pour une sortie. */
export function movementSign(type: StockMovementType): 1 | -1 {
  return INBOUND_TYPES.includes(type) ? 1 : -1
}

export type StockLevel = 'OUT_OF_STOCK' | 'LOW' | 'OK' | 'UNTRACKED'

/** Rupture · stock faible · stock normal */
export function stockLevel(product: {
  trackStock: boolean
  stockQuantity: unknown
  minStock: unknown
}): StockLevel {
  if (!product.trackStock) return 'UNTRACKED'
  const quantity = dec(product.stockQuantity)
  if (quantity.lessThanOrEqualTo(0)) return 'OUT_OF_STOCK'
  const min = dec(product.minStock)
  if (min.greaterThan(0) && quantity.lessThanOrEqualTo(min)) return 'LOW'
  return 'OK'
}

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
  OUT_OF_STOCK: 'Rupture',
  LOW: 'Stock faible',
  OK: 'Stock normal',
  UNTRACKED: 'Non suivi',
}

export const STOCK_LEVEL_VARIANTS: Record<StockLevel, 'success' | 'warning' | 'danger' | 'outline'> = {
  OUT_OF_STOCK: 'danger',
  LOW: 'warning',
  OK: 'success',
  UNTRACKED: 'outline',
}
