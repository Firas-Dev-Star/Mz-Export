import Link from 'next/link'
import { FilePlus2, ShoppingCart } from 'lucide-react'
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
import { listPurchases } from '@/services/purchase.service'

export const metadata = { title: 'Achats — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireUser()
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const [{ items, total, page, pageCount, sums }, suppliers] = await Promise.all([
    listPurchases({
      search: get('q'),
      status: get('status'),
      supplierId: get('supplierId'),
      filter: (get('filter') as 'unpaid' | 'overdue' | undefined) ?? '',
      page: Number(get('page') ?? 1),
    }),
    prisma.supplier.findMany({ orderBy: { companyName: 'asc' }, select: { id: true, companyName: true } }),
  ])

  return (
    <>
      <PageHeader
        title="Factures d'achat"
        description="Achats fournisseurs libellés en dinars tunisiens."
        actions={
          can(session.role, 'purchase.write') ? (
            <Button asChild><Link href="/purchases/new"><FilePlus2 className="h-4 w-4" />Nouvel achat</Link></Button>
          ) : null
        }
      />

      <SearchToolbar
        placeholder="Numéro, fournisseur, désignation…"
        filters={[
          { name: 'status', label: 'Tous les statuts', options: Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
          { name: 'supplierId', label: 'Tous les fournisseurs', options: suppliers.map((s) => ({ value: s.id, label: s.companyName })) },
          { name: 'filter', label: 'Toutes les factures', options: [{ value: 'unpaid', label: 'Avec solde dû' }, { value: 'overdue', label: 'En retard' }] },
        ]}
      />

      {sums.length > 0 ? (
        <div className="no-print mb-4 flex flex-wrap gap-4">
          {sums.map((s) => (
            <Card key={s.currencyCode} className="min-w-[220px] flex-1">
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
              icon={ShoppingCart}
              title="Aucune facture d'achat"
              description="Enregistrez vos achats pour alimenter le stock."
              action={can(session.role, 'purchase.write') ? <Button asChild size="sm"><Link href="/purchases/new">Nouvel achat</Link></Button> : null}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Réf. fournisseur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Net à payer</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      <Link href={`/purchases/${purchase.id}`} className="text-primary hover:underline">
                        {purchase.status === 'DRAFT' ? 'Brouillon' : purchase.number}
                      </Link>
                      {purchase.isDemo ? <Badge variant="outline" className="ml-2">démo</Badge> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{purchase.supplierReference || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(purchase.date)}</TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      <Link href={`/suppliers/${purchase.supplier.id}`} className="hover:underline">
                        {purchase.supplier.companyName}
                      </Link>
                    </TableCell>
                    <TableCell><StatusBadge status={purchase.status} /></TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(purchase.netToPay, purchase.currencyCode)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">
                      {formatMoney(purchase.balanceDue, purchase.currencyCode)}
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
