import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil, ShoppingBag } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { formatDate, formatMoney, formatNumber, formatQuantity, VAT_MODE_LABELS } from '@/lib/format'
import { mul } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { MOVEMENT_LABELS, movementSign, stockLevel } from '@/lib/stock-labels'
import { StockAdjustDialog } from '@/components/stock/stock-adjust-dialog'
import { StockLevelBadge } from '@/components/stock/stock-level-badge'
import { getProductDetail } from '@/services/product.service'

export const dynamic = 'force-dynamic'

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-navy-800">{value || '—'}</p>
    </div>
  )
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser()
  const { id } = await params
  const detail = await getProductDetail(id)
  if (!detail) notFound()

  const { product, sales, totals } = detail
  const dimensions = [product.lengthCm, product.widthCm, product.heightCm].map((v) => formatNumber(v, 0)).join(' × ')
  const level = stockLevel(product)

  const movements = await prisma.stockMovement.findMany({
    where: { productId: product.id },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    include: { user: { select: { name: true } } },
  })

  return (
    <>
      <PageHeader
        title={product.designation}
        description={`Référence ${product.reference}`}
        actions={
          <>
            {product.trackStock && can(session.role, 'stock.adjust') ? (
              <StockAdjustDialog
                products={[]}
                productId={product.id}
                currentStock={String(product.stockQuantity)}
                unit={product.unit}
              />
            ) : null}
            {can(session.role, 'product.write') ? (
              <Button asChild variant="outline">
                <Link href={`/products/${product.id}/edit`}><Pencil className="h-4 w-4" />Modifier</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <CardTitle>Stock</CardTitle>
            <StockLevelBadge level={level} />
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <Info
              label="Quantité en stock"
              value={product.trackStock ? `${formatQuantity(product.stockQuantity)} ${product.unit}` : 'Non suivi'}
            />
            {/* Poids derive : suit automatiquement chaque achat et chaque vente. */}
            <Info
              label="Poids total (kg)"
              value={
                product.trackStock && Number(product.unitWeightKg) > 0
                  ? `${formatNumber(mul(product.stockQuantity, product.unitWeightKg), 3)} kg`
                  : '—'
              }
            />
            <Info label="Stock minimum" value={product.trackStock ? formatQuantity(product.minStock) : '—'} />
            <Info
              label="Valeur au prix d'achat"
              value={product.trackStock ? formatMoney(mul(product.stockQuantity, product.purchasePriceTnd), 'TND') : '—'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Commercial</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            <Info label="Prix de vente" value={formatMoney(product.salePriceEur, 'EUR')} />
            <Info label="Prix d'achat" value={formatMoney(product.purchasePriceTnd, 'TND')} />
            <Info label="Régime de TVA" value={VAT_MODE_LABELS[product.vatMode]} />
            <Info label="Unité" value={product.unit} />
            <Info label="Catégorie" value={product.category?.name} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Export</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            <Info label="NGP / code douanier" value={product.ngp} />
            <Info label="Pays d'origine" value={product.originCountry} />
            <Info label="Unités par colis" value={product.unitsPerPackage || '—'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Logistique</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            <Info label="Poids unitaire" value={`${formatNumber(product.unitWeightKg, 3)} kg`} />
            <Info label="Dimensions (L × l × h)" value={`${dimensions} cm`} />
            <Info label="Description" value={product.description} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {totals.map((t) => (
          <Card key={t.currencyCode}>
            <CardContent className="grid grid-cols-2 gap-4 p-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Quantité vendue</p>
                <p className="tabular mt-1 text-xl font-semibold text-navy-800">{formatQuantity(t.quantity)} {product.unit}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Chiffre d&apos;affaires</p>
                <p className="tabular mt-1 text-xl font-semibold text-navy-800">{formatMoney(t.revenue, t.currencyCode)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Derniers mouvements de stock</CardTitle>
          <CardDescription>20 derniers mouvements — <Link href={`/stock/movements?productId=${product.id}`} className="text-primary hover:underline">voir tout l&apos;historique</Link>.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {movements.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="Aucun mouvement" description="Ce produit n'a encore connu aucune entrée ni sortie." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Stock après</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Utilisateur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => {
                  const inbound = movementSign(movement.type) === 1
                  return (
                    <TableRow key={movement.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(movement.date)}</TableCell>
                      <TableCell>{MOVEMENT_LABELS[movement.type]}</TableCell>
                      <TableCell className={`tabular whitespace-nowrap text-right font-medium ${inbound ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {inbound ? '+' : '−'}{formatQuantity(movement.quantity)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">{formatQuantity(movement.stockAfter)}</TableCell>
                      <TableCell className="text-muted-foreground">{movement.reference || movement.note || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{movement.user?.name ?? '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Historique des ventes</CardTitle>
          <CardDescription>50 dernières lignes de facture, hors brouillons et annulations.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {sales.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="Aucune vente" description="Ce produit n'apparaît sur aucune facture confirmée." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facture</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Total ligne</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((row, index) => (
                  <TableRow key={`${row.invoice.id}-${index}`}>
                    <TableCell className="font-medium">
                      <Link href={`/invoices/${row.invoice.id}`} className="text-primary hover:underline">{row.invoice.number}</Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.invoice.date)}</TableCell>
                    <TableCell>{row.invoice.customer.companyName}</TableCell>
                    <TableCell className="tabular text-right">{formatQuantity(row.quantity)}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(row.lineTotal, row.invoice.currencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
