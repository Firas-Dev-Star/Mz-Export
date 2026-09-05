import { z } from 'zod'
import {
  dateString,
  decimalString,
  idSchema,
  optionalDateString,
  optionalEmail,
  optionalText,
  requiredText,
  vatModeSchema,
} from '@/validations/common'

/**
 * Transporteur : la societe qui achemine les expeditions. Ce n'est PAS un
 * fournisseur — elle ne vend aucune marchandise et rien n'entre en stock.
 */
export const carrierSchema = z.object({
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

export type CarrierInput = z.infer<typeof carrierSchema>

/**
 * Facture de transport. Pas de lignes d'articles : trois montants nommes, qui
 * sont ce que portent reellement les factures recues des transporteurs.
 *
 * `invoiceId` rattache la facture a la vente expediee. Il reste optionnel : la
 * facture du transporteur arrive parfois avant que la vente soit saisie, et il
 * vaut mieux l'enregistrer non rapprochee que pas du tout.
 */
export const transportInvoiceSchema = z
  .object({
    carrierId: idSchema.describe('Transporteur'),
    carrierReference: optionalText(60),
    date: dateString('La date de la facture de transport'),
    dueDate: optionalDateString,

    shipmentRef: optionalText(80),
    invoiceId: z.string().trim().optional().or(z.literal('')),

    currencyCode: z.string().trim().min(1, 'La devise est obligatoire').default('TND'),
    paymentTerms: optionalText(160),

    transportLabel: optionalText(60),
    transportAmount: decimalString({ min: 0, label: 'Le transport' }),
    transitLabel: optionalText(60),
    transitAmount: decimalString({ min: 0, label: 'Le transit' }),
    otherFeesLabel: optionalText(60),
    otherFeesAmount: decimalString({ min: 0, label: 'Les autres frais' }),

    vatMode: vatModeSchema.default('NONE'),
    vatRate: decimalString({ min: 0, label: 'Le taux de TVA' }),

    stampDutyLabel: optionalText(60),
    stampDutyAmount: decimalString({ min: 0, label: 'Le timbre fiscal' }),

    notes: optionalText(2000),
  })
  .refine((data) => !data.dueDate || data.dueDate >= data.date, {
    message: "La date d'échéance ne peut pas précéder la date de facture",
    path: ['dueDate'],
  })
  .refine((data) => data.vatMode !== 'RATE' || Number(data.vatRate) > 0, {
    message: 'Indiquez un taux de TVA supérieur à 0',
    path: ['vatRate'],
  })
  // Une facture de transport a forcement un montant : sans cela, elle
  // n'apparaitrait ni dans les charges ni dans le cout de l'expedition.
  .refine(
    (data) =>
      Number(data.transportAmount) + Number(data.transitAmount) + Number(data.otherFeesAmount) > 0,
    {
      message: 'Indiquez au moins un montant : transport, transit ou autres frais',
      path: ['transportAmount'],
    },
  )

export type TransportInvoiceInput = z.infer<typeof transportInvoiceSchema>

export const transportPaymentSchema = z.object({
  transportInvoiceId: idSchema,
  amount: decimalString({ min: 0.001, label: 'Le montant' }),
  date: dateString('La date du règlement'),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER']).default('BANK_TRANSFER'),
  reference: optionalText(120),
  note: optionalText(500),
})

export type TransportPaymentInput = z.infer<typeof transportPaymentSchema>
