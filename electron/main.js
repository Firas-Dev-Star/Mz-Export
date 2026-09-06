'use strict'

const { app, BrowserWindow, Menu, Tray, dialog, shell, clipboard, nativeImage } = require('electron')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

const { readConfig, defaultConfig, databaseUrl, dataDir, backupDir } = require('./config')
const { EmbeddedPostgres } = require('./postgres')
const { applyMigrations } = require('./migrate')
const { bootstrapIfNeeded } = require('./bootstrap')
const { startServer } = require('./server')

/**
 * MZ EXPORT — application desktop.
 *
 * Architecture : ce processus orchestre trois choses, dans cet ordre.
 *
 *   1. PostgreSQL local, ecoutant sur 127.0.0.1 uniquement.
 *   2. Les migrations Prisma, appliquees si necessaire.
 *   3. Le serveur Next.js, ecoutant sur 0.0.0.0 — c'est lui, et lui seul,
 *      qui est accessible depuis les autres postes du reseau WiFi.
 *
 * La base n'est donc jamais exposee au reseau. Les autres postes n'installent
 * rien : ils ouvrent l'adresse affichee par l'icone de la barre des taches.
 */

const isDev = process.env.MZ_DESKTOP_DEV === '1'
const APP_NAME = 'MZ EXPORT'

// Instance unique : deux serveurs sur la meme base corrompraient les donnees.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

const state = {
  window: null,
  tray: null,
  postgres: null,
  serverChild: null,
  url: null,
  ready: false,
  logs: [],
  error: null,
}

/**
 * Journal de demarrage, ecrit sur disque.
 *
 * POURQUOI UN FICHIER : le journal ne vivait qu'en memoire, consultable par le
 * seul menu de la barre des taches. Quand le demarrage echoue, c'est justement
 * le moment ou l'on ne peut plus rien consulter — et le diagnostic etait perdu.
 * La session precedente est conservee a cote : une panne au demarrage se
 * constate presque toujours apres coup.
 */
let logStream = null

function openLogFile() {
  try {
    const file = path.join(app.getPath('userData'), 'demarrage.log')
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.precedent`)
    logStream = fs.createWriteStream(file, { flags: 'a' })
  } catch {
    // Journal sur disque impossible : ce n'est pas une raison de ne pas demarrer.
    logStream = null
  }
}

function log(line) {
  const stamped = `${new Date().toISOString().slice(11, 19)} ${line}`
  state.logs.push(stamped)
  // On borne le journal : une session de plusieurs jours ne doit pas gonfler
  // indefiniment en memoire.
  if (state.logs.length > 500) state.logs.splice(0, state.logs.length - 500)
  console.log(stamped)
  logStream?.write(`${stamped}\n`)
  tellSplash('etape', line)
  refreshTrayMenu()
}

/** Adresses IPv4 du poste, pour les communiquer aux autres machines. */
/**
 * Adresses par lesquelles les autres postes du reseau peuvent joindre
 * l'application.
 *
 * LES ADRESSES 169.254.x SONT ECARTEES. Windows en attribue une a toute carte
 * reseau qui n'a pas obtenu de bail DHCP — typiquement une carte WiFi inactive.
 * Elles ne mènent nulle part : les afficher a cote de la bonne adresse conduit
 * l'utilisateur a essayer une adresse morte et a croire que le partage ne
 * fonctionne pas.
 */
function localAddresses(port) {
  const addresses = []

  // Adresse par le NOM de la machine, en premier parce que c'est la seule qui
  // survit a un changement de reseau ou de bail DHCP. Les box distribuent
  // souvent des baux courts : l'adresse numerique change, le nom jamais.
  // Resolue nativement par les iPhone et les Mac (Bonjour) et par Windows.
  const nom = os.hostname().trim().toLowerCase()
  if (nom && !nom.includes('.')) addresses.push(`http://${nom}.local:${port}`)

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      if (entry.address.startsWith('169.254.')) continue
      addresses.push(`http://${entry.address}:${port}`)
    }
  }
  return addresses
}

