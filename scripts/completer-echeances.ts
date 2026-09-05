import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Renseigne l'echeance et les conditions de reglement des factures importees.
 *
 * Le suivi Excel ne porte pas d'echeance. La convention est lue sur les
 * factures reelles de MZ EXPORT (facture n 49 : date 30/07/2026, echeance
 * 29/08/2026, « Virement 30 jours ») et confirmee par le parametre societe
 * `defaultPaymentTerms`. Rien n'est invente : 30 jours est la regle etablie.
 *
 * Sans echeance, le tableau d'anciennete des encours ne peut pas classer les
 * factures : tout serait compte « non echu ».
 *
 * N'agit que sur les factures issues de l'import et encore sans echeance.
 *
 * USAGE
 *   npx tsx scripts/completer-echeances.ts            (simulation)
 *   npx tsx scripts/completer-echeances.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')
const JOURS = 30

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL / DIRECT_URL manquant')
  console.log(`Base  : ${url.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode  : ${ECRIRE ? 'ECRITURE' : 'simulation'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  try {
    const factures = await prisma.invoice.findMany({
      where: { dueDate: null, notes: { contains: 'Importe du suivi Excel 2026' } },
      select: { id: true, number: true, date: true },
      orderBy: { date: 'asc' },
    })

    console.log(`${factures.length} facture(s) sans echeance.`)

    for (const f of factures) {
      const echeance = new Date(f.date)
      echeance.setUTCDate(echeance.getUTCDate() + JOURS)
      if (ECRIRE) {
        await prisma.invoice.update({
          where: { id: f.id },
          data: { dueDate: echeance, paymentTerms: `Virement ${JOURS} jours` },
        })
      }
      console.log(
        `  ${f.number.padEnd(14)} ${f.date.toISOString().slice(0, 10)} -> echeance ${echeance.toISOString().slice(0, 10)}`,
      )
    }

    if (!ECRIRE) console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
  } finally {
    await prisma.$disconnect()
  }
}
main().catch((e) => { console.error(`\nECHEC : ${e.message}`); process.exit(1) })
