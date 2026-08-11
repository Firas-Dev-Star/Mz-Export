'use client'

import * as React from 'react'
import { ArrowLeftRight, Lock } from 'lucide-react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { BASE_CURRENCY, fromTnd, toTnd } from '@/lib/exchange'
import { formatMoney } from '@/lib/format'

interface CurrencyConverterProps {
  currencyCode: string
  /** Valeur controlee du taux (branchee sur react-hook-form). */
  rate: string
  onRateChange: (value: string) => void
  /** Net a payer de la facture, dans la devise du document. */
  netToPay: unknown
  /** Taux de reference propose par les parametres, pour le bouton de rappel. */
  suggestedRate?: string
  error?: string
  disabled?: boolean
}

/**
 * Convertisseur devise <-> dinar.
 *
 * Deux usages en un seul bloc :
 *  1. saisir le taux qui sera FIGE sur la facture ;
 *  2. faire un calcul rapide dans les deux sens pendant la negociation,
 *     sans quitter le formulaire (le bloc de calcul n'est jamais enregistre).
 */
export function CurrencyConverter({
  currencyCode,
  rate,
  onRateChange,
  netToPay,
  suggestedRate,
  error,
  disabled,
}: CurrencyConverterProps) {
  const [scratch, setScratch] = React.useState('')
  const [direction, setDirection] = React.useState<'toTnd' | 'fromTnd'>('fromTnd')

  const isBase = currencyCode === BASE_CURRENCY

  const converted = React.useMemo(() => {
    if (isBase) return null
    return toTnd(netToPay, rate)
  }, [isBase, netToPay, rate])

  const scratchResult = React.useMemo(() => {
    if (isBase || !scratch) return null
    return direction === 'fromTnd' ? toTnd(scratch, rate) : fromTnd(scratch, rate)
  }, [isBase, scratch, rate, direction])

  if (isBase) {
    return (
      <p className="text-sm text-muted-foreground">
        Facture libellée en dinars : aucune conversion nécessaire.
      </p>
    )
  }

  const rateIsStale = Boolean(suggestedRate && suggestedRate !== rate)

  return (
    <div className="space-y-4">
      <Field
        label={`Taux de change (1 ${currencyCode} = ? ${BASE_CURRENCY})`}
        htmlFor="exchangeRateTnd"
        required
        error={error}
        hint="Figé sur cette facture. Modifier le taux de référence plus tard ne la changera pas."
      >
        <div className="flex items-center gap-2">
          <Input
            id="exchangeRateTnd"
            inputMode="decimal"
            value={rate}
            disabled={disabled}
            onChange={(e) => onRateChange(e.target.value)}
            placeholder="3.350000"
          />
          {rateIsStale ? (
            <button
              type="button"
              onClick={() => onRateChange(suggestedRate ?? '')}
              className="whitespace-nowrap rounded-md border border-input px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary"
            >
              Taux du jour : {suggestedRate}
            </button>
          ) : null}
        </div>
      </Field>

      {converted ? (
        <div className="rounded-lg border border-border bg-secondary/40 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden />
            Contrevaleur enregistrée sur la facture
          </div>
          <p className="mt-1 text-lg font-semibold tabular">
            {formatMoney(converted, BASE_CURRENCY)}
          </p>
          <p className="text-xs text-muted-foreground">
            soit {formatMoney(netToPay, currencyCode)} au taux de {rate || '—'}
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-dashed border-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Calcul rapide (non enregistré)
          </span>
          <button
            type="button"
            onClick={() => {
              setDirection((d) => (d === 'fromTnd' ? 'toTnd' : 'fromTnd'))
              setScratch('')
            }}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-secondary"
          >
            <ArrowLeftRight className="h-3 w-3" aria-hidden />
            {direction === 'fromTnd'
              ? `${currencyCode} → ${BASE_CURRENCY}`
              : `${BASE_CURRENCY} → ${currencyCode}`}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            value={scratch}
            onChange={(e) => setScratch(e.target.value)}
            placeholder={direction === 'fromTnd' ? `Montant en ${currencyCode}` : 'Montant en dinars'}
            aria-label="Montant à convertir"
          />
          <span className="min-w-28 text-right text-sm font-medium tabular">
            {scratchResult
              ? formatMoney(
                  scratchResult,
                  direction === 'fromTnd' ? BASE_CURRENCY : currencyCode,
                )
              : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
