import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowLeftRight, CreditCard, ShoppingCart, Truck, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requirePermission } from '@/lib/auth'
import { PAYMENT_METHOD_LABELS, formatDate, formatNumber } from '@/lib/format'
import { MOVEMENT_LABELS } from '@/lib/stock-labels'
import { cn } from '@/lib/utils'
import { getBilanMois } from '@/services/bilan.service'

export const dynamic = 'force-dynamic'

const NATURES: Record<string, string> = {
  FOUTA: 'Marchandise',
  TRANSPORT: 'Transport',
  DIVERS: 'Divers',
}

/** « 2026-06 » -> { annee: 2026, mois: 6 }, ou null si la forme ne convient pas. */
function parseMois(valeur: string) {
  const m = valeur.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const annee = Number(m[1])
  const mois = Number(m[2])
  if (mois < 1 || mois > 12) return null
  return { annee, mois }
}

/** Mois precedent et suivant, pour naviguer sans repasser par la grille. */
function voisins(annee: number, mois: number) {
  const p = mois === 1 ? { annee: annee - 1, mois: 12 } : { annee, mois: mois - 1 }
  const s = mois === 12 ? { annee: annee + 1, mois: 1 } : { annee, mois: mois + 1 }
  const cle = (x: { annee: number; mois: number }) =>
    `${x.annee}-${String(x.mois).padStart(2, '0')}`
  return { precedent: cle(p), suivant: cle(s) }
}

