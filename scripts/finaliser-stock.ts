import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { dec, round } from '../src/lib/money'

/**
 * Finalise l'etat du stock et les fiches produit, en n'ecrivant QUE ce qui se
 * deduit des documents enregistres. Rien n'est estime ni invente.
 *
 * TROIS OPERATIONS
 *
 * 1. LES ACHATS RETROUVENT LEURS MOUVEMENTS. Neuf factures d'achat, saisies
 *    dans la version cloud avant la reprise, portaient des lignes produit sans
 *    aucun mouvement de stock sur ce poste : leur fiche affichait « aucun
 *    mouvement ». Leur effet etait noye dans un ajustement d'ouverture global.
 *    Chaque ligne recoit son mouvement, a la date de sa facture, et
 *    l'ajustement d'ouverture correspondant est supprime. La somme est
 *    verifiee AVANT toute ecriture : ce qui est cree doit valoir exactement ce
 *    qui est supprime, sinon rien ne se fait.
 *
 * 2. LE « STOCK APRES » DEVIENT UN VRAI CUMUL CHRONOLOGIQUE. Cette colonne
 *    avait ete calculee dans l'ordre d'INSERTION des mouvements, pas dans
 *    l'ordre des DATES. Elle est recalculee produit par produit, du plus ancien
 *    au plus recent, jusqu'a retomber sur la quantite en stock actuelle.
 *
 * 3. PRIX D'ACHAT DE VALORISATION. `purchasePriceTnd` sert a valoriser le
 *    stock ; il valait 0, donc le stock etait valorise a zero. Il recoit le
 *    prix moyen pondere REEL des lignes d'achat du produit. C'est une mesure,
 *    pas une estimation.
 *
 * CE QUE CE SCRIPT NE TOUCHE JAMAIS : les quantites en stock (elles sont
 * justes), le prix de vente catalogue, le stock minimum, le poids unitaire,
 * les donnees douanieres. Ces cinq-la relevent d'une decision ou d'une
 * information que les documents ne portent pas.
 *
 * USAGE
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/finaliser-stock.ts
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/finaliser-stock.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

/** Reference des ajustements d'ouverture poses par reparer-historique-stock. */
const REFERENCE_OUVERTURE = 'STOCK OUVERTURE'

const ENTREES = ['PURCHASE_IN', 'ADJUST_IN', 'CUSTOMER_RETURN']

