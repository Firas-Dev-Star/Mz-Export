'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { purgeDemoData } from '@/actions/settings.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

export function DemoDataPanel({
  counts,
}: {
  counts: { invoices: number; purchases: number; customers: number; suppliers: number; products: number }
}) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const router = useRouter()
  const toast = useToast()
  const total =
    counts.invoices + counts.purchases + counts.customers + counts.suppliers + counts.products

  async function run() {
    setLoading(true)
    const result = await purgeDemoData()
    setLoading(false)
    setOpen(false)
    if (result.ok) {
      toast.success(result.message ?? 'Données de démonstration supprimées.')
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Données de démonstration</CardTitle>
        <CardDescription>
          Le seed ne crée plus aucune donnée de démonstration. Ce bouton sert à nettoyer une base
          où un ancien seed de démonstration avait été joué. Les paramètres de société, les
          utilisateurs et la numérotation ne sont jamais touchés, et le stock est recalculé
          à partir des mouvements restants.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? 'Aucune donnée de démonstration dans la base.'
            : `${counts.invoices} facture(s) de vente, ${counts.purchases} facture(s) d'achat, ` +
              `${counts.customers} client(s), ${counts.suppliers} fournisseur(s), ${counts.products} produit(s).`}
        </p>
        <Button variant="destructive" disabled={total === 0} onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" />
          Supprimer les données de démonstration
        </Button>
      </CardContent>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Supprimer les données de démonstration ?"
        description="Les factures de démonstration et leurs mouvements de stock seront supprimés définitivement. Les clients, fournisseurs et produits encore utilisés par un document réel seront conservés."
        loading={loading}
        onConfirm={run}
      />
    </Card>
  )
}
