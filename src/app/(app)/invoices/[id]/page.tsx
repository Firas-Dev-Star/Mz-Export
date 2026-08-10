import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Download, Eye, Pencil, Printer } from 'lucide-react'
import { deleteInvoice } from '@/actions/invoice.actions'
import { PageHeader } from '@/components/layout/page-header'
import {
  CancelInvoiceButton,
  ConfirmInvoiceButton,
  DuplicateInvoiceButton,
} from '@/components/invoices/invoice-actions'
import { PaymentDialog } from '@/components/payments/payment-dialog'
import { DeleteButton } from '@/components/shared/delete-button'
import { DeletePaymentButton } from '@/components/payments/delete-payment-button'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { PAYMENT_METHOD_LABELS, formatDate, formatDateTime, formatMoney, formatQuantity } from '@/lib/format'
import { previewNextNumber } from '@/lib/numbering'
import { round } from '@/lib/money'
import { getInvoice } from '@/services/invoice.service'

export const dynamic = 'force-dynamic'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser()
  const { id } = await params

  const invoice = await getInvoice(id)
  if (!invoice) notFound()

  const isDraft = invoice.status === 'DRAFT'
  const isCancelled = invoice.status === 'CANCELLED'
  const remaining = round(invoice.balanceDue, 2).toFixed(2)
  const nextNumber = isDraft ? await previewNextNumber('SALE') : ''
  const editable = isDraft

  return (
    <>
      <PageHeader
        title={isDraft ? 'Brouillon de facture' : `Facture ${invoice.number}`}
        description={`${invoice.customer.companyName} — ${formatDate(invoice.date)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/invoices/${invoice.id}/print`}>
                <Printer className="h-4 w-4" />
                Aperçu / Imprimer
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
                <Eye className="h-4 w-4" />
                Voir le PDF
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/invoices/${invoice.id}/pdf?download=1`}>
                <Download className="h-4 w-4" />
                Télécharger
              </a>
            </Button>
            {editable && can(session.role, 'invoice.write') ? (
              <Button asChild variant="outline">
                <Link href={`/invoices/${invoice.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Modifier
                </Link>
              </Button>
            ) : null}
            <DuplicateInvoiceButton invoiceId={invoice.id} />
            {isDraft && can(session.role, 'invoice.confirm') ? (
              <ConfirmInvoiceButton invoiceId={invoice.id} nextNumber={nextNumber} />
            ) : null}
            {!isDraft && !isCancelled && can(session.role, 'invoice.cancel') ? (
              <CancelInvoiceButton invoiceId={invoice.id} number={invoice.number} />
            ) : null}
            {(isDraft || isCancelled) && can(session.role, 'invoice.delete') ? (
              <DeleteButton
                action={async () => {
                  'use server'
                  return deleteInvoice(invoice.id)
                }}
                title="Supprimer définitivement ?"
                description="Cette facture sera effacée de la base. Une facture confirmée doit être annulée plutôt que supprimée."
                redirectTo="/invoices"
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p>
            <div className="mt-2"><StatusBadge status={invoice.status} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Net à payer</p>
            <p className="tabular mt-1 text-xl font-semibold text-navy-800">
              {formatMoney(invoice.netToPay, invoice.currencyCode)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Encaissé</p>
            <p className="tabular mt-1 text-xl font-semibold text-emerald-700">
              {formatMoney(invoice.paidAmount, invoice.currencyCode)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Solde dû</p>
            <p className="tabular mt-1 text-xl font-semibold text-amber-700">
              {formatMoney(invoice.balanceDue, invoice.currencyCode)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Lignes</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Désignation</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
                <TableHead className="text-right">P.U.</TableHead>
                <TableHead className="text-right">Remise</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{item.reference || '—'}</TableCell>
                  <TableCell>
                    <span className="font-medium">{item.designation}</span>
                    {item.description ? (
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">
                    {formatQuantity(item.quantity)} {item.unit}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">
                    {formatMoney(item.unitPrice, invoice.currencyCode)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {Number(item.discountPercent) > 0 ? `${formatQuantity(item.discountPercent)} %` : '—'}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-medium">
                    {formatMoney(item.lineTotal, invoice.currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex justify-end px-5">
            <dl className="w-full max-w-sm space-y-1 text-sm">
              <div className="flex justify-between py-1">
                <dt className="text-muted-foreground">Total des lignes</dt>
                <dd className="tabular">{formatMoney(invoice.goodsTotal, invoice.currencyCode)}</dd>
              </div>
              {invoice.feesIncluded ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">Frais compris dans le prix</dt>
                  <dd className="tabular text-muted-foreground">oui</dd>
                </div>
              ) : null}
              {[
                { label: invoice.shippingLabel, value: invoice.shippingAmount },
                { label: invoice.transitLabel, value: invoice.transitAmount },
                { label: invoice.insuranceLabel, value: invoice.insuranceAmount },
                { label: invoice.otherFeesLabel, value: invoice.otherFeesAmount },
              ]
                .filter((f) => Number(f.value) > 0)
                .map((f) => (
                  <div key={f.label} className="flex justify-between py-1">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="tabular">{formatMoney(f.value, invoice.currencyCode)}</dd>
                  </div>
                ))}
              <div className="flex justify-between border-t border-border py-1 pt-2">
                <dt className="text-muted-foreground">Total HTVA</dt>
                <dd className="tabular font-medium">{formatMoney(invoice.totalHt, invoice.currencyCode)}</dd>
              </div>
              {invoice.vatMode !== 'NONE' ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">TVA</dt>
                  <dd className="tabular">{formatMoney(invoice.vatAmount, invoice.currencyCode)}</dd>
                </div>
              ) : null}
              {Number(invoice.stampDutyAmount) > 0 ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">{invoice.stampDutyLabel}</dt>
                  <dd className="tabular">{formatMoney(invoice.stampDutyAmount, invoice.currencyCode)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between rounded-md bg-navy-800 px-3 py-2 text-white">
                <dt className="font-medium">Net à payer</dt>
                <dd className="tabular font-semibold">{formatMoney(invoice.netToPay, invoice.currencyCode)}</dd>
              </div>
            </dl>
          </div>

          {invoice.priceBreakdownNote ? (
            <p className="mx-5 mt-4 rounded-md border border-border bg-secondary/40 p-3 text-xs">
              {invoice.priceBreakdownNote}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Informations export</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['NGP', invoice.ngp],
                ['Origine', invoice.originCountry],
                ['Colis', invoice.packageCount ? `${invoice.packageCount} ${invoice.packageType || 'COLIS'}` : ''],
                ['Dimensions', invoice.packageDimensions],
                ['Poids brut', Number(invoice.grossWeightKg) ? `${formatQuantity(invoice.grossWeightKg)} kg` : ''],
                ['Poids net', Number(invoice.netWeightKg) ? `${formatQuantity(invoice.netWeightKg)} kg` : ''],
                ['Incoterm', invoice.incoterm],
                ['Transport', invoice.transportMode],
                ['Départ', invoice.departurePort],
                ['Destination', invoice.destination],
                ['Réf. commande', invoice.orderReference],
                ['Conditions de paiement', invoice.paymentTerms],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className="text-navy-800">{value}</dd>
                  </div>
                ))}
            </dl>
            {invoice.deliveryAddress ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Adresse de livraison</p>
                <p className="whitespace-pre-line text-sm text-navy-800">{invoice.deliveryAddress}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Règlements</CardTitle>
              <CardDescription>
                {invoice.payments.length} règlement(s) enregistré(s).
              </CardDescription>
            </div>
            {can(session.role, 'payment.write') && !isDraft && !isCancelled && Number(remaining) > 0 ? (
              <PaymentDialog invoiceId={invoice.id} currencyCode={invoice.currencyCode} remaining={remaining} />
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {invoice.payments.length === 0 ? (
              <EmptyState
                icon={Printer}
                title="Aucun règlement"
                description={
                  isDraft
                    ? 'Confirmez la facture pour pouvoir enregistrer un règlement.'
                    : 'Enregistrez le premier règlement de cette facture.'
                }
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
                  {invoice.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(payment.date)}</TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[payment.method]}</TableCell>
                      <TableCell className="text-muted-foreground">{payment.reference || '—'}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatMoney(payment.amount, payment.currencyCode)}
                      </TableCell>
                      <TableCell>
                        {can(session.role, 'payment.delete') ? (
                          <DeletePaymentButton paymentId={payment.id} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Créée par {invoice.createdBy?.name ?? '—'} le {formatDateTime(invoice.createdAt)}
        {invoice.confirmedAt ? ` · confirmée le ${formatDateTime(invoice.confirmedAt)}` : ''}
        {invoice.cancelledAt ? ` · annulée le ${formatDateTime(invoice.cancelledAt)}` : ''}
      </p>
    </>
  )
}
