'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CheckCircle2, Copy } from 'lucide-react'
import { cancelInvoice, confirmInvoice, duplicateInvoice } from '@/actions/invoice.actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

export function ConfirmInvoiceButton({ invoiceId, nextNumber }: { invoiceId: string; nextNumber: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await confirmInvoice(invoiceId)
    setLoading(false)
    setOpen(false)
    if (result.ok) {
      toast.success(result.message ?? 'Facture confirmée.')
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-4 w-4" />
        Confirmer la facture
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive={false}
        title="Confirmer cette facture ?"
        description={
          <>
            Le numéro définitif <strong>{nextNumber}</strong> sera attribué et la facture ne pourra plus
            être supprimée (uniquement annulée). Cette action est journalisée.
          </>
        }
        confirmLabel="Confirmer"
        loading={loading}
        onConfirm={run}
      />
    </>
  )
}

export function CancelInvoiceButton({ invoiceId, number }: { invoiceId: string; number: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await cancelInvoice(invoiceId)
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
        title={`Annuler la facture ${number} ?`}
        description="La facture est conservée dans l'historique avec le statut « Annulée ». Le numéro reste réservé."
        confirmLabel="Annuler la facture"
        cancelLabel="Retour"
        loading={loading}
        onConfirm={run}
      />
    </>
  )
}

export function DuplicateInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await duplicateInvoice(invoiceId)
    setLoading(false)
    if (result.ok && result.data) {
      toast.success(result.message ?? 'Brouillon créé.')
      router.push(`/invoices/${result.data.id}/edit`)
    } else if (!result.ok) {
      toast.error(result.error)
    }
  }

  return (
    <Button variant="outline" loading={loading} onClick={run}>
      <Copy className="h-4 w-4" />
      Dupliquer
    </Button>
  )
}
