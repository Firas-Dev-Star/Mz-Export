import { NextResponse } from 'next/server'
import { recordAudit } from '@/lib/audit'
import { destroySessionCookie, readSession } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST() {
  const session = await readSession()
  if (session) {
    await recordAudit({ session, action: 'LOGOUT', entity: 'User', entityId: session.userId })
  }
  await destroySessionCookie()
  return NextResponse.json({ ok: true })
}
