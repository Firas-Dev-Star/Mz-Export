'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Hash } from 'lucide-react'
import { updatePurchaseNumbers } from '@/actions/purchase.actions'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { type PurchaseNumbersInput, purchaseNumbersSchema } from '@/validations/purchase'

/**
 * Correction des numéros d'une facture d'achat déjà validée.
 *
 * Les montants et les lignes restent figés — ils ont alimenté le stock et
 * servent de base aux règlements. Seules les deux étiquettes sont corrigibles.
 */
export function PurchaseNumbersDialog({
  purchaseId, number, supplierReference,
}: {
  purchaseId: string
  number: string
  supplierReference: string
}) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  const {
    register, handleSubmit, reset,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseNumbersInput>({
    resolver: zodResolver(purchaseNumbersSchema),
    defaultValues: { number, supplierReference },
  })

  // La fiche se recharge après enregistrement : on repart des valeurs à jour
  // plutôt que de celles capturées au premier rendu.
  React.useEffect(() => {
    if (open) reset({ number, supplierReference })
  }, [open, number, supplierReference, reset])

  async function onSubmit(values: PurchaseNumbersInput) {
    const result = await updatePurchaseNumbers(purchaseId, values)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Numéros mis à jour.')
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Hash className="h-4 w-4" />
          Corriger les numéros
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Numéros de la facture d’achat</DialogTitle>
          <DialogDescription>
            Seuls les numéros sont modifiables. Les montants, les lignes et les règlements
            restent inchangés.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field
            label="N° d’enregistrement"
            htmlFor="number"
            required
            error={errors.number?.message}
            hint="Le numéro de cette facture dans votre comptabilité. Il doit rester unique."
          >
            <Input id="number" {...register('number')} />
          </Field>

          <Field
            label="N° de facture fournisseur"
            htmlFor="supplierReference"
            error={errors.supplierReference?.message}
            hint="Le numéro porté par la facture reçue du fournisseur."
          >
            <Input id="supplierReference" {...register('supplierReference')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
