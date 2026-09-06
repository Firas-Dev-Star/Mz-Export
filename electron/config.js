'use strict'

const { execFileSync } = require('node:child_process')
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


/**
 * Marqueur d'installation, pose dans le REGISTRE et non sur le disque.
 *
 * POURQUOI LE REGISTRE. Le 5 septembre, des instances lancees peu apres
 * l'ouverture de session voyaient leur dossier de donnees comme vide. Elles en
 * concluaient « premiere installation », fabriquaient une configuration neuve
 * avec un NOUVEAU MOT DE PASSE, et se heurtaient a « password authentication
 * failed » sur leur propre base -- ou pire, auraient pu initialiser un cluster
 * par-dessus des donnees comptables.
 *
 * Deux protections ont echoue avant celle-ci : la presence de `pgdata`
 * (invisible au meme moment) puis l'occupation du port (legitimement libre
 * tant que la base n'a pas demarre). Le registre, lui, n'est pas concerne par
 * ce phenomene : s'il porte la marque, le poste EST installe, quoi que le
 * disque raconte.
 */
const CLE_REGISTRE = 'HKCU\\Software\\MZ EXPORT'

function posteDejaInstalle() {
  try {
    execFileSync('reg', ['query', CLE_REGISTRE, '/v', 'Installe'], {
      windowsHide: true,
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

function marquerPosteInstalle() {
  try {
    execFileSync(
      'reg',
      ['add', CLE_REGISTRE, '/v', 'Installe', '/t', 'REG_SZ', '/d', '1', '/f'],
      { windowsHide: true, stdio: 'ignore' },
    )
  } catch {
    /* sans marqueur, on retombe sur les protections precedentes */
  }
}

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

/**
 * @param {string} userDataDir
 * @param {object} [options]
 * @param {boolean} [options.creerSiAbsent] Autoriser la creation d'une
 *   configuration neuve. FAUX par defaut : l'appelant doit d'abord etablir
 *   qu'il s'agit vraiment d'une premiere installation. Voir le garde-fou de
 *   `main.js`, qui tranche en interrogeant le PORT de la base — seule preuve
 *   que le systeme de fichiers ne puisse pas fausser.
 */
function readConfig(userDataDir, { creerSiAbsent = false } = {}) {
  const file = configPath(userDataDir)

  if (!fs.existsSync(file)) {
    /**
     * GARDE-FOU. Ne jamais fabriquer une configuration neuve par-dessus une
     * installation existante.
     *
     * Le 5 septembre, des instances lancees peu apres le demarrage de Windows
     * voyaient ce dossier comme VIDE — `pg_control` introuvable, journal
     * impossible a ecrire — alors qu'un autre processus lisait tout
     * normalement a la meme seconde. Dans cet etat, ce chemin generait une
     * configuration neuve, donc un NOUVEAU MOT DE PASSE de base de donnees,
     * et l'application se heurtait a « password authentication failed » sur sa
     * propre base. Au pire, elle aurait pu tenter d'initialiser un cluster
     * par-dessus des donnees comptables existantes.
     *
     * La presence de `pgdata` prouve que le poste est deja installe : si la
     * configuration n'est pas lisible, c'est la LECTURE qui echoue, pas la
     * configuration qui manque. On refuse, et main.js relance le processus.
     */
    if (posteDejaInstalle()) {
      const echec = new Error(
        'La configuration du poste est introuvable, alors que ce poste est ' +
          "deja installe.\n\nAucune configuration n'a ete modifiee.",
      )
      echec.dossierIndisponible = true
      throw echec
    }

    if (!creerSiAbsent) {
      const echec = new Error(
        "La configuration du poste est introuvable depuis ce processus.\n\n" +
          "Aucune configuration n'a ete modifiee.",
      )
      echec.configAbsente = true
      throw echec
    }

    const config = defaultConfig()
    writeConfig(userDataDir, config)
    marquerPosteInstalle()
    return config
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    // Fusion avec les valeurs par defaut : une version future qui ajoute une
    // cle ne casse pas une configuration existante.
    const base = defaultConfig()

    // Meme garde-fou, un cran plus loin : un fichier lisible mais ampute de sa
    // section « embedded » ferait tomber le mot de passe sur celui, aleatoire,
    // de `defaultConfig()`. Silencieusement, et avec le meme resultat.
    if (!creerSiAbsent && !parsed.embedded?.password) {
      const echec = new Error(
        'La configuration du poste est incomplete : le mot de passe de la base ' +
          "est absent.\n\nAucune configuration n'a ete modifiee.",
      )
      echec.configAbsente = true
      throw echec
    }

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
  } catch (error) {
    // PIEGE CORRIGE ICI : ce catch avalait les refus emis juste au-dessus et
    // recreait precisement la configuration qu'ils voulaient empecher. Les
    // garde-fous doivent traverser.
    if (error?.configAbsente || error?.dossierIndisponible) throw error

    // Et si le poste est marque installe, un fichier illisible est un defaut de
    // LECTURE, pas une configuration corrompue : on ne la remplace pas.
    if (posteDejaInstalle()) {
      const echec = new Error(
        'La configuration du poste est illisible, alors que ce poste est deja ' +
          "installe.\n\nAucune configuration n'a ete modifiee.",
      )
      echec.dossierIndisponible = true
      throw echec
    }

    // Configuration illisible sur un poste jamais installe : on repart d'une
    // neuve. L'ancienne est conservee a cote pour diagnostic.
    try {
      fs.renameSync(file, `${file}.corrompu-${Date.now()}`)
    } catch {
      /* sans consequence */
    }
    const config = defaultConfig()
    writeConfig(userDataDir, config)
    marquerPosteInstalle()
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
  posteDejaInstalle,
  marquerPosteInstalle,
  defaultConfig,
  writeConfig,
  databaseUrl,
  dataDir,
  backupDir,
  configPath,
  generatePassword,
  generateSecret,
}
