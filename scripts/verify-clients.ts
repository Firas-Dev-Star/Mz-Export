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

async function verifyClients() {
  console.log('🔍 Vérification des données client dans la base...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    const result = await client.query(`
      SELECT
        "companyName",
        "addressLine1",
        "addressLine2",
        "postalCode",
        "city",
        "country",
        "phone",
        "eori",
        "siret",
        "vatNumber"
      FROM customers
      WHERE "companyName" IN ('TUNISIACORT', 'MALISHOP', 'WIDA', 'SEMI FERMETURE', 'SARA', 'SABRI')
      ORDER BY "companyName"
    `)

    console.log(`✅ ${result.rows.length} clients trouvés avec leurs données\n`)

    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.companyName}`)
      console.log(`   📍 ${row.addressLine1}${row.addressLine2 ? ', ' + row.addressLine2 : ''}`)
      console.log(`   📍 ${row.postalCode} ${row.city} - ${row.country}`)
      if (row.phone) console.log(`   📱 ${row.phone}`)
      if (row.eori) console.log(`   🏛️  EORI: ${row.eori}`)
      if (row.siret) console.log(`   🏛️  SIRET: ${row.siret}`)
      if (row.vatNumber) console.log(`   🏛️  TVA: ${row.vatNumber}`)
      console.log('')
    })
  } finally {
    await client.end()
  }
}

verifyClients().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
