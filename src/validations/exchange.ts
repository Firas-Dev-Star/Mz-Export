import { z } from 'zod'
import { dateString, decimalString, optionalText } from '@/validations/common'

export const exchangeRateSchema = z.object({
  currencyCode: z
    .string()
    .trim()
    .min(1, 'La devise est obligatoire')
    .max(3, 'Code devise invalide')
    .refine((v) => v !== 'TND', 'Le dinar est la devise de reference : il ne se convertit pas.'),
  rateToTnd: decimalString({ min: 0.000001, label: 'Le taux' }).refine(
    (v) => Number(v) <= 100000,
    'Taux manifestement errone. Verifiez le sens : 1 unite de devise = X dinars.',
  ),
  validFrom: dateString("La date d'entree en vigueur"),
  source: optionalText(60),
  note: optionalText(200),
})

export type ExchangeRateInput = z.infer<typeof exchangeRateSchema>
