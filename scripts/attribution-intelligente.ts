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

async function attributionIntelligente() {
  console.log('🏦 Attribution intelligente 2026 - Toute l\'année\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    // 1. Mouvements à traiter (toute l'année)
    const mouvements = await client.query(`
      SELECT id, date, amount, label, bank
      FROM bank_movements
      WHERE status = 'PENDING' AND amount < 0
      AND date >= '2026-01-01'
      ORDER BY date DESC
    `)

    console.log(`📋 ${mouvements.rows.length} mouvements à attribuer\n`)

    // 2. Achats à payer
    const achats = await client.query(`
      SELECT id, number, "supplierId", "totalTtc", date
      FROM purchases
      WHERE status IN ('CONFIRMED', 'PARTIALLY_PAID')
      AND date >= '2026-01-01'
      ORDER BY date DESC
    `)

    // 3. Transport à payer
    const transports = await client.query(`
      SELECT id, number, "totalTtc", date
      FROM transport_invoices
      WHERE status IN ('DRAFT', 'PARTIALLY_PAID')
      AND date >= '2026-01-01'
      ORDER BY date DESC
    `)

    console.log(`📦 ${achats.rows.length} achats à payer`)
    console.log(`🚚 ${transports.rows.length} transports à payer\n`)

    let attributions = 0
    const nonAttribues = []

    // Appairage par montant exact + tolérance
    for (const mouvement of mouvements.rows) {
      const montantAbsolu = Math.abs(Number(mouvement.amount))
      let attribute = false

      // Cherche un achat proche
      for (let i = 0; i < achats.rows.length; i++) {
        const achat = achats.rows[i]
        const montantAchat = Number(achat.totalTtc)
        const ecart = Math.abs(montantAbsolu - montantAchat)

        if (ecart < 1) { // Tolérance 1 TND
          console.log(`✅ Mouvement ${montantAbsolu.toFixed(3)} → Achat ${achat.number} (écart: ${ecart.toFixed(3)})`)

          // Crée le paiement
          await client.query(
            `INSERT INTO purchase_payments (id, "purchaseId", amount, "currencyCode", date, method, "bankMovementId", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 'TND', $4, 'BANK_TRANSFER', $5, now(), now())`,
            [
              crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
              achat.id,
              montantAbsolu,
              mouvement.date,
              mouvement.id
            ]
          )

          // Marque le mouvement comme attribué
          await client.query(
            `UPDATE bank_movements SET status = 'ATTRIBUTED' WHERE id = $1`,
            [mouvement.id]
          )

          achats.rows.splice(i, 1)
          attributions++
          attribute = true
          break
        }
      }

      // Sinon cherche un transport proche
      if (!attribute) {
        for (let i = 0; i < transports.rows.length; i++) {
          const transport = transports.rows[i]
          const montantTransport = Number(transport.totalTtc)
          const ecart = Math.abs(montantAbsolu - montantTransport)

          if (ecart < 1) {
            console.log(`✅ Mouvement ${montantAbsolu.toFixed(3)} → Transport ${transport.number} (écart: ${ecart.toFixed(3)})`)

            // Crée le paiement
            await client.query(
              `INSERT INTO transport_payments (id, "transportInvoiceId", amount, "currencyCode", date, method, "bankMovementId", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, 'TND', $4, 'BANK_TRANSFER', $5, now(), now())`,
              [
                crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
                transport.id,
                montantAbsolu,
                mouvement.date,
                mouvement.id
              ]
            )

            // Marque le mouvement comme attribué
            await client.query(
              `UPDATE bank_movements SET status = 'ATTRIBUTED' WHERE id = $1`,
              [mouvement.id]
            )

            transports.rows.splice(i, 1)
            attributions++
            attribute = true
            break
          }
        }
      }

      if (!attribute) {
        nonAttribues.push({
          montant: montantAbsolu,
          label: mouvement.label,
          date: mouvement.date
        })
      }
    }

    console.log(`\n✅ ${attributions} attributions créées\n`)
    console.log(`⚠️  ${nonAttribues.length} mouvements restent sans attribution\n`)

    if (nonAttribues.length > 0 && nonAttribues.length <= 10) {
      console.log('Non attribués:')
      nonAttribues.forEach(m => {
        console.log(`  - ${m.montant.toFixed(3)} TND | ${m.date} | ${m.label.substring(0, 50)}`)
      })
    }

  } finally {
    await client.end()
  }
}

attributionIntelligente().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
