'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Application des migrations, sans la CLI Prisma.
 *
 * POURQUOI PAS `prisma migrate deploy` : la CLI tire un graphe de dependances
 * profond (`@prisma/config`, `@prisma/dev`, `@prisma/studio-core`, `mysql2`,
 * `postgres`...). Embarquee dans l'application, elle echoue sur la premiere
 * dependance non livree — et l'enumeration transitive est impossible a
 * maintenir de facon fiable.
 *
 * Ce module fait le meme travail avec `pg`, deja present comme dependance de
 * production. Il reste COMPATIBLE avec la CLI : la table `_prisma_migrations`
 * est alimentee au format exact de Prisma, checksum comprise, verifie contre
 * une base reellement migree par la CLI. Un `prisma migrate deploy` lance
 * depuis un poste de developpement voit donc les migrations comme appliquees,
 * sans conflit ni reexecution.
 *
 * La checksum est le SHA-256 du contenu BRUT du fichier migration.sql.
 */

const TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                  VARCHAR(36)  NOT NULL,
    "checksum"            VARCHAR(64)  NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
  )
`

function resolveMigrationsDir(appRoot) {
  const candidates = [
    path.join(appRoot, 'prisma', 'migrations'),
    path.join(process.resourcesPath ?? '', 'prisma', 'migrations'),
  ]
  return candidates.find((c) => c && fs.existsSync(c)) ?? null
}

function checksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/** Migrations presentes sur le disque, dans l'ordre chronologique du nom. */
function readMigrations(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, file: path.join(dir, entry.name, 'migration.sql') }))
    .filter((m) => fs.existsSync(m.file))
    .map((m) => {
      const content = fs.readFileSync(m.file)
      return { ...m, sql: content.toString('utf8'), checksum: checksum(content) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * @param {object} options
 * @param {string} options.appRoot
 * @param {string} options.databaseUrl
 * @param {(line: string) => void} options.onLog
 */
async function applyMigrations({ appRoot, databaseUrl, onLog = () => {} }) {
  const dir = resolveMigrationsDir(appRoot)
  if (!dir) {
    throw new Error(
      "Dossier des migrations introuvable. L'installation est incomplete : " +
        'le dossier « prisma/migrations » doit etre livre avec le logiciel.',
    )
  }

  const migrations = readMigrations(dir)
  if (migrations.length === 0) {
    throw new Error(`Aucune migration trouvee dans ${dir}.`)
  }

  const { Client } = require('pg')
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 20_000 })
  await client.connect()

  try {
    await client.query(TABLE_DDL)

    const { rows } = await client.query(
      'SELECT "migration_name", "checksum" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL',
    )
    const applied = new Map(rows.map((r) => [r.migration_name, r.checksum]))

    // Une migration deja appliquee dont le fichier a change signale un depot
    // et une base desynchronises. On refuse d'aller plus loin : rejouer ou
    // ignorer produirait une structure differente de celle attendue.
    for (const migration of migrations) {
      const seen = applied.get(migration.name)
      if (seen && seen !== migration.checksum) {
        throw new Error(
          `La migration « ${migration.name} » a ete modifiee apres avoir ete appliquee.\n\n` +
            'La base et le logiciel ne correspondent plus. Restaurez une sauvegarde ' +
            'ou contactez le developpeur — aucune modification n\'a ete tentee.',
        )
      }
    }

    const pending = migrations.filter((m) => !applied.has(m.name))

    if (pending.length === 0) {
      onLog(`Structure de la base a jour (${migrations.length} migrations).`)
      return { applied: 0, total: migrations.length }
    }

    onLog(`${pending.length} migration(s) a appliquer...`)

    for (const migration of pending) {
      const started = new Date()
      // Chaque migration est atomique : PostgreSQL sait annuler du DDL.
      // Un echec laisse donc la base exactement dans son etat anterieur.
      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query(
          `INSERT INTO "_prisma_migrations"
             ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
           VALUES ($1, $2, $3, $4, now(), 1)`,
          [crypto.randomUUID(), migration.checksum, migration.name, started],
        )
        await client.query('COMMIT')
        onLog(`  applique : ${migration.name}`)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw new Error(
          `La migration « ${migration.name} » a echoue :\n${error.message}\n\n` +
            'Aucune modification n\'a ete conservee.',
        )
      }
    }

    onLog('Structure de la base a jour.')
    return { applied: pending.length, total: migrations.length }
  } finally {
    await client.end().catch(() => {})
  }
}

module.exports = { applyMigrations, readMigrations, resolveMigrationsDir, checksum }
