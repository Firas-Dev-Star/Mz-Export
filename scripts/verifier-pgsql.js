#!/usr/bin/env node
'use strict'

/**
 * Verifie que la distribution PostgreSQL portable est correctement placee
 * avant de construire l'installeur.
 *
 * Sans ce controle, `npm run desktop:dist` produit un installeur qui semble
 * correct et echoue au premier lancement chez l'utilisateur.
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const BIN = path.join(ROOT, 'vendor', 'pgsql', 'bin')

const REQUIRED = ['initdb', 'pg_ctl', 'psql', 'pg_dump', 'pg_restore', 'postgres']

function exe(name) {
  return process.platform === 'win32' ? `${name}.exe` : name
}

let ok = true

console.log(`Dossier attendu : ${BIN}\n`)

if (!fs.existsSync(BIN)) {
  console.error('MANQUANT : le dossier vendor/pgsql/bin n’existe pas.')
  console.error('\nTelechargez l’archive binaire (pas l’installeur) depuis')
  console.error('  https://www.enterprisedb.com/download-postgresql-binaries')
  console.error('puis copiez le dossier « pgsql » dans vendor/.')
  process.exit(1)
}

for (const name of REQUIRED) {
  const file = path.join(BIN, exe(name))
  if (fs.existsSync(file)) {
    console.log(`  OK       ${exe(name)}`)
  } else {
    console.error(`  MANQUANT ${exe(name)}`)
    ok = false
  }
}

if (!ok) {
  console.error('\nDistribution incomplete. Recopiez le dossier pgsql en entier.')
  process.exit(1)
}

// La version compte : le format des donnees n'est pas compatible d'une version
// majeure a l'autre. Un poste initialise en 16 ne demarrera pas avec des
// binaires 17.
try {
  const version = execFileSync(path.join(BIN, exe('postgres')), ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim()
  console.log(`\n${version}`)
} catch (error) {
  console.error(`\nLes binaires sont presents mais illisibles : ${error.message}`)
  console.error('Verifiez que le dossier lib/ et share/ ont bien ete copies aussi.')
  process.exit(1)
}

const size = fs.statSync(BIN).isDirectory()
console.log(`\nDistribution complete${size ? '' : ''}. Vous pouvez lancer « npm run desktop:dist ».`)
