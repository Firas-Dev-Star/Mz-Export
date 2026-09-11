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

async function marquerMouvements() {
  console.log('🏦 Marquage des mouvements bancaires attribués...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    // Récupérer les paiements déjà créés avec la mention du lettrage
    const result = await client.query(`
      SELECT DISTINCT
        date,
        amount,
        currencyCode,
        note
      FROM (
        SELECT date, CAST(amount AS NUMERIC) * -1 AS amount, 'TND' AS currencyCode, note
        FROM purchase_payments
        WHERE note LIKE '%Rapprochement bancaire%'

        UNION

        SELECT date, CAST(amount AS NUMERIC) * -1 AS amount, 'TND' AS currencyCode, note
        FROM transport_payments
        WHERE note LIKE '%Rapprochement bancaire%'

        UNION

        SELECT date, CAST(amount AS NUMERIC), 'TND' AS currencyCode, note
        FROM payments
        WHERE note LIKE '%Rapprochement bancaire%'
      ) combined
    `)

    console.log(`📝 ${result.rows.length} paiements avec "Rapprochement bancaire" trouvés\n`)

    let marked = 0

    // Pour chaque paiement, trouver et marquer le mouvement bancaire correspondant
    for (const payment of result.rows) {
      const tolerance = 1 // 1 TND tolerance

      // Chercher un mouvement qui match par date et montant
      const movement = await client.query(
        `SELECT id, status FROM bank_movements
         WHERE date = $1::DATE
         AND ABS(CAST(amount AS NUMERIC) - $2::NUMERIC) < $3
         LIMIT 1`,
        [payment.date, payment.amount, tolerance]
      )

      if (movement.rows.length > 0) {
        const mov = movement.rows[0]
        if (mov.status !== 'ATTRIBUTED') {
          await client.query(
            'UPDATE bank_movements SET status = $1 WHERE id = $2',
            ['ATTRIBUTED', mov.id]
          )
          marked++
        }
      }
    }

    console.log(`✅ ${marked} mouvements marqués comme ATTRIBUTED\n`)

    // Afficher les stats finales
    const stats = await client.query(`
      SELECT status, COUNT(*) as count FROM bank_movements GROUP BY status ORDER BY status
    `)

    console.log('📊 État final des mouvements bancaires:')
    stats.rows.forEach((r: any) => {
      console.log(`   ${r.status}: ${r.count}`)
    })

  } finally {
    await client.end()
  }
}

marquerMouvements().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
