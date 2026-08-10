import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/shared/pagination'
import { SearchToolbar } from '@/components/shared/search-toolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { getCustomerCountries, listCustomers } from '@/services/customer.service'

export const metadata = { title: 'Clients — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireUser()
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const [{ items, total, page, pageCount }, countries] = await Promise.all([
    listCustomers({
      search: get('q'),
      country: get('country'),
      status: (get('status') as 'all' | 'active' | 'inactive') ?? 'all',
      page: Number(get('page') ?? 1),
    }),
    getCustomerCountries(),
  ])

  return (
    <>
      <PageHeader
        title="Clients"
        description="Fichier clients export et historique de facturation."
        actions={
          can(session.role, 'customer.write') ? (
            <Button asChild>
              <Link href="/customers/new"><Plus className="h-4 w-4" />Nouveau client</Link>
            </Button>
          ) : null
        }
      />

      <SearchToolbar
        placeholder="Nom, code, ville, SIRET…"
        filters={[
          {
            name: 'country',
            label: 'Tous les pays',
            options: countries.map((c) => ({ value: c, label: c })),
          },
          {
            name: 'status',
            label: 'Tous les statuts',
            options: [
              { value: 'active', label: 'Actifs' },
              { value: 'inactive', label: 'Inactifs' },
            ],
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aucun client"
              description="Aucun client ne correspond à votre recherche."
              action={
                can(session.role, 'customer.write') ? (
                  <Button asChild size="sm"><Link href="/customers/new">Créer un client</Link></Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Ville / Pays</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-center">Factures</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">
                      <Link href={`/customers/${customer.id}`} className="text-primary hover:underline">
                        {customer.companyName}
                      </Link>
                      {customer.isDemo ? <Badge variant="outline" className="ml-2">démo</Badge> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{customer.code}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[customer.city, customer.country].filter(Boolean).join(', ') || '—'}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {customer.email || customer.phone || '—'}
                    </TableCell>
                    <TableCell className="tabular text-center">{customer._count.invoices}</TableCell>
                    <TableCell>
                      {customer.isActive ? (
                        <Badge variant="success">Actif</Badge>
                      ) : (
                        <Badge variant="outline">Inactif</Badge>
                      )}
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
