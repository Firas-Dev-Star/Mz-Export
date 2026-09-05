'use strict'

/**
 * Neutralise le garde-fou `server-only` pour les scripts d'outillage.
 *
 * Les services de l'application commencent par `import 'server-only'`, qui
 * leve une exception hors contexte serveur Next. C'est voulu : ce garde-fou
 * empeche qu'un service touchant la base soit importe par erreur dans un
 * composant client.
 *
 * Un script d'import en ligne de commande est pourtant un contexte legitime :
 * il tourne cote serveur par nature. Plutot que de reimplementer les calculs
 * de l'application — et de risquer qu'ils divergent — on remplace ici le
 * module par un objet vide, le temps du script.
 *
 * Usage :
 *   NODE_OPTIONS="--require ./scripts/_neutraliser-server-only.cjs" npx tsx <script>
 */

const Module = require('node:module')

const chargerOrigine = Module._load

Module._load = function (requete, parent, estPrincipal) {
  if (requete === 'server-only') return {}
  return chargerOrigine.call(this, requete, parent, estPrincipal)
}
