import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildPurchaseData } from '../src/services/purchase.service'
import { add, dec, round } from '../src/lib/money'
import type { PurchaseInput } from '../src/validations/purchase'

/**
 * Import des factures d'achat 2026.
 *
 * SOURCE : le releve d'achats de MZ EXPORT, transcrit ci-dessous. Contrairement
 * aux ventes, ces donnees ne viennent pas d'un fichier mais d'un releve
 * communique. La transcription est donc CONTROLEE contre les quatre totaux du
 * releve avant toute ecriture — quantite, HT, TVA et poids. Un ecart
 * interrompt l'import.
 *
 * TIMBRE FISCAL : sur chaque ligne du releve, HT + TVA + 1 = TTC. Ce dinar est
 * le timbre fiscal, et les 9 achats deja saisis dans l'application le
 * confirment (ACH-2026-01 : 18 600 + 3 534 + 1 = 22 135). Il est donc porte
 * dans `stampDutyAmount`, jamais fondu dans un autre montant.
 *
 * STATUT : brouillon. Valider un achat alimente le stock ; c'est souhaitable,
 * mais cela doit rester une decision explicite, document par document.
 *
 * USAGE
 *   npx tsx scripts/importer-achats-2026.ts            (simulation)
 *   npx tsx scripts/importer-achats-2026.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')
const REFERENCE_PRODUIT = 'FOUTA-COTON'
/** Timbre fiscal constate sur chaque facture du releve. */
const TIMBRE = '1'

interface LigneAchat {
  /** Libelle du fournisseur dans le releve. */
  fournisseur: 'ARCENAY' | 'SAHAFA' | 'STE SAFER'
  date: string
  /** Numero de facture tel qu'il figure sur le releve. */
  facture: string
  qte: number
  ht: number
  tva: number
  ttc: number
  /** Poids en kilogrammes. Observation du releve : l'application le derive du
   *  poids unitaire du produit et ne le stocke pas sur le document. */
  kg: number
}

/**
 * Le releve complet, dans l'ordre chronologique du document.
 * Les 9 premieres deja saisies sont conservees ici : elles servent au controle
 * des totaux, et l'import les ignore par leur numero.
 */
