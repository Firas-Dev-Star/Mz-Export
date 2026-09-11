import 'server-only'
import ExcelJS from 'exceljs'

/**
 * Lecture des relevés bancaires tels que les banques les produisent.
 *
 * DEUX FORMATS, PARCE QUE DEUX BANQUES. ATB exporte un `.xlsx` avec un en-tete
 * de dix lignes et une colonne `Montant` signee. Zitouna exporte un fichier
 * TABULE — nomme `.xls` mais qui n'en est pas un — avec deux colonnes separees,
 * Debit et Credit. Rien ne sert d'imposer un format pivot : c'est a
 * l'application de lire ce que la banque donne.
 */

export type BankName = 'ATB' | 'ZITOUNA'

export interface ParsedMovement {
  bank: BankName
  date: string
  valueDate: string | null
  label: string
  reference: string
  /** Negatif pour un debit, positif pour un credit. */
  amount: string
  fingerprint: string
}

const nombre = (v: unknown): number => {
  if (typeof v === 'number') return v
  const s = String(v ?? '')
    .replace(/\s| /g, '')
    .replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

const isoDepuisFr = (d: string): string | null => {
  const m = d.trim().match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/)
  if (!m) return null
  const annee = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${annee}-${m[2]}-${m[1]}`
}

/**
 * Empreinte d'un mouvement.
 *
 * Elle porte la banque, la date, le montant, la reference ET le libelle : deux
 * commissions du meme jour et du meme montant ne different parfois que par leur
 * reference. Sans elle, un reimport creerait des doublons — et avec une
 * empreinte trop courte, il en ecraserait de vrais.
 */
function empreinte(bank: string, date: string, montant: number, reference: string, label: string) {
  return [bank, date, montant.toFixed(3), reference, label].join('|').slice(0, 400)
}

/** Relevé ATB au format .xlsx. */
export async function parseAtb(buffer: ArrayBuffer): Promise<ParsedMovement[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  const mouvements: ParsedMovement[] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cellule = (i: number): unknown => {
      const v = row.getCell(i).value
      if (v && typeof v === 'object') {
        const o = v as { result?: unknown; text?: unknown }
        return o.result ?? o.text ?? v
      }
      return v
    }

    const date = isoDepuisFr(String(cellule(1) ?? ''))
    if (!date) return

    const label = String(cellule(2) ?? '').trim()
    const reference = String(cellule(3) ?? '').trim()
    const valeur = isoDepuisFr(String(cellule(4) ?? ''))
    const montant = nombre(cellule(5))
    if (!label || montant === 0) return

    mouvements.push({
      bank: 'ATB',
      date,
      valueDate: valeur,
      label,
      reference,
      amount: montant.toFixed(3),
      fingerprint: empreinte('ATB', date, montant, reference, label),
    })
  })
  return mouvements
}

/** Relevé Zitouna : fichier tabule, colonnes Debit et Credit separees. */
export function parseZitouna(texte: string): ParsedMovement[] {
  const mouvements: ParsedMovement[] = []
  for (const ligne of texte.split(/\r?\n/).slice(1)) {
    const c = ligne.split('\t')
    if (c.length < 6) continue

    const date = isoDepuisFr(c[0])
    if (!date) continue

    const valeur = isoDepuisFr(c[1])
    const label = c[2].trim()
    const reference = c[3].trim()
    const montant = nombre(c[5]) - nombre(c[4])
    if (!label || montant === 0) continue

    mouvements.push({
      bank: 'ZITOUNA',
      date,
      valueDate: valeur,
      label,
      reference,
      amount: montant.toFixed(3),
      fingerprint: empreinte('ZITOUNA', date, montant, reference, label),
    })
  }
  return mouvements
}

/**
 * Classement automatique de ce qui n'est manifestement pas un reglement
 * fournisseur, pour que la liste a traiter ne contienne que de vraies
 * questions. L'utilisateur peut toujours revenir sur ce classement.
 */
export function categorieAutomatique(label: string, montant: number): string {
  if (/Comm|Frais|Tva sur|TVA SUR|Interets|Agios|PDL|domiciliation/i.test(label)) {
    return 'Frais bancaires'
  }
  if (/Paiement Prelevement|REGLE DE LA DECLARATION/i.test(label)) return 'Impôts et taxes'
  if (/CNSS/i.test(label)) return 'Charges sociales'
  /**
   * ATTENTION AU SENS. « STE MZ EXPORT » apparait des deux cotes : en SORTIE
   * c'est un virement d'un de nos comptes vers l'autre, en ENTREE c'est un
   * rapatriement export au nom de la societe. Classer les entrees reviendrait
   * a faire disparaitre des reglements clients du rapprochement — 469 470 TND
   * lors du premier essai.
   */
  if (montant < 0 && /MZ EXPORT/i.test(label)) return 'Transfert entre comptes'
  if (/Recharge Telephonique/i.test(label)) return 'Frais divers'
  return ''
}
