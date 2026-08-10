import { PageHeader } from '@/components/layout/page-header'
import { PurchaseForm } from '@/components/purchases/purchase-form'
import { can, requirePermission } from '@/lib/auth'
import { toDateInputValue } from '@/lib/format'
import { previewNextNumber } from '@/lib/numbering'
import { prisma } from '@/lib/prisma'
import { getPurchaseDefaults } from '@/services/purchase.service'
import type { PurchaseInput } from '@/validations/purchase'

export const metadata = { title: 'Nouvel achat — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('purchase.write')
  const params = await searchParams
  const supplierId = typeof params.supplierId === 'string' ? params.supplierId : undefined

  const [suppliers, products, currencies, defaults, nextNumber] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { companyName: 'asc' },
      select: { id: true, companyName: true, paymentTerms: true, currencyCode: true },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { designation: 'asc' },
      select: { id: true, reference: true, designation: true, unit: true, purchasePriceTnd: true },
    }),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    getPurchaseDefaults(supplierId),
    previewNextNumber('PURCHASE'),
  ])

  const defaultValues: PurchaseInput = {
    supplierId: supplierId ?? '',
    supplierReference: '',
    date: toDateInputValue(new Date()),
    dueDate: '',
    currencyCode: defaults.currencyCode,
    paymentTerms: defaults.paymentTerms,
    shippingLabel: 'Transport',
    shippingAmount: '0',
    otherFeesLabel: 'Autres frais',
    otherFeesAmount: '0',
    vatMode: 'RATE',
    vatRate: defaults.vatRate,
    stampDutyLabel: defaults.stampDutyLabel,
    stampDutyAmount: defaults.stampDutyAmount,
    notes: '',
    items: [
      { productId: '', reference: '', designation: '', description: '', unit: '', quantity: '1', unitPrice: '0', discountPercent: '0' },
    ],
  }

  return (
    <>
      <PageHeader
        title="Nouvel achat"
        description={nextNumber ? `Prochain numéro à la validation : ${nextNumber}` : undefined}
      />
      <PurchaseForm
        defaultValues={defaultValues}
        suppliers={suppliers}
        products={products.map((p) => ({ ...p, purchasePriceTnd: String(p.purchasePriceTnd) }))}
        currencies={currencies}
        canConfirm={can(session.role, 'purchase.confirm')}
      />
    </>
  )
}
