import Link from 'next/link'
import { FilePlus2, FileText } from 'lucide-react'
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
import { prisma } from '@/lib/prisma'
import { listInvoices, markOverdueInvoices } from '@/services/invoice.service'

export const metadata = { title: 'Factures — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireUser()
  await markOverdueInvoices()

  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const [{ items, total, page, pageCount, sums }, customers] = await Promise.all([
    listInvoices({
      search: get('q'),
      status: get('status'),
      customerId: get('customerId'),
      filter: (get('filter') as 'unpaid' | 'overdue' | undefined) ?? '',
      from: get('from'),
      to: get('to'),
      page: Number(get('page') ?? 1),
    }),
    prisma.customer.findMany({ orderBy: { companyName: 'asc' }, select: { id: true, companyName: true } }),
  ])

  return (
    <>
      <PageHeader
        title="Factures de vente"
        description="Factures export libellées en euros."
        actions={
          can(session.role, 'invoice.write') ? (
            <Button asChild><Link href="/invoices/new"><FilePlus2 className="h-4 w-4" />Nouvelle facture</Link></Button>
          ) : null
        }
      />

      <SearchToolbar
        placeholder="Numéro, client, SIRET, désignation…"
        filters={[
          {
            name: 'status',
            label: 'Tous les statuts',
            options: Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            name: 'customerId',
            label: 'Tous les clients',
            options: customers.map((c) => ({ value: c.id, label: c.companyName })),
          },
          {
            name: 'filter',
            label: 'Toutes les factures',
            options: [
              { value: 'unpaid', label: 'Avec solde dû' },
              { value: 'overdue', label: 'En retard' },
            ],
          },
        ]}
      />

      {sums.length > 0 ? (
        <div className="no-print mb-4 flex flex-wrap gap-4">
          {sums.map((s) => (
            <Card key={s.currencyCode} className="flex-1 min-w-[200px]">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total filtré</p>
                  <p className="tabular text-lg font-semibold text-navy-800">{formatMoney(s.netToPay, s.currencyCode)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Solde dû</p>
                  <p className="tabular text-lg font-semibold text-amber-700">{formatMoney(s.balanceDue, s.currencyCode)}</p>
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
              icon={FileText}
              title="Aucune facture"
              description="Aucune facture ne correspond à votre recherche."
              action={can(session.role, 'invoice.write') ? <Button asChild size="sm"><Link href="/invoices/new">Créer une facture</Link></Button> : null}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Net à payer</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      <Link href={`/invoices/${invoice.id}`} className="text-primary hover:underline">
                        {invoice.status === 'DRAFT' ? 'Brouillon' : invoice.number}
                      </Link>
                      {invoice.isDemo ? <Badge variant="outline" className="ml-2">démo</Badge> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(invoice.date)}</TableCell>
                    <TableCell className="max-w-[240px] truncate">
                      <Link href={`/customers/${invoice.customer.id}`} className="hover:underline">
                        {invoice.customer.companyName}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(invoice.dueDate) || '—'}</TableCell>
                    <TableCell><StatusBadge status={invoice.status} /></TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(invoice.netToPay, invoice.currencyCode)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">
                      {formatMoney(invoice.balanceDue, invoice.currencyCode)}
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
