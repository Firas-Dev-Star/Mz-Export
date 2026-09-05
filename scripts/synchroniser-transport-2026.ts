import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildTransportInvoiceData } from '../src/services/transport.service'
import { add, dec, round } from '../src/lib/money'
import type { TransportInvoiceInput } from '../src/validations/transport'

/**
 * Synchronise les factures de transport avec le registre a jour du classeur.
 *
 * POURQUOI. Le registre transport a ete complete apres le premier import :
 * SEMI 47 a recu son numero de facture et son montant reel, et les expeditions
 * 49 a 52 ont ete ajoutees. Ce script prend le registre comme REFERENCE et
 * aligne l'application dessus.
 *
 * REGLE SUR LES ECARTS DE MONTANT. Le registre a ete releve a deux decimales
 * alors que les cellules en portent trois. Un ecart inferieur ou egal a un
 * centime est donc considere comme un arrondi d'affichage : la valeur en base,
 * plus precise, est CONSERVEE. Au-dela, c'est une correction reelle, et elle
 * est appliquee — en le disant.
 *
 * DATES. Le registre ne date pas les lignes recentes. Elles reprennent la date
 * de la vente couverte, comme les 34 precedentes, et la note du document le
 * signale.
 *
 * Le script ne SUPPRIME jamais rien : une facture presente en base et absente
 * du registre est signalee, pas effacee.
 *
 * USAGE
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/synchroniser-transport-2026.ts
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/synchroniser-transport-2026.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

/** Tolerance d'arrondi d'affichage, en dinars. */
const TOLERANCE = 0.01

interface Ligne {
  expedition: string
  numero: string
  transporteur: string
  montant: number
}

