import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { dec, round } from '../src/lib/money'

/**
 * Recalcule le poids unitaire des produits d'apres les factures de vente.
 *
 * D'OU VIENT LE CHIFFRE. Le poids net est saisi sur l'EN-TETE de la facture de
 * vente ; les quantites sont sur les lignes. Le poids unitaire observe est donc
 * le rapport « somme des poids nets / somme des pieces expediees ». C'est une
 * mesure prise sur les expeditions reelles, pas une estimation.
 *
 * PRUDENCE ASSUMEE : seules les factures dont TOUTES les lignes produit
 * portent le MEME produit sont retenues. Sur une facture melangeant deux
 * articles, le poids de l'en-tete ne peut pas etre attribue a l'un plutot qu'a
 * l'autre — la compter faussrait le resultat des deux.
 *
 * Les factures sans quantite (celles ou le classeur ne donnait que des
 * montants) et celles sans poids sont ignorees : elles n'apprennent rien.
 *
 * Les achats ne portent aucun poids : ils ne peuvent pas servir de controle.
 *
 * A relancer quand de nouvelles factures ont ete saisies : la mesure
 * s'affine avec le volume.
 *
 * USAGE
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/poids-unitaire-observe.ts
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/poids-unitaire-observe.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

interface Ligne {
  productId: string
  reference: string
  actuel: string
  pieces: string
  poids: string
  factures: number
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const lignes = await prisma.$queryRawUnsafe<Ligne[]>(`
      with exploitables as (
        -- Une facture par produit, a condition qu'elle ne porte que celui-la.
        select i."productId",
               v."id" as "invoiceId",
               sum(i."quantity") as pieces,
               max(v."netWeightKg") as poids
        from "invoice_items" i
        join "invoices" v on v."id" = i."invoiceId"
        where i."productId" is not null
          and v."status" <> 'CANCELLED'
          and v."netWeightKg" > 0
        group by 1, 2
        having sum(i."quantity") > 0
           and (select count(distinct i2."productId")
                from "invoice_items" i2
                where i2."invoiceId" = v."id" and i2."productId" is not null) = 1
      )
      select e."productId" as "productId",
             pr."reference" as reference,
             pr."unitWeightKg"::text as actuel,
             sum(e.pieces)::text as pieces,
             sum(e.poids)::text as poids,
             count(*)::int as factures
      from exploitables e
      join "products" pr on pr."id" = e."productId"
      group by 1, 2, 3
      order by 2
    `)

    if (lignes.length === 0) {
      console.log('Aucune facture exploitable : rien a mesurer.')
      return
    }

    const aEcrire: Array<{ id: string; valeur: string }> = []

    for (const l of lignes) {
      const observe = round(dec(l.poids).dividedBy(dec(l.pieces)), 3)
      const actuel = round(l.actuel, 3)
      const ecartKg = round(dec(l.pieces).times(actuel.minus(observe)), 0)

      console.log(`${l.reference}`)
      console.log(`  ${l.factures} facture(s) exploitable(s), ${round(l.pieces, 0).toFixed(0)} pieces, ${round(l.poids, 0).toFixed(0)} kg`)
      console.log(`  fiche ${actuel.toFixed(3)} kg  ->  observe ${observe.toFixed(3)} kg`)
      if (!actuel.equals(observe)) {
        console.log(
          `  le poids de la fiche ${ecartKg.greaterThan(0) ? 'surestime' : 'sous-estime'} ` +
            `le rapprochement de ${ecartKg.abs().toFixed(0)} kg`,
        )
        aEcrire.push({ id: l.productId, valeur: observe.toFixed(3) })
      } else {
        console.log('  deja a jour')
      }
    }

    // Ce que la mesure ne couvre pas : a dire explicitement.
    const muets = await prisma.product.findMany({
      where: { id: { notIn: lignes.map((l) => l.productId) }, isActive: true },
      select: { reference: true, unitWeightKg: true },
      orderBy: { reference: 'asc' },
    })
    if (muets.length > 0) {
      console.log('\nSans mesure possible (aucune facture avec poids ET quantite) :')
      for (const m of muets) {
        console.log(`  ${m.reference.padEnd(14)} reste a ${round(m.unitWeightKg, 3).toFixed(3)} kg`)
      }
    }

    if (!ECRIRE) {
      console.log(`\n${aEcrire.length} fiche(s) a mettre a jour. Simulation : aucune ecriture.`)
      return
    }

    for (const x of aEcrire) {
      await prisma.product.update({ where: { id: x.id }, data: { unitWeightKg: x.valeur } })
    }
    console.log(`\n${aEcrire.length} fiche(s) mise(s) a jour.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
