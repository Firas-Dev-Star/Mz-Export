import 'dotenv/config'
import ExcelJS from 'exceljs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildInvoiceData } from '../src/services/invoice.service'
import { dec, round } from '../src/lib/money'
import type { InvoiceInput } from '../src/validations/invoice'

/**
 * Import des factures de vente 2026 depuis le suivi Excel.
 *
 * PRINCIPES
 *
 *  1. Rien n'est invente. Chaque champ ecrit provient d'une colonne du
 *     classeur, ou est calcule par le moteur de l'application.
 *  2. Les totaux extraits sont CONTROLES contre la ligne de totaux du classeur
 *     avant toute ecriture. Un ecart interrompt l'import.
 *  3. Les montants passent par `buildInvoiceData`, le meme code que le
 *     formulaire de saisie : totaux, contrevaleur en dinars, montant en
 *     lettres. Aucun calcul n'est reimplemente ici.
 *  4. Idempotent : une facture dont le numero existe deja est ignoree.
 *  5. Les factures sont creees en BROUILLON. Aucun mouvement de stock n'est
 *     genere, donc rien ne peut etre fausse. La validation reste a faire
 *     document par document, quand les achats auront ete saisis.
 *
 * USAGE
 *   npx tsx scripts/importer-ventes-2026.ts                 (simulation)
 *   npx tsx scripts/importer-ventes-2026.ts --ecrire        (ecriture)
 */

const FICHIER = 'C:/Users/MZEXP/OneDrive/Desktop/mz export/Classeur1 MZ EXPORT.xlsx'
const FEUILLE = 'MZ 2026'
const PREMIERE_LIGNE = 4
const DERNIERE_LIGNE = 57
const LIGNE_TOTAUX = 59

const ECRIRE = process.argv.includes('--ecrire')

/** Produit utilise pour les lignes dont la quantite est connue. */
const REFERENCE_PRODUIT = 'FOUTA-COTON'

/**
 * Lignes sans quantite dans le classeur : 13 factures chez SEMI FERMETURE,
 * un client regulier. Le suivi ne porte que le MONTANT, le colisage, la
 * domiciliation et le virement — ni quantite, ni prix unitaire, ni designation.
 *
 * On importe donc avec ce qui EXISTE : une ligne unique au montant total,
 * quantite 1. Aucune quantite n'est inventee, et la ligne n'est rattachee a
 * aucun produit — elle ne touche donc pas le stock, ce qui serait faux.
 *
 * La description signale explicitement ce qui reste a completer depuis la
 * facture d'origine.
 *
 * Mettre a `null` pour ignorer ces factures au lieu de les importer.
 */
const DESIGNATION_SANS_QUANTITE: string | null = 'Marchandise'
const DESCRIPTION_SANS_QUANTITE =
  'Quantité et désignation non suivies dans le classeur Excel — à compléter depuis la facture d’origine.'

// ---------------------------------------------------------------------------
// Lecture du classeur
// ---------------------------------------------------------------------------

interface LigneVente {
  ligne: number
  no: number
  client: string
  date: string
  qte: number | null
  colis: number | null
  poidsBrut: number | null
  poidsNet: number | null
  venteDt: number | null
  venteEur: number
  domiciliation: string
  vireEur: number | null
}

function nombre(cell: ExcelJS.Cell): number | null {
  const v = cell?.value as unknown
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v === 'object' && v !== null && 'result' in v) {
    const r = (v as { result?: unknown }).result
    return typeof r === 'number' ? r : null
  }
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

function texte(cell: ExcelJS.Cell): string {
  const v = cell?.value as unknown
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && v !== null) {
    const o = v as { richText?: Array<{ text: string }>; text?: string; result?: unknown }
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if (o.text !== undefined) return String(o.text)
    if (o.result !== undefined) return String(o.result)
    return ''
  }
  return String(v).trim()
}

function dateIso(cell: ExcelJS.Cell): string | null {
  const v = cell?.value as unknown
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object' && v !== null && (v as { result?: unknown }).result instanceof Date) {
    return ((v as { result: Date }).result).toISOString().slice(0, 10)
  }
  return null
}

