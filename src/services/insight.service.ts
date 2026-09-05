import 'server-only'
import { prisma } from '@/lib/prisma'
import { add, dec, gt, round, sub } from '@/lib/money'

/**
 * Agregations destinees aux graphiques.
 *
 * Deux regles heritees du reste du projet :
 *
 *  1. Aucune addition entre devises. Les ventes sont en euros, les achats en
 *     dinars : tout ce qui melange les deux passe par la CONTREVALEUR EN
 *     DINARS figee sur le document (`netToPayTnd`), jamais par une conversion
 *     au taux du jour.
 *  2. Aucun calcul financier avec un `number` JavaScript. Les agregats SQL
 *     sont renvoyes en `::text` et repris par `dec()`.
 *
 * Les valeurs exposees aux composants de graphique sont des `number`, car
 * recharts n'accepte que cela — mais elles sont arrondies AVANT la conversion,
 * a la fin de la chaine, jamais au milieu d'un calcul.
 */

export interface InsightPeriod {
  from?: string
  to?: string
}

/** Un point de l'histogramme achats/ventes en kilogrammes. */
export interface WeightPoint {
  label: string
  achats: number
  ventes: number
}

/** Reste a encaisser par client, dans une devise donnee. */
export interface OutstandingPoint {
  name: string
  total: number
  currencyCode: string
}

/** Les cinq lignes du resultat simplifie, en dinars. */
export interface MarginBreakdown {
  ventesExport: number
  achatsFouta: number
  transport: number
  divers: number
  resultat: number
  /** Marge en pourcentage des ventes. Le chiffre qui parle vraiment. */
  margePercent: number
}

/** Prix unitaire d'une expedition, avant et apres frais de transport. */
export interface UnitPricePoint {
  label: string
  /** Prix moyen par piece, frais compris tels que factures. */
  prixUnitaire: number
  /** Prix par piece une fois les frais de transport retires. */
  prixHorsTransport: number
}

function toNumber(value: unknown, decimals = 3): number {
  return Number(round(value, decimals).toFixed(decimals))
}

function monthLabel(date: Date): string {
  return date.toISOString().slice(0, 7)
}

/**
 * Poids achete contre poids vendu, par mois.
 *
 * Cote achat le poids est deduit (quantite x poids unitaire du produit), cote
 * vente il est saisi sur l'en-tete de la facture (`netWeightKg`). Cette
 * asymetrie est assumee : ce sont les deux seules sources disponibles, et c'est
 * exactement le rapprochement fait a la main aujourd'hui.
 */
