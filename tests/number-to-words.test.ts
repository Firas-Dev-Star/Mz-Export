import { describe, expect, it } from 'vitest'
import { amountToFrenchWords, integerToFrenchWords } from '@/lib/number-to-words-fr'

describe('nombres en toutes lettres (français)', () => {
  const cases: Array<[number, string]> = [
    [0, 'zéro'],
    [1, 'un'],
    [16, 'seize'],
    [17, 'dix-sept'],
    [21, 'vingt et un'],
    [31, 'trente et un'],
    [70, 'soixante-dix'],
    [71, 'soixante et onze'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [91, 'quatre-vingt-onze'],
    [100, 'cent'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [1000, 'mille'],
    [1001, 'mille un'],
    [13230, 'treize mille deux cent trente'],
    [1000000, 'un million'],
    [2000000, 'deux millions'],
  ]

  for (const [value, expected] of cases) {
    it(`${value} → ${expected}`, () => {
      expect(integerToFrenchWords(value)).toBe(expected)
    })
  }
})

describe('montants en toutes lettres', () => {
  it('reproduit la mention de la facture n° 49', () => {
    expect(amountToFrenchWords('13230.00', 'EUR')).toBe('Treize mille deux cent trente euros')
  })

  it('gère les centimes', () => {
    expect(amountToFrenchWords('1234.56', 'EUR')).toBe(
      'Mille deux cent trente-quatre euros et cinquante-six centimes',
    )
  })

  it('accorde le singulier', () => {
    expect(amountToFrenchWords('1.01', 'EUR')).toBe('Un euro et un centime')
  })

  it('gère le dinar tunisien', () => {
    expect(amountToFrenchWords('250.00', 'TND')).toBe('Deux cent cinquante dinars')
  })

  it('inclut le timbre dans le montant en lettres', () => {
    expect(amountToFrenchWords('1191.00', 'EUR')).toBe('Mille cent quatre-vingt-onze euros')
  })
})
