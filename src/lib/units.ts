/**
 * Unites de mesure du catalogue.
 *
 * Liste FERMEE : la saisie libre autorisait des variantes du meme code
 * (KG, Kg, kg, kilo...) qui se retrouvaient telles quelles sur les factures
 * et empechaient tout regroupement fiable.
 *
 * Module PUR : utilise par les formulaires, les schemas Zod et le rendu PDF.
 */

export const UNIT_CODES = [
  'PCS',
  'KG',
  'G',
  'T',
  'M',
  'M2',
  'M3',
  'L',
  'ML',
  'PAIRE',
  'LOT',
  'CARTON',
  'PALETTE',
  'ROULEAU',
] as const

export type UnitCode = (typeof UNIT_CODES)[number]

/** Libelle affiche dans la liste deroulante. */
export const UNITS: Record<UnitCode, string> = {
  PCS: 'Pièce (PCS)',
  KG: 'Kilogramme (KG)',
  G: 'Gramme (G)',
  T: 'Tonne (T)',
  M: 'Mètre (M)',
  M2: 'Mètre carré (M²)',
  M3: 'Mètre cube (M³)',
  L: 'Litre (L)',
  ML: 'Millilitre (ML)',
  PAIRE: 'Paire',
  LOT: 'Lot',
  CARTON: 'Carton',
  PALETTE: 'Palette',
  ROULEAU: 'Rouleau',
}

/**
 * Symbole court imprime sur les documents (facture, bon de livraison).
 * M2 et M3 y prennent leur forme typographique correcte.
 */
export const UNIT_SYMBOLS: Record<UnitCode, string> = {
  PCS: 'PCS',
  KG: 'KG',
  G: 'G',
  T: 'T',
  M: 'M',
  M2: 'M²',
  M3: 'M³',
  L: 'L',
  ML: 'ML',
  PAIRE: 'PAIRE',
  LOT: 'LOT',
  CARTON: 'CARTON',
  PALETTE: 'PALETTE',
  ROULEAU: 'ROULEAU',
}

export function unitLabel(code: string): string {
  return UNITS[code as UnitCode] ?? code
}

/**
 * Symbole a imprimer. Retourne le code tel quel si inconnu : les produits
 * crees avant la fermeture de la liste restent affichables.
 */
export function unitSymbol(code: string): string {
  return UNIT_SYMBOLS[code as UnitCode] ?? code
}

export function isUnitCode(value: string): value is UnitCode {
  return (UNIT_CODES as readonly string[]).includes(value)
}
