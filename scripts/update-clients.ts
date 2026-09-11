import path from 'node:path'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

// Fonction pour lire la config du desktop
function readDesktopConfig() {
  const configPath = path.join(process.env.APPDATA || '', 'mz-export-gestion', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  return config
}

// Fonction pour construire l'URL de connexion
function getDatabaseUrl(config: any) {
  if (config.mode === 'remote') {
    return config.remoteUrl
  }
  const { user, password, port, database } = config.embedded
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`
}

// Données clients à mettre à jour
const clientsData = [
  {
    companyName: 'TUNISIACORT',
    updates: {
      addressLine1: 'RUA MONSENHOR - JOSE BAPTISTA FERREIRA',
      addressLine2: 'N10 9500-328',
      city: 'PONTA DELGADA',
      postalCode: '9500-328',
      country: 'Portugal',
      phone: '+351911029902',
    },
  },
  {
    companyName: 'MALISHOP',
    updates: {
      addressLine1: '09 RUE JEAN MARIDOR',
      addressLine2: '',
      city: 'PARIS',
      postalCode: '75015',
      country: 'France',
      eori: 'FR89849317600017',
      phone: '+33666746248',
    },
  },
  {
    companyName: 'WIDA',
    updates: {
      addressLine1: '66 AVENUE DES CHAMPS ELYSEEN',
      addressLine2: '',
      city: 'PARIS',
      postalCode: '75008',
      country: 'France',
      siret: '9633559085000014',
      phone: '0629565625',
    },
  },
  {
    companyName: 'SEMI FERMETURE',
    updates: {
      addressLine1: '79 AVENUE PIERRE BROSSOLLETTE',
      addressLine2: '',
      city: 'MONTROUGE',
      postalCode: '92120',
      country: 'France',
      phone: '0667161616',
    },
  },
  {
    companyName: 'SARA',
    updates: {
      addressLine1: 'VIA CESARE BATTISTI 7 INT 6',
      addressLine2: '',
      city: 'BOLOGNA',
      postalCode: '40123',
      country: 'Italie',
      eori: 'IT04009151202',
      phone: '051229274',
    },
  },
  {
    companyName: 'SABRI',
    updates: {
      addressLine1: 'CORSO ITALIE 168/170',
      addressLine2: '',
      city: 'PIOMBINO',
      postalCode: '57025',
      country: 'Italie',
      vatNumber: '0196973D0496',
    },
  },
]

async function updateClients() {
  console.log('🔍 Lecture de la configuration du poste...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  console.log('🔍 Recherche des clients à mettre à jour...\n')

  try {
    for (const clientData of clientsData) {
      const result = await client.query(
        'SELECT id, "companyName" FROM customers WHERE LOWER("companyName") LIKE LOWER($1)',
        [`%${clientData.companyName}%`]
      )

      if (result.rows.length > 0) {
        const customer = result.rows[0]
        console.log(`✏️  Mise à jour de ${customer.companyName}`)

        await client.query(
          `UPDATE customers SET
            "addressLine1" = $1,
            "addressLine2" = $2,
            "city" = $3,
            "postalCode" = $4,
            "country" = $5,
            "phone" = $6,
            "eori" = $7,
            "siret" = $8,
            "vatNumber" = $9,
            "updatedAt" = now()
          WHERE id = $10`,
          [
            clientData.updates.addressLine1 || '',
            clientData.updates.addressLine2 || '',
            clientData.updates.city || '',
            clientData.updates.postalCode || '',
            clientData.updates.country || '',
            clientData.updates.phone || '',
            clientData.updates.eori || '',
            clientData.updates.siret || '',
            clientData.updates.vatNumber || '',
            customer.id,
          ]
        )
        console.log(`   ✓ Mise à jour terminée\n`)
      } else {
        console.log(`⚠️  Client non trouvé: ${clientData.companyName}\n`)
      }
    }

    console.log('✅ Mise à jour des clients terminée!')
  } finally {
    await client.end()
  }
}

updateClients().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
