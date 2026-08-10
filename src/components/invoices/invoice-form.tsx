'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Plus, Save, Trash2 } from 'lucide-react'
import { createInvoice, updateInvoice } from '@/actions/invoice.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { VAT_MODE_LABELS, formatMoney } from '@/lib/format'
import { computeInvoiceTotals, computeLine } from '@/lib/invoice-totals'
import { dec } from '@/lib/money'
import { amountToFrenchWords } from '@/lib/number-to-words-fr'
import { type InvoiceInput, invoiceSchema } from '@/validations/invoice'

export interface CustomerOption {
  id: string
  companyName: string
  paymentTerms: string
  currencyCode: string
  deliveryAddress: string
  deliveryCountry: string
  country: string
}

export interface ProductOption {
  id: string
  reference: string
  designation: string
  unit: string
  salePriceEur: string
  ngp: string
  originCountry: string
  description: string
}

/** Taux de TVA proposes en raccourci (Tunisie : 19 %, 13 %, 7 %). */
const VAT_PRESETS = ['19', '13', '7']

const EMPTY_ITEM = {
  productId: '',
  reference: '',
  designation: '',
  description: '',
  unit: '',
  quantity: '1',
  unitPrice: '0',
  discountPercent: '0',
  ngp: '',
  originCountry: '',
}

