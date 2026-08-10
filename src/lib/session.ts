import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'mz_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8 // 8 heures

export type SessionRole = 'ADMIN' | 'MANAGER' | 'USER'

export interface SessionPayload {
  userId: string
  email: string
  name: string
  role: SessionRole
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 24) {
    throw new Error(
      'AUTH_SECRET est manquant ou trop court. Générez-en un avec `openssl rand -base64 48` et placez-le dans .env',
    )
  }
  return new TextEncoder().encode(secret)
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('mz-export')
    .setAudience('mz-export-app')
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: 'mz-export',
      audience: 'mz-export-app',
    })
    if (!payload.userId || !payload.email || !payload.role) return null
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name ?? ''),
      role: payload.role as SessionRole,
    }
  } catch {
    return null
  }
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function destroySessionCookie() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}
