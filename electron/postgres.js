'use strict'

const { execFile, execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Cycle de vie du PostgreSQL embarque.
 *
 * Les binaires sont livres avec l'application (dossier `resources/pgsql`).
 * Aucun service Windows n'est installe, aucun droit administrateur n'est
 * requis : `pg_ctl` demarre le serveur dans le contexte de l'utilisateur, et
 * l'arrete a la fermeture du logiciel.
 *
 * PostgreSQL n'ecoute que sur 127.0.0.1 : la base n'est JAMAIS exposee au
 * reseau WiFi. Seul le port HTTP de l'application l'est. C'est a la fois plus
 * simple (aucun pg_hba.conf a configurer) et plus sur.
 */

/**
 * Lance un binaire QUI DEMARRE UN SERVICE, et resout a la sortie du processus.
 *
 * A n'utiliser que pour `pg_ctl start`. Raison : `execFile` attend la FERMETURE
 * des flux, pas la fin du processus. Or `pg_ctl` lance `postgres`, qui herite du
 * tuyau stdout et le garde ouvert tant qu'il tourne — le rappel ne serait donc
 * jamais appele, meme apres un demarrage reussi. En ignorant les flux, plus
 * aucun tuyau n'est retenu et l'evenement `exit` suffit.
 *
 * STDERR EST BIEN CAPTURE, stdout non. La distinction compte : stdout est le
 * tuyau dont herite `postgres`, celui qui empechait l'evenement `exit`. stderr
 * ne porte que les diagnostics de `pg_ctl` lui-meme — les jeter revenait a
 * perdre la seule explication disponible quand le journal de PostgreSQL, lui,
 * ne recoit rien. On resout toujours sur `exit`, donc un flux encore ouvert ne
 * peut pas bloquer.
 */
function runService(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })

    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.once('error', reject)
    child.once('exit', (code) => {
      child.stderr?.destroy()
      if (code === 0) {
        resolve()
        return
      }
      const detail = stderr.trim()
      reject(
        new Error(
          `${path.basename(binary)} a quitte avec le code ${code}${detail ? ` :\n${detail}` : ''}`,
        ),
      )
    })
  })
}

