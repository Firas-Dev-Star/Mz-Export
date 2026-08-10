import { PageHeader } from '@/components/layout/page-header'
import { CustomerForm } from '@/components/customers/customer-form'
import { requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Nouveau client — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function NewCustomerPage() {
  await requirePermission('customer.write')
  const currencies = await prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })

  return (
    <>
      <PageHeader title="Nouveau client" description="Créez une fiche client pour vos ventes export." />
      <CustomerForm currencies={currencies} />
    </>
  )
}
