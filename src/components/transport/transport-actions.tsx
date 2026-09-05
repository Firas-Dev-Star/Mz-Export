'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CheckCircle2, Link2 } from 'lucide-react'
import {
  cancelTransportInvoice,
  confirmTransportInvoice,
  linkTransportInvoiceToSale,
} from '@/actions/transport.actions'
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
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/format'

export function ConfirmTransportInvoiceButton({
  transportInvoiceId,
  nextNumber,
}: {
  transportInvoiceId: string
  nextNumber: string
}) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await confirmTransportInvoice(transportInvoiceId)
    setLoading(false)
    setOpen(false)
    if (result.ok) {
      toast.success(result.message ?? 'Facture validée.')
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-4 w-4" />
        Valider la facture
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive={false}
        title="Valider cette facture de transport ?"
        description={
          <>
            Le numéro <strong>{nextNumber}</strong> sera attribué. Aucun mouvement de stock :
            une facture de transport ne porte pas de marchandise.
          </>
        }
        confirmLabel="Valider"
        loading={loading}
        onConfirm={run}
      />
    </>
  )
}

export function CancelTransportInvoiceButton({
  transportInvoiceId,
  number,
}: {
  transportInvoiceId: string
  number: string
}) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await cancelTransportInvoice(transportInvoiceId)
    setLoading(false)
    setOpen(false)
    if (result.ok) {
      toast.success(result.message ?? 'Facture annulée.')
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Ban className="h-4 w-4" />
        Annuler la facture
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Annuler la facture de transport ${number} ?`}
        description="La facture reste consultable et son numéro n'est pas réattribué. Elle sort des charges et du coût de l'expédition."
        confirmLabel="Annuler la facture"
        cancelLabel="Retour"
        loading={loading}
        onConfirm={run}
      />
    </>
  )
}

export interface LinkableSale {
  id: string
  number: string
  date: Date
  customerName: string
}

/**
 * Rattachement rapide a une vente. C'est l'operation la plus courante du
 * module : la facture du transporteur arrive apres la vente, et il faut la
 * raccrocher pour connaitre le cout reel de l'expedition.
 */
export function LinkSaleDialog({
  transportInvoiceId,
  currentInvoiceId,
  sales,
}: {
  transportInvoiceId: string
  currentInvoiceId: string | null
  sales: LinkableSale[]
}) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [choix, setChoix] = React.useState(currentInvoiceId ?? '')
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await linkTransportInvoiceToSale(transportInvoiceId, choix || null)
    setLoading(false)
    if (result.ok) {
      toast.success(result.message ?? 'Rattachement enregistré.')
      setOpen(false)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 className="h-4 w-4" />
          {currentInvoiceId ? 'Changer la vente rattachée' : 'Rattacher à une vente'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rattacher à une facture de vente</DialogTitle>
          <DialogDescription>
            Le rattachement permet de lire la marge réelle de l&apos;expédition : le prix de vente
            moins le coût d&apos;acheminement.
          </DialogDescription>
        </DialogHeader>
        <Field label="Facture de vente" htmlFor="lien-invoice">
          <Select id="lien-invoice" value={choix} onChange={(e) => setChoix(e.target.value)}>
            <option value="">— Aucune —</option>
            {sales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number} — {s.customerName} ({formatDate(s.date)})
              </option>
            ))}
          </Select>
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="button" loading={loading} onClick={run}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
