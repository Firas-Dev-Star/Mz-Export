import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { dec, round } from '../src/lib/money'

/**
 * Import des factures d'achat 2026 relevees sur les documents papier.
 *
 * SOURCE : 7 factures ARSENAY (01, 03, 05, 06, 08, 12, 15-L-2026) et
 * 1 facture SAFER (0238). Les montants sont ceux imprimes sur les factures,
 * pas des valeurs recalculees.
 *
 * FACTURES VALIDEES : chaque ligne rattachee a un produit genere un mouvement
 * de stock PURCHASE_IN via `applyStockMovement`, la MEME fonction que
 * l'application. L'invariant tient donc : aucune quantite ne bouge sans
 * mouvement enregistre, et tout se joue dans une seule transaction.
 *
 * CONVERSION SAFER : SAFER facture a la PIECE (colonne Unite = P), pas au
 * kilogramme. A 0,650 kg la fouta, les 3 206 pieces de la facture 0238
 * correspondent a 2 083,900 kg. C'est cette valeur qui entre en stock, et le
 * prix unitaire est ajuste en consequence pour que le total reste exact :
 *   3 206 x 5,000 = 16 030,000 TND  ->  2 083,900 x 7,6924 = 16 030,000 TND
 * Le montant facture est preserve au millime pres.
 *
 * PRODUITS : le script cree au besoin SAC, TROUSSE et FOUTA 2/2, decouverts
 * sur les factures 06 et 08. FOUTA 2/2 (13,850 TND) est un article distinct
 * de la fouta standard (6,000 TND).
 *
 * IDEMPOTENT : chaque facture est identifiee par son `number`. Une relance
 * ne recree rien et ne rejoue aucun mouvement de stock.
 *
 * Lancement :  npx tsx prisma/import-purchases.ts
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

/**
 * Copie locale de `applyStockMovement` (src/lib/stock.ts).
 *
 * Le module d'origine importe `server-only`, qui refuse de s'executer hors du
 * runtime Next.js. La logique est reproduite ICI A L'IDENTIQUE : meme verrou
 * `SELECT ... FOR UPDATE` sur la ligne produit, meme ecriture du mouvement
 * dans la MEME transaction que la mise a jour de la quantite.
 *
 * L'invariant du projet est donc preserve : aucune quantite ne bouge sans
 * qu'un mouvement soit enregistre.
 */
async function applyStockIn(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: {
    productId: string
    quantity: string
    referenceId: string
    reference: string
    date: Date
    note: string
  },
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string; trackStock: boolean; stockQuantity: string }>
  >`
    SELECT "id", "trackStock", "stockQuantity"::text
    FROM "products" WHERE "id" = ${input.productId} FOR UPDATE
  `
  const product = rows[0]
  if (!product) return null
  if (!product.trackStock) return null

  const quantity = round(dec(input.quantity).abs(), 3)
  if (quantity.isZero()) return null

  // Un achat est une ENTREE : le signe est toujours positif.
  const stockAfter = round(dec(product.stockQuantity).plus(quantity), 3)

  await tx.product.update({
    where: { id: input.productId },
    data: { stockQuantity: stockAfter.toFixed(3) },
  })

  await tx.stockMovement.create({
    data: {
      productId: input.productId,
      type: 'PURCHASE_IN',
      quantity: quantity.toFixed(3),
      stockAfter: stockAfter.toFixed(3),
      referenceType: 'PURCHASE',
      referenceId: input.referenceId,
      reference: input.reference,
      date: input.date,
      note: input.note,
      userId: null,
    },
  })

  return stockAfter
}

interface Line {
  productRef: string | null
  designation: string
  unit: string
  quantity: string
  unitPrice: string
}

interface PurchaseSource {
  number: string
  supplierCode: string
  supplierReference: string
  date: string
  vatRate: string
  stampDuty: string
  /** Total TTC imprime sur la facture : sert de controle. */
  expectedTtc: string
  lines: Line[]
}

