'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { importBankStatement } from '@/actions/bank.actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Import d'un relevé, dans le format que la banque produit.
 *
 * Aucune conversion préalable n'est demandée : ATB exporte un `.xlsx`, Zitouna
 * un fichier tabulé nommé `.xls`. Exiger un format pivot reviendrait à faire
 * faire le travail à la main avant de pouvoir l'automatiser.
 */
export function BankImportForm() {
  const [enCours, setEnCours] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const router = useRouter()
  const toast = useToast()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const fichier = data.get('fichier')
    if (!(fichier instanceof File) || fichier.size === 0) {
      toast.error('Choisissez un fichier de relevé.')
      return
    }

    setEnCours(true)
    const result = await importBankStatement(data)
    setEnCours(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message ?? 'Relevé importé.')
    form.reset()
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        name="fichier"
        accept=".xlsx,.xls,.txt,.csv"
        className="block w-full max-w-sm text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-800 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-navy-700"
      />
      <Button type="submit" disabled={enCours}>
        <Upload className="h-4 w-4" />
        {enCours ? 'Import en cours…' : 'Importer le relevé'}
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        Relevé ATB au format <code>.xlsx</code>, relevé Zitouna au format tabulé — tels que la
        banque les fournit. Réimporter un relevé déjà chargé ne crée aucun doublon.
      </p>
    </form>
  )
}
