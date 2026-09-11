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

async function rattacherBankMovementId() {
  console.log('🔗 Rattachement des bankMovementId aux paiements...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    let updates = 0

    // 1. Purchase payments
    const purchases = await client.query(`
      SELECT pp.id, pp.amount, pp.date, pp.note
      FROM "purchase_payments" pp
      WHERE pp."bankMovementId" IS NULL
      AND pp."note" LIKE 'Rapprochement bancaire%'
    `)

    console.log(`📦 ${purchases.rows.length} purchase payments sans bankMovementId\n`)

    for (const payment of purchases.rows) {
      // Match movement by date and amount (with tolerance)
      const movement = await client.query(
        `SELECT id FROM bank_movements
         WHERE date = $1 AND amount < 0
         AND ABS(CAST(amount AS NUMERIC) + $2::NUMERIC) < 1
         LIMIT 1`,
        [payment.date, payment.amount]
      )

      if (movement.rows.length > 0) {
        const result = await client.query(
          `UPDATE purchase_payments SET "bankMovementId" = $1 WHERE id = $2`,
          [movement.rows[0].id, payment.id]
        )
        if ((result.rowCount ?? 0) > 0) {
          updates++
        }
      }
    }

    // 2. Transport payments
    const transports = await client.query(`
      SELECT tp.id, tp.amount, tp.date, tp.note
      FROM "transport_payments" tp
      WHERE tp."bankMovementId" IS NULL
      AND tp."note" LIKE 'Rapprochement bancaire%'
    `)

    console.log(`🚚 ${transports.rows.length} transport payments sans bankMovementId\n`)

    for (const payment of transports.rows) {
      const movement = await client.query(
        `SELECT id FROM bank_movements
         WHERE date = $1 AND amount < 0
         AND ABS(CAST(amount AS NUMERIC) + $2::NUMERIC) < 1
         LIMIT 1`,
        [payment.date, payment.amount]
      )

      if (movement.rows.length > 0) {
        const result = await client.query(
          `UPDATE transport_payments SET "bankMovementId" = $1 WHERE id = $2`,
          [movement.rows[0].id, payment.id]
        )
        if ((result.rowCount ?? 0) > 0) {
          updates++
        }
      }
    }

    // 3. Invoice payments (client encaissements)
    const invoices = await client.query(`
      SELECT p.id, p.amount, p.date, p.note
      FROM "payments" p
      WHERE p."bankMovementId" IS NULL
      AND p."note" LIKE 'Rapprochement bancaire%'
    `)

    console.log(`💰 ${invoices.rows.length} invoice payments sans bankMovementId\n`)

    for (const payment of invoices.rows) {
      // For customer payments, look for positive amounts
      const movement = await client.query(
        `SELECT id FROM bank_movements
         WHERE date = $1 AND amount > 0
         AND ABS(CAST(amount AS NUMERIC) - $2::NUMERIC) < 1
         LIMIT 1`,
        [payment.date, payment.amount]
      )

      if (movement.rows.length > 0) {
        const result = await client.query(
          `UPDATE payments SET "bankMovementId" = $1 WHERE id = $2`,
          [movement.rows[0].id, payment.id]
        )
        if ((result.rowCount ?? 0) > 0) {
          updates++
        }
      }
    }

    console.log(`\n✅ ${updates} bankMovementId liés\n`)

    // Mark movements as ATTRIBUTED
    const attributed = await client.query(`
      SELECT COUNT(DISTINCT "bankMovementId") as count
      FROM (
        SELECT "bankMovementId" FROM purchase_payments WHERE "bankMovementId" IS NOT NULL
        UNION
        SELECT "bankMovementId" FROM transport_payments WHERE "bankMovementId" IS NOT NULL
        UNION
        SELECT "bankMovementId" FROM payments WHERE "bankMovementId" IS NOT NULL
      ) t
    `)

    console.log(`🔄 Marquage de ${attributed.rows[0].count} mouvements comme ATTRIBUTED...`)

    const markResult = await client.query(`
      UPDATE bank_movements
      SET status = 'ATTRIBUTED'
      WHERE id IN (
        SELECT "bankMovementId" FROM purchase_payments WHERE "bankMovementId" IS NOT NULL
        UNION
        SELECT "bankMovementId" FROM transport_payments WHERE "bankMovementId" IS NOT NULL
        UNION
        SELECT "bankMovementId" FROM payments WHERE "bankMovementId" IS NOT NULL
      )
      AND status != 'ATTRIBUTED'
    `)

    console.log(`✅ ${markResult.rowCount ?? 0} mouvements marqués comme ATTRIBUTED\n`)

    // Display final stats
    const stats = await client.query(`
      SELECT status, COUNT(*) as count FROM bank_movements GROUP BY status ORDER BY status
    `)

    console.log('📊 État final des mouvements:')
    stats.rows.forEach((r: any) => {
      console.log(`   ${r.status}: ${r.count}`)
    })

  } finally {
    await client.end()
  }
}

rattacherBankMovementId().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