const RELEVE: LigneAchat[] = [
  { fournisseur: 'ARCENAY', date: '2026-01-20', facture: 'FAC 01L-2026', qte: 3100, ht: 18600, tva: 3534, ttc: 22135, kg: 2027.4 },
  { fournisseur: 'ARCENAY', date: '2026-02-10', facture: 'FAC 03L-2026', qte: 10850, ht: 65100, tva: 12369, ttc: 77470, kg: 6800 },
  { fournisseur: 'ARCENAY', date: '2026-02-25', facture: 'FAC 05L-2026', qte: 7320, ht: 43920, tva: 8344.8, ttc: 52266, kg: 5273 },
  { fournisseur: 'SAHAFA', date: '2026-02-25', facture: 'FAC 434', qte: 200, ht: 1200, tva: 84, ttc: 1285, kg: 90 },
  { fournisseur: 'ARCENAY', date: '2026-03-05', facture: 'FAC 06L-2026', qte: 8596, ht: 61153, tva: 11619.07, ttc: 72773, kg: 5183 },
  { fournisseur: 'SAHAFA', date: '2026-03-17', facture: 'FAC 440', qte: 149, ht: 897, tva: 62.8, ttc: 961, kg: 67.05 },
  { fournisseur: 'ARCENAY', date: '2026-03-18', facture: 'FAC 08L-2026', qte: 12470, ht: 75055, tva: 14260.45, ttc: 89316, kg: 7615 },
  { fournisseur: 'SAHAFA', date: '2026-03-26', facture: 'FAC 449', qte: 50, ht: 750, tva: 52.5, ttc: 804, kg: 50 },
  { fournisseur: 'SAHAFA', date: '2026-03-27', facture: 'FAC 450', qte: 155, ht: 930, tva: 65.1, ttc: 996, kg: 70 },
  { fournisseur: 'ARCENAY', date: '2026-04-13', facture: 'FAC L-12', qte: 12440, ht: 74640, tva: 14181.6, ttc: 88823, kg: 6735 },
  { fournisseur: 'ARCENAY', date: '2026-04-24', facture: 'FAC L-15', qte: 16480, ht: 98880, tva: 18787.2, ttc: 117668, kg: 10300 },
  { fournisseur: 'ARCENAY', date: '2026-05-06', facture: 'FAC L-19', qte: 7297, ht: 43782, tva: 8318.58, ttc: 52102, kg: 4380 },
  { fournisseur: 'ARCENAY', date: '2026-05-10', facture: 'FAC L-23', qte: 12524, ht: 75144, tva: 14277.36, ttc: 89422, kg: 7400 },
  { fournisseur: 'SAHAFA', date: '2026-05-10', facture: 'FAC 460', qte: 155, ht: 930, tva: 65.1, ttc: 996, kg: 62 },
  { fournisseur: 'SAHAFA', date: '2026-05-19', facture: 'FAC 463', qte: 150, ht: 900, tva: 63, ttc: 964, kg: 60 },
  { fournisseur: 'ARCENAY', date: '2026-06-02', facture: 'FAC L-28', qte: 16889, ht: 101334, tva: 19253.46, ttc: 120588, kg: 10223 },
  { fournisseur: 'ARCENAY', date: '2026-06-16', facture: 'FAC L-32', qte: 13821, ht: 82926, tva: 15755.94, ttc: 98683, kg: 8983.65 },
  { fournisseur: 'SAHAFA', date: '2026-06-19', facture: 'FAC 473', qte: 50, ht: 925, tva: 64.75, ttc: 991, kg: 44 },
  { fournisseur: 'SAHAFA', date: '2026-06-22', facture: 'FAC 475', qte: 150, ht: 900, tva: 63, ttc: 964, kg: 64 },
  { fournisseur: 'ARCENAY', date: '2026-07-06', facture: 'FAC L-35', qte: 14375, ht: 86250, tva: 16387.5, ttc: 102639, kg: 9343.75 },
  { fournisseur: 'STE SAFER', date: '2026-07-10', facture: 'FAC N238', qte: 3206, ht: 16030, tva: 1122.1, ttc: 17153, kg: 1763 },
  { fournisseur: 'ARCENAY', date: '2026-07-16', facture: 'FAC L-39', qte: 9594, ht: 57564, tva: 10937.16, ttc: 68502, kg: 6427.98 },
  { fournisseur: 'ARCENAY', date: '2026-07-27', facture: 'FAC L-41', qte: 12115, ht: 72690, tva: 13811.1, ttc: 86502, kg: 7290 },
]

/** Totaux figurant en tete du releve. */
const TOTAUX_RELEVE = { qte: 162136, ht: 980500, tva: 183480, ttc: 1164003, kg: 100252 }

/** Taux de TVA constate par fournisseur, verifie ligne a ligne ci-dessous. */
const TAUX_TVA: Record<LigneAchat['fournisseur'], number> = {
  ARCENAY: 19,
  SAHAFA: 7,
  'STE SAFER': 7,
}

/** Code du fournisseur dans l'application. */
const CODE_FOURNISSEUR: Record<LigneAchat['fournisseur'], string> = {
  ARCENAY: 'ARSENAY',
  SAHAFA: 'SAHAFA',
  'STE SAFER': 'SAFER',
}

/**
 * Reference et numero interne, dans la convention deja utilisee :
 *   « FAC L-12 » et « FAC 01L-2026 » -> reference 12-L-2026, numero ACH-2026-12
 *   « FAC 434 »                      -> reference 434,       numero ACH-2026-434
 */
