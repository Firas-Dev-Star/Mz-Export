import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Retire l'import de transit du 2026-08-20.
 *
 * MOTIF : cet import attribuait 11 factures a un fournisseur provisoire
 * « TRANSITAIRE — à renseigner », alors que le classeur nomme les transporteurs
 * reels en colonne R du registre (METM, transcargo, DACHSER, VECTORYS). Il ne
 * couvrait de plus que 11 des 48 factures du registre, et son total ne se
 * reconcilie pas avec le total du classeur.
 *
 * Ces documents sont des brouillons sans reglement : leur suppression ne touche
 * ni le stock, ni la tresorerie, ni aucun autre document.
 *
 * USAGE
 *   npx tsx scripts/annuler-transit.ts            (simulation)
 *   npx tsx scripts/annuler-transit.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL / DIRECT_URL manquant')
  console.log(`Base : ${url.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode : ${ECRIRE ? 'ECRITURE' : 'simulation'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  try {
    const achats = await prisma.purchase.findMany({
      where: { number: { startsWith: 'TRA-2026-' } },
      select: { id: true, number: true, netToPay: true, status: true, _count: { select: { payments: true } } },
    })

    // Garde-fou : on ne supprime que des brouillons sans reglement.
    const risque = achats.filter((a) => a.status !== 'DRAFT' || a._count.payments > 0)
    if (risque.length > 0) {
      throw new Error(
        `${risque.length} document(s) ne sont plus des brouillons vierges : ` +
          `${risque.map((a) => a.number).join(', ')}. Suppression interrompue.`,
      )
    }

    console.log(`${achats.length} facture(s) de transit a supprimer :`)
    for (const a of achats) console.log(`  ${a.number.padEnd(20)} ${a.netToPay} TND`)

    if (ECRIRE && achats.length > 0) {
      await prisma.purchase.deleteMany({ where: { id: { in: achats.map((a) => a.id) } } })
      console.log(`\n${achats.length} supprimee(s).`)
    }

    // Le fournisseur provisoire n'a plus de raison d'exister.
    const provisoire = await prisma.supplier.findUnique({
      where: { code: 'TRANSIT' },
      select: { id: true, companyName: true, _count: { select: { purchases: true } } },
    })
    if (provisoire) {
      if (provisoire._count.purchases > 0 && ECRIRE) {
        console.log(`\nFournisseur « ${provisoire.companyName} » conserve : ${provisoire._count.purchases} achat(s) y restent rattaches.`)
      } else {
        console.log(`\nFournisseur provisoire a supprimer : ${provisoire.companyName}`)
        if (ECRIRE) {
          await prisma.supplier.delete({ where: { id: provisoire.id } })
          console.log('  supprime.')
        }
      }
    }

    if (!ECRIRE) console.log('\nSimulation : aucune suppression. Relancez avec --ecrire.')
  } finally {
    await prisma.$disconnect()
  }
}
main().catch((e) => { console.error(`\nECHEC : ${e.message}`); process.exit(1) })
