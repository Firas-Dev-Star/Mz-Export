import Link from 'next/link'
import { BarChart3, FileWarning } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { ExportMenu } from '@/components/shared/export-menu'
import { PeriodFilter } from '@/components/shared/period-filter'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requirePermission } from '@/lib/auth'
import { formatDate, formatMoney, formatQuantity } from '@/lib/format'
import { getReports } from '@/services/report.service'

export const metadata = { title: 'Rapports — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePermission('report.read')
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const period = { from: get('from'), to: get('to') }
  const data = await getReports(period)

  return (
    <>
      <PageHeader
        title="Rapports"
        description="Analyse des ventes export. Les montants ne sont jamais convertis entre devises."
        actions={<ExportMenu />}
      />

      <PeriodFilter />

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Ventes export — en euros
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.totals.length === 0 ? (
          <Card className="sm:col-span-2 xl:col-span-4">
            <CardContent className="p-5 text-sm text-muted-foreground">
              Aucune facture confirmée sur la période sélectionnée.
            </CardContent>
          </Card>
        ) : (
          data.totals.map((t) => (
            <Card key={t.currencyCode} className="sm:col-span-2 xl:col-span-4">
              <CardContent className="grid gap-4 p-5 sm:grid-cols-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Devise</p>
                  <p className="mt-1 text-xl font-semibold text-navy-800">{t.currencyCode}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Chiffre d&apos;affaires</p>
                  <p className="tabular mt-1 text-xl font-semibold text-navy-800">{formatMoney(t.revenue, t.currencyCode)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Encaissé</p>
                  <p className="tabular mt-1 text-xl font-semibold text-emerald-700">{formatMoney(t.collected, t.currencyCode)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Impayé</p>
                  <p className="tabular mt-1 text-xl font-semibold text-amber-700">{formatMoney(t.outstanding, t.currencyCode)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Factures</p>
                  <p className="tabular mt-1 text-xl font-semibold text-navy-800">{t.invoices}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ventes par mois</CardTitle>
            <CardDescription>Net à payer cumulé, par devise.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.monthly.length === 0 ? (
              <EmptyState icon={BarChart3} title="Aucune donnée" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead className="text-center">Factures</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.monthly.map((row) => (
                    <TableRow key={`${row.key}-${row.currencyCode}`}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="tabular text-center">{row.count}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatMoney(row.total, row.currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ventes par client</CardTitle>
            <CardDescription>20 premiers clients de la période.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.byCustomer.length === 0 ? (
              <EmptyState icon={BarChart3} title="Aucune donnée" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-center">Factures</TableHead>
                    <TableHead className="text-right">CA</TableHead>
                    <TableHead className="text-right">Impayé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byCustomer.map((row) => (
                    <TableRow key={`${row.id}-${row.currencyCode}`}>
                      <TableCell className="max-w-[200px] truncate">
                        <Link href={`/customers/${row.id}`} className="text-primary hover:underline">{row.name}</Link>
                      </TableCell>
                      <TableCell className="tabular text-center">{row.count}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatMoney(row.total, row.currencyCode)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatMoney(row.outstanding, row.currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Achats — en dinars
      </h2>
      <div className="grid gap-4">
        {data.purchaseTotals.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              Aucune facture d&apos;achat validée sur la période sélectionnée.
            </CardContent>
          </Card>
        ) : (
          data.purchaseTotals.map((t) => (
            <Card key={t.currencyCode}>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Devise</p>
                  <p className="mt-1 text-xl font-semibold text-navy-800">{t.currencyCode}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total des achats</p>
                  <p className="tabular mt-1 text-xl font-semibold text-navy-800">{formatMoney(t.total, t.currencyCode)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Réglé</p>
                  <p className="tabular mt-1 text-xl font-semibold text-emerald-700">{formatMoney(t.paid, t.currencyCode)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Restant dû</p>
                  <p className="tabular mt-1 text-xl font-semibold text-amber-700">{formatMoney(t.outstanding, t.currencyCode)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Factures</p>
                  <p className="tabular mt-1 text-xl font-semibold text-navy-800">{t.purchases}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Achats par mois</CardTitle>
            <CardDescription>Net à payer cumulé, en dinars.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.purchaseMonthly.length === 0 ? (
              <EmptyState icon={BarChart3} title="Aucune donnée" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead className="text-center">Factures</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.purchaseMonthly.map((row) => (
                    <TableRow key={`${row.key}-${row.currencyCode}`}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="tabular text-center">{row.count}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatMoney(row.total, row.currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Achats par fournisseur</CardTitle>
            <CardDescription>20 premiers fournisseurs de la période.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.bySupplier.length === 0 ? (
              <EmptyState icon={BarChart3} title="Aucune donnée" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fournisseur</TableHead>
                    <TableHead className="text-center">Factures</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Restant dû</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bySupplier.map((row) => (
                    <TableRow key={`${row.id}-${row.currencyCode}`}>
                      <TableCell className="max-w-[200px] truncate">
                        <Link href={`/suppliers/${row.id}`} className="text-primary hover:underline">{row.name}</Link>
                      </TableCell>
                      <TableCell className="tabular text-center">{row.count}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatMoney(row.total, row.currencyCode)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatMoney(row.outstanding, row.currencyCode)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Factures d&apos;achat non soldées</CardTitle>
          <CardDescription>Toutes périodes confondues, triées par échéance.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {data.unpaidPurchases.length === 0 ? (
            <EmptyState icon={FileWarning} title="Aucun impayé fournisseur" description="Toutes les factures d'achat validées sont soldées." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Net à payer</TableHead>
                  <TableHead className="text-right">Restant dû</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.unpaidPurchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-medium">
                      <Link href={`/purchases/${purchase.id}`} className="text-primary hover:underline">{purchase.number}</Link>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{purchase.supplier.companyName}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(purchase.dueDate) || '—'}</TableCell>
                    <TableCell><StatusBadge status={purchase.status} /></TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">
                      {formatMoney(purchase.netToPay, purchase.currencyCode)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium text-amber-700">
                      {formatMoney(purchase.balanceDue, purchase.currencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Produits
      </h2>
      <Card>
        <CardHeader>
          <CardTitle>Produits les plus vendus</CardTitle>
          <CardDescription>Classement par chiffre d&apos;affaires.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {data.byProduct.length === 0 ? (
            <EmptyState icon={BarChart3} title="Aucune donnée" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Chiffre d&apos;affaires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byProduct.map((row, i) => (
                  <TableRow key={`${row.reference}-${i}`}>
                    <TableCell className="text-muted-foreground">{row.reference || '—'}</TableCell>
                    <TableCell className="font-medium">{row.designation}</TableCell>
                    <TableCell className="tabular text-right">{formatQuantity(row.quantity)}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(row.revenue, row.currencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Factures impayées</CardTitle>
          <CardDescription>Toutes périodes confondues, triées par échéance.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {data.unpaid.length === 0 ? (
            <EmptyState icon={FileWarning} title="Aucun impayé" description="Toutes les factures confirmées sont soldées." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Net à payer</TableHead>
                  <TableHead className="text-right">Solde dû</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.unpaid.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      <Link href={`/invoices/${invoice.id}`} className="text-primary hover:underline">{invoice.number}</Link>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{invoice.customer.companyName}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(invoice.dueDate) || '—'}</TableCell>
                    <TableCell><StatusBadge status={invoice.status} /></TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right">
                      {formatMoney(invoice.netToPay, invoice.currencyCode)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium text-amber-700">
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
