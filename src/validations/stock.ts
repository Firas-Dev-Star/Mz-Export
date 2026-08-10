import { z } from 'zod'
import { dateString, decimalString, idSchema, optionalText } from '@/validations/common'

export const stockAdjustmentSchema = z.object({
  productId: idSchema,
  type: z.enum(['ADJUST_IN', 'ADJUST_OUT', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN']),
  quantity: decimalString({ min: 0.001, label: 'La quantité' }),
  date: dateString('La date du mouvement'),
  note: optionalText(500),
})

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>
