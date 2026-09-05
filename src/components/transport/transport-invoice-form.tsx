'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Save } from 'lucide-react'
import { createTransportInvoice, updateTransportInvoice } from '@/actions/transport.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { VAT_MODE_LABELS, formatDate, formatMoney } from '@/lib/format'
import { computeInvoiceTotals } from '@/lib/invoice-totals'
import { dec } from '@/lib/money'
import { type TransportInvoiceInput, transportInvoiceSchema } from '@/validations/transport'

export interface CarrierOption {
  id: string
  code: string
  companyName: string
  currencyCode: string
  paymentTerms: string
}

export interface SaleOption {
  id: string
  number: string
  date: Date
  currencyCode: string
  netToPay: string
  customerName: string
}

/** Taux de TVA tunisiens usuels. */
const VAT_PRESETS = ['19', '13', '7']

/** Le transport est facturé en dinars : 3 décimales. */
const DECIMALS = 3

export function TransportInvoiceForm({
  transportInvoiceId,
  defaultValues,
  carriers,
  sales,
  currencies,
  canConfirm,
}: {
  transportInvoiceId?: string
  defaultValues: TransportInvoiceInput
  carriers: CarrierOption[]
  sales: SaleOption[]
  currencies: Array<{ code: string; name: string }>
  canConfirm: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pendingAction, setPendingAction] = React.useState<'draft' | 'confirm' | null>(null)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    formState: { errors },
  } = useForm<TransportInvoiceInput>({
    resolver: zodResolver(transportInvoiceSchema),
    defaultValues,
  })

  const watched = useWatch({ control })
  const currencyCode = watched.currencyCode ?? 'TND'

  const totals = React.useMemo(
    () =>
      computeInvoiceTotals({
        items: [],
        feesIncluded: false,
        shippingAmount: watched.transportAmount,
        transitAmount: watched.transitAmount,
        otherFeesAmount: watched.otherFeesAmount,
        vatMode: (watched.vatMode ?? 'NONE') as 'NONE' | 'ZERO' | 'RATE',
        vatRate: watched.vatRate,
        stampDutyAmount: watched.stampDutyAmount,
        decimals: DECIMALS,
      }),
    [
      watched.transportAmount,
      watched.transitAmount,
      watched.otherFeesAmount,
      watched.vatMode,
      watched.vatRate,
      watched.stampDutyAmount,
    ],
  )

  function onCarrierChange(id: string) {
    const carrier = carriers.find((c) => c.id === id)
    if (!carrier) return
    if (!getValues('paymentTerms')) setValue('paymentTerms', carrier.paymentTerms)
    if (carrier.currencyCode) setValue('currencyCode', carrier.currencyCode)
  }

  /**
   * Choisir la vente renseigne la référence d'expédition si elle est vide :
   * le numéro de la facture couverte est le repère le plus sûr.
   */
  function onSaleChange(id: string) {
    const sale = sales.find((s) => s.id === id)
    if (!sale) return
    if (!getValues('shipmentRef')) setValue('shipmentRef', sale.number)
  }

  async function submit(values: TransportInvoiceInput, confirm: boolean) {
    setPendingAction(confirm ? 'confirm' : 'draft')
    const result = transportInvoiceId
      ? await updateTransportInvoice(transportInvoiceId, values)
      : await createTransportInvoice(values, { confirm })
    setPendingAction(null)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) setError(field as keyof TransportInvoiceInput, { message: messages[0] })
        }
      }
      toast.error(result.error)
      return
    }

    toast.success(result.message ?? 'Enregistré.')
    const id = transportInvoiceId ?? (result.data as { id: string } | undefined)?.id
    router.push(id ? `/transport/${id}` : '/transport')
    router.refresh()
  }

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit((v) => submit(v, false))}>
      <Card>
        <CardHeader>
          <CardTitle>Le transporteur et l&apos;expédition</CardTitle>
          <CardDescription>
            Une facture de transport se rattache à une expédition, donc à une facture de vente.
            Le rattachement peut être fait plus tard si la vente n&apos;est pas encore saisie.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Transporteur"
            htmlFor="carrierId"
            required
            error={errors.carrierId?.message}
            className="sm:col-span-2"
          >
            <Select
              id="carrierId"
              {...register('carrierId', { onChange: (e) => onCarrierChange(e.target.value) })}
              aria-invalid={Boolean(errors.carrierId)}
            >
              <option value="">— Sélectionner un transporteur —</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="N° de facture du transporteur"
            htmlFor="carrierReference"
            error={errors.carrierReference?.message}
          >
            <Input id="carrierReference" {...register('carrierReference')} />
          </Field>
          <Field label="Devise" htmlFor="currencyCode" required error={errors.currencyCode?.message}>
            <Select id="currencyCode" {...register('currencyCode')}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="date" required error={errors.date?.message}>
            <Input id="date" type="date" {...register('date')} />
          </Field>
          <Field label="Échéance" htmlFor="dueDate" error={errors.dueDate?.message}>
            <Input id="dueDate" type="date" {...register('dueDate')} />
          </Field>
          <Field
            label="Référence de l'expédition"
            htmlFor="shipmentRef"
            error={errors.shipmentRef?.message}
            hint="Telle que le transporteur la désigne : « wida 21 », « SEMI 14 »."
          >
            <Input id="shipmentRef" {...register('shipmentRef')} />
          </Field>
          <Field
            label="Facture de vente couverte"
            htmlFor="invoiceId"
            error={errors.invoiceId?.message}
            hint="Facultatif — sert à calculer la marge réelle de l'expédition."
          >
            <Select
              id="invoiceId"
              {...register('invoiceId', { onChange: (e) => onSaleChange(e.target.value) })}
            >
              <option value="">— Non rattachée —</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number} — {s.customerName} ({formatDate(s.date)})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Conditions de paiement"
            htmlFor="paymentTerms"
            error={errors.paymentTerms?.message}
            className="sm:col-span-2"
          >
            <Input id="paymentTerms" placeholder="Virement 30 jours" {...register('paymentTerms')} />
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Montants</CardTitle>
            <CardDescription>
              Pas de lignes d&apos;articles : une facture de transport porte un acheminement,
              pas de la marchandise. Rien n&apos;entre en stock.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Libellé du transport" htmlFor="transportLabel" error={errors.transportLabel?.message}>
                <Input id="transportLabel" placeholder="Transport" {...register('transportLabel')} />
              </Field>
              <Field
                label={`Montant du transport (${currencyCode})`}
                htmlFor="transportAmount"
                required
                error={errors.transportAmount?.message}
              >
                <Input id="transportAmount" inputMode="decimal" {...register('transportAmount')} />
              </Field>
              <Field label="Libellé du transit" htmlFor="transitLabel" error={errors.transitLabel?.message}>
                <Input id="transitLabel" placeholder="Transit et douane" {...register('transitLabel')} />
              </Field>
              <Field
                label={`Montant du transit (${currencyCode})`}
                htmlFor="transitAmount"
                error={errors.transitAmount?.message}
              >
                <Input id="transitAmount" inputMode="decimal" {...register('transitAmount')} />
              </Field>
              <Field label="Libellé des autres frais" htmlFor="otherFeesLabel" error={errors.otherFeesLabel?.message}>
                <Input id="otherFeesLabel" placeholder="Autres frais" {...register('otherFeesLabel')} />
              </Field>
              <Field
                label={`Autres frais (${currencyCode})`}
                htmlFor="otherFeesAmount"
                error={errors.otherFeesAmount?.message}
              >
                <Input id="otherFeesAmount" inputMode="decimal" {...register('otherFeesAmount')} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Régime de TVA" htmlFor="vatMode" error={errors.vatMode?.message}>
                <Select id="vatMode" {...register('vatMode')}>
                  {Object.entries(VAT_MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Taux de TVA (%)" htmlFor="vatRate" error={errors.vatRate?.message}>
                <div className="flex gap-1">
                  <Input
                    id="vatRate"
                    inputMode="decimal"
                    disabled={watched.vatMode !== 'RATE'}
                    {...register('vatRate')}
                  />
                  {VAT_PRESETS.map((rate) => (
                    <Button
                      key={rate}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={watched.vatMode !== 'RATE'}
                      onClick={() => setValue('vatRate', rate, { shouldValidate: true })}
                    >
                      {rate}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field label="Timbre fiscal" htmlFor="stampDutyAmount" error={errors.stampDutyAmount?.message}>
                <div className="flex gap-1">
                  <Input id="stampDutyAmount" inputMode="decimal" {...register('stampDutyAmount')} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setValue('stampDutyAmount', dec(watched.stampDutyAmount).greaterThan(0) ? '0' : '1', {
                        shouldValidate: true,
                      })
                    }
                  >
                    {dec(watched.stampDutyAmount).greaterThan(0) ? 'Retirer' : '+ 1'}
                  </Button>
                </div>
              </Field>
            </div>

            <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
              <Textarea id="notes" rows={2} {...register('notes')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Récapitulatif</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">{watched.transportLabel || 'Transport'}</span>
              <span className="tabular font-medium">{formatMoney(totals.shippingAmount, currencyCode)}</span>
            </div>
            {totals.transitAmount.greaterThan(0) ? (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">{watched.transitLabel || 'Transit et douane'}</span>
                <span className="tabular">{formatMoney(totals.transitAmount, currencyCode)}</span>
              </div>
            ) : null}
            {totals.otherFeesAmount.greaterThan(0) ? (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">{watched.otherFeesLabel || 'Autres frais'}</span>
                <span className="tabular">{formatMoney(totals.otherFeesAmount, currencyCode)}</span>
              </div>
            ) : null}
            <div className="my-2 border-t border-border" />
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Total HT</span>
              <span className="tabular font-medium">{formatMoney(totals.totalHt, currencyCode)}</span>
            </div>
            {watched.vatMode !== 'NONE' ? (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">TVA</span>
                <span className="tabular">{formatMoney(totals.vatAmount, currencyCode)}</span>
              </div>
            ) : null}
            {totals.stampDutyAmount.greaterThan(0) ? (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">{watched.stampDutyLabel || 'Timbre fiscal'}</span>
                <span className="tabular">{formatMoney(totals.stampDutyAmount, currencyCode)}</span>
              </div>
            ) : null}
            <div className="flex justify-between rounded-md bg-navy-800 px-3 py-2 text-white">
              <span className="font-medium">Net à payer</span>
              <span className="tabular font-semibold">{formatMoney(totals.netToPay, currencyCode)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" asChild>
          <Link href={transportInvoiceId ? `/transport/${transportInvoiceId}` : '/transport'}>Annuler</Link>
        </Button>
        <Button
          type="submit"
          variant={transportInvoiceId ? 'default' : 'secondary'}
          loading={pendingAction === 'draft'}
        >
          <Save className="h-4 w-4" />
          {transportInvoiceId ? 'Enregistrer' : 'Enregistrer le brouillon'}
        </Button>
        {!transportInvoiceId && canConfirm ? (
          <Button
            type="button"
            loading={pendingAction === 'confirm'}
            onClick={handleSubmit((v) => submit(v, true))}
          >
            <CheckCircle2 className="h-4 w-4" />
            Valider la facture
          </Button>
        ) : null}
      </div>
    </form>
  )
}
