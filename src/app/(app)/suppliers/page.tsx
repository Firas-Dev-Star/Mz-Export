import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/shared/pagination'
import { SearchToolbar } from '@/components/shared/search-toolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { listSuppliers } from '@/services/supplier.service'

export const metadata = { title: 'Fournisseurs — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireUser()
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const { items, total, page, pageCount } = await listSuppliers({
    search: get('q'),
    status: (get('status') as 'all' | 'active' | 'inactive') ?? 'all',
    page: Number(get('page') ?? 1),
  })

  return (
    <>
      <PageHeader
        title="Fournisseurs"
        description="Fournisseurs tunisiens et achats en dinars."
        actions={
          can(session.role, 'supplier.write') ? (
            <Button asChild><Link href="/suppliers/new"><Plus className="h-4 w-4" />Nouveau fournisseur</Link></Button>
          ) : null
        }
      />

      <SearchToolbar
        placeholder="Nom, code, ville, matricule fiscal…"
        filters={[
          { name: 'status', label: 'Tous les statuts', options: [{ value: 'active', label: 'Actifs' }, { value: 'inactive', label: 'Inactifs' }] },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Aucun fournisseur"
              description="Aucun fournisseur ne correspond à votre recherche."
              action={can(session.role, 'supplier.write') ? <Button asChild size="sm"><Link href="/suppliers/new">Créer un fournisseur</Link></Button> : null}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Ville / Pays</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-center">Achats</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">
                      <Link href={`/suppliers/${supplier.id}`} className="text-primary hover:underline">
                        {supplier.companyName}
                      </Link>
                      {supplier.isDemo ? <Badge variant="outline" className="ml-2">démo</Badge> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{supplier.code}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[supplier.city, supplier.country].filter(Boolean).join(', ') || '—'}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {supplier.email || supplier.phone || '—'}
                    </TableCell>
                    <TableCell className="tabular text-center">{supplier._count.purchases}</TableCell>
                    <TableCell>
                      {supplier.isActive ? <Badge variant="success">Actif</Badge> : <Badge variant="outline">Inactif</Badge>}
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
