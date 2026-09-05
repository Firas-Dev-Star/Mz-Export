'use strict'

const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')

/**
 * Amorcage de la base au premier lancement.
 *
 * Appliquer les migrations ne suffit pas : elles creent la STRUCTURE, pas les
 * donnees indispensables au fonctionnement (devises, parametres societe,
 * sequences de numerotation, compte administrateur). Sans cette etape, le
 * logiciel demarre sur une base vide et PERSONNE NE PEUT SE CONNECTER.
 *
 * POURQUOI PAS `prisma/seed.ts` : ce script importe le client Prisma genere et
 * s'execute via `tsx`. Ni l'un ni l'autre n'est livre dans l'application — les
 * embarquer tirerait un graphe de dependances impossible a maintenir (c'est
 * exactement ce qui faisait echouer la CLI Prisma sur `@prisma/config`).
 *
 * On parle donc directement a PostgreSQL avec `pg`. Les DONNEES, elles, ne sont
 * definies qu'a UN endroit : `prisma/seed-data.cjs`, partage avec le seed. Une
 * installation desktop et une installation web partent des memes parametres.
 */

function resolveSeedData(appRoot) {
  const candidates = [
    path.join(appRoot, 'prisma', 'seed-data.cjs'),
    path.join(process.resourcesPath ?? '', 'prisma', 'seed-data.cjs'),
  ]
  const found = candidates.find((c) => c && fs.existsSync(c))
  // `require` doit recevoir un chemin ABSOLU : une chaine comme
  // « prisma\seed-data.cjs » serait interpretee comme un nom de paquet.
  return found ? path.resolve(found) : null
}

/** Vrai si la base ne contient aucun utilisateur : elle n'a jamais ete amorcee. */
async function needsBootstrap(client) {
  const result = await client.query('SELECT count(*)::int AS n FROM users')
  return result.rows[0].n === 0
}

/**
 * Construit un INSERT depuis un objet, en ignorant les conflits.
 * Les noms de colonnes sont cites : le schema est en camelCase.
 */
function insertFrom(table, row, conflictTarget) {
  const columns = Object.keys(row)
  const values = columns.map((_, i) => `$${i + 1}`)
  return {
    text:
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) ` +
      `VALUES (${values.join(', ')}) ` +
      `ON CONFLICT (${conflictTarget}) DO NOTHING`,
    values: columns.map((c) => row[c]),
  }
}

/**
 * Ecrit les donnees de reference. Chaque insertion ignore les conflits :
 * l'appel est donc sans effet sur une base deja peuplee, comme le seed.
 */
async function seed({ client, appRoot, onLog = () => {} }) {
  const file = resolveSeedData(appRoot)
  if (!file) {
    throw new Error(
      "Donnees initiales introuvables. L'installation est incomplete : " +
        'le fichier « prisma/seed-data.cjs » doit etre livre avec le logiciel.',
    )
  }

  const { CURRENCIES, COMPANY, SEQUENCES, adminAccount } = require(file)
  const now = new Date()

  onLog('Premiere utilisation : creation des donnees initiales...')

  await client.query('BEGIN')
  try {
    // --- Devises ---
    for (const currency of CURRENCIES) {
      const q = insertFrom('currencies', currency, '"code"')
      await client.query(q.text, q.values)
    }

    // --- Parametres societe ---
    // `updatedAt` est gere par Prisma cote client (@updatedAt) : la colonne n'a
    // aucune valeur par defaut en base, il faut donc la fournir ici.
    const q = insertFrom('company_settings', { ...COMPANY, updatedAt: now }, '"id"')
    await client.query(q.text, q.values)

    // --- Sequences de numerotation ---
    for (const sequence of SEQUENCES) {
      const s = insertFrom(
        'invoice_sequences',
        { id: crypto.randomUUID(), ...sequence, updatedAt: now },
        '"key"',
      )
      await client.query(s.text, s.values)
    }

    // --- Compte administrateur ---
    const admin = adminAccount()
    // bcryptjs est une dependance de production : disponible dans l'archive.
    const bcrypt = require('bcryptjs')
    const passwordHash = await bcrypt.hash(admin.password, 12)

    const u = insertFrom(
      'users',
      {
        id: crypto.randomUUID(),
        email: admin.email,
        name: admin.name,
        passwordHash,
        role: admin.role,
        updatedAt: now,
      },
      '"email"',
    )
    await client.query(u.text, u.values)

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw new Error(`Creation des donnees initiales impossible : ${error.message}`)
  }

  const admin = adminAccount()
  onLog('Donnees initiales creees.')
  return { email: admin.email, password: admin.password }
}

/**
 * Amorce la base si necessaire. Ne fait rien sur une base deja peuplee, ce qui
 * rend l'appel sur a chaque demarrage.
 *
 * @returns {Promise<{email: string, password: string} | null>} les identifiants
 *   crees, ou null si la base etait deja amorcee.
 */
async function bootstrapIfNeeded({ appRoot, databaseUrl, onLog = () => {} }) {
  const { Client } = require('pg')
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 20_000 })
  await client.connect()

  try {
    if (!(await needsBootstrap(client))) return null
    return await seed({ client, appRoot, onLog })
  } finally {
    await client.end().catch(() => {})
  }
}

module.exports = { bootstrapIfNeeded, needsBootstrap, resolveSeedData }
