import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { PurchaseForm } from '@/components/purchases/purchase-form'
import { can, requirePermission } from '@/lib/auth'
import { toDateInputValue } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { getPurchase } from '@/services/purchase.service'
import type { PurchaseInput } from '@/validations/purchase'

export const dynamic = 'force-dynamic'

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('purchase.write')
  const { id } = await params

  const purchase = await getPurchase(id)
  if (!purchase) notFound()
  if (purchase.status !== 'DRAFT') redirect(`/purchases/${id}`)

  const [suppliers, products, currencies] = await Promise.all([
    prisma.supplier.findMany({
      where: { OR: [{ isActive: true }, { id: purchase.supplierId }] },
      orderBy: { companyName: 'asc' },
      select: { id: true, companyName: true, paymentTerms: true, currencyCode: true },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { designation: 'asc' },
      select: { id: true, reference: true, designation: true, unit: true, purchasePriceTnd: true },
    }),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
  ])

  const defaultValues: PurchaseInput = {
    supplierId: purchase.supplierId,
    supplierReference: purchase.supplierReference,
    date: toDateInputValue(purchase.date),
    dueDate: toDateInputValue(purchase.dueDate),
    currencyCode: purchase.currencyCode,
    paymentTerms: purchase.paymentTerms,
    shippingLabel: purchase.shippingLabel,
    shippingAmount: String(purchase.shippingAmount),
    otherFeesLabel: purchase.otherFeesLabel,
    otherFeesAmount: String(purchase.otherFeesAmount),
    vatMode: purchase.vatMode,
    vatRate: String(purchase.vatRate),
    stampDutyLabel: purchase.stampDutyLabel,
    stampDutyAmount: String(purchase.stampDutyAmount),
    notes: purchase.notes,
    items: purchase.items.map((item) => ({
      productId: item.productId ?? '',
      reference: item.reference,
      designation: item.designation,
      description: item.description,
      unit: item.unit,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      discountPercent: String(item.discountPercent),
    })),
  }

  return (
    <>
      <PageHeader title="Modifier le brouillon d'achat" />
      <PurchaseForm
        purchaseId={purchase.id}
        defaultValues={defaultValues}
        suppliers={suppliers}
        products={products.map((p) => ({ ...p, purchasePriceTnd: String(p.purchasePriceTnd) }))}
        currencies={currencies}
        canConfirm={can(session.role, 'purchase.confirm')}
      />
    </>
  )
}
