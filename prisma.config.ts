import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Configuration Prisma 7.
 * - `datasource.url` est utilisee UNIQUEMENT par la CLI (migrate / studio).
 *   En production, on y met la connexion DIRECTE (port 5432 chez Supabase).
 * - Le client applicatif se connecte via l'adaptateur `pg` (voir src/lib/prisma.ts)
 *   en utilisant DATABASE_URL (pooler, port 6543 chez Supabase).
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
})
