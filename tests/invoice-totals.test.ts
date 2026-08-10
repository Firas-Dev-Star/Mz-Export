import { describe, expect, it } from 'vitest'
import { computeInvoiceTotals, computeLine, deriveStatus } from '@/lib/invoice-totals'
import { lineTotal } from '@/lib/money'
import { buildPriceBreakdownNote } from '@/lib/price-breakdown'

const base = { feesIncluded: false, vatMode: 'NONE' as const }

describe('calcul des lignes', () => {
  it('100 × 2 EUR = 200 EUR', () => {
    expect(lineTotal({ quantity: '100', unitPrice: '2' }).toFixed(2)).toBe('200.00')
  })

  it('100 × 35 TND = 3500 TND', () => {
    expect(lineTotal({ quantity: '100', unitPrice: '35' }).toFixed(2)).toBe('3500.00')
  })

  it('reproduit la facture n° 49 : 6615 × 2,00 € = 13 230,00 €', () => {
    expect(lineTotal({ quantity: '6615', unitPrice: '2' }).toFixed(2)).toBe('13230.00')
  })

  it('applique une remise en pourcentage', () => {
    const line = computeLine({ quantity: '10', unitPrice: '100', discountPercent: '10' })
    expect(line.gross.toFixed(2)).toBe('1000.00')
    expect(line.discount.toFixed(2)).toBe('100.00')
    expect(line.total.toFixed(2)).toBe('900.00')
  })

  it('évite les erreurs de virgule flottante (0,1 + 0,2)', () => {
    const totals = computeInvoiceTotals({
      ...base,
      items: [
        { quantity: '1', unitPrice: '0.1' },
        { quantity: '1', unitPrice: '0.2' },
      ],
    })
    expect(totals.goodsTotal.toFixed(2)).toBe('0.30')
  })

  it('arrondit au centime supérieur (half-up)', () => {
    expect(lineTotal({ quantity: '3', unitPrice: '0.335' }).toFixed(2)).toBe('1.01')
  })

  it('accepte une saisie française "1 234,56"', () => {
    expect(lineTotal({ quantity: '1', unitPrice: '1 234,56' }).toFixed(2)).toBe('1234.56')
  })

  it('neutralise une saisie non numérique au lieu de produire NaN', () => {
    expect(lineTotal({ quantity: 'abc', unitPrice: '10' }).toFixed(2)).toBe('0.00')
  })
})

describe('frais compris dans le prix (facture MZ EXPORT n° 49)', () => {
  const totals = computeInvoiceTotals({
    items: [{ quantity: '6615', unitPrice: '2' }],
    feesIncluded: true,
    shippingAmount: '200',
    transitAmount: '30',
    vatMode: 'NONE',
  })

  it('ne re-additionne pas les frais au total', () => {
    expect(totals.totalHt.toFixed(2)).toBe('13230.00')
    expect(totals.netToPay.toFixed(2)).toBe('13230.00')
  })

  it('isole la part marchandise : 13 230 − 230 = 13 000', () => {
    expect(totals.merchandiseAmount.toFixed(2)).toBe('13000.00')
    expect(totals.feesTotal.toFixed(2)).toBe('230.00')
  })
})

describe('frais ajoutés au total marchandise', () => {
  const totals = computeInvoiceTotals({
    items: [{ quantity: '6500', unitPrice: '2' }],
    feesIncluded: false,
    shippingAmount: '200',
    transitAmount: '30',
    vatMode: 'NONE',
  })

  it('ajoute les frais au HT', () => {
    expect(totals.goodsTotal.toFixed(2)).toBe('13000.00')
    expect(totals.totalHt.toFixed(2)).toBe('13230.00')
    expect(totals.merchandiseAmount.toFixed(2)).toBe('13000.00')
  })
})

describe('TVA', () => {
  it('exonération : aucune TVA calculée même si un taux traîne', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '1', unitPrice: '1000' }],
      feesIncluded: false,
      vatMode: 'NONE',
      vatRate: '19',
    })
    expect(totals.vatAmount.toFixed(2)).toBe('0.00')
    expect(totals.netToPay.toFixed(2)).toBe('1000.00')
  })

  it('TVA 19 % sur 1 000 = 190', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '1', unitPrice: '1000' }],
      feesIncluded: false,
      vatMode: 'RATE',
      vatRate: '19',
    })
    expect(totals.vatAmount.toFixed(2)).toBe('190.00')
    expect(totals.totalTtc.toFixed(2)).toBe('1190.00')
  })

  it('TVA 19 % appliquée aussi aux frais lorsqu’ils sont ajoutés au HT', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '1', unitPrice: '1000' }],
      feesIncluded: false,
      shippingAmount: '100',
      vatMode: 'RATE',
      vatRate: '19',
    })
    expect(totals.totalHt.toFixed(2)).toBe('1100.00')
    expect(totals.vatAmount.toFixed(2)).toBe('209.00')
  })

  it('TVA 0 % : ligne affichée mais montant nul', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '1', unitPrice: '500' }],
      feesIncluded: false,
      vatMode: 'ZERO',
    })
    expect(totals.vatAmount.toFixed(2)).toBe('0.00')
    expect(totals.totalTtc.toFixed(2)).toBe('500.00')
  })

  it('arrondit correctement une TVA à décimales (19 % de 33,33)', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '1', unitPrice: '33.33' }],
      feesIncluded: false,
      vatMode: 'RATE',
      vatRate: '19',
    })
    expect(totals.vatAmount.toFixed(2)).toBe('6.33')
    expect(totals.totalTtc.toFixed(2)).toBe('39.66')
  })
})

