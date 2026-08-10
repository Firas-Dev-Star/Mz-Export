'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deletePayment } from '@/actions/payment.actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

export function DeletePaymentButton({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function run() {
    setLoading(true)
    const result = await deletePayment(paymentId)
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
        description="Le solde et le statut de la facture seront recalculés automatiquement."
        loading={loading}
        onConfirm={run}
      />
    </>
  )
}
