'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Coins, Plus } from 'lucide-react'
import { deleteExchangeRate, saveExchangeRate } from '@/actions/exchange.actions'
import { DeleteButton } from '@/components/shared/delete-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/format'

export interface RateListItem {
  id: string
  currencyCode: string
  rateToTnd: string
  validFrom: Date
  source: string
  note: string
}

/**
 * Gestion des taux de change de reference.
 *
 * Ces taux ne servent qu'a pre-remplir les formulaires. Les factures deja
 * enregistrees portent leur propre taux et ne sont jamais recalculees ici.
 */
export function ExchangeRatesPanel({
  rates,
  currencies,
  canEdit,
}: {
  rates: RateListItem[]
  currencies: Array<{ code: string; name: string }>
  canEdit: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = React.useState(false)

  const convertible = currencies.filter((c) => c.code !== 'TND')

  const [form, setForm] = React.useState({
    currencyCode: convertible[0]?.code ?? 'EUR',
    rateToTnd: '',
    validFrom: new Date().toISOString().slice(0, 10),
    source: 'BCT',
    note: '',
  })

  async function submit() {
    setLoading(true)
    const result = await saveExchangeRate(form)
    setLoading(false)
    if (result.ok) {
      toast.success(result.message ?? 'Taux enregistré.')
      setForm((f) => ({ ...f, rateToTnd: '', note: '' }))
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Taux de change</CardTitle>
        <CardDescription>
          Valeur d&apos;une unité de devise en dinars, à partir d&apos;une date donnée. Sert à
          pré-remplir les factures. Les documents déjà enregistrés gardent le taux qui leur a été
          appliqué : modifier un taux ici ne réécrit jamais un bilan passé.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {canEdit ? (
          <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Devise" htmlFor="rate-currency">
              <Select
                id="rate-currency"
                value={form.currencyCode}
                onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))}
              >
                {convertible.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="1 unité = ? TND" htmlFor="rate-value">
              <Input
                id="rate-value"
                inputMode="decimal"
                placeholder="3.350"
                value={form.rateToTnd}
                onChange={(e) => setForm((f) => ({ ...f, rateToTnd: e.target.value }))}
              />
            </Field>

            <Field label="À partir du" htmlFor="rate-from">
              <Input
                id="rate-from"
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              />
            </Field>

            <Field label="Source" htmlFor="rate-source">
              <Input
                id="rate-source"
                placeholder="BCT"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              />
            </Field>

            <div className="flex items-end">
              <Button type="button" onClick={submit} loading={loading} className="w-full">
                <Plus className="h-4 w-4" />
                Enregistrer
              </Button>
            </div>
          </div>
        ) : null}

        {rates.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="Aucun taux enregistré"
            description="Tant qu'aucun taux n'est saisi, les factures en devise ne sont pas converties et n'entrent pas dans le bilan consolidé."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Devise</TableHead>
                <TableHead className="text-right">Taux en TND</TableHead>
                <TableHead>À partir du</TableHead>
                <TableHead>Source</TableHead>
                {canEdit ? <TableHead className="w-16" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell className="font-medium">{rate.currencyCode}</TableCell>
                  <TableCell className="text-right tabular">{rate.rateToTnd}</TableCell>
                  <TableCell>{formatDate(rate.validFrom)}</TableCell>
                  <TableCell className="text-muted-foreground">{rate.source || '—'}</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <DeleteButton
                        action={() => deleteExchangeRate(rate.id)}
                        title="Supprimer ce taux ?"
                        description="Les factures déjà enregistrées ne seront pas modifiées : elles conservent le taux qui leur a été appliqué."
                        size="icon"
                        variant="ghost"
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
