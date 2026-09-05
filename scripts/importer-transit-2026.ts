import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildPurchaseData } from '../src/services/purchase.service'
import { add, round } from '../src/lib/money'
import type { PurchaseInput } from '../src/validations/purchase'

/**
 * Import des factures de transit 2026, relevees dans le classeur.
 *
 * SOURCE : les deux blocs « DATE / NUMERO F / MONTANT » du classeur
 * (colonnes AA-AC, lignes 41-51 pour mars et 87-92 pour juin). Leur
 * numerotation 626MMxxx encode le mois, et leurs dates suivent celles des
 * expeditions.
 *
 * CONTROLE : les deux sous-totaux « M,TOTAL » du classeur sont verifies avant
 * toute ecriture — 10 931,122 pour mars, 16 736,962 pour juin.
 *
 * DEUX LIMITES ASSUMEES, signalees dans les notes de chaque document :
 *
 *  1. Le FOURNISSEUR n'est pas nomme dans le classeur. Un fournisseur
 *     provisoire est cree, avec un libelle qui appelle sa correction. Aucun
 *     nom n'est invente.
 *  2. Le classeur ne porte qu'UN montant, sans detail de TVA. Le regime est
 *     donc « non applicable » : la TVA deductible de ces factures n'est pas
 *     recuperee tant que le detail n'est pas saisi.
 *
 * USAGE
 *   npx tsx scripts/importer-transit-2026.ts            (simulation)
 *   npx tsx scripts/importer-transit-2026.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

/** Fournisseur provisoire : le libelle appelle explicitement sa correction. */
const FOURNISSEUR = {
  code: 'TRANSIT',
  companyName: 'TRANSITAIRE — à renseigner',
  currencyCode: 'TND',
  nature: 'TRANSPORT' as const,
  notes:
    "Cree par l'import des factures de transit 2026. Le classeur ne nomme pas " +
    'ce fournisseur : completez la raison sociale, le matricule fiscal et ' +
    "l'adresse depuis une facture d'origine.",
}

interface LigneTransit {
  ligne: number
  date: string
  numero: string
  montant: number
}

/** Bloc de mars : sous-total « M,TOTAL » = 10 931,122 (ligne 53). */
const MARS: LigneTransit[] = [
  { ligne: 41, date: '2026-03-03', numero: '626030001', montant: 1500.522 },
  { ligne: 42, date: '2026-03-05', numero: '626030008', montant: 2109.184 },
  { ligne: 43, date: '2026-03-13', numero: '626030017', montant: 2102.575 },
  { ligne: 50, date: '2026-03-23', numero: '626030026', montant: 2278.137 },
  { ligne: 51, date: '2026-03-26', numero: '626030034', montant: 2940.704 },
]

/** Bloc de juin : sous-total « M,TOTAL » = 16 736,962 (ligne 94). */
const JUIN: LigneTransit[] = [
  { ligne: 87, date: '2026-06-03', numero: '626060005', montant: 1639.311 },
  { ligne: 88, date: '2026-06-06', numero: '626060008', montant: 2435.666 },
  { ligne: 89, date: '2026-06-13', numero: '626060014', montant: 4586.581 },
  { ligne: 90, date: '2026-06-20', numero: '626060023', montant: 2425.923 },
  { ligne: 91, date: '2026-06-27', numero: '626060038', montant: 3223.558 },
  { ligne: 92, date: '2026-06-30', numero: '626060040', montant: 2425.923 },
]

const SOUS_TOTAUX = [
  { libelle: 'mars', lignes: MARS, attendu: 10931.122 },
  { libelle: 'juin', lignes: JUIN, attendu: 16736.962 },
]

