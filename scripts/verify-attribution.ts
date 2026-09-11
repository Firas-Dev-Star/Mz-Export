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

async function verifyAttribution() {
  console.log('🔍 Vérification de l\'attribution bancaire d\'hier...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    // Récupérer les statistiques par statut
    const stats = await client.query(`
      SELECT status, COUNT(*) as count, SUM(ABS(amount)) as total
      FROM bank_movements
      GROUP BY status
      ORDER BY status
    `)

    console.log('📊 Résumé des mouvements bancaires :\n')
    stats.rows.forEach(row => {
      console.log(`  ${row.status.padEnd(12)} : ${String(row.count).padEnd(4)} mouvements - Total: ${Number(row.total).toLocaleString('fr-FR')} TND`)
    })

    // Détails des mouvements attribués
    console.log('\n📋 Détails des mouvements ATTRIBUÉS (hier) :\n')
    const attributed = await client.query(`
      SELECT date, amount, label, category, reference
      FROM bank_movements
      WHERE status = 'ATTRIBUTED'
      ORDER BY date DESC
      LIMIT 10
    `)

    if (attributed.rows.length === 0) {
      console.log('❌ Aucun mouvement attribué trouvé')
    } else {
      attributed.rows.forEach(row => {
        console.log(`  ${row.date} | ${String(row.amount).padStart(12)} | ${row.category.padEnd(20)} | ${row.label.substring(0, 40)}`)
      })
    }

    // Détails des mouvements classés
    console.log('\n📋 Détails des mouvements CLASSÉS (hier) :\n')
    const classified = await client.query(`
      SELECT date, amount, label, category, reference
      FROM bank_movements
      WHERE status = 'IGNORED'
      ORDER BY date DESC
      LIMIT 10
    `)

    if (classified.rows.length === 0) {
      console.log('❌ Aucun mouvement classé trouvé')
    } else {
      classified.rows.forEach(row => {
        console.log(`  ${row.date} | ${String(row.amount).padStart(12)} | ${row.category.padEnd(20)} | ${row.label.substring(0, 40)}`)
      })
    }

  } finally {
    await client.end()
  }
}

verifyAttribution().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
