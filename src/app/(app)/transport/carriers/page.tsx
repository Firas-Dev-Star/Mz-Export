import Link from 'next/link'
import { Plus, Truck } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/shared/pagination'
import { SearchToolbar } from '@/components/shared/search-toolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { listCarriers } from '@/services/transport.service'

export const metadata = { title: 'Transporteurs — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function CarriersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireUser()
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const { items, total, page, pageCount } = await listCarriers({
    search: get('q'),
    page: Number(get('page') ?? 1),
  })

  return (
    <>
      <PageHeader
        title="Transporteurs"
        description="Sociétés de transport et de transit. Elles ne vendent pas de marchandise : elles sont volontairement séparées des fournisseurs."
        actions={
          can(session.role, 'carrier.write') ? (
            <Button asChild>
              <Link href="/transport/carriers/new">
                <Plus className="h-4 w-4" />
                Nouveau transporteur
              </Link>
            </Button>
          ) : null
        }
      />

      <SearchToolbar placeholder="Raison sociale, code, ville, matricule fiscal…" />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Aucun transporteur"
              description="Créez les sociétés de transport avec lesquelles vous travaillez."
              action={
                can(session.role, 'carrier.write') ? (
                  <Button asChild size="sm">
                    <Link href="/transport/carriers/new">Nouveau transporteur</Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Raison sociale</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Matricule fiscal</TableHead>
                  <TableHead className="text-right">Factures</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((carrier) => (
                  <TableRow key={carrier.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      <Link
                        href={`/transport/carriers/${carrier.id}`}
                        className="text-primary hover:underline"
                      >
                        {carrier.code}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">{carrier.companyName}</TableCell>
                    <TableCell className="text-muted-foreground">{carrier.city || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{carrier.phone || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{carrier.taxId || '—'}</TableCell>
                    <TableCell className="tabular text-right">{carrier._count.invoices}</TableCell>
                    <TableCell>
                      {carrier.isActive ? (
                        <Badge variant="outline">Actif</Badge>
                      ) : (
                        <Badge variant="secondary">Inactif</Badge>
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
