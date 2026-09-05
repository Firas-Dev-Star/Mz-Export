#!/usr/bin/env node
'use strict'

/**
 * Verifie le moteur de migrations contre une base reellement migree par la CLI
 * Prisma. Deux proprietes doivent tenir :
 *
 *   1. Les checksums calcules correspondent a ceux enregistres par la CLI.
 *   2. Sur une base a jour, le moteur n'applique RIEN (idempotence).
 */

const path = require('node:path')
const { applyMigrations, readMigrations, resolveMigrationsDir } = require('../electron/migrate')
const config = require('../electron/config')

const userData = path.join(process.env.APPDATA, 'mz-export-gestion')

async function main() {
  const cfg = config.readConfig(userData)
  const url = config.databaseUrl(cfg)
  const root = path.join(__dirname, '..')

  const dir = resolveMigrationsDir(root)
  const migrations = readMigrations(dir)
  console.log(`${migrations.length} migrations lues depuis ${dir}\n`)

  const { Client } = require('pg')
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 15_000 })
  await client.connect()
  const { rows } = await client.query(
    'SELECT "migration_name", "checksum" FROM "_prisma_migrations" ORDER BY "migration_name"',
  )
  await client.end()

  const parCli = new Map(rows.map((r) => [r.migration_name, r.checksum]))

  let ok = true
  for (const m of migrations) {
    const attendu = parCli.get(m.name)
    if (!attendu) {
      console.log(`  ABSENT   ${m.name} (pas encore appliquee par la CLI)`)
      continue
    }
    const match = attendu === m.checksum
    if (!match) ok = false
    console.log(`  ${match ? 'OK      ' : 'ECART   '} ${m.name}`)
  }

  if (!ok) {
    console.error('\nLes checksums divergent de ceux de la CLI Prisma.')
    process.exit(1)
  }
  console.log('\nChecksums conformes a ceux de la CLI Prisma.')

  console.log('\n--- idempotence : applyMigrations sur une base a jour ---')
  const result = await applyMigrations({
    appRoot: root,
    databaseUrl: url,
    onLog: (l) => console.log(`  ${l}`),
  })

  if (result.applied !== 0) {
    console.error(`\nECHEC : ${result.applied} migration(s) appliquee(s) alors que la base etait a jour.`)
    process.exit(1)
  }
  console.log(`\nIdempotence verifiee : 0 appliquee, ${result.total} connues.`)
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}`)
  process.exit(1)
})