function references(facture: string) {
  const arcenay = facture.match(/^FAC\s*(?:L-)?0*(\d+)L?(?:-2026)?$/i)
  const chiffres = facture.replace(/[^0-9]/g, '')
  if (/L/i.test(facture) && arcenay) {
    const n = arcenay[1].padStart(2, '0')
    return { reference: `${n}-L-2026`, numero: `ACH-2026-${n}` }
  }
  return { reference: chiffres, numero: `ACH-2026-${chiffres}` }
}

function controlerReleve() {
  const somme = (cle: 'qte' | 'ht' | 'tva' | 'kg') =>
    round(add(...RELEVE.map((l) => l[cle])), 3)

  console.log(`${RELEVE.length} lignes transcrites\n`)
  console.log('Controle contre les totaux du releve :')

  const controles: Array<[string, number, number, number]> = [
    ['quantite', Number(somme('qte').toFixed(0)), TOTAUX_RELEVE.qte, 0],
    ['HT', Number(somme('ht').toFixed(2)), TOTAUX_RELEVE.ht, 0.01],
    // Le releve arrondit ses totaux de TVA et de poids : on tolere l'ecart
    // qu'il porte lui-meme, sans le masquer.
    ['TVA', Number(somme('tva').toFixed(2)), TOTAUX_RELEVE.tva, 1],
    ['poids', Number(somme('kg').toFixed(2)), TOTAUX_RELEVE.kg, 1],
  ]

  let fidele = true
  for (const [libelle, calcule, attendu, tolerance] of controles) {
    const ecart = Math.abs(calcule - attendu)
    const ok = ecart <= tolerance
    if (!ok) fidele = false
    console.log(
      `  ${ok ? 'OK   ' : 'ECART'} ${libelle.padEnd(9)} ${calcule.toFixed(2).padStart(13)} / ${attendu.toFixed(2).padStart(13)}` +
        (ecart > 0 ? `  (ecart ${ecart.toFixed(2)})` : ''),
    )
  }

  // Coherence interne : HT + TVA + timbre doit redonner le TTC du releve.
  console.log('\nControle du timbre fiscal (HT + TVA + 1 = TTC) :')
  let timbreOk = true
  for (const l of RELEVE) {
    const attendu = round(add(l.ht, l.tva, 1), 2)
    const ecart = Math.abs(Number(attendu.toFixed(2)) - l.ttc)
    // Le releve arrondit ses TTC a l'unite : jusqu'a 1 DT d'ecart est son
    // propre arrondi, pas une erreur de transcription.
    if (ecart > 1) {
      timbreOk = false
      console.log(`  ECART ${l.facture.padEnd(14)} ${attendu.toFixed(2)} != ${l.ttc}`)
    }
    // Le taux de TVA doit correspondre au fournisseur.
    const tauxCalcule = round(dec(l.tva).dividedBy(dec(l.ht)).times(100), 2)
    const tauxAttendu = TAUX_TVA[l.fournisseur]
    if (Math.abs(Number(tauxCalcule.toFixed(2)) - tauxAttendu) > 0.05) {
      fidele = false
      console.log(
        `  ECART ${l.facture.padEnd(14)} taux TVA ${tauxCalcule.toFixed(2)} % != ${tauxAttendu} % (${l.fournisseur})`,
      )
    }
  }
  if (timbreOk) console.log('  OK    les 23 lignes verifient HT + TVA + 1 = TTC')

  if (!fidele) throw new Error('La transcription ne correspond pas au releve. Import interrompu.')
  console.log('  => transcription fidele\n')
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  controlerReleve()

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const produit = await prisma.product.findUnique({
      where: { reference: REFERENCE_PRODUIT },
      select: { id: true, designation: true, unit: true },
    })
    if (!produit) throw new Error(`Produit « ${REFERENCE_PRODUIT} » introuvable dans cette base.`)

    const fournisseurs = new Map<string, string>()
    for (const libelle of Object.keys(CODE_FOURNISSEUR) as LigneAchat['fournisseur'][]) {
      const code = CODE_FOURNISSEUR[libelle]
      const f = await prisma.supplier.findUnique({ where: { code }, select: { id: true, companyName: true } })
      if (!f) throw new Error(`Fournisseur de code « ${code} » introuvable (releve : ${libelle}).`)
      fournisseurs.set(libelle, f.id)
      console.log(`  fournisseur ${libelle.padEnd(11)} -> ${f.companyName}`)
    }

    console.log('\nAchats :')
    let creees = 0
    let ignorees = 0

    // Les achats deja saisis, indexes par fournisseur + reference NORMALISEE.
    //
    // Indispensable : les saisies existantes rembourrent leurs references
    // ("000475", "0238") la ou ce script produit "475" et "238". Une simple
    // comparaison de numeros creerait des doublons de factures reelles.
    const existants = new Map<string, string>()
    for (const p of await prisma.purchase.findMany({
      select: { number: true, supplierId: true, supplierReference: true },
    })) {
      const chiffres = p.supplierReference.replace(/[^0-9]/g, '').replace(/^0+/, '')
      if (chiffres) existants.set(`${p.supplierId}|${chiffres}`, p.number)
    }

    for (const l of RELEVE) {
      const { reference, numero } = references(l.facture)
      const fournisseurId = fournisseurs.get(l.fournisseur)!
      const cle = `${fournisseurId}|${reference.replace(/[^0-9]/g, '').replace(/^0+/, '')}`

      const dejaSaisi = existants.get(cle)
      if (dejaSaisi) {
        console.log(`  PRESENTE ${l.facture.padEnd(14)} -> deja saisie sous ${dejaSaisi}`)
        ignorees += 1
        continue
      }

      const deja = await prisma.purchase.findUnique({ where: { number: numero }, select: { id: true } })
      if (deja) {
        ignorees += 1
        continue
      }

      const prixUnitaire = round(dec(l.ht).dividedBy(dec(l.qte)), 4).toString()

      const input: PurchaseInput = {
        supplierId: fournisseurId,
        supplierReference: reference,
        date: l.date,
        dueDate: '',
        currencyCode: 'TND',
        paymentTerms: '',
        shippingLabel: 'Transport',
        shippingAmount: '0',
        otherFeesLabel: 'Autres frais',
        otherFeesAmount: '0',
        vatMode: 'RATE',
        vatRate: String(TAUX_TVA[l.fournisseur]),
        stampDutyLabel: 'Timbre fiscal',
        stampDutyAmount: TIMBRE,
        notes:
          `Importe du releve d'achats 2026. Facture fournisseur : ${l.facture}. ` +
          `Releve : HT ${l.ht.toFixed(3)} / TVA ${l.tva.toFixed(3)} / TTC ${l.ttc.toFixed(3)} / ${l.kg} kg.`,
        items: [
          {
            productId: produit.id,
            reference: REFERENCE_PRODUIT,
            designation: produit.designation,
            description: '',
            unit: produit.unit,
            quantity: String(l.qte),
            unitPrice: prixUnitaire,
            discountPercent: '0',
          },
        ],
      }

      const { scalars, items, totals } = buildPurchaseData(input)

      // Le net calcule doit retrouver le TTC du releve, a son propre arrondi pres.
      const ecart = Math.abs(Number(totals.netToPay.toFixed(2)) - l.ttc)
      if (ecart > 1) {
        throw new Error(
          `${numero} : net calcule ${totals.netToPay.toFixed(3)} != TTC releve ${l.ttc} (ecart ${ecart.toFixed(2)})`,
        )
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

      console.log(
        `  ${ECRIRE ? 'CREEE  ' : 'SIMULE '} ${numero.padEnd(16)} ${l.date} ${l.fournisseur.padEnd(10)} ` +
          `ref ${reference.padEnd(10)} ${String(l.qte).padStart(6)} pcs x ${prixUnitaire.padStart(8)} ` +
          `= net ${totals.netToPay.toFixed(3).padStart(12)} (releve ${l.ttc})`,
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
