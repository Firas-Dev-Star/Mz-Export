// Classe d'un coup les mouvements bancaires dont la nature est reconnue.
//
// POURQUOI. Le premier import a produit 718 mouvements « a traiter », dont
// l'immense majorite sont des commissions de quelques dinars : chaque virement
// genere commission + TVA + domiciliation + frais PDL. Une liste d'arbitrage
// noyee sous 700 lignes de frais n'est pas utilisable.
//
// Ce script ne touche QUE les mouvements dont le libelle est reconnu sans
// ambiguite, et seulement ceux encore « a traiter ». Il ne supprime rien, ne
// cree aucun reglement, et chaque classement se defait d'un clic dans
// l'application.
//
//   node scripts/classer-mouvements-connus.js              -> simulation
//   node scripts/classer-mouvements-connus.js --appliquer  -> ecrit

const path = require('node:path')
const { readConfig, databaseUrl } = require(path.join(__dirname, '..', 'electron', 'config'))
const { Client } = require(path.join(__dirname, '..', 'node_modules', 'pg'))

const APPLIQUER = process.argv.includes('--appliquer')
const fr = (n) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 3 })

// Meme logique que `categorieAutomatique` dans src/services/bank-statement.ts.
const NATURES = [
  ['Frais bancaires', /Comm|Frais|Tva sur|TVA SUR|Interets|Agios|PDL|domiciliation/i],
  ['Impôts et taxes', /Paiement Prelevement|REGLE DE LA DECLARATION/i],
  ['Charges sociales', /CNSS/i],
  // Uniquement en SORTIE : « STE MZ EXPORT » en entree designe un
  // rapatriement export, pas un transfert entre nos comptes.
  ['Transfert entre comptes', /MZ EXPORT/i, 'sortie'],
  ['Frais divers', /Recharge Telephonique/i],
]

async function main() {
  const config = readConfig(path.join(process.env.APPDATA, 'mz-export-gestion'))
  const client = new Client({ connectionString: databaseUrl(config), connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    const { rows } = await client.query(
      `SELECT id, date::text AS date, label, amount::float8 AS montant
         FROM bank_movements WHERE status = 'PENDING' ORDER BY date`,
    )

    const parNature = new Map()
    for (const m of rows) {
      const n = NATURES.find(([, re, sens]) => re.test(m.label) && (sens !== 'sortie' || m.montant < 0))
      if (!n) continue
      if (!parNature.has(n[0])) parNature.set(n[0], [])
      parNature.get(n[0]).push(m)
    }

    const total = [...parNature.values()].reduce((s, l) => s + l.length, 0)
    console.log('mouvements a traiter : ' + rows.length)
    console.log('reconnus             : ' + total)
    console.log('')
    for (const [nature, liste] of [...parNature].sort((a, b) => b[1].length - a[1].length)) {
      const somme = liste.reduce((s, m) => s + m.montant, 0)
      console.log('  ' + nature.padEnd(26) + String(liste.length).padStart(4) + '   ' + fr(somme).padStart(15))
    }
    console.log('')
    console.log('resteront a arbitrer : ' + (rows.length - total))

    if (!APPLIQUER) {
      console.log('')
      console.log('SIMULATION : aucune ecriture. Relancez avec --appliquer.')
      return
    }

    await client.query('BEGIN')
    try {
      for (const [nature, liste] of parNature) {
        await client.query(
          `UPDATE bank_movements SET status = 'IGNORED', category = $1, "updatedAt" = now()
            WHERE id = ANY($2::text[])`,
          [nature, liste.map((m) => m.id)],
        )
      }
      await client.query('COMMIT')
      console.log('')
      console.log('CLASSES : ' + total + ' mouvement(s)')
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
