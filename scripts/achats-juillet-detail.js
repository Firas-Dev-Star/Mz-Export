// Detail des achats et du transport de juillet 2026, fournisseur par
// fournisseur. Lecture seule : uniquement des SELECT.
//
//   node "C:\dev\mz-export\scripts\achats-juillet-detail.js"

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
    console.log('=== FACTURES D ACHAT DE JUILLET 2026 ===')
    const a = await client.query(
      `SELECT p.number, p."supplierReference", p.date, p."dueDate", p.status, p."currencyCode",
              p."netToPay", p."paidAmount", p."balanceDue", p."withholdingAmount", s."companyName"
         FROM purchases p JOIN suppliers s ON s.id = p."supplierId"
        WHERE p.date BETWEEN $1 AND $2 ORDER BY p.date, p.number`,
      [DEBUT, FIN],
    )
    for (const r of a.rows) {
      console.log(
        `  ${r.date.toISOString().slice(0, 10)}  ${String(r.number).padEnd(16)}` +
          `  ${String(r.companyName).slice(0, 24).padEnd(24)}  ${r.currencyCode}` +
          `  net ${fr(r.netToPay).padStart(14)}  regle ${fr(r.paidAmount).padStart(12)}` +
          `  reste ${fr(r.balanceDue).padStart(14)}  ${r.status}`,
      )
      if (Number(r.withholdingAmount) > 0) {
        console.log(`      retenue a la source ${fr(r.withholdingAmount)}`)
      }
      if (r.supplierReference) console.log(`      facture fournisseur : ${r.supplierReference}`)
    }

    console.log('')
    console.log('=== ACHATS ANTERIEURS ENCORE NON REGLES AU 31/07/2026 ===')
    const b = await client.query(
      `SELECT p.number, p.date, p."currencyCode", p."balanceDue", s."companyName"
         FROM purchases p JOIN suppliers s ON s.id = p."supplierId"
        WHERE p.date < $1 AND p.status NOT IN ('DRAFT','CANCELLED') AND p."balanceDue" > 0
        ORDER BY p.date`,
      [DEBUT],
    )
    let reste = 0
    for (const r of b.rows) {
      reste += Number(r.balanceDue)
      console.log(
        `  ${r.date.toISOString().slice(0, 10)}  ${String(r.number).padEnd(16)}` +
          `  ${String(r.companyName).slice(0, 24).padEnd(24)}  ${fr(r.balanceDue).padStart(14)} ${r.currencyCode}`,
      )
    }
    console.log(`  ${b.rows.length} facture(s), reste du ${fr(reste)}`)

    console.log('')
    console.log('=== FACTURES DE TRANSPORT DE JUILLET 2026 ===')
    const t = await client.query(
      `SELECT t.number, t.date, t."currencyCode", t."netToPay", t."paidAmount", t."balanceDue",
              c."companyName"
         FROM transport_invoices t JOIN carriers c ON c.id = t."carrierId"
        WHERE t.date BETWEEN $1 AND $2 ORDER BY t.date`,
      [DEBUT, FIN],
    )
    for (const r of t.rows) {
      console.log(
        `  ${r.date.toISOString().slice(0, 10)}  ${String(r.number).padEnd(16)}` +
          `  ${String(r.companyName).slice(0, 24).padEnd(24)}  ${r.currencyCode}` +
          `  net ${fr(r.netToPay).padStart(12)}  reste ${fr(r.balanceDue).padStart(12)}`,
      )
    }
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((e) => {
  console.error('ECHEC : ' + e.message)
  process.exit(1)
})