function controler() {
  console.log('Controle contre les sous-totaux « M,TOTAL » du classeur :')
  let fidele = true
  for (const bloc of SOUS_TOTAUX) {
    const calcule = round(add(...bloc.lignes.map((l) => l.montant)), 3)
    const ecart = Math.abs(Number(calcule.toFixed(3)) - bloc.attendu)
    const ok = ecart < 0.001
    if (!ok) fidele = false
    console.log(
      `  ${ok ? 'OK   ' : 'ECART'} ${bloc.libelle.padEnd(5)} ${calcule.toFixed(3).padStart(12)} / ${bloc.attendu.toFixed(3).padStart(12)}  (${bloc.lignes.length} factures)`,
    )
  }
  if (!fidele) throw new Error('La transcription ne correspond pas au classeur. Import interrompu.')
  const total = round(add(...SOUS_TOTAUX.flatMap((b) => b.lignes.map((l) => l.montant))), 3)
  console.log(`  => transcription fidele — total ${total.toFixed(3)} TND\n`)
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  controler()

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    let fournisseur = await prisma.supplier.findUnique({
      where: { code: FOURNISSEUR.code },
      select: { id: true, companyName: true },
    })

    if (!fournisseur) {
      if (!ECRIRE) {
        console.log(`  fournisseur A CREER : ${FOURNISSEUR.companyName} (code ${FOURNISSEUR.code})`)
        fournisseur = { id: '(simule)', companyName: FOURNISSEUR.companyName }
      } else {
        fournisseur = await prisma.supplier.create({
          data: FOURNISSEUR,
          select: { id: true, companyName: true },
        })
        console.log(`  fournisseur cree    : ${fournisseur.companyName} (code ${FOURNISSEUR.code})`)
      }
    } else {
      console.log(`  fournisseur existant : ${fournisseur.companyName}`)
    }

    console.log('\nFactures de transit :')
    let creees = 0
    let ignorees = 0

    for (const l of [...MARS, ...JUIN]) {
      const numeroInterne = `TRA-2026-${l.numero}`

      const deja = await prisma.purchase.findFirst({
        where: { OR: [{ number: numeroInterne }, { supplierReference: l.numero }] },
        select: { number: true },
      })
      if (deja) {
        console.log(`  PRESENTE ${l.numero} -> ${deja.number}`)
        ignorees += 1
        continue
      }

      const input: PurchaseInput = {
        supplierId: fournisseur.id,
        supplierReference: l.numero,
        date: l.date,
        dueDate: '',
        currencyCode: 'TND',
        paymentTerms: '',
        shippingLabel: 'Transport',
        shippingAmount: '0',
        otherFeesLabel: 'Autres frais',
        otherFeesAmount: '0',
        // Le classeur ne porte qu'un montant : aucun detail de TVA a declarer.
        vatMode: 'NONE',
        vatRate: '0',
        stampDutyLabel: 'Timbre fiscal',
        stampDutyAmount: '0',
        notes:
          `Importe du classeur 2026 (ligne ${l.ligne}). Montant du releve : ` +
          `${l.montant.toFixed(3)} TND. Fournisseur et detail de TVA a completer ` +
          `depuis la facture d'origine.`,
        items: [
          {
            productId: '',
            reference: '',
            designation: 'Transit et transport',
            description:
              'Montant global du relevé — détail de TVA non disponible dans le classeur.',
            unit: '',
            quantity: '1',
            unitPrice: l.montant.toFixed(3),
            discountPercent: '0',
          },
        ],
      }

      const { scalars, items, totals } = buildPurchaseData(input)

      const ecart = Math.abs(Number(totals.netToPay.toFixed(3)) - l.montant)
      if (ecart > 0.001) {
        throw new Error(`${l.numero} : net calcule ${totals.netToPay.toFixed(3)} != ${l.montant}`)
      }

      if (ECRIRE) {
        await prisma.purchase.create({
          data: {
            ...scalars,
            number: numeroInterne,
            status: 'DRAFT',
            paidAmount: '0.000',
            items: { create: items },
          },
        })
      }

      console.log(
        `  ${ECRIRE ? 'CREEE  ' : 'SIMULE '} ${numeroInterne.padEnd(20)} ${l.date}  ` +
          `${totals.netToPay.toFixed(3).padStart(11)} TND`,
      )
      creees += 1
    }

    console.log(`\n${ECRIRE ? 'Creees' : 'A creer'} : ${creees}   deja presentes : ${ignorees}`)
    if (!ECRIRE) console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
