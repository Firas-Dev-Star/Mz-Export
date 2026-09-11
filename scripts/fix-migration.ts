import path from 'node:path'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function readDesktopConfig() {
  const configPath = path.join(process.env.APPDATA || '', 'mz-export-gestion', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  return config
}

function getDatabaseUrl(config: any) {
  if (config.mode === 'remote') {
    return config.remoteUrl
  }
  const { user, password, port, database } = config.embedded
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`
}

async function fixMigration() {
  console.log('🔧 Correction des migrations...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    // Marquer les migrations comme appliquées
    const migrations = [
      '20260910200000_mouvements_bancaires',
      '20260911100000_encaissements_mouvement_bancaire',
    ]

    for (const migration of migrations) {
      // ID = migration name truncated to 36 chars
      const id = migration.substring(0, 36)
      await client.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES ($1, '', now(), $2, '', NULL, now(), 1)
         ON CONFLICT (id) DO NOTHING`,
        [id, migration]
      )
      console.log(`✅ Migration ${migration} marquée comme appliquée`)
    }

    console.log('\n✅ Migrations corrigées!')
  } finally {
    await client.end()
  }
}

fixMigration().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
