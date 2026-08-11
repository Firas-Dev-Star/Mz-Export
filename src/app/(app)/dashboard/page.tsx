import Link from 'next/link'
import {
  AlertTriangle,
  Building2,
  FilePlus2,
  FileText,
  FileWarning,
  HandCoins,
  Package,
  PackageX,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { ConsolidatedPanel } from '@/components/shared/consolidated-panel'
import { MoneyList } from '@/components/shared/money-list'
import { CustomerShareChart, MonthlySalesChart } from '@/components/shared/sales-chart'
import { StatCard } from '@/components/shared/stat-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requireUser } from '@/lib/auth'
import { formatDate, formatMoney } from '@/lib/format'
import { dec } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { getDashboardData } from '@/services/dashboard.service'
import { getCurrentRates } from '@/services/exchange.service'

export const metadata = { title: 'Tableau de bord — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  await requireUser()
  // Trois requetes independantes : lancees en parallele plutot qu'en cascade.
  const [data, currentRates, currencies] = await Promise.all([
    getDashboardData(),
    getCurrentRates(),
    prisma.currency.findMany({
      where: { isActive: true, code: { not: 'TND' } },
      orderBy: { code: 'asc' },
      select: { code: true, name: true },
    }),
  ])

  const mainCurrency = data.revenue[0]?.currencyCode ?? 'EUR'

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vue d'ensemble de l'activité de facturation export."
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <FilePlus2 className="h-4 w-4" />
              Nouvelle facture
            </Link>
          </Button>
        }
      />

      <ConsolidatedPanel
        totals={data.consolidated}
        rates={currentRates}
        currencies={currencies}
      />


      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Ventes export — par devise
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Chiffre d'affaires"
          value={<MoneyList totals={data.revenue} />}
          secondary="Factures confirmées, hors brouillons et annulations"
          icon={TrendingUp}
        />
        <StatCard
          label="Encaissé"
          value={<MoneyList totals={data.collected} />}
          secondary="Total des règlements reçus"
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label="Reste à encaisser"
          value={<MoneyList totals={data.outstanding} />}
          secondary={`${data.counts.unpaid} facture(s) avec un solde`}
          icon={HandCoins}
          tone="warning"
          href="/invoices?filter=unpaid"
        />
        <StatCard
          label="Factures en retard"
          value={data.counts.overdue}
          secondary="Échéance dépassée et solde non nul"
          icon={AlertTriangle}
          tone={data.counts.overdue > 0 ? 'danger' : 'default'}
          href="/invoices?filter=overdue"
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Achats et stock — en dinars
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total des achats"
          value={<MoneyList totals={data.purchases} fallbackCurrency="TND" />}
          secondary={`${data.counts.purchases} facture(s) d'achat validée(s)`}
          icon={ShoppingCart}
          href="/purchases"
        />
        <StatCard
          label="Restant dû fournisseurs"
          value={<MoneyList totals={data.purchasesOutstanding} fallbackCurrency="TND" />}
          secondary="Factures d'achat non soldées"
          icon={HandCoins}
          tone="warning"
          href="/purchases?filter=unpaid"
        />
        <StatCard
          label="Valeur du stock"
          value={formatMoney(data.stock.valueTnd, 'TND')}
          secondary={`${data.stock.trackedProducts} produit(s) suivi(s)`}
          icon={Warehouse}
          href="/stock"
        />
        <StatCard
          label="Alertes de stock"
          value={data.stock.outOfStock + data.stock.lowStock}
          secondary={`${data.stock.outOfStock} rupture(s) · ${data.stock.lowStock} stock faible`}
          icon={data.stock.outOfStock > 0 ? PackageX : TrendingDown}
          tone={data.stock.outOfStock > 0 ? 'danger' : data.stock.lowStock > 0 ? 'warning' : 'default'}
          href="/stock/alerts"
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Référentiel
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Factures émises" value={data.counts.invoices} icon={FileText} href="/invoices" />
        <StatCard label="Brouillons" value={data.counts.drafts} icon={FileWarning} href="/invoices?status=DRAFT" />
        <StatCard label="Clients actifs" value={data.counts.customers} icon={Users} href="/customers" />
        <StatCard label="Fournisseurs actifs" value={data.counts.suppliers} icon={Building2} href="/suppliers" />
        <StatCard label="Produits actifs" value={data.counts.products} icon={Package} href="/products" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ventes des 12 derniers mois</CardTitle>
            <CardDescription>Montants nets à payer, en {mainCurrency}.</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlySalesChart data={data.monthlySales} currencyCode={mainCurrency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition par client</CardTitle>
            <CardDescription>Top 5 sur l&apos;ensemble de la période.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topCustomers.length === 0 ? (
              <EmptyState icon={Users} title="Aucune donnée" description="Créez une première facture pour alimenter ce graphique." />
            ) : (
              <CustomerShareChart
                data={data.topCustomers.map((c) => ({ name: c.name, total: dec(c.total).toNumber() }))}
                currencyCode={mainCurrency}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Dernières factures</CardTitle>
            <CardDescription>Les 8 documents les plus récents.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/invoices">Tout voir</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {data.recentInvoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aucune facture"
              description="Commencez par créer votre première facture de vente."
              action={
                <Button asChild size="sm">
                  <Link href="/invoices/new">Nouvelle facture</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Net à payer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      <Link href={`/invoices/${invoice.id}`} className="text-primary hover:underline">
                        {invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(invoice.date)}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{invoice.customerName}</TableCell>
                    <TableCell><StatusBadge status={invoice.status} /></TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(invoice.netToPay, invoice.currencyCode)}
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
