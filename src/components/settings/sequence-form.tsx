'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { updateSequence } from '@/actions/settings.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { type SequenceInput, sequenceSchema } from '@/validations/settings'

export function SequenceForm({ defaultValues, preview }: { defaultValues: SequenceInput; preview: string }) {
  const toast = useToast()
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SequenceInput>({ resolver: zodResolver(sequenceSchema), defaultValues })

  const values = watch()
  const year = new Date().getUTCFullYear()
  const livePreview = `${values.prefix ?? ''}${values.includeYear ? `${year}-` : ''}${String(values.nextNumber ?? 1).padStart(Math.max(1, Number(values.padding) || 1), '0')}${values.suffix ?? ''}`

  async function onSubmit(input: SequenceInput) {
    const result = await updateSequence(input)
    if (result.ok) toast.success(result.message ?? 'Enregistré.')
    else toast.error(result.error)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Numérotation des factures</CardTitle>
        <CardDescription>
          Le numéro est attribué au moment de la confirmation, jamais sur un brouillon.
          La réservation est atomique : deux utilisateurs simultanés ne peuvent pas obtenir le même numéro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Préfixe" htmlFor="prefix" error={errors.prefix?.message} hint="Ex. FAC-V-  (laisser vide pour une numérotation simple)">
              <Input id="prefix" {...register('prefix')} />
            </Field>
            <Field label="Suffixe" htmlFor="suffix" error={errors.suffix?.message}>
              <Input id="suffix" {...register('suffix')} />
            </Field>
            <Field label="Longueur du compteur" htmlFor="padding" error={errors.padding?.message} hint="4 → 0001">
              <Input id="padding" type="number" min={1} max={10} {...register('padding')} />
            </Field>
            <Field label="Prochain numéro" htmlFor="nextNumber" required error={errors.nextNumber?.message}>
              <Input id="nextNumber" type="number" min={1} {...register('nextNumber')} />
            </Field>
            <Field label="Inclure l'année" htmlFor="includeYear">
              <Select id="includeYear" {...register('includeYear', { setValueAs: (v) => v === 'true' || v === true })}>
                <option value="false">Non</option>
                <option value="true">Oui (ex. 2026-0001)</option>
              </Select>
            </Field>
            <Field label="Remise à zéro annuelle" htmlFor="resetYearly">
              <Select id="resetYearly" {...register('resetYearly', { setValueAs: (v) => v === 'true' || v === true })}>
                <option value="false">Non</option>
                <option value="true">Oui</option>
              </Select>
            </Field>
          </div>

          <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
            <p className="text-muted-foreground">Aperçu du prochain numéro</p>
            <p className="mt-1 text-lg font-semibold text-navy-800">{livePreview}</p>
            <p className="mt-1 text-xs text-muted-foreground">Valeur actuellement enregistrée : {preview || '—'}</p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting}>
              <Save className="h-4 w-4" />
              Enregistrer la numérotation
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
