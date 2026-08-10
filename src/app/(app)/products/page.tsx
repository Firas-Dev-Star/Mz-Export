import Link from 'next/link'
import { Package, Pencil, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { DeleteButton } from '@/components/shared/delete-button'
import { Pagination } from '@/components/shared/pagination'
import { SearchToolbar } from '@/components/shared/search-toolbar'
import { deleteProduct } from '@/actions/product.actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { listCategories, listProducts } from '@/services/product.service'

export const metadata = { title: 'Produits — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireUser()
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const [{ items, total, page, pageCount }, categories] = await Promise.all([
    listProducts({
      search: get('q'),
      categoryId: get('categoryId'),
      status: (get('status') as 'all' | 'active' | 'inactive') ?? 'all',
      page: Number(get('page') ?? 1),
    }),
    listCategories(),
  ])

  return (
    <>
      <PageHeader
        title="Produits"
        description="Catalogue des articles vendus à l'export."
        actions={
          can(session.role, 'product.write') ? (
            <Button asChild><Link href="/products/new"><Plus className="h-4 w-4" />Nouveau produit</Link></Button>
          ) : null
        }
      />

      <SearchToolbar
        placeholder="Référence, désignation, NGP…"
        filters={[
          { name: 'categoryId', label: 'Toutes les catégories', options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { name: 'status', label: 'Tous les statuts', options: [{ value: 'active', label: 'Actifs' }, { value: 'inactive', label: 'Inactifs' }] },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Aucun produit"
              description="Aucun produit ne correspond à votre recherche."
              action={can(session.role, 'product.write') ? <Button asChild size="sm"><Link href="/products/new">Créer un produit</Link></Button> : null}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead>NGP</TableHead>
                  <TableHead>Origine</TableHead>
                  <TableHead>Unité</TableHead>
                  <TableHead className="text-right">Prix de vente</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-1" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.reference}</TableCell>
                    <TableCell>
                      <Link href={`/products/${product.id}`} className="text-primary hover:underline">
                        {product.designation}
                      </Link>
                      {product.category ? <span className="ml-2 text-xs text-muted-foreground">{product.category.name}</span> : null}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">{product.ngp || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{product.originCountry || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{product.unit}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(product.salePriceEur, 'EUR')}
                    </TableCell>
                    <TableCell>
                      {product.isActive ? <Badge variant="success">Actif</Badge> : <Badge variant="outline">Inactif</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {can(session.role, 'product.write') ? (
                          <Button asChild variant="ghost" size="icon">
                            <Link href={`/products/${product.id}/edit`} aria-label="Modifier"><Pencil className="h-4 w-4" /></Link>
                          </Button>
                        ) : null}
                        {can(session.role, 'product.delete') ? (
                          <DeleteButton
                            variant="ghost"
                            size="icon"
                            action={async () => {
                              'use server'
                              return deleteProduct(product.id)
                            }}
                            title={`Supprimer « ${product.designation} » ?`}
                            description="Un produit déjà utilisé sur une facture sera désactivé plutôt que supprimé."
                          />
                        ) : null}
                      </div>
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
