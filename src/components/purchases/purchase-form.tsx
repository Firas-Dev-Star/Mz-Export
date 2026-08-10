'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Plus, Save, Trash2 } from 'lucide-react'
import { createPurchase, updatePurchase } from '@/actions/purchase.actions'
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
import { type PurchaseInput, purchaseSchema } from '@/validations/purchase'

export interface SupplierOption {
  id: string
  companyName: string
  paymentTerms: string
  currencyCode: string
}

export interface PurchaseProductOption {
  id: string
  reference: string
  designation: string
  unit: string
  purchasePriceTnd: string
}

/** Taux de TVA tunisiens usuels. */
const VAT_PRESETS = ['19', '13', '7']

/** Les achats sont en dinars : 3 décimales. */
const DECIMALS = 3

const EMPTY_ITEM = {
  productId: '',
  reference: '',
  designation: '',
  description: '',
  unit: '',
  quantity: '1',
  unitPrice: '0',
  discountPercent: '0',
}

export function PurchaseForm({
  purchaseId,
  defaultValues,
  suppliers,
  products,
  currencies,
  canConfirm,
}: {
  purchaseId?: string
  defaultValues: PurchaseInput
  suppliers: SupplierOption[]
  products: PurchaseProductOption[]
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
  } = useForm<PurchaseInput>({ resolver: zodResolver(purchaseSchema), defaultValues })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watched = useWatch({ control })

  const currencyCode = watched.currencyCode ?? 'TND'
  const items = React.useMemo(
    () => (watched.items ?? []) as PurchaseInput['items'],
    [watched.items],
  )

  const totals = React.useMemo(
    () =>
      computeInvoiceTotals({
        items: items.map((i) => ({
          quantity: i?.quantity ?? 0,
          unitPrice: i?.unitPrice ?? 0,
          discountPercent: i?.discountPercent ?? 0,
        })),
        feesIncluded: false,
        shippingAmount: watched.shippingAmount,
        otherFeesAmount: watched.otherFeesAmount,
        vatMode: (watched.vatMode ?? 'RATE') as 'NONE' | 'ZERO' | 'RATE',
        vatRate: watched.vatRate,
        stampDutyAmount: watched.stampDutyAmount,
        decimals: DECIMALS,
      }),
    [items, watched.shippingAmount, watched.otherFeesAmount, watched.vatMode, watched.vatRate, watched.stampDutyAmount],
  )

  function onSupplierChange(id: string) {
    const supplier = suppliers.find((s) => s.id === id)
    if (!supplier) return
    if (!getValues('paymentTerms')) setValue('paymentTerms', supplier.paymentTerms)
    if (supplier.currencyCode) setValue('currencyCode', supplier.currencyCode)
  }

  function onProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    setValue(`items.${index}.reference`, product.reference)
    setValue(`items.${index}.designation`, product.designation)
    setValue(`items.${index}.unit`, product.unit)
    if (dec(product.purchasePriceTnd).greaterThan(0)) {
      setValue(`items.${index}.unitPrice`, product.purchasePriceTnd)
    }
  }

  async function submit(values: PurchaseInput, confirm: boolean) {
    setPendingAction(confirm ? 'confirm' : 'draft')
    const result = purchaseId
      ? await updatePurchase(purchaseId, values)
      : await createPurchase(values, { confirm })
    setPendingAction(null)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) setError(field as keyof PurchaseInput, { message: messages[0] })
        }
      }
      toast.error(result.error)
      return
    }

    toast.success(result.message ?? 'Enregistré.')
    const id = purchaseId ?? (result.data as { id: string } | undefined)?.id
    router.push(id ? `/purchases/${id}` : '/purchases')
    router.refresh()
  }

  const itemErrors = errors.items

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit((v) => submit(v, false))}>
      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
          <CardDescription>Les achats sont libellés en dinars tunisiens (3 décimales).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Fournisseur" htmlFor="supplierId" required error={errors.supplierId?.message} className="sm:col-span-2">
            <Select
              id="supplierId"
              {...register('supplierId', { onChange: (e) => onSupplierChange(e.target.value) })}
              aria-invalid={Boolean(errors.supplierId)}
            >
              <option value="">— Sélectionner un fournisseur —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
            </Select>
          </Field>
          <Field label="N° de facture fournisseur" htmlFor="supplierReference" error={errors.supplierReference?.message}>
            <Input id="supplierReference" {...register('supplierReference')} />
          </Field>
          <Field label="Devise" htmlFor="currencyCode" required error={errors.currencyCode?.message}>
            <Select id="currencyCode" {...register('currencyCode')}>
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </Select>
          </Field>
          <Field label="Date" htmlFor="date" required error={errors.date?.message}>
            <Input id="date" type="date" {...register('date')} />
          </Field>
          <Field label="Échéance" htmlFor="dueDate" error={errors.dueDate?.message}>
            <Input id="dueDate" type="date" {...register('dueDate')} />
          </Field>
          <Field label="Conditions de paiement" htmlFor="paymentTerms" error={errors.paymentTerms?.message} className="sm:col-span-2">
            <Input id="paymentTerms" placeholder="Virement 30 jours" {...register('paymentTerms')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lignes de l&apos;achat</CardTitle>
          <CardDescription>
            Les lignes rattachées à un produit alimenteront le stock à la validation de la facture.
          </CardDescription>
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
                      {...register(`items.${index}.productId`, { onChange: (e) => onProductChange(index, e.target.value) })}
                    >
                      <option value="">— Ligne libre (hors stock) —</option>
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
                    className="lg:col-span-5"
                  >
                    <Input id={`items.${index}.designation`} {...register(`items.${index}.designation`)} />
                  </Field>
                  <Field label="Unité" htmlFor={`items.${index}.unit`} className="lg:col-span-1">
                    <Input id={`items.${index}.unit`} placeholder="KG" {...register(`items.${index}.unit`)} />
                  </Field>
                  <div className="flex items-end justify-end lg:col-span-1">
                    <Button
                      type="button" variant="ghost" size="icon"
                      onClick={() => remove(index)} disabled={fields.length === 1}
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-12">
                  <Field label="Quantité" htmlFor={`items.${index}.quantity`} required error={rowError?.quantity?.message} className="lg:col-span-3">
                    <Input id={`items.${index}.quantity`} inputMode="decimal" {...register(`items.${index}.quantity`)} />
                  </Field>
                  <Field label={`Prix unitaire (${currencyCode})`} htmlFor={`items.${index}.unitPrice`} required error={rowError?.unitPrice?.message} className="lg:col-span-3">
                    <Input id={`items.${index}.unitPrice`} inputMode="decimal" {...register(`items.${index}.unitPrice`)} />
                  </Field>
                  <Field label="Remise (%)" htmlFor={`items.${index}.discountPercent`} error={rowError?.discountPercent?.message} className="lg:col-span-3">
                    <Input id={`items.${index}.discountPercent`} inputMode="decimal" {...register(`items.${index}.discountPercent`)} />
                  </Field>
                  <div className="lg:col-span-3">
                    <p className="text-sm font-medium text-navy-800">Total ligne</p>
                    <p className="tabular mt-2 text-lg font-semibold text-navy-800">
                      {formatMoney(line.total, currencyCode)}
                    </p>
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
          <CardHeader><CardTitle>Frais, TVA et timbre</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`${watched.shippingLabel || 'Transport'} (${currencyCode})`} htmlFor="shippingAmount" error={errors.shippingAmount?.message}>
                <Input id="shippingAmount" inputMode="decimal" {...register('shippingAmount')} />
              </Field>
              <Field label={`${watched.otherFeesLabel || 'Autres frais'} (${currencyCode})`} htmlFor="otherFeesAmount" error={errors.otherFeesAmount?.message}>
                <Input id="otherFeesAmount" inputMode="decimal" {...register('otherFeesAmount')} />
              </Field>
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
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Libellé du timbre" htmlFor="stampDutyLabel" error={errors.stampDutyLabel?.message}>
                <Input id="stampDutyLabel" {...register('stampDutyLabel')} />
              </Field>
              <Field label={`Timbre fiscal (${currencyCode})`} htmlFor="stampDutyAmount" error={errors.stampDutyAmount?.message}>
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
          <CardHeader><CardTitle>Récapitulatif</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Total des lignes</span>
              <span className="tabular font-medium">{formatMoney(totals.goodsTotal, currencyCode)}</span>
            </div>
            {totals.discountTotal.greaterThan(0) ? (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Dont remises</span>
                <span className="tabular">− {formatMoney(totals.discountTotal, currencyCode)}</span>
              </div>
            ) : null}
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Frais</span>
              <span className="tabular">+ {formatMoney(totals.feesTotal, currencyCode)}</span>
            </div>
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
          <Link href={purchaseId ? `/purchases/${purchaseId}` : '/purchases'}>Annuler</Link>
        </Button>
        <Button type="submit" variant={purchaseId ? 'default' : 'secondary'} loading={pendingAction === 'draft'}>
          <Save className="h-4 w-4" />
          {purchaseId ? 'Enregistrer' : 'Enregistrer le brouillon'}
        </Button>
        {!purchaseId && canConfirm ? (
          <Button type="button" loading={pendingAction === 'confirm'} onClick={handleSubmit((v) => submit(v, true))}>
            <CheckCircle2 className="h-4 w-4" />
            Valider et entrer en stock
          </Button>
        ) : null}
      </div>
    </form>
  )
}
