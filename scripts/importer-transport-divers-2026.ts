import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildPurchaseData } from '../src/services/purchase.service'
import { add, round } from '../src/lib/money'
import type { PurchaseInput } from '../src/validations/purchase'

/**
 * Import des factures de TRANSPORT et de DIVERS ACHAT 2026.
 *
 * SOURCE : les deux registres du classeur, colonnes O-U (transport, lignes
 * 78-126) et D-M (divers, lignes 116-134). Les donnees ci-dessous sont
 * EXTRAITES du fichier, pas retranscrites a la main.
 *
 * POURQUOI LES TOTAUX DU CLASSEUR NE SONT PAS LA REFERENCE : ses formules de
 * somme n'ont pas suivi l'ajout de lignes.
 *   S76 = SUM(S78:S118)  -> 97 716,875, alors que le registre va jusqu'a L126
 *   I114 = SUM(I116:I131) -> 294 724,458, alors que le registre va jusqu'a L134
 * Le controle porte donc sur les totaux REELS des lignes extraites, et sur la
 * reconstitution des totaux partiels du classeur pour prouver la coherence.
 *
 * DATES : 34 factures de transport n'ont pas de date propre dans le classeur.
 * Elle est alors deduite de l'expedition liee (colonne P : « wida 21 » renvoie
 * a la facture de vente n 21), et la note du document le dit explicitement.
 * Aucune date n'est inventee de toutes pieces.
 *
 * RETENUE A LA SOURCE : portee dans `withholdingAmount`, sans reduire le net a
 * payer. Elle est prelevee au reglement, pas deduite de la charge.
 *
 * USAGE
 *   npx tsx scripts/importer-transport-divers-2026.ts            (simulation)
 *   npx tsx scripts/importer-transport-divers-2026.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

interface LigneTransport {
  ligne: number
  date: string
  ref: string
  numero: string
  transporteur: string
  montant: number
}

interface LigneDivers {
  ligne: number
  date: string
  fournisseur: string
  facture: string
  bonCommande: string
  montant: number
  tva: number
  retenue: number
}

/** Registre transport, colonnes O-U. */
const TRANSPORT: LigneTransport[] = [
  { ligne: 78, date: '2026-01-02', ref: "SEMI 88", numero: 'ES260100022', transporteur: "METM", montant: 1927.356 },
  { ligne: 79, date: '2026-01-10', ref: "wida 01", numero: '626010004', transporteur: "transcargo", montant: 1814.431 },
  { ligne: 80, date: '2026-01-15', ref: "SEMI 02", numero: 'ES260100281', transporteur: "METM", montant: 3630.07 },
  { ligne: 81, date: '2026-01-15', ref: "SEMI 03", numero: 'ES260100282', transporteur: "METM", montant: 1670.41 },
  { ligne: 82, date: '2026-02-12', ref: "SEMI 04", numero: 'ES260200543', transporteur: "METM", montant: 3650.87 },
  { ligne: 83, date: '2026-02-14', ref: "wida 05", numero: '626020015', transporteur: "transcargo", montant: 5904.652 },
  { ligne: 84, date: '2026-02-20', ref: "SEMI 06", numero: 'ES260200973', transporteur: "METM", montant: 3650.87 },
  { ligne: 85, date: '2026-02-28', ref: "wida 07", numero: '626020035', transporteur: "transcargo", montant: 3468.258 },
  { ligne: 86, date: '2026-03-04', ref: "GR 8", numero: '626030001', transporteur: "transcargo", montant: 1500.522 },
  { ligne: 87, date: '2026-03-11', ref: "wida 09", numero: '626030008', transporteur: "transcargo", montant: 2109.184 },
  { ligne: 88, date: '2026-03-16', ref: "semi 10", numero: 'ES260300575', transporteur: "METM", montant: 1064.04 },
  { ligne: 89, date: '2026-03-16', ref: "wida  11", numero: '626030017', transporteur: "transcargo", montant: 2102.575 },
  { ligne: 90, date: '', ref: "wida  12", numero: '626030026', transporteur: "transcargo", montant: 2278.137 },
  { ligne: 91, date: '', ref: "wida  13", numero: '626030034', transporteur: "transcargo", montant: 2940.704 },
  { ligne: 92, date: '2026-03-28', ref: "MALISHOP  14", numero: 'ES260301284', transporteur: "METM", montant: 809.37 },
  { ligne: 93, date: '', ref: "wida  15", numero: '626040003', transporteur: "transcargo", montant: 2432.883 },
  { ligne: 94, date: '', ref: "semi 16", numero: 'ES260400248', transporteur: "METM", montant: 3812.87 },
  { ligne: 95, date: '', ref: "wida  17", numero: '626040010', transporteur: "transcargo", montant: 1995.28 },
  { ligne: 96, date: '', ref: "mALISHOP  18", numero: 'ES260400249', transporteur: "METM", montant: 916.55 },
  { ligne: 97, date: '', ref: "SEMI 19", numero: 'ES260400543', transporteur: "METM", montant: 2126.95 },
  { ligne: 98, date: '2026-04-18', ref: "wida  20", numero: '626040019', transporteur: "transcargo", montant: 2447.5 },
  { ligne: 99, date: '', ref: "wida 21", numero: '626040035', transporteur: "transcargo", montant: 2443.324 },
  { ligne: 100, date: '', ref: "wida 22", numero: '626050003', transporteur: "transcargo", montant: 2313.264 },
  { ligne: 101, date: '', ref: "wida 23", numero: '626050006', transporteur: "transcargo", montant: 1993.582 },
  { ligne: 102, date: '', ref: "wida 24", numero: '626050011', transporteur: "transcargo", montant: 2444.715 },
  { ligne: 103, date: '', ref: "malishop 25", numero: 'ES260500772', transporteur: "METM", montant: 935.213 },
  { ligne: 104, date: '', ref: "wida 26", numero: '626050021', transporteur: "transcargo", montant: 2688.84 },
  { ligne: 105, date: '', ref: "wida 27", numero: '626050031', transporteur: "transcargo", montant: 4597.176 },
  { ligne: 106, date: '', ref: "semi 28", numero: 'ES260501310', transporteur: "METM", montant: 673.93 },
  { ligne: 107, date: '', ref: "wida 29", numero: '626060005', transporteur: "transcargo", montant: 1639.311 },
  { ligne: 108, date: '', ref: "wida 30", numero: '626060008', transporteur: "transcargo", montant: 2435.666 },
  { ligne: 109, date: '', ref: "ATEF  31", numero: '5601004961', transporteur: "DACHSER", montant: 2511.891 },
  { ligne: 110, date: '', ref: "malishop 32", numero: 'ES260600119', transporteur: "METM", montant: 876.79 },
  { ligne: 111, date: '', ref: "WIDA 33", numero: '626060014', transporteur: "transcargo", montant: 4586.581 },
  { ligne: 112, date: '', ref: "MALISHOP 34", numero: '5601004729', transporteur: "DACHSER", montant: 1362.225 },
  { ligne: 113, date: '', ref: "SARA   35", numero: '5601004857', transporteur: "DACHSER", montant: 652.044 },
  { ligne: 114, date: '', ref: "SEMI 36", numero: 'ES260600588', transporteur: "METM", montant: 3728.8 },
  { ligne: 115, date: '', ref: "SEMI 36", numero: 'ES260600589', transporteur: "METM", montant: 54.55 },
  { ligne: 116, date: '', ref: "SEMI 37", numero: 'FVTN2601016418', transporteur: "VECTORYS", montant: 3876.01 },
  { ligne: 117, date: '', ref: "WIDA 39", numero: '626060023', transporteur: "transcargo", montant: 2425.923 },
  { ligne: 118, date: '', ref: "WIDA 40", numero: '626060038', transporteur: "transcargo", montant: 3223.558 },
  { ligne: 119, date: '', ref: "malishop 41", numero: '5601004858', transporteur: "DACHSER", montant: 604.284 },
  { ligne: 120, date: '', ref: "WIDA 42", numero: '626060040', transporteur: "transcargo", montant: 2425.923 },
  { ligne: 121, date: '', ref: "SEMI 43", numero: 'ES260700049', transporteur: "metm", montant: 669.43 },
  { ligne: 122, date: '', ref: "WIDA 44", numero: '62607007', transporteur: "transcargo", montant: 2421.745 },
  { ligne: 123, date: '', ref: "WIDA 45", numero: '626070021', transporteur: "transcargo", montant: 2418.265 },
  { ligne: 124, date: '', ref: "WIDA 46", numero: '626070035', transporteur: "transcargo", montant: 2671.926 },
  { ligne: 126, date: '', ref: "WIDA 48", numero: '62070041', transporteur: "transcargo", montant: 2313.264 },
]

