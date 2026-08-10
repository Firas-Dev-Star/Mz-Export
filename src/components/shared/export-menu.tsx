'use client'

import * as React from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

const ENTITIES = [
  { key: 'customers', label: 'Clients' },
  { key: 'suppliers', label: 'Fournisseurs' },
  { key: 'products', label: 'Produits' },
  { key: 'invoices', label: 'Factures de vente' },
  { key: 'invoice-items', label: 'Lignes de vente' },
  { key: 'purchases', label: "Factures d'achat" },
  { key: 'purchase-items', label: "Lignes d'achat" },
  { key: 'payments', label: 'Règlements clients' },
  { key: 'stock', label: 'État du stock' },
  { key: 'stock-movements', label: 'Mouvements de stock' },
]

/** Telechargement des donnees au format Excel (.xlsx) ou CSV. */
export function ExportMenu() {
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4" />
          Exporter
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exporter les données</DialogTitle>
          <DialogDescription>Choisissez le jeu de données et le format.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ENTITIES.map((entity) => (
            <div key={entity.key} className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm font-medium text-navy-800">{entity.label}</span>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/export/${entity.key}?format=xlsx`}>Excel</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/export/${entity.key}?format=csv`}>CSV</a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
