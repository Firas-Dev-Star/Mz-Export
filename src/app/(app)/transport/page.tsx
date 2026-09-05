import Link from 'next/link'
import { FilePlus2, Link2Off, Truck } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/shared/pagination'
import { SearchToolbar } from '@/components/shared/search-toolbar'
import { StatusBadge } from '@/components/shared/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { INVOICE_STATUS_LABELS, formatDate, formatMoney } from '@/lib/format'
import { listCarrierOptions, listTransportInvoices } from '@/services/transport.service'

export const metadata = { title: 'Transport — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireUser()
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const [{ items, total, page, pageCount, sums }, carriers] = await Promise.all([
    listTransportInvoices({
      search: get('q'),
      status: get('status'),
      carrierId: get('carrierId'),
      filter: (get('filter') as 'unpaid' | 'overdue' | 'unlinked' | undefined) ?? '',
      page: Number(get('page') ?? 1),
    }),
    listCarrierOptions(),
  ])

  return (
    <>
      <PageHeader
        title="Factures de transport"
        description="Sociétés de transport et de transit. Prestations d'acheminement, jamais de marchandise : rien n'entre en stock."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/transport/carriers">
                <Truck className="h-4 w-4" />
                Transporteurs
              </Link>
            </Button>
            {can(session.role, 'transport.write') ? (
              <Button asChild>
                <Link href="/transport/new">
                  <FilePlus2 className="h-4 w-4" />
                  Nouvelle facture
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <SearchToolbar
        placeholder="Numéro, transporteur, expédition, vente…"
        filters={[
          {
            name: 'status',
            label: 'Tous les statuts',
            options: Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            name: 'carrierId',
            label: 'Tous les transporteurs',
            options: carriers.map((c) => ({ value: c.id, label: c.companyName })),
          },
          {
            name: 'filter',
            label: 'Toutes les factures',
            options: [
              { value: 'unpaid', label: 'Avec solde dû' },
              { value: 'overdue', label: 'En retard' },
              { value: 'unlinked', label: 'Non rattachées à une vente' },
            ],
          },
        ]}
      />

      {sums.length > 0 ? (
        <div className="no-print mb-4 flex flex-wrap gap-4">
          {sums.map((s) => (
            <Card key={s.currencyCode} className="min-w-[220px] flex-1">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Coût de transport filtré
                  </p>
                  <p className="tabular text-lg font-semibold text-navy-800">
                    {formatMoney(s.netToPay, s.currencyCode)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Solde dû</p>
                  <p className="tabular text-lg font-semibold text-amber-700">
                    {formatMoney(s.balanceDue, s.currencyCode)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Aucune facture de transport"
              description="Enregistrez les factures reçues des sociétés de transport, avec le PDF original en pièce jointe."
              action={
                can(session.role, 'transport.write') ? (
                  <Button asChild size="sm">
                    <Link href="/transport/new">Nouvelle facture</Link>
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
                  <TableHead>Transporteur</TableHead>
                  <TableHead>Expédition</TableHead>
                  <TableHead>Vente</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Net à payer</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((facture) => (
                  <TableRow key={facture.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      <Link href={`/transport/${facture.id}`} className="text-primary hover:underline">
                        {facture.status === 'DRAFT' ? 'Brouillon' : facture.number}
                      </Link>
                      {facture.isDemo ? (
                        <Badge variant="outline" className="ml-2">
                          démo
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {facture.carrierReference || '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(facture.date)}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      <Link
                        href={`/transport/carriers/${facture.carrier.id}`}
                        className="hover:underline"
                      >
                        {facture.carrier.companyName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{facture.shipmentRef || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {facture.invoice ? (
                        <Link
                          href={`/invoices/${facture.invoice.id}`}
                          className="text-primary hover:underline"
                        >
                          {facture.invoice.number}
                        </Link>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-amber-700"
                          title="Rattachez cette facture à une vente pour connaître la marge réelle de l'expédition."
                        >
                          <Link2Off className="h-3.5 w-3.5" />
                          non rattachée
                        </span>
                      )}
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
          <Pagination page={page} pageCount={pageCount} total={total} />
        </CardContent>
      </Card>
    </>
  )
}
