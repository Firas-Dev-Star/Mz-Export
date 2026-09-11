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

async function attributeJuly() {
  console.log('🏦 Attribution bancaire juillet 2026\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    console.log('📊 Récupération des données...\n')

    // Mouvements bancaires à attribuer
    const movements = await client.query(`
      SELECT id, date, amount, label, reference
      FROM bank_movements
      WHERE date >= '2026-07-01' AND date < '2026-08-01'
      AND status = 'PENDING'
      AND amount < 0
      ORDER BY amount DESC
    `)

    console.log(`📋 ${movements.rows.length} mouvements en attente (débits)\n`)

    // Achats à payer
    const purchases = await client.query(`
      SELECT id, number, "supplierId", "totalTtc", date
      FROM purchases
      WHERE date >= '2026-07-01' AND date < '2026-08-01'
      AND status = 'CONFIRMED'
      ORDER BY "totalTtc" DESC
    `)

    console.log(`📦 ${purchases.rows.length} achats à payer\n`)

    // Transport à payer
    const transport = await client.query(`
      SELECT id, number, "totalTtc", date
      FROM transport_invoices
      WHERE date >= '2026-07-01' AND date < '2026-08-01'
      AND status = 'DRAFT'
      ORDER BY "totalTtc" DESC
    `)

    console.log(`🚚 ${transport.rows.length} transports à payer\n`)

    // Résumé des montants
    const movementsTotal = movements.rows.reduce((s, m) => s + Math.abs(Number(m.amount)), 0)
    const purchasesTotal = purchases.rows.reduce((s, p) => s + Number(p.totalTtc), 0)
    const transportTotal = transport.rows.reduce((s, t) => s + Number(t.totalTtc), 0)

    console.log(`💰 Débits bancaires    : ${movementsTotal.toLocaleString('fr-FR')} TND`)
    console.log(`💰 Achats à payer      : ${purchasesTotal.toLocaleString('fr-FR')} TND`)
    console.log(`💰 Transport à payer   : ${transportTotal.toLocaleString('fr-FR')} TND`)
    console.log(`💰 Total dû            : ${(purchasesTotal + transportTotal).toLocaleString('fr-FR')} TND`)

    // Appairage intelligent
    console.log('\n🔗 Appairage des mouvements...\n')

    const attributed = []

    // 1. Mouvements proches du montant total des achats/transport
    for (const movement of movements.rows) {
      const amount = Math.abs(Number(movement.amount))

      // Cherche un achat proche
      for (const purchase of purchases.rows) {
        const purchaseAmount = Number(purchase.totalTtc)
        if (Math.abs(amount - purchaseAmount) < 10) { // Tolérance 10 TND
          console.log(`✅ Mouvement ${movement.id.substring(0, 8)}... (${amount}) → Achat ${purchase.number}`)
          attributed.push({ movementId: movement.id, purchaseId: purchase.id, amount })
          purchases.rows = purchases.rows.filter(p => p.id !== purchase.id)
          break
        }
      }

      // Sinon cherche un transport proche
      if (!attributed.find(a => a.movementId === movement.id)) {
        for (const t of transport.rows) {
          const tAmount = Number(t.totalTtc)
          if (Math.abs(amount - tAmount) < 10) {
            console.log(`✅ Mouvement ${movement.id.substring(0, 8)}... (${amount}) → Transport ${t.number}`)
            attributed.push({ movementId: movement.id, transportId: t.id, amount })
            transport.rows = transport.rows.filter(tr => tr.id !== t.id)
            break
          }
        }
      }
    }

    console.log(`\n📝 ${attributed.length} attributions trouvées\n`)

  } finally {
    await client.end()
  }
}

attributeJuly().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
