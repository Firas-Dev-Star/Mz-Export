import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Import du produit FOUTA ARTISANALE COTON.
 *
 * Prix et TVA ne figurent pas sur la fiche : ils se saisissent sur les
 * factures, ou ils sont exacts et dates.
 *
 * ATTENTION UNITES : SAFER facture en PIECES, pas en kilogrammes.
 * A ~0,650 kg la fouta, 3 206 pieces = environ 2 084 kg.
 *
 * Lancement :  npx tsx prisma/import-product.ts
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

const PRODUCT = {
  reference: 'FOUTA-COTON',
  sku: '',
  designation: 'FOUTA ARTISANALE COTON',
  description:
    'Fouta artisanale tunisienne en coton. Fournisseurs : ARSENAY, SAFER (facturee a la piece), SAHAFA.',
  unit: 'KG',
  trackStock: true,
  minStock: '0',
  ngp: '62114290037',
  originCountry: 'Tunisie',
  unitWeightKg: '0.650',
  lengthCm: '0',
  widthCm: '0',
  heightCm: '0',
  unitsPerPackage: 0,
  salePriceEur: '0',
  purchasePriceTnd: '0',
  vatMode: 'NONE' as const,
  vatRate: '0',
  isActive: true,
}

async function main() {
  const existing = await prisma.product.findUnique({
    where: { reference: PRODUCT.reference },
    select: { id: true, stockQuantity: true },
  })

  const product = await prisma.product.upsert({
    where: { reference: PRODUCT.reference },
    update: {},
    create: PRODUCT,
  })

  if (existing) {
    console.log(`inchange  ${product.reference} — stock : ${existing.stockQuantity} KG`)
  } else {
    console.log(`cree      ${product.reference} — ${product.designation}`)
    console.log(`          stock initial 0 — il s'alimentera par vos factures d'achat.`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())