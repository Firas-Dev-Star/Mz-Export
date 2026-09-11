import { Landmark } from 'lucide-react'
import { BankImportForm } from '@/components/bank/bank-import-form'
import {
  AttributeMovementDialog,
  IgnoreMovementDialog,
  ResetMovementButton,
  type TiersOption,
} from '@/components/bank/bank-movement-actions'
import { PageHeader } from '@/components/layout/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requirePermission } from '@/lib/auth'
import { formatDate, formatMoney } from '@/lib/format'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Rapprochement bancaire — MZ EXPORT' }
export const dynamic = 'force-dynamic'

/**
 * Rapprochement bancaire.
 *
 * POURQUOI CET ECRAN EXISTE. Les fournisseurs sont regles par acomptes sur
 * compte courant : la quasi-totalite des virements sont des montants ronds qui
 * ne correspondent a aucune facture precise. Aucun automatisme ne peut deviner
 * le tiers — le libelle bancaire est tronque et ne nomme pas toujours le
 * beneficiaire. C'est donc un ecran d'ARBITRAGE, pas de traitement automatique.
 */
export default async function BanquePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('bank.read')
  const params = await searchParams
  const filtre = typeof params.statut === 'string' ? params.statut : 'PENDING'
  const peutEcrire = can(session.role, 'bank.write')

  const [mouvements, compteurs, fournisseurs, transporteurs, clients, stats] = await Promise.all([
    prisma.bankMovement.findMany({
      where: filtre === 'ALL' ? {} : { status: filtre as 'PENDING' | 'ATTRIBUTED' | 'IGNORED' },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        purchasePayments: { select: { amount: true, purchase: { select: { supplier: { select: { companyName: true } } } } } },
        transportPayments: { select: { amount: true, transportInvoice: { select: { carrier: { select: { companyName: true } } } } } },
        payments: { select: { amount: true, invoice: { select: { customer: { select: { companyName: true } } } } } },
      },
    }),
    prisma.bankMovement.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { companyName: 'asc' },
      select: {
        id: true,
        companyName: true,
        purchases: {
          where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, balanceDue: { gt: 0 } },
          select: { balanceDue: true },
        },
      },
    }),
    prisma.carrier.findMany({
      where: { isActive: true },
      orderBy: { companyName: 'asc' },
      select: {
        id: true,
        companyName: true,
        invoices: { where: { balanceDue: { gt: 0 } }, select: { balanceDue: true } },
      },
    }),
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { companyName: 'asc' },
      select: {
        id: true,
        companyName: true,
        currencyCode: true,
        invoices: {
          where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, balanceDue: { gt: 0 } },
          select: { balanceDue: true, currencyCode: true },
        },
      },
    }),
    prisma.bankMovement.aggregate({
      _sum: { amount: true },
      _count: true,
    }),
  ])

  const somme = (lignes: { balanceDue: unknown }[]) =>
    lignes.reduce((s, l) => s + Number(l.balanceDue), 0)

  const tiers: TiersOption[] = [
    ...fournisseurs.map((f) => ({
      id: f.id,
      nom: f.companyName,
      type: 'supplier' as const,
      ouvert: formatMoney(somme(f.purchases).toFixed(3), 'TND'),
    })),
    ...transporteurs.map((c) => ({
      id: c.id,
      nom: c.companyName,
      type: 'carrier' as const,
      ouvert: formatMoney(somme(c.invoices).toFixed(3), 'TND'),
    })),
    ...clients.map((c) => {
      // La devise affichee est celle des factures ouvertes, pas celle du
      // client : c'est dans celle-la que l'encaissement sera saisi.
      const devise = c.invoices[0]?.currencyCode ?? c.currencyCode
      return {
        id: c.id,
        nom: c.companyName,
        type: 'customer' as const,
        ouvert: formatMoney(somme(c.invoices).toFixed(2), devise),
        devise,
      }
    }),
  ]

  const compteur = (statut: string) =>
    compteurs.find((c) => c.status === statut)?._count._all ?? 0

  const getAttribution = (mouvement: typeof mouvements[0]) => {
    if (mouvement.purchasePayments.length > 0) {
      const names = [...new Set(mouvement.purchasePayments.map((p) => p.purchase.supplier.companyName))]
      return { type: 'supplier', names, montant: mouvement.purchasePayments[0].amount }
    }
    if (mouvement.transportPayments.length > 0) {
      const names = [...new Set(mouvement.transportPayments.map((p) => p.transportInvoice.carrier.companyName))]
      return { type: 'carrier', names, montant: mouvement.transportPayments[0].amount }
    }
    if (mouvement.payments.length > 0) {
      const names = [...new Set(mouvement.payments.map((p) => p.invoice.customer.companyName))]
      return { type: 'customer', names, montant: mouvement.payments[0].amount }
    }
    return null
  }

  const ongletsDisponibles = [
    { cle: 'PENDING', libelle: 'À traiter' },
    { cle: 'ATTRIBUTED', libelle: 'Attribués' },
    { cle: 'IGNORED', libelle: 'Classés' },
    { cle: 'ALL', libelle: 'Tous' },
  ]

  // Détail ARSENAY
  const arsenay = await prisma.supplier.findFirst({
    where: { companyName: { contains: 'ARSENAY' } },
    select: {
      id: true,
      companyName: true,
      purchases: {
        select: {
          id: true,
          number: true,
          totalTtc: true,
          payments: { select: { amount: true, date: true } },
        },
      },
    },
  })

  const arsenayPayments = arsenay
    ? await prisma.purchasePayment.findMany({
        where: { purchase: { supplierId: arsenay.id } },
        include: { purchase: { select: { number: true } } },
      })
    : []

  // Statistiques par fournisseur
  const statsBySupplier = await Promise.all(
    fournisseurs.map(async (f) => {
      const payments = await prisma.purchasePayment.aggregate({
        where: { purchase: { supplierId: f.id } },
        _sum: { amount: true },
        _count: true,
      })
      return {
        name: f.companyName,
        nbPayments: payments._count,
        totalPaid: payments._sum.amount ?? 0,
      }
    })
  )

  return (
    <>
      <PageHeader
        title="Rapprochement bancaire"
        description="Importez vos relevés, puis attribuez chaque mouvement à son tiers."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Importer un relevé</CardTitle>
          <CardDescription>
            Les mouvements déjà connus sont ignorés : un relevé peut être réimporté sans risque.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {peutEcrire ? (
            <BankImportForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              L’import est réservé aux administrateurs.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <StatCard label="À traiter" value={String(compteur('PENDING'))} icon={Landmark} />
        <StatCard label="Attribués" value={String(compteur('ATTRIBUTED'))} icon={Landmark} />
        <StatCard label="Classés" value={String(compteur('IGNORED'))} icon={Landmark} />
        <StatCard label="Total mouvements" value={String(stats._count)} icon={Landmark} />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Statistiques globales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Somme de tous les mouvements</p>
              <p className="text-lg font-semibold">{formatMoney(stats._sum.amount?.toString() ?? '0', 'TND')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Taux d&apos;attribution</p>
              <p className="text-lg font-semibold">{stats._count ? ((compteur('ATTRIBUTED') / stats._count) * 100).toFixed(1) : 0}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Taux de classification</p>
              <p className="text-lg font-semibold">{stats._count ? ((compteur('IGNORED') / stats._count) * 100).toFixed(1) : 0}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Bilan par fournisseur</CardTitle>
          <CardDescription>Montants payés et nombre de règlements par fournisseur</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {statsBySupplier.map((stat) => (
              <div key={stat.name} className="border rounded-lg p-4">
                <p className="font-semibold text-sm">{stat.name}</p>
                <p className="text-xs text-muted-foreground mt-2">{stat.nbPayments} règlements</p>
                <p className="text-lg font-bold text-emerald-700 mt-2">{formatMoney(stat.totalPaid.toString(), 'TND')}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {arsenay && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">🏭 Bilan détaillé — {arsenay.companyName}</CardTitle>
            <CardDescription>Récapitulatif des paiements et factures</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              <div>
                <p className="text-sm text-muted-foreground">Factures fournisseur</p>
                <p className="text-2xl font-bold">{arsenay.purchases.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paiements effectués</p>
                <p className="text-2xl font-bold text-emerald-700">{arsenayPayments.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Montant total payé</p>
                <p className="text-2xl font-bold text-emerald-700">
                  {formatMoney(
                    arsenayPayments.reduce((s, p) => s + Number(p.amount), 0).toString(),
                    'TND'
                  )}
                </p>
              </div>
            </div>

            {arsenay.purchases.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Factures à payer:</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {arsenay.purchases.map((purchase) => (
                    <div key={purchase.id} className="text-sm border-l-2 border-amber-300 pl-3">
                      <div className="flex justify-between">
                        <span className="font-medium">{purchase.number}</span>
                        <span className="text-amber-700">{formatMoney(purchase.totalTtc.toString(), 'TND')}</span>
                      </div>
                      {purchase.payments.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Paiements: {purchase.payments.map((p) => formatDate(p.date)).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {ongletsDisponibles.map((o) => (
          <a
            key={o.cle}
            href={`/banque?statut=${o.cle}`}
            className={
              'rounded-md border px-3 py-1.5 text-sm ' +
              (filtre === o.cle
                ? 'border-navy-800 bg-navy-800 text-white'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50')
            }
          >
            {o.libelle}
          </a>
        ))}
      </div>

      <Card>
        <CardContent className="px-0">
          {mouvements.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="Aucun mouvement"
              description="Importez un relevé bancaire pour commencer le rapprochement."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Banque</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Attribution</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mouvements.map((m) => {
                  const montant = Number(m.amount)
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(m.date)}</TableCell>
                      <TableCell>{m.bank}</TableCell>
                      <TableCell className="max-w-md">
                        <span className="block truncate" title={m.label}>
                          {m.label}
                        </span>
                        {m.category ? (
                          <span className="text-xs text-muted-foreground">{m.category}</span>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className={
                          'whitespace-nowrap text-right tabular-nums ' +
                          (montant < 0 ? 'text-red-700' : 'text-emerald-700')
                        }
                      >
                        {formatMoney(m.amount.toString(), m.currencyCode)}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const attrib = getAttribution(m)
                          if (m.status === 'PENDING') {
                            return <Badge variant="outline">À traiter</Badge>
                          }
                          if (m.status === 'IGNORED') {
                            return (
                              <div>
                                <Badge variant="secondary">Classé</Badge>
                                {m.category ? (
                                  <p className="text-xs text-muted-foreground mt-1">{m.category}</p>
                                ) : null}
                              </div>
                            )
                          }
                          if (attrib) {
                            return (
                              <div>
                                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                                  {attrib.type === 'customer' ? '💰' : attrib.type === 'carrier' ? '🚚' : '📦'} {attrib.names[0]}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1">{formatMoney(attrib.montant.toString(), m.currencyCode)}</p>
                              </div>
                            )
                          }
                          return <Badge variant="outline">Attribué</Badge>
                        })()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {!peutEcrire ? null : m.status === 'PENDING' ? (
                          <div className="flex justify-end gap-1">
                            <AttributeMovementDialog
                              movementId={m.id}
                              montant={m.amount.toString()}
                              libelle={m.label}
                              devise={m.currencyCode}
                              tiers={tiers}
                            />
                            <IgnoreMovementDialog
                              movementId={m.id}
                              libelle={m.label}
                              categorieProposee={m.category}
                            />
                          </div>
                        ) : (
                          <ResetMovementButton movementId={m.id} />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
