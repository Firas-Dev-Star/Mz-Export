import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Seed de la base MZ EXPORT.
 *
 * Ce script ne cree QUE les donnees reelles indispensables au demarrage :
 *   - les devises (EUR, TND)
 *   - les parametres de la societe, repris de la facture papier n 49
 *   - les sequences de numerotation (ventes et achats)
 *   - le compte administrateur
 *
 * Aucun client, produit, fournisseur, facture ni mouvement de stock n'est cree :
 * ces donnees se saisissent depuis l'application.
 *
 * Le script est idempotent (upsert) : le rejouer ne duplique rien et n'ecrase
 * pas les parametres deja modifies depuis l'interface.
 *
 * ATTENTION : certaines informations de la facture scannee sont partiellement
 * lisibles (numeros de telephone et de fax notamment). Elles sont saisies au plus
 * proche et doivent etre verifiees puis corrigees dans Parametres > Entreprise.
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL / DIRECT_URL manquant')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

async function main() {
  // --- Devises -------------------------------------------------------------
  await prisma.currency.upsert({
    where: { code: 'EUR' },
    update: {},
    create: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  })
  await prisma.currency.upsert({
    where: { code: 'TND' },
    update: {},
    create: { code: 'TND', name: 'Dinar tunisien', symbol: 'DT', decimals: 3 },
  })

  // --- Parametres societe (donnees reelles) -------------------------------
  await prisma.company.upsert({
    where: { id: 'company' },
    update: {},
    create: {
      id: 'company',
      name: 'MZ EXPORT SARL',
      legalForm: 'Société à Responsabilité Limitée',
      capital: '5000',
      capitalCurrency: 'TND',
      taxId: '1767502K/A/M/000',
      tradeRegister: '',
      activity: 'Export',
      addressLine1: 'Rue Jamel Abdenaceur',
      addressLine2: 'Zeramdine',
      postalCode: '5040',
      city: 'Monastir',
      country: 'Tunisie',
      // Numeros releves sur la facture scannee - A VERIFIER dans Paramètres
      phone: '+216 95 816 977',
      phone2: '+216 97 219 556',
      fax: '+216 73 504 003',
      email: 'janvier95@yahoo.fr',
      website: '',
      bankName: 'ATB',
      bankAgency: 'Monastir',
      bankAccount: 'TN59 01501111110000734958',
      iban: 'TN5901501111110000734958',
      swift: 'ATBKTNTT',
      logoPath: '',
      defaultCurrency: 'EUR',
      defaultVatMode: 'NONE',
      defaultVatRate: '19',
      defaultStampDuty: '0',
      defaultStampLabel: 'Timbre fiscal',
      defaultPaymentTerms: 'Virement 30 jours',
      defaultIncoterm: 'DDP',
      defaultOrigin: 'TUNISIE',
      headerNote: '',
      paymentNotice: 'Veuillez nous faire le règlement de cette facture sur notre compte suivant :',
      legalMentions: '',
      footerText: 'Siège social : Rue Jamel Abdenaceur - Zeramdine 5040 - Monastir / Tunisie',
    },
  })

  // --- Sequences de numerotation ------------------------------------------
  // La derniere facture de vente papier de MZ EXPORT est la n 49 -> la suivante sera la 50.
  // Le format (prefixe, longueur, annee) est modifiable dans Paramètres > Numérotation.
  await prisma.invoiceSequence.upsert({
    where: { key: 'SALE' },
    update: {},
    create: {
      key: 'SALE',
      label: 'Factures de vente',
      prefix: '',
      suffix: '',
      padding: 1,
      nextNumber: 50,
      resetYearly: false,
      includeYear: false,
    },
  })

  await prisma.invoiceSequence.upsert({
    where: { key: 'PURCHASE' },
    update: {},
    create: {
      key: 'PURCHASE',
      label: "Factures d'achat",
      prefix: 'FAC-A-',
      suffix: '',
      padding: 4,
      nextNumber: 1,
      resetYearly: false,
      includeYear: false,
    },
  })

  // --- Compte administrateur ----------------------------------------------
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@mzexport.tn').toLowerCase()
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMoi!2026'

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Administrateur MZ EXPORT',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'ADMIN',
    },
  })

  console.log('Seed terminé — données réelles uniquement.')
  console.log(`  Administrateur : ${adminEmail}`)
  console.log(`  Mot de passe   : ${adminPassword}`)
  console.log('  Clients, produits, fournisseurs et factures se saisissent depuis l’application.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
