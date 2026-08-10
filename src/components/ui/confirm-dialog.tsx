'use client'

import * as React from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

/** Confirmation obligatoire avant toute action destructive. */
export function ConfirmDialog({
  open, onOpenChange, title, description,
  confirmLabel = 'Confirmer', cancelLabel = 'Annuler',
  destructive = true, loading = false, onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-navy-950/50" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-white p-6 shadow-lg">
          <div className="flex gap-4">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', destructive ? 'bg-red-50 text-destructive' : 'bg-accent text-primary')}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <AlertDialog.Title className="text-base font-semibold text-navy-800">{title}</AlertDialog.Title>
              {description ? (
                <AlertDialog.Description asChild>
                  <div className="text-sm text-muted-foreground">{description}</div>
                </AlertDialog.Description>
              ) : null}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={loading}>{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              loading={loading}
              onClick={(e) => { e.preventDefault(); void onConfirm() }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
