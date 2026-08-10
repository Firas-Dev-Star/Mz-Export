import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getCurrentUser } from '@/lib/auth'
import { LoginForm } from './login-form'

export const metadata = { title: 'Connexion — MZ EXPORT' }

export default async function LoginPage() {
  const session = await getCurrentUser()
  if (session) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-800 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white">
            MZ
          </div>
          <h1 className="text-xl font-semibold text-white">MZ EXPORT</h1>
          <p className="text-sm text-navy-300">Gestion Commerciale</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Connexion</CardTitle>
            <CardDescription>Accédez à votre espace de facturation export.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-navy-300">
          MZ EXPORT SARL — Monastir, Tunisie
        </p>
      </div>
    </div>
  )
}
