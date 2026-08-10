'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { ActionResult } from '@/validations/common'
import { type ProductInput, productSchema } from '@/validations/product'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  console.error('[product.action]', error)
  return fail("Une erreur est survenue. L'opération n'a pas été enregistrée.")
}

/** Cree la categorie a la volee si elle n'existe pas encore. */
async function resolveCategoryId(name: string | undefined) {
  const value = name?.trim()
  if (!value) return null
  const category = await prisma.category.upsert({
    where: { name: value },
    update: {},
    create: { name: value },
    select: { id: true },
  })
  return category.id
}

function toData(input: ProductInput, categoryId: string | null) {
  return {
    reference: input.reference,
    sku: input.sku,
    designation: input.designation,
    description: input.description,
    unit: input.unit || 'PCS',
    categoryId,
    salePriceEur: input.salePriceEur,
    purchasePriceTnd: input.purchasePriceTnd,
    trackStock: input.trackStock,
    minStock: input.minStock,
    vatMode: input.vatMode,
    vatRate: input.vatMode === 'RATE' ? input.vatRate : '0',
    ngp: input.ngp,
    originCountry: input.originCountry,
    unitWeightKg: input.unitWeightKg,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    unitsPerPackage: input.unitsPerPackage,
    isActive: input.isActive,
  }
}

export async function createProduct(raw: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission('product.write')

    const parsed = productSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const duplicate = await prisma.product.findUnique({ where: { reference: data.reference }, select: { id: true } })
    if (duplicate) return fail(`La référence « ${data.reference} » existe déjà.`)

    const categoryId = await resolveCategoryId(data.categoryName)
    const product = await prisma.product.create({
      data: toData(data, categoryId),
      select: { id: true, reference: true, designation: true },
    })

    await recordAudit({
      session,
      action: 'CREATE_PRODUCT',
      entity: 'Product',
      entityId: product.id,
      reference: product.reference,
      details: { designation: product.designation },
    })

    revalidatePath('/products')
    return { ok: true, data: { id: product.id }, message: `Produit « ${product.designation} » créé.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function updateProduct(id: string, raw: ProductInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('product.write')

    const parsed = productSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const existing = await prisma.product.findUnique({ where: { id }, select: { id: true, reference: true } })
    if (!existing) return fail('Produit introuvable.')

    if (data.reference !== existing.reference) {
      const duplicate = await prisma.product.findUnique({ where: { reference: data.reference }, select: { id: true } })
      if (duplicate) return fail(`La référence « ${data.reference} » existe déjà.`)
    }

    const categoryId = await resolveCategoryId(data.categoryName)
    const product = await prisma.product.update({
      where: { id },
      data: toData(data, categoryId),
      select: { id: true, reference: true, designation: true },
    })

    await recordAudit({
      session,
      action: 'UPDATE_PRODUCT',
      entity: 'Product',
      entityId: id,
      reference: product.reference,
      details: { designation: product.designation },
    })

    revalidatePath('/products')
    revalidatePath(`/products/${id}`)
    return { ok: true, message: `Produit « ${product.designation} » mis à jour.` }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Un produit deja facture n'est pas supprime : il est desactive.
 * Les lignes de facture conservent leur libelle et leur prix d'origine.
 */
export async function deleteProduct(id: string): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const session = await requirePermission('product.delete')

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, reference: true, designation: true, _count: { select: { items: true } } },
    })
    if (!product) return fail('Produit introuvable.')

    if (product._count.items > 0) {
      await prisma.product.update({ where: { id }, data: { isActive: false } })
      await recordAudit({
        session,
        action: 'UPDATE_PRODUCT',
        entity: 'Product',
        entityId: id,
        reference: product.reference,
        details: { deactivatedBecauseUsedOnInvoices: product._count.items },
      })
      revalidatePath('/products')
      return {
        ok: true,
        data: { deactivated: true },
        message: `« ${product.designation} » apparaît sur ${product._count.items} ligne(s) de facture : le produit a été désactivé au lieu d'être supprimé.`,
      }
    }

    await prisma.product.delete({ where: { id } })
    await recordAudit({
      session,
      action: 'DELETE_PRODUCT',
      entity: 'Product',
      entityId: id,
      reference: product.reference,
      details: { designation: product.designation },
    })

    revalidatePath('/products')
    return { ok: true, data: { deactivated: false }, message: `Produit « ${product.designation} » supprimé.` }
  } catch (error) {
    return handleError(error)
  }
}
