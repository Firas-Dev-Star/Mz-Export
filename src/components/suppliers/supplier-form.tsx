'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { createSupplier, updateSupplier } from '@/actions/supplier.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { type SupplierInput, supplierSchema } from '@/validations/supplier'

const EMPTY: SupplierInput = {
  code: '',
  companyName: '',
  contactName: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  country: 'Tunisie',
  phone: '',
  email: '',
  taxId: '',
  tradeRegister: '',
  paymentTerms: '',
  currencyCode: 'TND',
  notes: '',
  isActive: true,
}

export function SupplierForm({
  supplierId,
  defaultValues,
  currencies,
}: {
  supplierId?: string
  defaultValues?: Partial<SupplierInput>
  currencies: Array<{ code: string; name: string }>
}) {
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  })

  async function onSubmit(values: SupplierInput) {
    const result = supplierId ? await updateSupplier(supplierId, values) : await createSupplier(values)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) setError(field as keyof SupplierInput, { message: messages[0] })
        }
      }
      toast.error(result.error)
      return
    }

    toast.success(result.message ?? 'Enregistré.')
    const id = supplierId ?? (result.data as { id: string } | undefined)?.id
    router.push(id ? `/suppliers/${id}` : '/suppliers')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Identification</CardTitle>
          <CardDescription>Le code fournisseur est généré automatiquement s&apos;il est laissé vide.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Raison sociale" htmlFor="companyName" required error={errors.companyName?.message} className="sm:col-span-2">
            <Input id="companyName" {...register('companyName')} aria-invalid={Boolean(errors.companyName)} />
          </Field>
          <Field label="Code fournisseur" htmlFor="code" error={errors.code?.message}>
            <Input id="code" {...register('code')} />
          </Field>
          <Field label="Statut" htmlFor="isActive">
            <Select id="isActive" {...register('isActive', { setValueAs: (v) => v === 'true' || v === true })}>
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </Select>
          </Field>
          <Field label="Contact" htmlFor="contactName" error={errors.contactName?.message}>
            <Input id="contactName" {...register('contactName')} />
          </Field>
          <Field label="Téléphone" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" {...register('phone')} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...register('email')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Adresse</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Adresse" htmlFor="addressLine1" error={errors.addressLine1?.message} className="sm:col-span-2">
            <Input id="addressLine1" {...register('addressLine1')} />
          </Field>
          <Field label="Complément" htmlFor="addressLine2" error={errors.addressLine2?.message} className="sm:col-span-2">
            <Input id="addressLine2" {...register('addressLine2')} />
          </Field>
          <Field label="Code postal" htmlFor="postalCode" error={errors.postalCode?.message}>
            <Input id="postalCode" {...register('postalCode')} />
          </Field>
          <Field label="Ville" htmlFor="city" error={errors.city?.message}>
            <Input id="city" {...register('city')} />
          </Field>
          <Field label="Pays" htmlFor="country" error={errors.country?.message}>
            <Input id="country" {...register('country')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informations légales et commerciales</CardTitle>
          <CardDescription>Les achats sont enregistrés en dinars tunisiens.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Matricule fiscal" htmlFor="taxId" error={errors.taxId?.message}>
            <Input id="taxId" {...register('taxId')} />
          </Field>
          <Field label="Registre de commerce" htmlFor="tradeRegister" error={errors.tradeRegister?.message}>
            <Input id="tradeRegister" {...register('tradeRegister')} />
          </Field>
          <Field label="Conditions de paiement" htmlFor="paymentTerms" error={errors.paymentTerms?.message}>
            <Input id="paymentTerms" placeholder="Virement 30 jours" {...register('paymentTerms')} />
          </Field>
          <Field label="Devise" htmlFor="currencyCode" error={errors.currencyCode?.message}>
            <Select id="currencyCode" {...register('currencyCode')}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notes internes" htmlFor="notes" error={errors.notes?.message} className="sm:col-span-2">
            <Textarea id="notes" rows={3} {...register('notes')} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" asChild>
          <Link href={supplierId ? `/suppliers/${supplierId}` : '/suppliers'}>Annuler</Link>
        </Button>
        <Button type="submit" loading={isSubmitting}>
          <Save className="h-4 w-4" />
          {supplierId ? 'Enregistrer les modifications' : 'Créer le fournisseur'}
        </Button>
      </div>
    </form>
  )
}
