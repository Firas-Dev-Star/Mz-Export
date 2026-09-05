import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Inscrit la regle commerciale de SABRI : enlevement par le client, EXW.
 *
 * POURQUOI. Le rapprochement transport / ventes signalait FAC 38-2026 comme
 * une vente « sans transport », donc comme un oubli. Ce n'en est pas un :
 * SABRI enleve la marchandise lui-meme, aucun transport n'est a notre charge.
 * Sans l'incoterm, cette information n'existait nulle part dans
 * l'application et le controle allait la signaler indefiniment.
 *
 * DEUX ECRITURES SEULEMENT
 *   - la fiche client recoit EXW comme incoterm habituel, donc les prochaines
 *     factures de SABRI le porteront d'office ;
 *   - la facture FAC 38-2026 recoit EXW, avec la raison en note.
 *
 * Les autres clients ne sont PAS touches : leur incoterm reel n'est pas connu,
 * et le deduire du fait qu'ils ont un transport serait une supposition.
 *
 * USAGE
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/incoterm-sabri.ts
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/incoterm-sabri.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

const NOTE =
  " INCOTERM EXW : SABRI enleve la marchandise dans nos locaux, avec ses propres " +
  "moyens. Aucun transport n'est a notre charge sur cette expedition — l'absence " +
  'de facture de transporteur est normale et ne doit pas etre traitee comme un oubli.'

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const client = await prisma.customer.findFirst({
      where: { companyName: 'SABRI' },
      select: { id: true, companyName: true, defaultIncoterm: true },
    })
    if (!client) throw new Error('Client SABRI introuvable.')

    const factures = await prisma.invoice.findMany({
      where: { customerId: client.id, status: { not: 'CANCELLED' } },
      select: { id: true, number: true, incoterm: true, notes: true },
      orderBy: { date: 'asc' },
    })

    console.log(`Client  : ${client.companyName}  incoterm actuel « ${client.defaultIncoterm || '(aucun)'} » -> EXW`)
    for (const f of factures) {
      console.log(`Facture : ${f.number}  incoterm « ${f.incoterm || '(aucun)'} » -> EXW`)
    }

    if (!ECRIRE) {
      console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
      return
    }

    await prisma.customer.update({
      where: { id: client.id },
      data: { defaultIncoterm: 'EXW' },
    })

    for (const f of factures) {
      await prisma.invoice.update({
        where: { id: f.id },
        data: {
          incoterm: 'EXW',
          notes: f.notes.includes('INCOTERM EXW') ? f.notes : f.notes + NOTE,
        },
      })
    }

    console.log(`\nFiche client mise a jour, ${factures.length} facture(s) passee(s) en EXW.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
