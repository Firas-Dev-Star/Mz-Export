/**
 * Constantes du commerce international.
 *
 * Ce module est PUR (aucun import serveur) : il est utilise a la fois par les
 * formulaires client, les schemas Zod partages et le rendu PDF.
 */

// ---------------------------------------------------------------------------
// Incoterms 2020
// ---------------------------------------------------------------------------

export const INCOTERM_CODES = [
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
] as const

export type IncotermCode = (typeof INCOTERM_CODES)[number]

interface IncotermDefinition {
  /** Intitule anglais officiel. */
  english: string
  /** Traduction francaise usuelle. */
  french: string
  /**
   * Incoterm reserve au transport maritime et fluvial (regle CCI 2020).
   * L'utiliser pour un envoi routier ou aerien est une erreur frequente.
   */
  maritimeOnly: boolean
}

export const INCOTERMS: Record<IncotermCode, IncotermDefinition> = {
  EXW: { english: 'Ex Works', french: "A l'usine", maritimeOnly: false },
  FCA: { english: 'Free Carrier', french: 'Franco transporteur', maritimeOnly: false },
  CPT: { english: 'Carriage Paid To', french: "Port paye jusqu'a", maritimeOnly: false },
  CIP: {
    english: 'Carriage and Insurance Paid To',
    french: 'Port paye, assurance comprise',
    maritimeOnly: false,
  },
  DAP: { english: 'Delivered At Place', french: 'Rendu au lieu de destination', maritimeOnly: false },
  DPU: {
    english: 'Delivered at Place Unloaded',
    french: 'Rendu au lieu de destination decharge',
    maritimeOnly: false,
  },
  DDP: { english: 'Delivered Duty Paid', french: 'Rendu droits acquittes', maritimeOnly: false },
  FAS: { english: 'Free Alongside Ship', french: 'Franco le long du navire', maritimeOnly: true },
  FOB: { english: 'Free On Board', french: 'Franco a bord', maritimeOnly: true },
  CFR: { english: 'Cost and Freight', french: 'Cout et fret', maritimeOnly: true },
  CIF: { english: 'Cost, Insurance and Freight', french: 'Cout, assurance et fret', maritimeOnly: true },
}

/** Libelle complet affiche dans la liste deroulante. */
export function incotermLabel(code: string): string {
  const def = INCOTERMS[code as IncotermCode]
  if (!def) return code
  return `${code} — ${def.french}`
}

export function isIncotermCode(value: string): value is IncotermCode {
  return (INCOTERM_CODES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Modes de transport
// ---------------------------------------------------------------------------

export const TRANSPORT_MODE_CODES = ['MARITIME', 'ROUTIER', 'AERIEN', 'MIXTE'] as const

export type TransportModeCode = (typeof TRANSPORT_MODE_CODES)[number]

export const TRANSPORT_MODES: Record<TransportModeCode, string> = {
  MARITIME: 'Maritime',
  ROUTIER: 'Routier',
  AERIEN: 'Aerien',
  MIXTE: 'Mixte',
}

export function transportModeLabel(code: string): string {
  return TRANSPORT_MODES[code as TransportModeCode] ?? code
}

export function isTransportModeCode(value: string): value is TransportModeCode {
  return (TRANSPORT_MODE_CODES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Coherence incoterm / mode de transport
// ---------------------------------------------------------------------------

/**
 * Avertissement (jamais bloquant) lorsqu'un incoterm maritime est associe a un
 * transport non maritime. C'est l'erreur la plus courante sur une facture
 * export : FOB sur un envoi routier n'a pas de sens juridique.
 *
 * Retourne `null` si la combinaison est coherente ou incomplete.
 */
export function incotermTransportWarning(
  incoterm: string,
  transportMode: string,
): string | null {
  if (!incoterm || !transportMode) return null
  const def = INCOTERMS[incoterm as IncotermCode]
  if (!def?.maritimeOnly) return null
  if (transportMode === 'MARITIME' || transportMode === 'MIXTE') return null
  return `L'incoterm ${incoterm} est reserve au transport maritime et fluvial. Pour un envoi ${transportModeLabel(transportMode).toLowerCase()}, utilisez plutot FCA, CPT, CIP, DAP, DPU ou DDP.`
}
