import { z } from 'zod'

/**
 * Schemas de validation partages.
 * Ils sont utilises A LA FOIS cote client (react-hook-form) et cote serveur
 * (server actions / routes API). La validation serveur n'est jamais optionnelle.
 */

/** Champ texte facultatif : "" est accepte et normalise. */
export const optionalText = (max = 255) =>
  z.string().trim().max(max, `${max} caractères maximum`).optional().default('')

export const requiredText = (label: string, max = 255) =>
  z.string().trim().min(1, `${label} est obligatoire`).max(max, `${max} caractères maximum`)

/**
 * Montant saisi par l'utilisateur.
 * Accepte "1 234,56" et "1234.56". Renvoie une chaine normalisee "1234.56"
 * pour eviter tout passage par un float JavaScript.
 */
export const decimalString = (options?: { min?: number; label?: string; allowNegative?: boolean }) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).replace(/\s/g, '').replace(',', '.').trim())
    .refine((value) => value === '' || /^-?\d+(\.\d+)?$/.test(value), {
      message: `${options?.label ?? 'Ce champ'} doit être un nombre valide`,
    })
    .transform((value) => (value === '' ? '0' : value))
    .refine((value) => options?.allowNegative || !value.startsWith('-'), {
      message: `${options?.label ?? 'Ce champ'} ne peut pas être négatif`,
    })
    .refine((value) => options?.min === undefined || Number(value) >= options.min, {
      message: `${options?.label ?? 'Ce champ'} doit être supérieur ou égal à ${options?.min}`,
    })

/** Date au format AAAA-MM-JJ. */
export const dateString = (label = 'La date') =>
  z
    .string()
    .trim()
    .min(1, `${label} est obligatoire`)
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} est invalide`)

export const optionalDateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
  .optional()
  .or(z.literal(''))

export const optionalEmail = z
  .string()
  .trim()
  .email('Adresse email invalide')
  .optional()
  .or(z.literal(''))

export const vatModeSchema = z.enum(['NONE', 'ZERO', 'RATE'])

export const idSchema = z.string().trim().min(1, 'Identifiant manquant')

/** Resultat standard d'une server action. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
