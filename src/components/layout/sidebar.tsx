'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS } from '@/lib/format'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  /** Correspondance exacte uniquement (evite d'activer "Factures" sur /invoices/new) */
  exact?: boolean
}

interface NavGroup {
  title?: string
  items: NavItem[]
}

const NAV: NavGroup[] = [
  { items: [{ href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard }] },
  {
    title: 'Ventes',
    items: [
      { href: '/invoices', label: 'Factures', icon: FileText, exact: true },
      { href: '/invoices/new', label: 'Nouvelle facture', icon: FilePlus2 },
      { href: '/payments', label: 'Paiements', icon: CreditCard },
    ],
  },
  {
    title: 'Achats',
    items: [
      { href: '/purchases', label: 'Factures d’achat', icon: ShoppingCart, exact: true },
      { href: '/purchases/new', label: 'Nouvel achat', icon: FilePlus2 },
    ],
  },
  {
    title: 'Stock',
    items: [
      { href: '/stock', label: 'État du stock', icon: Boxes, exact: true },
      { href: '/stock/movements', label: 'Mouvements', icon: ArrowLeftRight },
      { href: '/stock/alerts', label: 'Alertes', icon: AlertTriangle },
    ],
  },
  {
    title: 'Référentiel',
    items: [
      { href: '/customers', label: 'Clients', icon: Users },
      { href: '/suppliers', label: 'Fournisseurs', icon: Building2 },
      { href: '/products', label: 'Produits', icon: Package },
    ],
  },
  {
    title: 'Pilotage',
    items: [
      { href: '/reports', label: 'Rapports', icon: BarChart3 },
      { href: '/settings', label: 'Paramètres', icon: Settings },
    ],
  },
]

export interface SidebarUser {
  name: string
  email: string
  role: string
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-3 py-3">
      {NAV.map((group, index) => (
        <div key={group.title ?? index} className="space-y-1">
          {group.title ? (
            <p className="px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-navy-300">
              {group.title}
            </p>
          ) : null}
          {group.items.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-navy-200 hover:bg-white/5 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-sm font-bold tracking-tight text-white">
        MZ
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">MZ EXPORT</p>
        <p className="truncate text-xs text-navy-300">Gestion Commerciale</p>
      </div>
    </div>
  )
}

function UserBlock({ user }: { user: SidebarUser }) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(false)

  async function logout() {
    setLoading(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="border-t border-white/10 p-3">
      <div className="mb-2 px-2">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-navy-300">
          {ROLE_LABELS[user.role] ?? user.role} · {user.email}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        loading={loading}
        onClick={logout}
        className="w-full justify-start text-navy-200 hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
        Déconnexion
      </Button>
    </div>
  )
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()

  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      {/* Barre mobile */}
      <header className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-white px-4 py-3 lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-semibold text-navy-800">MZ EXPORT</span>
      </header>

      {/* Tiroir mobile */}
      {open ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-navy-950/50"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-navy-800">
            <div className="flex items-center justify-between">
              <Brand />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="mr-2 text-navy-200 hover:bg-white/10 hover:text-white"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <UserBlock user={user} />
          </aside>
        </div>
      ) : null}

      {/* Sidebar desktop */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-800 lg:flex">
        <Brand />
        <NavLinks />
        <UserBlock user={user} />
      </aside>
    </>
  )
}
