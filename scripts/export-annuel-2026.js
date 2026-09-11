// Photographie complete de l'exercice 2026 pour rapprochement bancaire.
// LECTURE SEULE : uniquement des SELECT. Ecrit un fichier CSV par nature
// a cote du script, plus un resume a l'ecran.
//
//   node "C:\dev\mz-export\scripts\export-annuel-2026.js"

const fs = require('node:fs')
const path = require('node:path')
const { readConfig, databaseUrl } = require(path.join(__dirname, '..', 'electron', 'config'))
const { Client } = require(path.join(__dirname, '..', 'node_modules', 'pg'))

const DEBUT = '2026-01-01'
const FIN = '2026-12-31'
const SORTIE = path.join(__dirname, '..', 'dist-desktop', 'rapprochement')

const fr = (n) =>
  Number(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

function ecrireCsv(nom, colonnes, lignes) {
  fs.mkdirSync(SORTIE, { recursive: true })
  const echappe = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const contenu =
    colonnes.join(';') + '\n' + lignes.map((l) => l.map(echappe).join(';')).join('\n')
  // BOM UTF-8 : sans lui Excel affiche mal les accents.
  fs.writeFileSync(path.join(SORTIE, nom), '\ufeff' + contenu, 'utf8')
  console.log('  ecrit : ' + path.join(SORTIE, nom) + '  (' + lignes.length + ' lignes)')
}

async function main() {
  const config = readConfig(path.join(process.env.APPDATA, 'mz-export-gestion'))
  const client = new Client({ connectionString: databaseUrl(config), connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    const ventes = await client.query(
      `SELECT i.number, i.date, i.status, i."currencyCode", i."netToPay", i."paidAmount",
              i."balanceDue", i."exchangeRateTnd", i."netToPayTnd", c."companyName"
         FROM invoices i JOIN customers c ON c.id = i."customerId"
        WHERE i.date BETWEEN $1 AND $2 ORDER BY i.date, i.number`,
      [DEBUT, FIN],
    )
    ecrireCsv(
      'ventes-2026.csv',
      ['numero', 'date', 'client', 'statut', 'devise', 'net', 'regle', 'reste', 'taux', 'net_tnd'],
      ventes.rows.map((r) => [
        r.number, r.date.toISOString().slice(0, 10), r.companyName, r.status, r.currencyCode,
        r.netToPay, r.paidAmount, r.balanceDue, r.exchangeRateTnd, r.netToPayTnd,
      ]),
    )

    const achats = await client.query(
      `SELECT p.number, p."supplierReference", p.date, p.status, p."currencyCode",
              p."netToPay", p."paidAmount", p."balanceDue", p."withholdingAmount", s."companyName"
         FROM purchases p JOIN suppliers s ON s.id = p."supplierId"
        WHERE p.date BETWEEN $1 AND $2 ORDER BY p.date, p.number`,
      [DEBUT, FIN],
    )
    ecrireCsv(
      'achats-2026.csv',
      ['numero', 'ref_fournisseur', 'date', 'fournisseur', 'statut', 'devise', 'net', 'regle', 'reste', 'retenue'],
      achats.rows.map((r) => [
        r.number, r.supplierReference, r.date.toISOString().slice(0, 10), r.companyName, r.status,
        r.currencyCode, r.netToPay, r.paidAmount, r.balanceDue, r.withholdingAmount,
      ]),
    )

    const encaissements = await client.query(
      `SELECT p.date, p.amount, p.method, p.reference, i.number, i."currencyCode", c."companyName"
         FROM payments p JOIN invoices i ON i.id = p."invoiceId"
                          JOIN customers c ON c.id = i."customerId"
        WHERE p.date BETWEEN $1 AND $2 ORDER BY p.date`,
      [DEBUT, FIN],
    )
    ecrireCsv(
      'encaissements-2026.csv',
      ['date', 'client', 'facture', 'devise', 'montant', 'mode', 'reference'],
      encaissements.rows.map((r) => [
        r.date.toISOString().slice(0, 10), r.companyName, r.number, r.currencyCode, r.amount, r.method, r.reference,
      ]),
    )

    const reglements = await client.query(
      `SELECT pp.date, pp.amount, pp.method, pp.reference, p.number, s."companyName"
         FROM purchase_payments pp JOIN purchases p ON p.id = pp."purchaseId"
                                   JOIN suppliers s ON s.id = p."supplierId"
        WHERE pp.date BETWEEN $1 AND $2 ORDER BY pp.date`,
      [DEBUT, FIN],
    )
    ecrireCsv(
      'reglements-fournisseurs-2026.csv',
      ['date', 'fournisseur', 'facture', 'montant', 'mode', 'reference'],
      reglements.rows.map((r) => [
        r.date.toISOString().slice(0, 10), r.companyName, r.number, r.amount, r.method, r.reference,
      ]),
    )

    const soldes = await client.query(
      `SELECT s."companyName", count(*)::int AS nb,
              sum(p."netToPay") AS facture, sum(p."paidAmount") AS regle, sum(p."balanceDue") AS reste
         FROM purchases p JOIN suppliers s ON s.id = p."supplierId"
        WHERE p.status NOT IN ('DRAFT','CANCELLED')
        GROUP BY s."companyName" ORDER BY sum(p."balanceDue") DESC`,
    )
    console.log('')
    console.log('=== SOLDES FOURNISSEURS (toutes periodes) ===')
    for (const r of soldes.rows) {
      console.log(
        '  ' + String(r.companyName).slice(0, 28).padEnd(28) + String(r.nb).padStart(4) + ' facture(s)' +
          '  facture ' + fr(r.facture).padStart(16) + '  regle ' + fr(r.regle).padStart(12) +
          '  reste ' + fr(r.reste).padStart(16),
      )
    }
    ecrireCsv(
      'soldes-fournisseurs.csv',
      ['fournisseur', 'nb_factures', 'total_facture', 'total_regle', 'reste_du'],
      soldes.rows.map((r) => [r.companyName, r.nb, r.facture, r.regle, r.reste]),
    )
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((e) => {
  console.error('ECHEC : ' + e.message)
  process.exit(1)
})
