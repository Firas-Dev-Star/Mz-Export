export interface SequenceRow {
  id: string
  key: string
  label: string
  prefix: string
  suffix: string
  padding: number
  nextNumber: number
  resetYearly: boolean
  year: number | null
  includeYear: boolean
}

export function formatSequenceNumber(
  seq: Pick<SequenceRow, 'prefix' | 'suffix' | 'padding' | 'includeYear'>,
  value: number,
  year: number,
): string {
  const padded = String(value).padStart(Math.max(1, seq.padding), '0')
  const yearPart = seq.includeYear ? `${year}-` : ''
  return `${seq.prefix}${yearPart}${padded}${seq.suffix}`
}