/** Registre transport a jour, releve du classeur. 53 lignes. */
const REGISTRE: Ligne[] = [
  { expedition: 'SEMI 88', numero: 'ES260100022', transporteur: 'METM', montant: 1927.356 },
  { expedition: 'wida 01', numero: '626010004', transporteur: 'transcargo', montant: 1814.431 },
  { expedition: 'SEMI 02', numero: 'ES260100281', transporteur: 'METM', montant: 3630.07 },
  { expedition: 'SEMI 03', numero: 'ES260100282', transporteur: 'METM', montant: 1670.41 },
  { expedition: 'SEMI 04', numero: 'ES260200543', transporteur: 'METM', montant: 3650.87 },
  { expedition: 'wida 05', numero: '626020015', transporteur: 'transcargo', montant: 5904.652 },
  { expedition: 'SEMI 06', numero: 'ES260200973', transporteur: 'METM', montant: 3650.87 },
  { expedition: 'wida 07', numero: '626020035', transporteur: 'transcargo', montant: 3468.26 },
  { expedition: 'GR 8', numero: '626030001', transporteur: 'transcargo', montant: 1500.522 },
  { expedition: 'wida 09', numero: '626030008', transporteur: 'transcargo', montant: 2109.184 },
  { expedition: 'semi 10', numero: 'ES260300575', transporteur: 'METM', montant: 1064.04 },
  { expedition: 'wida 11', numero: '626030017', transporteur: 'transcargo', montant: 2102.575 },
  { expedition: 'wida 12', numero: '626030026', transporteur: 'transcargo', montant: 2278.14 },
  { expedition: 'wida 13', numero: '626030034', transporteur: 'transcargo', montant: 2940.704 },
  { expedition: 'MALISHOP 14', numero: 'ES260301284', transporteur: 'METM', montant: 809.37 },
  { expedition: 'wida 15', numero: '626040003', transporteur: 'transcargo', montant: 2432.883 },
  { expedition: 'semi 16', numero: 'ES260400248', transporteur: 'METM', montant: 3812.87 },
  { expedition: 'wida 17', numero: '626040010', transporteur: 'transcargo', montant: 1995.28 },
  { expedition: 'mALISHOP 18', numero: 'ES260400249', transporteur: 'METM', montant: 916.55 },
  { expedition: 'SEMI 19', numero: 'ES260400543', transporteur: 'METM', montant: 2126.95 },
  { expedition: 'wida 20', numero: '626040019', transporteur: 'transcargo', montant: 2447.5 },
  { expedition: 'wida 21', numero: '626040035', transporteur: 'transcargo', montant: 2443.324 },
  { expedition: 'wida 22', numero: '626050003', transporteur: 'transcargo', montant: 2313.264 },
  { expedition: 'wida 23', numero: '626050006', transporteur: 'transcargo', montant: 1993.582 },
  { expedition: 'wida 24', numero: '626050011', transporteur: 'transcargo', montant: 2444.715 },
  { expedition: 'malishop 25', numero: 'ES260500772', transporteur: 'METM', montant: 935.213 },
  { expedition: 'wida 26', numero: '626050021', transporteur: 'transcargo', montant: 2688.84 },
  { expedition: 'wida 27', numero: '626050031', transporteur: 'transcargo', montant: 4597.176 },
  { expedition: 'semi 28', numero: 'ES260501310', transporteur: 'METM', montant: 673.93 },
  { expedition: 'wida 29', numero: '626060005', transporteur: 'transcargo', montant: 1639.311 },
  { expedition: 'wida 30', numero: '626060008', transporteur: 'transcargo', montant: 2435.666 },
  { expedition: 'ATEF 31', numero: '5601004961', transporteur: 'DACHSER', montant: 2511.891 },
  { expedition: 'malishop 32', numero: 'ES260600119', transporteur: 'METM', montant: 876.79 },
  { expedition: 'WIDA 33', numero: '626060014', transporteur: 'transcargo', montant: 4586.581 },
  { expedition: 'MALISHOP 34', numero: '5601004729', transporteur: 'DACHSER', montant: 1362.225 },
  { expedition: 'SARA 35', numero: '5601004857', transporteur: 'DACHSER', montant: 652.044 },
  { expedition: 'SEMI 36', numero: 'ES260600588', transporteur: 'METM', montant: 3728.8 },
  { expedition: 'SEMI 36', numero: 'ES260600589', transporteur: 'METM', montant: 54.55 },
  { expedition: 'SEMI 37', numero: 'FVTN2601016418', transporteur: 'VECTORYS', montant: 3876.01 },
  { expedition: 'WIDA 39', numero: '626060023', transporteur: 'transcargo', montant: 2425.923 },
  { expedition: 'WIDA 40', numero: '626060038', transporteur: 'transcargo', montant: 3223.558 },
  { expedition: 'malishop 41', numero: '5601004858', transporteur: 'DACHSER', montant: 604.284 },
  { expedition: 'WIDA 42', numero: '626060040', transporteur: 'transcargo', montant: 2425.923 },
  { expedition: 'SEMI 43', numero: 'ES260700049', transporteur: 'METM', montant: 669.43 },
  { expedition: 'WIDA 44', numero: '62607007', transporteur: 'transcargo', montant: 2421.745 },
  { expedition: 'WIDA 45', numero: '626070021', transporteur: 'transcargo', montant: 2418.265 },
  { expedition: 'WIDA 46', numero: '626070035', transporteur: 'transcargo', montant: 2671.926 },
  // Completee depuis le premier import : numero obtenu, montant corrige.
  { expedition: 'SEMI 47', numero: 'ES260700855', transporteur: 'METM', montant: 3775.81 },
  { expedition: 'WIDA 48', numero: '62070041', transporteur: 'transcargo', montant: 2313.264 },
  // Quatre expeditions ajoutees au registre apres le premier import.
  { expedition: 'WIDA 49', numero: '62080001', transporteur: 'transcargo', montant: 2674.314 },
  { expedition: 'SEMI 50', numero: 'FP2601063250', transporteur: 'VECTORYS', montant: 2736 },
  { expedition: 'WIDA 51', numero: '62080018', transporteur: 'transcargo', montant: 2427.314 },
  { expedition: 'MALISHOP 52', numero: '5601005651', transporteur: 'DACHSER', montant: 693.896 },
]

