import Link from 'next/link'
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/shared/pagination'
import { PeriodFilter } from '@/components/shared/period-filter'
import { SearchToolbar } from '@/components/shared/search-toolbar'
import { StockAdjustDialog } from '@/components/stock/stock-adjust-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requirePermission } from '@/lib/auth'
import { formatDate, formatQuantity } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { MOVEMENT_LABELS, movementSign } from '@/lib/stock-labels'
import { listStockMovements } from '@/services/stock.service'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Mouvements de stock — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function StockMovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('stock.read')
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const [{ items, total, page, pageCount }, products] = await Promise.all([
    listStockMovements({
      search: get('q'),
      productId: get('productId'),
      type: get('type'),
      from: get('from'),
      to: get('to'),
      page: Number(get('page') ?? 1),
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { designation: 'asc' },
      select: { id: true, reference: true, designation: true, unit: true },
    }),
  ])

  return (
    <>
      <PageHeader
        title="Mouvements de stock"
        description="Historique complet et traçable : aucun stock ne change sans mouvement."
        actions={can(session.role, 'stock.adjust') ? <StockAdjustDialog products={products} /> : null}
      />

      <SearchToolbar
        placeholder="Produit, référence, motif…"
        filters={[
          { name: 'productId', label: 'Tous les produits', options: products.map((p) => ({ value: p.id, label: p.designation })) },
          { name: 'type', label: 'Tous les types', options: Object.entries(MOVEMENT_LABELS).map(([value, label]) => ({ value, label })) },
        ]}
      />
      <PeriodFilter />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="Aucun mouvement"
              description="Les mouvements apparaissent à la validation d'un achat, d'une facture ou d'un ajustement."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Stock après</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Utilisateur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((movement) => {
                  const inbound = movementSign(movement.type) === 1
                  return (
                    <TableRow key={movement.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(movement.date)}</TableCell>
                      <TableCell>
                        <Link href={`/products/${movement.product.id}`} className="text-primary hover:underline">
                          {movement.product.designation}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">{movement.product.reference}</span>
                      </TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center gap-1 text-sm', inbound ? 'text-emerald-700' : 'text-amber-700')}>
                          {inbound ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {MOVEMENT_LABELS[movement.type]}
                        </span>
                      </TableCell>
                      <TableCell className={cn('tabular whitespace-nowrap text-right font-medium', inbound ? 'text-emerald-700' : 'text-amber-700')}>
                        {inbound ? '+' : '−'}{formatQuantity(movement.quantity)} {movement.product.unit}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatQuantity(movement.stockAfter)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{movement.reference || '—'}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-muted-foreground">{movement.note || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{movement.user?.name ?? '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <Pagination page={page} pageCount={pageCount} total={total} />
        </CardContent>
      </Card>
    </>
  )
}
