import { PageHeader } from '@/components/layout/page-header'
import { CarrierForm } from '@/components/transport/carrier-form'
import { requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Nouveau transporteur — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function NewCarrierPage() {
  await requirePermission('carrier.write')
  const currencies = await prisma.currency.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  })
  return (
    <>
      <PageHeader
        title="Nouveau transporteur"
        description="Société de transport ou de transit. Ses factures se rattachent aux expéditions, pas au stock."
      />
      <CarrierForm currencies={currencies} />
    </>
  )
}
