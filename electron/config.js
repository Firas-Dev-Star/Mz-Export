'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Configuration locale du poste.
 *
 * Elle vit dans le dossier utilisateur (`%APPDATA%\MZ EXPORT`), jamais dans le
 * dossier d'installation : celui-ci est en lecture seule pour un utilisateur
 * standard, et serait ecrase a chaque mise a jour.
 *
 * Le fichier porte le mot de passe de la base locale. Il est genere une fois,
 * aleatoirement, et n'est jamais transmis.
 */

const FILE_NAME = 'config.json'

function configPath(userDataDir) {
  return path.join(userDataDir, FILE_NAME)
}

/** Mot de passe robuste, sans caractere a echapper dans une URL. */
function generatePassword() {
  return crypto.randomBytes(24).toString('base64url')
}

/** Cle de signature des sessions (`AUTH_SECRET`), propre a ce poste. */
function generateSecret() {
  return crypto.randomBytes(48).toString('base64url')
}

function defaultConfig() {
  return {
    version: 1,
    /** "embedded" : PostgreSQL local. "remote" : serveur existant. */
    mode: 'embedded',
    embedded: {
      port: 5433, // 5433 et non 5432 : evite le conflit avec un PostgreSQL deja installe
      database: 'mzexport',
      user: 'mzexport',
      password: generatePassword(),
    },
    /**
     * Cle de signature des sessions, transmise au serveur comme `AUTH_SECRET`.
     *
     * POURQUOI ICI ET PAS DANS UN `.env` LIVRE : le fichier `.env` du projet
     * etait autrefois recopie dans la sortie autonome, ce qui publiait la meme
     * cle — et les secrets de la base cloud — dans chaque installeur remis a un
     * poste. `scripts/preparer-standalone.js` l'a supprime a raison ; la cle
     * doit donc etre generee ici, une fois, par installation.
     *
     * Elle est STABLE : la regenerer a chaque lancement invaliderait les
     * cookies de session et deconnecterait l'utilisateur a chaque demarrage.
     */
    authSecret: generateSecret(),
    /** Utilise uniquement en mode "remote". */
    remoteUrl: '',
    /** Port HTTP fixe pour que les raccourcis des autres postes restent valides. */
    httpPort: 3000,
  }
}

function readConfig(userDataDir) {
  const file = configPath(userDataDir)

  if (!fs.existsSync(file)) {
    const config = defaultConfig()
    writeConfig(userDataDir, config)
    return config
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    // Fusion avec les valeurs par defaut : une version future qui ajoute une
    // cle ne casse pas une configuration existante.
    const base = defaultConfig()
    const merged = {
      ...base,
      ...parsed,
      embedded: { ...base.embedded, ...(parsed.embedded ?? {}) },
    }

    // Configuration ecrite par une version anterieure : elle n'a pas de cle de
    // session. La fusion vient d'en apporter une, mais elle sort de
    // `defaultConfig()` et est donc NEUVE A CHAQUE APPEL — il faut la figer sur
    // le disque, sinon chaque lancement en produirait une autre et
    // deconnecterait l'utilisateur a chaque demarrage.
    //
    // Le test porte sur `parsed`, CE QUI EST ECRIT SUR LE DISQUE, et non sur
    // `merged`, qui en contient toujours une : c'est la difference entre
    // « la cle existe » et « la cle est conservee ».
    if (typeof parsed.authSecret !== 'string' || parsed.authSecret.length < 24) {
      writeConfig(userDataDir, merged)
    }

    return merged
  } catch {
    // Configuration illisible : on repart d'une neuve plutot que de refuser de
    // demarrer. L'ancienne est conservee a cote pour diagnostic.
    try {
      fs.renameSync(file, `${file}.corrompu-${Date.now()}`)
    } catch {
      /* sans consequence */
    }
    const config = defaultConfig()
    writeConfig(userDataDir, config)
    return config
  }
}

function writeConfig(userDataDir, config) {
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(configPath(userDataDir), JSON.stringify(config, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  })
}

/** Chaine de connexion PostgreSQL deduite de la configuration. */
function databaseUrl(config) {
  if (config.mode === 'remote') {
    if (!config.remoteUrl) throw new Error('Mode distant selectionne mais aucune adresse renseignee.')
    return config.remoteUrl
  }
  const { user, password, port, database } = config.embedded
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`
}

/** Dossier des donnees PostgreSQL. */
function dataDir(userDataDir) {
  return path.join(userDataDir, 'pgdata')
}

/** Dossier des sauvegardes. */
function backupDir(userDataDir) {
  return path.join(userDataDir, 'sauvegardes')
}

module.exports = {
  readConfig,
  writeConfig,
  databaseUrl,
  dataDir,
  backupDir,
  configPath,
  generatePassword,
  generateSecret,
}