async function lireClasseur() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(FICHIER)
  const ws = wb.getWorksheet(FEUILLE)
  if (!ws) throw new Error(`Feuille « ${FEUILLE} » introuvable.`)

  const lignes: LigneVente[] = []
  for (let r = PREMIERE_LIGNE; r <= DERNIERE_LIGNE; r++) {
    const row = ws.getRow(r)
    const no = nombre(row.getCell('I'))
    const client = texte(row.getCell('J'))
    const venteEur = nombre(row.getCell('P'))
    const date = dateIso(row.getCell('N'))
    if (no === null || !client || venteEur === null || !date) continue

    lignes.push({
      ligne: r,
      no,
      client,
      date,
      qte: nombre(row.getCell('K')),
      colis: nombre(row.getCell('D')),
      poidsBrut: nombre(row.getCell('E')),
      poidsNet: nombre(row.getCell('F')),
      venteDt: nombre(row.getCell('O')),
      venteEur,
      domiciliation: texte(row.getCell('Q')),
      vireEur: nombre(row.getCell('R')),
    })
  }

  // --- Controle de fidelite : sans lui, on n'ecrit rien ---
  const t = ws.getRow(LIGNE_TOTAUX)
  const controles: Array<[string, keyof LigneVente, number | null]> = [
    ['quantite', 'qte', nombre(t.getCell('K'))],
    ['vente EUR', 'venteEur', nombre(t.getCell('P'))],
    ['vente DT', 'venteDt', nombre(t.getCell('O'))],
    ['virements', 'vireEur', nombre(t.getCell('R'))],
    ['colis', 'colis', nombre(t.getCell('D'))],
    ['poids net', 'poidsNet', nombre(t.getCell('F'))],
  ]

  console.log(`${lignes.length} factures lues (lignes ${PREMIERE_LIGNE} a ${DERNIERE_LIGNE})\n`)
  console.log('Controle contre la ligne de totaux du classeur :')
  let fidele = true
  for (const [libelle, cle, attendu] of controles) {
    const calcule = lignes.reduce((a, l) => a + ((l[cle] as number | null) ?? 0), 0)
    const ecart = Math.abs(calcule - (attendu ?? 0))
    const ok = ecart < 1
    if (!ok) fidele = false
    console.log(
      `  ${ok ? 'OK   ' : 'ECART'} ${libelle.padEnd(11)} ${calcule.toFixed(2).padStart(14)} / ${(attendu ?? 0).toFixed(2).padStart(14)}`,
    )
  }
  if (!fidele) throw new Error('Les totaux extraits ne correspondent pas au classeur. Import interrompu.')
  console.log('  => extraction fidele\n')

  return lignes
}

// ---------------------------------------------------------------------------
// Correspondances
// ---------------------------------------------------------------------------

/** Code client : lettres et chiffres du libelle, en majuscules, borne a 24. */
function codeClient(libelle: string): string {
  return libelle.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 24)
}

/** Raison sociale : le libelle du classeur, casse normalisee. */
function raisonSociale(libelle: string): string {
  return libelle.trim().replace(/\s+/g, ' ').toUpperCase()
}

