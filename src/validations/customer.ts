import { z } from 'zod'
import { optionalEmail, optionalText, requiredText } from '@/validations/common'
import { INCOTERM_CODES } from '@/lib/trade'

export const customerSchema = z.object({
  code: optionalText(24),
  companyName: requiredText('La raison sociale', 180),
  firstName: optionalText(80),
  lastName: optionalText(80),
  contactName: optionalText(120),
  contactPhone: optionalText(40),
  contactEmail: optionalEmail,
  addressLine1: optionalText(180),
  addressLine2: optionalText(180),
  postalCode: optionalText(20),
  city: optionalText(90),
  country: optionalText(90),
  phone: optionalText(40),
  email: optionalEmail,
  taxId: optionalText(60),
  siret: optionalText(30),
  vatNumber: optionalText(30),
  eori: optionalText(30),
  paymentTerms: optionalText(120),
  currencyCode: z.string().trim().min(1, 'Devise obligatoire').default('EUR'),
  deliveryAddress: optionalText(400),
  // Liste fermee, comme sur la facture : seules les valeurs de la liste
  // deroulante sont acceptees, la chaine vide restant permise.
  defaultIncoterm: z.enum(INCOTERM_CODES).or(z.literal('')).default(''),
  deliveryCountry: optionalText(90),
  notes: optionalText(2000),
  isActive: z.coerce.boolean().default(true),
})

export type CustomerInput = z.infer<typeof customerSchema>
