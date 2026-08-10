'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { createPurchasePayment, deletePurchasePayment } from '@/actions/purchase.actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { PAYMENT_METHOD_LABELS, formatMoney, toDateInputValue } from '@/lib/format'
import { type PurchasePaymentInput, purchasePaymentSchema } from '@/validations/purchase'

export function PurchasePaymentDialog({
  purchaseId, currencyCode, remaining, disabled,
}: {
  purchaseId: string
  currencyCode: string
  remaining: string
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  const {
    register, handleSubmit, reset,
    formState: { errors, isSubmitting },
  } = useForm<PurchasePaymentInput>({
    resolver: zodResolver(purchasePaymentSchema),
    defaultValues: {
      purchaseId, amount: remaining, date: toDateInputValue(new Date()),
      method: 'BANK_TRANSFER', reference: '', note: '',
    },
  })

  async function onSubmit(values: PurchasePaymentInput) {
    const result = await createPurchasePayment(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Règlement enregistré.')
    setOpen(false)
    reset({ purchaseId, amount: '0', date: toDateInputValue(new Date()), method: 'BANK_TRANSFER', reference: '', note: '' })
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Plus className="h-4 w-4" />
          Enregistrer un règlement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Règlement fournisseur</DialogTitle>
          <DialogDescription>Solde restant dû : {formatMoney(remaining, currencyCode)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <input type="hidden" {...register('purchaseId')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Montant (${currencyCode})`} htmlFor="pa-amount" required error={errors.amount?.message}>
              <Input id="pa-amount" inputMode="decimal" autoFocus {...register('amount')} />
            </Field>
            <Field label="Date" htmlFor="pa-date" required error={errors.date?.message}>
              <Input id="pa-date" type="date" {...register('date')} />
            </Field>
            <Field label="Méthode" htmlFor="pa-method" error={errors.method?.message}>
              <Select id="pa-method" {...register('method')}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Référence" htmlFor="pa-reference" error={errors.reference?.message}>
              <Input id="pa-reference" {...register('reference')} />
            </Field>
            <Field label="Note" htmlFor="pa-note" error={errors.note?.message} className="sm:col-span-2">
              <Textarea id="pa-note" rows={2} {...register('note')} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" loading={isSubmitting}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeletePurchasePaymentButton({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await deletePurchasePayment(paymentId)
    setLoading(false)
    setOpen(false)
    if (result.ok) {
      toast.success(result.message ?? 'Règlement supprimé.')
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Supprimer le règlement">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Supprimer ce règlement ?"
        description="Le solde et le statut de la facture d'achat seront recalculés."
        loading={loading}
        onConfirm={run}
      />
    </>
  )
}
