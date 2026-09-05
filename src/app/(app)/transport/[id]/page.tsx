import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CreditCard, Pencil } from 'lucide-react'
import { deleteTransportInvoice } from '@/actions/transport.actions'
import { DocumentPanel } from '@/components/documents/document-panel'
import { PageHeader } from '@/components/layout/page-header'
import { DeleteButton } from '@/components/shared/delete-button'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  CancelTransportInvoiceButton,
  ConfirmTransportInvoiceButton,
  LinkSaleDialog,
} from '@/components/transport/transport-actions'
import {
  DeleteTransportPaymentButton,
  TransportPaymentDialog,
} from '@/components/transport/transport-payment-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { TRANSPORT_DOCUMENT_KINDS } from '@/lib/document-file'
import { PAYMENT_METHOD_LABELS, formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { gt, round } from '@/lib/money'
import { previewNextNumber } from '@/lib/numbering'
import { listDocuments } from '@/services/document.service'
import { getTransportInvoice, listInvoiceOptionsForTransport } from '@/services/transport.service'

export const dynamic = 'force-dynamic'

export default async function TransportInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireUser()
  const { id } = await params

  const facture = await getTransportInvoice(id)
  if (!facture) notFound()

  const isDraft = facture.status === 'DRAFT'
  const isCancelled = facture.status === 'CANCELLED'
  const remaining = round(facture.balanceDue, 3).toFixed(3)

  const [documents, nextNumber, sales] = await Promise.all([
    listDocuments({ transportInvoiceId: id }),
    isDraft ? previewNextNumber('TRANSPORT') : Promise.resolve(''),
    can(session.role, 'transport.write') ? listInvoiceOptionsForTransport() : Promise.resolve([]),
  ])

  return (
    <>
      <PageHeader
        title={isDraft ? 'Brouillon de transport' : `Facture de transport ${facture.number}`}
        description={`${facture.carrier.companyName} — ${formatDate(facture.date)}`}
        actions={
          <>
            {!isCancelled && can(session.role, 'transport.write') ? (
              <LinkSaleDialog
                transportInvoiceId={facture.id}
                currentInvoiceId={facture.invoiceId}
                sales={sales.map((s) => ({
                  id: s.id,
                  number: s.number,
                  date: s.date,
                  customerName: s.customer.companyName,
                }))}
              />
            ) : null}
            {isDraft && can(session.role, 'transport.write') ? (
              <Button asChild variant="outline">
                <Link href={`/transport/${facture.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Modifier
                </Link>
              </Button>
            ) : null}
            {isDraft && can(session.role, 'transport.confirm') ? (
              <ConfirmTransportInvoiceButton transportInvoiceId={facture.id} nextNumber={nextNumber} />
            ) : null}
            {!isDraft && !isCancelled && can(session.role, 'transport.cancel') ? (
              <CancelTransportInvoiceButton transportInvoiceId={facture.id} number={facture.number} />
            ) : null}
            {(isDraft || isCancelled) && can(session.role, 'transport.delete') ? (
              <DeleteButton
                action={async () => {
                  'use server'
                  return deleteTransportInvoice(facture.id)
                }}
                title="Supprimer définitivement ?"
                description="Une facture de transport validée doit être annulée plutôt que supprimée."
                redirectTo="/transport"
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p>
            <div className="mt-2">
              <StatusBadge status={facture.status} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Net à payer</p>
            <p className="tabular mt-1 text-xl font-semibold text-navy-800">
              {formatMoney(facture.netToPay, facture.currencyCode)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Réglé</p>
            <p className="tabular mt-1 text-xl font-semibold text-emerald-700">
              {formatMoney(facture.paidAmount, facture.currencyCode)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Solde dû</p>
            <p className="tabular mt-1 text-xl font-semibold text-amber-700">
              {formatMoney(facture.balanceDue, facture.currencyCode)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>L&apos;expédition</CardTitle>
            <CardDescription>
              {facture.invoice
                ? 'Cette facture est rattachée à une vente : son coût entre dans la marge de l’expédition.'
                : 'Non rattachée à une vente. Le rattachement permet de connaître la marge réelle de l’expédition.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Transporteur</dt>
                <dd className="font-medium">
                  <Link
                    href={`/transport/carriers/${facture.carrier.id}`}
                    className="text-primary hover:underline"
                  >
                    {facture.carrier.companyName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">N° de facture du transporteur</dt>
                <dd className="font-medium">{facture.carrierReference || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Référence de l&apos;expédition</dt>
                <dd className="font-medium">{facture.shipmentRef || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Facture de vente couverte</dt>
                <dd className="font-medium">
                  {facture.invoice ? (
                    <Link
                      href={`/invoices/${facture.invoice.id}`}
                      className="text-primary hover:underline"
                    >
                      {facture.invoice.number} — {facture.invoice.customer.companyName}
                    </Link>
                  ) : (
                    <span className="text-amber-700">Non rattachée</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Date</dt>
                <dd className="font-medium">{formatDate(facture.date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Échéance</dt>
                <dd className="font-medium">
                  {facture.dueDate ? formatDate(facture.dueDate) : '—'}
                </dd>
              </div>
              {facture.paymentTerms ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Conditions de paiement</dt>
                  <dd className="font-medium">{facture.paymentTerms}</dd>
                </div>
              ) : null}
            </dl>

            {facture.notes ? (
              <p className="mt-4 rounded-md border border-border bg-secondary/40 p-3 text-xs">
                {facture.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Montants</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between py-1">
                <dt className="text-muted-foreground">{facture.transportLabel}</dt>
                <dd className="tabular">
                  {formatMoney(facture.transportAmount, facture.currencyCode)}
                </dd>
              </div>
              {gt(facture.transitAmount, 0) ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">{facture.transitLabel}</dt>
                  <dd className="tabular">
                    {formatMoney(facture.transitAmount, facture.currencyCode)}
                  </dd>
                </div>
              ) : null}
              {gt(facture.otherFeesAmount, 0) ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">{facture.otherFeesLabel}</dt>
                  <dd className="tabular">
                    {formatMoney(facture.otherFeesAmount, facture.currencyCode)}
                  </dd>
                </div>
              ) : null}
              <div className="my-2 border-t border-border" />
              <div className="flex justify-between py-1">
                <dt className="text-muted-foreground">Total HT</dt>
                <dd className="tabular font-medium">
                  {formatMoney(facture.totalHt, facture.currencyCode)}
                </dd>
              </div>
              {facture.vatMode !== 'NONE' ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">TVA ({String(facture.vatRate)} %)</dt>
                  <dd className="tabular">{formatMoney(facture.vatAmount, facture.currencyCode)}</dd>
                </div>
              ) : null}
              {gt(facture.stampDutyAmount, 0) ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">{facture.stampDutyLabel}</dt>
                  <dd className="tabular">
                    {formatMoney(facture.stampDutyAmount, facture.currencyCode)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between rounded-md bg-navy-800 px-3 py-2 text-white">
                <dt className="font-medium">Net à payer</dt>
                <dd className="tabular font-semibold">
                  {formatMoney(facture.netToPay, facture.currencyCode)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <DocumentPanel
          transportInvoiceId={facture.id}
          documents={documents}
          kinds={TRANSPORT_DOCUMENT_KINDS}
          canWrite={can(session.role, 'transport.write')}
          title="Pièces justificatives"
          description="La facture originale du transporteur et le bon de livraison qu'il remet. Ce sont ces documents qui ont valeur probante."
        />
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Règlements</CardTitle>
            <CardDescription>{facture.payments.length} règlement(s) enregistré(s).</CardDescription>
          </div>
          {can(session.role, 'payment.write') && !isDraft && !isCancelled && gt(remaining, 0) ? (
            <TransportPaymentDialog
              transportInvoiceId={facture.id}
              currencyCode={facture.currencyCode}
              remaining={remaining}
            />
          ) : null}
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {facture.payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="Aucun règlement"
              description={isDraft ? 'Validez la facture pour enregistrer un règlement.' : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="w-1" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {facture.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(payment.date)}</TableCell>
                    <TableCell>{PAYMENT_METHOD_LABELS[payment.method]}</TableCell>
                    <TableCell className="text-muted-foreground">{payment.reference || '—'}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(payment.amount, payment.currencyCode)}
                    </TableCell>
                    <TableCell>
                      {can(session.role, 'payment.delete') ? (
                        <DeleteTransportPaymentButton paymentId={payment.id} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Créée par {facture.createdBy?.name ?? '—'} le {formatDateTime(facture.createdAt)}
        {facture.confirmedAt ? ` · validée le ${formatDateTime(facture.confirmedAt)}` : ''}
        {facture.cancelledAt ? ` · annulée le ${formatDateTime(facture.cancelledAt)}` : ''}
      </p>
    </>
  )
}
