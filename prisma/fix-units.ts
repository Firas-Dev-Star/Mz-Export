import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { dec, round } from '../src/lib/money'

/**
 * Correction du referentiel : la PIECE est l'unite de compte.
 *
 * CE QUI ETAIT FAUX
 * -----------------
 * L'import initial traitait les quantites des factures fournisseurs comme des
 * kilogrammes, et convertissait la facture SAFER (3 206 pieces -> 2 083,875 kg)
 * pour homogeneiser. C'etait une erreur : toutes les factures comptent en
 * PIECES. La preuve est arithmetique — sans aucune conversion, chaque total
 * tombe juste :
 *     ARSENAY 15-L : 16 480 x 6,000 = 98 880,000
 *     SAFER  0238  :  3 206 x 5,000 = 16 030,000
 *     SAHAFA 475   :    150 x 6,000 =    900,000
 *
 * CE QUE FAIT CE SCRIPT
 * ---------------------
 *  1. Passe les produits en unite PCS.
 *  2. Retablit la ligne SAFER a 3 206 pieces a 5,000 TND (total inchange).
 *  3. Fusionne FOUTA-2-2 dans FOUTA-COTON : meme article en stock.
 *  4. Recalcule chaque stock comme la SOMME DES MOUVEMENTS, jamais autrement.
 *
 * LE POIDS RESTE UNE OBSERVATION
 * ------------------------------
 * Le kilogramme ne disparait pas : il est calcule a l'affichage
 * (quantite x poids unitaire) comme information interne. Il ne sert ni de
 * base de facturation ni de compteur de stock.
 *
 * NOTE SUR LA FUSION : FOUTA 2/2 etait facturee 13,850 TND contre 6,000 pour
 * la fouta standard. Les deux articles rejoignent le meme compteur de stock
 * conformement a votre decision ; les prix restent ceux des factures, qui
 * seules font foi.
 *
 * IDEMPOTENT : relancer le script ne produit aucun changement supplementaire.
 *
 * Lancement :  npx tsx prisma/fix-units.ts
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

/** Poids moyen d'une fouta, releve dans le classeur MZ 2026 (colonne poids/u). */
const POIDS_FOUTA_KG = '0.650'

async function main() {
  // ---------------------------------------------------------------------
  // 1. Unite = PIECE, et poids unitaire renseigne pour l'observation
  // ---------------------------------------------------------------------
  const fouta = await prisma.product.findUnique({ where: { reference: 'FOUTA-COTON' } })
  if (!fouta) throw new Error('Produit FOUTA-COTON introuvable.')

  await prisma.product.update({
    where: { id: fouta.id },
    data: { unit: 'PCS', unitWeightKg: POIDS_FOUTA_KG },
  })
  console.log(`unite         FOUTA-COTON -> PCS (poids unitaire ${POIDS_FOUTA_KG} kg)`)

  // ---------------------------------------------------------------------
  // 2. Ligne SAFER : retour aux 3 206 pieces facturees
  // ---------------------------------------------------------------------
  const saferItems = await prisma.purchaseItem.findMany({
    where: { purchase: { number: 'ACH-2026-0238' } },
    select: { id: true, quantity: true, productId: true, purchaseId: true },
  })

  for (const item of saferItems) {
    if (dec(item.quantity).equals(dec('3206'))) {
      console.log('ligne SAFER   deja en pieces, rien a faire')
      continue
    }

    await prisma.purchaseItem.update({
      where: { id: item.id },
      data: {
        designation: 'FOUTA ARTISANALE',
        unit: 'PCS',
        quantity: '3206.000',
        unitPrice: '5.0000',
        lineTotal: '16030.000',
      },
    })

    // Le mouvement de stock doit refleter la meme quantite : sans cela,
    // l'invariant « stock = somme des mouvements » ne tiendrait plus.
    await prisma.stockMovement.updateMany({
      where: { referenceId: item.purchaseId, productId: item.productId ?? undefined },
      data: { quantity: '3206.000', note: 'Import facture 0238 — 3 206 pieces' },
    })

    console.log('ligne SAFER   2 083,875 KG -> 3 206 PCS (total inchange : 16 030,000 TND)')
  }

  // ---------------------------------------------------------------------
  // 3. Fusion FOUTA-2-2 dans FOUTA-COTON
  // ---------------------------------------------------------------------
  const fouta22 = await prisma.product.findUnique({ where: { reference: 'FOUTA-2-2' } })

  if (fouta22) {
    // Les lignes d'achat et les mouvements changent de produit de rattachement.
    // Les montants ne bougent pas : seul le compteur de stock est unifie.
    const items = await prisma.purchaseItem.updateMany({
      where: { productId: fouta22.id },
      data: { productId: fouta.id },
    })
    const moves = await prisma.stockMovement.updateMany({
      where: { productId: fouta22.id },
      data: { productId: fouta.id },
    })
    await prisma.invoiceItem.updateMany({
      where: { productId: fouta22.id },
      data: { productId: fouta.id },
    })

    await prisma.product.delete({ where: { id: fouta22.id } })
    console.log(
      `fusion        FOUTA-2-2 -> FOUTA-COTON (${items.count} ligne(s), ${moves.count} mouvement(s))`,
    )
  } else {
    console.log('fusion        FOUTA-2-2 deja fusionne')
  }

  // ---------------------------------------------------------------------
  // 4. Stock = somme des mouvements
  // ---------------------------------------------------------------------
  // On ne « corrige » jamais un stock a la main : on le recalcule a partir des
  // mouvements, qui sont la seule source de verite du projet.
  const products = await prisma.product.findMany({
    where: { trackStock: true },
    select: { id: true, reference: true, unit: true, unitWeightKg: true },
  })

  console.log('\nStock recalcule depuis les mouvements :')
  for (const product of products) {
    const movements = await prisma.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, type: true, quantity: true },
    })

    let running = dec(0)
    for (const m of movements) {
      const signe = m.type.endsWith('_OUT') || m.type === 'SUPPLIER_RETURN' ? -1 : 1
      running = round(running.plus(dec(m.quantity).times(signe)), 3)
      // `stockAfter` est une piste d'audit : il doit rester coherent.
      await prisma.stockMovement.update({
        where: { id: m.id },
        data: { stockAfter: running.toFixed(3) },
      })
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { stockQuantity: running.toFixed(3) },
    })

    const poidsKg = round(running.times(dec(product.unitWeightKg)), 3)
    const observation = poidsKg.greaterThan(0) ? `  (~ ${poidsKg.toFixed(3)} kg)` : ''
    console.log(
      `  ${product.reference.padEnd(14)} ${running.toFixed(3).padStart(12)} ${product.unit}${observation}`,
    )
  }

  console.log('\nLes factures comptent en pieces. Le poids est une observation interne.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
