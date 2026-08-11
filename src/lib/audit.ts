import 'server-only'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import type { SessionPayload } from '@/lib/session'

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_CUSTOMER'
  | 'UPDATE_CUSTOMER'
  | 'DELETE_CUSTOMER'
  | 'CREATE_PRODUCT'
  | 'UPDATE_PRODUCT'
  | 'DELETE_PRODUCT'
  | 'CREATE_INVOICE'
  | 'UPDATE_INVOICE'
  | 'CONFIRM_INVOICE'
  | 'CANCEL_INVOICE'
  | 'DELETE_INVOICE'
  | 'CREATE_SUPPLIER'
  | 'UPDATE_SUPPLIER'
  | 'DELETE_SUPPLIER'
  | 'CREATE_PURCHASE'
  | 'UPDATE_PURCHASE'
  | 'CONFIRM_PURCHASE'
  | 'CANCEL_PURCHASE'
  | 'DELETE_PURCHASE'
  | 'CREATE_PURCHASE_PAYMENT'
  | 'DELETE_PURCHASE_PAYMENT'
  | 'ADJUST_STOCK'
  | 'CREATE_PAYMENT'
  | 'DELETE_PAYMENT'
  | 'UPDATE_SETTINGS'
  | 'UPDATE_SEQUENCE'
  | 'CREATE_EXCHANGE_RATE'
  | 'UPDATE_EXCHANGE_RATE'
  | 'DELETE_EXCHANGE_RATE'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DELETE_USER'

interface AuditInput {
  session: SessionPayload | null
  action: AuditAction
  entity: string
  entityId?: string | null
  reference?: string | null
  details?: Record<string, unknown> | null
}

async function clientIp(): Promise<string> {
  try {
    const h = await headers()
    return (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim()
  } catch {
    return ''
  }
}

/**
 * Journalise une action metier.
 * Volontairement tolerant aux erreurs : un echec d'audit ne doit jamais
 * faire echouer l'operation metier deja validee.
 * `tx` permet de journaliser DANS la transaction (cf. confirmation de facture).
 */
export async function recordAudit(
  input: AuditInput,
  tx: { auditLog: { create: (args: never) => unknown } } | null = null,
) {
  const data = {
    userId: input.session?.userId ?? null,
    userEmail: input.session?.email ?? 'system',
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    reference: input.reference ?? null,
    details: (input.details ?? undefined) as never,
    ip: await clientIp(),
  }

  try {
    const client = (tx ?? prisma) as typeof prisma
    await client.auditLog.create({ data })
  } catch (error) {
    console.error('[audit] enregistrement impossible', error)
  }
}