function numeroFacture(no: number): string {
  return `FAC ${String(no).padStart(2, '0')}-2026`
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  const cible = connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'
  console.log(`Base cible : ${cible}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire pour ecrire)'}\n`)

  const lignes = await lireClasseur()

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const produit = await prisma.product.findUnique({
      where: { reference: REFERENCE_PRODUIT },
      select: { id: true, designation: true, unit: true, ngp: true, originCountry: true },
    })
    if (!produit) {
      throw new Error(
        `Produit « ${REFERENCE_PRODUIT} » introuvable dans cette base. ` +
          'Creez-le avant l\'import, ou lancez le seed.',
      )
    }
    console.log(`Produit des lignes : ${produit.designation} (${produit.unit})\n`)

    // --- Clients ---
    const libelles = [...new Set(lignes.map((l) => raisonSociale(l.client)))]
    const clients = new Map<string, string>()

    for (const libelle of libelles) {
      const code = codeClient(libelle)
      const existant = await prisma.customer.findFirst({
        where: { OR: [{ code }, { companyName: libelle }] },
        select: { id: true, companyName: true },
      })
      if (existant) {
        clients.set(libelle, existant.id)
        console.log(`  client existant : ${existant.companyName}`)
        continue
      }
      if (!ECRIRE) {
        clients.set(libelle, `(simule:${code})`)
        console.log(`  client A CREER  : ${libelle} (code ${code})`)
        continue
      }
      const cree = await prisma.customer.create({
        data: {
          code,
          companyName: libelle,
          currencyCode: 'EUR',
          // Pays, adresse et contacts ne figurent pas dans le classeur :
          // ils restent vides plutot qu'inventes.
        },
        select: { id: true },
      })
      clients.set(libelle, cree.id)
      console.log(`  client cree     : ${libelle} (code ${code})`)
    }

    // --- Factures ---
    console.log('\nFactures :')
    let creees = 0
    let ignorees = 0
    let sautees = 0
    const ecarts: Array<{ numero: string; calcule: number; classeur: number; ecart: number }> = []

    for (const l of lignes) {
      const numero = numeroFacture(l.no)

      const deja = await prisma.invoice.findUnique({ where: { number: numero }, select: { id: true } })
      if (deja) {
        ignorees += 1
        continue
      }

      // Le classeur ne dit rien du contenu vendu sur ces lignes.
      if (l.qte === null && DESIGNATION_SANS_QUANTITE === null) {
        console.log(`  SAUTEE  ${numero.padEnd(14)} ligne ${l.ligne} : aucune quantite dans le classeur`)
        sautees += 1
        continue
      }

      // Le taux est DEDUIT du classeur (vente dt / vente EUR), jamais du taux
      // du jour : c'est le taux effectivement applique a l'epoque.
      const taux =
        l.venteDt && l.venteEur ? round(dec(l.venteDt).dividedBy(dec(l.venteEur)), 6).toString() : '1'

      const quantite = l.qte ?? 1
      const prixUnitaire = round(dec(l.venteEur).dividedBy(dec(quantite)), 4).toString()

      const input: InvoiceInput = {
        customerId: clients.get(raisonSociale(l.client))!,
        date: l.date,
        dueDate: '',
        currencyCode: 'EUR',
        exchangeRateTnd: taux,
        paymentTerms: '',
        deliveryAddress: '',
        deliveryCountry: '',
        ngp: l.qte !== null ? produit.ngp : '',
        originCountry: produit.originCountry || 'TUNISIE',
        packageCount: l.colis ?? 0,
        packageType: '',
        packageDimensions: '',
        grossWeightKg: String(l.poidsBrut ?? 0),
        netWeightKg: String(l.poidsNet ?? 0),
        incoterm: '',
        transportMode: '',
        departurePort: '',
        destination: '',
        orderReference: '',
        domiciliationRef: l.domiciliation,
        // Les frais de transport et le CEPEX du classeur sont des COUTS en
        // dinars, pas des frais refactures au client : ils n'ont rien a faire
        // sur la facture.
        feesIncluded: true,
        shippingLabel: 'Transport',
        shippingAmount: '0',
        transitLabel: 'Transit',
        transitAmount: '0',
        insuranceLabel: 'Assurance',
        insuranceAmount: '0',
        otherFeesLabel: 'Autres frais',
        otherFeesAmount: '0',
        // Vente a l'export : exoneree de TVA, conformement au parametre societe.
        vatMode: 'NONE',
        vatRate: '0',
        stampDutyLabel: 'Timbre fiscal',
        stampDutyAmount: '0',
        // Le total du classeur est inscrit ici : le prix unitaire est borne a
        // 4 decimales, et le produit quantite x prix ne le reproduit pas
        // toujours au centime. La trace permet le rapprochement.
        notes:
          `Importe du suivi Excel 2026 (ligne ${l.ligne}). ` +
          `Total classeur : ${l.venteEur.toFixed(2)} EUR` +
          (l.venteDt ? ` / ${l.venteDt.toFixed(2)} DT` : '') +
          '.',
        priceBreakdownNote: '',
        items: [
          {
            productId: l.qte !== null ? produit.id : '',
            reference: l.qte !== null ? REFERENCE_PRODUIT : '',
            designation: l.qte !== null ? produit.designation : DESIGNATION_SANS_QUANTITE!,
            description: l.qte !== null ? '' : DESCRIPTION_SANS_QUANTITE,
            unit: l.qte !== null ? produit.unit : '',
            quantity: String(quantite),
            unitPrice: prixUnitaire,
            discountPercent: '0',
            ngp: l.qte !== null ? produit.ngp : '',
            originCountry: produit.originCountry || 'TUNISIE',
          },
        ],
      }

      // Tous les montants sont calcules par le moteur de l'application.
      const { scalars, items, totals } = buildInvoiceData(input, l.vireEur ?? 0)

      const ecartTotal = round(dec(totals.netToPay.toFixed(2)).minus(dec(l.venteEur)), 2)
      if (!ecartTotal.isZero()) {
        ecarts.push({ numero, calcule: Number(totals.netToPay.toFixed(2)), classeur: l.venteEur, ecart: Number(ecartTotal.toFixed(2)) })
      }

      if (!ECRIRE) {
        console.log(
          `  SIMULE  ${numero.padEnd(14)} ${l.date} ${raisonSociale(l.client).padEnd(16)} ` +
            `${l.venteEur.toFixed(2).padStart(10)} EUR  taux ${Number(taux).toFixed(4)}  ` +
            `qte ${String(quantite).padStart(6)}  domi ${l.domiciliation}`,
        )
        creees += 1
        continue
      }

      await prisma.$transaction(async (tx) => {
        const facture = await tx.invoice.create({
          data: {
            ...scalars,
            number: numero,
            status: 'DRAFT',
            paidAmount: '0.00',
            items: { create: items },
          },
          select: { id: true },
        })

        // Encaissement : la colonne « virement » du classeur, en un reglement.
        // Le rapprochement avec les virements reels ATB 1 a 18 n'est pas
        // representable tant que le lettrage multi-factures n'existe pas.
        if (l.vireEur && l.vireEur > 0) {
          await tx.payment.create({
            data: {
              invoiceId: facture.id,
              amount: round(l.vireEur, 2).toFixed(2),
              currencyCode: 'EUR',
              date: new Date(`${l.date}T00:00:00.000Z`),
              method: 'BANK_TRANSFER',
              reference: l.domiciliation ? `Domiciliation ${l.domiciliation}` : '',
              note: 'Importe du suivi Excel 2026.',
            },
          })

          const paye = round(l.vireEur, 2)
          const net = round(totals.netToPay, 2)
          await tx.invoice.update({
            where: { id: facture.id },
            data: {
              paidAmount: paye.toFixed(2),
              balanceDue: round(net.minus(paye), 2).toFixed(2),
              paidAmountTnd: round(paye.times(dec(taux)), 3).toFixed(3),
              balanceDueTnd: round(net.minus(paye).times(dec(taux)), 3).toFixed(3),
            },
          })
        }
      })

      console.log(
        `  CREEE   ${numero.padEnd(14)} ${l.date} ${raisonSociale(l.client).padEnd(16)} ` +
          `${l.venteEur.toFixed(2).padStart(10)} EUR` +
          (l.vireEur ? `  encaisse ${l.vireEur.toFixed(2)}` : '  non encaissee'),
      )
      creees += 1
    }

    console.log(
      `\n${ECRIRE ? 'Creees' : 'A creer'} : ${creees}   deja presentes : ${ignorees}   sautees : ${sautees}`,
    )
    if (ecarts.length > 0) {
      const cumul = ecarts.reduce((a, e) => a + Math.abs(e.ecart), 0)
      console.log(
        `\n${ecarts.length} facture(s) dont le total calcule differe du classeur ` +
          `(cumul ${cumul.toFixed(2)} EUR) :`,
      )
      for (const e of ecarts) {
        console.log(
          `  ${e.numero.padEnd(14)} calcule ${e.calcule.toFixed(2).padStart(10)}` +
            `  classeur ${e.classeur.toFixed(2).padStart(10)}` +
            `  ecart ${e.ecart.toFixed(2).padStart(6)}`,
        )
      }
      console.log(
        '\nCause : le prix unitaire est borne a 4 decimales. Le quotient ' +
          'total / quantite\nn est pas toujours representable exactement.',
      )
    } else {
      console.log('\nTous les totaux calcules correspondent au classeur au centime.')
    }
    if (sautees > 0) {
      console.log(
        `\n${sautees} facture(s) sautee(s) faute de quantite dans le classeur.\n` +
          "Renseignez DESIGNATION_SANS_QUANTITE en tete de ce script pour les importer.",
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
