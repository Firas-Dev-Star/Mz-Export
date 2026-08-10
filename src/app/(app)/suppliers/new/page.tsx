import { PageHeader } from '@/components/layout/page-header'
import { SupplierForm } from '@/components/suppliers/supplier-form'
import { requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Nouveau fournisseur — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function NewSupplierPage() {
  await requirePermission('supplier.write')
  const currencies = await prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })
  return (
    <>
      <PageHeader title="Nouveau fournisseur" description="Créez une fiche fournisseur pour vos achats." />
      <SupplierForm currencies={currencies} />
    </>
  )
}
