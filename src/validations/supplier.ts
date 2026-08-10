import { z } from 'zod'
import { optionalEmail, optionalText, requiredText } from '@/validations/common'

export const supplierSchema = z.object({
  code: optionalText(24),
  companyName: requiredText('La raison sociale', 180),
  contactName: optionalText(120),
  addressLine1: optionalText(180),
  addressLine2: optionalText(180),
  postalCode: optionalText(20),
  city: optionalText(90),
  country: optionalText(90),
  phone: optionalText(40),
  email: optionalEmail,
  taxId: optionalText(60),
  tradeRegister: optionalText(60),
  paymentTerms: optionalText(120),
  currencyCode: z.string().trim().min(1, 'Devise obligatoire').default('TND'),
  notes: optionalText(2000),
  isActive: z.coerce.boolean().default(true),
})

export type SupplierInput = z.infer<typeof supplierSchema>
