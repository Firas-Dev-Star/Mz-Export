import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Import des trois fournisseurs reels de MZ EXPORT.
 *
 * Donnees relevees sur leurs factures papier :
 *   - ARSENAY INTERNATIONAL SARL  (facture 15-L-2026 du 24/04/2026)
 *   - SOCIETE SAFER ARTISANAT     (facture 0238 du 10/07/2026)
 *   - SOCIETE ARTISANALE HAMDI & FETHI / SAHAFA (facture 000475)
 *
 * Script IDEMPOTENT : `upsert` sur le champ `code`, unique. Le rejouer ne
 * duplique rien. Le bloc `update` est volontairement vide : si vous corrigez
 * une adresse ou ajoutez un telephone depuis l'application, relancer ce script
 * n'ecrasera pas votre saisie.
 *
 * Lancement :  npx tsx prisma/import-suppliers.ts
 *
 * NOTE : les champs `contactName`, `phone` et `email` restent vides — aucune
 * facture ne les mentionne. A completer depuis Achats > Fournisseurs.
 *
 * NOTE TVA : les trois fournisseurs n'appliquent pas le meme taux
 * (ARSENAY 19 %, SAFER et SAHAFA 7 %). Le taux ne se stocke pas sur le
 * fournisseur mais se saisit sur chaque facture d'achat : pensez a le verifier
 * a chaque saisie.
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

const SUPPLIERS = [
  {
    code: 'ARSENAY',
    companyName: 'STE ARSENAY INTERNATIONAL SARL',
    addressLine1: '32 rue Assad Ibn Fourat',
    addressLine2: '',
    postalCode: '5028',
    city: 'Zaouet Kontech',
    taxId: '1681193W',
    tradeRegister: '',
    notes: 'Fournisseur principal de FOUTA coton. TVA 19 %. Prix unitaire constate : 6,000 TND.',
  },
  {
    code: 'SAFER',
    companyName: 'Societe SAFER Artisanat',
    addressLine1: 'Zone industrielle Jebsa',
    addressLine2: '',
    postalCode: '5070',
    city: 'Ksar Hellal',
    taxId: '1828916T/A/M/000',
    tradeRegister: '1828916T',
    notes:
      'Artisan des metiers de tissage. Code client chez eux : 410013. TVA 7 %. Prix unitaire constate : 5,000 TND.',
  },
  {
    code: 'SAHAFA',
    companyName: 'Societe Artisanale Hamdi & Fethi (SAHAFA)',
    addressLine1: 'Rue Hedi Guerfel',
    addressLine2: '',
    postalCode: '5099',
    city: 'Lamta',
    taxId: '1648515/C/A/M/000',
    tradeRegister: '',
    notes: 'Foutas artisanales. TVA 7 %. Prix unitaire constate : 6,000 TND.',
  },
]

async function main() {
  // Les achats sont libelles en dinars : la devise doit exister avant
  // la creation des fournisseurs (cle etrangere).
  const tnd = await prisma.currency.findUnique({ where: { code: 'TND' } })
  if (!tnd) {
    throw new Error(
      "La devise TND n'existe pas. Lancez d'abord `npm run db:seed` pour creer les devises.",
    )
  }

  for (const supplier of SUPPLIERS) {
    const existing = await prisma.supplier.findUnique({
      where: { code: supplier.code },
      select: { id: true },
    })

    await prisma.supplier.upsert({
      where: { code: supplier.code },
      // Vide a dessein : ne jamais ecraser une saisie faite dans l'application.
      update: {},
      create: {
        ...supplier,
        country: 'Tunisie',
        contactName: '',
        phone: '',
        email: '',
        paymentTerms: '',
        currencyCode: 'TND',
        isActive: true,
      },
    })

    console.log(`${existing ? 'inchange ' : 'cree     '} ${supplier.code} — ${supplier.companyName}`)
  }

  const total = await prisma.supplier.count()
  console.log(`\n${total} fournisseur(s) en base.`)
  console.log('Completez telephone, email et conditions de reglement depuis Achats > Fournisseurs.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
