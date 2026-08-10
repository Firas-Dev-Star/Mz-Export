import { dec, round } from '@/lib/money'

/**
 * Conversion d'un montant en toutes lettres (francais).
 * Utilise pour la mention "Arretee la presente facture a la somme de : ..."
 */

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
]

const TENS: Record<number, string> = {
  2: 'vingt',
  3: 'trente',
  4: 'quarante',
  5: 'cinquante',
  6: 'soixante',
  8: 'quatre-vingt',
}

/** 0 -> 99 */
function belowHundred(n: number): string {
  if (n < 17) return UNITS[n]
  if (n < 20) return `dix-${UNITS[n - 10]}`

  const tenDigit = Math.floor(n / 10)
  const unitDigit = n % 10

  // 70-79 et 90-99 : construits sur soixante / quatre-vingt + 10..19
  if (tenDigit === 7 || tenDigit === 9) {
    const base = tenDigit === 7 ? 'soixante' : 'quatre-vingt'
    const rest = belowHundred(10 + unitDigit)
    if (tenDigit === 7 && unitDigit === 1) return `${base} et onze`
    return `${base}-${rest}`
  }

  const base = TENS[tenDigit]
  if (unitDigit === 0) return tenDigit === 8 ? 'quatre-vingts' : base
  if (unitDigit === 1 && tenDigit !== 8) return `${base} et un`
  return `${base}-${UNITS[unitDigit]}`
}

/** 0 -> 999 */
function belowThousand(n: number): string {
  if (n < 100) return belowHundred(n)

  const hundreds = Math.floor(n / 100)
  const rest = n % 100

  let head: string
  if (hundreds === 1) head = 'cent'
  else head = `${UNITS[hundreds]} cent${rest === 0 ? 's' : ''}`

  if (rest === 0) return head
  return `${head} ${belowHundred(rest)}`
}

const SCALES: Array<{ value: number; singular: string; plural: string }> = [
  { value: 1_000_000_000, singular: 'milliard', plural: 'milliards' },
  { value: 1_000_000, singular: 'million', plural: 'millions' },
  { value: 1_000, singular: 'mille', plural: 'mille' },
]

/** Entier positif (< 1000 milliards) en toutes lettres. */
export function integerToFrenchWords(value: number): string {
  if (!Number.isFinite(value) || value < 0) return ''
  const n = Math.floor(value)
  if (n === 0) return 'zéro'

  const parts: string[] = []
  let remainder = n

  for (const scale of SCALES) {
    const count = Math.floor(remainder / scale.value)
    if (count === 0) continue
    remainder %= scale.value

    if (scale.value === 1_000) {
      // "mille" est invariable et ne se dit jamais "un mille"
      parts.push(count === 1 ? 'mille' : `${belowThousand(count)} mille`)
    } else {
      parts.push(`${belowThousand(count)} ${count === 1 ? scale.singular : scale.plural}`)
    }
  }

  if (remainder > 0) parts.push(belowThousand(remainder))

  return parts.join(' ')
}

export interface AmountInWordsOptions {
  /** Nom de la devise au singulier, ex. "euro". */
  currencySingular?: string
  /** Nom de la devise au pluriel, ex. "euros". */
  currencyPlural?: string
  /** Nom de la subdivision, ex. "centime" / "centimes". */
  fractionSingular?: string
  fractionPlural?: string
  /** Met la premiere lettre en majuscule. */
  capitalize?: boolean
}

const CURRENCY_WORDS: Record<string, Required<Omit<AmountInWordsOptions, 'capitalize'>>> = {
  EUR: { currencySingular: 'euro', currencyPlural: 'euros', fractionSingular: 'centime', fractionPlural: 'centimes' },
  TND: { currencySingular: 'dinar', currencyPlural: 'dinars', fractionSingular: 'millime', fractionPlural: 'millimes' },
  USD: { currencySingular: 'dollar', currencyPlural: 'dollars', fractionSingular: 'cent', fractionPlural: 'cents' },
}

/**
 * "13230.00" + EUR -> "Treize mille deux cent trente euros"
 * "1234.56" + EUR -> "Mille deux cent trente-quatre euros et cinquante-six centimes"
 */
export function amountToFrenchWords(
  amount: unknown,
  currencyCode = 'EUR',
  options: AmountInWordsOptions = {},
): string {
  const words = CURRENCY_WORDS[currencyCode.toUpperCase()] ?? {
    currencySingular: currencyCode,
    currencyPlural: currencyCode,
    fractionSingular: 'centime',
    fractionPlural: 'centimes',
  }
  const cfg = { ...words, ...options }

  const value = round(dec(amount).abs(), 2)
  const integerPart = value.floor().toNumber()
  const fractionPart = value.minus(value.floor()).times(100).round().toNumber()

  const integerWords = integerToFrenchWords(integerPart)
  const currencyWord = integerPart === 1 ? cfg.currencySingular : cfg.currencyPlural

  let result = `${integerWords} ${currencyWord}`

  if (fractionPart > 0) {
    const fractionWords = integerToFrenchWords(fractionPart)
    const fractionWord = fractionPart === 1 ? cfg.fractionSingular : cfg.fractionPlural
    result += ` et ${fractionWords} ${fractionWord}`
  }

  if (options.capitalize !== false) {
    result = result.charAt(0).toUpperCase() + result.slice(1)
  }
  return result
}
