import { Decimal, dec, gt, round } from '@/lib/money'

/**
 * Conversion des devises vers le dinar tunisien.
 *
 * PRINCIPE DIRECTEUR
 * ------------------
 * Un taux de change n'est PAS une donnee de configuration : c'est une donnee
 * du document. Chaque facture porte le taux applique au moment de son
 * enregistrement (`exchangeRateTnd`) et le conserve definitivement.
 *
 * Consequence : modifier un taux dans les parametres ne reecrit jamais
 * l'historique. Une facture de janvier gardera eternellement le taux de
 * janvier, ce qui est la seule facon d'avoir des bilans stables et auditables.
 *
 * La table `exchange_rates` ne sert qu'a PROPOSER une valeur par defaut a la
 * saisie.
 *
 * Module PUR : utilisable cote client (apercu temps reel) comme cote serveur.
 */

/** Devise de reference de la comptabilite. */
export const BASE_CURRENCY = 'TND'

/** Nombre de decimales du dinar tunisien (les millimes sont conserves). */
export const BASE_DECIMALS = 3

/** Nombre de decimales d'un taux de change. */
export const RATE_DECIMALS = 6

/**
 * Convertit un montant exprime en devise vers le dinar tunisien.
 *
 * @param amount montant dans la devise d'origine
 * @param rateToTnd 1 unite de devise = `rateToTnd` TND
 */
export function toTnd(amount: unknown, rateToTnd: unknown): Decimal {
  const rate = dec(rateToTnd)
  // Un taux nul ou negatif n'a aucun sens : on renvoie 0 plutot que de
  // propager une valeur aberrante dans un bilan.
  if (!rate.greaterThan(0)) return new Decimal(0)
  return round(dec(amount).times(rate), BASE_DECIMALS)
}

/**
 * Conversion inverse : combien de devise pour un montant en dinars.
 * Utilisee par le convertisseur de saisie (« j'ai un prix en TND, combien en EUR ? »).
 */
export function fromTnd(amountTnd: unknown, rateToTnd: unknown, decimals = 2): Decimal {
  const rate = dec(rateToTnd)
  if (!rate.greaterThan(0)) return new Decimal(0)
  return round(dec(amountTnd).dividedBy(rate), decimals)
}

/** Un taux exploitable est strictement positif. */
export function isUsableRate(rateToTnd: unknown): boolean {
  return gt(rateToTnd, 0)
}

/**
 * Taux a utiliser pour une devise donnee.
 * Le dinar vaut toujours 1 : aucun taux n'est requis ni autorise.
 */
export function normalizeRate(currencyCode: string, rateToTnd: unknown): Decimal {
  if (currencyCode === BASE_CURRENCY) return new Decimal(1)
  const rate = dec(rateToTnd)
  return rate.greaterThan(0) ? round(rate, RATE_DECIMALS) : new Decimal(0)
}

/**
 * Calcule les trois contrevaleurs en dinars d'un document.
 * Regroupees ici pour qu'aucun appelant n'en oublie une.
 */
export function tndAmounts(params: {
  currencyCode: string
  rateToTnd: unknown
  netToPay: unknown
  paidAmount: unknown
  balanceDue: unknown
}) {
  const rate = normalizeRate(params.currencyCode, params.rateToTnd)
  return {
    exchangeRateTnd: rate,
    netToPayTnd: toTnd(params.netToPay, rate),
    paidAmountTnd: toTnd(params.paidAmount, rate),
    balanceDueTnd: toTnd(params.balanceDue, rate),
  }
}

/**
 * Agrege une liste de montants deja convertis en dinars.
 * Sert aux totaux consolides du tableau de bord.
 */
export function sumTnd(values: unknown[]): Decimal {
  return round(
    values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0)),
    BASE_DECIMALS,
  )
}
