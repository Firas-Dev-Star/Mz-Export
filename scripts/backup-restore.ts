import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { Client } from 'pg'
import { execSync } from 'node:child_process'

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

async function backupRestoreClients() {
  console.log('📦 Sauvegarde des données clients d\'aujourd\'hui...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  let clientsData: any[] = []

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    // Exporter les données clients d'aujourd'hui
    const result = await client.query(`
      SELECT id, "addressLine1", "addressLine2", "postalCode", "city", "country", "phone", "eori", "siret", "vatNumber"
      FROM customers
      WHERE "companyName" IN ('TUNISIACORT', 'MALISHOP', 'WIDA', 'SEMI FERMETURE', 'SARA', 'SABRI')
    `)

    clientsData = result.rows
    writeFileSync('clients-backup-today.json', JSON.stringify(clientsData, null, 2))
    console.log(`✅ ${clientsData.length} clients sauvegardés dans clients-backup-today.json\n`)

  } finally {
    await client.end()
  }

  // Restaurer la sauvegarde d'hier
  console.log('⏮️  Restauration de la sauvegarde d\'hier...\n')
  const backupPath = path.join(process.env.APPDATA || '', 'mz-export-gestion', 'sauvegardes', 'avant-lettrage-2026-09-10-19-13-21.dump')
  const pgPath = 'C:\\dev\\mz-export\\vendor\\pgsql\\bin'

  try {
    const cmd = `"${path.join(pgPath, 'pg_restore.exe')}" --clean --if-exists -h 127.0.0.1 -U ${config.embedded.user} -d ${config.embedded.database} -p ${config.embedded.port} "${backupPath}"`

    process.env.PGPASSWORD = config.embedded.password
    execSync(cmd, { stdio: 'inherit' })
    console.log('\n✅ Restauration terminée\n')
  } catch (err) {
    console.error('❌ Erreur lors de la restauration:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  // Réappliquer les données clients
  console.log('📝 Réapplication des données clients d\'aujourd\'hui...\n')
  const client2 = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client2.connect()

  try {
    for (const c of clientsData) {
      await client2.query(
        `UPDATE customers SET
          "addressLine1" = $1,
          "addressLine2" = $2,
          "postalCode" = $3,
          "city" = $4,
          "country" = $5,
          "phone" = $6,
          "eori" = $7,
          "siret" = $8,
          "vatNumber" = $9,
          "updatedAt" = now()
        WHERE id = $10`,
        [c.addressLine1, c.addressLine2, c.postalCode, c.city, c.country, c.phone, c.eori, c.siret, c.vatNumber, c.id]
      )
    }
    console.log(`✅ ${clientsData.length} clients réappliqués\n`)
  } finally {
    await client2.end()
  }

  console.log('🎉 Opération terminée !\n')
  console.log('✅ Données bancaires d\'hier + Données clients d\'aujourd\'hui')
}

backupRestoreClients().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
