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

async function marquerAttributions() {
  console.log('🏦 Marquage des mouvements attribués...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    // Mouvements qui ont des purchase_payments
    const mouvementsPurchase = await client.query(`
      SELECT DISTINCT "bankMovementId" FROM purchase_payments
      WHERE "bankMovementId" IS NOT NULL
    `)

    // Mouvements qui ont des transport_payments
    const mouvementsTransport = await client.query(`
      SELECT DISTINCT "bankMovementId" FROM transport_payments
      WHERE "bankMovementId" IS NOT NULL
    `)

    // Mouvements qui ont des payments
    const mouvementsPayments = await client.query(`
      SELECT DISTINCT "bankMovementId" FROM payments
      WHERE "bankMovementId" IS NOT NULL
    `)

    const ids = new Set([
      ...mouvementsPurchase.rows.map((r: any) => r.bankMovementId),
      ...mouvementsTransport.rows.map((r: any) => r.bankMovementId),
      ...mouvementsPayments.rows.map((r: any) => r.bankMovementId),
    ])

    console.log(`📝 ${ids.size} mouvements à marquer comme attribués\n`)

    if (ids.size === 0) {
      console.log('✅ Aucun mouvement à marquer')
      return
    }

    // Marquer tous ces mouvements comme ATTRIBUTED
    const result = await client.query(
      `UPDATE bank_movements
       SET status = 'ATTRIBUTED'
       WHERE id = ANY($1::text[]) AND status != 'ATTRIBUTED'`,
      [Array.from(ids)]
    )

    console.log(`✅ ${result.rowCount ?? 0} mouvements marqués comme ATTRIBUTED\n`)

    // Afficher les stats mises à jour
    const stats = await client.query(`
      SELECT status, COUNT(*) as count FROM bank_movements GROUP BY status ORDER BY status
    `)

    console.log('📊 État des mouvements après marquage:')
    stats.rows.forEach((r: any) => {
      console.log(`   ${r.status}: ${r.count}`)
    })

  } finally {
    await client.end()
  }
}

marquerAttributions().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
