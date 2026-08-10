import { z } from 'zod'
import { decimalString, optionalEmail, optionalText, requiredText, vatModeSchema } from '@/validations/common'

export const companySchema = z.object({
  name: requiredText('Le nom de la société', 180),
  legalForm: optionalText(120),
  capital: decimalString({ min: 0, label: 'Le capital' }),
  capitalCurrency: optionalText(10),
  taxId: optionalText(60),
  tradeRegister: optionalText(60),
  activity: optionalText(120),
  addressLine1: optionalText(180),
  addressLine2: optionalText(180),
  postalCode: optionalText(20),
  city: optionalText(90),
  country: optionalText(90),
  phone: optionalText(40),
  phone2: optionalText(40),
  fax: optionalText(40),
  email: optionalEmail,
  website: optionalText(120),
  bankName: optionalText(90),
  bankAgency: optionalText(90),
  bankAccount: optionalText(60),
  iban: optionalText(60),
  swift: optionalText(30),
  defaultCurrency: optionalText(10),
  defaultVatMode: vatModeSchema.default('NONE'),
  defaultVatRate: decimalString({ min: 0, label: 'Le taux de TVA' }),
  defaultStampDuty: decimalString({ min: 0, label: 'Le timbre fiscal' }),
  defaultStampLabel: optionalText(60),
  defaultPaymentTerms: optionalText(160),
  defaultIncoterm: optionalText(30),
  defaultOrigin: optionalText(90),
  headerNote: optionalText(400),
  paymentNotice: optionalText(400),
  legalMentions: optionalText(1000),
  footerText: optionalText(500),
})

export const sequenceSchema = z.object({
  prefix: optionalText(20),
  suffix: optionalText(20),
  padding: z.coerce.number().int().min(1, 'Minimum 1').max(10, 'Maximum 10').default(4),
  nextNumber: z.coerce.number().int().min(1, 'Le prochain numéro doit être supérieur à 0'),
  includeYear: z.coerce.boolean().default(false),
  resetYearly: z.coerce.boolean().default(false),
})

export const userSchema = z.object({
  name: requiredText('Le nom', 120),
  email: z.string().trim().toLowerCase().email('Adresse email invalide'),
  role: z.enum(['ADMIN', 'MANAGER', 'USER']).default('USER'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').optional().or(z.literal('')),
  isActive: z.coerce.boolean().default(true),
})

export type CompanyInput = z.infer<typeof companySchema>
export type SequenceInput = z.infer<typeof sequenceSchema>
export type UserInput = z.infer<typeof userSchema>
