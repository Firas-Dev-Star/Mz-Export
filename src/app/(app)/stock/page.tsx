import Link from 'next/link'
import { AlertTriangle, ArrowLeftRight, Boxes, PackageX, Warehouse } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/shared/pagination'
import { SearchToolbar } from '@/components/shared/search-toolbar'
import { StatCard } from '@/components/shared/stat-card'
import { StockAdjustDialog } from '@/components/stock/stock-adjust-dialog'
import { StockLevelBadge } from '@/components/stock/stock-level-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requirePermission } from '@/lib/auth'
import { formatMoney, formatQuantity, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { getStockOverview } from '@/services/stock.service'

export const metadata = { title: 'Stock — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('stock.read')
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const [overview, products] = await Promise.all([
    getStockOverview({
      search: get('q'),
      level: (get('level') as 'all' | 'out' | 'low' | 'ok') ?? 'all',
      page: Number(get('page') ?? 1),
    }),
    prisma.product.findMany({
      where: { isActive: true, trackStock: true },
      orderBy: { designation: 'asc' },
      select: { id: true, reference: true, designation: true, unit: true },
    }),
  ])

  return (
    <>
      <PageHeader
        title="Stock"
        description="État du stock, valorisé au prix d'achat en dinars."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/stock/movements"><ArrowLeftRight className="h-4 w-4" />Mouvements</Link>
            </Button>
            {can(session.role, 'stock.adjust') ? <StockAdjustDialog products={products} /> : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Produits suivis" value={overview.summary.trackedProducts} icon={Boxes} />
        <StatCard
          label="Valeur du stock"
          value={formatMoney(overview.summary.stockValueTnd, 'TND')}
          secondary="Quantité × prix d'achat"
          icon={Warehouse}
        />
        <StatCard
          label="Stock faible"
          value={overview.summary.lowStock}
          icon={AlertTriangle}
          tone={overview.summary.lowStock > 0 ? 'warning' : 'default'}
          href="/stock?level=low"
        />
        <StatCard
          label="Ruptures"
          value={overview.summary.outOfStock}
          icon={PackageX}
          tone={overview.summary.outOfStock > 0 ? 'danger' : 'default'}
          href="/stock?level=out"
        />
      </div>

      <div className="mt-4">
        <SearchToolbar
          placeholder="Référence, désignation…"
          filters={[
            {
              name: 'level',
              label: 'Tous les niveaux',
              options: [
                { value: 'out', label: 'Rupture' },
                { value: 'low', label: 'Stock faible' },
                { value: 'ok', label: 'Stock normal' },
              ],
            },
          ]}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {overview.rows.length === 0 ? (
            <EmptyState icon={Boxes} title="Aucun produit" description="Aucun produit ne correspond à ce filtre." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Poids (kg)</TableHead>
                  <TableHead className="text-right">Minimum</TableHead>
                  <TableHead className="text-right">Prix d&apos;achat</TableHead>
                  <TableHead className="text-right">Valeur</TableHead>
                  <TableHead>Niveau</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.reference}</TableCell>
                    <TableCell>
                      <Link href={`/products/${row.id}`} className="text-primary hover:underline">
                        {row.designation}
                      </Link>
                      {row.categoryName ? (
                        <span className="ml-2 text-xs text-muted-foreground">{row.categoryName}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {row.trackStock ? `${formatQuantity(row.stockQuantity)} ${row.unit}` : '—'}
                    </TableCell>
                    {/* Poids derive : quantite x poids unitaire, recalcule a
                        chaque affichage donc toujours a jour. */}
                    <TableCell className="tabular whitespace-nowrap text-right text-muted-foreground">
                      {row.trackStock && row.weightKg ? formatNumber(row.weightKg, 3) : '—'}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right text-muted-foreground">
                      {row.trackStock ? formatQuantity(row.minStock) : '—'}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right text-muted-foreground">
                      {formatMoney(row.purchasePriceTnd, 'TND')}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">
                      {row.trackStock ? formatMoney(row.stockValueTnd, 'TND') : '—'}
                    </TableCell>
                    <TableCell><StockLevelBadge level={row.level} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination page={overview.page} pageCount={overview.pageCount} total={overview.total} />
        </CardContent>
      </Card>
    </>
  )
}