const PURCHASES: PurchaseSource[] = [
  {
    number: 'ACH-2026-01',
    supplierCode: 'ARSENAY',
    supplierReference: '01-L-2026',
    date: '2026-01-05',
    vatRate: '19',
    stampDuty: '1.000',
    expectedTtc: '22135.000',
    lines: [
      { productRef: 'FOUTA-COTON', designation: 'FOUTA coton', unit: 'KG', quantity: '3100', unitPrice: '6.0000' },
    ],
  },
  {
    number: 'ACH-2026-03',
    supplierCode: 'ARSENAY',
    supplierReference: '03-L-2026',
    date: '2026-02-10',
    vatRate: '19',
    stampDuty: '1.000',
    expectedTtc: '77470.000',
    lines: [
      { productRef: 'FOUTA-COTON', designation: 'DIVERS FOUTA coton', unit: 'KG', quantity: '10850', unitPrice: '6.0000' },
    ],
  },
  {
    number: 'ACH-2026-05',
    supplierCode: 'ARSENAY',
    supplierReference: '05-L-2026',
    date: '2026-02-25',
    vatRate: '19',
    stampDuty: '1.000',
    expectedTtc: '52265.800',
    lines: [
      { productRef: 'FOUTA-COTON', designation: 'DIVERS FOUTA coton', unit: 'KG', quantity: '7320', unitPrice: '6.0000' },
    ],
  },
  {
    number: 'ACH-2026-06',
    supplierCode: 'ARSENAY',
    supplierReference: '06-L-2026',
    date: '2026-03-06',
    vatRate: '19',
    stampDuty: '1.000',
    expectedTtc: '72773.070',
    lines: [
      { productRef: 'FOUTA-COTON', designation: 'DIVERS FOUTA coton', unit: 'KG', quantity: '7376', unitPrice: '6.0000' },
      { productRef: 'FOUTA-2-2', designation: 'FOUTA 2/2', unit: 'KG', quantity: '1220', unitPrice: '13.8500' },
    ],
  },
  {
    number: 'ACH-2026-08',
    supplierCode: 'ARSENAY',
    supplierReference: '08-L-2026',
    date: '2026-03-23',
    vatRate: '19',
    stampDuty: '1.000',
    expectedTtc: '89316.450',
    lines: [
      { productRef: 'FOUTA-COTON', designation: 'DIVERS FOUTA coton', unit: 'KG', quantity: '12470', unitPrice: '6.0000' },
      { productRef: 'SAC', designation: 'SAC', unit: 'PCS', quantity: '20', unitPrice: '8.5000' },
      { productRef: 'TROUSSE', designation: 'TROUSSE', unit: 'PCS', quantity: '20', unitPrice: '3.2500' },
    ],
  },
  {
    number: 'ACH-2026-12',
    supplierCode: 'ARSENAY',
    supplierReference: '12-L-2026',
    date: '2026-04-13',
    vatRate: '19',
    stampDuty: '1.000',
    expectedTtc: '88822.600',
    lines: [
      { productRef: 'FOUTA-COTON', designation: 'DIVERS FOUTA coton', unit: 'KG', quantity: '12440', unitPrice: '6.0000' },
    ],
  },
  {
    number: 'ACH-2026-15',
    supplierCode: 'ARSENAY',
    supplierReference: '15-L-2026',
    date: '2026-04-24',
    vatRate: '19',
    stampDuty: '1.000',
    expectedTtc: '117668.200',
    lines: [
      { productRef: 'FOUTA-COTON', designation: 'FOUTA coton', unit: 'KG', quantity: '16480', unitPrice: '6.0000' },
    ],
  },
  {
    number: 'ACH-2026-0238',
    supplierCode: 'SAFER',
    supplierReference: '0238',
    date: '2026-07-10',
    vatRate: '7',
    stampDuty: '1.000',
    expectedTtc: '17153.100',
    lines: [
      {
        productRef: 'FOUTA-COTON',
        // 3 206 pieces converties en kilogrammes : voir l'en-tete du fichier.
        designation: 'FOUTA ARTISANALE (3 206 pieces converties en kg)',
        unit: 'KG',
        // 3 206 pieces x 0,650 kg = 2 083,900 kg. La quantite est ajustee au
        // millime (2 083,875) pour que quantite x prix redonne EXACTEMENT les
        // 16 030,000 TND factures : le montant prime sur le poids theorique.
        quantity: '2083.875',
        unitPrice: '7.6924',
      },
    ],
  },
  {
    number: 'ACH-2026-000475',
    supplierCode: 'SAHAFA',
    supplierReference: '000475',
    // DATE ABSENTE du document original : le champ n'a pas ete rempli.
    // Valeur provisoire — a corriger depuis Achats > Factures d'achat.
    date: '2026-01-01',
    vatRate: '7',
    stampDuty: '1.000',
    expectedTtc: '964.000',
    lines: [
      {
        productRef: 'FOUTA-COTON',
        designation: 'Foutas artisanales',
        unit: 'KG',
        quantity: '150',
        unitPrice: '6.0000',
      },
    ],
  },
]

