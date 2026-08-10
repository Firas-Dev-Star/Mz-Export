'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CheckCircle2 } from 'lucide-react'
import { cancelPurchase, confirmPurchase } from '@/actions/purchase.actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

export function ConfirmPurchaseButton({ purchaseId, nextNumber }: { purchaseId: string; nextNumber: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await confirmPurchase(purchaseId)
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
        Valider et entrer en stock
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive={false}
        title="Valider cette facture d'achat ?"
        description={
          <>
            Le numéro <strong>{nextNumber}</strong> sera attribué et les quantités achetées
            seront <strong>ajoutées au stock</strong> des produits concernés.
          </>
        }
        confirmLabel="Valider"
        loading={loading}
        onConfirm={run}
      />
    </>
  )
}

export function CancelPurchaseButton({ purchaseId, number }: { purchaseId: string; number: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await cancelPurchase(purchaseId)
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
        title={`Annuler la facture d'achat ${number} ?`}
        description="Les entrées en stock de cette facture seront contre-passées (retour fournisseur). L'historique des mouvements est conservé."
        confirmLabel="Annuler la facture"
        cancelLabel="Retour"
        loading={loading}
        onConfirm={run}
      />
    </>
  )
}
