'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { updateCompany } from '@/actions/settings.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { VAT_MODE_LABELS } from '@/lib/format'
import { type CompanyInput, companySchema } from '@/validations/settings'

export function CompanyForm({ defaultValues }: { defaultValues: CompanyInput }) {
  const toast = useToast()
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CompanyInput>({ resolver: zodResolver(companySchema), defaultValues })

  const vatMode = watch('defaultVatMode')

  async function onSubmit(values: CompanyInput) {
    const result = await updateCompany(values)
    if (result.ok) toast.success(result.message ?? 'Enregistré.')
    else toast.error(result.error)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Identité de la société</CardTitle>
          <CardDescription>
            Ces informations apparaissent dans l&apos;en-tête et le pied de page de vos factures.
            Vérifiez les valeurs reprises de la facture papier, notamment les numéros de téléphone.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nom" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
            <Input id="name" {...register('name')} />
          </Field>
          <Field label="Forme juridique" htmlFor="legalForm" error={errors.legalForm?.message}>
            <Input id="legalForm" {...register('legalForm')} />
          </Field>
          <Field label="Capital social" htmlFor="capital" error={errors.capital?.message}>
            <Input id="capital" inputMode="decimal" {...register('capital')} />
          </Field>
          <Field label="Devise du capital" htmlFor="capitalCurrency" error={errors.capitalCurrency?.message}>
            <Input id="capitalCurrency" {...register('capitalCurrency')} />
          </Field>
          <Field label="Activité" htmlFor="activity" error={errors.activity?.message}>
            <Input id="activity" {...register('activity')} />
          </Field>
          <Field label="Matricule fiscal" htmlFor="taxId" error={errors.taxId?.message}>
            <Input id="taxId" {...register('taxId')} />
          </Field>
          <Field label="Registre de commerce" htmlFor="tradeRegister" error={errors.tradeRegister?.message}>
            <Input id="tradeRegister" {...register('tradeRegister')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Coordonnées</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Adresse" htmlFor="addressLine1" error={errors.addressLine1?.message} className="sm:col-span-2">
            <Input id="addressLine1" {...register('addressLine1')} />
          </Field>
          <Field label="Complément" htmlFor="addressLine2" error={errors.addressLine2?.message}>
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
          <Field label="Téléphone 1" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" {...register('phone')} />
          </Field>
          <Field label="Téléphone 2" htmlFor="phone2" error={errors.phone2?.message}>
            <Input id="phone2" {...register('phone2')} />
          </Field>
          <Field label="Fax" htmlFor="fax" error={errors.fax?.message}>
            <Input id="fax" {...register('fax')} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...register('email')} />
          </Field>
          <Field label="Site web" htmlFor="website" error={errors.website?.message}>
            <Input id="website" {...register('website')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coordonnées bancaires</CardTitle>
          <CardDescription>Reprises dans le bloc « règlement » de la facture.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Banque" htmlFor="bankName" error={errors.bankName?.message}>
            <Input id="bankName" {...register('bankName')} />
          </Field>
          <Field label="Agence" htmlFor="bankAgency" error={errors.bankAgency?.message}>
            <Input id="bankAgency" {...register('bankAgency')} />
          </Field>
          <Field label="N° de compte" htmlFor="bankAccount" error={errors.bankAccount?.message}>
            <Input id="bankAccount" {...register('bankAccount')} />
          </Field>
          <Field label="IBAN" htmlFor="iban" error={errors.iban?.message}>
            <Input id="iban" {...register('iban')} />
          </Field>
          <Field label="SWIFT / BIC" htmlFor="swift" error={errors.swift?.message}>
            <Input id="swift" {...register('swift')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Valeurs par défaut des factures</CardTitle>
          <CardDescription>
            Le régime de TVA reste entièrement configurable. Ce logiciel ne garantit
            aucune conformité fiscale ou douanière : faites valider vos paramètres par votre comptable.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Devise par défaut" htmlFor="defaultCurrency" error={errors.defaultCurrency?.message}>
            <Input id="defaultCurrency" {...register('defaultCurrency')} />
          </Field>
          <Field label="Régime de TVA par défaut" htmlFor="defaultVatMode" error={errors.defaultVatMode?.message}>
            <Select id="defaultVatMode" {...register('defaultVatMode')}>
              {Object.entries(VAT_MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Taux de TVA par défaut (%)" htmlFor="defaultVatRate" error={errors.defaultVatRate?.message}>
            <Input id="defaultVatRate" inputMode="decimal" disabled={vatMode !== 'RATE'} {...register('defaultVatRate')} />
          </Field>
          <Field label="Libellé du timbre fiscal" htmlFor="defaultStampLabel" error={errors.defaultStampLabel?.message}>
            <Input id="defaultStampLabel" {...register('defaultStampLabel')} />
          </Field>
          <Field
            label="Timbre fiscal par défaut"
            htmlFor="defaultStampDuty"
            error={errors.defaultStampDuty?.message}
            hint="Ex. 1 — appliqué automatiquement aux nouvelles factures (0 pour désactiver)"
          >
            <Input id="defaultStampDuty" inputMode="decimal" {...register('defaultStampDuty')} />
          </Field>
          <Field label="Conditions de paiement" htmlFor="defaultPaymentTerms" error={errors.defaultPaymentTerms?.message}>
            <Input id="defaultPaymentTerms" {...register('defaultPaymentTerms')} />
          </Field>
          <Field label="Incoterm" htmlFor="defaultIncoterm" error={errors.defaultIncoterm?.message}>
            <Input id="defaultIncoterm" {...register('defaultIncoterm')} />
          </Field>
          <Field label="Origine par défaut" htmlFor="defaultOrigin" error={errors.defaultOrigin?.message}>
            <Input id="defaultOrigin" {...register('defaultOrigin')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mentions de la facture</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Note d'en-tête" htmlFor="headerNote" error={errors.headerNote?.message}>
            <Textarea id="headerNote" rows={2} {...register('headerNote')} />
          </Field>
          <Field label="Phrase d'invitation au règlement" htmlFor="paymentNotice" error={errors.paymentNotice?.message}>
            <Textarea id="paymentNotice" rows={2} {...register('paymentNotice')} />
          </Field>
          <Field label="Mentions légales" htmlFor="legalMentions" error={errors.legalMentions?.message}>
            <Textarea id="legalMentions" rows={3} {...register('legalMentions')} />
          </Field>
          <Field label="Pied de page" htmlFor="footerText" error={errors.footerText?.message}>
            <Textarea id="footerText" rows={3} {...register('footerText')} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>
          <Save className="h-4 w-4" />
          Enregistrer les paramètres
        </Button>
      </div>
    </form>
  )
}
