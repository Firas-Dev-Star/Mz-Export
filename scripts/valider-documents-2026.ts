import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { applyStockMovement } from '../src/lib/stock'
import { deriveStatus } from '../src/lib/invoice-totals'
import { dec, round } from '../src/lib/money'

/**
 * Valide les documents 2026 importes du classeur, et met le stock a jour.
 *
 * POURQUOI UN SCRIPT ET NON LES BOUTONS DE L'APPLICATION. « Valider » dans
 * l'interface RESERVE UN NOUVEAU NUMERO dans la sequence : « FAC 49-2026 »
 * deviendrait « FAC-V-0001 » et la correspondance avec vos factures papier
 * serait perdue. Ce script fait tout le reste du travail de la validation —
 * statut, date de validation, mouvements de stock — en CONSERVANT le numero
 * d'origine. C'est la seule difference.
 *
 * ORDRE DES MOUVEMENTS. Les entrees et les sorties sont appliquees dans
 * l'ordre CHRONOLOGIQUE reel, achats et ventes melanges. La colonne
 * « stock apres » de l'historique raconte donc ce qui s'est vraiment passe,
 * y compris les moments ou vous avez expedie avant d'enregistrer l'achat : le
 * stock y passe negatif. C'est une information, pas une erreur — la lisser en
 * passant tous les achats d'abord donnerait un historique faux.
 *
 * STATUTS. Deduits par la meme regle que l'application (`deriveStatus`) :
 * regle -> PAID, partiellement regle -> PARTIALLY_PAID, echu et non regle ->
 * OVERDUE, sinon CONFIRMED. Aucun statut n'est force.
 *
 * IDEMPOTENT. Un document deja valide est ignore, et un mouvement de stock
 * deja enregistre pour un document n'est jamais recree.
 *
 * USAGE
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/valider-documents-2026.ts
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/valider-documents-2026.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

interface Mouvement {
  date: Date
  documentId: string
  numero: string
  productId: string
  quantity: string
  type: 'PURCHASE_IN' | 'SALE_OUT'
  referenceType: 'PURCHASE' | 'INVOICE'
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const [achats, transports, ventes] = await Promise.all([
      prisma.purchase.findMany({
        where: { status: 'DRAFT' },
        orderBy: [{ date: 'asc' }, { number: 'asc' }],
        select: {
          id: true, number: true, date: true, dueDate: true, netToPay: true,
          paidAmount: true, currencyCode: true,
          items: { select: { productId: true, quantity: true } },
        },
      }),
      prisma.transportInvoice.findMany({
        where: { status: 'DRAFT' },
        orderBy: [{ date: 'asc' }, { number: 'asc' }],
        select: { id: true, number: true, dueDate: true, netToPay: true, paidAmount: true },
      }),
      prisma.invoice.findMany({
        where: { status: 'DRAFT' },
        orderBy: [{ date: 'asc' }, { number: 'asc' }],
        select: {
          id: true, number: true, date: true, dueDate: true, netToPay: true,
          paidAmount: true, currencyCode: true,
          items: { select: { productId: true, quantity: true } },
        },
      }),
    ])

    console.log(
      `A valider : ${achats.length} achat(s), ${transports.length} transport(s), ${ventes.length} vente(s)\n`,
    )
    if (achats.length + transports.length + ventes.length === 0) {
      console.log('Aucun brouillon. Rien a faire.')
      return
    }

    // ---- Mouvements deja enregistres : on ne les recree jamais ----
    const dejaBouges = new Set(
      (
        await prisma.stockMovement.findMany({
          where: { referenceType: { in: ['PURCHASE', 'INVOICE'] } },
          select: { referenceType: true, referenceId: true },
        })
      ).map((m) => `${m.referenceType}|${m.referenceId}`),
    )

    // ---- Chronologie des mouvements ----
    const mouvements: Mouvement[] = []
    for (const a of achats) {
      if (dejaBouges.has(`PURCHASE|${a.id}`)) continue
      for (const i of a.items) {
        if (!i.productId) continue
        mouvements.push({
          date: a.date, documentId: a.id, numero: a.number, productId: i.productId,
          quantity: i.quantity.toFixed(3), type: 'PURCHASE_IN', referenceType: 'PURCHASE',
        })
      }
    }
    for (const v of ventes) {
      if (dejaBouges.has(`INVOICE|${v.id}`)) continue
      for (const i of v.items) {
        if (!i.productId) continue
        mouvements.push({
          date: v.date, documentId: v.id, numero: v.number, productId: i.productId,
          quantity: i.quantity.toFixed(3), type: 'SALE_OUT', referenceType: 'INVOICE',
        })
      }
    }
    // A date egale, l'entree passe avant la sortie : on ne peut pas expedier
    // une marchandise qui n'est pas encore entree le meme jour.
    mouvements.sort(
      (x, y) =>
        x.date.getTime() - y.date.getTime() ||
        (x.type === 'PURCHASE_IN' ? -1 : 1) - (y.type === 'PURCHASE_IN' ? -1 : 1),
    )

    // ---- Controle : ou le stock passe-t-il, et ou finit-il ? ----
    const produits = await prisma.product.findMany({
      where: { id: { in: [...new Set(mouvements.map((m) => m.productId))] } },
      select: { id: true, designation: true, unit: true, stockQuantity: true, trackStock: true },
    })
    const soldes = new Map(produits.map((p) => [p.id, dec(p.stockQuantity)]))
    const minima = new Map<string, { valeur: ReturnType<typeof dec>; quand: string }>()

    for (const m of mouvements) {
      const solde = (soldes.get(m.productId) ?? dec(0)).plus(
        dec(m.quantity).times(m.type === 'PURCHASE_IN' ? 1 : -1),
      )
      soldes.set(m.productId, solde)
      const min = minima.get(m.productId)
      if (!min || solde.lessThan(min.valeur)) {
        minima.set(m.productId, {
          valeur: solde,
          quand: `${m.date.toISOString().slice(0, 10)} ${m.numero}`,
        })
      }
    }

    console.log(`Stock : ${mouvements.length} mouvement(s) a enregistrer`)
    for (const p of produits) {
      if (!p.trackStock) {
        console.log(`  ${p.designation} : non suivi en stock, aucun mouvement.`)
        continue
      }
      const min = minima.get(p.id)
      console.log(
        `  ${p.designation}\n` +
          `    depart ${round(p.stockQuantity, 3).toFixed(3)} ${p.unit}` +
          `  ->  arrivee ${round(soldes.get(p.id) ?? 0, 3).toFixed(3)} ${p.unit}`,
      )
      if (min && min.valeur.lessThan(0)) {
        console.log(
          `    ATTENTION : passe a ${min.valeur.toFixed(3)} le ${min.quand} ` +
            `(expedition anterieure a l'enregistrement de l'achat).`,
        )
      }
    }

    if (!ECRIRE) {
      console.log('\n--- Statuts qui seront appliques ---')
      const resume = new Map<string, number>()
      const compter = (s: string) => resume.set(s, (resume.get(s) ?? 0) + 1)
      for (const a of achats) {
        compter(`achat ${deriveStatus({ current: 'CONFIRMED', netToPay: a.netToPay, paidAmount: a.paidAmount, dueDate: a.dueDate })}`)
      }
      for (const t of transports) {
        compter(`transport ${deriveStatus({ current: 'CONFIRMED', netToPay: t.netToPay, paidAmount: t.paidAmount, dueDate: t.dueDate })}`)
      }
      for (const v of ventes) {
        compter(`vente ${deriveStatus({ current: 'CONFIRMED', netToPay: v.netToPay, paidAmount: v.paidAmount, dueDate: v.dueDate })}`)
      }
      for (const [k, n] of [...resume.entries()].sort()) console.log(`  ${k.padEnd(26)} ${n}`)
      console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
      return
    }

    // ---- Ecriture : statuts d'abord, mouvements ensuite ----
    const maintenant = new Date()
    let n = 0

    for (const a of achats) {
      const statut = deriveStatus({
        current: 'CONFIRMED', netToPay: a.netToPay, paidAmount: a.paidAmount, dueDate: a.dueDate,
      })
      await prisma.purchase.update({
        where: { id: a.id },
        data: { status: statut, confirmedAt: maintenant },
      })
      n += 1
    }
    console.log(`\n${n} achat(s) valides.`)

    n = 0
    for (const t of transports) {
      const statut = deriveStatus({
        current: 'CONFIRMED', netToPay: t.netToPay, paidAmount: t.paidAmount, dueDate: t.dueDate,
      })
      await prisma.transportInvoice.update({
        where: { id: t.id },
        data: { status: statut, confirmedAt: maintenant },
      })
      n += 1
    }
    console.log(`${n} facture(s) de transport validees.`)

    n = 0
    for (const v of ventes) {
      const statut = deriveStatus({
        current: 'CONFIRMED', netToPay: v.netToPay, paidAmount: v.paidAmount, dueDate: v.dueDate,
      })
      await prisma.invoice.update({
        where: { id: v.id },
        data: { status: statut, confirmedAt: maintenant },
      })
      n += 1
    }
    console.log(`${n} vente(s) validees.`)

    // Les mouvements passent un par un, dans l'ordre chronologique, chacun dans
    // sa transaction : `applyStockMovement` verrouille la ligne produit et
    // calcule le « stock apres » a partir de l'etat courant.
    let bouges = 0
    for (const m of mouvements) {
      await prisma.$transaction(async (tx) => {
        await applyStockMovement(tx, {
          productId: m.productId,
          type: m.type,
          quantity: m.quantity,
          date: m.date,
          referenceType: m.referenceType,
          referenceId: m.documentId,
          reference: m.numero,
          note:
            m.type === 'PURCHASE_IN'
              ? `Achat ${m.numero} (reprise du classeur 2026)`
              : `Vente ${m.numero} (reprise du classeur 2026)`,
          userId: null,
        })
      })
      bouges += 1
    }
    console.log(`${bouges} mouvement(s) de stock enregistres.`)

    // ---- Verification finale ----
    const apres = await prisma.product.findMany({
      where: { id: { in: [...new Set(mouvements.map((m) => m.productId))] } },
      select: { designation: true, unit: true, stockQuantity: true },
    })
    console.log('\nStock final :')
    for (const p of apres) {
      console.log(`  ${p.designation} : ${round(p.stockQuantity, 3).toFixed(3)} ${p.unit}`)
    }

    const restants = await Promise.all([
      prisma.purchase.count({ where: { status: 'DRAFT' } }),
      prisma.transportInvoice.count({ where: { status: 'DRAFT' } }),
      prisma.invoice.count({ where: { status: 'DRAFT' } }),
    ])
    console.log(
      `Brouillons restants : ${restants[0]} achat(s), ${restants[1]} transport(s), ${restants[2]} vente(s).`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
