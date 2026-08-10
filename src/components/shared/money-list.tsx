import { formatMoney } from '@/lib/format'

/**
 * Affiche une liste de montants par devise.
 * Ne fusionne jamais deux devises dans un total unique.
 */
export function MoneyList({ totals, fallbackCurrency = 'EUR' }: {
  totals: Array<{ currencyCode: string; amount: string }>
  fallbackCurrency?: string
}) {
  if (totals.length === 0) return <>{formatMoney(0, fallbackCurrency)}</>
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      {totals.map((t, i) => (
        <span key={t.currencyCode}>
          {formatMoney(t.amount, t.currencyCode)}
          {i < totals.length - 1 ? <span className="text-muted-foreground"> + </span> : null}
        </span>
      ))}
    </span>
  )
}
