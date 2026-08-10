import { Badge } from '@/components/ui/badge'
import { STOCK_LEVEL_LABELS, STOCK_LEVEL_VARIANTS, type StockLevel } from '@/lib/stock-labels'

/** Vert : stock normal · orange : stock faible · rouge : rupture. */
export function StockLevelBadge({ level }: { level: StockLevel }) {
  return <Badge variant={STOCK_LEVEL_VARIANTS[level]}>{STOCK_LEVEL_LABELS[level]}</Badge>
}
