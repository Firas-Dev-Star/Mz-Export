import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({
  label, value, secondary, icon: Icon, tone = 'default', href,
}: {
  label: string
  value: React.ReactNode
  secondary?: React.ReactNode
  icon: LucideIcon
  tone?: 'default' | 'success' | 'warning' | 'danger'
  href?: string
}) {
  const tones = {
    default: 'bg-accent text-primary',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-red-50 text-destructive',
  } as const

  const content = (
    <Card className={cn('h-full transition-shadow', href && 'hover:shadow-md')}>
      <CardContent className="flex items-start gap-4 p-5">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="tabular mt-1 truncate text-xl font-semibold text-navy-800">{value}</p>
          {secondary ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{secondary}</p> : null}
        </div>
      </CardContent>
    </Card>
  )

  return href ? <Link href={href} className="block h-full">{content}</Link> : content
}
