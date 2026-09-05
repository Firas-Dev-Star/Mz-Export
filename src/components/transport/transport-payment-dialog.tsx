'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { createTransportPayment, deleteTransportPayment } from '@/actions/transport.actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { PAYMENT_METHOD_LABELS, formatMoney, toDateInputValue } from '@/lib/format'
import { type TransportPaymentInput, transportPaymentSchema } from '@/validations/transport'

export function TransportPaymentDialog({
  transportInvoiceId,
  currencyCode,
  remaining,
  disabled,
}: {
  transportInvoiceId: string
  currencyCode: string
  remaining: string
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransportPaymentInput>({
    resolver: zodResolver(transportPaymentSchema),
    defaultValues: {
      transportInvoiceId,
      amount: remaining,
      date: toDateInputValue(new Date()),
      method: 'BANK_TRANSFER',
      reference: '',
      note: '',
    },
  })

  async function onSubmit(values: TransportPaymentInput) {
    const result = await createTransportPayment(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Règlement enregistré.')
    setOpen(false)
    reset({
      transportInvoiceId,
      amount: '0',
      date: toDateInputValue(new Date()),
      method: 'BANK_TRANSFER',
      reference: '',
      note: '',
    })
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
          <DialogTitle>Règlement du transporteur</DialogTitle>
          <DialogDescription>
            Solde restant dû : {formatMoney(remaining, currencyCode)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <input type="hidden" {...register('transportInvoiceId')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`Montant (${currencyCode})`}
              htmlFor="tp-amount"
              required
              error={errors.amount?.message}
            >
              <Input id="tp-amount" inputMode="decimal" autoFocus {...register('amount')} />
            </Field>
            <Field label="Date" htmlFor="tp-date" required error={errors.date?.message}>
              <Input id="tp-date" type="date" {...register('date')} />
            </Field>
            <Field label="Méthode" htmlFor="tp-method" error={errors.method?.message}>
              <Select id="tp-method" {...register('method')}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Référence" htmlFor="tp-reference" error={errors.reference?.message}>
              <Input id="tp-reference" {...register('reference')} />
            </Field>
            <Field
              label="Note"
              htmlFor="tp-note"
              error={errors.note?.message}
              className="sm:col-span-2"
            >
              <Textarea id="tp-note" rows={2} {...register('note')} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteTransportPaymentButton({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await deleteTransportPayment(paymentId)
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
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Supprimer le règlement"
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Supprimer ce règlement ?"
        description="Le solde et le statut de la facture de transport seront recalculés."
        loading={loading}
        onConfirm={run}
      />
    </>
  )
}
