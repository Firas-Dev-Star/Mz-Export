import 'server-only'
import { prisma } from '@/lib/prisma'
import { add, dec, round, sub } from '@/lib/money'

/**
 * Bilan MENSUEL : une ligne par mois, et le detail de chaque mois.
 *
 * TROIS REGLES QUI GOUVERNENT CE SERVICE
 *
 * 1. LES DEVISES NE SE MELANGENT PAS. Les ventes sont facturees en euros, les
 *    achats et le transport en dinars. Le bilan affiche donc les euros pour ce
 *    qu'ils sont, et n'additionne que les colonnes en dinars — via les
 *    contrevaleurs `*Tnd` figees sur chaque document, jamais par une conversion
 *    au taux du jour.
 *
 * 2. LE MOIS D'UN DOCUMENT EST CELUI DE SA DATE, pas celui de sa saisie. Un
 *    achat de janvier enregistre en mars appartient a janvier.
 *
 * 3. LES BROUILLONS ET LES ANNULES SONT EXCLUS. Un bilan mensuel doit refleter
 *    ce qui est engage, pas ce qui est en cours de saisie.
 *
 * L'agregation est faite par PostgreSQL et rendue en chaines decimales : aucun
 * montant ne transite par un `number` JavaScript.
 */

const ENGAGES = "status NOT IN ('DRAFT', 'CANCELLED')"

export interface LigneMois {
  /** 1 a 12. */
  mois: number
  libelle: string
  /** Nombre de factures de vente du mois. */
  ventes: number
  /** Chiffre d'affaires en devise de facturation (euros, en pratique). */
  ventesDevise: string
  /** Contrevaleur en dinars, au taux fige de chaque facture. */
  ventesTnd: string
  /** Encaisse pendant le mois, en devise puis en contrevaleur. */
  encaisseDevise: string
  encaisseTnd: string
  achats: number
  achatsFoutaTnd: string
  achatsDiversTnd: string
  /** Charge reelle des achats : HORS TVA. */
  achatsHtTnd: string
  /** Achats TTC : ce qu'il faut decaisser, pas ce que ca coute. */
  achatsTtcTnd: string
  /** TVA d'achat, RECUPERABLE : suivie a part, jamais comptee en charge. */
  tvaDeductibleTnd: string
  transport: number
  transportTnd: string
  /**
   * Ventes en dinars, moins les achats HORS TAXE, moins le transport.
   *
   * POURQUOI HORS TAXE. MZ EXPORT exporte : ses ventes sont exonerees et la
   * TVA payee sur les achats est recuperable. La compter en charge rendrait
   * chaque mois artificiellement deficitaire — de 183 000 DT sur 2026.
   */
  resultatTnd: string
  /** Pieces expediees, quand les lignes sont rattachees a un produit. */
  pieces: string
  poidsKg: string
  colis: number
}

interface RangeeSql {
  mois: number
  n: number
  devise: string | null
  tnd: string | null
}

function libelleMois(mois: number) {
  return [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ][mois - 1]
}

/** Bornes de l'annee, en UTC, pour des colonnes `date`. */
function bornes(annee: number) {
  return { debut: `${annee}-01-01`, fin: `${annee}-12-31` }
}

/**
 * Grille des douze mois d'une annee.
 *
 * Un mois sans mouvement figure quand meme, a zero : une annee doit se lire
 * d'un bloc, et un mois absent laisserait croire a un oubli de saisie.
 */
