import 'server-only'
import { prisma } from '@/lib/prisma'
import { add, dec, gt, round, sub } from '@/lib/money'

/**
 * Etats de consultation.
 *
 * Ces tableaux remplacent la consultation du suivi Excel : une ligne par
 * document, les colonnes reellement utilisees, et une ligne de totaux.
 *
 * DEUX REGLES, heritees du reste du projet :
 *
 *  1. Aucune addition entre devises. Les colonnes en euros et en dinars sont
 *     distinctes, et la contrevaleur passe TOUJOURS par le taux figé sur le
 *     document (`exchangeRateTnd`), jamais par un taux du jour.
 *  2. Aucun calcul avec un `number` JavaScript. Les agregats restent en
 *     `Decimal` jusqu'a la mise en forme.
 *
 * Les valeurs exposees sont des CHAINES deja arrondies : le composant affiche,
 * il ne calcule pas.
 */

export interface EtatPeriode {
  from?: string
  to?: string
}

function bornes(periode: EtatPeriode) {
  return {
    ...(periode.from ? { gte: new Date(`${periode.from}T00:00:00.000Z`) } : {}),
    ...(periode.to ? { lte: new Date(`${periode.to}T00:00:00.000Z`) } : {}),
  }
}

// ---------------------------------------------------------------------------
// Etat des ventes
// ---------------------------------------------------------------------------

export interface LigneVente {
  id: string
  numero: string
  date: Date
  client: string
  domiciliation: string
  /** Quantite totale des lignes, en pieces. */
  quantite: string
  colis: number
  poidsNet: string
  devise: string
  /** Net a payer, dans la devise du document. */
  montant: string
  taux: string
  /** Contrevaleur en dinars, au taux figé du document. */
  montantDt: string
  encaisse: string
  reste: string
  statut: string
}

export interface TotauxVentes {
  factures: number
  quantite: string
  colis: number
  poidsNet: string
  /** Par devise : additionner des euros et des dinars n'aurait aucun sens. */
  parDevise: Array<{ devise: string; montant: string; encaisse: string; reste: string }>
  /** Le seul total consolidable : la contrevaleur en dinars. */
  montantDt: string
}

export async function getEtatVentes(periode: EtatPeriode) {
  const factures = await prisma.invoice.findMany({
    where: { status: { notIn: ['CANCELLED'] }, date: bornes(periode) },
    orderBy: [{ date: 'asc' }, { number: 'asc' }],
    select: {
      id: true,
      number: true,
      date: true,
      domiciliationRef: true,
      packageCount: true,
      netWeightKg: true,
      currencyCode: true,
      netToPay: true,
      exchangeRateTnd: true,
      netToPayTnd: true,
      paidAmount: true,
      balanceDue: true,
      status: true,
      customer: { select: { companyName: true } },
      items: { select: { quantity: true } },
    },
  })

  const lignes: LigneVente[] = factures.map((f) => ({
    id: f.id,
    numero: f.number,
    date: f.date,
    client: f.customer.companyName,
    domiciliation: f.domiciliationRef,
    quantite: round(add(...f.items.map((i) => i.quantity)), 3).toFixed(3),
    colis: f.packageCount,
    poidsNet: round(f.netWeightKg, 3).toFixed(3),
    devise: f.currencyCode,
    montant: round(f.netToPay, 2).toFixed(2),
    taux: round(f.exchangeRateTnd, 4).toFixed(4),
    montantDt: round(f.netToPayTnd, 3).toFixed(3),
    encaisse: round(f.paidAmount, 2).toFixed(2),
    reste: round(f.balanceDue, 2).toFixed(2),
    statut: f.status,
  }))

  const devises = [...new Set(factures.map((f) => f.currencyCode))].sort()

  const totaux: TotauxVentes = {
    factures: factures.length,
    quantite: round(add(...factures.flatMap((f) => f.items.map((i) => i.quantity))), 3).toFixed(3),
    colis: factures.reduce((a, f) => a + f.packageCount, 0),
    poidsNet: round(add(...factures.map((f) => f.netWeightKg)), 3).toFixed(3),
    parDevise: devises.map((devise) => {
      const dedans = factures.filter((f) => f.currencyCode === devise)
      return {
        devise,
        montant: round(add(...dedans.map((f) => f.netToPay)), 2).toFixed(2),
        encaisse: round(add(...dedans.map((f) => f.paidAmount)), 2).toFixed(2),
        reste: round(add(...dedans.map((f) => f.balanceDue)), 2).toFixed(2),
      }
    }),
    montantDt: round(add(...factures.map((f) => f.netToPayTnd)), 3).toFixed(3),
  }

  return { lignes, totaux }
}