function appRoot() {
  // En production, les fichiers applicatifs sont dans resources/app ;
  // en developpement, la racine du depot.
  return app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..')
}

// ---------------------------------------------------------------------------
// Fenetre
// ---------------------------------------------------------------------------

/**
 * L'adresse appartient-elle a l'application servie localement ?
 *
 * La comparaison porte sur l'ORIGINE de la page affichee, pas sur une liste
 * d'hotes ecrite en dur : le serveur peut ecouter sur localhost, sur 127.0.0.1
 * ou sur un port different selon la configuration.
 */
function isAppUrl(url) {
  const base = state.window?.webContents.getURL() || state.url
  if (!base) return false
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}

/**
 * Fait parvenir l'avancement — ou la panne — a l'ecran de demarrage.
 *
 * Sans cela, cet ecran affiche indefiniment sa barre animee et son message
 * « le premier lancement est plus long », y compris quand le demarrage a
 * echoue : une panne se lisait comme une lenteur. Les messages emis avant la
 * fin du chargement de la page sont mis de cote et rejoues.
 */
const splash = { ready: false, attente: [] }

function tellSplash(fonction, texte) {
  // Une fois l'application servie, la page de demarrage n'est plus affichee.
  if (state.url) return

  if (!splash.ready) {
    splash.attente.push([fonction, texte])
    if (splash.attente.length > 50) splash.attente.shift()
    return
  }

  state.window?.webContents
    .executeJavaScript(`window.mz?.${fonction}?.(${JSON.stringify(texte)})`)
    .catch(() => {
      /* page remplacee entre-temps : sans consequence */
    })
}

function createWindow() {
  state.window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#1e2f52',
    title: APP_NAME,
    autoHideMenuBar: true,
    // En production, l'icone de l'executable est posee par electron-builder.
    // Ici, c'est celle de la fenetre et de la barre des taches en developpement.
    ...(assetPath('icon.ico') ? { icon: assetPath('icon.ico') } : {}),
    webPreferences: {
      // Aucun code applicatif ne tourne avec les privileges Node : la fenetre
      // n'affiche qu'une page web servie en local.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  state.window.once('ready-to-show', () => state.window?.show())

  state.window.webContents.on('did-finish-load', () => {
    if (state.url) return
    splash.ready = true
    const enAttente = splash.attente.splice(0)
    for (const [fonction, texte] of enAttente) tellSplash(fonction, texte)
  })

  // Ouverture d'un lien en nouvelle fenetre (target="_blank").
  //
  // ATTENTION, PIEGE CORRIGE ICI : tout envoyer au navigateur systeme cassait
  // les PDF et les pieces jointes. La session vit dans un cookie du pot
  // d'Electron ; le navigateur systeme ne l'a pas, et le serveur repondait
  // « Non authentifie » a chaque telechargement.
  //
  // Un lien vers l'application reste donc DANS l'application, ou le cookie est
  // envoye. Seules les adresses etrangeres partent vers le navigateur.
  state.window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }

    // Telechargement explicite : le gestionnaire d'Electron s'en charge, avec
    // la session de la fenetre. Pas de fenetre vide qui traine derriere.
    if (/[?&]download=1(?:&|$)/.test(url)) {
      state.window?.webContents.downloadURL(url)
      return { action: 'deny' }
    }

    // Consultation : une fenetre fille, meme session, avec le lecteur PDF de
    // Chromium active (`plugins`), sinon un PDF se telechargerait au lieu de
    // s'afficher.
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1100,
        height: 900,
        backgroundColor: '#ffffff',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          plugins: true,
        },
      },
    }
  })

  state.window.on('closed', () => {
    state.window = null
  })

  return state.window
}

