import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { dec, round } from '../src/lib/money'

/**
 * Rend l'historique de stock coherent avec les quantites, en inscrivant le
 * STOCK D'OUVERTURE la ou il manque.
 *
 * LE PROBLEME. La base locale du poste a ete creee en repliquant le
 * referentiel — les produits AVEC leur quantite en stock — mais pas
 * l'historique des mouvements. Resultat : la quantite est juste, alors que la
 * somme des mouvements ne la retrouve pas. Sur la base cloud, ou l'historique
 * est complet, l'ecart est nul et ce script ne fait rien.
 *
 * CE QU'IL FAIT. Pour chaque produit dont la quantite ne correspond pas a la
 * somme de ses mouvements, il inscrit UN mouvement d'ouverture, date d'avant
 * tous les autres, du montant exact de l'ecart. La quantite en stock n'est PAS
 * modifiee : elle est deja juste, c'est l'explication qui manquait.
 *
 * POURQUOI PAS `applyStockMovement`. Cette fonction applique le delta a la
 * quantite — elle doublerait le stock. Ici on ecrit la ligne d'historique
 * seule, avec le « stock apres » qui la relie proprement au premier mouvement
 * suivant.
 *
 * IDEMPOTENT : un produit qui a deja son mouvement d'ouverture a un ecart nul,
 * donc il est ignore au passage suivant.
 *
 * USAGE
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/reparer-historique-stock.ts
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/reparer-historique-stock.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

/** Reference du mouvement d'ouverture : reconnaissable dans l'historique. */
const REFERENCE = 'STOCK OUVERTURE'

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const produits = await prisma.product.findMany({
      select: { id: true, designation: true, unit: true, stockQuantity: true, trackStock: true },
      orderBy: { designation: 'asc' },
    })

    let corriges = 0

    for (const p of produits) {
      if (!p.trackStock) continue

      const mouvements = await prisma.stockMovement.findMany({
        where: { productId: p.id },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        select: { type: true, quantity: true, date: true },
      })

      const entrees = ['PURCHASE_IN', 'ADJUST_IN', 'CUSTOMER_RETURN']
      const somme = mouvements.reduce(
        (acc, m) => acc.plus(dec(m.quantity).times(entrees.includes(m.type) ? 1 : -1)),
        dec(0),
      )
      const ecart = round(dec(p.stockQuantity).minus(somme), 3)

      if (ecart.isZero()) {
        console.log(`  OK      ${p.designation.slice(0, 26).padEnd(28)} historique coherent`)
        continue
      }

      // La date d'ouverture precede le premier mouvement connu ; a defaut, le
      // 1er janvier de l'annee du plus ancien document.
      const premier = mouvements[0]?.date
      const ouverture = premier
        ? new Date(Date.UTC(premier.getUTCFullYear(), 0, 1))
        : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))

      const type = ecart.greaterThan(0) ? 'ADJUST_IN' : 'ADJUST_OUT'
      console.log(
        `  ECART   ${p.designation.slice(0, 26).padEnd(28)} ${ecart.toFixed(3)} ${p.unit} ` +
          `-> ${type} au ${ouverture.toISOString().slice(0, 10)}`,
      )

      if (ECRIRE) {
        await prisma.stockMovement.create({
          data: {
            productId: p.id,
            type,
            quantity: ecart.abs().toFixed(3),
            // « Stock apres » = l'ecart lui-meme : c'est l'etat du stock avant
            // le premier mouvement enregistre, donc le point de depart auquel
            // les « stock apres » suivants se raccordent.
            stockAfter: ecart.toFixed(3),
            date: ouverture,
            referenceType: 'MANUAL',
            reference: REFERENCE,
            note:
              "Stock d'ouverture, inscrit pour rendre l'historique coherent avec la " +
              'quantite en stock. Correspond aux mouvements anterieurs a la reprise ' +
              "de l'historique sur ce poste. La quantite en stock n'a pas ete modifiee.",
          },
        })
        corriges += 1
      }
    }

    if (!ECRIRE) {
      console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
      return
    }

    console.log(`\n${corriges} mouvement(s) d'ouverture inscrit(s).`)

    // Controle : plus aucun ecart ne doit subsister.
    let restants = 0
    for (const p of await prisma.product.findMany({
      where: { trackStock: true },
      select: { id: true, designation: true, stockQuantity: true },
    })) {
      const mouvements = await prisma.stockMovement.findMany({
        where: { productId: p.id },
        select: { type: true, quantity: true },
      })
      const entrees = ['PURCHASE_IN', 'ADJUST_IN', 'CUSTOMER_RETURN']
      const somme = mouvements.reduce(
        (acc, m) => acc.plus(dec(m.quantity).times(entrees.includes(m.type) ? 1 : -1)),
        dec(0),
      )
      if (!round(dec(p.stockQuantity).minus(somme), 3).isZero()) {
        console.log(`  ECART RESTANT : ${p.designation}`)
        restants += 1
      }
    }
    if (restants > 0) throw new Error(`${restants} produit(s) restent incoherents.`)
    console.log('Controle : quantite = somme des mouvements sur tous les produits suivis.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
