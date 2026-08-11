'use client'

import * as React from 'react'
import { AlertTriangle, HandCoins, Scale, TrendingUp, Wallet, Warehouse } from 'lucide-react'
import { StatCard } from '@/components/shared/stat-card'
import { BASE_CURRENCY, fromTnd } from '@/lib/exchange'
import { formatMoney } from '@/lib/format'
import type { ConsolidatedTotals } from '@/services/dashboard.service'

const STORAGE_KEY = 'mz.dashboard.displayCurrency'

interface Props {
  totals: ConsolidatedTotals
  /** Taux courants : code devise -> valeur d'une unite en dinars. */
  rates: Record<string, string>
  /** Devises proposees dans le selecteur. */
  currencies: Array<{ code: string; name: string }>
}

/**
 * Bilan consolide, avec choix libre de la devise d'AFFICHAGE.
 *
 * Les montants restent stockes et calcules en dinars, au taux fige de chaque
 * document. Le selecteur ne fait que reexprimer ces totaux : c'est une lecture
 * de confort, pas un recalcul comptable. D'ou l'avertissement affiche des que
 * l'on quitte le dinar.
 */
export function ConsolidatedPanel({ totals, rates, currencies }: Props) {
  const [display, setDisplay] = React.useState(BASE_CURRENCY)

  // Preference persistee : l'admin retrouve son choix d'une session a l'autre.
  React.useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved && rates[saved]) setDisplay(saved)
  }, [rates])

  function choose(code: string) {
    setDisplay(code)
    window.localStorage.setItem(STORAGE_KEY, code)
  }

  // Seules les devises reellement converties sont proposees.
  const options = React.useMemo(
    () =>
      [{ code: BASE_CURRENCY, name: 'Dinar tunisien' }, ...currencies].filter(
        (c, i, arr) =>
          arr.findIndex((x) => x.code === c.code) === i &&
          (c.code === BASE_CURRENCY || Number(rates[c.code] ?? 0) > 0),
      ),
    [currencies, rates],
  )

  const rate = rates[display] ?? '1'
  const isBase = display === BASE_CURRENCY

  /** Reexprime un montant en dinars dans la devise d'affichage choisie. */
  const show = React.useCallback(
    (amountTnd: string) => {
      if (isBase) return formatMoney(amountTnd, BASE_CURRENCY)
      return formatMoney(fromTnd(amountTnd, rate), display)
    },
    [isBase, rate, display],
  )

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Bilan consolidé
        </h2>

        {/* Segmented control : un seul bloc, l'onglet actif se detache en blanc. */}
        <div
          role="radiogroup"
          aria-label="Devise d'affichage"
          className="inline-flex items-center gap-0.5 rounded-lg bg-secondary p-0.5"
        >
          {options.map((c) => {
            const active = c.code === display
            return (
              <button
                key={c.code}
                type="button"
                role="radio"
                aria-checked={active}
                title={c.name}
                onClick={() => choose(c.code)}
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-medium tabular transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-white text-navy-800 shadow-sm'
                    : 'text-muted-foreground hover:text-navy-700',
                ].join(' ')}
              >
                {c.code}
              </button>
            )
          })}
        </div>
      </div>

      {totals.missingRateCount > 0 ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {totals.missingRateCount}{' '}
            {totals.missingRateCount > 1 ? 'factures sont exclues' : 'facture est exclue'} de ce
            bilan : aucun taux de change ne leur a été appliqué. Saisissez leur taux depuis la
            facture, ou un taux de référence dans Paramètres.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={TrendingUp}
          label="Chiffre d'affaires"
          value={show(totals.revenueTnd)}
          secondary={
            totals.currencies.length > 1 ? `Facturé en ${totals.currencies.join(', ')}` : undefined
          }
        />
        <StatCard icon={HandCoins} label="Encaissé" value={show(totals.collectedTnd)} />
        <StatCard icon={Wallet} label="Restant dû" value={show(totals.outstandingTnd)} />
        <StatCard icon={Warehouse} label="Valeur du stock" value={show(totals.stockValueTnd)} />
        <StatCard
          icon={Scale}
          label="Ventes − achats"
          value={show(totals.grossMarginTnd)}
          secondary="Hors stock et charges"
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {isBase ? (
          <>
            Chaque facture est convertie au taux qui lui a été appliqué le jour de son
            enregistrement. Modifier un taux de référence ne change pas ces montants.
          </>
        ) : (
          <>
            <span className="font-medium text-amber-700">Affichage indicatif.</span> Ces montants
            sont les totaux en dinars reconvertis au taux courant du {display} (1 {display} ={' '}
            {rate} {BASE_CURRENCY}). Ils ne correspondent pas à la somme des montants facturés,
            chaque facture ayant son propre taux. Le dinar reste la seule référence comptable.
          </>
        )}
      </p>
    </section>
  )
}
