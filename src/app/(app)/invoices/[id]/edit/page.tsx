import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { InvoiceForm } from '@/components/invoices/invoice-form'
import { getCurrentRates } from '@/services/exchange.service'
import { can, requirePermission } from '@/lib/auth'
import { toDateInputValue } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { isIncotermCode, isTransportModeCode } from '@/lib/trade'
import { getInvoice } from '@/services/invoice.service'
import { listProductOptions } from '@/services/product.service'
import type { InvoiceInput } from '@/validations/invoice'

export const metadata = { title: 'Modifier la facture — MZ EXPORT' }
export const dynamic = 'force-dynamic'

/**
 * Modification d'un BROUILLON de facture de vente.
 *
 * Une facture confirmee n'est pas modifiable ici : son numero est consomme et
 * ses montants sont figes. Pour corriger ses informations d'expedition
 * (incoterm, destination, domiciliation...), la fiche de la facture propose
 * « Corriger les informations d'expedition », qui ne touche a aucun montant.
 */
export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('invoice.write')
  const { id } = await params

  const invoice = await getInvoice(id)
  if (!invoice) notFound()
  if (invoice.status !== 'DRAFT') redirect(`/invoices/${id}`)

  const [customers, products, currencies, currentRates] = await Promise.all([
    prisma.customer.findMany({
      // Le client de la facture reste proposable meme s'il a ete desactive
      // depuis : sinon le formulaire perdrait silencieusement sa valeur.
      where: { OR: [{ isActive: true }, { id: invoice.customerId }] },
      orderBy: { companyName: 'asc' },
      select: {
        id: true, companyName: true, paymentTerms: true, currencyCode: true,
        deliveryAddress: true, deliveryCountry: true, country: true,
        defaultIncoterm: true,
      },
    }),
    listProductOptions(),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    getCurrentRates(),
  ])

  const defaultValues: InvoiceInput = {
    customerId: invoice.customerId,
    date: toDateInputValue(invoice.date),
    dueDate: toDateInputValue(invoice.dueDate),
    currencyCode: invoice.currencyCode,
    // Le taux FIGE sur le document, jamais le taux de reference courant :
    // rouvrir un brouillon ne doit pas en changer la contrevaleur.
    exchangeRateTnd: String(invoice.exchangeRateTnd),
    paymentTerms: invoice.paymentTerms,
    deliveryAddress: invoice.deliveryAddress,
    deliveryCountry: invoice.deliveryCountry,
    ngp: invoice.ngp,
    originCountry: invoice.originCountry,
    packageCount: invoice.packageCount,
    packageType: invoice.packageType,
    packageDimensions: invoice.packageDimensions,
    grossWeightKg: String(invoice.grossWeightKg),
    netWeightKg: String(invoice.netWeightKg),
    // Colonnes libres en base : on ne retient que les codes des listes fermees.
    incoterm: isIncotermCode(invoice.incoterm) ? invoice.incoterm : '',
    transportMode: isTransportModeCode(invoice.transportMode) ? invoice.transportMode : '',
    departurePort: invoice.departurePort,
    destination: invoice.destination,
    orderReference: invoice.orderReference,
    domiciliationRef: invoice.domiciliationRef,
    feesIncluded: invoice.feesIncluded,
    shippingLabel: invoice.shippingLabel,
    shippingAmount: String(invoice.shippingAmount),
    transitLabel: invoice.transitLabel,
    transitAmount: String(invoice.transitAmount),
    insuranceLabel: invoice.insuranceLabel,
    insuranceAmount: String(invoice.insuranceAmount),
    otherFeesLabel: invoice.otherFeesLabel,
    otherFeesAmount: String(invoice.otherFeesAmount),
    vatMode: invoice.vatMode,
    vatRate: String(invoice.vatRate),
    stampDutyLabel: invoice.stampDutyLabel,
    stampDutyAmount: String(invoice.stampDutyAmount),
    notes: invoice.notes,
    priceBreakdownNote: invoice.priceBreakdownNote,
    items: invoice.items.map((item) => ({
      productId: item.productId ?? '',
      reference: item.reference,
      designation: item.designation,
      description: item.description,
      unit: item.unit,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      discountPercent: String(item.discountPercent),
      ngp: item.ngp,
      originCountry: item.originCountry,
    })),
  }

  return (
    <>
      <PageHeader title="Modifier le brouillon de facture" />
      <InvoiceForm
        invoiceId={invoice.id}
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
