import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Replique le referentiel et les achats de Supabase vers la base locale.
 *
 * Pourquoi pas `pg_dump` / `pg_restore` : Supabase restreint les operations
 * privilegiees, et un transfert entre versions majeures differentes (Supabase
 * en 15/16, la base locale en 18) ajoute un risque inutile. Une copie ligne a
 * ligne des seules tables concernees est plus sure et verifiable.
 *
 * Ce qui est copie : categories, produits, fournisseurs, et les factures
 * d'achat avec leurs lignes et reglements — le travail deja saisi.
 *
 * Ce qui n'est PAS copie : les utilisateurs (mots de passe propres a chaque
 * poste), les parametres societe et les sequences (crees par l'amorcage), les
 * journaux d'audit (l'historique appartient a la base ou il a eu lieu).
 *
 * Idempotent : une ligne dont l'identifiant existe deja est ignoree.
 *
 * USAGE
 *   npx tsx scripts/repliquer-referentiel.ts            (simulation)
 *   npx tsx scripts/repliquer-referentiel.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

function clientLocal() {
  const url = process.env.MZ_LOCAL_URL
  if (!url) {
    throw new Error(
      'MZ_LOCAL_URL manquant. Exemple :\n' +
        '  MZ_LOCAL_URL="postgresql://mzexport:MOTDEPASSE@127.0.0.1:5433/mzexport"',
    )
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}

function clientSource() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DIRECT_URL / DATABASE_URL manquant (base source).')
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}

async function main() {
  console.log(`Mode : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const source = clientSource()
  const cible = clientLocal()

  try {
    let total = 0

    // --- Categories, puis produits (les produits y font reference) ---
    const categories = await source.category.findMany()
    const produits = await source.product.findMany()
    const fournisseurs = await source.supplier.findMany()
    const achats = await source.purchase.findMany({
      include: { items: true, payments: true },
      orderBy: { date: 'asc' },
    })

    console.log(`source : ${categories.length} categories, ${produits.length} produits, `)
    console.log(`         ${fournisseurs.length} fournisseurs, ${achats.length} achats\n`)

    for (const categorie of categories) {
      const existe = await cible.category.findUnique({ where: { id: categorie.id } })
      if (existe) continue
      if (ECRIRE) await cible.category.create({ data: categorie })
      console.log(`  categorie   ${categorie.name}`)
      total += 1
    }

    for (const produit of produits) {
      const existe = await cible.product.findUnique({ where: { id: produit.id } })
      if (existe) {
        console.log(`  produit     ${produit.reference} (deja present)`)
        continue
      }
      if (ECRIRE) await cible.product.create({ data: produit })
      console.log(`  produit     ${produit.reference} — ${produit.designation}`)
      total += 1
    }

    for (const fournisseur of fournisseurs) {
      const existe = await cible.supplier.findUnique({ where: { id: fournisseur.id } })
      if (existe) {
        console.log(`  fournisseur ${fournisseur.code} (deja present)`)
        continue
      }
      if (ECRIRE) await cible.supplier.create({ data: fournisseur })
      console.log(`  fournisseur ${fournisseur.code} — ${fournisseur.companyName}`)
      total += 1
    }

    for (const achat of achats) {
      const existe = await cible.purchase.findUnique({ where: { id: achat.id } })
      if (existe) {
        console.log(`  achat       ${achat.number} (deja present)`)
        continue
      }
      const { items, payments, ...entete } = achat
      if (ECRIRE) {
        await cible.$transaction(async (tx) => {
          await tx.purchase.create({
            data: {
              ...entete,
              // `createdById` pointe vers un utilisateur de la base source,
              // absent ici : on le detache plutot que de casser la cle.
              createdById: null,
              items: { create: items.map(({ purchaseId: _p, ...ligne }) => ligne) },
            },
          })
          for (const reglement of payments) {
            const { purchaseId: _q, createdById: _c, ...reste } = reglement
            await tx.purchasePayment.create({ data: { ...reste, purchaseId: achat.id } })
          }
        })
      }
      console.log(
        `  achat       ${achat.number} — ${achat.netToPay} ${achat.currencyCode}` +
          ` (${items.length} ligne(s), ${payments.length} reglement(s))`,
      )
      total += 1
    }

    console.log(`\n${ECRIRE ? 'Copies' : 'A copier'} : ${total} enregistrement(s)`)
    if (!ECRIRE) console.log('Simulation : aucune ecriture. Relancez avec --ecrire.')
  } finally {
    await source.$disconnect()
    await cible.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
