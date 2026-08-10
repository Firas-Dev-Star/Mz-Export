import { formatMoney } from '@/lib/format'
import { gt } from '@/lib/money'

/**
 * Mention reprise de la facture MZ EXPORT :
 * "CE PRIX S'APPLIQUE : 13 000,00 € MARCHANDISE — 200,00 € TRANSPORT — 30,00 € TRANSIT"
 * Generee automatiquement lorsque des frais sont saisis et qu'aucun texte
 * personnalise n'a ete fourni.
 */
export function buildPriceBreakdownNote(params: {
  merchandiseAmount: unknown
  shippingLabel: string
  shippingAmount: unknown
  transitLabel: string
  transitAmount: unknown
  insuranceLabel: string
  insuranceAmount: unknown
  otherFeesLabel: string
  otherFeesAmount: unknown
  currencyCode: string
}): string {
  const format = (label: string, amount: unknown) =>
    `${formatMoney(amount, params.currencyCode)} ${label.toUpperCase()}`

  // Marchandise, transport et transit figurent TOUJOURS sur la mention,
  // meme a zero : seuls les montants varient d'un client a l'autre.
  const parts: string[] = [
    format('Marchandise', params.merchandiseAmount),
    format(params.shippingLabel || 'Transport', params.shippingAmount),
    format(params.transitLabel || 'Transit', params.transitAmount),
  ]

  // Les frais optionnels n'apparaissent que s'ils sont renseignes.
  if (gt(params.insuranceAmount, 0)) {
    parts.push(format(params.insuranceLabel || 'Assurance', params.insuranceAmount))
  }
  if (gt(params.otherFeesAmount, 0)) {
    parts.push(format(params.otherFeesLabel || 'Autres frais', params.otherFeesAmount))
  }

  return `CE PRIX S'APPLIQUE : ${parts.join(' — ')}`
}
