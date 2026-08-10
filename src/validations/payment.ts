import { z } from 'zod'
import { dateString, decimalString, idSchema, optionalText } from '@/validations/common'

export const paymentSchema = z.object({
  invoiceId: idSchema,
  amount: decimalString({ min: 0.01, label: 'Le montant' }),
  date: dateString("La date du règlement"),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER']).default('BANK_TRANSFER'),
  reference: optionalText(120),
  note: optionalText(500),
})

export type PaymentInput = z.infer<typeof paymentSchema>
