'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SlidersHorizontal } from 'lucide-react'
import { adjustStock } from '@/actions/stock.actions'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { formatQuantity, toDateInputValue } from '@/lib/format'
import { MOVEMENT_LABELS } from '@/lib/stock-labels'
import { type StockAdjustmentInput, stockAdjustmentSchema } from '@/validations/stock'

const ADJUST_TYPES = ['ADJUST_IN', 'ADJUST_OUT', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN'] as const

export function StockAdjustDialog({
  products,
  productId,
  currentStock,
  unit,
  variant = 'outline',
  label = 'Ajuster le stock',
}: {
  products: Array<{ id: string; reference: string; designation: string; unit: string }>
  productId?: string
  currentStock?: string
  unit?: string
  variant?: 'outline' | 'default' | 'ghost'
  label?: string
}) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StockAdjustmentInput>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      productId: productId ?? '',
      type: 'ADJUST_IN',
      quantity: '1',
      date: toDateInputValue(new Date()),
      note: '',
    },
  })

  async function onSubmit(values: StockAdjustmentInput) {
    const result = await adjustStock(values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Mouvement enregistré.')
    setOpen(false)
    reset({
      productId: productId ?? '',
      type: 'ADJUST_IN',
      quantity: '1',
      date: toDateInputValue(new Date()),
      note: '',
    })
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <SlidersHorizontal className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mouvement de stock manuel</DialogTitle>
          <DialogDescription>
            {currentStock !== undefined
              ? `Stock actuel : ${formatQuantity(currentStock)} ${unit ?? ''}`
              : 'Chaque ajustement est enregistré et tracé dans l’historique.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {productId ? (
            <input type="hidden" {...register('productId')} />
          ) : (
            <Field label="Produit" htmlFor="sa-product" required error={errors.productId?.message}>
              <Select id="sa-product" {...register('productId')}>
                <option value="">— Sélectionner un produit —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.reference} — {p.designation}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type de mouvement" htmlFor="sa-type" required error={errors.type?.message}>
              <Select id="sa-type" {...register('type')}>
                {ADJUST_TYPES.map((type) => (
                  <option key={type} value={type}>{MOVEMENT_LABELS[type]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Quantité" htmlFor="sa-quantity" required error={errors.quantity?.message}>
              <Input id="sa-quantity" inputMode="decimal" {...register('quantity')} />
            </Field>
            <Field label="Date" htmlFor="sa-date" required error={errors.date?.message}>
              <Input id="sa-date" type="date" {...register('date')} />
            </Field>
            <Field label="Motif" htmlFor="sa-note" error={errors.note?.message} className="sm:col-span-2">
              <Textarea
                id="sa-note"
                rows={2}
                placeholder="Inventaire, casse, erreur de saisie…"
                {...register('note')}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" loading={isSubmitting}>Enregistrer le mouvement</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
