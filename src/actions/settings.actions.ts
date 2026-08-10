'use server'

import { revalidatePath } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { ForbiddenError, hashPassword, requirePermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { type PurgeResult, purgeDemoRecords } from '@/services/maintenance.service'
import type { ActionResult } from '@/validations/common'
import { type CompanyInput, type SequenceInput, type UserInput, companySchema, sequenceSchema, userSchema } from '@/validations/settings'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  console.error('[settings.action]', error)
  return fail("Une erreur est survenue. L'opération n'a pas été enregistrée.")
}

export async function updateCompany(raw: CompanyInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('settings.write')

    const parsed = companySchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    await prisma.company.upsert({
      where: { id: 'company' },
      update: data,
      create: { id: 'company', ...data },
    })

    await recordAudit({ session, action: 'UPDATE_SETTINGS', entity: 'Company', entityId: 'company' })

    revalidatePath('/settings')
    revalidatePath('/invoices')
    return { ok: true, message: 'Paramètres de la société enregistrés.' }
  } catch (error) {
    return handleError(error)
  }
}

/** Enregistre le logo sous forme de data URL : fonctionne aussi sur un hébergement au système de fichiers en lecture seule (Vercel). */
export async function updateLogo(dataUrl: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('settings.write')

    if (dataUrl && !/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
      return fail('Format d’image non pris en charge. Utilisez un PNG, JPEG ou WebP.')
    }
    // ~1,4 Mo de base64 = ~1 Mo de fichier
    if (dataUrl.length > 1_400_000) {
      return fail('Image trop volumineuse (1 Mo maximum).')
    }

    await prisma.company.update({ where: { id: 'company' }, data: { logoPath: dataUrl } })
    await recordAudit({ session, action: 'UPDATE_SETTINGS', entity: 'Company', entityId: 'company', details: { logo: dataUrl ? 'mis à jour' : 'supprimé' } })

    revalidatePath('/settings')
    return { ok: true, message: dataUrl ? 'Logo enregistré.' : 'Logo supprimé.' }
  } catch (error) {
    return handleError(error)
  }
}

export async function updateSequence(raw: SequenceInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('settings.write')

    const parsed = sequenceSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }

    await prisma.invoiceSequence.update({ where: { key: 'SALE' }, data: parsed.data })
    await recordAudit({ session, action: 'UPDATE_SEQUENCE', entity: 'InvoiceSequence', reference: 'SALE', details: parsed.data })

    revalidatePath('/settings')
    return { ok: true, message: 'Numérotation mise à jour.' }
  } catch (error) {
    return handleError(error)
  }
}

export async function createUser(raw: UserInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('user.manage')

    const parsed = userSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data
    if (!data.password) return fail('Le mot de passe est obligatoire pour un nouvel utilisateur.')

    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })
    if (existing) return fail('Un utilisateur avec cet email existe déjà.')

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        passwordHash: await hashPassword(data.password),
      },
      select: { id: true, email: true },
    })

    await recordAudit({ session, action: 'CREATE_USER', entity: 'User', entityId: user.id, reference: user.email })

    revalidatePath('/settings')
    return { ok: true, message: `Utilisateur ${user.email} créé.` }
  } catch (error) {
    return handleError(error)
  }
}

export async function updateUser(id: string, raw: UserInput): Promise<ActionResult> {
  try {
    const session = await requirePermission('user.manage')

    const parsed = userSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Formulaire invalide', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, isActive: true } })
    if (!target) return fail('Utilisateur introuvable.')

    // Garde-fou : on ne peut pas se retirer soi-meme les droits d'administration
    if (id === session.userId && (data.role !== 'ADMIN' || !data.isActive)) {
      return fail('Vous ne pouvez pas retirer vos propres droits d’administration.')
    }

    if (target.role === 'ADMIN' && data.role !== 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })
      if (admins <= 1) return fail('Il doit rester au moins un administrateur actif.')
    }

    await prisma.user.update({
      where: { id },
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
      },
    })

    await recordAudit({ session, action: 'UPDATE_USER', entity: 'User', entityId: id, reference: data.email })

    revalidatePath('/settings')
    return { ok: true, message: 'Utilisateur mis à jour.' }
  } catch (error) {
    return handleError(error)
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission('user.manage')
    if (id === session.userId) return fail('Vous ne pouvez pas supprimer votre propre compte.')

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } })
    if (!user) return fail('Utilisateur introuvable.')

    if (user.role === 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })
      if (admins <= 1) return fail('Il doit rester au moins un administrateur actif.')
    }

    await prisma.user.delete({ where: { id } })
    await recordAudit({ session, action: 'DELETE_USER', entity: 'User', entityId: id, reference: user.email })

    revalidatePath('/settings')
    return { ok: true, message: `Utilisateur ${user.email} supprimé.` }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Supprime les donnees de demonstration presentes en base.
 * La logique vit dans `purgeDemoRecords` (services/maintenance.service.ts)
 * afin d'etre testable independamment de la couche action.
 */
export async function purgeDemoData(): Promise<ActionResult<PurgeResult>> {
  try {
    const session = await requirePermission('settings.write')

    const result = await prisma.$transaction((tx) => purgeDemoRecords(tx))

    await recordAudit({ session, action: 'UPDATE_SETTINGS', entity: 'DemoData', details: { ...result } })

    for (const path of ['/settings', '/dashboard', '/invoices', '/purchases', '/stock', '/products']) {
      revalidatePath(path)
    }

    const warning =
      result.negativeStock.length > 0
        ? ` Attention : stock désormais négatif pour ${result.negativeStock.join(', ')} — régularisez par un ajustement.`
        : ''

    return {
      ok: true,
      data: result,
      message:
        `Données de démonstration supprimées : ${result.invoices} facture(s) de vente, ` +
        `${result.purchases} facture(s) d'achat, ${result.customers} client(s), ` +
        `${result.suppliers} fournisseur(s), ${result.products} produit(s), ` +
        `${result.movements} mouvement(s) de stock. Le stock a été recalculé.${warning}`,
    }
  } catch (error) {
    return handleError(error)
  }
}
