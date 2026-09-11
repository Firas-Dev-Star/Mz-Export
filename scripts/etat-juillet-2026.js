// Photographie de juillet 2026, en LECTURE SEULE, pour rapprochement bancaire.
//
// Aucune ecriture : uniquement des SELECT. Le script lit la configuration du
// poste pour se connecter a la base locale, exactement comme l'application.
//
// A LANCER DEPUIS TON POSTE :
//   node "C:\dev\mz-export\scripts\etat-juillet-2026.js"

const path = require('node:path')
const { readConfig, databaseUrl } = require(path.join(__dirname, '..', 'electron', 'config'))
const { Client } = require(path.join(__dirname, '..', 'node_modules', 'pg'))

const DEBUT = '2026-07-01'
const FIN = '2026-07-31'

const fr = (n) =>
  Number(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

function titre(t) {
  console.log('')
  console.log('=== ' + t + ' ===')
}

async function main() {
  const config = readConfig(path.join(process.env.APPDATA, 'mz-export-gestion'))
  const client = new Client({ connectionString: databaseUrl(config), connectionTimeoutMillis: 15000 })
  await client.connect()

  try {
    titre('VENTES — factures datees de juillet 2026')
    const ventes = await client.query(
      `SELECT status, "currencyCode", count(*)::int AS nb,
              sum("netToPay") AS net, sum("paidAmount") AS regle, sum("balanceDue") AS reste
         FROM invoices
        WHERE date BETWEEN $1 AND $2
        GROUP BY status, "currencyCode" ORDER BY status`,
      [DEBUT, FIN],
    )
    for (const r of ventes.rows) {
      console.log(
        `  ${r.status.padEnd(10)} ${r.currencyCode}  ${String(r.nb).padStart(3)} facture(s)` +
          `  net ${fr(r.net).padStart(14)}  regle ${fr(r.regle).padStart(14)}  reste ${fr(r.reste).padStart(14)}`,
      )
    }

    titre('ACHATS — factures datees de juillet 2026')
    const achats = await client.query(
      `SELECT status, "currencyCode", count(*)::int AS nb,
              sum("netToPay") AS net, sum("paidAmount") AS regle, sum("balanceDue") AS reste
         FROM purchases
        WHERE date BETWEEN $1 AND $2
        GROUP BY status, "currencyCode" ORDER BY status`,
      [DEBUT, FIN],
    )
    for (const r of achats.rows) {
      console.log(
        `  ${r.status.padEnd(10)} ${r.currencyCode}  ${String(r.nb).padStart(3)} facture(s)` +
          `  net ${fr(r.net).padStart(14)}  regle ${fr(r.regle).padStart(14)}  reste ${fr(r.reste).padStart(14)}`,
      )
    }

    titre('ENCAISSEMENTS CLIENTS — juillet 2026')
    const enc = await client.query(
      `SELECT date, method, amount, reference
         FROM payments WHERE date BETWEEN $1 AND $2 ORDER BY date`,
      [DEBUT, FIN],
    )
    let totalEnc = 0
    for (const r of enc.rows) {
      totalEnc += Number(r.amount)
      console.log(
        `  ${r.date.toISOString().slice(0, 10)}  ${String(r.method).padEnd(14)}` +
          `  ${fr(r.amount).padStart(14)}  ${r.reference ?? ''}`,
      )
    }
    console.log(`  ${enc.rows.length} encaissement(s), total ${fr(totalEnc)}`)

    titre('REGLEMENTS FOURNISSEURS — juillet 2026')
    const reg = await client.query(
      `SELECT date, method, amount, reference
         FROM purchase_payments WHERE date BETWEEN $1 AND $2 ORDER BY date`,
      [DEBUT, FIN],
    )
    let totalReg = 0
    for (const r of reg.rows) {
      totalReg += Number(r.amount)
      console.log(
        `  ${r.date.toISOString().slice(0, 10)}  ${String(r.method).padEnd(14)}` +
          `  ${fr(r.amount).padStart(14)}  ${r.reference ?? ''}`,
      )
    }
    console.log(`  ${reg.rows.length} reglement(s), total ${fr(totalReg)}`)

    titre('TRANSPORT — factures et reglements de juillet 2026')
    const tr = await client.query(
      `SELECT count(*)::int AS nb, sum("netToPay") AS net, sum("paidAmount") AS regle
         FROM transport_invoices WHERE date BETWEEN $1 AND $2`,
      [DEBUT, FIN],
    )
    const t = tr.rows[0]
    console.log(`  ${t.nb} facture(s)  net ${fr(t.net)}  regle ${fr(t.regle)}`)
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((e) => {
  console.error('ECHEC : ' + e.message)
  process.exit(1)
})
