import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { TransportInvoiceForm } from '@/components/transport/transport-invoice-form'
import { can, requirePermission } from '@/lib/auth'
import { toDateInputValue } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import {
  getTransportInvoice,
  listCarrierOptions,
  listInvoiceOptionsForTransport,
} from '@/services/transport.service'
import type { TransportInvoiceInput } from '@/validations/transport'

export const dynamic = 'force-dynamic'

export default async function EditTransportInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requirePermission('transport.write')
  const { id } = await params

  const facture = await getTransportInvoice(id)
  if (!facture) notFound()
  if (facture.status !== 'DRAFT') redirect(`/transport/${id}`)

  const [carriers, sales, currencies] = await Promise.all([
    listCarrierOptions(),
    listInvoiceOptionsForTransport(),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
  ])

  // Le transporteur du brouillon reste proposable même s'il a été désactivé
  // depuis : sinon le formulaire perdrait silencieusement sa valeur.
  const options = carriers.some((c) => c.id === facture.carrierId)
    ? carriers
    : [
        {
          id: facture.carrier.id,
          code: facture.carrier.code,
          companyName: facture.carrier.companyName,
          currencyCode: facture.carrier.currencyCode,
          paymentTerms: facture.carrier.paymentTerms,
        },
        ...carriers,
      ]

  const defaultValues: TransportInvoiceInput = {
    carrierId: facture.carrierId,
    carrierReference: facture.carrierReference,
    date: toDateInputValue(facture.date),
    dueDate: toDateInputValue(facture.dueDate),
    shipmentRef: facture.shipmentRef,
    invoiceId: facture.invoiceId ?? '',
    currencyCode: facture.currencyCode,
    paymentTerms: facture.paymentTerms,
    transportLabel: facture.transportLabel,
    transportAmount: String(facture.transportAmount),
    transitLabel: facture.transitLabel,
    transitAmount: String(facture.transitAmount),
    otherFeesLabel: facture.otherFeesLabel,
    otherFeesAmount: String(facture.otherFeesAmount),
    vatMode: facture.vatMode,
    vatRate: String(facture.vatRate),
    stampDutyLabel: facture.stampDutyLabel,
    stampDutyAmount: String(facture.stampDutyAmount),
    notes: facture.notes,
  }

  return (
    <>
      <PageHeader title="Modifier le brouillon de transport" />
      <TransportInvoiceForm
        transportInvoiceId={facture.id}
        defaultValues={defaultValues}
        carriers={options}
        sales={sales.map((s) => ({
          id: s.id,
          number: s.number,
          date: s.date,
          currencyCode: s.currencyCode,
          netToPay: String(s.netToPay),
          customerName: s.customer.companyName,
        }))}
        currencies={currencies}
        canConfirm={can(session.role, 'transport.confirm')}
      />
    </>
  )
}
