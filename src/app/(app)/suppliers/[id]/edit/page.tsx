import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { SupplierForm } from '@/components/suppliers/supplier-form'
import { requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('supplier.write')
  const { id } = await params

  const [supplier, currencies] = await Promise.all([
    prisma.supplier.findUnique({ where: { id } }),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
  ])
  if (!supplier) notFound()

  return (
    <>
      <PageHeader title={`Modifier — ${supplier.companyName}`} />
      <SupplierForm
        supplierId={supplier.id}
        currencies={currencies}
        defaultValues={{
          code: supplier.code,
          companyName: supplier.companyName,
          contactName: supplier.contactName,
          addressLine1: supplier.addressLine1,
          addressLine2: supplier.addressLine2,
          postalCode: supplier.postalCode,
          city: supplier.city,
          country: supplier.country,
          phone: supplier.phone,
          email: supplier.email,
          taxId: supplier.taxId,
          tradeRegister: supplier.tradeRegister,
          paymentTerms: supplier.paymentTerms,
          currencyCode: supplier.currencyCode,
          notes: supplier.notes,
          isActive: supplier.isActive,
        }}
      />
    </>
  )
}