/** Pause, pour espacer deux tentatives. */
function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Execute un binaire et resout avec sa sortie, ou rejette avec stderr. */
function run(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${path.basename(binary)} a echoue : ${stderr || stdout || error.message}`
        reject(error)
        return
      }
      resolve(String(stdout))
    })
  })
}

/**
 * Le processus de ce PID tourne-t-il encore ?
 *
 * Le signal 0 ne tue rien : il ne fait que demander si le PID existe. `EPERM`
 * signifie « il existe mais ne m'appartient pas », donc vivant lui aussi.
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

class EmbeddedPostgres {
  /**
   * @param {object} options
   * @param {string} options.binDir    Dossier contenant initdb, pg_ctl, psql, pg_dump.
   * @param {string} options.dataDir   Dossier des donnees.
   * @param {object} options.settings  { port, database, user, password }
   * @param {(line: string) => void} options.onLog
   */
  constructor({ binDir, dataDir, settings, onLog = () => {} }) {
    this.binDir = binDir
    this.dataDir = dataDir
    this.settings = settings
    this.onLog = onLog
  }

  bin(name) {
    return path.join(this.binDir, process.platform === 'win32' ? `${name}.exe` : name)
  }

  get logFile() {
    return path.join(path.dirname(this.dataDir), 'postgres.log')
  }

  /** Vrai si les binaires sont presents : sinon on retombe sur le mode distant. */
  isAvailable() {
    return fs.existsSync(this.bin('pg_ctl')) && fs.existsSync(this.bin('initdb'))
  }

  /** Vrai si le cluster a deja ete initialise. */
  isInitialised() {
    return fs.existsSync(path.join(this.dataDir, 'PG_VERSION'))
  }

  /**
   * Cree le cluster. Le mot de passe passe par un fichier temporaire plutot
   * que par la ligne de commande : un argument est visible dans la liste des
   * processus, un fichier a permissions restreintes ne l'est pas.
   */
  async initialise() {
    if (this.isInitialised()) return

    this.onLog('Premiere execution : creation de la base de donnees locale...')
    fs.mkdirSync(path.dirname(this.dataDir), { recursive: true })

    const passwordFile = path.join(path.dirname(this.dataDir), '.pgpass-init')
    fs.writeFileSync(passwordFile, this.settings.password, { encoding: 'utf8', mode: 0o600 })

    try {
      await run(this.bin('initdb'), [
        '--pgdata', this.dataDir,
        '--username', this.settings.user,
        '--pwfile', passwordFile,
        '--encoding', 'UTF8',
        // Tri et classement independants de la langue de Windows : sans cela,
        // l'ordre des chaines varierait d'un poste a l'autre.
        '--locale', 'C',
        '--auth-local', 'trust',
        '--auth-host', 'scram-sha-256',
        // Pas de fsync pendant la creation : mesure faite sur ce poste, 6,7 s
        // -> 2,6 s. Le risque est nul ici : si le poste tombe pendant cette
        // etape, le cluster est incomplet de toute facon et sera recree au
        // lancement suivant. Aucune donnee de l'entreprise n'existe encore.
        '--no-sync',
      ])
      this.onLog('Base de donnees locale creee.')
    } finally {
      try {
        fs.unlinkSync(passwordFile)
      } catch {
        /* sans consequence */
      }
    }

    // Ecoute strictement locale : la base n'est pas exposee au reseau.
    const confPath = path.join(this.dataDir, 'postgresql.conf')
    fs.appendFileSync(
      confPath,
      [
        '',
        "# --- MZ EXPORT ---",
        "listen_addresses = '127.0.0.1'",
        `port = ${this.settings.port}`,
        'max_connections = 40',
        "log_timezone = 'UTC'",
        "timezone = 'UTC'",
        '',
      ].join('\n'),
      'utf8',
    )
  }

  /**
   * Supprime un `postmaster.pid` laisse par un arret brutal.
   *
   * Si le poste redemarre pendant que le logiciel tourne, Windows tue
   * `postgres.exe` sans lui laisser le temps de retirer son verrou : le fichier
   * survit et fait echouer le demarrage suivant.
   *
   * ON NE SUPPRIME QUE SI LE PROCESSUS INSCRIT DANS LE FICHIER EST MORT.
   * Effacer le verrou d'une instance vivante autoriserait un second serveur sur
   * les memes fichiers — c'est la facon la plus sure de corrompre la base.
   *
   * @returns {boolean} vrai si un verrou perime a effectivement ete retire.
   */
  clearStalePidFile() {
    const pidFile = path.join(this.dataDir, 'postmaster.pid')
    if (!fs.existsSync(pidFile)) return false

    // Le PID occupe la premiere ligne du fichier.
    let pid = null
    try {
      pid = Number.parseInt(fs.readFileSync(pidFile, 'utf8').split('\n')[0].trim(), 10)
    } catch {
      /* fichier illisible : on le traite comme perime */
    }

    if (Number.isInteger(pid) && isProcessAlive(pid)) {
      this.onLog(`Verrou detenu par le processus ${pid}, toujours vivant : conserve.`)
      return false
    }

    try {
      fs.unlinkSync(pidFile)
      this.onLog('Verrou obsolete supprime (arret brutal precedent).')
      return true
    } catch (error) {
      this.onLog(`Verrou obsolete non supprimable : ${error.message}`)
      return false
    }
  }

  /** Taille actuelle du journal, pour ne relire ensuite que ce qui s'y ajoute. */
  logSize() {
    try {
      return fs.statSync(this.logFile).size
    } catch {
      return 0
    }
  }

  async start() {
    if (await this.isRunning()) {
      this.onLog('Base de donnees deja en service.')
      return
    }

    // Le verrou perime est nettoye AVANT la premiere tentative, pas apres son
    // echec : c'est l'etat normal du dossier apres un redemarrage du poste, et
    // le laisser en place ne servait qu'a payer un echec previsible.
    this.clearStalePidFile()

    this.onLog('Demarrage de la base de donnees...')

    const args = [
      'start',
      '--pgdata', this.dataDir,
      '--log', this.logFile,
      '--wait',
      '--timeout', '60',
      '--options', `-p ${this.settings.port}`,
    ]

    /**
     * PLUSIEURS TENTATIVES ESPACEES, ET CE N'EST PAS UNE PRECAUTION DE CONFORT.
     *
     * Constate sur ce poste : au premier lancement suivant un redemarrage de
     * Windows, PostgreSQL a echoue sur « could not open file [...]/global/
     * pg_control: No such file or directory » — alors que le fichier etait bien
     * la, lisible, et que le MEME binaire sur le MEME dossier a demarre sans
     * rien changer trois minutes plus tard.
     *
     * L'explication tient a l'analyse antivirus : juste apres un demarrage, le
     * disque est sature et un fichier en cours d'inspection devient
     * momentanement inaccessible. Ce n'est pas rattrapable depuis le logiciel,
     * mais c'est BREF — quelques secondes d'attente suffisent.
     *
     * Un echec transitoire ne doit donc pas se solder par une panne definitive.
     */
    const TENTATIVES = 4
    let derniere = null

    for (let numero = 1; numero <= TENTATIVES; numero += 1) {
      // Position du journal avant la tentative : le diagnostic ne portera que
      // sur les lignes ecrites PAR CETTE TENTATIVE.
      const since = this.logSize()

      try {
        await runService(this.bin('pg_ctl'), args)
        this.onLog(
          numero === 1
            ? 'Base de donnees en service.'
            : `Base de donnees en service (reussie a la tentative ${numero}).`,
        )
        return
      } catch (error) {
        derniere = { error, since }

        // Le detenteur du verrou a pu mourir entre-temps.
        this.clearStalePidFile()

        if (numero < TENTATIVES) {
          const delai = 1000 * 2 ** (numero - 1) // 1 s, 2 s, 4 s
          this.onLog(
            `Demarrage refuse (tentative ${numero}/${TENTATIVES}), ` +
              `nouvel essai dans ${delai / 1000} s...`,
          )
          await attendre(delai)
        }
      }
    }

    throw new Error(this.explainStartFailure(derniere.error, derniere.since))
  }

  /**
   * Traduit les echecs de demarrage connus sur Windows en message actionnable.
   * Le journal PostgreSQL est plus parlant que la sortie de pg_ctl.
   *
   * ATTENTION, PIEGE CORRIGE ICI : ce diagnostic lisait les 15 dernieres lignes
   * du journal, qui s'accumule depuis la creation du cluster. Quand la tentative
   * en cours n'ecrivait rien — pg_ctl qui ne demarre meme pas, journal non
   * ouvrable — l'utilisateur se voyait presenter la panne d'un AUTRE JOUR comme
   * cause de la sienne. On ne lit donc que ce qui a ete ajoute depuis `since`.
   *
   * @param {Error} error
   * @param {number} since Taille du journal avant la tentative.
   */
  explainStartFailure(error, since = 0) {
    let tail = ''
    try {
      // Lecture en octets : `since` vient de `statSync`, donc une taille en
      // octets. Trancher la chaine decodee decalerait sur tout accent.
      const written = fs.readFileSync(this.logFile).subarray(since).toString('utf8').trim()
      tail = written ? written.split('\n').slice(-15).join('\n') : ''
    } catch {
      /* journal illisible : on garde le message d'origine */
    }

    // Segment de memoire partagee non libere par un processus mort.
    if (/pre-existing shared memory block/i.test(tail)) {
      return (
        'La base ne peut pas demarrer : un ancien processus retient encore la memoire ' +
        'partagee.\n\nFermez tous les processus « postgres.exe » depuis le Gestionnaire ' +
        'des taches, ou redemarrez le poste. Aucune donnee n\'est perdue.'
      )
    }

    // Emulation de fork() empechee, typiquement par un antivirus.
    if (/could not reserve shared memory region|0xC0000142/i.test(tail)) {
      return (
        'La base ne peut pas creer ses processus internes (erreur Windows 487).\n\n' +
        'C\'est presque toujours un antivirus qui s\'interpose. Ajoutez une exception ' +
        `pour ces deux dossiers :\n  ${this.dataDir}\n  ${this.binDir}\n\n` +
        'Puis redemarrez le logiciel.'
      )
    }

    return `${error.message}${tail ? `\n\nJournal de la base :\n${tail}` : ''}`
  }

  async stop() {
    if (!this.isInitialised()) return
    if (!(await this.isRunning())) return
    this.onLog('Arret de la base de donnees...')
    try {
      // `fast` : les transactions en cours sont annulees proprement, sans
      // attendre la deconnexion des clients. `smart` bloquerait a la fermeture.
      await run(this.bin('pg_ctl'), [
        'stop', '--pgdata', this.dataDir, '--mode', 'fast', '--wait', '--timeout', '30',
      ])
      this.onLog('Base de donnees arretee.')
    } catch (error) {
      this.onLog(`Arret force : ${error.message}`)
    }
  }

  /**
   * Arret SYNCHRONE, pour la fermeture de session Windows.
   *
   * A la demande d'arret ou de redemarrage du poste, Windows n'attend pas la
   * fin d'une promesse : il accorde quelques secondes puis tue le processus.
   * L'arret asynchrone de `stop()` n'avait donc pas le temps d'aboutir, et
   * PostgreSQL etait tue en plein vol — c'est ce qui laissait la base « non
   * proprement arretee » et imposait une reprise sur incident au lancement
   * suivant, quand elle ne restait pas interrompue en plein milieu.
   *
   * Le mode `fast` ecrit un checkpoint puis ferme : mesure sur ce poste, moins
   * d'une seconde, largement dans le delai accorde par Windows.
   */
  stopSync() {
    if (!this.isInitialised()) return
    try {
      execFileSync(this.bin('pg_ctl'), [
        'stop', '--pgdata', this.dataDir, '--mode', 'fast', '--wait', '--timeout', '10',
      ], { windowsHide: true, stdio: 'ignore', timeout: 12_000 })
    } catch {
      /* Windows va nous tuer de toute facon : rien de plus a tenter. */
    }
  }

  async isRunning() {
    if (!this.isInitialised()) return false
    try {
      await run(this.bin('pg_ctl'), ['status', '--pgdata', this.dataDir])
      return true
    } catch {
      return false
    }
  }

  /**
   * Cree la base applicative si elle n'existe pas encore.
   *
   * Passe par `pg` plutot que par `psql` : deux lancements de processus etaient
   * mesures entre 160 et 440 ms a chaque demarrage, pour une question a laquelle
   * une connexion deja necessaire par ailleurs repond en quelques millisecondes.
   */
  async ensureDatabase() {
    const { database, user, password, port } = this.settings
    const { Client } = require('pg')
    const client = new Client({
      host: '127.0.0.1',
      port,
      user,
      password,
      database: 'postgres',
      connectionTimeoutMillis: 20_000,
    })
    await client.connect()

    try {
      const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
      if (rows.length > 0) return

      this.onLog(`Creation de la base « ${database} »...`)
      // CREATE DATABASE n'accepte pas de parametre lie ni de transaction ; le
      // nom vient de la configuration locale, pas d'une saisie utilisateur.
      await client.query(`CREATE DATABASE "${database}" OWNER "${user}"`)
    } finally {
      await client.end().catch(() => {})
    }
  }

  /**
   * Sauvegarde complete, pieces jointes incluses : celles-ci sont stockees en
   * base (colonne `bytea`), donc `pg_dump` les emporte avec la comptabilite.
   * C'est precisement pourquoi ce choix de stockage a ete fait.
   */
  async backup(destinationDir) {
    fs.mkdirSync(destinationDir, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const target = path.join(destinationDir, `mzexport-${stamp}.dump`)

    await run(this.bin('pg_dump'), [
      '--host', '127.0.0.1',
      '--port', String(this.settings.port),
      '--username', this.settings.user,
      '--dbname', this.settings.database,
      '--no-password',
      // Format personnalise : compresse, et restaurable selectivement.
      '--format', 'custom',
      '--file', target,
    ], { env: { ...process.env, PGPASSWORD: this.settings.password } })

    return target
  }
}

module.exports = { EmbeddedPostgres, run, runService }