describe('timbre fiscal', () => {
  it('s’ajoute après la TVA et n’est pas taxé', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '1', unitPrice: '1000' }],
      feesIncluded: false,
      vatMode: 'RATE',
      vatRate: '19',
      stampDutyAmount: '1',
    })
    expect(totals.totalHt.toFixed(2)).toBe('1000.00')
    expect(totals.vatAmount.toFixed(2)).toBe('190.00')
    expect(totals.totalTtc.toFixed(2)).toBe('1190.00')
    expect(totals.stampDutyAmount.toFixed(2)).toBe('1.00')
    expect(totals.netToPay.toFixed(2)).toBe('1191.00')
  })

  it('s’applique aussi à une facture exonérée', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '1', unitPrice: '100' }],
      feesIncluded: false,
      vatMode: 'NONE',
      stampDutyAmount: '1',
    })
    expect(totals.netToPay.toFixed(2)).toBe('101.00')
  })

  it('timbre à 0 : net à payer inchangé', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '1', unitPrice: '100' }],
      feesIncluded: false,
      vatMode: 'NONE',
      stampDutyAmount: '0',
    })
    expect(totals.netToPay.toFixed(2)).toBe('100.00')
  })
})

describe('solde et statut', () => {
  it('calcule le solde restant dû', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '1', unitPrice: '1000' }],
      feesIncluded: false,
      vatMode: 'NONE',
      paidAmount: '400',
    })
    expect(totals.balanceDue.toFixed(2)).toBe('600.00')
  })

  it('un brouillon reste un brouillon', () => {
    expect(deriveStatus({ current: 'DRAFT', netToPay: '100', paidAmount: '100' })).toBe('DRAFT')
  })

  it('une facture annulée reste annulée', () => {
    expect(deriveStatus({ current: 'CANCELLED', netToPay: '100', paidAmount: '0' })).toBe('CANCELLED')
  })

  it('passe à PAID quand le solde est nul', () => {
    expect(deriveStatus({ current: 'CONFIRMED', netToPay: '100', paidAmount: '100' })).toBe('PAID')
  })

  it('passe à PARTIALLY_PAID en cas de règlement partiel non échu', () => {
    expect(
      deriveStatus({
        current: 'CONFIRMED',
        netToPay: '100',
        paidAmount: '40',
        dueDate: new Date('2100-01-01'),
      }),
    ).toBe('PARTIALLY_PAID')
  })

  it('passe à OVERDUE après la date d’échéance', () => {
    expect(
      deriveStatus({
        current: 'CONFIRMED',
        netToPay: '100',
        paidAmount: '0',
        dueDate: new Date('2000-01-01'),
      }),
    ).toBe('OVERDUE')
  })

  it('une facture soldée n’est jamais en retard', () => {
    expect(
      deriveStatus({
        current: 'CONFIRMED',
        netToPay: '100',
        paidAmount: '100',
        dueDate: new Date('2000-01-01'),
      }),
    ).toBe('PAID')
  })
})

describe('mention « CE PRIX S’APPLIQUE »', () => {
  it('affiche toujours marchandise, transport et transit — même à zéro', () => {
    const note = buildPriceBreakdownNote({
      merchandiseAmount: '13000',
      shippingLabel: 'Transport',
      shippingAmount: '0',
      transitLabel: 'Transit',
      transitAmount: '0',
      insuranceLabel: 'Assurance',
      insuranceAmount: '0',
      otherFeesLabel: 'Autres frais',
      otherFeesAmount: '0',
      currencyCode: 'EUR',
    })
    expect(note).toContain('MARCHANDISE')
    expect(note).toContain('TRANSPORT')
    expect(note).toContain('TRANSIT')
  })

  it('reproduit la mention de la facture n° 49', () => {
    const note = buildPriceBreakdownNote({
      merchandiseAmount: '13000',
      shippingLabel: 'Transport',
      shippingAmount: '200',
      transitLabel: 'Transit',
      transitAmount: '30',
      insuranceLabel: 'Assurance',
      insuranceAmount: '0',
      otherFeesLabel: 'Autres frais',
      otherFeesAmount: '0',
      currencyCode: 'EUR',
    })
    expect(note.replace(/ | /g, ' ')).toBe(
      "CE PRIX S'APPLIQUE : 13 000,00 € MARCHANDISE — 200,00 € TRANSPORT — 30,00 € TRANSIT",
    )
  })

  it('ajoute assurance et autres frais uniquement s’ils sont renseignés', () => {
    const note = buildPriceBreakdownNote({
      merchandiseAmount: '900',
      shippingLabel: 'Transport',
      shippingAmount: '50',
      transitLabel: 'Transit',
      transitAmount: '30',
      insuranceLabel: 'Assurance',
      insuranceAmount: '20',
      otherFeesLabel: 'Autres frais',
      otherFeesAmount: '0',
      currencyCode: 'EUR',
    })
    expect(note).toContain('ASSURANCE')
    expect(note).not.toContain('AUTRES FRAIS')
  })
})
