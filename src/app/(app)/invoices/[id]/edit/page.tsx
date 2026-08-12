import { PageHeader } from '@/components/layout/page-header'
import { InvoiceForm } from '@/components/invoices/invoice-form'
import { isIncotermCode } from '@/lib/trade'
import { getCurrentRates } from '@/services/exchange.service'
import { can, requirePermission } from '@/lib/auth'
import { toDateInputValue } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { previewNextNumber } from '@/lib/numbering'
import { getInvoiceDefaults } from '@/services/invoice.service'
import { listProductOptions } from '@/services/product.service'
import type { InvoiceInput } from '@/validations/invoice'

export const metadata = { title: 'Nouvelle facture — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('invoice.write')
  const params = await searchParams
  const customerId = typeof params.customerId === 'string' ? params.customerId : undefined

  const [customers, products, currencies, defaults, nextNumber, currentRates] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { companyName: 'asc' },
      select: {
        id: true, companyName: true, paymentTerms: true, currencyCode: true,
        deliveryAddress: true, deliveryCountry: true, country: true,
      },
    }),
    listProductOptions(),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    getInvoiceDefaults(customerId),
    previewNextNumber('SALE'),
    getCurrentRates(),
  ])

  const today = toDateInputValue(new Date())

  const defaultValues: InvoiceInput = {
    customerId: customerId ?? '',
    date: today,
    dueDate: '',
    currencyCode: defaults.currencyCode,
    // Pre-rempli depuis les taux de reference ; l'utilisateur peut le corriger.
    exchangeRateTnd: currentRates[defaults.currencyCode] ?? '',
    paymentTerms: defaults.paymentTerms,
    deliveryAddress: defaults.deliveryAddress,
    deliveryCountry: defaults.deliveryCountry,
    ngp: '',
    originCountry: defaults.originCountry,
    packageCount: 0,
    packageType: '',
    packageDimensions: '',
    grossWeightKg: '0',
    netWeightKg: '0',
    // `defaults.incoterm` vient des parametres societe (colonne String) :
    // on ne le retient que s'il correspond a un code de la liste.
    incoterm: isIncotermCode(defaults.incoterm) ? defaults.incoterm : '',
    transportMode: '',
    departurePort: '',
    destination: '',
    orderReference: '',
    feesIncluded: true,
    shippingLabel: 'Transport',
    shippingAmount: '0',
    transitLabel: 'Transit',
    transitAmount: '0',
    insuranceLabel: 'Assurance',
    insuranceAmount: '0',
    otherFeesLabel: 'Autres frais',
    otherFeesAmount: '0',
    vatMode: defaults.vatMode,
    vatRate: defaults.vatRate,
    stampDutyLabel: defaults.stampDutyLabel,
    stampDutyAmount: defaults.stampDutyAmount,
    notes: '',
    priceBreakdownNote: '',
    items: [
      {
        productId: '', reference: '', designation: '', description: '', unit: '',
        quantity: '1', unitPrice: '0', discountPercent: '0', ngp: '', originCountry: '',
      },
    ],
  }

  return (
    <>
      <PageHeader
        title="Nouvelle facture"
        description={nextNumber ? `Prochain numéro à la confirmation : ${nextNumber}` : undefined}
      />
      <InvoiceForm
        defaultValues={defaultValues}
        customers={customers}
        products={products}
        currencies={currencies}
        currentRates={currentRates}
        canConfirm={can(session.role, 'invoice.confirm')}
      />
    </>
  )
}