export async function getWeightReconciliation(period: InsightPeriod): Promise<WeightPoint[]> {
  const [purchases, sales] = await Promise.all([
    prisma.$queryRaw<Array<{ month: Date; kg: string }>>`
      SELECT date_trunc('month', p."date")::date AS month,
             COALESCE(SUM(pi."quantity" * pr."unitWeightKg"), 0)::text AS kg
      FROM "purchase_items" pi
      JOIN "purchases" p ON p."id" = pi."purchaseId"
      JOIN "products" pr ON pr."id" = pi."productId"
      WHERE p."status" NOT IN ('DRAFT', 'CANCELLED')
        AND pr."unitWeightKg" > 0
        AND (${period.from ?? null}::date IS NULL OR p."date" >= ${period.from ?? null}::date)
        AND (${period.to ?? null}::date IS NULL OR p."date" <= ${period.to ?? null}::date)
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ month: Date; kg: string }>>`
      SELECT date_trunc('month', "date")::date AS month,
             COALESCE(SUM("netWeightKg"), 0)::text AS kg
      FROM "invoices"
      WHERE "status" NOT IN ('DRAFT', 'CANCELLED')
        AND (${period.from ?? null}::date IS NULL OR "date" >= ${period.from ?? null}::date)
        AND (${period.to ?? null}::date IS NULL OR "date" <= ${period.to ?? null}::date)
      GROUP BY 1
      ORDER BY 1
    `,
  ])

  const months = new Map<string, WeightPoint>()
  for (const row of purchases) {
    const label = monthLabel(row.month)
    months.set(label, { label, achats: toNumber(row.kg), ventes: 0 })
  }
  for (const row of sales) {
    const label = monthLabel(row.month)
    const point = months.get(label) ?? { label, achats: 0, ventes: 0 }
    point.ventes = toNumber(row.kg)
    months.set(label, point)
  }

  return [...months.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** Reste a encaisser par client, toutes factures confirmees non soldees. */
export async function getOutstandingByCustomer(limit = 12): Promise<OutstandingPoint[]> {
  const rows = await prisma.invoice.groupBy({
    by: ['customerId', 'currencyCode'],
    where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, balanceDue: { gt: 0 } },
    _sum: { balanceDue: true },
    orderBy: { _sum: { balanceDue: 'desc' } },
    take: limit,
  })
  if (rows.length === 0) return []

  const customers = await prisma.customer.findMany({
    where: { id: { in: rows.map((r) => r.customerId) } },
    select: { id: true, companyName: true },
  })
  const names = new Map(customers.map((c) => [c.id, c.companyName]))

  return rows.map((row) => ({
    name: names.get(row.customerId) ?? '—',
    total: toNumber(row._sum.balanceDue, 2),
    currencyCode: row.currencyCode,
  }))
}

/**
 * Resultat simplifie, en dinars.
 *
 * Les ventes passent par `netToPayTnd` : la contrevaleur figee au taux du jour
 * de la facture. Les achats sont deja en dinars ; ils sont ventiles selon la
 * `nature` du fournisseur, reglee une fois sur sa fiche.
 *
 * Le TRANSPORT vient de son propre module, pas des achats : les societes de
 * transport ne sont pas des fournisseurs de marchandise. La ventilation reste
 * la meme a l'ecran — marchandise, transport, divers — mais chaque poste est
 * lu la ou il vit reellement.
 */
export async function getMarginBreakdown(period: InsightPeriod): Promise<MarginBreakdown> {
  const [sales, purchases, transportRows] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        ...(period.from ? { date: { gte: new Date(`${period.from}T00:00:00.000Z`) } } : {}),
        ...(period.to ? { date: { lte: new Date(`${period.to}T00:00:00.000Z`) } } : {}),
      },
      _sum: { netToPayTnd: true },
    }),
    prisma.$queryRaw<Array<{ nature: string; total: string }>>`
      SELECT s."nature"::text AS nature,
             COALESCE(SUM(p."netToPay"), 0)::text AS total
      FROM "purchases" p
      JOIN "suppliers" s ON s."id" = p."supplierId"
      WHERE p."status" NOT IN ('DRAFT', 'CANCELLED')
        AND (${period.from ?? null}::date IS NULL OR p."date" >= ${period.from ?? null}::date)
        AND (${period.to ?? null}::date IS NULL OR p."date" <= ${period.to ?? null}::date)
      GROUP BY 1
    `,
    prisma.transportInvoice.aggregate({
      where: {
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        ...(period.from ? { date: { gte: new Date(`${period.from}T00:00:00.000Z`) } } : {}),
        ...(period.to ? { date: { lte: new Date(`${period.to}T00:00:00.000Z`) } } : {}),
      },
      _sum: { netToPayTnd: true },
    }),
  ])

  const byNature = new Map(purchases.map((r) => [r.nature, dec(r.total)]))
  const ventes = round(sales._sum.netToPayTnd, 3)
  const fouta = round(byNature.get('FOUTA') ?? 0, 3)
  // `nature = TRANSPORT` subsiste pour l'historique d'avant le module : on
  // additionne les deux sources plutot que d'en perdre une.
  const transport = round(
    add(byNature.get('TRANSPORT') ?? 0, transportRows._sum.netToPayTnd ?? 0),
    3,
  )
  const divers = round(byNature.get('DIVERS') ?? 0, 3)

  const resultat = round(sub(ventes, add(fouta, transport, divers)), 3)
  // Sur une periode sans vente, un pourcentage n'a pas de sens : on renvoie 0
  // plutot qu'une division par zero.
  const margePercent = gt(ventes, 0)
    ? Number(round(resultat.dividedBy(ventes).times(100), 2).toFixed(2))
    : 0

  return {
    ventesExport: toNumber(ventes),
    achatsFouta: toNumber(fouta),
    transport: toNumber(transport),
    divers: toNumber(divers),
    resultat: toNumber(resultat),
    margePercent,
  }
}

/**
 * Prix unitaire par facture, avant et apres transport.
 *
 * Reproduit les colonnes `prix/unite` et `prix / p/tr` du suivi manuel : le
 * second retire les frais de transport et de transit du total, ce qui montre
 * l'erosion de la marge d'une expedition a l'autre.
 */
export async function getUnitPriceTrend(period: InsightPeriod, limit = 40): Promise<UnitPricePoint[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      ...(period.from ? { date: { gte: new Date(`${period.from}T00:00:00.000Z`) } } : {}),
      ...(period.to ? { date: { lte: new Date(`${period.to}T00:00:00.000Z`) } } : {}),
    },
    orderBy: { date: 'asc' },
    take: limit,
    select: {
      number: true,
      date: true,
      totalHt: true,
      shippingAmount: true,
      transitAmount: true,
      items: { select: { quantity: true } },
    },
  })

  const points: UnitPricePoint[] = []
  for (const invoice of invoices) {
    const quantity = add(...invoice.items.map((i) => i.quantity))
    // Une facture sans quantite (prestation pure) ne produit pas de prix unitaire.
    if (!gt(quantity, 0)) continue

    const ht = dec(invoice.totalHt)
    const fraisTransport = add(invoice.shippingAmount, invoice.transitAmount)

    points.push({
      label: invoice.number,
      prixUnitaire: Number(round(ht.dividedBy(quantity), 4).toFixed(4)),
      prixHorsTransport: Number(round(sub(ht, fraisTransport).dividedBy(quantity), 4).toFixed(4)),
    })
  }
  return points
}

/** Repartition des achats par fournisseur, en dinars. */
export async function getPurchaseShareBySupplier(period: InsightPeriod, limit = 8) {
  const rows = await prisma.$queryRaw<Array<{ name: string; total: string }>>`
    SELECT s."companyName" AS name,
           COALESCE(SUM(p."netToPay"), 0)::text AS total
    FROM "purchases" p
    JOIN "suppliers" s ON s."id" = p."supplierId"
    WHERE p."status" NOT IN ('DRAFT', 'CANCELLED')
      AND (${period.from ?? null}::date IS NULL OR p."date" >= ${period.from ?? null}::date)
      AND (${period.to ?? null}::date IS NULL OR p."date" <= ${period.to ?? null}::date)
    GROUP BY 1
    ORDER BY SUM(p."netToPay") DESC
    LIMIT ${limit}
  `
  return rows.map((row) => ({ name: row.name, total: toNumber(row.total) }))
}
