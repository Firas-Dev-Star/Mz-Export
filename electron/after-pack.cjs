'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * Copie le serveur Next autonome dans l'application empaquetee.
 *
 * POURQUOI UN HOOK ET PAS `extraResources` : le filtrage par glob
 * d'electron-builder exclut `node_modules` des ressources supplementaires. Le
 * dossier `.next/standalone` arrivait donc SANS ses 140 dependances, et le
 * serveur echouait au demarrage sur « Cannot find module 'next' » — un
 * installeur d'apparence correcte, inutilisable.
 *
 * `fs.cpSync` copie l'arborescence telle quelle, sans semantique de glob a
 * deviner. Le resultat est verifie a la fin : un manque fait echouer le build
 * plutot que de produire un paquet casse.
 */

/** Le serveur autonome attend `static` et `public` a l'interieur de son dossier. */
const COPIES = [
  { from: path.join('.next', 'standalone'), to: '.' },
  { from: path.join('.next', 'static'), to: path.join('.next', 'static') },
  { from: 'public', to: 'public' },
]

exports.default = async function afterPack(context) {
  const projectRoot = context.packager.projectDir
  const standalone = path.join(context.appOutDir, 'resources', 'app', '.next', 'standalone')

  for (const copy of COPIES) {
    const source = path.join(projectRoot, copy.from)
    if (!fs.existsSync(source)) {
      // `public` est facultatif ; l'absence du serveur autonome ne l'est pas.
      if (copy.from === 'public') continue
      throw new Error(
        `${copy.from} est introuvable. Lancez « npm run desktop:build » avant d'empaqueter.`,
      )
    }
    const destination = path.resolve(standalone, copy.to)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.cpSync(source, destination, { recursive: true })
  }

  // Verification : sans `node_modules`, le serveur ne demarre pas. On refuse de
  // produire un installeur dans cet etat.
  const modules = path.join(standalone, 'node_modules')
  const count = fs.existsSync(modules) ? fs.readdirSync(modules).length : 0
  if (count === 0) {
    throw new Error(
      `Aucune dependance copiee dans ${modules}. Le serveur ne pourrait pas demarrer.`,
    )
  }

  if (!fs.existsSync(path.join(standalone, 'server.js'))) {
    throw new Error(`server.js absent de ${standalone}.`)
  }

  console.log(`  • serveur Next copie   ${count} dependances`)
}
