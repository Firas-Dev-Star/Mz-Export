import { z } from 'zod'
import { INCOTERM_CODES, TRANSPORT_MODE_CODES } from '@/lib/trade'
import {
  dateString,
  decimalString,
  idSchema,
  optionalDateString,
  optionalText,
  requiredText,
  vatModeSchema,
} from '@/validations/common'

export const invoiceItemSchema = z.object({
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
  ngp: optionalText(40),
  originCountry: optionalText(90),
})

export const invoiceSchema = z
  .object({
    customerId: idSchema.describe('Client'),
    date: dateString('La date de facture'),
    dueDate: optionalDateString,
    currencyCode: z.string().trim().min(1, 'La devise est obligatoire').default('EUR'),
    /**
     * Taux de change vers le dinar, FIGE sur le document.
     * 1 unite de `currencyCode` = `exchangeRateTnd` TND.
     * Vaut 1 lorsque la facture est deja en dinars.
     */
    exchangeRateTnd: decimalString({ min: 0, label: 'Le taux de change' }),
    paymentTerms: optionalText(160),

    deliveryAddress: optionalText(500),
    deliveryCountry: optionalText(90),

    ngp: optionalText(40),
    originCountry: optionalText(90),
    packageCount: z.coerce.number().int().min(0, 'Valeur invalide').default(0),
    packageType: optionalText(60),
    packageDimensions: optionalText(80),
    grossWeightKg: decimalString({ min: 0, label: 'Le poids brut' }),
    netWeightKg: decimalString({ min: 0, label: 'Le poids net' }),
    // Listes fermees : seules les valeurs des listes deroulantes sont acceptees.
    // La chaine vide reste permise (champ facultatif).
    incoterm: z
      .enum(INCOTERM_CODES)
      .or(z.literal(''))
      .default(''),
    transportMode: z
      .enum(TRANSPORT_MODE_CODES)
      .or(z.literal(''))
      .default(''),
    departurePort: optionalText(90),
    destination: optionalText(120),
    orderReference: optionalText(90),

    feesIncluded: z.coerce.boolean().default(true),
    shippingLabel: optionalText(60),
    shippingAmount: decimalString({ min: 0, label: 'Le transport' }),
    transitLabel: optionalText(60),
    transitAmount: decimalString({ min: 0, label: 'Le transit' }),
    insuranceLabel: optionalText(60),
    insuranceAmount: decimalString({ min: 0, label: "L'assurance" }),
    otherFeesLabel: optionalText(60),
    otherFeesAmount: decimalString({ min: 0, label: 'Les autres frais' }),

    vatMode: vatModeSchema.default('NONE'),
    vatRate: decimalString({ min: 0, label: 'Le taux de TVA' }),

    stampDutyLabel: optionalText(60),
    stampDutyAmount: decimalString({ min: 0, label: 'Le timbre fiscal' }),

    notes: optionalText(2000),
    priceBreakdownNote: optionalText(400),

    items: z.array(invoiceItemSchema).min(1, 'La facture doit comporter au moins une ligne'),
  })
  .refine(
    (data) => !data.dueDate || data.dueDate >= data.date,
    { message: "La date d'échéance ne peut pas précéder la date de facture", path: ['dueDate'] },
  )
  .refine(
    (data) => data.vatMode !== 'RATE' || Number(data.vatRate) > 0,
    { message: 'Indiquez un taux de TVA supérieur à 0', path: ['vatRate'] },
  )
  .refine(
    (data) => data.currencyCode === 'TND' || Number(data.exchangeRateTnd) > 0,
    {
      message:
        'Indiquez le taux de change vers le dinar. Il sera figé sur cette facture et ne bougera plus.',
      path: ['exchangeRateTnd'],
    },
  )

export type InvoiceInput = z.infer<typeof invoiceSchema>
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>