function showWindow() {
  if (!state.window) {
    createWindow()
    if (state.url) state.window.loadURL(state.url)
    else state.window.loadFile(path.join(__dirname, 'demarrage.html'))
    return
  }
  if (state.window.isMinimized()) state.window.restore()
  state.window.show()
  state.window.focus()
}

// ---------------------------------------------------------------------------
// Icone de la barre des taches
// ---------------------------------------------------------------------------

/** Chemin d'un fichier d'icone, ou null s'il est absent. */
function assetPath(name) {
  const file = path.join(__dirname, 'assets', name)
  return fs.existsSync(file) ? file : null
}

function trayIcon() {
  const file = assetPath('tray.png')
  if (file) return nativeImage.createFromPath(file)
  // Icone de repli : un carre transparent evite un plantage si l'asset manque.
  return nativeImage.createEmpty()
}

function refreshTrayMenu() {
  if (!state.tray) return

  const port = state.url ? new URL(state.url).port : ''
  const addresses = state.ready && port ? localAddresses(port) : []

  const template = [
    {
      label: state.error
        ? `⚠ ${APP_NAME} — erreur au demarrage`
        : state.ready
          ? `● ${APP_NAME} — en service`
          : `… ${APP_NAME} — demarrage`,
      enabled: false,
    },
    { type: 'separator' },
    { label: 'Ouvrir la fenetre', click: showWindow, enabled: !state.error },
  ]

  if (addresses.length > 0) {
    template.push(
      { type: 'separator' },
      { label: 'Adresse pour les autres postes', enabled: false },
      ...addresses.map((address) => ({
        label: `   ${address}`,
        click: () => {
          clipboard.writeText(address)
          log(`Adresse copiee : ${address}`)
        },
      })),
    )
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Sauvegarder maintenant',
      enabled: state.ready && Boolean(state.postgres),
      click: () => void runBackup(),
    },
    {
      label: 'Ouvrir le dossier des sauvegardes',
      click: () => {
        const dir = backupDir(app.getPath('userData'))
        fs.mkdirSync(dir, { recursive: true })
        shell.openPath(dir)
      },
    },
    { type: 'separator' },
    { label: 'Afficher le journal', click: showLogs },
    { type: 'separator' },
    { label: 'Quitter', click: () => void shutdown(true) },
  )

  state.tray.setContextMenu(Menu.buildFromTemplate(template))
  state.tray.setToolTip(
    state.error ? `${APP_NAME} — erreur` : state.ready ? `${APP_NAME} — en service` : `${APP_NAME} — demarrage`,
  )
}

function createTray() {
  state.tray = new Tray(trayIcon())
  state.tray.on('double-click', showWindow)
  refreshTrayMenu()
}

function showLogs() {
  dialog.showMessageBox({
    type: state.error ? 'error' : 'info',
    title: `${APP_NAME} — journal`,
    message: state.error ? 'Le demarrage a echoue.' : 'Journal de demarrage',
    detail: state.logs.slice(-40).join('\n') || 'Aucun evenement.',
    buttons: ['Fermer', 'Copier le journal'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 1) clipboard.writeText(state.logs.join('\n'))
  })
}

async function runBackup() {
  if (!state.postgres) return
  try {
    log('Sauvegarde en cours...')
    const file = await state.postgres.backup(backupDir(app.getPath('userData')))
    log(`Sauvegarde ecrite : ${path.basename(file)}`)
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Sauvegarde terminee',
      message: 'La sauvegarde a ete enregistree.',
      detail: `${file}\n\nElle contient la comptabilite ET les pieces jointes.\nCopiez-la sur une cle USB ou un disque externe.`,
      buttons: ['Fermer', 'Ouvrir le dossier'],
      defaultId: 1,
    })
    if (response === 1) shell.openPath(path.dirname(file))
  } catch (error) {
    log(`Sauvegarde impossible : ${error.message}`)
    dialog.showErrorBox('Sauvegarde impossible', error.message)
  }
}