/** Registre divers achat, colonnes D-M. */
const DIVERS: LigneDivers[] = [
  { ligne: 116, date: '2026-01-12', fournisseur: "SPCM", facture: "FA26/005", bonCommande: "BC N66", montant: 37000, tva: 0, retenue: 370 },
  { ligne: 117, date: '2026-01-12', fournisseur: "SAC", facture: "DEVIS", bonCommande: "BC N65", montant: 3000, tva: 0, retenue: 30 },
  { ligne: 118, date: '2026-01-30', fournisseur: "MSC", facture: "fac000283", bonCommande: "BC N67", montant: 14474.13, tva: 0, retenue: 144.7413 },
  { ligne: 119, date: '', fournisseur: "BOUZUITA", facture: "fac 63-69-71-72", bonCommande: "N 60", montant: 102574, tva: 0, retenue: 1025.75 },
  { ligne: 120, date: '2026-02-13', fournisseur: "MSC", facture: "FAC 000495", bonCommande: "BC N67", montant: 13813.352, tva: 0, retenue: 138.13352 },
  { ligne: 121, date: '2026-02-19', fournisseur: "MSC", facture: "FAC 000495", bonCommande: "BC N67", montant: 12146.72, tva: 0, retenue: 121.46719999999999 },
  { ligne: 122, date: '2026-03-14', fournisseur: "SPCM", facture: "FA26/0013", bonCommande: "BC N66", montant: 22660.8, tva: 0, retenue: 226.608 },
  { ligne: 123, date: '2026-04-18', fournisseur: "SPCM", facture: "FA26/0018", bonCommande: "BC A/N71", montant: 27078.08, tva: 0, retenue: 270.7808 },
  { ligne: 124, date: '2026-04-01', fournisseur: "MHK", facture: "FAC N07", bonCommande: "", montant: 4300, tva: 0, retenue: 0 },
  { ligne: 125, date: '2026-04-17', fournisseur: "MHK", facture: "FAC N09", bonCommande: "", montant: 3350, tva: 0, retenue: 0 },
  { ligne: 126, date: '2026-04-24', fournisseur: "MHK", facture: "FAC N10", bonCommande: "", montant: 3000, tva: 0, retenue: 0 },
  { ligne: 127, date: '2026-05-02', fournisseur: "MHK", facture: "FAC N12", bonCommande: "", montant: 2100, tva: 0, retenue: 0 },
  { ligne: 128, date: '2026-05-07', fournisseur: "JFK", facture: "FAC N0097", bonCommande: "BC N74", montant: 5450, tva: 0, retenue: 54.5 },
  { ligne: 129, date: '2026-05-25', fournisseur: "JFK", facture: "FAC N00105", bonCommande: "BC N74", montant: 1800, tva: 0, retenue: 18 },
  { ligne: 130, date: '2026-06-15', fournisseur: "SPCM", facture: "FA26/0028", bonCommande: "BC A/N71", montant: 29323.68, tva: 0, retenue: 293.2368 },
  { ligne: 131, date: '2026-06-15', fournisseur: "MSC", facture: "CME26MDJ5300", bonCommande: "BC N67", montant: 12653.696, tva: 0, retenue: 126.53696000000001 },
  { ligne: 132, date: '2026-06-26', fournisseur: "JFK", facture: "FAC 110", bonCommande: "BC N74", montant: 6350, tva: 0, retenue: 63.5 },
  { ligne: 133, date: '2026-06-27', fournisseur: "MHK", facture: "FAC 18", bonCommande: "", montant: 1350, tva: 0, retenue: 0 },
  { ligne: 134, date: '2026-07-22', fournisseur: "MSC", facture: "FAC 2442", bonCommande: "BC N67", montant: 12238.06, tva: 0, retenue: 122.3806 },
]

