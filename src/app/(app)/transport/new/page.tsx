import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { TransportInvoiceForm } from '@/components/transport/transport-invoice-form'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Truck } from 'lucide-react'
import { can, requirePermission } from '@/lib/auth'
import { toDateInputValue } from '@/lib/format'
import { previewNextNumber } from '@/lib/numbering'
import { prisma } from '@/lib/prisma'
import { listCarrierOptions, listInvoiceOptionsForTransport } from '@/services/transport.service'
import type { TransportInvoiceInput } from '@/validations/transport'

export const metadata = { title: 'Nouvelle facture de transport — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function NewTransportInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('transport.write')
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const [carriers, sales, currencies, nextNumber] = await Promise.all([
    listCarrierOptions(),
    listInvoiceOptionsForTransport(),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    previewNextNumber('TRANSPORT'),
  ])

  // Sans transporteur, le formulaire ne mene a rien : on dit quoi faire.
  if (carriers.length === 0) {
    return (
      <>
        <PageHeader title="Nouvelle facture de transport" />
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Truck}
              title="Aucun transporteur enregistré"
              description="Créez d'abord la société de transport : c'est elle qui portera ses factures et ses règlements."
              action={
                <Button asChild size="sm">
                  <Link href="/transport/carriers/new">Créer un transporteur</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </>
    )
  }

  const carrierId = get('carrierId') ?? ''
  const carrier = carriers.find((c) => c.id === carrierId)

  const defaultValues: TransportInvoiceInput = {
    carrierId,
    carrierReference: '',
    date: toDateInputValue(new Date()),
    dueDate: '',
    shipmentRef: '',
    invoiceId: get('invoiceId') ?? '',
    currencyCode: carrier?.currencyCode ?? 'TND',
    paymentTerms: carrier?.paymentTerms ?? '',
    transportLabel: 'Transport',
    transportAmount: '0',
    transitLabel: 'Transit et douane',
    transitAmount: '0',
    otherFeesLabel: 'Autres frais',
    otherFeesAmount: '0',
    // Les factures de transport recues ne portent pas de detail de TVA :
    // le regime par defaut est « non applicable », a changer si besoin.
    vatMode: 'NONE',
    vatRate: '0',
    stampDutyLabel: 'Timbre fiscal',
    stampDutyAmount: '0',
    notes: '',
  }

  return (
    <>
      <PageHeader
        title="Nouvelle facture de transport"
        description={nextNumber ? `Prochain numéro à la validation : ${nextNumber}` : undefined}
      />
      <TransportInvoiceForm
        defaultValues={defaultValues}
        carriers={carriers}
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
