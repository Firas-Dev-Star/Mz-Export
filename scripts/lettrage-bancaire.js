// Lettrage des reglements fournisseurs a partir des relevés bancaires.
//
// PRINCIPE. Les paiements sont des ACOMPTES sur compte courant : 96 % des
// virements sont des montants ronds, aucun ne correspond a une facture precise.
// On impute donc chaque versement sur les factures les plus anciennes d'abord
// (methode FIFO), a la date reelle du mouvement bancaire.
//
// CE QUI EST EXCLU, ET POURQUOI :
//   - « STE M » : transferts entre les deux comptes de l'entreprise. Verifie
//     quatre fois, date pour date et dinar pour dinar, contre les credits
//     Zitouna « VIR TN AUTRE BQ STE MZ EXPORT ».
//   - NEJI RHAYEM, MADIH, FIRAS : salaires.
//   - Le virement de 56 000,000 du 26/02 libelle « STE » : le nom est tronque,
//     BOUZUITA et ARSENAY sont tous deux plausibles. On n'attribue pas au hasard.
//
// USAGE :
//   node scripts/lettrage-bancaire.js              -> simulation, n'ecrit rien
//   node scripts/lettrage-bancaire.js --appliquer  -> ecrit dans la base

const path = require('node:path')
const fs = require('node:fs')
const ExcelJS = require(path.join(__dirname, '..', 'node_modules', 'exceljs'))
const { readConfig, databaseUrl } = require(path.join(__dirname, '..', 'electron', 'config'))
const { Client } = require(path.join(__dirname, '..', 'node_modules', 'pg'))

const APPLIQUER = process.argv.includes('--appliquer')
const MARQUEUR = 'Rapprochement bancaire 2026'
const FIN = '2026-09-10'

const ATB = process.argv.find((a) => a.startsWith('--atb='))?.slice(6) ??
  'C:/Users/MZEXP/AppData/Local/Temp/Transaction Report.xlsx'
const ZITOUNA = process.argv.find((a) => a.startsWith('--zitouna='))?.slice(10) ??
  'C:/Users/MZEXP/AppData/Local/Temp/LISTE_DES_TRANSACTIONS_STE MZ EXPORT _10_09_2026 (1).xls'

const fr = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const num = (s) => Number(String(s ?? '').replace(/\s|\u00a0/g, '').replace(',', '.')) || 0
const r3 = (n) => Math.round(n * 1000) / 1000

// Libelle bancaire -> tiers dans la base. Ordre significatif.
const TIERS = [
  ['ARSENAY', /STE A(?!\w)|STE ARC|ARCENAY|ARSENAY/i],
  ['MSC', /METAL SE|METAL SERV/i],
  ['METM', /MILITZER/i],
  ['TRANSCARGO', /\bTRANS(?!F)|STE T(?!\w)/i],
  ['JFH', /JFH|STE J(?!\w)/i],
  ['MHK', /MOHAMED/i],
  ['DACHSER', /STE D(?!\w)/i],
  ['VECTORYS', /STE V(?!\w)/i],
  ['SAC', /SOCIETE(?!\s+ARTISANALE)/i],
  ['SAFER', /STE S(?!\w)/i],
]
const EXCLUS = /STE M(?!\w)|NEJI|MADIH|FIRAS|MZ EXPORT/i

async function mouvements() {
  const paiements = []

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(ATB)
  wb.worksheets[0].eachRow({ includeEmpty: false }, (row, n) => {
    if (n <= 10) return
    const v = (i) => {
      let x = row.getCell(i).value
      if (x && typeof x === 'object') x = x.result ?? x.text ?? x
      return x
    }
    const d = String(v(1) ?? '').trim()
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return
    const iso = d.slice(6) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2)
    if (iso > FIN) return
    const m = num(v(5))
    const l = String(v(2) ?? '').trim()
    if (m >= 0 || !/Virement Emis|VirEmis|Vir Emis/i.test(l)) return
    if (EXCLUS.test(l)) return
    const t = TIERS.find(([, re]) => re.test(l))
    if (!t) return
    paiements.push({ tiers: t[0], date: iso, montant: -m, methode: 'BANK_TRANSFER', libelle: l, banque: 'ATB' })
  })

  const brut = fs.readFileSync(ZITOUNA, 'latin1')
  for (const ligne of brut.split('\n').slice(1)) {
    const c = ligne.split('\t')
    if (c.length < 6) continue
    const d = c[0].trim()
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(d)) continue
    const iso = d.slice(6) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2)
    if (iso > FIN) continue
    const montant = num(c[5]) - num(c[4])
    if (montant >= 0) continue
    const l = c[2].trim()
    if (EXCLUS.test(l)) continue
    if (/PAIEMENT EFFET/i.test(l)) {
      // Traites tirees sur Zitouna : SPCM, d'apres l'exploitant.
      paiements.push({ tiers: 'SPCM', date: iso, montant: -montant, methode: 'OTHER', libelle: l, banque: 'Zitouna' })
      continue
    }
    const t = TIERS.find(([, re]) => re.test(l))
    if (t) paiements.push({ tiers: t[0], date: iso, montant: -montant, methode: 'BANK_TRANSFER', libelle: l, banque: 'Zitouna' })
  }

  paiements.sort((a, b) => (a.date < b.date ? -1 : 1))
  return paiements
}