// ---------------------------------------------------------------------------
// Demarrage
// ---------------------------------------------------------------------------

/** Quelque chose ecoute-t-il deja sur ce port local ? */
function portOccupe(port, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const fini = (v) => {
      socket.destroy()
      resolve(v)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => fini(true))
    socket.once('timeout', () => fini(false))
    socket.once('error', () => fini(false))
    socket.connect(port, '127.0.0.1')
  })
}

async function boot() {
  const userData = app.getPath('userData')

  /**
   * Lecture de la configuration, avec le garde-fou le plus important du
   * fichier.
   *
   * LE DANGER : dans l'etat defaillant, ce processus voit son dossier de
   * donnees comme VIDE — mesure plusieurs fois le 5 septembre, pendant qu'un
   * autre processus lisait tout normalement. `config.json` paraissait donc
   * absent, l'application en fabriquait une neuve, avec un NOUVEAU MOT DE
   * PASSE, et se heurtait a « password authentication failed » sur sa propre
   * base. Une premiere protection s'appuyait sur la presence de `pgdata` :
   * inutile, puisque ce dossier est invisible au meme moment.
   *
   * LA PREUVE QUI TIENT : le PORT. Si un serveur repond sur 127.0.0.1, le
   * poste est deja installe, quoi que le systeme de fichiers raconte. On
   * refuse alors de creer quoi que ce soit et on relance le processus.
   */
  let config
  try {
    config = readConfig(userData)
  } catch (error) {
    if (!error.configAbsente) throw error

    if (await portOccupe(defaultConfig().embedded.port)) {
      log('Configuration introuvable alors que la base repond : lecture defaillante.')
      error.dossierIndisponible = true
      throw error
    }

    // Personne sur le port et pas de configuration : premiere installation.
    log('Premiere installation : creation de la configuration du poste.')
    config = readConfig(userData, { creerSiAbsent: true })
  }
  const root = appRoot()

  log(`Donnees : ${userData}`)

  let url = databaseUrl(config)

  if (config.mode === 'embedded') {
    const binDir = app.isPackaged
      ? path.join(process.resourcesPath, 'pgsql', 'bin')
      : path.join(root, 'vendor', 'pgsql', 'bin')

    const postgres = new EmbeddedPostgres({
      binDir,
      dataDir: dataDir(userData),
      settings: config.embedded,
      onLog: log,
    })

    if (!postgres.isAvailable()) {
      throw new Error(
        `Binaires PostgreSQL introuvables dans ${binDir}.\n\n` +
          'Placez-y une distribution PostgreSQL portable (dossier bin contenant ' +
          'initdb, pg_ctl, psql et pg_dump), ou passez en mode « remote » dans ' +
          `${path.join(userData, 'config.json')}.`,
      )
    }

    state.postgres = postgres

    // AVANT TOUT LE RESTE. Juste apres un demarrage de Windows, le dossier de
    // donnees peut rester illisible une minute ou plus. Sans cette attente,
    // `isInitialised()` repondrait faux sur un cluster pourtant existant, et
    // `initdb` serait lance sur un dossier deja peuple.
    await postgres.waitForDataDir()

    // Le journal n'a peut-etre pas pu etre ouvert au demarrage, pour la meme
    // raison. Maintenant que le dossier repond, on retente.
    if (!logStream) openLogFile()

    await postgres.initialise()
    await postgres.start()
    await postgres.ensureDatabase()
  } else {
    log('Mode distant : connexion a un serveur PostgreSQL existant.')
  }

  await applyMigrations({ appRoot: root, databaseUrl: url, onLog: log })

  // Les migrations creent la structure, pas les donnees indispensables. Sans
  // cet amorcage, une installation neuve n'a aucun compte utilisateur et
  // personne ne peut se connecter.
  const seeded = await bootstrapIfNeeded({ appRoot: root, databaseUrl: url, onLog: log })

  const server = await startServer({
    appRoot: root,
    databaseUrl: url,
    authSecret: config.authSecret,
    httpPort: config.httpPort,
    dev: isDev,
    onLog: log,
  })

  state.serverChild = server.child
  state.url = server.url
  state.ready = true

  log(`Application prete : ${server.url}`)
  for (const address of localAddresses(server.port)) {
    log(`Accessible depuis le reseau : ${address}`)
  }

  if (state.window) state.window.loadURL(server.url)
  else showWindow()

  refreshTrayMenu()

  // Sur une base fraichement amorcee, l'utilisateur n'a aucun moyen de deviner
  // les identifiants : on les lui montre une fois, en l'invitant a les changer.
  if (seeded) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Premiere utilisation',
      message: 'Le compte administrateur a ete cree.',
      detail:
        `Adresse email : ${seeded.email}
` +
        `Mot de passe  : ${seeded.password}

` +
        'Changez ce mot de passe des la premiere connexion, dans ' +
        'Parametres > Utilisateurs.',
      buttons: ['Compris'],
    })
  }
}