/** Numero de la vente evoquee par la reference d'expedition. */
function numeroVente(ref: string): number | null {
  const m = ref.match(/(\d+)\s*$/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 52 ? n : null
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const total = round(add(...REGISTRE.map((l) => l.montant)), 3)
  console.log(`Registre : ${REGISTRE.length} lignes, ${total.toFixed(3)} DT\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const enBase = await prisma.transportInvoice.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: {
        id: true, number: true, carrierReference: true, shipmentRef: true,
        netToPay: true, invoiceId: true, date: true,
      },
    })

    const parNumero = new Map(enBase.filter((f) => f.carrierReference).map((f) => [f.carrierReference, f]))
    const parExpedition = new Map<string, typeof enBase>()
    for (const f of enBase) {
      const cle = f.shipmentRef.trim().toUpperCase()
      if (!parExpedition.has(cle)) parExpedition.set(cle, [])
      parExpedition.get(cle)!.push(f)
    }

    const ventes = await prisma.invoice.findMany({
      where: { number: { startsWith: 'FAC ' } },
      select: { id: true, number: true, date: true },
    })
    const venteParNumero = new Map<number, { id: string; number: string; date: Date }>()
    for (const v of ventes) {
      const m = v.number.match(/^FAC (\d+)-2026$/)
      if (m) venteParNumero.set(Number(m[1]), v)
    }

    const transporteurs = new Map(
      (await prisma.carrier.findMany({ select: { id: true, code: true } })).map((c) => [c.code, c.id]),
    )

    const vus = new Set<string>()
    const aCreer: Array<{ ligne: Ligne; vente: { id: string; number: string; date: Date } | null }> = []
    const aCorriger: Array<{ ligne: Ligne; id: string; numero: string; ancien: string }> = []
    let identiques = 0
    let arrondis = 0
    // Somme des ecarts d'arrondi tolerés : le controle final doit en tenir
    // compte, sinon il signale un ecart qui est en realite une precision
    // conservee volontairement.
    let ecartsToleres = dec(0)

    for (const l of REGISTRE) {
      // Reconnaissance par numero de facture, sinon par expedition.
      let f = parNumero.get(l.numero)
      if (!f) {
        const candidats = (parExpedition.get(l.expedition.trim().toUpperCase()) ?? []).filter(
          (c) => !vus.has(c.id),
        )
        // Une expedition peut porter deux factures (SEMI 36) : on prend celle
        // dont le montant correspond, sinon la premiere libre.
        f =
          candidats.find((c) => Math.abs(Number(c.netToPay) - l.montant) <= TOLERANCE) ??
          candidats[0]
      }

      if (!f) {
        const n = numeroVente(l.expedition)
        aCreer.push({ ligne: l, vente: n === null ? null : (venteParNumero.get(n) ?? null) })
        continue
      }

      vus.add(f.id)
      const ecart = Math.abs(Number(f.netToPay) - l.montant)
      if (ecart === 0) identiques += 1
      else if (ecart <= TOLERANCE) {
        arrondis += 1
        ecartsToleres = ecartsToleres.plus(dec(f.netToPay).minus(dec(l.montant)))
      }
      else {
        aCorriger.push({
          ligne: l,
          id: f.id,
          numero: f.number,
          ancien: round(f.netToPay, 3).toFixed(3),
        })
      }
    }

    const orphelines = enBase.filter((f) => !vus.has(f.id))

    console.log(`Deja conformes            : ${identiques}`)
    console.log(
      `Ecart d'arrondi conserve  : ${arrondis}  (<= ${TOLERANCE} DT, total ${round(ecartsToleres, 3).toFixed(3)} DT)`,
    )
    console.log(`\nA corriger : ${aCorriger.length}`)
    for (const c of aCorriger) {
      console.log(
        `  ${c.numero.padEnd(24)} ${c.ligne.expedition.padEnd(14)} ${c.ancien.padStart(11)} -> ${c.ligne.montant.toFixed(3).padStart(11)} DT` +
          `  (n de facture : « ${c.ligne.numero} »)`,
      )
    }
    console.log(`\nA creer : ${aCreer.length}`)
    for (const a of aCreer) {
      console.log(
        `  ${a.ligne.expedition.padEnd(14)} ${a.ligne.numero.padEnd(16)} ${a.ligne.transporteur.padEnd(12)} ` +
          `${a.ligne.montant.toFixed(3).padStart(11)} DT  vente : ${a.vente ? `${a.vente.number} du ${a.vente.date.toISOString().slice(0, 10)}` : 'NON RESOLUE'}`,
      )
    }
    if (orphelines.length > 0) {
      console.log(`\nEn base mais absentes du registre : ${orphelines.length} (aucune suppression)`)
      for (const o of orphelines) {
        console.log(`  ${o.number.padEnd(24)} ${o.shipmentRef.padEnd(14)} ${round(o.netToPay, 3).toFixed(3)} DT`)
      }
    }

    if (!ECRIRE) {
      console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
      return
    }

    // ---- Corrections ----
    for (const c of aCorriger) {
      const numeroInterne = `TRP-2026-${c.ligne.numero}`
      const collision = await prisma.transportInvoice.findUnique({
        where: { number: numeroInterne },
        select: { id: true },
      })
      await prisma.transportInvoice.update({
        where: { id: c.id },
        data: {
          carrierReference: c.ligne.numero,
          transportAmount: c.ligne.montant.toFixed(3),
          totalHt: c.ligne.montant.toFixed(3),
          totalTtc: c.ligne.montant.toFixed(3),
          netToPay: c.ligne.montant.toFixed(3),
          balanceDue: c.ligne.montant.toFixed(3),
          netToPayTnd: c.ligne.montant.toFixed(3),
          balanceDueTnd: c.ligne.montant.toFixed(3),
          // Le numero interne suit la reference du transporteur, comme les
          // autres — sauf s'il est deja pris par un autre document.
          ...(collision && collision.id !== c.id ? {} : { number: numeroInterne }),
          notes:
            `Importe du registre transport du classeur 2026. Expedition : ${c.ligne.expedition}. ` +
            `MONTANT CORRIGE le ${new Date().toISOString().slice(0, 10)} depuis le registre mis a jour : ` +
            `${c.ancien} -> ${c.ligne.montant.toFixed(3)} DT, n de facture ${c.ligne.numero}. ` +
            'Detail de TVA non disponible dans le classeur.',
        },
      })
      console.log(`  corrigee : ${c.ligne.expedition} -> ${c.ligne.montant.toFixed(3)} DT`)
    }

    // ---- Creations ----
    for (const a of aCreer) {
      const carrierId = transporteurs.get(a.ligne.transporteur.toUpperCase())
      if (!carrierId) {
        console.log(`  SAUTEE ${a.ligne.expedition} : transporteur « ${a.ligne.transporteur} » inconnu`)
        continue
      }
      if (!a.vente) {
        console.log(`  SAUTEE ${a.ligne.expedition} : aucune vente resolue, donc aucune date`)
        continue
      }

      const input: TransportInvoiceInput = {
        carrierId,
        carrierReference: a.ligne.numero,
        date: a.vente.date.toISOString().slice(0, 10),
        dueDate: '',
        shipmentRef: a.ligne.expedition,
        invoiceId: a.vente.id,
        currencyCode: 'TND',
        paymentTerms: '',
        transportLabel: 'Transport et transit',
        transportAmount: a.ligne.montant.toFixed(3),
        transitLabel: 'Transit et douane',
        transitAmount: '0',
        otherFeesLabel: 'Autres frais',
        otherFeesAmount: '0',
        vatMode: 'NONE',
        vatRate: '0',
        stampDutyLabel: 'Timbre fiscal',
        stampDutyAmount: '0',
        notes:
          `Importe du registre transport du classeur 2026 (mise a jour). Expedition : ${a.ligne.expedition}. ` +
          `Date reprise de la vente couverte (${a.vente.number}), le registre ne la donne pas. ` +
          'Detail de TVA non disponible dans le classeur.',
      }

      const { scalars, totals } = buildTransportInvoiceData(input)
      if (Math.abs(Number(totals.netToPay.toFixed(3)) - a.ligne.montant) > 0.001) {
        throw new Error(`${a.ligne.expedition} : net ${totals.netToPay.toFixed(3)} != ${a.ligne.montant}`)
      }

      await prisma.transportInvoice.create({
        data: {
          ...scalars,
          number: `TRP-2026-${a.ligne.numero}`,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          paidAmount: '0.000',
        },
      })
      console.log(`  creee : ${a.ligne.expedition} ${a.ligne.montant.toFixed(3)} DT`)
    }

    // ---- Controle final ----
    const apres = await prisma.transportInvoice.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { netToPay: true },
      _count: true,
    })
    const somme = round(apres._sum.netToPay, 3)
    console.log(`\nEn base : ${apres._count} factures, ${somme.toFixed(3)} DT`)
    console.log(`Registre : ${REGISTRE.length} lignes, ${total.toFixed(3)} DT`)
    // Attendu = registre + la precision supplementaire conservee sur les
    // lignes relevees a deux decimales.
    const attendu = round(dec(total).plus(ecartsToleres), 3)
    const ecart = round(dec(somme).minus(attendu), 3)
    console.log(`Attendu  : ${attendu.toFixed(3)} DT  (registre + ${round(ecartsToleres, 3).toFixed(3)} d'arrondi conserve)`)
    console.log(
      ecart.isZero()
        ? 'Concordance exacte.'
        : `ECART RESTANT : ${ecart.toFixed(3)} DT — verifiez les lignes signalees ci-dessus.`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