export function InvoiceForm({
  invoiceId,
  defaultValues,
  customers,
  products,
  currencies,
  canConfirm,
  isDraft = true,
}: {
  invoiceId?: string
  defaultValues: InvoiceInput
  customers: CustomerOption[]
  products: ProductOption[]
  currencies: Array<{ code: string; name: string }>
  canConfirm: boolean
  isDraft?: boolean
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
  } = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues,
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watched = useWatch({ control })

  const currencyCode = watched.currencyCode ?? 'EUR'
  const items = React.useMemo(
    () => (watched.items ?? []) as InvoiceInput['items'],
    [watched.items],
  )

  // Apercu des totaux : exactement la meme fonction que celle utilisee
  // cote serveur pour l'enregistrement definitif.
  const totals = React.useMemo(
    () =>
      computeInvoiceTotals({
        items: items.map((i) => ({
          quantity: i?.quantity ?? 0,
          unitPrice: i?.unitPrice ?? 0,
          discountPercent: i?.discountPercent ?? 0,
        })),
        feesIncluded: Boolean(watched.feesIncluded),
        shippingAmount: watched.shippingAmount,
        transitAmount: watched.transitAmount,
        insuranceAmount: watched.insuranceAmount,
        otherFeesAmount: watched.otherFeesAmount,
        vatMode: (watched.vatMode ?? 'NONE') as 'NONE' | 'ZERO' | 'RATE',
        vatRate: watched.vatRate,
        stampDutyAmount: watched.stampDutyAmount,
      }),
    [items, watched.feesIncluded, watched.shippingAmount, watched.transitAmount, watched.insuranceAmount, watched.otherFeesAmount, watched.vatMode, watched.vatRate, watched.stampDutyAmount],
  )

  const feesExceedGoods = Boolean(watched.feesIncluded) && totals.merchandiseAmount.isNegative()

  function onCustomerChange(id: string) {
    const customer = customers.find((c) => c.id === id)
    if (!customer) return
    if (!getValues('paymentTerms')) setValue('paymentTerms', customer.paymentTerms)
    if (!getValues('deliveryAddress')) setValue('deliveryAddress', customer.deliveryAddress)
    if (!getValues('deliveryCountry')) setValue('deliveryCountry', customer.deliveryCountry || customer.country)
    if (customer.currencyCode) setValue('currencyCode', customer.currencyCode)
  }

  function onProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    setValue(`items.${index}.reference`, product.reference)
    setValue(`items.${index}.designation`, product.designation)
    setValue(`items.${index}.unit`, product.unit)
    setValue(`items.${index}.unitPrice`, product.salePriceEur)
    setValue(`items.${index}.ngp`, product.ngp)
    setValue(`items.${index}.originCountry`, product.originCountry)
    if (!getValues('ngp')) setValue('ngp', product.ngp)
    if (!getValues('originCountry')) setValue('originCountry', product.originCountry)
  }

  async function submit(values: InvoiceInput, confirm: boolean) {
    setPendingAction(confirm ? 'confirm' : 'draft')

    const result = invoiceId
      ? await updateInvoice(invoiceId, values)
      : await createInvoice(values, { confirm })

    setPendingAction(null)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) setError(field as keyof InvoiceInput, { message: messages[0] })
        }
      }
      toast.error(result.error)
      return
    }

    toast.success(result.message ?? 'Enregistré.')
    const id = invoiceId ?? (result.data as { id: string } | undefined)?.id
    router.push(id ? `/invoices/${id}` : '/invoices')
    router.refresh()
  }

  const itemErrors = errors.items

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit((v) => submit(v, false))}>
      <Card>
        <CardHeader><CardTitle>Informations générales</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Client" htmlFor="customerId" required error={errors.customerId?.message} className="sm:col-span-2">
            <Select
              id="customerId"
              {...register('customerId', { onChange: (e) => onCustomerChange(e.target.value) })}
              aria-invalid={Boolean(errors.customerId)}
            >
              <option value="">— Sélectionner un client —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date de facture" htmlFor="date" required error={errors.date?.message}>
            <Input id="date" type="date" {...register('date')} />
          </Field>
          <Field label="Date d'échéance" htmlFor="dueDate" error={errors.dueDate?.message}>
            <Input id="dueDate" type="date" {...register('dueDate')} />
          </Field>
          <Field label="Devise" htmlFor="currencyCode" required error={errors.currencyCode?.message}>
            <Select id="currencyCode" {...register('currencyCode')}>
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </Select>
          </Field>
          <Field label="Conditions de paiement" htmlFor="paymentTerms" error={errors.paymentTerms?.message}>
            <Input id="paymentTerms" placeholder="Virement 30 jours" {...register('paymentTerms')} />
          </Field>
          <Field label="Référence commande" htmlFor="orderReference" error={errors.orderReference?.message}>
            <Input id="orderReference" {...register('orderReference')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lignes de la facture</CardTitle>
          <CardDescription>Quantité × prix unitaire, remise éventuelle en pourcentage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {typeof itemErrors?.message === 'string' ? (
            <p className="text-sm font-medium text-destructive">{itemErrors.message}</p>
          ) : null}

          {fields.map((field, index) => {
            const line = computeLine({
              quantity: items[index]?.quantity ?? 0,
              unitPrice: items[index]?.unitPrice ?? 0,
              discountPercent: items[index]?.discountPercent ?? 0,
            })
            const rowError = Array.isArray(itemErrors) ? itemErrors[index] : undefined

            return (
              <div key={field.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="grid gap-3 lg:grid-cols-12">
                  <Field label="Produit" htmlFor={`items.${index}.productId`} className="lg:col-span-3">
                    <Select
                      id={`items.${index}.productId`}
                      {...register(`items.${index}.productId`, {
                        onChange: (e) => onProductChange(index, e.target.value),
                      })}
                    >
                      <option value="">— Ligne libre —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.reference} — {p.designation}</option>)}
                    </Select>
                  </Field>

                  <Field label="Référence" htmlFor={`items.${index}.reference`} className="lg:col-span-2">
                    <Input id={`items.${index}.reference`} {...register(`items.${index}.reference`)} />
                  </Field>

                  <Field
                    label="Désignation"
                    htmlFor={`items.${index}.designation`}
                    required
                    error={rowError?.designation?.message}
                    className="lg:col-span-4"
                  >
                    <Input id={`items.${index}.designation`} {...register(`items.${index}.designation`)} />
                  </Field>

                  <Field label="Unité" htmlFor={`items.${index}.unit`} className="lg:col-span-1">
                    <Input id={`items.${index}.unit`} placeholder="KG" {...register(`items.${index}.unit`)} />
                  </Field>

                  <div className="flex items-end justify-end lg:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-12">
                  <Field label="Quantité" htmlFor={`items.${index}.quantity`} required error={rowError?.quantity?.message} className="lg:col-span-2">
                    <Input id={`items.${index}.quantity`} inputMode="decimal" {...register(`items.${index}.quantity`)} />
                  </Field>
                  <Field label="Prix unitaire" htmlFor={`items.${index}.unitPrice`} required error={rowError?.unitPrice?.message} className="lg:col-span-2">
                    <Input id={`items.${index}.unitPrice`} inputMode="decimal" {...register(`items.${index}.unitPrice`)} />
                  </Field>
                  <Field label="Remise (%)" htmlFor={`items.${index}.discountPercent`} error={rowError?.discountPercent?.message} className="lg:col-span-2">
                    <Input id={`items.${index}.discountPercent`} inputMode="decimal" {...register(`items.${index}.discountPercent`)} />
                  </Field>
                  <Field label="NGP" htmlFor={`items.${index}.ngp`} className="lg:col-span-2">
                    <Input id={`items.${index}.ngp`} {...register(`items.${index}.ngp`)} />
                  </Field>
                  <Field label="Origine" htmlFor={`items.${index}.originCountry`} className="lg:col-span-2">
                    <Input id={`items.${index}.originCountry`} {...register(`items.${index}.originCountry`)} />
                  </Field>
                  <div className="lg:col-span-2">
                    <p className="text-sm font-medium text-navy-800">Total ligne</p>
                    <p className="tabular mt-2 text-lg font-semibold text-navy-800">
                      {formatMoney(line.total, currencyCode)}
                    </p>
                    {line.discount.greaterThan(0) ? (
                      <p className="text-xs text-muted-foreground">Remise {formatMoney(line.discount, currencyCode)}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}

          <Button type="button" variant="outline" onClick={() => append({ ...EMPTY_ITEM })}>
            <Plus className="h-4 w-4" />
            Ajouter une ligne
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Frais et TVA</CardTitle>
            <CardDescription>
              Choisissez si les frais sont compris dans le prix des lignes (cas de la facture MZ EXPORT n° 49)
              ou s&apos;ils s&apos;ajoutent au total marchandise.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Traitement des frais" htmlFor="feesIncluded">
              <Select id="feesIncluded" {...register('feesIncluded', { setValueAs: (v) => v === 'true' || v === true })}>
                <option value="true">Compris dans le prix des lignes (mention informative)</option>
                <option value="false">Ajoutés au total marchandise</option>
              </Select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`${watched.shippingLabel || 'Transport'} (${currencyCode})`} htmlFor="shippingAmount" error={errors.shippingAmount?.message}>
                <Input id="shippingAmount" inputMode="decimal" {...register('shippingAmount')} />
              </Field>
              <Field label={`${watched.transitLabel || 'Transit'} (${currencyCode})`} htmlFor="transitAmount" error={errors.transitAmount?.message}>
                <Input id="transitAmount" inputMode="decimal" {...register('transitAmount')} />
              </Field>
              <Field label={`${watched.insuranceLabel || 'Assurance'} (${currencyCode})`} htmlFor="insuranceAmount" error={errors.insuranceAmount?.message}>
                <Input id="insuranceAmount" inputMode="decimal" {...register('insuranceAmount')} />
              </Field>
              <Field label={`${watched.otherFeesLabel || 'Autres frais'} (${currencyCode})`} htmlFor="otherFeesAmount" error={errors.otherFeesAmount?.message}>
                <Input id="otherFeesAmount" inputMode="decimal" {...register('otherFeesAmount')} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Régime de TVA" htmlFor="vatMode" error={errors.vatMode?.message}>
                <Select id="vatMode" {...register('vatMode')}>
                  {Object.entries(VAT_MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Taux de TVA (%)" htmlFor="vatRate" error={errors.vatRate?.message}>
                <Input id="vatRate" inputMode="decimal" disabled={watched.vatMode !== 'RATE'} {...register('vatRate')} />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Taux courants :</span>
              {VAT_PRESETS.map((rate) => (
                <Button
                  key={rate}
                  type="button"
                  size="sm"
                  variant={watched.vatMode === 'RATE' && String(watched.vatRate) === rate ? 'default' : 'outline'}
                  onClick={() => {
                    setValue('vatMode', 'RATE', { shouldValidate: true })
                    setValue('vatRate', rate, { shouldValidate: true })
                  }}
                >
                  {rate} %
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={watched.vatMode === 'NONE' ? 'default' : 'outline'}
                onClick={() => {
                  setValue('vatMode', 'NONE', { shouldValidate: true })
                  setValue('vatRate', '0', { shouldValidate: true })
                }}
              >
                Exonéré
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Libellé du timbre" htmlFor="stampDutyLabel" error={errors.stampDutyLabel?.message}>
                <Input id="stampDutyLabel" {...register('stampDutyLabel')} />
              </Field>
              <Field
                label={`Timbre fiscal (${currencyCode})`}
                htmlFor="stampDutyAmount"
                error={errors.stampDutyAmount?.message}
                hint="Ajouté après la TVA. 0 = pas de timbre."
              >
                <div className="flex gap-2">
                  <Input id="stampDutyAmount" inputMode="decimal" {...register('stampDutyAmount')} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setValue('stampDutyAmount', dec(watched.stampDutyAmount).greaterThan(0) ? '0' : '1', {
                        shouldValidate: true,
                      })
                    }
                  >
                    {dec(watched.stampDutyAmount).greaterThan(0) ? 'Retirer' : '+ 1 €'}
                  </Button>
                </div>
              </Field>
            </div>

            <Field
              label="Mention de ventilation du prix"
              htmlFor="priceBreakdownNote"
              hint="Laissez vide pour la générer automatiquement à partir des frais saisis."
              error={errors.priceBreakdownNote?.message}
            >
              <Textarea id="priceBreakdownNote" rows={2} {...register('priceBreakdownNote')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Récapitulatif</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {feesExceedGoods ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Les frais dépassent le total des lignes. Vérifiez les montants ou passez en mode
                « Ajoutés au total marchandise ».
              </p>
            ) : null}

            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Total des lignes</span>
              <span className="tabular font-medium">{formatMoney(totals.goodsTotal, currencyCode)}</span>
            </div>
            {totals.discountTotal.greaterThan(0) ? (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Dont remises accordées</span>
                <span className="tabular">− {formatMoney(totals.discountTotal, currencyCode)}</span>
              </div>
            ) : null}
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">
                Marchandise {watched.feesIncluded ? '(hors frais)' : ''}
              </span>
              <span className="tabular">{formatMoney(totals.merchandiseAmount, currencyCode)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Frais annexes</span>
              <span className="tabular">
                {watched.feesIncluded ? 'inclus · ' : '+ '}
                {formatMoney(totals.feesTotal, currencyCode)}
              </span>
            </div>

            <div className="my-2 border-t border-border" />

            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Total HTVA</span>
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
            <p className="pt-2 text-xs italic text-muted-foreground">
              Arrêtée la présente facture à la somme de : {amountToFrenchWords(totals.netToPay, currencyCode)}.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Livraison et informations export</CardTitle>
          <CardDescription>Ces données figurent sur le PDF de la facture.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Adresse de livraison" htmlFor="deliveryAddress" error={errors.deliveryAddress?.message} className="sm:col-span-2">
            <Textarea id="deliveryAddress" rows={3} {...register('deliveryAddress')} />
          </Field>
          <Field label="Pays de destination" htmlFor="deliveryCountry" error={errors.deliveryCountry?.message}>
            <Input id="deliveryCountry" {...register('deliveryCountry')} />
          </Field>
          <Field label="Destination" htmlFor="destination" error={errors.destination?.message}>
            <Input id="destination" {...register('destination')} />
          </Field>
          <Field label="NGP (facture)" htmlFor="ngp" error={errors.ngp?.message}>
            <Input id="ngp" {...register('ngp')} />
          </Field>
          <Field label="Origine" htmlFor="originCountry" error={errors.originCountry?.message}>
            <Input id="originCountry" {...register('originCountry')} />
          </Field>
          <Field label="Nombre de colis" htmlFor="packageCount" error={errors.packageCount?.message}>
            <Input id="packageCount" type="number" min={0} {...register('packageCount')} />
          </Field>
          <Field label="Type de colis" htmlFor="packageType" error={errors.packageType?.message}>
            <Input id="packageType" placeholder="COLIS" {...register('packageType')} />
          </Field>
          <Field label="Dimensions" htmlFor="packageDimensions" error={errors.packageDimensions?.message} hint="Ex. 60x40x40">
            <Input id="packageDimensions" {...register('packageDimensions')} />
          </Field>
          <Field label="Poids brut (kg)" htmlFor="grossWeightKg" error={errors.grossWeightKg?.message}>
            <Input id="grossWeightKg" inputMode="decimal" {...register('grossWeightKg')} />
          </Field>
          <Field label="Poids net (kg)" htmlFor="netWeightKg" error={errors.netWeightKg?.message}>
            <Input id="netWeightKg" inputMode="decimal" {...register('netWeightKg')} />
          </Field>
          <Field label="Incoterm" htmlFor="incoterm" error={errors.incoterm?.message} hint="Ex. DDP">
            <Input id="incoterm" {...register('incoterm')} />
          </Field>
          <Field label="Mode de transport" htmlFor="transportMode" error={errors.transportMode?.message}>
            <Input id="transportMode" {...register('transportMode')} />
          </Field>
          <Field label="Port / lieu de départ" htmlFor="departurePort" error={errors.departurePort?.message}>
            <Input id="departurePort" {...register('departurePort')} />
          </Field>
          <Field label="Notes" htmlFor="notes" error={errors.notes?.message} className="sm:col-span-2 lg:col-span-4">
            <Textarea id="notes" rows={2} {...register('notes')} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" asChild>
          <Link href={invoiceId ? `/invoices/${invoiceId}` : '/invoices'}>Annuler</Link>
        </Button>
        <Button type="submit" variant={invoiceId ? 'default' : 'secondary'} loading={pendingAction === 'draft'}>
          <Save className="h-4 w-4" />
          {invoiceId ? 'Enregistrer' : 'Enregistrer le brouillon'}
        </Button>
        {!invoiceId && canConfirm && isDraft ? (
          <Button type="button" loading={pendingAction === 'confirm'} onClick={handleSubmit((v) => submit(v, true))}>
            <CheckCircle2 className="h-4 w-4" />
            Enregistrer et confirmer
          </Button>
        ) : null}
      </div>
    </form>
  )
}