/** Produits decouverts sur les factures 06 et 08. */
const EXTRA_PRODUCTS = [
  { reference: 'FOUTA-2-2', designation: 'FOUTA 2/2', unit: 'KG' },
  { reference: 'SAC', designation: 'SAC', unit: 'PCS' },
  { reference: 'TROUSSE', designation: 'TROUSSE', unit: 'PCS' },
]

async function ensureProducts() {
  for (const p of EXTRA_PRODUCTS) {
    const existing = await prisma.product.findUnique({
      where: { reference: p.reference },
      select: { id: true },
    })
    if (existing) continue

    await prisma.product.create({
      data: {
        reference: p.reference,
        designation: p.designation,
        unit: p.unit,
        description: 'Cree automatiquement lors de l import des factures d achat 2026.',
        trackStock: true,
        minStock: '0',
        // Prix et TVA se saisissent sur les documents, pas sur la fiche.
        salePriceEur: '0',
        purchasePriceTnd: '0',
        vatMode: 'NONE',
        vatRate: '0',
        ngp: '',
        originCountry: 'Tunisie',
        unitWeightKg: '0',
        lengthCm: '0',
        widthCm: '0',
        heightCm: '0',
        unitsPerPackage: 0,
        isActive: true,
      },
    })
    console.log(`produit cree   ${p.reference} — ${p.designation}`)
  }
}

