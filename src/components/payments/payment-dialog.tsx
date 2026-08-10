'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { createPayment } from '@/actions/payment.actions'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { PAYMENT_METHOD_LABELS, formatMoney, toDateInputValue } from '@/lib/format'
import { type PaymentInput, paymentSchema } from '@/validations/payment'

export function PaymentDialog({
  invoiceId,
  currencyCode,
  remaining,
  disabled,
}: {
  invoiceId: string
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
  } = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      invoiceId,
      amount: remaining,
      date: toDateInputValue(new Date()),
      method: 'BANK_TRANSFER',
      reference: '',
      note: '',
    },
  })

  async function onSubmit(values: PaymentInput) {
    const result = await createPayment(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Règlement enregistré.')
    setOpen(false)
    reset({ invoiceId, amount: '0', date: toDateInputValue(new Date()), method: 'BANK_TRANSFER', reference: '', note: '' })
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
          <DialogTitle>Nouveau règlement</DialogTitle>
          <DialogDescription>
            Solde restant dû : {formatMoney(remaining, currencyCode)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <input type="hidden" {...register('invoiceId')} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Montant (${currencyCode})`} htmlFor="amount" required error={errors.amount?.message}>
              <Input id="amount" inputMode="decimal" autoFocus {...register('amount')} />
            </Field>
            <Field label="Date" htmlFor="date" required error={errors.date?.message}>
              <Input id="date" type="date" {...register('date')} />
            </Field>
            <Field label="Méthode" htmlFor="method" error={errors.method?.message}>
              <Select id="method" {...register('method')}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Référence" htmlFor="reference" error={errors.reference?.message}>
              <Input id="reference" placeholder="N° de virement, chèque…" {...register('reference')} />
            </Field>
            <Field label="Note" htmlFor="note" error={errors.note?.message} className="sm:col-span-2">
              <Textarea id="note" rows={2} {...register('note')} />
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
