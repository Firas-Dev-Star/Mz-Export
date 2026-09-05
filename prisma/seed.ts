import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { CURRENCIES, COMPANY, SEQUENCES, adminAccount } from './seed-data.cjs'

/**
 * Seed de la base MZ EXPORT.
 *
 * Ce script ne cree QUE les donnees reelles indispensables au demarrage :
 *   - les devises (EUR, TND, USD, GBP)
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
  for (const currency of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {},
      create: currency,
    })
  }

  // --- Taux de change ------------------------------------------------------
  // AUCUN taux n'est cree automatiquement : un taux invente produirait des
  // bilans faux sans que personne ne s'en apercoive. Ils se saisissent dans
  // Parametres -> Taux de change, avec leur date d'entree en vigueur.

  // --- Parametres societe (donnees reelles) -------------------------------
  await prisma.company.upsert({
    where: { id: COMPANY.id },
    update: {},
    create: COMPANY as never,
  })

  // --- Sequences de numerotation ------------------------------------------
  for (const sequence of SEQUENCES) {
    await prisma.invoiceSequence.upsert({
      where: { key: sequence.key },
      update: {},
      create: sequence,
    })
  }

  // --- Compte administrateur ----------------------------------------------
  const admin = adminAccount()
  const adminEmail = admin.email
  const adminPassword = admin.password

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: admin.name,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: admin.role as never,
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
