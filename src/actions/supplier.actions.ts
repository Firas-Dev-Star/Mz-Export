'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSupplierCode } from '@/services/supplier.service'
import type { ActionResult } from '@/validations/common'
import { type SupplierInput, supplierSchema } from '@/validations/supplier'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  console.error('[supplier.action]', error)
  return fail("Une erreur est survenue. L'opération n'a pas été enregistrée.")
}

export async function createSupplier(raw: SupplierInput): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission('supplier.write')

    const parsed = supplierSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data
    const code = data.code?.trim() || (await generateSupplierCode(data.companyName))

    const duplicate = await prisma.supplier.findUnique({ where: { code }, select: { id: true } })
    if (duplicate) return fail(`Le code fournisseur « ${code} » est déjà utilisé.`)

    const supplier = await prisma.supplier.create({
      data: { ...data, code },
      select: { id: true, code: true, companyName: true },
    })

    await recordAudit({
      session, action: 'CREATE_SUPPLIER', entity: 'Supplier',
      entityId: supplier.id, reference: supplier.code,
      details: { companyName: supplier.companyName },
    })

    revalidatePath('/suppliers')
    return { ok: true, data: { id: supplier.id }, message: `Fournisseur « ${supplier.companyName} » créé.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function updateSupplier(id: string, raw: SupplierInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('supplier.write')

    const parsed = supplierSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const existing = await prisma.supplier.findUnique({ where: { id }, select: { id: true, code: true } })
    if (!existing) return fail('Fournisseur introuvable.')

    const code = data.code?.trim() || existing.code
    if (code !== existing.code) {
      const duplicate = await prisma.supplier.findUnique({ where: { code }, select: { id: true } })
      if (duplicate) return fail(`Le code fournisseur « ${code} » est déjà utilisé.`)
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: { ...data, code },
      select: { id: true, code: true, companyName: true },
    })

    await recordAudit({
      session, action: 'UPDATE_SUPPLIER', entity: 'Supplier',
      entityId: id, reference: supplier.code, details: { companyName: supplier.companyName },
    })

    revalidatePath('/suppliers')
    revalidatePath(`/suppliers/${id}`)
    return { ok: true, message: `Fournisseur « ${supplier.companyName} » mis à jour.` }
  } catch (error) {
    return handleError(error)
  }
}

/** Un fournisseur rattache a un achat est desactive, jamais supprime. */
export async function deleteSupplier(id: string): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const session = await requirePermission('supplier.delete')

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      select: { id: true, code: true, companyName: true, _count: { select: { purchases: true } } },
    })
    if (!supplier) return fail('Fournisseur introuvable.')

    if (supplier._count.purchases > 0) {
      await prisma.supplier.update({ where: { id }, data: { isActive: false } })
      await recordAudit({
        session, action: 'UPDATE_SUPPLIER', entity: 'Supplier', entityId: id,
        reference: supplier.code,
        details: { deactivatedBecausePurchasesExist: supplier._count.purchases },
      })
      revalidatePath('/suppliers')
      return {
        ok: true,
        data: { deactivated: true },
        message: `« ${supplier.companyName} » a ${supplier._count.purchases} facture(s) d'achat : le fournisseur a été désactivé au lieu d'être supprimé.`,
      }
    }

    await prisma.supplier.delete({ where: { id } })
    await recordAudit({
      session, action: 'DELETE_SUPPLIER', entity: 'Supplier', entityId: id,
      reference: supplier.code, details: { companyName: supplier.companyName },
    })

    revalidatePath('/suppliers')
    return { ok: true, data: { deactivated: false }, message: `Fournisseur « ${supplier.companyName} » supprimé.` }
  } catch (error) {
    return handleError(error)
  }
}
