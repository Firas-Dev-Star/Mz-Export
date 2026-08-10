'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

export interface ToolbarFilter {
  name: string
  label: string
  options: Array<{ value: string; label: string }>
}

/**
 * Barre de recherche + filtres pilotant les query params de l'URL.
 * Les listes restent ainsi partageables et rechargeables.
 */
export function SearchToolbar({
  placeholder = 'Rechercher…',
  filters = [],
  children,
}: {
  placeholder?: string
  filters?: ToolbarFilter[]
  children?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = React.useState(searchParams.get('q') ?? '')

  React.useEffect(() => {
    setValue(searchParams.get('q') ?? '')
  }, [searchParams])

  const push = React.useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, v] of Object.entries(updates)) {
        if (v) params.set(key, v)
        else params.delete(key)
      }
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  // Recherche differee pour ne pas requeter a chaque frappe
  React.useEffect(() => {
    const current = searchParams.get('q') ?? ''
    if (value === current) return
    const timer = setTimeout(() => push({ q: value }), 350)
    return () => clearTimeout(timer)
  }, [value, push, searchParams])

  const hasFilters = [...searchParams.keys()].some((k) => k !== 'page')

  return (
    <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          aria-label="Rechercher"
        />
      </div>

      {filters.map((filter) => (
        <div key={filter.name} className="w-full sm:w-44">
          <Select
            aria-label={filter.label}
            value={searchParams.get(filter.name) ?? ''}
            onChange={(e) => push({ [filter.name]: e.target.value })}
          >
            <option value="">{filter.label}</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>
      ))}

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          <X className="h-4 w-4" />
          Réinitialiser
        </Button>
      ) : null}

      {children ? <div className="sm:ml-auto">{children}</div> : null}
    </div>
  )
}