/** Totaux partiels du classeur, reconstitues pour prouver la coherence. */
const TOTAUX_PARTIELS = {
  transportJusquL118: 97716.875,
  diversJusquL131: 294724.458,
}

/**
 * Transporteurs, avec la casse du classeur normalisee : « metm » et « METM »
 * designent le meme prestataire.
 */
const TRANSPORTEURS: Record<string, { code: string; nom: string }> = {
  TRANSCARGO: { code: 'TRANSCARGO', nom: 'TRANSCARGO' },
  METM: { code: 'METM', nom: 'METM' },
  DACHSER: { code: 'DACHSER', nom: 'DACHSER' },
  VECTORYS: { code: 'VECTORYS', nom: 'VECTORYS' },
}

const FOURNISSEURS_DIVERS: Record<string, string> = {
  SPCM: 'SPCM',
  SAC: 'SAC',
  MSC: 'MSC',
  BOUZUITA: 'BOUZUITA',
  MHK: 'MHK',
  JFK: 'JFK',
}

function controler() {
  const totalTransport = round(add(...TRANSPORT.map((l) => l.montant)), 3)
  const totalDivers = round(add(...DIVERS.map((l) => l.montant)), 3)
  const totalRetenue = round(add(...DIVERS.map((l) => l.retenue)), 3)

  // Reconstitution des sommes partielles du classeur : si elles retombent
  // juste, l'extraction est fidele et l'ecart vient bien de ses formules.
  const partielTransport = round(
    add(...TRANSPORT.filter((l) => l.ligne <= 118).map((l) => l.montant)),
    3,
  )
  const partielDivers = round(add(...DIVERS.filter((l) => l.ligne <= 131).map((l) => l.montant)), 3)

  console.log('Controle : reconstitution des sommes partielles du classeur')
  const controles: Array<[string, number, number]> = [
    ['transport L78-L118', Number(partielTransport.toFixed(3)), TOTAUX_PARTIELS.transportJusquL118],
    ['divers L116-L131', Number(partielDivers.toFixed(3)), TOTAUX_PARTIELS.diversJusquL131],
  ]
  let fidele = true
  for (const [libelle, calcule, attendu] of controles) {
    const ok = Math.abs(calcule - attendu) < 0.01
    if (!ok) fidele = false
    console.log(
      `  ${ok ? 'OK   ' : 'ECART'} ${libelle.padEnd(20)} ${calcule.toFixed(3).padStart(13)} / ${attendu.toFixed(3).padStart(13)}`,
    )
  }
  if (!fidele) throw new Error('La reconstitution echoue : extraction non fiable. Import interrompu.')

  console.log('\nTotaux REELS a importer :')
  console.log(`  transport : ${totalTransport.toFixed(3)} TND  (${TRANSPORT.length} factures)`)
  console.log(`  divers    : ${totalDivers.toFixed(3)} TND  (${DIVERS.length} factures)`)
  console.log(`  retenue a la source : ${totalRetenue.toFixed(3)} TND`)
  console.log(
    `\n  hors sommes du classeur : transport +${(Number(totalTransport.toFixed(3)) - TOTAUX_PARTIELS.transportJusquL118).toFixed(3)}` +
      ` / divers +${(Number(totalDivers.toFixed(3)) - TOTAUX_PARTIELS.diversJusquL131).toFixed(3)}\n`,
  )
}

