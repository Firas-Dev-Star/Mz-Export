import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { buildTransportInvoiceData } from '../src/services/transport.service'
import type { TransportInvoiceInput } from '../src/validations/transport'

/**
 * Rattrape la facture de transport « SEMI 47 » oubliee par l'import initial.
 *
 * POURQUOI ELLE MANQUAIT. Le registre transport du classeur 2026 (ligne 125)
 * porte un montant et un transporteur, mais AUCUN numero de facture — et mon
 * import se servait de ce numero comme cle du document. La ligne a donc ete
 * ecartee en silence : 2 200,000 DT de transport absents de l'application,
 * pour l'expedition de la facture de vente FAC 47-2026.
 *
 * SOURCE : classeur « Classeur1 MZ EXPORT.xlsx », ligne 125.
 *   P125 = SEMI 47   R125 = METM   S125 = 2200
 *   O (date), Q (n de facture), T et U (reglement) sont vides.
 *
 * DATE : le classeur ne la donne pas. Elle est reprise de la vente couverte,
 * comme pour les 34 autres lignes sans date — et la note du document le dit.
 *
 * NUMERO INTERNE : « TRP-2026-SEMI47 », derive de l'expedition faute de
 * numero de transporteur. A corriger quand la facture METM sera en main.
 *
 * IDEMPOTENT : ne fait rien si le document existe deja.
 *
 * USAGE
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/ajouter-transport-semi47.ts
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/ajouter-transport-semi47.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

const NUMERO = 'TRP-2026-SEMI47'
const MONTANT = '2200.000'
const EXPEDITION = 'SEMI 47'
const VENTE = 'FAC 47-2026'

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const deja = await prisma.transportInvoice.findUnique({
      where: { number: NUMERO },
      select: { id: true },
    })
    if (deja) {
      console.log(`${NUMERO} existe deja. Rien a faire.`)
      return
    }

    const [carrier, vente] = await Promise.all([
      prisma.carrier.findUnique({ where: { code: 'METM' }, select: { id: true, companyName: true } }),
      prisma.invoice.findUnique({
        where: { number: VENTE },
        select: { id: true, number: true, date: true, customer: { select: { companyName: true } } },
      }),
    ])
    if (!carrier) throw new Error('Transporteur METM introuvable.')
    if (!vente) throw new Error(`Facture de vente ${VENTE} introuvable.`)

    const date = vente.date.toISOString().slice(0, 10)
    console.log(`Transporteur : ${carrier.companyName}`)
    console.log(`Vente        : ${vente.number} (${vente.customer.companyName}) du ${date}`)
    console.log(`Montant      : ${MONTANT} DT`)

    const input: TransportInvoiceInput = {
      carrierId: carrier.id,
      // Le classeur ne donne pas le numero de la facture METM.
      carrierReference: '',
      date,
      dueDate: '',
      shipmentRef: EXPEDITION,
      invoiceId: vente.id,
      currencyCode: 'TND',
      paymentTerms: '',
      transportLabel: 'Transport et transit',
      transportAmount: MONTANT,
      transitLabel: 'Transit et douane',
      transitAmount: '0',
      otherFeesLabel: 'Autres frais',
      otherFeesAmount: '0',
      vatMode: 'NONE',
      vatRate: '0',
      stampDutyLabel: 'Timbre fiscal',
      stampDutyAmount: '0',
      notes:
        'Importe du registre transport du classeur 2026 (ligne 125). ' +
        `Expedition : ${EXPEDITION}, rattachee a ${VENTE}. ` +
        'LIGNE OUBLIEE PAR LE PREMIER IMPORT : le classeur ne porte aucun numero ' +
        "de facture pour ce transport, et ce numero servait de cle a l'import. " +
        `Date reprise de la vente couverte, le classeur ne la donne pas. ` +
        'N DE FACTURE A COMPLETER depuis la facture METM. ' +
        'Aucune information de reglement dans le classeur.',
    }

    const { scalars, totals } = buildTransportInvoiceData(input)
    if (totals.netToPay.toFixed(3) !== MONTANT) {
      throw new Error(`net calcule ${totals.netToPay.toFixed(3)} != ${MONTANT}`)
    }

    if (!ECRIRE) {
      console.log(`\nA creer : ${NUMERO}, net ${totals.netToPay.toFixed(3)} DT`)
      console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
      return
    }

    await prisma.transportInvoice.create({
      data: {
        ...scalars,
        number: NUMERO,
        // Les 48 autres factures de transport sont validees : celle-ci aussi,
        // pour qu'elle entre dans les etats et le classeur comptable.
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        paidAmount: '0.000',
      },
    })
    console.log(`\n${NUMERO} creee, ${MONTANT} DT.`)

    const total = await prisma.transportInvoice.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { netToPay: true },
      _count: true,
    })
    console.log(
      `Total transport : ${total._count} factures, ${Number(total._sum.netToPay).toFixed(3)} DT`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