let shuttingDown = false

async function shutdown(quit = false) {
  if (shuttingDown) return
  shuttingDown = true

  log('Fermeture...')
  if (state.serverChild && !state.serverChild.killed) {
    state.serverChild.kill()
  }
  if (state.postgres) {
    try {
      await state.postgres.stop()
    } catch (error) {
      log(`Arret de la base : ${error.message}`)
    }
  }
  if (quit) app.exit(0)
}

app.on('second-instance', showWindow)

/**
 * Arret ou redemarrage du poste.
 *
 * C'EST LA CORRECTION LA PLUS IMPORTANTE POUR LA FIABILITE. Windows previent
 * puis tue, en quelques secondes ; il n'attend aucune promesse. Le chemin
 * asynchrone de `before-quit` n'avait donc pas le temps d'arreter PostgreSQL,
 * qui etait tue en plein vol. La base repartait alors en reprise sur incident
 * au lancement suivant — voire restait interrompue en pleine reprise, ce qui
 * bloquait le demarrage.
 *
 * LA BASE EST ARRETEE EN PREMIER. Une premiere version tuait le serveur Next
 * d'abord ; le redemarrage du 5 septembre a montre que ce n'etait pas tenable —
 * le serveur mourait bien (code 0x40010004, signature d'un TerminateProcess),
 * mais `pg_control` restait sur « en production », donc `stopSync()` n'allait
 * pas au bout. Windows n'accorde que quelques secondes : elles doivent aller a
 * la seule etape dont depend l'integrite des donnees. Le serveur applicatif,
 * lui, disparait de toute facon avec le processus.
 */
app.on('session-end', () => {
  shuttingDown = true
  state.postgres?.stopSync()
  if (state.serverChild && !state.serverChild.killed) state.serverChild.kill()
})

// Fermer la fenetre ne quitte pas l'application : le serveur doit rester en
// service pour les autres postes. On quitte par l'icone de la barre des taches.
app.on('window-all-closed', () => {})

app.on('before-quit', (event) => {
  if (shuttingDown) return
  event.preventDefault()
  void shutdown(true)
})

/**
 * Nombre de relances deja tentees, transporte d'un processus a l'autre.
 *
 * Il voyage par la ligne de commande : un processus relance ne partage rien
 * d'autre avec son predecesseur.
 */
function nombreDeRelances() {
  const arg = process.argv.find((a) => a.startsWith('--mz-relance='))
  const n = arg ? Number.parseInt(arg.split('=')[1], 10) : 0
  return Number.isInteger(n) && n >= 0 ? n : 0
}

// La fenetre a risque se compte en minutes, pas en secondes : 15 relances
// espacees de 20 s couvrent cinq minutes apres l'ouverture de session.
const RELANCES_MAX = 15
const DELAI_RELANCE_MS = 20_000

