import { Badge } from '@/components/ui/badge'
import { INVOICE_STATUS_LABELS } from '@/lib/format'

const VARIANTS: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline'> = {
  DRAFT: 'secondary',
  CONFIRMED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'outline',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANTS[status] ?? 'secondary'}>{INVOICE_STATUS_LABELS[status] ?? status}</Badge>
}
