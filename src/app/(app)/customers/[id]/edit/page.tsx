import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { CustomerForm } from '@/components/customers/customer-form'
import { requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('customer.write')
  const { id } = await params

  const [customer, currencies] = await Promise.all([
    prisma.customer.findUnique({ where: { id } }),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
  ])
  if (!customer) notFound()

  return (
    <>
      <PageHeader title={`Modifier — ${customer.companyName}`} />
      <CustomerForm
        customerId={customer.id}
        currencies={currencies}
        defaultValues={{
          code: customer.code,
          companyName: customer.companyName,
          firstName: customer.firstName,
          lastName: customer.lastName,
          contactName: customer.contactName,
          contactPhone: customer.contactPhone,
          contactEmail: customer.contactEmail,
          addressLine1: customer.addressLine1,
          addressLine2: customer.addressLine2,
          postalCode: customer.postalCode,
          city: customer.city,
          country: customer.country,
          phone: customer.phone,
          email: customer.email,
          taxId: customer.taxId,
          siret: customer.siret,
          vatNumber: customer.vatNumber,
          paymentTerms: customer.paymentTerms,
          currencyCode: customer.currencyCode,
          deliveryAddress: customer.deliveryAddress,
          deliveryCountry: customer.deliveryCountry,
          notes: customer.notes,
          isActive: customer.isActive,
        }}
      />
    </>
  )
}
