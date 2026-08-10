import { Sidebar } from '@/components/layout/sidebar'
import { requireUser } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser()

  return (
    <div className="min-h-screen bg-secondary/40">
      <Sidebar user={{ name: session.name, email: session.email, role: session.role }} />
      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
