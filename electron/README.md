# MZ EXPORT — application desktop

Logiciel installable Windows : la fenêtre, le serveur applicatif et la base de
données dans un seul paquet. Aucun droit administrateur, aucun service Windows.

## Architecture

```
MZ EXPORT.exe  (processus principal Electron)
├── PostgreSQL         127.0.0.1:5433   ← jamais exposé au réseau
├── migrations + donnees initiales      ← au premier lancement
└── Serveur Next.js    0.0.0.0:PORT     ← accessible en WiFi
       └── fenêtre Chromium
```

**Le point important** : PostgreSQL n'écoute que sur `127.0.0.1`. Seul le port
HTTP est ouvert au réseau. Résultat : aucun `pg_hba.conf` à configurer, et la
base reste inaccessible depuis les autres postes — ils passent par
l'application, qui contrôle les permissions.

## Où vivent les données

| Chemin | Contenu |
|---|---|
| `%APPDATA%\mz-export-gestion\config.json` | Mode, port, mot de passe de la base |
| `%APPDATA%\mz-export-gestion\pgdata\` | Les données PostgreSQL |
| `%APPDATA%\mz-export-gestion\sauvegardes\` | Les `pg_dump` |
| `%APPDATA%\mz-export-gestion\postgres.log` | Journal du serveur de base |

Jamais dans le dossier d'installation : celui-ci est écrasé à chaque mise à
jour. La désinstallation **ne supprime pas** ces données (`deleteAppDataOnUninstall: false`).

> Le nom du dossier vient du champ `name` de `package.json`, pas du nom
> commercial : Electron l'utilise tel quel. **Développement et production
> partagent donc le même dossier.** Pour les séparer, ajouter
> `"productName": "MZ EXPORT"` dans `package.json` — la production basculerait
> alors sur `%APPDATA%\MZ EXPORT` et repartirait d'une base vide.

## Préparer PostgreSQL portable

Les binaires ne sont pas dans le dépôt (~140 Mo une fois élagués). À faire une fois :

1. Télécharger l'archive **binaire** (pas l'installeur) depuis
   <https://www.enterprisedb.com/download-postgresql-binaries> — version 16 a 18, Windows x86-64.
2. Décompresser, puis copier le dossier `pgsql` dans `vendor/` à la racine du dépôt.

Le résultat doit ressembler à :

```
vendor/pgsql/bin/initdb.exe
vendor/pgsql/bin/pg_ctl.exe
vendor/pgsql/bin/psql.exe
vendor/pgsql/bin/pg_dump.exe
vendor/pgsql/lib/...
vendor/pgsql/share/...
```

Vérifier avec :

```bash
node scripts/verifier-pgsql.js
```

## Lancer et construire

### Pour l'utilisateur final : double-clic

Deux commandes produisent l'exécutable, dans cet ordre :

```bash
npm run desktop:build
```

```bash
npm run desktop:dist
```

Le dossier `dist-desktop/` contient alors **deux** façons de lancer par
double-clic :

| Fichier | Usage |
|---|---|
| `MZ EXPORT Setup 1.0.0.exe` | **L'installeur.** Double-clic → installe → raccourci sur le Bureau et dans le menu Démarrer. C'est ce qu'on donne à l'utilisateur. |
| `win-unpacked\MZ EXPORT.exe` | **Version portable.** Double-clic direct, sans installation. Le dossier entier se copie sur une clé USB. Pratique pour tester avant de déployer. |

Aucun terminal, dans les deux cas. Les deux écrivent leurs données au même
endroit — installer après avoir testé en portable conserve donc la base.

### Pour le développement

```bash
npm run dev          # dans un terminal
npm run desktop:dev  # dans un second
```

Ce mode se branche sur `next dev` : pas besoin de reconstruire à chaque
modification. C'est le seul mode qui exige un terminal.

### Régénérer les icônes seules

```bash
npm run icons
```

## Mode distant

Pour se connecter à un PostgreSQL existant au lieu d'en embarquer un — utile
pour tester, ou si la base est déjà installée sur un serveur — éditer
`config.json` :

```json
{
  "mode": "remote",
  "remoteUrl": "postgresql://utilisateur:motdepasse@hote:5432/base"
}
```

## Accès depuis les autres postes

Un clic droit sur l'icône de la barre des tâches affiche les adresses du poste
(`http://192.168.1.x:PORT`). Cliquer sur une adresse la copie.

Trois réglages sur le poste serveur, à faire une fois :

