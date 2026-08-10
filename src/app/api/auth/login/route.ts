import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { createSessionCookie } from '@/lib/session'
import { loginSchema } from '@/validations/auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email ou mot de passe manquant' }, { status: 400 })
  }

  const session = await authenticate(parsed.data.email, parsed.data.password)
  // Message volontairement generique : on ne revele pas si l'email existe.
  if (!session) {
    return NextResponse.json({ error: 'Identifiants incorrects.' }, { status: 401 })
  }

  await createSessionCookie(session)
  await recordAudit({ session, action: 'LOGIN', entity: 'User', entityId: session.userId })

  return NextResponse.json({ ok: true, user: { name: session.name, role: session.role } })
}
