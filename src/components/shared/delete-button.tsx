'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import type { ActionResult } from '@/validations/common'

/** Bouton de suppression avec confirmation obligatoire. */
export function DeleteButton({
  action, title, description, label = 'Supprimer', redirectTo, size = 'sm', variant = 'outline',
}: {
  action: () => Promise<ActionResult<unknown>>
  title: string
  description?: React.ReactNode
  label?: string
  redirectTo?: string
  size?: 'sm' | 'default' | 'icon'
  variant?: 'outline' | 'destructive' | 'ghost'
}) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const toast = useToast()
  const router = useRouter()

  async function confirm() {
    setLoading(true)
    const result = await action()
    setLoading(false)
    setOpen(false)

    if (result.ok) {
      toast.success(result.message ?? 'Suppression effectuée.')
      if (redirectTo) router.push(redirectTo)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        {size !== 'icon' ? label : <span className="sr-only">{label}</span>}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel="Supprimer"
        loading={loading}
        onConfirm={confirm}
      />
    </>
  )
}