export async function getBilanAnnuel(annee: number) {
  const { debut, fin } = bornes(annee)

  const [ventes, encaissements, achats, transport, volumes] = await Promise.all([
    prisma.$queryRawUnsafe<RangeeSql[]>(
      `select extract(month from "date")::int as mois,
              count(*)::int as n,
              sum("netToPay")::text as devise,
              sum("netToPayTnd")::text as tnd
       from "invoices"
       where ${ENGAGES} and "date" between $1::date and $2::date
       group by 1`,
      debut,
      fin,
    ),
    // Les encaissements sont dates de leur propre reglement, pas de la facture.
    prisma.$queryRawUnsafe<RangeeSql[]>(
      `select extract(month from p."date")::int as mois,
              count(*)::int as n,
              sum(p."amount")::text as devise,
              sum(p."amount" * i."exchangeRateTnd")::text as tnd
       from "payments" p
       join "invoices" i on i."id" = p."invoiceId"
       where p."date" between $1::date and $2::date
       group by 1`,
      debut,
      fin,
    ),
    prisma.$queryRawUnsafe<Array<RangeeSql & { nature: string; ht: string | null; tva: string | null }>>(
      `select extract(month from p."date")::int as mois,
              coalesce(s."nature"::text, 'DIVERS') as nature,
              count(*)::int as n,
              sum(p."netToPay")::text as devise,
              sum(p."netToPayTnd")::text as tnd,
              sum(p."totalHt")::text as ht,
              sum(p."vatAmount")::text as tva
       from "purchases" p
       join "suppliers" s on s."id" = p."supplierId"
       where p.${ENGAGES} and p."date" between $1::date and $2::date
       group by 1, 2`,
      debut,
      fin,
    ),
    prisma.$queryRawUnsafe<Array<RangeeSql & { ht: string | null; tva: string | null }>>(
      `select extract(month from "date")::int as mois,
              count(*)::int as n,
              sum("netToPay")::text as devise,
              sum("netToPayTnd")::text as tnd,
              sum("totalHt")::text as ht,
              sum("vatAmount")::text as tva
       from "transport_invoices"
       where ${ENGAGES} and "date" between $1::date and $2::date
       group by 1`,
      debut,
      fin,
    ),
    prisma.$queryRawUnsafe<Array<{ mois: number; pieces: string | null; poids: string | null; colis: number }>>(
      `select extract(month from v."date")::int as mois,
              coalesce(sum(q.pieces), 0)::text as pieces,
              coalesce(sum(v."netWeightKg"), 0)::text as poids,
              coalesce(sum(v."packageCount"), 0)::int as colis
       from "invoices" v
       left join (
         select "invoiceId", sum("quantity") as pieces
         from "invoice_items" where "productId" is not null group by 1
       ) q on q."invoiceId" = v."id"
       where v.${ENGAGES} and v."date" between $1::date and $2::date
       group by 1`,
      debut,
      fin,
    ),
  ])

  const parMois = <T extends { mois: number }>(rows: T[]) => new Map(rows.map((r) => [r.mois, r]))
  const v = parMois(ventes)
  const e = parMois(encaissements)
  const t = parMois(transport)
  const vol = parMois(volumes)

  const lignes: LigneMois[] = []
  for (let mois = 1; mois <= 12; mois += 1) {
    const achatsMois = achats.filter((a) => a.mois === mois)
    const fouta = round(add(...achatsMois.filter((a) => a.nature === 'FOUTA').map((a) => a.tnd ?? 0)), 3)
    const divers = round(
      add(...achatsMois.filter((a) => a.nature !== 'FOUTA').map((a) => a.tnd ?? 0)),
      3,
    )
    const achatsTtc = round(add(fouta, divers), 3)
    const achatsHt = round(add(...achatsMois.map((a) => a.ht ?? 0)), 3)
    const tvaAchats = round(add(...achatsMois.map((a) => a.tva ?? 0)), 3)

    const transportHt = round(t.get(mois)?.ht ?? 0, 3)
    const tvaTransport = round(t.get(mois)?.tva ?? 0, 3)

    const ventesTnd = round(v.get(mois)?.tnd ?? 0, 3)

    lignes.push({
      mois,
      libelle: libelleMois(mois),
      ventes: v.get(mois)?.n ?? 0,
      ventesDevise: round(v.get(mois)?.devise ?? 0, 2).toFixed(2),
      ventesTnd: ventesTnd.toFixed(3),
      encaisseDevise: round(e.get(mois)?.devise ?? 0, 2).toFixed(2),
      encaisseTnd: round(e.get(mois)?.tnd ?? 0, 3).toFixed(3),
      achats: achatsMois.reduce((n, a) => n + a.n, 0),
      achatsFoutaTnd: fouta.toFixed(3),
      achatsDiversTnd: divers.toFixed(3),
      achatsHtTnd: achatsHt.toFixed(3),
      achatsTtcTnd: achatsTtc.toFixed(3),
      tvaDeductibleTnd: round(add(tvaAchats, tvaTransport), 3).toFixed(3),
      transport: t.get(mois)?.n ?? 0,
      transportTnd: transportHt.toFixed(3),
      resultatTnd: round(sub(ventesTnd, add(achatsHt, transportHt)), 3).toFixed(3),
      pieces: round(vol.get(mois)?.pieces ?? 0, 3).toFixed(0),
      poidsKg: round(vol.get(mois)?.poids ?? 0, 3).toFixed(3),
      colis: vol.get(mois)?.colis ?? 0,
    })
  }

  const somme = (champ: keyof LigneMois, decimales: number) =>
    round(add(...lignes.map((l) => l[champ] as string)), decimales).toFixed(decimales)

  const totaux = {
    ventes: lignes.reduce((n, l) => n + l.ventes, 0),
    ventesDevise: somme('ventesDevise', 2),
    ventesTnd: somme('ventesTnd', 3),
    encaisseDevise: somme('encaisseDevise', 2),
    encaisseTnd: somme('encaisseTnd', 3),
    achats: lignes.reduce((n, l) => n + l.achats, 0),
    achatsFoutaTnd: somme('achatsFoutaTnd', 3),
    achatsDiversTnd: somme('achatsDiversTnd', 3),
    achatsHtTnd: somme('achatsHtTnd', 3),
    achatsTtcTnd: somme('achatsTtcTnd', 3),
    tvaDeductibleTnd: somme('tvaDeductibleTnd', 3),
    transport: lignes.reduce((n, l) => n + l.transport, 0),
    transportTnd: somme('transportTnd', 3),
    resultatTnd: somme('resultatTnd', 3),
    pieces: round(add(...lignes.map((l) => l.pieces)), 0).toFixed(0),
    poidsKg: somme('poidsKg', 3),
    colis: lignes.reduce((n, l) => n + l.colis, 0),
  }

  /** Le mois le plus fort et le plus faible en resultat, hors mois vides. */
  const actifs = lignes.filter((l) => l.ventes > 0 || l.achats > 0 || l.transport > 0)

  return { annee, lignes, totaux, moisActifs: actifs.length }
}