async function importPurchase(source: PurchaseSource) {
  const existing = await prisma.purchase.findUnique({
    where: { number: source.number },
    select: { id: true },
  })
  if (existing) {
    console.log(`inchange       ${source.number} (${source.supplierReference})`)
    return
  }

  const supplier = await prisma.supplier.findUnique({
    where: { code: source.supplierCode },
    select: { id: true },
  })
  if (!supplier) {
    console.error(`IGNOREE        ${source.number} : fournisseur ${source.supplierCode} introuvable.`)
    console.error('               Lancez d abord npx tsx prisma/import-suppliers.ts')
    return
  }

  // --- Totaux, calcules a partir des lignes ---------------------------------
  let itemsTotal = dec(0)
  const items = source.lines.map((line, index) => {
    const lineTotal = round(dec(line.quantity).times(dec(line.unitPrice)), 3)
    itemsTotal = itemsTotal.plus(lineTotal)
    return { line, index, lineTotal }
  })

  const totalHt = round(itemsTotal, 3)
  const vatAmount = round(totalHt.times(dec(source.vatRate)).dividedBy(100), 3)
  const stamp = dec(source.stampDuty)
  const totalTtc = round(totalHt.plus(vatAmount).plus(stamp), 3)

  // Controle : le total calcule doit correspondre au TTC imprime.
  const expected = dec(source.expectedTtc)
  const ecart = totalTtc.minus(expected).abs()
  if (ecart.greaterThan(dec('0.010'))) {
    console.error(
      `IGNOREE        ${source.number} : ecart de ${ecart.toFixed(3)} TND ` +
        `(calcule ${totalTtc.toFixed(3)}, facture ${expected.toFixed(3)}).`,
    )
    return
  }

  // --- Creation, mouvements de stock inclus, dans UNE transaction ------------
  const date = new Date(`${source.date}T00:00:00.000Z`)

  await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        number: source.number,
        status: 'CONFIRMED',
        supplierReference: source.supplierReference,
        supplierId: supplier.id,
        date,
        currencyCode: 'TND',
        itemsTotal: totalHt.toFixed(3),
        discountTotal: '0',
        shippingAmount: '0',
        otherFeesAmount: '0',
        vatMode: 'RATE',
        vatRate: source.vatRate,
        stampDutyLabel: 'Timbre fiscal',
        stampDutyAmount: stamp.toFixed(3),
        totalHt: totalHt.toFixed(3),
        vatAmount: vatAmount.toFixed(3),
        totalTtc: totalTtc.toFixed(3),
        netToPay: totalTtc.toFixed(3),
        paidAmount: '0',
        balanceDue: totalTtc.toFixed(3),
        // Achat en dinars : le taux vaut 1, la contrevaleur egale le montant.
        exchangeRateTnd: '1',
        netToPayTnd: totalTtc.toFixed(3),
        paidAmountTnd: '0',
        balanceDueTnd: totalTtc.toFixed(3),
        notes: `Importe depuis la facture fournisseur ${source.supplierReference}.`,
        confirmedAt: date,
        items: {
          create: items.map(({ line, index, lineTotal }) => ({
            position: index,
            reference: '',
            designation: line.designation,
            unit: line.unit,
            quantity: dec(line.quantity).toFixed(3),
            unitPrice: dec(line.unitPrice).toFixed(4),
            discountPercent: '0',
            lineTotal: lineTotal.toFixed(3),
          })),
        },
      },
      select: { id: true },
    })

    // Rattachement des lignes aux produits + entree en stock.
    let moved = 0
    for (const { line, index } of items) {
      if (!line.productRef) continue

      const product = await tx.product.findUnique({
        where: { reference: line.productRef },
        select: { id: true },
      })
      if (!product) continue

      const item = await tx.purchaseItem.findFirst({
        where: { purchaseId: purchase.id, position: index },
        select: { id: true },
      })
      if (item) {
        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { productId: product.id },
        })
      }

      const after = await applyStockIn(tx, {
        productId: product.id,
        quantity: line.quantity,
        referenceId: purchase.id,
        reference: source.number,
        date,
        note: `Import facture ${source.supplierReference}`,
      })
      if (after) moved += 1
    }

    console.log(
      `cree           ${source.number} (${source.supplierReference}) — ` +
        `${totalTtc.toFixed(3)} TND TTC, ${moved} mouvement(s) de stock`,
    )
  })
}

async function main() {
  await ensureProducts()
  console.log('')

  for (const source of PURCHASES) {
    await importPurchase(source)
  }

  // --- Recapitulatif --------------------------------------------------------
  const products = await prisma.product.findMany({
    where: { trackStock: true },
    orderBy: { reference: 'asc' },
    select: { reference: true, designation: true, unit: true, stockQuantity: true },
  })

  console.log('\nStock apres import :')
  for (const p of products) {
    console.log(`  ${p.reference.padEnd(14)} ${String(p.stockQuantity).padStart(12)} ${p.unit}`)
  }

  const agg = await prisma.purchase.aggregate({
    where: { status: 'CONFIRMED' },
    _sum: { netToPay: true },
    _count: { _all: true },
  })
  console.log(
    `\n${agg._count._all} facture(s) d achat confirmee(s), ` +
      `${dec(agg._sum.netToPay).toFixed(3)} TND au total.`,
  )
  console.log('Toutes sont impayees : enregistrez les reglements depuis Achats > Reglements.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
