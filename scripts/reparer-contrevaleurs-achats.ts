import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Repare les contrevaleurs en dinars des factures d'achat.
 *
 * POURQUOI : les colonnes `exchangeRateTnd` / `netToPayTnd` / `paidAmountTnd` /
 * `balanceDueTnd` ont ete ajoutees par la migration multi-devises, qui a
 * renseigne les achats existants. Mais `buildPurchaseData` ne les ecrivait pas :
 * tout achat cree apres cette migration restait a 0, et sortait donc des
 * totaux consolides du tableau de bord et des etats en dinars.
 *
 * Le code est corrige. Ce script remet les lignes deja enregistrees d'aplomb.
 *
 * UN ACHAT EN DINARS vaut son propre montant : le taux est 1, la contrevaleur
 * est le montant lui-meme. Aucune conversion n'est inventee, et les achats
 * libelles en devise ne sont PAS touches : sans taux fige, les convertir au
 * taux du jour falsifierait l'historique.
 *
 * USAGE
 *   npx tsx scripts/reparer-contrevaleurs-achats.ts            (simulation)
 *   npx tsx scripts/reparer-contrevaleurs-achats.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

const A_REPARER = `
  "currencyCode" = 'TND'
  and (
    "exchangeRateTnd" <> 1
    or "netToPayTnd" <> "netToPay"
    or "paidAmountTnd" <> "paidAmount"
    or "balanceDueTnd" <> "balanceDue"
  )
`

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const [avant] = await prisma.$queryRawUnsafe<Array<{ n: number; ecart: string }>>(
      `select count(*)::int as n, coalesce(sum("netToPay" - "netToPayTnd"), 0)::text as ecart
       from purchases where ${A_REPARER}`,
    )
    console.log(`Lignes incoherentes : ${avant.n}`)
    console.log(`Contrevaleur manquante dans les totaux consolides : ${avant.ecart} DT`)

    const devises = await prisma.$queryRawUnsafe<Array<{ dev: string; n: number }>>(
      `select "currencyCode" as dev, count(*)::int as n
       from purchases where "currencyCode" <> 'TND' group by 1`,
    )
    for (const d of devises) {
      console.log(`  ${d.n} achat(s) en ${d.dev} : non touches, taux a saisir sur le document.`)
    }

    if (!ECRIRE) {
      console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
      return
    }

    const n = await prisma.$executeRawUnsafe(
      `update purchases
         set "exchangeRateTnd" = 1,
             "netToPayTnd"    = "netToPay",
             "paidAmountTnd"  = "paidAmount",
             "balanceDueTnd"  = "balanceDue"
       where ${A_REPARER}`,
    )
    console.log(`\n${n} ligne(s) reparees.`)

    const [apres] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `select count(*)::int as n from purchases where ${A_REPARER}`,
    )
    if (apres.n !== 0) throw new Error(`${apres.n} ligne(s) restent incoherentes.`)
    console.log('Controle : plus aucune incoherence.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
