import path from 'node:path'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function readDesktopConfig() {
  const configPath = path.join(process.env.APPDATA || '', 'mz-export-gestion', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  return config
}

function getDatabaseUrl(config: any) {
  if (config.mode === 'remote') return config.remoteUrl
  const { user, password, port, database } = config.embedded
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`
}

async function addColumn() {
  console.log('🔧 Ajout des colonnes bankMovementId...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    // Vérifier et ajouter la colonne à purchase_payments
    console.log('Vérification de purchase_payments...')
    const checkPurchase = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='purchase_payments' AND column_name='bankMovementId'
    `)

    if (checkPurchase.rows.length === 0) {
      console.log('  ❌ Colonne manquante, ajout...')
      await client.query(`
        ALTER TABLE purchase_payments ADD COLUMN "bankMovementId" TEXT
      `)
      console.log('  ✅ Colonne ajoutée\n')
    } else {
      console.log('  ✅ Colonne existe déjà\n')
    }

    // Vérifier et ajouter la colonne à transport_payments
    console.log('Vérification de transport_payments...')
    const checkTransport = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='transport_payments' AND column_name='bankMovementId'
    `)

    if (checkTransport.rows.length === 0) {
      console.log('  ❌ Colonne manquante, ajout...')
      await client.query(`
        ALTER TABLE transport_payments ADD COLUMN "bankMovementId" TEXT
      `)
      console.log('  ✅ Colonne ajoutée\n')
    } else {
      console.log('  ✅ Colonne existe déjà\n')
    }

    console.log('✅ Opération terminée!')
  } finally {
    await client.end()
  }
}

addColumn().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