const cleTiers = (nom) => {
  const n = nom.toUpperCase()
  if (/ARSENAY|ARCENAY/.test(n)) return 'ARSENAY'
  if (/\bMSC\b/.test(n)) return 'MSC'
  if (/METM/.test(n)) return 'METM'
  if (/TRANSCARGO/.test(n)) return 'TRANSCARGO'
  if (/JF[HK]/.test(n)) return 'JFH'
  if (/MHK/.test(n)) return 'MHK'
  if (/SPCM/.test(n)) return 'SPCM'
  if (/SAFER/.test(n)) return 'SAFER'
  if (/DACHSER/.test(n)) return 'DACHSER'
  if (/VECTORYS/.test(n)) return 'VECTORYS'
  if (/\bSAC\b/.test(n)) return 'SAC'
  return n
}

async function main() {
  const paiements = await mouvements()
  const config = readConfig(path.join(process.env.APPDATA, 'mz-export-gestion'))
  const client = new Client({ connectionString: databaseUrl(config), connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    const deja = await client.query(
      `SELECT count(*)::int AS n FROM purchase_payments WHERE note = $1
        UNION ALL SELECT count(*)::int FROM transport_payments WHERE note = $1`,
      [MARQUEUR],
    )
    const dejaFait = deja.rows.reduce((s, r) => s + r.n, 0)
    if (dejaFait > 0) {
      console.log(`ARRET : ${dejaFait} reglement(s) portent deja la mention « ${MARQUEUR} ».`)
      console.log('Le lettrage a deja ete applique. Supprimez-les avant de recommencer.')
      return
    }

    const achats = await client.query(
      `SELECT p.id, p.number, p.date::text AS date, p."netToPay"::float8 AS net,
              p."paidAmount"::float8 AS paye, s."companyName" AS tiers, 'achat' AS type
         FROM purchases p JOIN suppliers s ON s.id = p."supplierId"
        WHERE p.status NOT IN ('DRAFT','CANCELLED') ORDER BY p.date, p.number`,
    )
    const transports = await client.query(
      `SELECT i.id, i.number, i.date::text AS date, i."netToPay"::float8 AS net,
              i."paidAmount"::float8 AS paye, c."companyName" AS tiers, 'transport' AS type
         FROM transport_invoices i JOIN carriers c ON c.id = i."carrierId"
        ORDER BY i.date, i.number`,
    )

    const factures = new Map()
    for (const f of [...achats.rows, ...transports.rows]) {
      const k = cleTiers(f.tiers)
      if (!factures.has(k)) factures.set(k, [])
      factures.get(k).push({ ...f, reste: r3(f.net - f.paye) })
    }
    for (const liste of factures.values()) liste.sort((a, b) => (a.date < b.date ? -1 : 1))

    const ecritures = []
    const surplus = []
    for (const p of paiements) {
      let reste = p.montant
      const liste = factures.get(p.tiers) ?? []
      for (const f of liste) {
        if (reste <= 0.0005) break
        if (f.reste <= 0.0005) continue
        const impute = r3(Math.min(reste, f.reste))
        f.reste = r3(f.reste - impute)
        reste = r3(reste - impute)
        ecritures.push({
          type: f.type, factureId: f.id, numero: f.number, tiers: p.tiers,
          date: p.date, montant: impute, methode: p.methode,
          reference: `${p.banque} ${p.date}`, libelle: p.libelle,
        })
      }
      if (reste > 0.0005) surplus.push({ ...p, reste })
    }

    console.log('=== LETTRAGE ' + (APPLIQUER ? '— ECRITURE REELLE' : '— SIMULATION') + ' ===')
    console.log('paiements bancaires retenus : ' + paiements.length + '   total ' +
      fr(r3(paiements.reduce((s, p) => s + p.montant, 0))))
    console.log('ecritures a creer           : ' + ecritures.length + '   total ' +
      fr(r3(ecritures.reduce((s, e) => s + e.montant, 0))))

    console.log('')
    console.log('TIERS'.padEnd(13) + 'FACTURE'.padStart(16) + 'IMPUTE'.padStart(16) + 'RESTE DU'.padStart(16))
    for (const [k, liste] of [...factures].sort()) {
      const net = liste.reduce((s, f) => s + f.net, 0)
      const impute = ecritures.filter((e) => e.tiers === k).reduce((s, e) => s + e.montant, 0)
      const reste = liste.reduce((s, f) => s + f.reste, 0)
      console.log(k.slice(0, 12).padEnd(13) + fr(r3(net)).padStart(16) + fr(r3(impute)).padStart(16) + fr(r3(reste)).padStart(16))
    }

    if (surplus.length) {
      console.log('')
      console.log('=== VERSEMENTS EXCEDENTAIRES (aucune facture a solder) ===')
      for (const s of surplus) {
        console.log('  ' + s.date + '  ' + s.tiers.padEnd(12) + fr(s.reste).padStart(14) + '   ' + s.libelle.slice(0, 45))
      }
      console.log('  TOTAL : ' + fr(r3(surplus.reduce((s, x) => s + x.reste, 0))))
    }

    if (!APPLIQUER) {
      console.log('')
      console.log('SIMULATION : aucune ecriture. Relancez avec --appliquer pour ecrire.')
      return
    }

    await client.query('BEGIN')
    try {
      for (const e of ecritures) {
        const table = e.type === 'achat' ? 'purchase_payments' : 'transport_payments'
        const colonne = e.type === 'achat' ? '"purchaseId"' : '"transportInvoiceId"'
        await client.query(
          `INSERT INTO ${table} (id, ${colonne}, amount, "currencyCode", date, method, reference, note, "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, 'TND', $3::date, $4::"PaymentMethod", $5, $6, now(), now())`,
          [e.factureId, e.montant.toFixed(3), e.date, e.methode, e.reference, MARQUEUR],
        )
      }

      // Recalcul des soldes, a l'identique de refreshPurchasePaymentState.
      await client.query(`
        UPDATE purchases p SET
          "paidAmount" = c.paye,
          "balanceDue" = p."netToPay" - c.paye,
          "paidAmountTnd" = round(c.paye * p."exchangeRateTnd", 3),
          "balanceDueTnd" = round((p."netToPay" - c.paye) * p."exchangeRateTnd", 3),
          status = CASE
            WHEN p.status IN ('DRAFT','CANCELLED') THEN p.status
            WHEN p."netToPay" > 0 AND c.paye >= p."netToPay" THEN 'PAID'
            WHEN p."dueDate" IS NOT NULL AND p."dueDate" < current_date THEN 'OVERDUE'
            WHEN c.paye > 0 THEN 'PARTIALLY_PAID'
            ELSE 'CONFIRMED' END::"InvoiceStatus"
        FROM (SELECT "purchaseId" pid, coalesce(sum(amount),0) paye FROM purchase_payments GROUP BY "purchaseId") c
        WHERE c.pid = p.id`)

      await client.query(`
        UPDATE transport_invoices i SET
          "paidAmount" = c.paye,
          "balanceDue" = i."netToPay" - c.paye,
          status = CASE
            WHEN i.status IN ('DRAFT','CANCELLED') THEN i.status
            WHEN i."netToPay" > 0 AND c.paye >= i."netToPay" THEN 'PAID'
            WHEN c.paye > 0 THEN 'PARTIALLY_PAID'
            ELSE i.status END::"InvoiceStatus"
        FROM (SELECT "transportInvoiceId" tid, coalesce(sum(amount),0) paye FROM transport_payments GROUP BY "transportInvoiceId") c
        WHERE c.tid = i.id`)

      await client.query('COMMIT')
      console.log('')
      console.log('ECRITURES ENREGISTREES : ' + ecritures.length)
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((e) => {
  console.error('ECHEC : ' + e.message)
  process.exit(1)
})
