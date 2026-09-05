import { dec } from '@/lib/money'

/**
 * Formatage d'affichage. Regle metier : la devise est TOUJOURS affichee
 * a cote du montant, et deux devises differentes ne sont jamais additionnees.
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  TND: 'DT',
  USD: '$',
}

export const CURRENCY_DECIMALS: Record<string, number> = {
  EUR: 2,
  TND: 3,
  USD: 2,
}

export function currencySymbol(code: string) {
  return CURRENCY_SYMBOLS[code?.toUpperCase()] ?? code
}

export function currencyDecimals(code: string) {
  return CURRENCY_DECIMALS[code?.toUpperCase()] ?? 2
}

/** "13230" -> "13 230,00" (espaces insecables, virgule decimale). */
export function formatNumber(value: unknown, decimals = 2): string {
  const n = dec(value).toDecimalPlaces(decimals).toFixed(decimals)
  const [intPart, fracPart] = n.split('.')
  const sign = intPart.startsWith('-') ? '-' : ''
  const digits = sign ? intPart.slice(1) : intPart
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return fracPart ? `${sign}${grouped},${fracPart}` : `${sign}${grouped}`
}

/** "13230" + EUR -> "13 230,00 €" */
export function formatMoney(value: unknown, currencyCode = 'EUR'): string {
  const decimals = currencyDecimals(currencyCode)
  return `${formatNumber(value, decimals)} ${currencySymbol(currencyCode)}`
}

/**
 * Prix UNITAIRE, affiche a la precision reellement stockee.
 *
 * POURQUOI PAS `formatMoney`. Un montant est arrondi aux decimales de sa
 * devise — 3 pour le dinar. Mais un prix unitaire est enregistre a 4 decimales
 * (`Decimal(18,4)`), parce qu'un prix au kilo ou a la piece se negocie a la
 * fraction de millime. L'afficher avec 3 decimales cachait un chiffre qui
 * existe en base, et rendait impossible le recoupement avec le classeur.
 *
 * Les zeros inutiles sont retires au-dela des decimales de la devise :
 * 8,5 s'affiche « 8,500 » et non « 8,5000 », 6,0459 garde ses quatre chiffres.
 */
export const UNIT_PRICE_DECIMALS = 4

export function formatUnitPrice(value: unknown, currencyCode = 'EUR'): string {
  const minimum = currencyDecimals(currencyCode)
  const d = dec(value).toDecimalPlaces(UNIT_PRICE_DECIMALS)
  // Nombre de decimales reellement significatives, jamais moins que la devise.
  const ecrit = d.toFixed(UNIT_PRICE_DECIMALS)
  const sansZeros = ecrit.replace(/0+$/, '')
  const utiles = Math.max(minimum, (sansZeros.split('.')[1] ?? '').length)
  return `${formatNumber(d, utiles)} ${currencySymbol(currencyCode)}`
}

/** Variante compacte pour les cartes du tableau de bord. */
export function formatMoneyCompact(value: unknown, currencyCode = 'EUR'): string {
  const d = dec(value)
  const abs = d.abs()
  if (abs.greaterThanOrEqualTo(1_000_000)) {
    return `${formatNumber(d.dividedBy(1_000_000), 2)} M ${currencySymbol(currencyCode)}`
  }
  return formatMoney(value, currencyCode)
}

export function formatPercent(value: unknown, decimals = 2): string {
  return `${formatNumber(value, decimals)} %`
}

export function formatQuantity(value: unknown): string {
  const d = dec(value)
  return d.isInteger() ? formatNumber(d, 0) : formatNumber(d, 3)
}

/** JJ/MM/AAAA */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getUTCFullYear()}`
}

/** AAAA-MM-JJ (valeur des <input type="date">) */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

/** Interprete "AAAA-MM-JJ" comme une date calendaire UTC (pas de decalage de fuseau). */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return value
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  CONFIRMED: 'Confirmée',
  PARTIALLY_PAID: 'Partiellement payée',
  PAID: 'Payée',
  OVERDUE: 'En retard',
  CANCELLED: 'Annulée',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Virement bancaire',
  CASH: 'Espèces',
  CHEQUE: 'Chèque',
  OTHER: 'Autre',
}

export const VAT_MODE_LABELS: Record<string, string> = {
  NONE: 'Exonéré (export)',
  ZERO: 'TVA 0 %',
  RATE: 'TVA au taux défini',
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Gestionnaire',
  USER: 'Utilisateur',
}
