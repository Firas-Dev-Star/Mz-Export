import Link from 'next/link'
import { CalendarRange } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requirePermission } from '@/lib/auth'
import { formatNumber } from '@/lib/format'
import { getAnneesDisponibles, getBilanAnnuel } from '@/services/bilan.service'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Bilan mensuel — MZ EXPORT' }
export const dynamic = 'force-dynamic'

/**
 * Bilan mensuel : douze lignes, une par mois, et le detail derriere chaque mois.
 *
 * PARTI PRIS DE LECTURE. Les euros et les dinars ne sont jamais additionnes.
 * Le resultat est calcule sur les achats HORS TAXE, parce que la TVA payee sur
 * les achats est recuperable — les ventes a l'export sont exonerees. La TVA a
 * sa propre colonne, pour qu'elle reste visible sans polluer le resultat.
 */
export default async function BilanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePermission('report.read')
  const params = await searchParams
  const annees = await getAnneesDisponibles()
  const demandee = typeof params.annee === 'string' ? Number(params.annee) : NaN
  const annee = annees.includes(demandee) ? demandee : annees[0]

  const bilan = await getBilanAnnuel(annee)
  const t = bilan.totaux
  const deficit = Number(t.resultatTnd) < 0

  return (
    <>
      <PageHeader
        title={`Bilan mensuel ${annee}`}
        description="Un mois par ligne. Cliquez sur un mois pour ouvrir son rapport détaillé."
        actions={
          annees.length > 1 ? (
            <div className="flex gap-2">
              {annees.map((a) => (
                <Button key={a} asChild variant={a === annee ? 'default' : 'outline'} size="sm">
                  <Link href={`/bilan?annee=${a}`}>{a}</Link>
                </Button>
              ))}
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Chiffre d&apos;affaires
            </p>
            <p className="tabular mt-1 text-xl font-semibold text-navy-800">
              {formatNumber(t.ventesDevise, 2)} €
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(t.ventesTnd, 3)} DT · {t.ventes} factures
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Achats HT</p>
            <p className="tabular mt-1 text-xl font-semibold text-navy-800">
              {formatNumber(t.achatsHtTnd, 3)} DT
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(t.achatsTtcTnd, 3)} DT TTC à décaisser
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Transport</p>
            <p className="tabular mt-1 text-xl font-semibold text-navy-800">
              {formatNumber(t.transportTnd, 3)} DT
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t.transport} factures</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Résultat</p>
            <p
              className={cn(
                'tabular mt-1 text-xl font-semibold',
                deficit ? 'text-destructive' : 'text-emerald-700',
              )}
            >
              {formatNumber(t.resultatTnd, 3)} DT
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              TVA récupérable {formatNumber(t.tvaDeductibleTnd, 3)} DT, hors résultat
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Les douze mois de {annee}</CardTitle>
          <CardDescription>
            {bilan.moisActifs} mois avec activité. Le résultat déduit les achats hors taxe et le
            transport ; la TVA d&apos;achat est récupérable et figure à part.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mois</TableHead>
                  <TableHead className="text-right">Fact.</TableHead>
                  <TableHead className="text-right">Ventes €</TableHead>
                  <TableHead className="text-right">Ventes DT</TableHead>
                  <TableHead className="text-right">Encaissé €</TableHead>
                  <TableHead className="text-right">Achats HT</TableHead>
                  <TableHead className="text-right">TVA récup.</TableHead>
                  <TableHead className="text-right">Transport</TableHead>
                  <TableHead className="text-right">Résultat DT</TableHead>
                  <TableHead className="text-right">Pièces</TableHead>
                  <TableHead className="text-right">Poids kg</TableHead>
                  <TableHead className="text-right">Colis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bilan.lignes.map((l) => {
                  const vide = l.ventes === 0 && l.achats === 0 && l.transport === 0
                  const negatif = Number(l.resultatTnd) < 0
                  return (
                    <TableRow key={l.mois} className={vide ? 'text-muted-foreground/50' : undefined}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {vide ? (
                          <span className="text-muted-foreground/60">{l.libelle}</span>
                        ) : (
                          <Link
                            href={`/bilan/${annee}-${String(l.mois).padStart(2, '0')}`}
                            className="text-primary hover:underline"
                          >
                            {l.libelle}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right">{l.ventes || '—'}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {Number(l.ventesDevise) ? formatNumber(l.ventesDevise, 2) : '—'}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {Number(l.ventesTnd) ? formatNumber(l.ventesTnd, 3) : '—'}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-emerald-700">
                        {Number(l.encaisseDevise) ? formatNumber(l.encaisseDevise, 2) : '—'}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {Number(l.achatsHtTnd) ? formatNumber(l.achatsHtTnd, 3) : '—'}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right text-muted-foreground">
                        {Number(l.tvaDeductibleTnd) ? formatNumber(l.tvaDeductibleTnd, 3) : '—'}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {Number(l.transportTnd) ? formatNumber(l.transportTnd, 3) : '—'}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'tabular whitespace-nowrap text-right font-medium',
                          !vide && (negatif ? 'text-destructive' : 'text-emerald-700'),
                        )}
                      >
                        {vide ? '—' : formatNumber(l.resultatTnd, 3)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {Number(l.pieces) ? formatNumber(l.pieces, 0) : '—'}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {Number(l.poidsKg) ? formatNumber(l.poidsKg, 0) : '—'}
                      </TableCell>
                      <TableCell className="tabular text-right">{l.colis || '—'}</TableCell>
                    </TableRow>
                  )
                })}

                <TableRow className="border-t-2 border-border bg-secondary/40">
                  <TableCell className="font-semibold text-navy-800">Année {annee}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{t.ventes}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                    {formatNumber(t.ventesDevise, 2)}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                    {formatNumber(t.ventesTnd, 3)}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-semibold text-emerald-700">
                    {formatNumber(t.encaisseDevise, 2)}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                    {formatNumber(t.achatsHtTnd, 3)}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-semibold text-muted-foreground">
                    {formatNumber(t.tvaDeductibleTnd, 3)}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                    {formatNumber(t.transportTnd, 3)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'tabular whitespace-nowrap text-right font-semibold',
                      deficit ? 'text-destructive' : 'text-emerald-700',
                    )}
                  >
                    {formatNumber(t.resultatTnd, 3)}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">
                    {formatNumber(t.pieces, 0)}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                    {formatNumber(t.poidsKg, 0)}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">{t.colis}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Ventilation des achats sur l&apos;année</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Marchandise (fouta)
              </p>
              <p className="tabular font-semibold text-navy-800">
                {formatNumber(t.achatsFoutaTnd, 3)} DT
              </p>
              <p className="text-xs text-muted-foreground">TTC</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Divers</p>
              <p className="tabular font-semibold text-navy-800">
                {formatNumber(t.achatsDiversTnd, 3)} DT
              </p>
              <p className="text-xs text-muted-foreground">TTC</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Transport</p>
              <p className="tabular font-semibold text-navy-800">
                {formatNumber(t.transportTnd, 3)} DT
              </p>
              <p className="text-xs text-muted-foreground">{t.transport} factures</p>
            </div>
            <div className="flex items-center">
              <Badge variant="outline">
                <CalendarRange className="mr-1 h-3 w-3" />
                {bilan.moisActifs} mois d&apos;activité
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