1. **IP fixe** — réservation DHCP dans l'interface du routeur, sinon l'adresse
   change au redémarrage et les raccourcis cassent.
2. **Pare-feu Windows** — autoriser le port en entrée.
3. **Veille désactivée** — s'il s'endort, les autres postes perdent l'accès.

Les autres postes n'installent rien. Depuis Edge ou Chrome, « Installer cette
application » leur donne une fenêtre sans barre d'adresse et une icône dans le
menu Démarrer.

## Sauvegardes

Le menu de l'icône propose **Sauvegarder maintenant** : un `pg_dump` au format
personnalisé dans le dossier des sauvegardes.

Une sauvegarde contient **la comptabilité et les pièces jointes** — les scans
sont stockés en base, pas dans un dossier séparé. C'est exactement pourquoi ce
choix a été fait : un seul fichier à copier, rien à oublier.

Restauration :

```bash
vendor\pgsql\bin\pg_restore.exe --host 127.0.0.1 --port 5433 ^
  --username mzexport --dbname mzexport --clean --if-exists ^
  "%APPDATA%\mz-export-gestion\sauvegardes\mzexport-....dump"
```

## Si la base refuse de démarrer

PostgreSQL sur Windows n'a pas de vrai `fork()` : il le simule en remappant sa
mémoire partagée à une adresse fixe dans chaque processus enfant. Un antivirus
qui injecte une DLL à cette adresse fait échouer l'opération, et **plus aucune
connexion ne peut s'ouvrir**.

Deux symptômes dans `%APPDATA%\mz-export-gestion\postgres.log` :

```
could not reserve shared memory region (addr=...) : error code 487
autovacuum worker was terminated by exception 0xC0000142
```

**Remède** : ajouter une exception antivirus sur deux dossiers —
`%APPDATA%\mz-export-gestion\pgdata` et le dossier `pgsql` de l'installation.
L'application détecte ce cas et affiche le message avec les chemins exacts.

Autre cas, après une coupure de courant ou un arrêt par le Gestionnaire des
tâches :

```
pre-existing shared memory block is still in use
```

Un ancien `postgres.exe` retient la mémoire partagée. L'application supprime
automatiquement le verrou `postmaster.pid` obsolète et réessaie une fois. Si le
message persiste, fermer les `postgres.exe` restants dans le Gestionnaire des
tâches, ou redémarrer le poste. **Aucune donnée n'est perdue** dans les deux cas.

## Premier lancement : le compte administrateur

Appliquer les migrations crée la *structure* de la base, pas les données
indispensables. L'application écrit donc les données de
`prisma/seed-data.cjs` — le même fichier que celui utilisé par
`npm run db:seed` — quand la table des utilisateurs est vide, puis affiche les
identifiants créés dans une boîte de dialogue :

| | |
|---|---|
| Adresse email | `admin@mzexport.tn` |
| Mot de passe | `ChangeMoi!2026` |

À changer dès la première connexion dans **Paramètres → Utilisateurs**.

Pour d'autres identifiants, définir `SEED_ADMIN_EMAIL` et
`SEED_ADMIN_PASSWORD` avant le premier lancement.

> Le seed n'est **pas** rejoué sur une base déjà peuplée : l'appel est sans
> risque à chaque démarrage.

## Comment le serveur Next arrive dans le paquet

Le dossier `.next/standalone` est copié par un hook `afterPack`
([after-pack.cjs](after-pack.cjs)), **pas** par `extraResources`.

Raison : le filtrage par glob d'electron-builder exclut `node_modules`. Le
serveur arrivait donc sans ses 140 dépendances et échouait au démarrage sur
`Cannot find module 'next'` — un installeur d'apparence correcte, inutilisable.

Le hook vérifie le résultat et **fait échouer le build** si les dépendances ou
`server.js` manquent, plutôt que de produire un paquet cassé.

De même, la CLI Prisma n'est pas livrée : son graphe de dépendances
(`@prisma/config`, `@prisma/dev`, `mysql2`, `postgres`…) est impossible à
embarquer de façon fiable. [migrate.js](migrate.js) applique le SQL avec `pg` et
alimente `_prisma_migrations` au format exact de Prisma — checksum comprise,
vérifiée contre une base réellement migrée par la CLI.

## Signature de code

L'installeur n'est pas signé : Windows SmartScreen affichera un avertissement
au premier lancement (« Informations complémentaires » → « Exécuter quand
même »). Attendu pour une application interne. Un certificat de signature
supprimerait l'avertissement.
