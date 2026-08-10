import Link from 'next/link'
import { CheckCircle2, PackageX, TrendingDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { StockAdjustDialog } from '@/components/stock/stock-adjust-dialog'
import { StockLevelBadge } from '@/components/stock/stock-level-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requirePermission } from '@/lib/auth'
import { formatQuantity } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { getStockAlerts } from '@/services/stock.service'

export const metadata = { title: 'Alertes stock — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function StockAlertsPage() {
  const session = await requirePermission('stock.read')
  const [{ outOfStock, lowStock }, products] = await Promise.all([
    getStockAlerts(),
    prisma.product.findMany({
      where: { isActive: true, trackStock: true },
      orderBy: { designation: 'asc' },
      select: { id: true, reference: true, designation: true, unit: true },
    }),
  ])

  const sections = [
    { key: 'out', title: 'Ruptures de stock', description: 'Produits dont le stock est nul ou négatif.', rows: outOfStock, icon: PackageX },
    { key: 'low', title: 'Stock faible', description: 'Produits sous leur seuil minimum.', rows: lowStock, icon: TrendingDown },
  ]

  return (
    <>
      <PageHeader
        title="Alertes de stock"
        description="Produits à réapprovisionner."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/purchases/new">Nouvel achat</Link></Button>
            {can(session.role, 'stock.adjust') ? <StockAdjustDialog products={products} /> : null}
          </>
        }
      />

      {outOfStock.length === 0 && lowStock.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CheckCircle2}
              title="Aucune alerte"
              description="Tous les produits suivis sont au-dessus de leur seuil minimum."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sections.map((section) =>
            section.rows.length === 0 ? null : (
              <Card key={section.key}>
                <CardHeader>
                  <CardTitle>{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Référence</TableHead>
                        <TableHead>Désignation</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Minimum</TableHead>
                        <TableHead>Niveau</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.rows.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.reference}</TableCell>
                          <TableCell>
                            <Link href={`/products/${product.id}`} className="text-primary hover:underline">
                              {product.designation}
                            </Link>
                          </TableCell>
                          <TableCell className="tabular whitespace-nowrap text-right font-medium">
                            {formatQuantity(product.stockQuantity)} {product.unit}
                          </TableCell>
                          <TableCell className="tabular whitespace-nowrap text-right text-muted-foreground">
                            {formatQuantity(product.minStock)}
                          </TableCell>
                          <TableCell><StockLevelBadge level={product.level} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}
    </>
  )
}