export default async function BilanMoisPage({ params }: { params: Promise<{ mois: string }> }) {
  await requirePermission('report.read')
  const { mois: parametre } = await params
  const cible = parseMois(parametre)
  if (!cible) notFound()

  const b = await getBilanMois(cible.annee, cible.mois)
  const s = b.synthese
  const deficit = Number(s.resultatTnd) < 0
  const nav = voisins(cible.annee, cible.mois)

  return (
    <>
      <PageHeader
        title={`${b.libelle} ${b.annee}`}
        description="Rapport détaillé du mois : ventes, achats, transport, trésorerie et stock."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/bilan?annee=${b.annee}`}>
                <ArrowLeft className="h-4 w-4" />
                Les douze mois
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/bilan/${nav.precedent}`}>← Mois précédent</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/bilan/${nav.suivant}`}>Mois suivant →</Link>
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Synthese                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ventes</p>
            {s.ventesParDevise.length === 0 ? (
              <p className="tabular mt-1 text-xl font-semibold text-muted-foreground">—</p>
            ) : (
              s.ventesParDevise.map((d) => (
                <p key={d.currencyCode} className="tabular mt-1 text-xl font-semibold text-navy-800">
                  {formatNumber(d.net, 2)} {d.currencyCode === 'TND' ? 'DT' : '€'}
                </p>
              ))
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(s.ventesTnd, 3)} DT · {b.ventes.length} facture(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Achats HT</p>
            <p className="tabular mt-1 text-xl font-semibold text-navy-800">
              {formatNumber(s.achatsHtTnd, 3)} DT
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(s.achatsTtcTnd, 3)} TTC · TVA récup. {formatNumber(s.tvaDeductibleTnd, 3)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Transport</p>
            <p className="tabular mt-1 text-xl font-semibold text-navy-800">
              {formatNumber(s.transportTnd, 3)} DT
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{b.transport.length} facture(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Résultat du mois</p>
            <p
              className={cn(
                'tabular mt-1 text-xl font-semibold',
                deficit ? 'text-destructive' : 'text-emerald-700',
              )}
            >
              {formatNumber(s.resultatTnd, 3)} DT
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              ventes − achats HT − transport
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Volumes expédiés</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pièces</dt>
                <dd className="tabular font-medium">{formatNumber(s.pieces, 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Poids net</dt>
                <dd className="tabular font-medium">{formatNumber(s.poidsKg, 3)} kg</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Colis</dt>
                <dd className="tabular font-medium">{s.colis}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Achats par nature (HT)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {s.achatsParNature.length === 0 ? (
              <p className="text-muted-foreground">Aucun achat ce mois-ci.</p>
            ) : (
              <dl className="space-y-1">
                {s.achatsParNature.map((n) => (
                  <div key={n.nature} className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {NATURES[n.nature] ?? n.nature} ({n.factures})
                    </dt>
                    <dd className="tabular font-medium">{formatNumber(n.montant, 3)} DT</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transport par transporteur</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {s.transportParTransporteur.length === 0 ? (
              <p className="text-muted-foreground">Aucun transport ce mois-ci.</p>
            ) : (
              <dl className="space-y-1">
                {s.transportParTransporteur.map((n) => (
                  <div key={n.transporteur} className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {n.transporteur} ({n.factures})
                    </dt>
                    <dd className="tabular font-medium">{formatNumber(n.montant, 3)} DT</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Ventes du mois                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Ventes</CardTitle>
          <CardDescription>
            La colonne « Transport » donne le coût d&apos;acheminement rattaché à chaque expédition.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {b.ventes.length === 0 ? (
            <EmptyState icon={Wallet} title="Aucune vente ce mois-ci" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Facture</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Incoterm</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-right">Taux</TableHead>
                    <TableHead className="text-right">En DT</TableHead>
                    <TableHead className="text-right">Réglé</TableHead>
                    <TableHead className="text-right">Reste</TableHead>
                    <TableHead className="text-right">Pièces</TableHead>
                    <TableHead className="text-right">Transport DT</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.ventes.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        <Link href={`/invoices/${v.id}`} className="text-primary hover:underline">
                          {v.number}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(v.date)}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">{v.client}</TableCell>
                      <TableCell className="text-muted-foreground">{v.incoterm || '—'}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatNumber(v.net, 2)} {v.currencyCode === 'TND' ? 'DT' : '€'}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-muted-foreground">
                        {formatNumber(v.taux, 4)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatNumber(v.netTnd, 3)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-emerald-700">
                        {formatNumber(v.regle, 2)}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-amber-700">
                        {formatNumber(v.reste, 2)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {Number(v.pieces) ? formatNumber(v.pieces, 0) : '—'}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {Number(v.transportTnd) ? formatNumber(v.transportTnd, 3) : '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={v.statut} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Achats et transport                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Achats</CardTitle>
            <CardDescription>{b.achats.length} facture(s) fournisseur.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {b.achats.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="Aucun achat ce mois-ci" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numéro</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead className="text-right">HT</TableHead>
                      <TableHead className="text-right">TVA</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Retenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.achats.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          <Link href={`/purchases/${a.id}`} className="text-primary hover:underline">
                            {a.number}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(a.date)}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate">{a.fournisseur}</TableCell>
                        <TableCell className="tabular whitespace-nowrap text-right">
                          {formatNumber(a.totalHt, 3)}
                        </TableCell>
                        <TableCell className="tabular whitespace-nowrap text-right text-muted-foreground">
                          {formatNumber(a.tva, 3)}
                        </TableCell>
                        <TableCell className="tabular whitespace-nowrap text-right font-medium">
                          {formatNumber(a.net, 3)}
                        </TableCell>
                        <TableCell className="tabular whitespace-nowrap text-right">
                          {Number(a.retenue) ? formatNumber(a.retenue, 3) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transport</CardTitle>
            <CardDescription>{b.transport.length} facture(s) de transporteur.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {b.transport.length === 0 ? (
              <EmptyState icon={Truck} title="Aucun transport ce mois-ci" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numéro</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Transporteur</TableHead>
                      <TableHead>Expédition</TableHead>
                      <TableHead>Vente</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.transport.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          <Link href={`/transport/${t.id}`} className="text-primary hover:underline">
                            {t.number}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(t.date)}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate">{t.transporteur}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.expedition || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {t.venteId ? (
                            <Link href={`/invoices/${t.venteId}`} className="text-primary hover:underline">
                              {t.vente}
                            </Link>
                          ) : (
                            <span className="text-xs text-amber-700">non rattachée</span>
                          )}
                        </TableCell>
                        <TableCell className="tabular whitespace-nowrap text-right font-medium">
                          {formatNumber(t.net, 3)}
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

      {/* ------------------------------------------------------------------ */}
      {/* Tresorerie                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Encaissements clients</CardTitle>
            <CardDescription>
              Datés du règlement, pas de la facture — un encaissement de juin sur une facture de
              mars appartient à juin.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {b.encaissements.length === 0 ? (
              <EmptyState icon={CreditCard} title="Aucun encaissement ce mois-ci" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Facture</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.encaissements.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(p.date)}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{p.client}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/invoices/${p.factureId}`} className="text-primary hover:underline">
                          {p.facture}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {PAYMENT_METHOD_LABELS[p.methode] ?? p.methode}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium text-emerald-700">
                        {formatNumber(p.montant, 2)} {p.currencyCode === 'TND' ? 'DT' : '€'}
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
            <CardTitle>Règlements sortants</CardTitle>
            <CardDescription>Fournisseurs et transporteurs.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {b.reglements.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="Aucun règlement ce mois-ci"
                description="Les règlements fournisseurs et transporteurs ne sont pas encore saisis."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Nature</TableHead>
                    <TableHead>Bénéficiaire</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.reglements.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(p.date)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.nature}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{p.beneficiaire}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {p.document}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatNumber(p.montant, 3)} DT
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Stock                                                               */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Mouvements de stock</CardTitle>
          <CardDescription>
            {b.mouvements.length} mouvement(s) · entrées {formatNumber(s.entrees, 0)} · sorties{' '}
            {formatNumber(s.sorties, 0)}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {b.mouvements.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="Aucun mouvement ce mois-ci" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Stock après</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.mouvements.map((m) => {
                    const entree = ['PURCHASE_IN', 'ADJUST_IN', 'CUSTOMER_RETURN'].includes(m.type)
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(m.date)}</TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          <Link href={`/products/${m.produitId}`} className="text-primary hover:underline">
                            {m.produit}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {MOVEMENT_LABELS[m.type] ?? m.type}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.reference || '—'}</TableCell>
                        <TableCell
                          className={cn(
                            'tabular whitespace-nowrap text-right font-medium',
                            entree ? 'text-emerald-700' : 'text-amber-700',
                          )}
                        >
                          {entree ? '+' : '−'} {formatNumber(m.quantite, 0)} {m.unite}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'tabular whitespace-nowrap text-right',
                            Number(m.stockApres) < 0 && 'text-destructive',
                          )}
                        >
                          {formatNumber(m.stockApres, 0)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
