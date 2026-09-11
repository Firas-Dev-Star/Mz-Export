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

async function listClients() {
  console.log('🔍 Lecture de la configuration du poste...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  console.log('📋 Clients actuels :\n')

  try {
    const result = await client.query(
      'SELECT id, code, "companyName" FROM customers ORDER BY "companyName"'
    )

    if (result.rows.length === 0) {
      console.log('❌ Aucun client trouvé')
    } else {
      result.rows.forEach((row, i) => {
        console.log(`${i + 1}. ${row.companyName} (code: ${row.code})`)
      })
    }
  } finally {
    await client.end()
  }
}

listClients().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
