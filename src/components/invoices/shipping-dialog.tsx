'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Ship } from 'lucide-react'
import { updateInvoiceShipping } from '@/actions/invoice.actions'
import { Button } from '@/components/ui/button'
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
import {
  INCOTERM_CODES,
  TRANSPORT_MODE_CODES,
  incotermLabel,
  incotermTransportWarning,
  transportModeLabel,
} from '@/lib/trade'
import { type InvoiceShippingInput, invoiceShippingSchema } from '@/validations/invoice'

/**
 * Correction des informations d'expedition d'une facture DEJA VALIDEE.
 *
 * Aucun champ de ce formulaire n'entre dans le calcul des totaux : c'est ce qui
 * autorise la correction sans annuler la facture. Les montants, les lignes et
 * les dates restent hors de portee — pour ceux-la, il faut un brouillon.
 */
export function ShippingDialog({
  invoiceId,
  defaultValues,
  numero,
}: {
  invoiceId: string
  defaultValues: InvoiceShippingInput
  numero: string
}) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceShippingInput>({
    resolver: zodResolver(invoiceShippingSchema),
    defaultValues,
  })

  // Avertissement non bloquant : incoterm maritime sur un transport terrestre.
  const alerte = incotermTransportWarning(watch('incoterm') ?? '', watch('transportMode') ?? '')

  async function onSubmit(values: InvoiceShippingInput) {
    const result = await updateInvoiceShipping(invoiceId, values)
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) setError(field as keyof InvoiceShippingInput, { message: messages[0] })
        }
      }
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Enregistré.')
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        // Reouvrir le dialogue doit repartir des valeurs enregistrees, pas de
        // celles d'une saisie abandonnee.
        if (!v) reset(defaultValues)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Ship className="h-4 w-4" />
          Informations d&apos;expédition
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Informations d&apos;expédition — {numero}</DialogTitle>
          <DialogDescription>
            Mentions déclaratives : incoterm, colisage, poids, destination, domiciliation. Aucun
            montant n&apos;est touché, la facture reste validée.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Incoterm" htmlFor="ex-incoterm" error={errors.incoterm?.message}>
              <Select id="ex-incoterm" {...register('incoterm')}>
                <option value="">— Aucun —</option>
                {INCOTERM_CODES.map((code) => (
                  <option key={code} value={code}>
                    {incotermLabel(code)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mode de transport" htmlFor="ex-mode" error={errors.transportMode?.message}>
              <Select id="ex-mode" {...register('transportMode')}>
                <option value="">— Aucun —</option>
                {TRANSPORT_MODE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {transportModeLabel(code)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Port / lieu de départ" htmlFor="ex-depart" error={errors.departurePort?.message}>
              <Input id="ex-depart" {...register('departurePort')} />
            </Field>
          </div>

          {alerte ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              {alerte}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Destination" htmlFor="ex-destination" error={errors.destination?.message}>
              <Input id="ex-destination" {...register('destination')} />
            </Field>
            <Field label="Réf. commande" htmlFor="ex-commande" error={errors.orderReference?.message}>
              <Input id="ex-commande" {...register('orderReference')} />
            </Field>
            <Field
              label="Domiciliation bancaire"
              htmlFor="ex-domi"
              error={errors.domiciliationRef?.message}
            >
              <Input id="ex-domi" {...register('domiciliationRef')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="NGP" htmlFor="ex-ngp" error={errors.ngp?.message}>
              <Input id="ex-ngp" {...register('ngp')} />
            </Field>
            <Field label="Pays d&apos;origine" htmlFor="ex-origine" error={errors.originCountry?.message}>
              <Input id="ex-origine" {...register('originCountry')} />
            </Field>
            <Field label="Pays de destination" htmlFor="ex-pays" error={errors.deliveryCountry?.message}>
              <Input id="ex-pays" {...register('deliveryCountry')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Nombre de colis" htmlFor="ex-colis" error={errors.packageCount?.message}>
              <Input id="ex-colis" inputMode="numeric" {...register('packageCount')} />
            </Field>
            <Field label="Type de colis" htmlFor="ex-type" error={errors.packageType?.message}>
              <Input id="ex-type" placeholder="CARTONS" {...register('packageType')} />
            </Field>
            <Field label="Poids brut (kg)" htmlFor="ex-brut" error={errors.grossWeightKg?.message}>
              <Input id="ex-brut" inputMode="decimal" {...register('grossWeightKg')} />
            </Field>
            <Field label="Poids net (kg)" htmlFor="ex-net" error={errors.netWeightKg?.message}>
              <Input id="ex-net" inputMode="decimal" {...register('netWeightKg')} />
            </Field>
          </div>

          <Field label="Dimensions" htmlFor="ex-dim" error={errors.packageDimensions?.message}>
            <Input id="ex-dim" {...register('packageDimensions')} />
          </Field>

          <Field
            label="Adresse de livraison"
            htmlFor="ex-adresse"
            error={errors.deliveryAddress?.message}
          >
            <Textarea id="ex-adresse" rows={3} {...register('deliveryAddress')} />
          </Field>

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
