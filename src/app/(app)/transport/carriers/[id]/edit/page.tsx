import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { CarrierForm } from '@/components/transport/carrier-form'
import { requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function EditCarrierPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('carrier.write')
  const { id } = await params

  const [carrier, currencies] = await Promise.all([
    prisma.carrier.findUnique({ where: { id } }),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
  ])
  if (!carrier) notFound()

  return (
    <>
      <PageHeader title={`Modifier ${carrier.companyName}`} />
      <CarrierForm
        carrierId={carrier.id}
        defaultValues={{
          code: carrier.code,
          companyName: carrier.companyName,
          contactName: carrier.contactName,
          addressLine1: carrier.addressLine1,
          addressLine2: carrier.addressLine2,
          postalCode: carrier.postalCode,
          city: carrier.city,
          country: carrier.country,
          phone: carrier.phone,
          email: carrier.email,
          taxId: carrier.taxId,
          tradeRegister: carrier.tradeRegister,
          paymentTerms: carrier.paymentTerms,
          currencyCode: carrier.currencyCode,
          notes: carrier.notes,
          isActive: carrier.isActive,
        }}
        currencies={currencies}
      />
    </>
  )
}