// ---------------------------------------------------------------------------
// Etat des achats
// ---------------------------------------------------------------------------

export interface LigneAchat {
  id: string
  numero: string
  referenceFournisseur: string
  date: Date
  fournisseur: string
  nature: string
  quantite: string
  totalHt: string
  tauxTva: string
  tva: string
  netAPayer: string
  regle: string
  reste: string
  statut: string
}

export async function getEtatAchats(periode: EtatPeriode) {
  const achats = await prisma.purchase.findMany({
    where: { status: { notIn: ['CANCELLED'] }, date: bornes(periode) },
    orderBy: [{ date: 'asc' }, { number: 'asc' }],
    select: {
      id: true,
      number: true,
      supplierReference: true,
      date: true,
      totalHt: true,
      vatRate: true,
      vatAmount: true,
      netToPay: true,
      paidAmount: true,
      balanceDue: true,
      status: true,
      supplier: { select: { companyName: true, nature: true } },
      items: { select: { quantity: true } },
    },
  })

  const NATURES: Record<string, string> = {
    FOUTA: 'Marchandise',
    TRANSPORT: 'Transport',
    DIVERS: 'Divers',
  }

  const lignes: LigneAchat[] = achats.map((a) => ({
    id: a.id,
    numero: a.number,
    referenceFournisseur: a.supplierReference,
    date: a.date,
    fournisseur: a.supplier.companyName,
    nature: NATURES[a.supplier.nature] ?? a.supplier.nature,
    quantite: round(add(...a.items.map((i) => i.quantity)), 3).toFixed(3),
    totalHt: round(a.totalHt, 3).toFixed(3),
    tauxTva: round(a.vatRate, 2).toFixed(2),
    tva: round(a.vatAmount, 3).toFixed(3),
    netAPayer: round(a.netToPay, 3).toFixed(3),
    regle: round(a.paidAmount, 3).toFixed(3),
    reste: round(a.balanceDue, 3).toFixed(3),
    statut: a.status,
  }))

  // Les achats sont tous en dinars : le total est donc consolidable.
  const totaux = {
    factures: achats.length,
    quantite: round(add(...achats.flatMap((a) => a.items.map((i) => i.quantity))), 3).toFixed(3),
    totalHt: round(add(...achats.map((a) => a.totalHt)), 3).toFixed(3),
    tva: round(add(...achats.map((a) => a.vatAmount)), 3).toFixed(3),
    netAPayer: round(add(...achats.map((a) => a.netToPay)), 3).toFixed(3),
    regle: round(add(...achats.map((a) => a.paidAmount)), 3).toFixed(3),
    reste: round(add(...achats.map((a) => a.balanceDue)), 3).toFixed(3),
    parNature: [...new Set(achats.map((a) => a.supplier.nature))].sort().map((nature) => ({
      nature: NATURES[nature] ?? nature,
      montant: round(
        add(...achats.filter((a) => a.supplier.nature === nature).map((a) => a.netToPay)),
        3,
      ).toFixed(3),
    })),
  }

  return { lignes, totaux }
}

// ---------------------------------------------------------------------------
// Etat du transport
// ---------------------------------------------------------------------------

export interface LigneTransport {
  id: string
  numero: string
  referenceTransporteur: string
  date: Date
  transporteur: string
  expedition: string
  vente: string
  client: string
  totalHt: string
  tva: string
  netAPayer: string
  regle: string
  reste: string
  statut: string
}

