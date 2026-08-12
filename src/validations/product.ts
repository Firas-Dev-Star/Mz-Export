import { z } from 'zod'
import { UNIT_CODES } from '@/lib/units'
import { decimalString, optionalText, requiredText, vatModeSchema } from '@/validations/common'

export const productSchema = z.object({
  reference: requiredText('La référence', 60),
  sku: optionalText(60),
  designation: requiredText('La désignation', 200),
  description: optionalText(2000),
  // Liste fermee : evite les variantes du meme code (KG / Kg / kg).
  unit: z.enum(UNIT_CODES, { message: 'Choisissez une unité dans la liste' }),
  categoryName: optionalText(80),
  salePriceEur: decimalString({ min: 0, label: 'Le prix de vente' }),
  purchasePriceTnd: decimalString({ min: 0, label: "Le prix d'achat" }),
  trackStock: z.coerce.boolean().default(true),
  minStock: decimalString({ min: 0, label: 'Le stock minimum' }),
  vatMode: vatModeSchema.default('NONE'),
  vatRate: decimalString({ min: 0, label: 'Le taux de TVA' }),
  ngp: optionalText(40),
  originCountry: optionalText(90),
  unitWeightKg: decimalString({ min: 0, label: 'Le poids unitaire' }),
  lengthCm: decimalString({ min: 0, label: 'La longueur' }),
  widthCm: decimalString({ min: 0, label: 'La largeur' }),
  heightCm: decimalString({ min: 0, label: 'La hauteur' }),
  unitsPerPackage: z.coerce.number().int().min(0, 'Valeur invalide').default(0),
  isActive: z.coerce.boolean().default(true),
})

export type ProductInput = z.infer<typeof productSchema>
