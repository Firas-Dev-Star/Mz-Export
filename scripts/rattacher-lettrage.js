// Rattache les reglements issus du lettrage initial aux mouvements bancaires
// importes, et marque ces mouvements comme attribues.
//
// POURQUOI. Le lettrage de septembre 2026 a ete fait par script, avant que
// l'ecran de rapprochement n'existe : ses 127 reglements ne portent aucun
// mouvement d'origine. Sans ce rattachement, importer les relevés ferait
// reapparaitre en « a traiter » des virements deja imputes — et un second
// clic les compterait deux fois.
//
// METHODE : appariement par DATE et MONTANT TOTAL. Un mouvement bancaire est
// rattache si la somme des reglements portant sa date et issus du lettrage
// egale son montant. Aucun rapprochement approximatif : en cas de doute, le
// mouvement reste a traiter et c'est l'utilisateur qui tranche.
//
//   node scripts/rattacher-lettrage.js              -> simulation
//   node scripts/rattacher-lettrage.js --appliquer  -> ecrit

const path = require('node:path')
const { readConfig, databaseUrl } = require(path.join(__dirname, '..', 'electron', 'config'))
const { Client } = require(path.join(__dirname, '..', 'node_modules', 'pg'))

const APPLIQUER = process.argv.includes('--appliquer')
const MARQUEUR = 'Rapprochement bancaire 2026'
const fr = (n) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 3 })

async function main() {
  const config = readConfig(path.join(process.env.APPDATA, 'mz-export-gestion'))
  const client = new Client({ connectionString: databaseUrl(config), connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    const mouvements = await client.query(
      `SELECT id, date::text AS date, amount::float8 AS montant, label, bank
         FROM bank_movements WHERE status = 'PENDING' AND amount < 0 ORDER BY date`,
    )
    if (mouvements.rows.length === 0) {
      console.log('Aucun mouvement a traiter. Importez d abord vos relevés dans l application.')
      return
    }

    const groupes = await client.query(
      `SELECT date::text AS date, sum(amount)::float8 AS total, count(*)::int AS n,
              array_agg(id) AS ids, 'achat' AS type
         FROM purchase_payments WHERE note = $1 AND "bankMovementId" IS NULL GROUP BY date
        UNION ALL
       SELECT date::text, sum(amount)::float8, count(*)::int, array_agg(id), 'transport'
         FROM transport_payments WHERE note = $1 AND "bankMovementId" IS NULL GROUP BY date`,
      [MARQUEUR],
    )

    const parDate = new Map()
    for (const g of groupes.rows) {
      if (!parDate.has(g.date)) parDate.set(g.date, [])
      parDate.get(g.date).push(g)
    }

    const apparies = []
    for (const m of mouvements.rows) {
      const candidats = parDate.get(m.date) ?? []
      const attendu = Math.abs(m.montant)
      for (const g of candidats) {
        if (g.utilise) continue
        if (Math.abs(g.total - attendu) < 0.005) {
          g.utilise = true
          apparies.push({ mouvement: m, groupe: g })
          break
        }
      }
    }

    console.log('mouvements a traiter : ' + mouvements.rows.length)
    console.log('appariements trouves : ' + apparies.length)
    for (const a of apparies.slice(0, 12)) {
      console.log(
        '  ' + a.mouvement.date + '  ' + fr(Math.abs(a.mouvement.montant)).padStart(14) +
          '  ' + a.groupe.n + ' reglement(s) ' + a.groupe.type +
          '   ' + a.mouvement.label.slice(0, 40),
      )
    }
    if (apparies.length > 12) console.log('  ... et ' + (apparies.length - 12) + ' autres')

    if (!APPLIQUER) {
      console.log('')
      console.log('SIMULATION : aucune ecriture. Relancez avec --appliquer.')
      return
    }

    await client.query('BEGIN')
    try {
      for (const a of apparies) {
        const table = a.groupe.type === 'achat' ? 'purchase_payments' : 'transport_payments'
        await client.query(
          `UPDATE ${table} SET "bankMovementId" = $1 WHERE id = ANY($2::text[])`,
          [a.mouvement.id, a.groupe.ids],
        )
        await client.query(
          `UPDATE bank_movements SET status = 'ATTRIBUTED' WHERE id = $1`,
          [a.mouvement.id],
        )
      }
      await client.query('COMMIT')
      console.log('')
      console.log('RATTACHES : ' + apparies.length + ' mouvement(s)')
      console.log('Les mouvements restants sont a traiter dans l ecran Rapprochement bancaire.')
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
