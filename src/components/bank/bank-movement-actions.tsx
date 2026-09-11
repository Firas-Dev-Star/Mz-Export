'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Link2, RotateCcw, Tag } from 'lucide-react'
import {
  attributeBankMovement,
  ignoreBankMovement,
  resetBankMovement,
} from '@/actions/bank.actions'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/format'

export interface TiersOption {
  id: string
  nom: string
  type: 'supplier' | 'carrier' | 'customer'
  /** Somme des factures encore ouvertes, pour guider le choix. */
  ouvert: string
  /** Devise des factures de ce tiers — sert a libeller le montant a saisir. */
  devise?: string
}

/**
 * Attribution d'un mouvement bancaire à un tiers.
 *
 * Le montant est imputé sur les factures ouvertes de la plus ancienne à la plus
 * récente — la convention du compte courant fournisseur. L'utilisateur choisit
 * le tiers ; l'imputation, elle, ne se discute pas.
 */
export function AttributeMovementDialog({
  movementId, montant, libelle, devise, tiers,
}: {
  movementId: string
  montant: string
  libelle: string
  devise: string
  tiers: TiersOption[]
}) {
  const [open, setOpen] = React.useState(false)
  const [choix, setChoix] = React.useState('')
  const [montantDevise, setMontantDevise] = React.useState('')
  const [enCours, setEnCours] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  const selection = tiers.find((t) => `${t.type}:${t.id}` === choix)
  // Une entree solde une facture client, une sortie regle un fournisseur.
  const estEncaissement = Number(montant) > 0

  async function attribuer() {
    if (!selection) {
      toast.error('Choisissez un tiers.')
      return
    }
    if (selection.type === 'customer' && !(Number(montantDevise.replace(',', '.')) > 0)) {
      toast.error('Saisissez le montant encaissé, dans la devise de la facture.')
      return
    }
    setEnCours(true)
    const result = await attributeBankMovement(
      movementId,
      selection.type === 'customer'
        ? {
            type: 'customer',
            id: selection.id,
            montantDevise: montantDevise.replace(',', '.'),
          }
        : { type: selection.type, id: selection.id },
    )
    setEnCours(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Mouvement attribué.')
    setOpen(false)
    setChoix('')
    setMontantDevise('')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="h-4 w-4" />
          Attribuer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attribuer ce mouvement</DialogTitle>
          <DialogDescription>
            {formatMoney(montant, devise)} — {libelle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field
            label="Tiers"
            htmlFor="tiers"
            required
            hint="Le montant sera imputé sur ses factures ouvertes, de la plus ancienne à la plus récente."
          >
            <Select id="tiers" value={choix} onChange={(e) => setChoix(e.target.value)}>
              <option value="">— Choisir —</option>
              {tiers
                .filter((t) => (estEncaissement ? t.type === 'customer' : t.type !== 'customer'))
                .map((t) => (
                  <option key={`${t.type}:${t.id}`} value={`${t.type}:${t.id}`}>
                    {t.nom} — {t.ouvert} ouvert{t.type === 'carrier' ? ' (transport)' : ''}
                  </option>
                ))}
            </Select>
          </Field>

          {selection?.type === 'customer' ? (
            <Field
              label={`Montant encaissé en ${selection.devise ?? 'EUR'}`}
              htmlFor="montantDevise"
              required
              hint="Le relevé ne porte que le montant converti en dinars, jamais le taux appliqué. Reprenez le montant en devise de l’avis de domiciliation."
            >
              <Input
                id="montantDevise"
                inputMode="decimal"
                value={montantDevise}
                onChange={(e) => setMontantDevise(e.target.value)}
                placeholder="Ex. 12320.00"
              />
            </Field>
          ) : null}

          {selection && Number(selection.ouvert.replace(/[^\d.-]/g, '')) === 0 ? (
            <p className="text-xs text-amber-700">
              Ce tiers n’a aucune facture ouverte : l’attribution sera refusée.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={attribuer}
            disabled={
              enCours ||
              !selection ||
              (selection.type === 'customer' && !(Number(montantDevise.replace(',', '.')) > 0))
            }
          >
            {enCours ? 'Attribution…' : 'Attribuer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Classement d'un mouvement qui ne concerne pas les fournisseurs. */
export function IgnoreMovementDialog({
  movementId, libelle, categorieProposee,
}: {
  movementId: string
  libelle: string
  categorieProposee: string
}) {
  const [open, setOpen] = React.useState(false)
  const [categorie, setCategorie] = React.useState(categorieProposee)
  const [enCours, setEnCours] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function classer() {
    setEnCours(true)
    const result = await ignoreBankMovement(movementId, categorie || 'Autre')
    setEnCours(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Mouvement classé.')
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Tag className="h-4 w-4" />
          Classer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Classer sans imputer</DialogTitle>
          <DialogDescription>{libelle}</DialogDescription>
        </DialogHeader>
        <Field
          label="Nature"
          htmlFor="categorie"
          hint="Salaire, transfert entre comptes, frais bancaires, impôts…"
        >
          <Input
            id="categorie"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            placeholder="Ex. Salaire"
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={classer} disabled={enCours}>
            {enCours ? 'Enregistrement…' : 'Classer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Remise à traiter : supprime les règlements issus de ce mouvement. */
export function ResetMovementButton({ movementId }: { movementId: string }) {
  const [enCours, setEnCours] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function remettre() {
    setEnCours(true)
    const result = await resetBankMovement(movementId)
    setEnCours(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Mouvement remis à traiter.')
    router.refresh()
  }

  return (
    <Button variant="ghost" size="sm" onClick={remettre} disabled={enCours}>
      <RotateCcw className="h-4 w-4" />
      {enCours ? '…' : 'Remettre à traiter'}
    </Button>
  )
}