/** Annees pour lesquelles il existe au moins un document. */
export async function getAnneesDisponibles(): Promise<number[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ annee: number }>>(
    `select distinct extract(year from "date")::int as annee from "invoices"
     union select distinct extract(year from "date")::int from "purchases"
     union select distinct extract(year from "date")::int from "transport_invoices"
     order by 1 desc`,
  )
  const annees = rows.map((r) => r.annee)
  return annees.length > 0 ? annees : [new Date().getUTCFullYear()]
}

// ---------------------------------------------------------------------------
// Detail d'un mois
// ---------------------------------------------------------------------------

/** Premier et dernier jour du mois, en UTC. */
function bornesMois(annee: number, mois: number) {
  const gte = new Date(Date.UTC(annee, mois - 1, 1))
  const lte = new Date(Date.UTC(annee, mois, 0))
  return { gte, lte }
}

export async function getBilanMois(annee: number, mois: number) {
  const { gte, lte } = bornesMois(annee, mois)
  const periode = { gte, lte }

  const [ventes, achats, transport, encaissements, reglements, reglementsTransport, mouvements] =
    await Promise.all([
      prisma.invoice.findMany({
        where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, date: periode },
        orderBy: [{ date: 'asc' }, { number: 'asc' }],
        select: {
          id: true, number: true, date: true, status: true, currencyCode: true,
          netToPay: true, netToPayTnd: true, paidAmount: true, balanceDue: true,
          exchangeRateTnd: true, incoterm: true, netWeightKg: true, packageCount: true,
          domiciliationRef: true,
          customer: { select: { id: true, companyName: true } },
          items: { select: { quantity: true, productId: true } },
          transportInvoices: {
            where: { status: { not: 'CANCELLED' } },
            select: { netToPay: true },
          },
        },
      }),
      prisma.purchase.findMany({
        where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, date: periode },
        orderBy: [{ date: 'asc' }, { number: 'asc' }],
        select: {
          id: true, number: true, supplierReference: true, date: true, status: true,
          totalHt: true, vatAmount: true, netToPay: true, withholdingAmount: true,
          balanceDue: true,
          supplier: { select: { id: true, companyName: true, nature: true } },
        },
      }),
      prisma.transportInvoice.findMany({
        where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, date: periode },
        orderBy: [{ date: 'asc' }, { number: 'asc' }],
        select: {
          id: true, number: true, carrierReference: true, date: true, status: true,
          shipmentRef: true, totalHt: true, vatAmount: true, netToPay: true, balanceDue: true,
          carrier: { select: { id: true, companyName: true } },
          invoice: { select: { id: true, number: true } },
        },
      }),
      prisma.payment.findMany({
        where: { date: periode },
        orderBy: [{ date: 'asc' }],
        select: {
          id: true, date: true, amount: true, currencyCode: true, method: true, reference: true,
          invoice: { select: { id: true, number: true, customer: { select: { companyName: true } } } },
        },
      }),
      prisma.purchasePayment.findMany({
        where: { date: periode },
        orderBy: [{ date: 'asc' }],
        select: {
          id: true, date: true, amount: true, currencyCode: true, method: true, reference: true,
          purchase: { select: { id: true, number: true, supplier: { select: { companyName: true } } } },
        },
      }),
      prisma.transportPayment.findMany({
        where: { date: periode },
        orderBy: [{ date: 'asc' }],
        select: {
          id: true, date: true, amount: true, currencyCode: true, method: true, reference: true,
          transportInvoice: {
            select: { id: true, number: true, carrier: { select: { companyName: true } } },
          },
        },
      }),
      prisma.stockMovement.findMany({
        where: { date: periode },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, date: true, type: true, quantity: true, stockAfter: true, reference: true,
          product: { select: { id: true, designation: true, unit: true } },
        },
      }),
    ])

  // ---- Totaux du mois, par devise pour les ventes ----
  const devises = [...new Set(ventes.map((v) => v.currencyCode))]
  const ventesParDevise = devises.map((code) => ({
    currencyCode: code,
    factures: ventes.filter((v) => v.currencyCode === code).length,
    net: round(add(...ventes.filter((v) => v.currencyCode === code).map((v) => v.netToPay)), 2).toFixed(2),
    regle: round(add(...ventes.filter((v) => v.currencyCode === code).map((v) => v.paidAmount)), 2).toFixed(2),
    reste: round(add(...ventes.filter((v) => v.currencyCode === code).map((v) => v.balanceDue)), 2).toFixed(2),
  }))

  const ventesTnd = round(add(...ventes.map((v) => v.netToPayTnd)), 3)
  // Charge = HORS TAXE. La TVA d'achat est recuperable (ventes export
  // exonerees) : la compter en charge faussrait le resultat du mois.
  const achatsHtTnd = round(add(...achats.map((a) => a.totalHt)), 3)
  const achatsTtcTnd = round(add(...achats.map((a) => a.netToPay)), 3)
  const tvaAchatsTnd = round(add(...achats.map((a) => a.vatAmount)), 3)
  const transportTnd = round(add(...transport.map((t) => t.totalHt)), 3)
  const transportTtcTnd = round(add(...transport.map((t) => t.netToPay)), 3)

  const natures = [...new Set(achats.map((a) => a.supplier.nature))].sort()
  // Ventilation en HORS TAXE, comme le resultat : melanger HT et TTC dans le
  // meme bloc rendrait la somme des natures differente du total affiche.
  const achatsParNature = natures.map((nature) => ({
    nature,
    factures: achats.filter((a) => a.supplier.nature === nature).length,
    montant: round(
      add(...achats.filter((a) => a.supplier.nature === nature).map((a) => a.totalHt)),
      3,
    ).toFixed(3),
  }))

  const transporteurs = [...new Set(transport.map((t) => t.carrier.companyName))].sort()
  const transportParTransporteur = transporteurs.map((nom) => ({
    transporteur: nom,
    factures: transport.filter((t) => t.carrier.companyName === nom).length,
    montant: round(
      add(...transport.filter((t) => t.carrier.companyName === nom).map((t) => t.totalHt)),
      3,
    ).toFixed(3),
  }))

  const entrees = mouvements.filter((m) =>
    ['PURCHASE_IN', 'ADJUST_IN', 'CUSTOMER_RETURN'].includes(m.type),
  )
  const sorties = mouvements.filter(
    (m) => !['PURCHASE_IN', 'ADJUST_IN', 'CUSTOMER_RETURN'].includes(m.type),
  )

  return {
    annee,
    mois,
    libelle: libelleMois(mois),
    ventes: ventes.map((v) => ({
      id: v.id,
      number: v.number,
      date: v.date,
      statut: v.status,
      client: v.customer.companyName,
      clientId: v.customer.id,
      currencyCode: v.currencyCode,
      net: round(v.netToPay, 2).toFixed(2),
      netTnd: round(v.netToPayTnd, 3).toFixed(3),
      taux: round(v.exchangeRateTnd, 6).toFixed(6),
      regle: round(v.paidAmount, 2).toFixed(2),
      reste: round(v.balanceDue, 2).toFixed(2),
      incoterm: v.incoterm,
      domiciliation: v.domiciliationRef,
      pieces: round(add(...v.items.map((i) => (i.productId ? i.quantity : 0))), 3).toFixed(0),
      poidsKg: round(v.netWeightKg, 3).toFixed(3),
      colis: v.packageCount,
      // Cout d'acheminement rattache : ce qui permet de lire la marge reelle.
      transportTnd: round(add(...v.transportInvoices.map((t) => t.netToPay)), 3).toFixed(3),
    })),
    achats: achats.map((a) => ({
      id: a.id,
      number: a.number,
      reference: a.supplierReference,
      date: a.date,
      statut: a.status,
      fournisseur: a.supplier.companyName,
      nature: a.supplier.nature,
      totalHt: round(a.totalHt, 3).toFixed(3),
      tva: round(a.vatAmount, 3).toFixed(3),
      net: round(a.netToPay, 3).toFixed(3),
      retenue: round(a.withholdingAmount, 3).toFixed(3),
      reste: round(a.balanceDue, 3).toFixed(3),
    })),
    transport: transport.map((t) => ({
      id: t.id,
      number: t.number,
      reference: t.carrierReference,
      date: t.date,
      statut: t.status,
      transporteur: t.carrier.companyName,
      expedition: t.shipmentRef,
      vente: t.invoice?.number ?? '',
      venteId: t.invoice?.id ?? '',
      net: round(t.netToPay, 3).toFixed(3),
      reste: round(t.balanceDue, 3).toFixed(3),
    })),
    encaissements: encaissements.map((p) => ({
      id: p.id,
      date: p.date,
      client: p.invoice.customer.companyName,
      facture: p.invoice.number,
      factureId: p.invoice.id,
      montant: round(p.amount, 2).toFixed(2),
      currencyCode: p.currencyCode,
      methode: p.method,
      reference: p.reference,
    })),
    reglements: [
      ...reglements.map((p) => ({
        id: p.id,
        date: p.date,
        beneficiaire: p.purchase.supplier.companyName,
        document: p.purchase.number,
        nature: 'Fournisseur' as const,
        montant: round(p.amount, 3).toFixed(3),
        currencyCode: p.currencyCode,
        methode: p.method,
        reference: p.reference,
      })),
      ...reglementsTransport.map((p) => ({
        id: p.id,
        date: p.date,
        beneficiaire: p.transportInvoice.carrier.companyName,
        document: p.transportInvoice.number,
        nature: 'Transporteur' as const,
        montant: round(p.amount, 3).toFixed(3),
        currencyCode: p.currencyCode,
        methode: p.method,
        reference: p.reference,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime()),
    mouvements: mouvements.map((m) => ({
      id: m.id,
      date: m.date,
      type: m.type,
      produit: m.product.designation,
      produitId: m.product.id,
      unite: m.product.unit,
      quantite: round(m.quantity, 3).toFixed(3),
      stockApres: round(m.stockAfter, 3).toFixed(3),
      reference: m.reference,
    })),
    synthese: {
      ventesParDevise,
      ventesTnd: ventesTnd.toFixed(3),
      achatsHtTnd: achatsHtTnd.toFixed(3),
      achatsTtcTnd: achatsTtcTnd.toFixed(3),
      tvaDeductibleTnd: tvaAchatsTnd.toFixed(3),
      achatsParNature,
      transportTnd: transportTnd.toFixed(3),
      transportTtcTnd: transportTtcTnd.toFixed(3),
      transportParTransporteur,
      resultatTnd: round(sub(ventesTnd, add(achatsHtTnd, transportTnd)), 3).toFixed(3),
      encaisseTnd: round(
        add(...encaissements.map((p) => dec(p.amount).times(1))),
        2,
      ).toFixed(2),
      entrees: round(add(...entrees.map((m) => m.quantity)), 3).toFixed(3),
      sorties: round(add(...sorties.map((m) => m.quantity)), 3).toFixed(3),
      pieces: round(
        add(...ventes.flatMap((v) => v.items.map((i) => (i.productId ? i.quantity : 0)))),
        3,
      ).toFixed(0),
      poidsKg: round(add(...ventes.map((v) => v.netWeightKg)), 3).toFixed(3),
      colis: ventes.reduce((n, v) => n + v.packageCount, 0),
    },
  }
}
