import { describe, expect, it } from 'vitest'
import { computeInvoiceTotals } from '@/lib/invoice-totals'
import { dec } from '@/lib/money'
import {
  INBOUND_TYPES,
  MOVEMENT_LABELS,
  OUTBOUND_TYPES,
  movementSign,
  stockLevel,
} from '@/lib/stock-labels'

describe('sens des mouvements de stock', () => {
  it('les entrées augmentent le stock', () => {
    for (const type of INBOUND_TYPES) expect(movementSign(type)).toBe(1)
  })

  it('les sorties diminuent le stock', () => {
    for (const type of OUTBOUND_TYPES) expect(movementSign(type)).toBe(-1)
  })

  it('chaque type a un libellé et aucun type n’est à la fois entrée et sortie', () => {
    const all = [...INBOUND_TYPES, ...OUTBOUND_TYPES]
    expect(new Set(all).size).toBe(all.length)
    expect(Object.keys(MOVEMENT_LABELS).sort()).toEqual([...all].sort())
  })

  it('reproduit la chaîne 1000 → +500 → −250', () => {
    let stock = dec('1000')
    stock = stock.plus(dec('500').times(movementSign('PURCHASE_IN')))
    expect(stock.toFixed(0)).toBe('1500')
    stock = stock.plus(dec('250').times(movementSign('SALE_OUT')))
    expect(stock.toFixed(0)).toBe('1250')
  })
})

describe('niveaux de stock', () => {
  it('rupture quand le stock est nul', () => {
    expect(stockLevel({ trackStock: true, stockQuantity: '0', minStock: '10' })).toBe('OUT_OF_STOCK')
  })

  it('rupture quand le stock est négatif', () => {
    expect(stockLevel({ trackStock: true, stockQuantity: '-5', minStock: '10' })).toBe('OUT_OF_STOCK')
  })

  it('stock faible au seuil exact', () => {
    expect(stockLevel({ trackStock: true, stockQuantity: '10', minStock: '10' })).toBe('LOW')
  })

  it('stock normal au-dessus du seuil', () => {
    expect(stockLevel({ trackStock: true, stockQuantity: '11', minStock: '10' })).toBe('OK')
  })

  it('sans seuil défini, tout stock positif est normal', () => {
    expect(stockLevel({ trackStock: true, stockQuantity: '1', minStock: '0' })).toBe('OK')
  })

  it('un produit non suivi n’est jamais en alerte', () => {
    expect(stockLevel({ trackStock: false, stockQuantity: '0', minStock: '100' })).toBe('UNTRACKED')
  })
})

describe('achats en dinars (3 décimales)', () => {
  it('500 KG × 3,500 DT = 1 750,000 DT', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '500', unitPrice: '3.5' }],
      feesIncluded: false,
      vatMode: 'RATE',
      vatRate: '19',
      stampDutyAmount: '1',
      decimals: 3,
    })
    expect(totals.totalHt.toFixed(3)).toBe('1750.000')
    expect(totals.vatAmount.toFixed(3)).toBe('332.500')
    expect(totals.totalTtc.toFixed(3)).toBe('2082.500')
    expect(totals.netToPay.toFixed(3)).toBe('2083.500')
  })

  it('conserve les millimes au lieu de les arrondir au centime', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '3', unitPrice: '0.3335' }],
      feesIncluded: false,
      vatMode: 'NONE',
      decimals: 3,
    })
    expect(totals.totalHt.toFixed(3)).toBe('1.001')
  })

  it('les frais d’achat s’ajoutent toujours au total des lignes', () => {
    const totals = computeInvoiceTotals({
      items: [{ quantity: '10', unitPrice: '100' }],
      feesIncluded: false,
      shippingAmount: '50',
      otherFeesAmount: '25',
      vatMode: 'RATE',
      vatRate: '19',
      decimals: 3,
    })
    expect(totals.totalHt.toFixed(3)).toBe('1075.000')
    expect(totals.vatAmount.toFixed(3)).toBe('204.250')
  })

  it('ne mélange pas les précisions : la même saisie en EUR reste à 2 décimales', () => {
    const eur = computeInvoiceTotals({
      items: [{ quantity: '3', unitPrice: '0.3335' }],
      feesIncluded: false,
      vatMode: 'NONE',
    })
    expect(eur.totalHt.toFixed(2)).toBe('1.00')
  })
})
