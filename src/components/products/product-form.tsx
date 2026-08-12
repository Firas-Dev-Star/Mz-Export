'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { UNIT_CODES, unitLabel } from '@/lib/units'
import { createProduct, updateProduct } from '@/actions/product.actions'
import { type ProductInput, productSchema } from '@/validations/product'

/**
 * Prix et TVA ne figurent PAS sur la fiche produit : ils se saisissent sur les
 * factures, ou ils sont exacts et dates. Les champs restent dans le schema a
 * leur valeur neutre pour ne pas exiger de migration s'ils reviennent un jour.
 */
const EMPTY: ProductInput = {
  reference: '',
  sku: '',
  designation: '',
  description: '',
  unit: 'PCS',
  categoryName: '',
  salePriceEur: '0',
  purchasePriceTnd: '0',
  trackStock: true,
  minStock: '0',
  vatMode: 'NONE',
  vatRate: '0',
  ngp: '',
  originCountry: '',
  unitWeightKg: '0',
  lengthCm: '0',
  widthCm: '0',
  heightCm: '0',
  unitsPerPackage: 0,
  isActive: true,
}

export function ProductForm({
  productId,
  defaultValues,
  categories,
}: {
  productId?: string
  defaultValues?: Partial<ProductInput>
  categories: string[]
}) {
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  })

  async function onSubmit(values: ProductInput) {
    const result = productId ? await updateProduct(productId, values) : await createProduct(values)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) setError(field as keyof ProductInput, { message: messages[0] })
        }
      }
      toast.error(result.error)
      return
    }

    toast.success(result.message ?? 'Enregistré.')
    router.push('/products')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Identification</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Référence" htmlFor="reference" required error={errors.reference?.message}>
            <Input id="reference" {...register('reference')} aria-invalid={Boolean(errors.reference)} />
          </Field>
          <Field label="SKU" htmlFor="sku" error={errors.sku?.message}>
            <Input id="sku" {...register('sku')} />
          </Field>
          <Field label="Désignation" htmlFor="designation" required error={errors.designation?.message} className="sm:col-span-2">
            <Input id="designation" {...register('designation')} aria-invalid={Boolean(errors.designation)} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message} className="sm:col-span-2">
            <Textarea id="description" rows={3} {...register('description')} />
          </Field>
          <Field label="Catégorie" htmlFor="categoryName" error={errors.categoryName?.message} hint="Saisissez un nom : la catégorie est créée automatiquement.">
            <Input id="categoryName" list="category-options" {...register('categoryName')} />
            <datalist id="category-options">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Unité" htmlFor="unit" error={errors.unit?.message}>
            <Select id="unit" {...register('unit')}>
              {UNIT_CODES.map((code) => (
                <option key={code} value={code}>
                  {unitLabel(code)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Statut" htmlFor="isActive">
            <Select id="isActive" {...register('isActive', { setValueAs: (v) => v === 'true' || v === true })}>
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock</CardTitle>
          <CardDescription>
            Le stock n&apos;est jamais modifié sans mouvement enregistré : il évolue via les achats,
            les ventes et les ajustements manuels.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Suivi en stock" htmlFor="trackStock">
            <Select id="trackStock" {...register('trackStock', { setValueAs: (v) => v === 'true' || v === true })}>
              <option value="true">Oui — produit stocké</option>
              <option value="false">Non — service / prestation</option>
            </Select>
          </Field>
          <Field label="Stock minimum" htmlFor="minStock" error={errors.minStock?.message} hint="Seuil de l'alerte « stock faible »">
            <Input id="minStock" inputMode="decimal" disabled={watch('trackStock') === false} {...register('minStock')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informations export</CardTitle>
          <CardDescription>Reprises automatiquement sur les lignes de facture.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="NGP / code douanier" htmlFor="ngp" error={errors.ngp?.message}>
            <Input id="ngp" {...register('ngp')} />
          </Field>
          <Field label="Pays d'origine" htmlFor="originCountry" error={errors.originCountry?.message}>
            <Input id="originCountry" {...register('originCountry')} />
          </Field>
          <Field label="Unités par colis" htmlFor="unitsPerPackage" error={errors.unitsPerPackage?.message}>
            <Input id="unitsPerPackage" type="number" min={0} {...register('unitsPerPackage')} />
          </Field>
          <Field label="Poids unitaire (kg)" htmlFor="unitWeightKg" error={errors.unitWeightKg?.message}>
            <Input id="unitWeightKg" inputMode="decimal" {...register('unitWeightKg')} />
          </Field>
          <Field label="Longueur (cm)" htmlFor="lengthCm" error={errors.lengthCm?.message}>
            <Input id="lengthCm" inputMode="decimal" {...register('lengthCm')} />
          </Field>
          <Field label="Largeur (cm)" htmlFor="widthCm" error={errors.widthCm?.message}>
            <Input id="widthCm" inputMode="decimal" {...register('widthCm')} />
          </Field>
          <Field label="Hauteur (cm)" htmlFor="heightCm" error={errors.heightCm?.message}>
            <Input id="heightCm" inputMode="decimal" {...register('heightCm')} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" asChild>
          <Link href="/products">Annuler</Link>
        </Button>
        <Button type="submit" loading={isSubmitting}>
          <Save className="h-4 w-4" />
          {productId ? 'Enregistrer les modifications' : 'Créer le produit'}
        </Button>
      </div>
    </form>
  )
}