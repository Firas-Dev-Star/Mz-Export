'use strict'

/**
 * Donnees de reference indispensables au demarrage.
 *
 * SOURCE UNIQUE, consommee par deux chemins :
 *
 *   - `prisma/seed.ts`         via Prisma Client (`npm run db:seed`)
 *   - `electron/bootstrap.js`  via `pg`, au premier lancement du logiciel
 *
 * Pourquoi deux chemins : dans l'application empaquetee, ni la CLI Prisma ni le
 * client genere ne sont livres — les embarquer tirerait un graphe de
 * dependances impossible a maintenir. Le bootstrap parle donc directement a
 * PostgreSQL. Mais les DONNEES, elles, ne sont ecrites qu'ici : une installation
 * desktop et une installation web partent des memes parametres.
 *
 * Format CommonJS (.cjs) pour etre `require`-able depuis le processus principal
 * Electron autant qu'importable depuis TypeScript.
 */

/** Devises actives. Aucun taux de change n'est cree : cf. seed.ts. */
const CURRENCIES = [
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'TND', name: 'Dinar tunisien', symbol: 'DT', decimals: 3 },
  { code: 'USD', name: 'Dollar americain', symbol: '$', decimals: 2 },
  { code: 'GBP', name: 'Livre sterling', symbol: '£', decimals: 2 },
]

/**
 * Parametres societe, releves sur la facture papier n 49.
 *
 * ATTENTION : certaines informations de la facture scannee sont partiellement
 * lisibles (telephones et fax notamment). Elles sont saisies au plus proche et
 * doivent etre verifiees dans Parametres > Entreprise.
 */
const COMPANY = {
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
  paymentNotice:
    'Veuillez nous faire le règlement de cette facture sur notre compte suivant :',
  legalMentions: '',
  footerText:
    'Siège social : Rue Jamel Abdenaceur - Zeramdine 5040 - Monastir / Tunisie',
}

/**
 * Sequences de numerotation.
 *
 * La derniere facture de vente papier de MZ EXPORT est la n 49 : la suivante
 * sera donc la 50. Le format est modifiable dans Parametres > Numerotation.
 */
const SEQUENCES = [
  {
    key: 'SALE',
    label: 'Factures de vente',
    prefix: '',
    suffix: '',
    padding: 1,
    nextNumber: 50,
    resetYearly: false,
    includeYear: false,
  },
  {
    key: 'PURCHASE',
    label: "Factures d'achat",
    prefix: 'FAC-A-',
    suffix: '',
    padding: 4,
    nextNumber: 1,
    resetYearly: false,
    includeYear: false,
  },
  {
    key: 'TRANSPORT',
    label: 'Factures de transport',
    prefix: 'TRP-',
    suffix: '',
    padding: 4,
    nextNumber: 1,
    resetYearly: false,
    includeYear: false,
  },
]

/** Compte administrateur. Surchargeable par variables d'environnement. */
function adminAccount(env = process.env) {
  return {
    email: (env.SEED_ADMIN_EMAIL ?? 'admin@mzexport.tn').toLowerCase(),
    password: env.SEED_ADMIN_PASSWORD ?? 'ChangeMoi!2026',
    name: 'Zied GACEM',
    role: 'ADMIN',
  }
}

module.exports = { CURRENCIES, COMPANY, SEQUENCES, adminAccount }
