'use client'

import * as React from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

/** Premier et dernier jour du mois precedent, au format AAAA-MM-JJ. */
function previousMonth(): { from: string; to: string } {
  const now = new Date()
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

/**
 * Classeur mensuel pour le comptable.
 *
 * Le mois precedent est propose par defaut : c'est la periode qu'on transmet
 * en pratique, une fois le mois clos.
 */
export function AccountantExport() {
  const [open, setOpen] = React.useState(false)
  const [range, setRange] = React.useState(previousMonth)

  const valid = Boolean(range.from) && Boolean(range.to) && range.from <= range.to

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="h-4 w-4" />
          Classeur comptable
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Classeur pour le comptable</DialogTitle>
          <DialogDescription>
            Six onglets : ventes, achats, transport, encaissements, règlements fournisseurs et
            récapitulatif TVA.
            Aucun numéro de compte — le comptable ventile lui-même.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Du" htmlFor="acc-from">
            <Input
              id="acc-from"
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </Field>
          <Field label="Au" htmlFor="acc-to">
            <Input
              id="acc-to"
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </Field>
        </div>

        {!valid ? (
          <p className="text-sm text-destructive">La date de début doit précéder la date de fin.</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button asChild disabled={!valid}>
            <a
              href={`/api/accountant?from=${range.from}&to=${range.to}`}
              onClick={() => setOpen(false)}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Télécharger
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
