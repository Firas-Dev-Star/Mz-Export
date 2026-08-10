import 'server-only'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { type SessionPayload, type SessionRole, readSession } from '@/lib/session'

const BCRYPT_ROUNDS = 12

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash)
}

/** Session courante (ou null). Ne redirige pas. */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  return readSession()
}

/** Session courante obligatoire : redirige vers /login sinon. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await readSession()
  if (!session) redirect('/login')
  return session
}

/**
 * Matrice d'autorisation.
 * ADMIN   : tout, y compris parametres, utilisateurs, suppressions definitives.
 * MANAGER : exploitation complete (clients, produits, factures, paiements, rapports).
 * USER    : consultation + creation/edition de brouillons de facture.
 */
export const PERMISSIONS = {
  'customer.read': ['ADMIN', 'MANAGER', 'USER'],
  'customer.write': ['ADMIN', 'MANAGER'],
  'customer.delete': ['ADMIN'],
  'product.read': ['ADMIN', 'MANAGER', 'USER'],
  'product.write': ['ADMIN', 'MANAGER'],
  'product.delete': ['ADMIN'],
  'supplier.read': ['ADMIN', 'MANAGER', 'USER'],
  'supplier.write': ['ADMIN', 'MANAGER'],
  'supplier.delete': ['ADMIN'],
  'purchase.read': ['ADMIN', 'MANAGER', 'USER'],
  'purchase.write': ['ADMIN', 'MANAGER'],
  'purchase.confirm': ['ADMIN', 'MANAGER'],
  'purchase.cancel': ['ADMIN', 'MANAGER'],
  'purchase.delete': ['ADMIN'],
  'stock.read': ['ADMIN', 'MANAGER', 'USER'],
  'stock.adjust': ['ADMIN', 'MANAGER'],
  'invoice.read': ['ADMIN', 'MANAGER', 'USER'],
  'invoice.write': ['ADMIN', 'MANAGER', 'USER'],
  'invoice.confirm': ['ADMIN', 'MANAGER'],
  'invoice.cancel': ['ADMIN', 'MANAGER'],
  'invoice.delete': ['ADMIN'],
  'payment.read': ['ADMIN', 'MANAGER', 'USER'],
  'payment.write': ['ADMIN', 'MANAGER'],
  'payment.delete': ['ADMIN'],
  'report.read': ['ADMIN', 'MANAGER'],
  'settings.read': ['ADMIN', 'MANAGER'],
  'settings.write': ['ADMIN'],
  'user.manage': ['ADMIN'],
  'audit.read': ['ADMIN'],
} as const satisfies Record<string, readonly SessionRole[]>

export type Permission = keyof typeof PERMISSIONS

export function can(role: SessionRole | undefined | null, permission: Permission): boolean {
  if (!role) return false
  return (PERMISSIONS[permission] as readonly string[]).includes(role)
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Accès refusé : permission « ${permission} » requise.`)
    this.name = 'ForbiddenError'
  }
}

/** Verifie la session ET la permission. A utiliser dans toutes les mutations serveur. */
export async function requirePermission(permission: Permission): Promise<SessionPayload> {
  const session = await requireUser()
  if (!can(session.role, permission)) throw new ForbiddenError(permission)
  return session
}

/** Variante pour les routes API : renvoie null au lieu de rediriger. */
export async function apiSession(permission?: Permission): Promise<SessionPayload | null> {
  const session = await readSession()
  if (!session) return null
  if (permission && !can(session.role, permission)) return null
  return session
}

/** Authentifie un couple email / mot de passe. */
export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user || !user.isActive) return null

  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return null

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as SessionRole,
  } satisfies SessionPayload
}
