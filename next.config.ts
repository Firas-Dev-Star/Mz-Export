 import type { NextConfig } from 'next'
import { version } from './package.json'

/**
 * Tampon de compilation, fige au moment du build.
 *
 * A QUOI IL SERT : savoir, en regardant l'application, si elle tourne bien la
 * derniere version construite. Sans lui, verifier qu'une mise a jour est
 * arrivee obligeait a chercher un indice fonctionnel dans les ecrans.
 *
 * `new Date()` est evalue ICI, a la compilation, pas a chaque requete : la
 * valeur est inlinee dans le bundle par la cle `env` de Next.
 */
const BUILD_AT = new Date().toISOString()

const nextConfig: NextConfig = {
  env: {
    MZ_APP_VERSION: version,
    MZ_BUILD_AT: BUILD_AT,
  },
  reactStrictMode: true,
  serverExternalPackages: ['@react-pdf/renderer', 'exceljs', 'bcryptjs'],
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },

  // Sortie autonome, requise pour embarquer le serveur dans l'application
  // desktop : Next produit alors un dossier `.next/standalone` contenant son
  // propre serveur Node et les seules dependances utiles.
  //
  // Activee UNIQUEMENT quand MZ_DESKTOP=1, pour ne rien changer au
  // deploiement web actuel.
  ...(process.env.MZ_DESKTOP === '1' ? { output: 'standalone' as const } : {}),

  // Les server actions recoivent des formulaires, jamais de fichier : les
  // pieces jointes passent par la route /api/documents, sans ce plafond.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
}

export default nextConfig