/**
 * Relance l'application, seul remede connu au dossier illisible.
 *
 * POURQUOI RELANCER PLUTOT QU'ATTENDRE. Un processus demarre dans les
 * premieres secondes suivant l'ouverture de session peut garder une vue
 * perimee du dossier de donnees, et ne jamais en sortir : mesure le
 * 5 septembre, une instance lancee 28 s apres le demarrage echouait encore
 * trois minutes plus tard, alors qu'au meme instant un autre processus — y
 * compris le binaire de l'application lui-meme — lisait le fichier sans
 * difficulte. Relancee, elle demarrait en 2 secondes.
 *
 * Une boucle d'attente interne ne pouvait donc pas fonctionner : c'est le
 * PROCESSUS qu'il faut renouveler, pas le fichier qu'il faut attendre.
 */
function relancerPourDossierIllisible() {
  const suivante = nombreDeRelances() + 1

  log(`Dossier de donnees illisible depuis ce processus : relance ${suivante}/${RELANCES_MAX}.`)
  tellSplash('etape', `Preparation du poste, relance ${suivante}/${RELANCES_MAX}...`)

  // On garde les arguments d'origine et on incremente le compteur.
  const args = process.argv
    .slice(1)
    .filter((a) => !a.startsWith('--mz-relance='))
    .concat(`--mz-relance=${suivante}`)

  // Un repit fixe : la relance immediate retomberait dans la meme fenetre.
  setTimeout(() => {
    app.relaunch({ args })
    app.exit(0)
  }, DELAI_RELANCE_MS)
}

app.whenReady().then(async () => {
  app.setName(APP_NAME)

  /**
   * On quitte le repertoire de travail herite du lanceur.
   *
   * REPRODUCTION DU 5 SEPTEMBRE : lancee avec le repertoire de travail que
   * pose le raccourci du bureau — le dossier d'installation — l'application
   * echoue systematiquement, `pg_ctl` et `postgres` declarant `pg_control`
   * introuvable. Lancee depuis n'importe quel autre dossier, avec le meme
   * binaire, le meme utilisateur et le meme fichier, elle demarre en deux
   * secondes. Constate trois fois de suite, dans les deux sens.
   *
   * Je n'explique pas ce que Windows fait de different dans ce cas. Mais le
   * declencheur est identifie et se neutralise en une ligne : on se place dans
   * le dossier de donnees, qui appartient a l'utilisateur et ne contient
   * aucun binaire.
   */
  try {
    process.chdir(app.getPath('userData'))
  } catch {
    /* repertoire indisponible : ce n'est pas une raison de ne pas demarrer */
  }

  openLogFile()
  createTray()
  createWindow()
  state.window?.loadFile(path.join(__dirname, 'demarrage.html'))

  try {
    await boot()
  } catch (error) {
    // Dossier illisible depuis CE processus : on ne montre pas d'erreur, on
    // relance. L'utilisateur voit seulement la preparation se poursuivre.
    if (error.dossierIndisponible && nombreDeRelances() < RELANCES_MAX) {
      relancerPourDossierIllisible()
      return
    }

    state.error = error
    log(`ECHEC : ${error.message}`)
    refreshTrayMenu()

    // L'ecran de demarrage porte la panne : c'est la seule chose que
    // l'utilisateur regarde. Une boite d'erreur sans fenetre parente passe
    // volontiers DERRIERE elle sous Windows — l'application semblait alors
    // charger sans fin.
    tellSplash('erreur', error.message)
    const boite = {
      type: 'error',
      title: `${APP_NAME} — demarrage impossible`,
      message: 'Le demarrage a echoue.',
      detail: error.message,
      buttons: ['Fermer'],
    }
    // `showMessageBox` lit son premier argument comme les options quand aucune
    // fenetre n'est passee : les deux formes ne sont pas interchangeables.
    await (state.window ? dialog.showMessageBox(state.window, boite) : dialog.showMessageBox(boite))
  }
})
