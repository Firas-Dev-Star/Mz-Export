import { z } from 'zod'
import {
  dateString,
  decimalString,
  idSchema,
  optionalDateString,
  optionalText,
  requiredText,
  vatModeSchema,
} from '@/validations/common'

export const purchaseItemSchema = z.object({
  productId: z.string().trim().optional().or(z.literal('')),
  reference: optionalText(60),
  designation: requiredText('La désignation', 250),
  description: optionalText(1000),
  unit: optionalText(20),
  quantity: decimalString({ min: 0.001, label: 'La quantité' }),
  unitPrice: decimalString({ min: 0, label: 'Le prix unitaire' }),
  discountPercent: decimalString({ min: 0, label: 'La remise' }).refine(
    (v) => Number(v) <= 100,
    'La remise ne peut pas dépasser 100 %',
  ),
})

export const purchaseSchema = z
  .object({
    supplierId: idSchema.describe('Fournisseur'),
    supplierReference: optionalText(60),
    date: dateString("La date de la facture d'achat"),
    dueDate: optionalDateString,
    currencyCode: z.string().trim().min(1, 'La devise est obligatoire').default('TND'),
    paymentTerms: optionalText(160),

    shippingLabel: optionalText(60),
    shippingAmount: decimalString({ min: 0, label: 'Le transport' }),
    otherFeesLabel: optionalText(60),
    otherFeesAmount: decimalString({ min: 0, label: 'Les autres frais' }),

    vatMode: vatModeSchema.default('RATE'),
    vatRate: decimalString({ min: 0, label: 'Le taux de TVA' }),

    stampDutyLabel: optionalText(60),
    stampDutyAmount: decimalString({ min: 0, label: 'Le timbre fiscal' }),

    notes: optionalText(2000),

    items: z.array(purchaseItemSchema).min(1, "La facture d'achat doit comporter au moins une ligne"),
  })
  .refine((data) => !data.dueDate || data.dueDate >= data.date, {
    message: "La date d'échéance ne peut pas précéder la date de facture",
    path: ['dueDate'],
  })
  .refine((data) => data.vatMode !== 'RATE' || Number(data.vatRate) > 0, {
    message: 'Indiquez un taux de TVA supérieur à 0',
    path: ['vatRate'],
  })

export type PurchaseInput = z.infer<typeof purchaseSchema>
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>

export const purchasePaymentSchema = z.object({
  purchaseId: idSchema,
  amount: decimalString({ min: 0.001, label: 'Le montant' }),
  date: dateString('La date du règlement'),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER']).default('BANK_TRANSFER'),
  reference: optionalText(120),
  note: optionalText(500),
})

export type PurchasePaymentInput = z.infer<typeof purchasePaymentSchema>

/**
 * Correction des numéros d'une facture d'achat déjà validée.
 *
 * Schéma distinct de `purchaseSchema` à dessein : ces deux champs sont les
 * seuls qu'on autorise à changer après validation. Les montants et les lignes
 * restent figés — ils ont alimenté le stock et les règlements.
 *
 * `number` est obligatoire : une facture validée en porte toujours un, et le
 * vider casserait la contrainte d'unicité en base comme les références du
 * journal d'audit.
 */
export const purchaseNumbersSchema = z.object({
  number: requiredText("Le numéro d'enregistrement", 60),
  supplierReference: optionalText(60),
})

export type PurchaseNumbersInput = z.infer<typeof purchaseNumbersSchema>