/** Numero de la facture de vente evoquee par la reference d'expedition. */
function numeroExpedition(ref: string): number | null {
  const m = ref.match(/(\d+)\s*$/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 52 ? n : null
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL / DIRECT_URL manquant')
  console.log(`Base cible : ${url.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  controler()

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })

  try {
    // Dates des expeditions, pour dater les factures de transport qui n'ont
    // pas de date propre dans le classeur.
    const ventes = await prisma.invoice.findMany({
      where: { number: { startsWith: 'FAC ' } },
      select: { number: true, date: true },
    })
    const dateExpedition = new Map<number, string>()
    for (const v of ventes) {
      const m = v.number.match(/^FAC (\d+)-2026$/)
      if (m) dateExpedition.set(Number(m[1]), v.date.toISOString().slice(0, 10))
    }

    const fournisseursConnus = new Map<string, string>()

    /** Cree le fournisseur s'il manque, et renvoie son identifiant. */
    async function fournisseur(code: string, nom: string, nature: 'TRANSPORT' | 'DIVERS') {
      const deja = fournisseursConnus.get(code)
      if (deja) return deja

      const existant = await prisma.supplier.findUnique({ where: { code }, select: { id: true } })
      if (existant) {
        fournisseursConnus.set(code, existant.id)
        return existant.id
      }
      if (!ECRIRE) {
        console.log(`  fournisseur A CREER : ${nom} (${code}, ${nature})`)
        fournisseursConnus.set(code, `(simule:${code})`)
        return `(simule:${code})`
      }
      const cree = await prisma.supplier.create({
        data: {
          code,
          companyName: nom,
          currencyCode: 'TND',
          nature,
          notes:
            "Cree par l'import du classeur 2026. Completez le matricule fiscal, " +
            "l'adresse et les coordonnees depuis une facture d'origine.",
        },
        select: { id: true },
      })
      console.log(`  fournisseur cree : ${nom} (${code}, ${nature})`)
      fournisseursConnus.set(code, cree.id)
      return cree.id
    }

    let creees = 0
    let ignorees = 0
    let sautees = 0
    let datesDeduites = 0

    // ---------------- Transport ----------------
    console.log('Transport :')
    for (const l of TRANSPORT) {
      const t = TRANSPORTEURS[l.transporteur.toUpperCase()]
      if (!t) {
        console.log(`  SAUTEE  L${l.ligne} : transporteur « ${l.transporteur} » inconnu`)
        sautees += 1
        continue
      }

      const numero = `TRP-2026-${l.numero}`
      const deja = await prisma.purchase.findFirst({
        where: { OR: [{ number: numero }, { supplierReference: l.numero }] },
        select: { number: true },
      })
      if (deja) {
        ignorees += 1
        continue
      }

      // Date propre, sinon celle de l'expedition liee.
      let date = l.date
      let origineDate = 'du classeur'
      if (!date) {
        const n = numeroExpedition(l.ref)
        const derivee = n === null ? undefined : dateExpedition.get(n)
        if (!derivee) {
          console.log(
            `  SAUTEE  ${l.numero} (L${l.ligne}) : aucune date, expedition « ${l.ref} » non resolue`,
          )
          sautees += 1
          continue
        }
        date = derivee
        origineDate = `deduite de l'expedition « ${l.ref} » (facture de vente n ${n})`
        datesDeduites += 1
      }

      const fournisseurId = await fournisseur(t.code, t.nom, 'TRANSPORT')

      const input: PurchaseInput = {
        supplierId: fournisseurId,
        supplierReference: l.numero,
        date,
        dueDate: '',
        currencyCode: 'TND',
        paymentTerms: '',
        shippingLabel: 'Transport',
        shippingAmount: '0',
        otherFeesLabel: 'Autres frais',
        otherFeesAmount: '0',
        // Le registre ne porte qu'un montant : aucun detail de TVA a declarer.
        vatMode: 'NONE',
        vatRate: '0',
        stampDutyLabel: 'Timbre fiscal',
        stampDutyAmount: '0',
        notes:
          `Importe du registre transport du classeur 2026 (ligne ${l.ligne}). ` +
          `Expedition : ${l.ref}. Date ${origineDate}. ` +
          `Montant du registre : ${l.montant.toFixed(3)} TND. ` +
          'Detail de TVA non disponible dans le classeur.',
        items: [
          {
            productId: '',
            reference: '',
            designation: 'Transport et transit',
            description: `Expédition ${l.ref}`,
            unit: '',
            quantity: '1',
            unitPrice: l.montant.toFixed(3),
            discountPercent: '0',
          },
        ],
      }

      const { scalars, items, totals } = buildPurchaseData(input)
      if (Math.abs(Number(totals.netToPay.toFixed(3)) - l.montant) > 0.001) {
        throw new Error(`${l.numero} : net ${totals.netToPay.toFixed(3)} != registre ${l.montant}`)
      }

      if (ECRIRE) {
        await prisma.purchase.create({
          data: {
            ...scalars,
            number: numero,
            status: 'DRAFT',
            paidAmount: '0.000',
            items: { create: items },
          },
        })
      }
      creees += 1
    }
    console.log(`  ${creees} a creer, ${ignorees} deja presentes, ${sautees} sautees`)

    // ---------------- Divers ----------------
    console.log('\nDivers achat :')
    const avantDivers = creees
    // Le registre est tenu dans l'ordre chronologique : une ligne sans date est
    // rattachee a la derniere date lue, ce qui la place dans le bon mois sans
    // inventer un jour precis. La note du document le dit, et le champ reste a
    // corriger depuis la facture d'origine.
    let derniereDate = ''
    for (const l of DIVERS) {
      const code = FOURNISSEURS_DIVERS[l.fournisseur.toUpperCase()]
      if (!code) {
        console.log(`  SAUTEE  L${l.ligne} : fournisseur « ${l.fournisseur} » inconnu`)
        sautees += 1
        continue
      }
      let date = l.date
      let dateApprochee = false
      if (date) {
        derniereDate = date
      } else if (derniereDate) {
        date = derniereDate
        dateApprochee = true
        datesDeduites += 1
      } else {
        console.log(`  SAUTEE  ${l.facture} (L${l.ligne}) : aucune date exploitable`)
        sautees += 1
        continue
      }

      // Le registre n'a pas de numerotation propre : la ligne du classeur sert
      // de cle stable, et la reference fournisseur reste le numero de facture.
      const numero = `DIV-2026-${l.ligne}`
      const deja = await prisma.purchase.findUnique({ where: { number: numero }, select: { id: true } })
      if (deja) {
        ignorees += 1
        continue
      }

      const fournisseurId = await fournisseur(code, code, 'DIVERS')

      const input: PurchaseInput = {
        supplierId: fournisseurId,
        supplierReference: l.facture,
        date,
        dueDate: '',
        currencyCode: 'TND',
        paymentTerms: '',
        shippingLabel: 'Transport',
        shippingAmount: '0',
        otherFeesLabel: 'Autres frais',
        otherFeesAmount: '0',
        // La colonne TVA du registre est a zero sur toutes les lignes.
        vatMode: l.tva > 0 ? 'RATE' : 'NONE',
        vatRate: l.tva > 0 ? round((l.tva / l.montant) * 100, 3).toString() : '0',
        stampDutyLabel: 'Timbre fiscal',
        stampDutyAmount: '0',
        notes:
          `Importe du registre « divers achat » du classeur 2026 (ligne ${l.ligne}). ` +
          (l.bonCommande ? `Bon de commande : ${l.bonCommande}. ` : '') +
          `Montant du registre : ${l.montant.toFixed(3)} TND` +
          (l.retenue > 0 ? `, retenue a la source ${l.retenue.toFixed(3)} TND` : ', sans retenue') +
          '.' +
          (dateApprochee
            ? ` DATE A CORRIGER : le classeur ne date pas cette ligne. La date ${date} ` +
              'est celle de la ligne precedente du registre, reprise pour situer la ' +
              "facture dans le bon mois. Corrigez-la depuis la facture d'origine."
            : ''),
        items: [
          {
            productId: '',
            reference: '',
            designation: 'Achat divers',
            description: l.bonCommande ? `Bon de commande ${l.bonCommande}` : '',
            unit: '',
            quantity: '1',
            unitPrice: l.montant.toFixed(3),
            discountPercent: '0',
          },
        ],
      }

      const { scalars, items, totals } = buildPurchaseData(input)
      if (Math.abs(Number(totals.netToPay.toFixed(3)) - l.montant) > 0.01) {
        throw new Error(`${l.facture} : net ${totals.netToPay.toFixed(3)} != registre ${l.montant}`)
      }

      if (ECRIRE) {
        await prisma.purchase.create({
          data: {
            ...scalars,
            number: numero,
            status: 'DRAFT',
            paidAmount: '0.000',
            // La retenue ne reduit PAS le net a payer : elle est prelevee au
            // reglement, le fournisseur percoit net - retenue.
            withholdingAmount: l.retenue.toFixed(3),
            items: { create: items },
          },
        })
      }
      creees += 1
    }
    console.log(`  ${creees - avantDivers} a creer`)

    console.log(
      `\n${ECRIRE ? 'Creees' : 'A creer'} : ${creees}   deja presentes : ${ignorees}   sautees : ${sautees}`,
    )
    if (datesDeduites > 0) {
      console.log(
        `${datesDeduites} date(s) deduites de l'expedition liee, signalees dans les notes du document.`,
      )
    }
    if (!ECRIRE) console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