/**
 * Etat du transport, module a part des achats.
 *
 * `parTransporteur` et `rattachees` sont la pour repondre aux deux questions
 * qu'on se pose devant ce tableau : combien chaque transporteur a facture, et
 * combien de factures ne sont pas encore raccrochees a une expedition — donc
 * combien de couts ne sont pas encore imputes a une vente.
 */
export async function getEtatTransport(periode: EtatPeriode) {
  const factures = await prisma.transportInvoice.findMany({
    where: { status: { notIn: ['CANCELLED'] }, date: bornes(periode) },
    orderBy: [{ date: 'asc' }, { number: 'asc' }],
    select: {
      id: true,
      number: true,
      carrierReference: true,
      date: true,
      shipmentRef: true,
      totalHt: true,
      vatAmount: true,
      netToPay: true,
      paidAmount: true,
      balanceDue: true,
      status: true,
      carrier: { select: { companyName: true } },
      invoice: { select: { number: true, customer: { select: { companyName: true } } } },
    },
  })

  const lignes: LigneTransport[] = factures.map((f) => ({
    id: f.id,
    numero: f.number,
    referenceTransporteur: f.carrierReference,
    date: f.date,
    transporteur: f.carrier.companyName,
    expedition: f.shipmentRef,
    vente: f.invoice?.number ?? '',
    client: f.invoice?.customer.companyName ?? '',
    totalHt: round(f.totalHt, 3).toFixed(3),
    tva: round(f.vatAmount, 3).toFixed(3),
    netAPayer: round(f.netToPay, 3).toFixed(3),
    regle: round(f.paidAmount, 3).toFixed(3),
    reste: round(f.balanceDue, 3).toFixed(3),
    statut: f.status,
  }))

  const transporteurs = [...new Set(factures.map((f) => f.carrier.companyName))].sort()

  // Le transport est facture en dinars : le total est consolidable.
  const totaux = {
    factures: factures.length,
    totalHt: round(add(...factures.map((f) => f.totalHt)), 3).toFixed(3),
    tva: round(add(...factures.map((f) => f.vatAmount)), 3).toFixed(3),
    netAPayer: round(add(...factures.map((f) => f.netToPay)), 3).toFixed(3),
    regle: round(add(...factures.map((f) => f.paidAmount)), 3).toFixed(3),
    reste: round(add(...factures.map((f) => f.balanceDue)), 3).toFixed(3),
    rattachees: factures.filter((f) => f.invoice !== null).length,
    parTransporteur: transporteurs.map((nom) => ({
      transporteur: nom,
      factures: factures.filter((f) => f.carrier.companyName === nom).length,
      montant: round(
        add(...factures.filter((f) => f.carrier.companyName === nom).map((f) => f.netToPay)),
        3,
      ).toFixed(3),
    })),
  }

  return { lignes, totaux }
}

// ---------------------------------------------------------------------------
// Reconciliation achats / ventes
// ---------------------------------------------------------------------------

/**
 * Rapproche ce qui a ete achete de ce qui a ete vendu, en pieces et en
 * kilogrammes. C'est le controle fait a la main dans le suivi Excel.
 *
 * Cote achat, le poids est DEDUIT (quantite x poids unitaire du produit) ;
 * cote vente, il est saisi sur l'en-tete de la facture. L'asymetrie est
 * assumee : ce sont les deux seules sources disponibles.
 */
