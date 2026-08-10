import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FilePlus2, FileText, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { DeleteButton } from '@/components/shared/delete-button'
import { StatusBadge } from '@/components/shared/status-badge'
import { deleteCustomer } from '@/actions/customer.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { formatDate, formatMoney } from '@/lib/format'
import { getCustomerDetail } from '@/services/customer.service'

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

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser()
  const { id } = await params
  const detail = await getCustomerDetail(id)
  if (!detail) notFound()

  const { customer, stats, invoices } = detail

  return (
    <>
      <PageHeader
        title={customer.companyName}
        description={`Code ${customer.code}${customer.isActive ? '' : ' — client inactif'}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/invoices/new?customerId=${customer.id}`}>
                <FilePlus2 className="h-4 w-4" />
                Nouvelle facture
              </Link>
            </Button>
            {can(session.role, 'customer.write') ? (
              <Button asChild variant="outline">
                <Link href={`/customers/${customer.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Modifier
                </Link>
              </Button>
            ) : null}
            {can(session.role, 'customer.delete') ? (
              <DeleteButton
                action={async () => {
                  'use server'
                  return deleteCustomer(customer.id)
                }}
                title={`Supprimer « ${customer.companyName} » ?`}
                description="Si ce client possède des factures, il sera désactivé au lieu d'être supprimé afin de préserver l'historique comptable."
                redirectTo="/customers"
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.length === 0 ? (
          <Card className="sm:col-span-2 xl:col-span-4">
            <CardContent className="p-5 text-sm text-muted-foreground">
              Aucune facture confirmée pour ce client.
            </CardContent>
          </Card>
        ) : (
          stats.map((stat) => (
            <Card key={stat.currencyCode} className="sm:col-span-2 xl:col-span-4">
              <CardContent className="grid gap-4 p-5 sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Chiffre d&apos;affaires</p>
                  <p className="tabular mt-1 text-xl font-semibold text-navy-800">
                    {formatMoney(stat.revenue, stat.currencyCode)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Encaissé</p>
                  <p className="tabular mt-1 text-xl font-semibold text-emerald-700">
                    {formatMoney(stat.collected, stat.currencyCode)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Impayé</p>
                  <p className="tabular mt-1 text-xl font-semibold text-amber-700">
                    {formatMoney(stat.outstanding, stat.currencyCode)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Factures</p>
                  <p className="tabular mt-1 text-xl font-semibold text-navy-800">{stat.invoiceCount}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Coordonnées</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <InfoRow
                label="Adresse de facturation"
                value={[customer.addressLine1, customer.addressLine2, `${customer.postalCode} ${customer.city}`.trim(), customer.country]
                  .filter((v) => v && v.trim())
                  .join('\n')}
              />
              <InfoRow label="Téléphone" value={customer.phone} />
              <InfoRow label="Email" value={customer.email} />
              <InfoRow label="Contact" value={[customer.contactName, customer.contactPhone, customer.contactEmail].filter(Boolean).join(' · ')} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informations légales</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <InfoRow label="SIRET" value={customer.siret} />
              <InfoRow label="Matricule fiscal" value={customer.taxId} />
              <InfoRow label="TVA intracommunautaire" value={customer.vatNumber} />
              <InfoRow label="Conditions de paiement" value={customer.paymentTerms} />
              <InfoRow label="Devise" value={customer.currencyCode} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Livraison</CardTitle>
            <CardDescription>Repris par défaut sur les nouvelles factures.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <InfoRow label="Adresse de livraison" value={customer.deliveryAddress} />
              <InfoRow label="Pays de destination" value={customer.deliveryCountry} />
              <InfoRow label="Notes internes" value={customer.notes} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Factures</CardTitle>
          <CardDescription>25 dernières factures de ce client.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {invoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aucune facture"
              action={
                <Button asChild size="sm">
                  <Link href={`/invoices/new?customerId=${customer.id}`}>Créer une facture</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Net à payer</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      <Link href={`/invoices/${invoice.id}`} className="text-primary hover:underline">
                        {invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(invoice.date)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(invoice.dueDate) || '—'}</TableCell>
                    <TableCell><StatusBadge status={invoice.status} /></TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">
                      {formatMoney(invoice.netToPay, invoice.currencyCode)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(invoice.balanceDue, invoice.currencyCode)}
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
