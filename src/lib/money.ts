import Decimal from 'decimal.js'

/**
 * Toute la logique monetaire de l'application passe par ce module.
 * Regle absolue : aucun calcul financier n'est fait avec un `number` JavaScript.
 * On manipule des `Decimal` (decimal.js) et on stocke des chaines decimales
 * que Prisma convertit en colonnes DECIMAL PostgreSQL.
 */

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP })

/**
 * `dec()` accepte volontairement n'importe quelle entree (Prisma.Decimal, string,
 * number, valeur de formulaire...) et la normalise. Toute valeur non numerique
 * est ramenee a 0 : aucun NaN ne peut se propager dans un calcul financier.
 */
export type DecimalInput = unknown

/** Convertit n'importe quelle valeur (Prisma.Decimal incluse) en Decimal sur. */
export function dec(value: DecimalInput): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0)
  if (value instanceof Decimal) return value
  if (typeof value === 'boolean') return new Decimal(0)
  const asString = typeof value === 'string' ? value : String(value)
  const normalized = asString.replace(/\s/g, '').replace(',', '.')
  if (normalized === '' || Number.isNaN(Number(normalized))) return new Decimal(0)
  return new Decimal(normalized)
}

/** Arrondi commercial (half-up) a `places` decimales. */
export function round(value: DecimalInput, places = 2): Decimal {
  return dec(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP)
}

/** Valeur prete a etre ecrite dans une colonne DECIMAL via Prisma. */
export function toDbDecimal(value: DecimalInput, places = 2): string {
  return round(value, places).toFixed(places)
}

export function add(...values: DecimalInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0))
}

export function sub(a: DecimalInput, b: DecimalInput): Decimal {
  return dec(a).minus(dec(b))
}

export function mul(a: DecimalInput, b: DecimalInput): Decimal {
  return dec(a).times(dec(b))
}

export function isZero(value: DecimalInput) {
  return dec(value).isZero()
}

export function isNegative(value: DecimalInput) {
  return dec(value).isNegative()
}

export function gt(a: DecimalInput, b: DecimalInput) {
  return dec(a).greaterThan(dec(b))
}

export function gte(a: DecimalInput, b: DecimalInput) {
  return dec(a).greaterThanOrEqualTo(dec(b))
}

/**
 * Total d'une ligne de facture : quantite x prix unitaire, remise en pourcentage,
 * arrondi a 2 decimales (devise a 2 decimales).
 */
export function lineTotal(params: {
  quantity: DecimalInput
  unitPrice: DecimalInput
  discountPercent?: DecimalInput
  /** 2 pour l'euro, 3 pour le dinar tunisien. */
  decimals?: number
}): Decimal {
  const places = params.decimals ?? 2
  const gross = mul(params.quantity, params.unitPrice)
  const discount = dec(params.discountPercent)
  if (discount.isZero()) return round(gross, places)
  const net = gross.times(new Decimal(100).minus(discount)).dividedBy(100)
  return round(net, places)
}

/** Montant brut d'une ligne avant remise. */
export function lineGross(params: {
  quantity: DecimalInput
  unitPrice: DecimalInput
  decimals?: number
}): Decimal {
  return round(mul(params.quantity, params.unitPrice), params.decimals ?? 2)
}

/** Montant de la remise d'une ligne. */
export function lineDiscount(params: {
  quantity: DecimalInput
  unitPrice: DecimalInput
  discountPercent?: DecimalInput
  decimals?: number
}): Decimal {
  return round(sub(lineGross(params), lineTotal(params)), params.decimals ?? 2)
}

export { Decimal }
