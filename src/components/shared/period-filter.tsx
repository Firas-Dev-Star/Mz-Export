'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PeriodFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [from, setFrom] = React.useState(searchParams.get('from') ?? '')
  const [to, setTo] = React.useState(searchParams.get('to') ?? '')

  function apply() {
    const params = new URLSearchParams(searchParams.toString())
    if (from) params.set('from', from); else params.delete('from')
    if (to) params.set('to', to); else params.delete('to')
    router.push(`${pathname}?${params.toString()}`)
  }

  function reset() {
    setFrom('')
    setTo('')
    router.push(pathname)
  }

  return (
    <div className="no-print mb-4 flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="from">Du</Label>
        <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="to">Au</Label>
        <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
      </div>
      <Button onClick={apply}>Appliquer</Button>
      {from || to ? <Button variant="ghost" onClick={reset}>Réinitialiser</Button> : null}
    </div>
  )
}
