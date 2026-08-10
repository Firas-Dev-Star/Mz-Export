import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FilePlus2, Pencil, ShoppingCart } from 'lucide-react'
import { deleteSupplier } from '@/actions/supplier.actions'
import { PageHeader } from '@/components/layout/page-header'
import { DeleteButton } from '@/components/shared/delete-button'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { formatDate, formatMoney } from '@/lib/format'
import { getSupplierDetail } from '@/services/supplier.service'

export const dynamic = 'force-dynamic'

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line text-sm text-navy-800">{value}</dd>
    </div>
  )
}

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser()
  const { id } = await params
  const detail = await getSupplierDetail(id)
  if (!detail) notFound()

  const { supplier, stats, purchases } = detail

  return (
    <>
      <PageHeader
        title={supplier.companyName}
        description={`Code ${supplier.code}${supplier.isActive ? '' : ' — fournisseur inactif'}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/purchases/new?supplierId=${supplier.id}`}>
                <FilePlus2 className="h-4 w-4" />
                Nouvel achat
              </Link>
            </Button>
            {can(session.role, 'supplier.write') ? (
              <Button asChild variant="outline">
                <Link href={`/suppliers/${supplier.id}/edit`}><Pencil className="h-4 w-4" />Modifier</Link>
              </Button>
            ) : null}
            {can(session.role, 'supplier.delete') ? (
              <DeleteButton
                action={async () => {
                  'use server'
                  return deleteSupplier(supplier.id)
                }}
                title={`Supprimer « ${supplier.companyName} » ?`}
                description="Si ce fournisseur possède des factures d'achat, il sera désactivé au lieu d'être supprimé."
                redirectTo="/suppliers"
              />
            ) : null}
          </>
        }
      />

      {stats.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Aucune facture d&apos;achat confirmée pour ce fournisseur.
          </CardContent>
        </Card>
      ) : (
        stats.map((stat) => (
          <Card key={stat.currencyCode}>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total des achats</p>
                <p className="tabular mt-1 text-xl font-semibold text-navy-800">
                  {formatMoney(stat.total, stat.currencyCode)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Réglé</p>
                <p className="tabular mt-1 text-xl font-semibold text-emerald-700">
                  {formatMoney(stat.paid, stat.currencyCode)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Restant dû</p>
                <p className="tabular mt-1 text-xl font-semibold text-amber-700">
                  {formatMoney(stat.outstanding, stat.currencyCode)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Factures</p>
                <p className="tabular mt-1 text-xl font-semibold text-navy-800">{stat.purchaseCount}</p>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Coordonnées</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <InfoRow
                label="Adresse"
                value={[supplier.addressLine1, supplier.addressLine2, `${supplier.postalCode} ${supplier.city}`.trim(), supplier.country]
                  .filter((v) => v && v.trim())
                  .join('\n')}
              />
              <InfoRow label="Contact" value={supplier.contactName} />
              <InfoRow label="Téléphone" value={supplier.phone} />
              <InfoRow label="Email" value={supplier.email} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Informations légales</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <InfoRow label="Matricule fiscal" value={supplier.taxId} />
              <InfoRow label="Registre de commerce" value={supplier.tradeRegister} />
              <InfoRow label="Conditions de paiement" value={supplier.paymentTerms} />
              <InfoRow label="Devise" value={supplier.currencyCode} />
              <InfoRow label="Notes internes" value={supplier.notes} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Factures d&apos;achat</CardTitle>
          <CardDescription>25 dernières factures de ce fournisseur.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {purchases.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Aucun achat"
              action={<Button asChild size="sm"><Link href={`/purchases/new?supplierId=${supplier.id}`}>Enregistrer un achat</Link></Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Réf. fournisseur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Net à payer</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-medium">
                      <Link href={`/purchases/${purchase.id}`} className="text-primary hover:underline">
                        {purchase.status === 'DRAFT' ? 'Brouillon' : purchase.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{purchase.supplierReference || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(purchase.date)}</TableCell>
                    <TableCell><StatusBadge status={purchase.status} /></TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">
                      {formatMoney(purchase.netToPay, purchase.currencyCode)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(purchase.balanceDue, purchase.currencyCode)}
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
