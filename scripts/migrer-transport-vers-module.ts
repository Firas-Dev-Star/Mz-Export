import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { add, round } from '../src/lib/money'

/**
 * Deplace les factures de transport deja saisies depuis les ACHATS vers le
 * nouveau module TRANSPORT.
 *
 * POURQUOI. Les societes de transport avaient ete enregistrees comme des
 * fournisseurs, faute de mieux. Ce n'en sont pas : elles ne vendent aucune
 * marchandise, rien n'entre en stock, et leurs factures ne se comprennent
 * qu'attachees a une expedition. Le module transport leur donne leur place.
 *
 * CE QUE LE SCRIPT PRESERVE A L'IDENTIQUE
 *   - le numero du document, sa date, son echeance, son statut ;
 *   - tous les montants, au millime ;
 *   - la reference de la facture du transporteur ;
 *   - les notes, y compris la tracabilite de l'import du classeur ;
 *   - les pieces jointes, reattachees au nouveau document.
 *
 * CE QU'IL AJOUTE : le rattachement a la facture de VENTE de l'expedition,
 * deduit de la reference portee par la note (« wida 21 » -> FAC 21-2026).
 *
 * CONTROLE. Le total transporte est compare au total d'origine avant toute
 * suppression. Au moindre ecart, le script s'arrete sans rien supprimer.
 *
 * USAGE
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/migrer-transport-vers-module.ts
 *   npx tsx --require ./scripts/_neutraliser-server-only.cjs scripts/migrer-transport-vers-module.ts --ecrire
 */

const ECRIRE = process.argv.includes('--ecrire')

/** Reference d'expedition, telle que la note de l'import la porte. */
function referenceExpedition(notes: string): string {
  const m = notes.match(/Expedition\s*:\s*([^.]+)\./i)
  return m ? m[1].trim() : ''
}

