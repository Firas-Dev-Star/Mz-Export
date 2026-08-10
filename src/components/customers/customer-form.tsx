'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { createCustomer, updateCustomer } from '@/actions/customer.actions'
import { type CustomerInput, customerSchema } from '@/validations/customer'

const EMPTY: CustomerInput = {
  code: '',
  companyName: '',
  firstName: '',
  lastName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  country: '',
  phone: '',
  email: '',
  taxId: '',
  siret: '',
  vatNumber: '',
  paymentTerms: '',
  currencyCode: 'EUR',
  deliveryAddress: '',
  deliveryCountry: '',
  notes: '',
  isActive: true,
}

export function CustomerForm({
  customerId,
  defaultValues,
  currencies,
}: {
  customerId?: string
  defaultValues?: Partial<CustomerInput>
  currencies: Array<{ code: string; name: string }>
}) {
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: { ...EMPTY, ...defaultValues },
  })

  async function onSubmit(values: CustomerInput) {
    const result = customerId ? await updateCustomer(customerId, values) : await createCustomer(values)

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) setError(field as keyof CustomerInput, { message: messages[0] })
        }
      }
      toast.error(result.error)
      return
    }

    toast.success(result.message ?? 'Enregistré.')
    const id = customerId ?? (result.data as { id: string } | undefined)?.id
    router.push(id ? `/customers/${id}` : '/customers')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Identification</CardTitle>
          <CardDescription>Le code client est généré automatiquement s&apos;il est laissé vide.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Raison sociale" htmlFor="companyName" required error={errors.companyName?.message} className="sm:col-span-2">
            <Input id="companyName" {...register('companyName')} aria-invalid={Boolean(errors.companyName)} />
          </Field>
          <Field label="Code client" htmlFor="code" error={errors.code?.message} hint="Ex. WIDA-IMPORT">
            <Input id="code" {...register('code')} />
          </Field>
          <Field label="Statut" htmlFor="isActive">
            <Select id="isActive" {...register('isActive', { setValueAs: (v) => v === 'true' || v === true })}>
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </Select>
          </Field>
          <Field label="Prénom" htmlFor="firstName" error={errors.firstName?.message}>
            <Input id="firstName" {...register('firstName')} />
          </Field>
          <Field label="Nom" htmlFor="lastName" error={errors.lastName?.message}>
            <Input id="lastName" {...register('lastName')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adresse de facturation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Adresse" htmlFor="addressLine1" error={errors.addressLine1?.message} className="sm:col-span-2">
            <Input id="addressLine1" {...register('addressLine1')} />
          </Field>
          <Field label="Complément d'adresse" htmlFor="addressLine2" error={errors.addressLine2?.message} className="sm:col-span-2">
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
          <Field label="Téléphone" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" {...register('phone')} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...register('email')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Livraison</CardTitle>
          <CardDescription>Adresse reprise par défaut sur les nouvelles factures de ce client.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Adresse de livraison" htmlFor="deliveryAddress" error={errors.deliveryAddress?.message} className="sm:col-span-2">
            <Textarea id="deliveryAddress" rows={3} {...register('deliveryAddress')} />
          </Field>
          <Field label="Pays de destination" htmlFor="deliveryCountry" error={errors.deliveryCountry?.message}>
            <Input id="deliveryCountry" {...register('deliveryCountry')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact et informations légales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact principal" htmlFor="contactName" error={errors.contactName?.message}>
            <Input id="contactName" {...register('contactName')} />
          </Field>
          <Field label="Téléphone du contact" htmlFor="contactPhone" error={errors.contactPhone?.message}>
            <Input id="contactPhone" {...register('contactPhone')} />
          </Field>
          <Field label="Email du contact" htmlFor="contactEmail" error={errors.contactEmail?.message}>
            <Input id="contactEmail" type="email" {...register('contactEmail')} />
          </Field>
          <Field label="SIRET" htmlFor="siret" error={errors.siret?.message}>
            <Input id="siret" {...register('siret')} />
          </Field>
          <Field label="Matricule fiscal" htmlFor="taxId" error={errors.taxId?.message}>
            <Input id="taxId" {...register('taxId')} />
          </Field>
          <Field label="TVA intracommunautaire" htmlFor="vatNumber" error={errors.vatNumber?.message}>
            <Input id="vatNumber" {...register('vatNumber')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conditions commerciales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Conditions de paiement" htmlFor="paymentTerms" error={errors.paymentTerms?.message} hint="Ex. Virement 30 jours">
            <Input id="paymentTerms" {...register('paymentTerms')} />
          </Field>
          <Field label="Devise préférée" htmlFor="currencyCode" error={errors.currencyCode?.message}>
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
          <Link href={customerId ? `/customers/${customerId}` : '/customers'}>Annuler</Link>
        </Button>
        <Button type="submit" loading={isSubmitting}>
          <Save className="h-4 w-4" />
          {customerId ? 'Enregistrer les modifications' : 'Créer le client'}
        </Button>
      </div>
    </form>
  )
}
