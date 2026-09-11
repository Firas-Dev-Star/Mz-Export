// Detail des ventes de juillet 2026, facture par facture et reglement par
// reglement, DEVISES COMPRISES. Lecture seule : uniquement des SELECT.
//
//   node "C:\dev\mz-export\scripts\ventes-juillet-detail.js"

const path = require('node:path')
const { readConfig, databaseUrl } = require(path.join(__dirname, '..', 'electron', 'config'))
const { Client } = require(path.join(__dirname, '..', 'node_modules', 'pg'))

const DEBUT = '2026-07-01'
const FIN = '2026-07-31'
const fr = (n) =>
  Number(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

async function main() {
  const config = readConfig(path.join(process.env.APPDATA, 'mz-export-gestion'))
  const client = new Client({ connectionString: databaseUrl(config), connectionTimeoutMillis: 15000 })
  await client.connect()

  try {
    console.log('=== FACTURES DE VENTE DE JUILLET 2026 ===')
    const f = await client.query(
      `SELECT i.number, i.date, i.status, i."currencyCode", i."netToPay", i."paidAmount",
              i."balanceDue", i."exchangeRateTnd", i."netToPayTnd", c."companyName"
         FROM invoices i JOIN customers c ON c.id = i."customerId"
        WHERE i.date BETWEEN $1 AND $2 ORDER BY i.date, i.number`,
      [DEBUT, FIN],
    )
    for (const r of f.rows) {
      console.log(
        `  ${r.date.toISOString().slice(0, 10)}  ${String(r.number).padEnd(14)}` +
          `  ${String(r.companyName).slice(0, 22).padEnd(22)}  ${r.currencyCode}` +
          `  net ${fr(r.netToPay).padStart(12)}  regle ${fr(r.paidAmount).padStart(12)}` +
          `  reste ${fr(r.balanceDue).padStart(12)}  ${r.status}`,
      )
      console.log(
        `      taux TND ${fr(r.exchangeRateTnd)}   contre-valeur TND ${fr(r.netToPayTnd)}`,
      )
    }

    console.log('')
    console.log('=== REGLEMENTS RECUS EN JUILLET 2026 ===')
    const p = await client.query(
      `SELECT p.date, p.amount, p.method, p.reference, i.number, i."currencyCode", i.date AS "dateFacture"
         FROM payments p JOIN invoices i ON i.id = p."invoiceId"
        WHERE p.date BETWEEN $1 AND $2 ORDER BY p.date`,
      [DEBUT, FIN],
    )
    for (const r of p.rows) {
      console.log(
        `  ${r.date.toISOString().slice(0, 10)}  ${fr(r.amount).padStart(12)} ${r.currencyCode}` +
          `  -> facture ${String(r.number).padEnd(14)} du ${r.dateFacture.toISOString().slice(0, 10)}` +
          `  ${r.reference ?? ''}`,
      )
    }

    console.log('')
    console.log('=== REGLEMENTS RECUS EN JUILLET SUR DES FACTURES ANTERIEURES ===')
    const a = await client.query(
      `SELECT count(*)::int AS nb, sum(p.amount) AS total
         FROM payments p JOIN invoices i ON i.id = p."invoiceId"
        WHERE p.date BETWEEN $1 AND $2 AND i.date < $1`,
      [DEBUT, FIN],
    )
    console.log(`  ${a.rows[0].nb} reglement(s), total ${fr(a.rows[0].total)}`)
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((e) => {
  console.error('ECHEC : ' + e.message)
  process.exit(1)
})
