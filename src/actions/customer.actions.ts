'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateCustomerCode } from '@/services/customer.service'
import type { ActionResult } from '@/validations/common'
import { type CustomerInput, customerSchema } from '@/validations/customer'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  console.error('[customer.action]', error)
  return fail("Une erreur est survenue. L'opération n'a pas été enregistrée.")
}

export async function createCustomer(raw: CustomerInput): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission('customer.write')

    const parsed = customerSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const code = data.code?.trim() || (await generateCustomerCode(data.companyName))

    const duplicate = await prisma.customer.findUnique({ where: { code }, select: { id: true } })
    if (duplicate) return fail(`Le code client « ${code} » est déjà utilisé.`)

    const customer = await prisma.customer.create({
      data: { ...data, code },
      select: { id: true, companyName: true, code: true },
    })

    await recordAudit({
      session,
      action: 'CREATE_CUSTOMER',
      entity: 'Customer',
      entityId: customer.id,
      reference: customer.code,
      details: { companyName: customer.companyName },
    })

    revalidatePath('/customers')
    revalidatePath('/dashboard')
    return { ok: true, data: { id: customer.id }, message: `Client « ${customer.companyName} » créé.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function updateCustomer(id: string, raw: CustomerInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('customer.write')

    const parsed = customerSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const existing = await prisma.customer.findUnique({ where: { id }, select: { id: true, code: true } })
    if (!existing) return fail('Client introuvable.')

    const code = data.code?.trim() || existing.code
    if (code !== existing.code) {
      const duplicate = await prisma.customer.findUnique({ where: { code }, select: { id: true } })
      if (duplicate) return fail(`Le code client « ${code} » est déjà utilisé.`)
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { ...data, code },
      select: { id: true, companyName: true, code: true },
    })

    await recordAudit({
      session,
      action: 'UPDATE_CUSTOMER',
      entity: 'Customer',
      entityId: id,
      reference: customer.code,
      details: { companyName: customer.companyName },
    })

    revalidatePath('/customers')
    revalidatePath(`/customers/${id}`)
    return { ok: true, message: `Client « ${customer.companyName} » mis à jour.` }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Suppression d'un client.
 * Un client rattache a au moins une facture n'est JAMAIS supprime :
 * il est desactive, afin de preserver l'integrite comptable de l'historique.
 */
export async function deleteCustomer(id: string): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const session = await requirePermission('customer.delete')

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, code: true, companyName: true, _count: { select: { invoices: true } } },
    })
    if (!customer) return fail('Client introuvable.')

    if (customer._count.invoices > 0) {
      await prisma.customer.update({ where: { id }, data: { isActive: false } })
      await recordAudit({
        session,
        action: 'UPDATE_CUSTOMER',
        entity: 'Customer',
        entityId: id,
        reference: customer.code,
        details: { deactivatedBecauseInvoicesExist: customer._count.invoices },
      })
      revalidatePath('/customers')
      return {
        ok: true,
        data: { deactivated: true },
        message: `« ${customer.companyName} » a ${customer._count.invoices} facture(s) : le client a été désactivé au lieu d'être supprimé.`,
      }
    }

    await prisma.customer.delete({ where: { id } })
    await recordAudit({
      session,
      action: 'DELETE_CUSTOMER',
      entity: 'Customer',
      entityId: id,
      reference: customer.code,
      details: { companyName: customer.companyName },
    })

    revalidatePath('/customers')
    revalidatePath('/dashboard')
    return { ok: true, data: { deactivated: false }, message: `Client « ${customer.companyName} » supprimé.` }
  } catch (error) {
    return handleError(error)
  }
}
