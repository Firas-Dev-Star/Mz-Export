import Link from 'next/link'
import { Scale, TableProperties, Truck } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PeriodFilter } from '@/components/shared/period-filter'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requirePermission } from '@/lib/auth'
import { formatDate, formatMoney, formatNumber, formatQuantity } from '@/lib/format'
import {
  getEncoursClients,
  getEtatAchats,
  getEtatTransport,
  getEtatVentes,
  getReconciliation,
} from '@/services/etat.service'

export const metadata = { title: 'États — MZ EXPORT' }
export const dynamic = 'force-dynamic'

/**
 * Etats de consultation : une ligne par document, les colonnes reellement
 * suivies, une ligne de totaux. Remplace la lecture du suivi Excel.
 *
 * Les montants arrivent deja arrondis du service : cette page affiche, elle ne
 * calcule pas. Les euros et les dinars restent dans des colonnes distinctes.
 */
export default async function EtatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePermission('report.read')
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)
  const periode = { from: get('from'), to: get('to') }

  const [ventes, achats, transport, reconciliation, encours] = await Promise.all([
    getEtatVentes(periode),
    getEtatAchats(periode),
    getEtatTransport(periode),
    getReconciliation(periode),
    getEncoursClients(),
  ])

  return (
    <>
      <PageHeader
        title="États"
        description="Une ligne par document, avec les totaux. Les euros et les dinars ne sont jamais additionnés."
      />

      <PeriodFilter />

      {/* ------------------------------------------------------------------ */}
      {/* Ventes                                                              */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>État des ventes</CardTitle>
          <CardDescription>
            {ventes.totaux.factures} facture(s). La contre-valeur en dinars utilise le taux figé sur
            chaque document, jamais le taux du jour.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {ventes.lignes.length === 0 ? (
            <EmptyState icon={TableProperties} title="Aucune vente sur la période" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Domiciliation</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Colis</TableHead>
                    <TableHead className="text-right">Poids net</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-right">Taux</TableHead>
                    <TableHead className="text-right">Contre-valeur DT</TableHead>
                    <TableHead className="text-right">Encaissé</TableHead>
                    <TableHead className="text-right">Reste</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventes.lignes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        <Link href={`/invoices/${l.id}`} className="text-navy-700 hover:underline">
                          {l.numero}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                      <TableCell>{l.client}</TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {l.domiciliation || '—'}
                      </TableCell>
                      <TableCell className="tabular text-right">{formatQuantity(l.quantite)}</TableCell>
                      <TableCell className="tabular text-right">{l.colis || '—'}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(l.poidsNet, 0)}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatMoney(l.montant, l.devise)}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{l.taux}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatNumber(l.montantDt, 3)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-emerald-700">
                        {formatMoney(l.encaisse, l.devise)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-amber-700">
                        {formatMoney(l.reste, l.devise)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={l.statut} />
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Totaux : une ligne par devise, car on n'additionne pas les devises. */}
                  {ventes.totaux.parDevise.map((t, index) => (
                    <TableRow key={t.devise} className="border-t-2 border-border bg-secondary/40">
                      <TableCell colSpan={4} className="font-semibold text-navy-800">
                        {index === 0 ? `Total — ${t.devise}` : `Total — ${t.devise}`}
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">
                        {index === 0 ? formatQuantity(ventes.totaux.quantite) : ''}
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">
                        {index === 0 ? ventes.totaux.colis || '' : ''}
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">
                        {index === 0 ? formatNumber(ventes.totaux.poidsNet, 0) : ''}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                        {formatMoney(t.montant, t.devise)}
                      </TableCell>
                      <TableCell />
                      <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                        {index === 0 ? formatNumber(ventes.totaux.montantDt, 3) : ''}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-semibold text-emerald-700">
                        {formatMoney(t.encaisse, t.devise)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-semibold text-amber-700">
                        {formatMoney(t.reste, t.devise)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Achats                                                              */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>État des achats</CardTitle>
          <CardDescription>
            {achats.totaux.factures} facture(s), en dinars.
            {achats.totaux.parNature.length > 0
              ? ` Ventilation : ${achats.totaux.parNature
                  .map((n) => `${n.nature} ${formatNumber(n.montant, 3)}`)
                  .join(' · ')}`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {achats.lignes.length === 0 ? (
            <EmptyState icon={TableProperties} title="Aucun achat sur la période" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° interne</TableHead>
                    <TableHead>Réf. fournisseur</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Fournisseur</TableHead>
                    <TableHead>Nature</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Total HT</TableHead>
                    <TableHead className="text-right">TVA %</TableHead>
                    <TableHead className="text-right">TVA</TableHead>
                    <TableHead className="text-right">Net à payer</TableHead>
                    <TableHead className="text-right">Réglé</TableHead>
                    <TableHead className="text-right">Reste</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {achats.lignes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        <Link href={`/purchases/${l.id}`} className="text-navy-700 hover:underline">
                          {l.numero}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.referenceFournisseur || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                      <TableCell>{l.fournisseur}</TableCell>
                      <TableCell className="text-muted-foreground">{l.nature}</TableCell>
                      <TableCell className="tabular text-right">{formatQuantity(l.quantite)}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatNumber(l.totalHt, 3)}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{l.tauxTva}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatNumber(l.tva, 3)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatNumber(l.netAPayer, 3)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-emerald-700">
                        {formatNumber(l.regle, 3)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-amber-700">
                        {formatNumber(l.reste, 3)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={l.statut} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-border bg-secondary/40">
                    <TableCell colSpan={5} className="font-semibold text-navy-800">
                      Total — TND
                    </TableCell>
                    <TableCell className="tabular text-right font-semibold">
                      {formatQuantity(achats.totaux.quantite)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                      {formatNumber(achats.totaux.totalHt, 3)}
                    </TableCell>
                    <TableCell />
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                      {formatNumber(achats.totaux.tva, 3)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                      {formatNumber(achats.totaux.netAPayer, 3)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold text-emerald-700">
                      {formatNumber(achats.totaux.regle, 3)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold text-amber-700">
                      {formatNumber(achats.totaux.reste, 3)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Transport                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>État du transport</CardTitle>
          <CardDescription>
            {transport.totaux.factures} facture(s), en dinars.{' '}
            {transport.totaux.factures > 0
              ? `${transport.totaux.rattachees} rattachée(s) à une vente, ` +
                `${transport.totaux.factures - transport.totaux.rattachees} sans rattachement.`
              : ''}
            {transport.totaux.parTransporteur.length > 0
              ? ` Par transporteur : ${transport.totaux.parTransporteur
                  .map((t) => `${t.transporteur} ${formatNumber(t.montant, 3)}`)
                  .join(' · ')}`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {transport.lignes.length === 0 ? (
            <EmptyState icon={Truck} title="Aucune facture de transport sur la période" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° interne</TableHead>
                    <TableHead>Réf. transporteur</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Transporteur</TableHead>
                    <TableHead>Expédition</TableHead>
                    <TableHead>Vente</TableHead>
                    <TableHead className="text-right">Total HT</TableHead>
                    <TableHead className="text-right">TVA</TableHead>
                    <TableHead className="text-right">Net à payer</TableHead>
                    <TableHead className="text-right">Réglé</TableHead>
                    <TableHead className="text-right">Reste</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transport.lignes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        <Link href={`/transport/${l.id}`} className="text-navy-700 hover:underline">
                          {l.numero}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {l.referenceTransporteur || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                      <TableCell>{l.transporteur}</TableCell>
                      <TableCell className="text-muted-foreground">{l.expedition || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {l.vente ? (
                          l.vente
                        ) : (
                          <span className="text-xs text-amber-700">non rattachée</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatNumber(l.totalHt, 3)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatNumber(l.tva, 3)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatNumber(l.netAPayer, 3)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-emerald-700">
                        {formatNumber(l.regle, 3)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-amber-700">
                        {formatNumber(l.reste, 3)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={l.statut} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-border bg-secondary/40">
                    <TableCell colSpan={6} className="font-semibold text-navy-800">
                      Total — TND
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                      {formatNumber(transport.totaux.totalHt, 3)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                      {formatNumber(transport.totaux.tva, 3)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                      {formatNumber(transport.totaux.netAPayer, 3)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold text-emerald-700">
                      {formatNumber(transport.totaux.regle, 3)}
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold text-amber-700">
                      {formatNumber(transport.totaux.reste, 3)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ---------------------------------------------------------------- */}
        {/* Reconciliation                                                    */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Rapprochement achats / ventes</CardTitle>
            <CardDescription>
              Côté achat le poids est déduit du poids unitaire des produits ; côté vente il est saisi
              sur la facture.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grandeur</TableHead>
                  <TableHead className="text-right">Acheté</TableHead>
                  <TableHead className="text-right">Vendu</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliation.map((r) => (
                  <TableRow key={r.grandeur}>
                    <TableCell className="font-medium">{r.grandeur}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(r.achete, 0)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(r.vendu, 0)}</TableCell>
                    <TableCell
                      className={
                        Number(r.ecart) === 0
                          ? 'tabular text-right text-muted-foreground'
                          : 'tabular text-right font-medium text-amber-700'
                      }
                    >
                      {formatNumber(r.ecart, 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Encours clients                                                   */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Encours clients par ancienneté</CardTitle>
            <CardDescription>
              Factures validées non soldées. Une facture sans échéance est comptée non échue.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {encours.length === 0 ? (
              <EmptyState icon={Scale} title="Rien à encaisser" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-center">Fact.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Non échu</TableHead>
                      <TableHead className="text-right">1-30 j</TableHead>
                      <TableHead className="text-right">31-60 j</TableHead>
                      <TableHead className="text-right">61-90 j</TableHead>
                      <TableHead className="text-right">+90 j</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {encours.map((e) => (
                      <TableRow key={`${e.client}-${e.devise}`}>
                        <TableCell className="font-medium">{e.client}</TableCell>
                        <TableCell className="tabular text-center">{e.factures}</TableCell>
                        <TableCell className="tabular whitespace-nowrap text-right font-medium">
                          {formatMoney(e.total, e.devise)}
                        </TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">
                          {Number(e.nonEchu) > 0 ? formatNumber(e.nonEchu, 0) : '—'}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {Number(e.jours1a30) > 0 ? formatNumber(e.jours1a30, 0) : '—'}
                        </TableCell>
                        <TableCell className="tabular text-right text-amber-700">
                          {Number(e.jours31a60) > 0 ? formatNumber(e.jours31a60, 0) : '—'}
                        </TableCell>
                        <TableCell className="tabular text-right text-amber-800">
                          {Number(e.jours61a90) > 0 ? formatNumber(e.jours61a90, 0) : '—'}
                        </TableCell>
                        <TableCell className="tabular text-right font-medium text-destructive">
                          {Number(e.plus90) > 0 ? formatNumber(e.plus90, 0) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