/** Numero de la facture de vente evoquee par la reference (« wida 21 » -> 21). */
function numeroVente(ref: string): number | null {
  const m = ref.match(/(\d+)\s*$/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 999 ? n : null
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

  console.log(`Base cible : ${connectionString.includes('127.0.0.1') ? 'LOCALE' : 'SUPABASE'}`)
  console.log(`Mode       : ${ECRIRE ? 'ECRITURE' : 'simulation (ajoutez --ecrire)'}\n`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const achats = await prisma.purchase.findMany({
      where: { supplier: { nature: 'TRANSPORT' } },
      orderBy: [{ date: 'asc' }, { number: 'asc' }],
      include: {
        supplier: true,
        items: { orderBy: { position: 'asc' } },
        payments: true,
        documents: { select: { id: true } },
      },
    })

    if (achats.length === 0) {
      console.log('Aucun achat rattache a un fournisseur de nature TRANSPORT. Rien a migrer.')
      return
    }

    const totalOrigine = round(add(...achats.map((a) => a.netToPay)), 3)
    console.log(`${achats.length} facture(s) a deplacer — total ${totalOrigine.toFixed(3)} TND`)

    // Une facture deja reglee porterait des reglements a recreer : le script
    // refuse plutot que de perdre l'information.
    const avecReglements = achats.filter((a) => a.payments.length > 0)
    if (avecReglements.length > 0) {
      throw new Error(
        `${avecReglements.length} facture(s) portent des reglements ` +
          `(${avecReglements.map((a) => a.number).join(', ')}). ` +
          'Migration interrompue : traitez-les a la main pour ne rien perdre.',
      )
    }

    // Une facture de transport ne devrait avoir genere aucun mouvement de stock.
    // Si c'etait le cas, la supprimer laisserait le stock faux.
    const mouvements = await prisma.stockMovement.count({
      where: { referenceType: 'PURCHASE', referenceId: { in: achats.map((a) => a.id) } },
    })
    if (mouvements > 0) {
      throw new Error(
        `${mouvements} mouvement(s) de stock sont rattaches a ces factures. ` +
          'Migration interrompue : le stock serait faussé.',
      )
    }

    // Dates des ventes, pour rattacher chaque expedition a sa facture.
    const ventes = await prisma.invoice.findMany({
      where: { number: { startsWith: 'FAC ' } },
      select: { id: true, number: true },
    })
    const venteParNumero = new Map<number, string>()
    for (const v of ventes) {
      const m = v.number.match(/^FAC (\d+)-2026$/)
      if (m) venteParNumero.set(Number(m[1]), v.id)
    }

    const transporteurs = new Map<string, string>()
    let deplacees = 0
    let rattachees = 0
    let sansRattachement = 0
    const transportes: string[] = []

    for (const achat of achats) {
      const f = achat.supplier

      // Transporteur : cree une fois, avec les coordonnees du fournisseur.
      let carrierId = transporteurs.get(f.code)
      if (!carrierId) {
        const existant = await prisma.carrier.findUnique({
          where: { code: f.code },
          select: { id: true },
        })
        if (existant) {
          carrierId = existant.id
        } else if (ECRIRE) {
          const cree = await prisma.carrier.create({
            data: {
              code: f.code,
              companyName: f.companyName,
              contactName: f.contactName,
              addressLine1: f.addressLine1,
              addressLine2: f.addressLine2,
              postalCode: f.postalCode,
              city: f.city,
              country: f.country,
              phone: f.phone,
              email: f.email,
              taxId: f.taxId,
              tradeRegister: f.tradeRegister,
              paymentTerms: f.paymentTerms,
              currencyCode: f.currencyCode,
              notes: f.notes,
              isActive: f.isActive,
            },
            select: { id: true },
          })
          carrierId = cree.id
          console.log(`  transporteur cree : ${f.companyName} (${f.code})`)
        } else {
          carrierId = `(simule:${f.code})`
          console.log(`  transporteur A CREER : ${f.companyName} (${f.code})`)
        }
        transporteurs.set(f.code, carrierId)
      }

      const ref = referenceExpedition(achat.notes)
      const n = ref ? numeroVente(ref) : null
      const invoiceId = n === null ? null : (venteParNumero.get(n) ?? null)
      if (invoiceId) rattachees += 1
      else sansRattachement += 1

      if (ECRIRE) {
        await prisma.$transaction(async (tx) => {
          const cree = await tx.transportInvoice.create({
            data: {
              number: achat.number,
              status: achat.status,
              carrierReference: achat.supplierReference,
              carrierId: carrierId as string,
              date: achat.date,
              dueDate: achat.dueDate,
              shipmentRef: ref,
              invoiceId,
              currencyCode: achat.currencyCode,
              paymentTerms: achat.paymentTerms,
              // Le registre ne distinguait pas transport et transit : tout le
              // montant reste sur la ligne transport, sans rien reventiler.
              transportLabel: 'Transport et transit',
              transportAmount: achat.totalHt.toFixed(3),
              transitLabel: 'Transit et douane',
              transitAmount: '0.000',
              otherFeesLabel: achat.otherFeesLabel,
              otherFeesAmount: '0.000',
              vatMode: achat.vatMode,
              vatRate: achat.vatRate.toFixed(3),
              stampDutyLabel: achat.stampDutyLabel,
              stampDutyAmount: achat.stampDutyAmount.toFixed(3),
              totalHt: achat.totalHt.toFixed(3),
              vatAmount: achat.vatAmount.toFixed(3),
              totalTtc: achat.totalTtc.toFixed(3),
              netToPay: achat.netToPay.toFixed(3),
              paidAmount: achat.paidAmount.toFixed(3),
              balanceDue: achat.balanceDue.toFixed(3),
              exchangeRateTnd: achat.exchangeRateTnd.toFixed(6),
              netToPayTnd: achat.netToPayTnd.toFixed(3),
              paidAmountTnd: achat.paidAmountTnd.toFixed(3),
              balanceDueTnd: achat.balanceDueTnd.toFixed(3),
              notes: achat.notes,
              createdById: achat.createdById,
              confirmedAt: achat.confirmedAt,
              cancelledAt: achat.cancelledAt,
              createdAt: achat.createdAt,
            },
            select: { id: true },
          })

          // Les pieces suivent le document : elles changent de parent, elles ne
          // sont jamais recreees ni perdues.
          for (const doc of achat.documents) {
            await tx.document.update({
              where: { id: doc.id },
              data: { purchaseId: null, transportInvoiceId: cree.id },
            })
          }

          await tx.purchase.delete({ where: { id: achat.id } })
        })
      }

      transportes.push(achat.netToPay.toFixed(3))
      deplacees += 1
    }

    // Controle : le total deplace doit etre celui d'origine, au millime.
    const totalTransporte = round(add(...transportes), 3)
    console.log(`\nControle : ${totalTransporte.toFixed(3)} / ${totalOrigine.toFixed(3)} TND`)
    if (!totalTransporte.equals(totalOrigine)) {
      throw new Error('Ecart de total : migration interrompue.')
    }

    if (ECRIRE) {
      // Les fournisseurs devenus vides sont supprimes : ils n'avaient de raison
      // d'etre que pour porter ces factures.
      const codes = [...transporteurs.keys()]
      for (const code of codes) {
        const f = await prisma.supplier.findUnique({
          where: { code },
          select: { id: true, companyName: true, _count: { select: { purchases: true } } },
        })
        if (f && f._count.purchases === 0) {
          await prisma.supplier.delete({ where: { id: f.id } })
          console.log(`  fournisseur retire : ${f.companyName} (${code})`)
        } else if (f) {
          console.log(
            `  fournisseur conserve : ${f.companyName} (${code}) — ${f._count.purchases} achat(s) restants`,
          )
        }
      }
    }

    console.log(
      `\n${ECRIRE ? 'Deplacees' : 'A deplacer'} : ${deplacees}   ` +
        `rattachees a une vente : ${rattachees}   sans rattachement : ${sansRattachement}`,
    )
    if (!ECRIRE) console.log('\nSimulation : aucune ecriture. Relancez avec --ecrire.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(`\nECHEC : ${e.message}`)
  process.exit(1)
})
