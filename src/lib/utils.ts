import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Retire les accents d'une chaine. */
export function deaccent(input: string) {
  return input.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** Construit un code interne lisible a partir d'un libelle (ex. "Wida Import" -> "WIDA-IMPORT"). */
export function slugifyCode(input: string) {
  return deaccent(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

export function isBlank(value: string | null | undefined) {
  return !value || value.trim().length === 0
}

/** Compose une adresse multi-lignes en supprimant les lignes vides. */
export function composeAddress(parts: Array<string | null | undefined>) {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join('\n')
}
