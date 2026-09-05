/**
 * Identite du logiciel, definie en un seul endroit.
 *
 * A ne pas confondre avec les parametres de la societe (table `Company`), qui
 * sont des donnees modifiables depuis l'application : ici il s'agit du logiciel
 * lui-meme, de sa marque et de son auteur.
 */

export const APP_NAME = 'MZ EXPORT'
export const APP_TAGLINE = 'Gestion Commerciale'

/** Mention d'auteur, affichee en petit dans la barre laterale et a la connexion. */
export const APP_AUTHOR = 'Firas ZRAMDA'
export const APP_CREDIT = `Créé par ${APP_AUTHOR}`

/**
 * Version et date de compilation, injectees par `next.config.ts`.
 *
 * Elles permettent de VERIFIER qu'une mise a jour est bien arrivee : si la date
 * affichee dans l'application est celle de la derniere construction, le poste
 * tourne le bon code. Les valeurs de repli servent au mode developpement, ou
 * la compilation est continue.
 */
export const APP_VERSION = process.env.MZ_APP_VERSION ?? '0.0.0'
export const APP_BUILD_AT = process.env.MZ_BUILD_AT ?? ''

/** Date de compilation en francais, ou chaine vide si elle est inconnue. */
export function buildStamp(): string {
  if (!APP_BUILD_AT) return 'développement'
  const d = new Date(APP_BUILD_AT)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
