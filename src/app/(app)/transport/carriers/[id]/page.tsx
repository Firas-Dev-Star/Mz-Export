import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FilePlus2, Pencil, Truck } from 'lucide-react'
import { deleteCarrier } from '@/actions/transport.actions'
import { PageHeader } from '@/components/layout/page-header'
import { DeleteButton } from '@/components/shared/delete-button'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { formatDate, formatMoney } from '@/lib/format'
import { getCarrier, getCarrierTotals } from '@/services/transport.service'

export const dynamic = 'force-dynamic'

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line text-sm text-navy-800">{value}</dd>
    </div>
  )
}

export default async function CarrierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser()
  const { id } = await params

  const carrier = await getCarrier(id)
  if (!carrier) notFound()
  const totals = await getCarrierTotals(id)

  const adresse = [
    carrier.addressLine1,
    carrier.addressLine2,
    [carrier.postalCode, carrier.city].filter(Boolean).join(' '),
    carrier.country,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <>
      <PageHeader
        title={carrier.companyName}
        description={`Code ${carrier.code}${carrier.isActive ? '' : ' — transporteur inactif'}`}
        actions={
          <>
            {can(session.role, 'transport.write') ? (
              <Button asChild variant="outline">
                <Link href={`/transport/new?carrierId=${carrier.id}`}>
                  <FilePlus2 className="h-4 w-4" />
                  Nouvelle facture
                </Link>
              </Button>
            ) : null}
            {can(session.role, 'carrier.write') ? (
              <Button asChild variant="outline">
                <Link href={`/transport/carriers/${carrier.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Modifier
                </Link>
              </Button>
            ) : null}
            {can(session.role, 'carrier.delete') ? (
              <DeleteButton
                action={async () => {
                  'use server'
                  return deleteCarrier(carrier.id)
                }}
                title="Supprimer ce transporteur ?"
                description="Impossible s'il porte des factures : désactivez-le plutôt, pour conserver son historique."
                redirectTo="/transport/carriers"
              />
            ) : null}
          </>
        }
      />

      {totals.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {totals.map((t) => (
            <Card key={t.currencyCode}>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Facturé ({t.count} facture{t.count > 1 ? 's' : ''})
                </p>
                <p className="tabular mt-1 text-xl font-semibold text-navy-800">
                  {formatMoney(t.netToPay, t.currencyCode)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Réglé {formatMoney(t.paidAmount, t.currencyCode)} · solde dû{' '}
                  <span className="font-medium text-amber-700">
                    {formatMoney(t.balanceDue, t.currencyCode)}
                  </span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Coordonnées</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <InfoRow label="Contact" value={carrier.contactName} />
              <InfoRow label="Téléphone" value={carrier.phone} />
              <InfoRow label="Email" value={carrier.email} />
              <InfoRow label="Adresse" value={adresse} />
              <InfoRow label="Matricule fiscal" value={carrier.taxId} />
              <InfoRow label="Registre de commerce" value={carrier.tradeRegister} />
              <InfoRow label="Conditions de paiement" value={carrier.paymentTerms} />
              <InfoRow label="Devise" value={carrier.currencyCode} />
              <InfoRow label="Notes internes" value={carrier.notes} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Factures de transport</CardTitle>
            <CardDescription>
              {carrier._count.invoices} facture(s) au total
              {carrier._count.invoices > carrier.invoices.length
                ? ` — les ${carrier.invoices.length} plus récentes`
                : ''}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {carrier.invoices.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Aucune facture"
                description="Les factures reçues de ce transporteur apparaîtront ici."
                action={
                  can(session.role, 'transport.write') ? (
                    <Button asChild size="sm">
                      <Link href={`/transport/new?carrierId=${carrier.id}`}>Nouvelle facture</Link>
                    </Button>
                  ) : null
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Réf. transporteur</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Expédition</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Net à payer</TableHead>
                    <TableHead className="text-right">Solde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carrier.invoices.map((facture) => (
                    <TableRow key={facture.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        <Link href={`/transport/${facture.id}`} className="text-primary hover:underline">
                          {facture.status === 'DRAFT' ? 'Brouillon' : facture.number}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {facture.carrierReference || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(facture.date)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {facture.shipmentRef || '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={facture.status} />
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatMoney(facture.netToPay, facture.currencyCode)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatMoney(facture.balanceDue, facture.currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
