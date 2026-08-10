import { describe, expect, it } from 'vitest'
import { formatSequenceNumber } from '@/lib/numbering-format'

describe('formatage des numéros de facture', () => {
  it('format FAC-V-0001', () => {
    expect(formatSequenceNumber({ prefix: 'FAC-V-', suffix: '', padding: 4, includeYear: false }, 1, 2026))
      .toBe('FAC-V-0001')
  })

  it('poursuit la numérotation existante de MZ EXPORT (49 → 50)', () => {
    expect(formatSequenceNumber({ prefix: '', suffix: '', padding: 1, includeYear: false }, 50, 2026))
      .toBe('50')
  })

  it('insère l’année quand l’option est activée', () => {
    expect(formatSequenceNumber({ prefix: 'FAC-', suffix: '', padding: 4, includeYear: true }, 7, 2026))
      .toBe('FAC-2026-0007')
  })

  it('gère un suffixe', () => {
    expect(formatSequenceNumber({ prefix: 'F', suffix: '/EXP', padding: 3, includeYear: false }, 12, 2026))
      .toBe('F012/EXP')
  })

  it('ne tronque jamais un compteur plus long que le padding', () => {
    expect(formatSequenceNumber({ prefix: '', suffix: '', padding: 2, includeYear: false }, 1234, 2026))
      .toBe('1234')
  })
})

describe('séquence des factures d’achat', () => {
  it('format FAC-A-0001', () => {
    expect(formatSequenceNumber({ prefix: 'FAC-A-', suffix: '', padding: 4, includeYear: false }, 1, 2026))
      .toBe('FAC-A-0001')
  })

  it('les séquences vente et achat ne se chevauchent pas', () => {
    const sale = formatSequenceNumber({ prefix: 'FAC-V-', suffix: '', padding: 4, includeYear: false }, 7, 2026)
    const purchase = formatSequenceNumber({ prefix: 'FAC-A-', suffix: '', padding: 4, includeYear: false }, 7, 2026)
    expect(sale).not.toBe(purchase)
  })
})
