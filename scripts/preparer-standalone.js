#!/usr/bin/env node
'use strict'

/**
 * Complete la sortie `standalone` de Next.
 *
 * Next produit `.next/standalone/server.js` et ses dependances, mais NE COPIE
 * PAS les fichiers statiques ni le dossier public : c'est documente, et a la
 * charge de l'appelant. Sans cette etape, l'application demarre mais s'affiche
 * sans aucun style ni image.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const STANDALONE = path.join(ROOT, '.next', 'standalone')

if (!fs.existsSync(path.join(STANDALONE, 'server.js'))) {
  console.error('Sortie autonome introuvable. Lancez d’abord la construction Next avec MZ_DESKTOP=1.')
  process.exit(1)
}

/** Copie recursive, en remplacant la cible. */
function copyDir(source, destination, label) {
  if (!fs.existsSync(source)) {
    console.log(`  ignore   ${label} (source absente)`)
    return 0
  }
  fs.rmSync(destination, { recursive: true, force: true })
  fs.cpSync(source, destination, { recursive: true })

  let count = 0
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name))
      else count += 1
    }
  }
  walk(destination)
  console.log(`  copie    ${label} (${count} fichiers)`)
  return count
}

console.log('Preparation de la sortie autonome :')

copyDir(
  path.join(ROOT, '.next', 'static'),
  path.join(STANDALONE, '.next', 'static'),
  '.next/static',
)

copyDir(path.join(ROOT, 'public'), path.join(STANDALONE, 'public'), 'public')

/**
 * Retire les fichiers d'environnement de la sortie autonome.
 *
 * POURQUOI C'EST INDISPENSABLE, ET PAS UNE PRECAUTION DE CONFORT.
 *
 * Next recopie le `.env` du projet dans `.next/standalone`. Ce fichier pointe
 * vers la base CLOUD de developpement — et il est charge au demarrage du
 * serveur, ou il PREND LE PAS sur les variables transmises par Electron.
 * L'application installee ouvrait donc son PostgreSQL local, le migrait,
 * l'amorcait... puis interrogeait Supabase par internet. Sur une connexion
 * lente, chaque page attendait sans fin et l'application ne s'ouvrait jamais.
 *
 * Second motif, aussi serieux : ce fichier contient le mot de passe de la base
 * cloud, `AUTH_SECRET` et le mot de passe administrateur. Les livrer dans un
 * installeur remis a d'autres postes revient a publier ces secrets.
 *
 * La configuration de l'application installee vient d'Electron, et de lui
 * seul : `electron/config.js` pour la base locale, `electron/server.js` pour
 * les variables passees au serveur.
 */
function removeEnvFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const removed = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (entry.name === '.env' || entry.name.startsWith('.env.')) {
      fs.rmSync(path.join(dir, entry.name), { force: true })
      removed.push(entry.name)
    }
  }
  return removed
}

const removed = removeEnvFiles(STANDALONE)
if (removed.length > 0) {
  console.log(`  retire   ${removed.join(', ')} (configuration fournie par Electron)`)
} else {
  console.log('  aucun fichier .env dans la sortie autonome')
}

console.log('\nSortie autonome prete.')