function signe(type: string) {
  return ENTREES.includes(type) ? 1 : -1
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    // -----------------------------------------------------------------------
    // 1. Achats dont les lignes produit n'ont aucun mouvement
    // -----------------------------------------------------------------------
    const orphelines = await prisma.purchaseItem.findMany({
      where: {
        productId: { not: null },
        purchase: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
      },
      select: {
        quantity: true,
        productId: true,
        purchase: { select: { id: true, number: true, date: true } },
        product: { select: { reference: true, trackStock: true } },
      },
      orderBy: { purchase: { date: 'asc' } },
    })

    const dejaBouges = new Set(
      (
        await prisma.stockMovement.findMany({
          where: { referenceType: 'PURCHASE' },
          select: { referenceId: true, productId: true },
        })
      ).map((m) => `${m.referenceId}|${m.productId}`),
    )

    const aCreer = orphelines.filter(
      (l) => l.product?.trackStock && !dejaBouges.has(`${l.purchase.id}|${l.productId}`),
    )

    // Ajustements d'ouverture a remplacer, par produit.
    const ouvertures = await prisma.stockMovement.findMany({
      where: { referenceType: 'MANUAL', reference: REFERENCE_OUVERTURE },
      select: { id: true, productId: true, type: true, quantity: true },
    })

    console.log(`1. Mouvements d'achat manquants : ${aCreer.length}`)
    const parProduit = new Map<string, { creer: ReturnType<typeof dec>; ouverture: ReturnType<typeof dec> }>()
    for (const l of aCreer) {
      const e = parProduit.get(l.productId!) ?? { creer: dec(0), ouverture: dec(0) }
      e.creer = e.creer.plus(dec(l.quantity))
      parProduit.set(l.productId!, e)
      console.log(
        `   ${l.purchase.number.padEnd(20)} ${l.purchase.date.toISOString().slice(0, 10)}  ` +
          `${String(l.product?.reference).padEnd(12)} ${round(l.quantity, 3).toFixed(3).padStart(11)}`,
      )
    }
    for (const o of ouvertures) {
      const e = parProduit.get(o.productId) ?? { creer: dec(0), ouverture: dec(0) }
      e.ouverture = e.ouverture.plus(dec(o.quantity).times(signe(o.type)))
      parProduit.set(o.productId, e)
    }

    // Controle : creer et supprimer doivent s'annuler, produit par produit.
    let equilibre = true
    console.log(`\n   Ajustements d'ouverture a retirer : ${ouvertures.length}`)
    for (const [productId, e] of parProduit) {
      const p = await prisma.product.findUnique({
        where: { id: productId },
        select: { reference: true },
      })
      const ecart = round(e.creer.minus(e.ouverture), 3)
      if (!ecart.isZero()) equilibre = false
      console.log(
        `   ${String(p?.reference).padEnd(14)} a creer ${e.creer.toFixed(3).padStart(11)}  ` +
          `ouverture ${e.ouverture.toFixed(3).padStart(11)}  ${ecart.isZero() ? 'EQUILIBRE' : `ECART ${ecart.toFixed(3)}`}`,
      )
    }
    if (!equilibre) {
      throw new Error(
        "Les mouvements a creer ne compensent pas exactement les ajustements d'ouverture. " +
          'Rien ne sera ecrit : les quantites en stock doivent rester inchangees.',
      )
    }

    // -----------------------------------------------------------------------
    // 3. Prix d'achat moyen pondere (calcule avant d'ecrire, pour l'afficher)
    // -----------------------------------------------------------------------
    const prix = await prisma.$queryRawUnsafe<Array<{ id: string; ref: string; pmp: string | null }>>(`
      select pr."id" as id, pr."reference" as ref,
             (sum(i."lineTotal") / nullif(sum(i."quantity"), 0))::text as pmp
      from "purchase_items" i
      join "products" pr on pr."id" = i."productId"
      join "purchases" p on p."id" = i."purchaseId"
      where p."status" not in ('DRAFT', 'CANCELLED')
      group by 1, 2
      order by 2
    `)

    console.log('\n3. Prix de valorisation (moyenne ponderee des achats reels)')
    for (const x of prix) {
      const actuel = await prisma.product.findUnique({
        where: { id: x.id },
        select: { purchasePriceTnd: true },
      })
      console.log(
        `   ${x.ref.padEnd(14)} ${round(actuel?.purchasePriceTnd ?? 0, 4).toFixed(4).padStart(10)}` +
          `  ->  ${round(x.pmp ?? 0, 4).toFixed(4)} DT/unite`,
      )
    }

    if (!ECRIRE) {
      console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
      return
    }

    // -----------------------------------------------------------------------
    // Ecriture
    // -----------------------------------------------------------------------
    await prisma.$transaction(
      async (tx) => {
        // 1a. Les mouvements d'achat manquants. Insertion DIRECTE, sans passer
        // par applyStockMovement : la quantite en stock est deja juste, il ne
        // faut surtout pas lui appliquer le delta une seconde fois.
        for (const l of aCreer) {
          await tx.stockMovement.create({
            data: {
              productId: l.productId!,
              type: 'PURCHASE_IN',
              quantity: round(l.quantity, 3).toFixed(3),
              // Provisoire : recalcule juste apres, dans l'ordre des dates.
              stockAfter: '0.000',
              date: l.purchase.date,
              referenceType: 'PURCHASE',
              referenceId: l.purchase.id,
              reference: l.purchase.number,
              note: `Achat ${l.purchase.number} (mouvement reconstitue depuis la ligne de facture)`,
            },
          })
        }

        // 1b. Les ajustements d'ouverture n'ont plus de raison d'etre.
        if (ouvertures.length > 0) {
          await tx.stockMovement.deleteMany({ where: { id: { in: ouvertures.map((o) => o.id) } } })
        }

        // 2. « Stock apres » recalcule comme un vrai cumul chronologique.
        const produits = await tx.product.findMany({
          where: { trackStock: true },
          select: { id: true, reference: true, stockQuantity: true },
        })

        for (const p of produits) {
          const mouvements = await tx.stockMovement.findMany({
            where: { productId: p.id },
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, type: true, quantity: true, date: true, reference: true },
          })
          // Tri VOLONTAIREMENT deterministe : a date egale les entrees passent
          // d'abord (on ne sort pas une marchandise qui entre le meme jour),
          // puis on departage par numero de document puis par identifiant.
          // Sans ce dernier critere, deux bases portant les memes mouvements
          // produiraient des cumuls intermediaires differents selon l'ordre de
          // creation des lignes.
          mouvements.sort(
            (a, b) =>
              a.date.getTime() - b.date.getTime() ||
              signe(b.type) - signe(a.type) ||
              a.reference.localeCompare(b.reference) ||
              a.id.localeCompare(b.id),
          )

          let cumul = dec(0)
          for (const m of mouvements) {
            cumul = cumul.plus(dec(m.quantity).times(signe(m.type)))
            await tx.stockMovement.update({
              where: { id: m.id },
              data: { stockAfter: round(cumul, 3).toFixed(3) },
            })
          }

          const ecart = round(dec(p.stockQuantity).minus(cumul), 3)
          if (!ecart.isZero()) {
            throw new Error(
              `${p.reference} : le cumul des mouvements (${round(cumul, 3).toFixed(3)}) ne retombe ` +
                `pas sur la quantite en stock (${round(p.stockQuantity, 3).toFixed(3)}). Annulation.`,
            )
          }
        }

        // 3. Prix de valorisation.
        for (const x of prix) {
          if (x.pmp === null) continue
          await tx.product.update({
            where: { id: x.id },
            data: { purchasePriceTnd: round(x.pmp, 4).toFixed(4) },
          })
        }
      },
      { timeout: 120000, maxWait: 20000 },
    )

    console.log(`\n${aCreer.length} mouvement(s) d'achat reconstitue(s).`)
    console.log(`${ouvertures.length} ajustement(s) d'ouverture retire(s).`)
    console.log(`${prix.length} prix de valorisation mis a jour.`)

    // -----------------------------------------------------------------------
    // Controle final
    // -----------------------------------------------------------------------
    console.log('\nControle :')
    for (const p of await prisma.product.findMany({
      orderBy: { reference: 'asc' },
      select: {
        id: true, reference: true, unit: true, stockQuantity: true,
        purchasePriceTnd: true, trackStock: true,
      },
    })) {
      if (!p.trackStock) continue
      const mouvements = await prisma.stockMovement.findMany({
        where: { productId: p.id },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        select: { type: true, quantity: true, stockAfter: true },
      })
      const cumul = mouvements.reduce(
        (acc, m) => acc.plus(dec(m.quantity).times(signe(m.type))),
        dec(0),
      )
      const dernier = mouvements.length > 0 ? mouvements[mouvements.length - 1].stockAfter : 0
      const valeur = round(dec(p.stockQuantity).times(p.purchasePriceTnd), 3)
      console.log(
        `  ${p.reference.padEnd(14)} ${round(p.stockQuantity, 3).toFixed(3).padStart(11)} ${p.unit}` +
          `  cumul ${round(cumul, 3).toFixed(3).padStart(11)}` +
          `  dernier stock apres ${round(dernier, 3).toFixed(3).padStart(11)}` +
          `  valeur ${valeur.toFixed(3).padStart(12)} DT  (${mouvements.length} mvts)`,
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