export async function getReconciliation(periode: EtatPeriode) {
  const [achats, ventes] = await Promise.all([
    prisma.$queryRaw<Array<{ pieces: string; kg: string }>>`
      SELECT COALESCE(SUM(pi."quantity"), 0)::text AS pieces,
             COALESCE(SUM(pi."quantity" * pr."unitWeightKg"), 0)::text AS kg
      FROM "purchase_items" pi
      JOIN "purchases" p ON p."id" = pi."purchaseId"
      JOIN "products" pr ON pr."id" = pi."productId"
      WHERE p."status" NOT IN ('CANCELLED')
        AND (${periode.from ?? null}::date IS NULL OR p."date" >= ${periode.from ?? null}::date)
        AND (${periode.to ?? null}::date IS NULL OR p."date" <= ${periode.to ?? null}::date)
    `,
    prisma.$queryRaw<Array<{ pieces: string; kg: string }>>`
      SELECT COALESCE(SUM(ii."quantity"), 0)::text AS pieces,
             COALESCE(SUM(i."netWeightKg"), 0)::text AS kg
      FROM "invoices" i
      LEFT JOIN "invoice_items" ii ON ii."invoiceId" = i."id"
      WHERE i."status" NOT IN ('CANCELLED')
        AND (${periode.from ?? null}::date IS NULL OR i."date" >= ${periode.from ?? null}::date)
        AND (${periode.to ?? null}::date IS NULL OR i."date" <= ${periode.to ?? null}::date)
    `,
  ])

  const piecesAchat = dec(achats[0]?.pieces ?? 0)
  const piecesVente = dec(ventes[0]?.pieces ?? 0)
  const kgAchat = dec(achats[0]?.kg ?? 0)
  const kgVente = dec(ventes[0]?.kg ?? 0)

  return [
    {
      grandeur: 'Pièces',
      achete: round(piecesAchat, 0).toFixed(0),
      vendu: round(piecesVente, 0).toFixed(0),
      ecart: round(sub(piecesAchat, piecesVente), 0).toFixed(0),
    },
    {
      grandeur: 'Kilogrammes',
      achete: round(kgAchat, 3).toFixed(3),
      vendu: round(kgVente, 3).toFixed(3),
      ecart: round(sub(kgAchat, kgVente), 3).toFixed(3),
    },
  ]
}

// ---------------------------------------------------------------------------
// Encours clients par anciennete
// ---------------------------------------------------------------------------

export interface EncoursClient {
  client: string
  devise: string
  factures: number
  total: string
  /** Non echu : la date d'echeance n'est pas depassee, ou elle est absente. */
  nonEchu: string
  jours1a30: string
  jours31a60: string
  jours61a90: string
  plus90: string
}

export async function getEncoursClients() {
  const factures = await prisma.invoice.findMany({
    where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, balanceDue: { gt: 0 } },
    select: {
      dueDate: true,
      balanceDue: true,
      currencyCode: true,
      customer: { select: { companyName: true } },
    },
  })

  const aujourdhui = new Date()
  const minuit = Date.UTC(
    aujourdhui.getUTCFullYear(),
    aujourdhui.getUTCMonth(),
    aujourdhui.getUTCDate(),
  )

  const parClient = new Map<string, EncoursClient & { _t: ReturnType<typeof dec> }>()

  for (const f of factures) {
    const cle = `${f.customer.companyName}|${f.currencyCode}`
    if (!parClient.has(cle)) {
      parClient.set(cle, {
        client: f.customer.companyName,
        devise: f.currencyCode,
        factures: 0,
        total: '0',
        nonEchu: '0',
        jours1a30: '0',
        jours31a60: '0',
        jours61a90: '0',
        plus90: '0',
        _t: dec(0),
      })
    }
    const e = parClient.get(cle)!
    e.factures += 1

    const solde = round(f.balanceDue, 2)
    e._t = e._t.plus(solde)

    // Sans date d'echeance, la facture est comptee non echue : la supposer en
    // retard serait une invention.
    const retard = f.dueDate ? Math.floor((minuit - f.dueDate.getTime()) / 86_400_000) : -1

    const tranche: keyof EncoursClient =
      retard <= 0 ? 'nonEchu' : retard <= 30 ? 'jours1a30' : retard <= 60 ? 'jours31a60' : retard <= 90 ? 'jours61a90' : 'plus90'

    e[tranche] = round(dec(e[tranche] as string).plus(solde), 2).toFixed(2)
  }

  return [...parClient.values()]
    .map(({ _t, ...e }) => ({ ...e, total: round(_t, 2).toFixed(2) }))
    .sort((a, b) => (gt(b.total, a.total) ? 1 : -1))
}
