'use strict'

const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')
const fs = require('node:fs')

/**
 * Lancement du serveur Next.js embarque.
 *
 * En production, Next est construit en mode `standalone` : le dossier
 * `.next/standalone` contient son propre `server.js` et les seules dependances
 * necessaires. On le demarre comme processus enfant, exactement comme le ferait
 * `node server.js` sur un serveur.
 *
 * En developpement (`npm run desktop:dev`), on se contente de pointer sur le
 * serveur `next dev` deja lance : inutile de reconstruire a chaque essai.
 */

/** Trouve un port libre en laissant l'OS en choisir un. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

/** Vrai si le port peut etre ouvert sur toutes les interfaces. */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)))
  })
}

/**
 * Port du serveur applicatif.
 *
 * On tient au port CONFIGURE : les autres postes du reseau ont un raccourci
 * vers `http://192.168.1.x:3000`, qui casserait si le port changeait a chaque
 * demarrage. Un port aleatoire n'est qu'un dernier recours, signale dans le
 * journal pour que l'utilisateur sache pourquoi son raccourci ne repond plus.
 */
async function resolvePort(preferred, onLog) {
  if (preferred && (await isPortFree(preferred))) return preferred

  const fallback = await findFreePort()
  if (preferred) {
    onLog(
      `Port ${preferred} deja utilise : basculement sur ${fallback}. ` +
        'Les raccourcis des autres postes doivent etre mis a jour, ou le port libere.',
    )
  }
  return fallback
}

/** Attend que le serveur reponde, ou abandonne au bout de `timeoutMs`. */
async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      // Toute reponse HTTP prouve que le serveur ecoute : une redirection vers
      // /login est le cas normal quand personne n'est connecte.
      if (response.status > 0) return true
    } catch (error) {
      lastError = error
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  throw new Error(
    `Le serveur n'a pas repondu en ${Math.round(timeoutMs / 1000)} s.` +
      (lastError ? ` Derniere erreur : ${lastError.message}` : ''),
  )
}

/**
 * Demarre le serveur applicatif.
 *
 * @param {object} options
 * @param {string} options.appRoot   Racine de l'application empaquetee.
 * @param {string} options.databaseUrl Chaine de connexion PostgreSQL.
 * @param {number} options.httpPort  Port souhaite (stable pour les raccourcis).
 * @param {boolean} options.dev      Vrai pour se brancher sur `next dev`.
 * @param {(line: string) => void} options.onLog
 */
async function startServer({
  appRoot,
  databaseUrl,
  authSecret,
  httpPort = 3000,
  dev = false,
  onLog = () => {},
}) {
  if (dev) {
    const url = 'http://localhost:3000'
    onLog(`Mode developpement : utilisation de ${url}`)
    await waitForServer(url)
    return { url, port: 3000, child: null }
  }

  // Echouer ici, avec un message clair, plutot que de laisser demarrer un
  // serveur sur lequel personne ne pourra se connecter.
  if (!authSecret || authSecret.length < 24) {
    throw new Error(
      'Cle de session absente ou trop courte dans la configuration du poste.\n\n' +
        'Fermez le logiciel, supprimez « config.json » dans le dossier de donnees, ' +
        'puis relancez : une nouvelle cle sera generee.',
    )
  }

  const standaloneDir = path.join(appRoot, '.next', 'standalone')
  const entry = path.join(standaloneDir, 'server.js')

  if (!fs.existsSync(entry)) {
    throw new Error(
      `Serveur introuvable : ${entry}\n` +
        'Construisez l\'application avec "npm run desktop:build" avant de lancer le logiciel.',
    )
  }

  const port = await resolvePort(httpPort, onLog)

  const child = spawn(process.execPath, [entry], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      // INDISPENSABLE : `process.execPath` est electron.exe. Sans cette
      // variable, Electron tenterait de demarrer une application graphique au
      // lieu d'executer le script, et le serveur ne repondrait jamais.
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      // INDISPENSABLE : sans elle, `src/lib/session.ts` refuse de signer une
      // session et TOUTE CONNEXION ECHOUE — sur un « Connexion impossible »
      // qui laisse croire a un mot de passe errone. Elle venait autrefois du
      // `.env` recopie dans la sortie autonome ; ce fichier n'est plus livre,
      // la cle vient donc de la configuration du poste (electron/config.js).
      AUTH_SECRET: authSecret,
      PORT: String(port),
      // 0.0.0.0 et non 127.0.0.1 : c'est ce qui rend le poste accessible aux
      // autres machines du reseau WiFi.
      HOSTNAME: '0.0.0.0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout.on('data', (chunk) => onLog(`[next] ${String(chunk).trim()}`))
  child.stderr.on('data', (chunk) => onLog(`[next:err] ${String(chunk).trim()}`))

  child.on('exit', (code, signal) => {
    onLog(`[next] processus termine (code ${code}, signal ${signal ?? 'aucun'})`)
  })

  const url = `http://localhost:${port}`
  await waitForServer(url)
  onLog(`Serveur pret sur le port ${port}`)

  return { url, port, child }
}

module.exports = { startServer, findFreePort, isPortFree, resolvePort, waitForServer }
