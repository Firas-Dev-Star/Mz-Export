'use server'

import { revalidatePath } from 'next/cache'
import { ForbiddenError, requirePermission } from '@/lib/auth'
import { BusinessError, isBusinessError } from '@/lib/errors'
import { round } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import {
  categorieAutomatique,
  parseAtb,
  parseZitouna,
  type ParsedMovement,
} from '@/services/bank-statement'
import type { ActionResult } from '@/validations/common'

function fail(error: string): ActionResult {
  return { ok: false, error }
}

function handleError(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return fail(error.message)
  if (isBusinessError(error)) return fail(error.message)
  console.error('[bank.action]', error)
  return fail("Une erreur est survenue. Aucune modification n'a été enregistrée.")
}

function revalidate() {
  revalidatePath('/banque')
  revalidatePath('/purchases')
  revalidatePath('/transport')
  revalidatePath('/dashboard')
}

/**
 * Importe un relevé bancaire.
 *
 * L'import est IDEMPOTENT : chaque mouvement porte une empreinte unique, et
 * `skipDuplicates` laisse passer sans erreur ce qui est déjà connu. Réimporter
 * un relevé, ou deux relevés qui se chevauchent, ne crée aucun doublon — c'est
 * la condition pour qu'on ose relancer un import sans crainte.
 */
export async function importBankStatement(formData: FormData): Promise<ActionResult<{ importes: number; ignores: number }>> {
  try {
    const _session = await requirePermission('payment.write')

    const fichier = formData.get('fichier')
    if (!(fichier instanceof File) || fichier.size === 0) {
      return fail('Choisissez un fichier de relevé.')
    }
    if (fichier.size > 10_000_000) {
      return fail('Fichier trop volumineux (10 Mo maximum).')
    }

    const nom = fichier.name.toLowerCase()
    let mouvements: ParsedMovement[]

    if (nom.endsWith('.xlsx')) {
      mouvements = await parseAtb(await fichier.arrayBuffer())
    } else {
      // Le relevé Zitouna est un fichier tabulé encodé en Latin-1, quelle que
      // soit son extension — la banque le nomme « .xls » sans en être un.
      const octets = Buffer.from(await fichier.arrayBuffer())
      mouvements = parseZitouna(octets.toString('latin1'))
    }

    if (mouvements.length === 0) {
      return fail("Aucun mouvement lisible dans ce fichier. Vérifiez qu'il vient bien de votre banque.")
    }

    const resultat = await prisma.bankMovement.createMany({
      data: mouvements.map((m) => {
        const categorie = categorieAutomatique(m.label, Number(m.amount))
        return {
          bank: m.bank,
          date: new Date(m.date),
          valueDate: m.valueDate ? new Date(m.valueDate) : null,
          label: m.label,
          reference: m.reference,
          amount: m.amount,
          fingerprint: m.fingerprint,
          category: categorie,
          /**
           * Un mouvement dont la nature est reconnue — commission, TVA sur
           * commission, impot, transfert entre nos comptes — est CLASSE d'office.
           *
           * Sans cela la liste a traiter est inexploitable : le premier import
           * reel a produit 718 lignes en attente, dont l'immense majorite des
           * commissions de quelques dinars. Ce qui reste « a traiter » doit etre
           * ce qui demande un arbitrage, rien d'autre. Le classement se defait
           * d'un clic si la reconnaissance s'est trompee.
           */
          status: categorie ? ('IGNORED' as const) : ('PENDING' as const),
        }
      }),
      skipDuplicates: true,
    })


    revalidate()
    return {
      ok: true,
      data: { importes: resultat.count, ignores: mouvements.length - resultat.count },
      message:
        `${resultat.count} mouvement(s) importé(s).` +
        (mouvements.length > resultat.count
          ? ` ${mouvements.length - resultat.count} déjà connu(s), ignoré(s).`
          : ''),
    }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Attribue un mouvement à un tiers : le montant est imputé sur ses factures
 * ouvertes, de la plus ancienne à la plus récente.
 *
 * POURQUOI DE LA PLUS ANCIENNE : les fournisseurs sont réglés par acomptes sur
 * compte courant, jamais facture par facture. Imputer par ancienneté est la
 * convention qui correspond à cette pratique, et c'est celle qui permet de
 * retrouver un solde comparable au relevé du fournisseur.
 *
 * Le reliquat éventuel n'est PAS écrit : un versement qui dépasse les factures
 * connues signale qu'il en manque, pas qu'il faut créer un solde négatif.
 */
export async function attributeBankMovement(
  movementId: string,
  cible:
    | { type: 'supplier' | 'carrier'; id: string }
    /**
     * Pour un ENCAISSEMENT client, le montant est saisi par l'utilisateur, DANS
     * LA DEVISE DE LA FACTURE.
     *
     * POURQUOI ON NE LE CALCULE PAS. Les factures sont en euros, les mouvements
     * en dinars, et le releve bancaire ne porte jamais le taux que la banque a
     * applique. Deduire le montant en euros d'un credit en dinars reviendrait a
     * inventer un taux — et donc un ecart de change fictif sur chaque encaissement.
     * L'avis de domiciliation, lui, donne le montant exact en devise : c'est
     * celui-la qu'on saisit.
     */
    | { type: 'customer'; id: string; montantDevise: string },
): Promise<ActionResult<{ ecritures: number; impute: string; reliquat: string }>> {
  try {
    const session = await requirePermission('payment.write')

    const mouvement = await prisma.bankMovement.findUnique({ where: { id: movementId } })
    if (!mouvement) return fail('Mouvement introuvable.')
    if (mouvement.status !== 'PENDING') {
      return fail('Ce mouvement a déjà été traité. Remettez-le à traiter pour le réattribuer.')
    }

    const estEncaissement = cible.type === 'customer'
    if (estEncaissement && round(mouvement.amount, 3).lessThan(0)) {
      return fail("Ce mouvement est une sortie : il ne peut pas solder une facture client.")
    }
    if (!estEncaissement && round(mouvement.amount, 3).greaterThan(0)) {
      return fail("Ce mouvement est une entree : il ne peut pas regler un fournisseur.")
    }

    const montant = estEncaissement
      ? round(cible.montantDevise, 2)
      : round(mouvement.amount, 3).abs()
    if (montant.isZero() || montant.lessThan(0)) {
      return fail('Montant à imputer invalide.')
    }

    const resultat = await prisma.$transaction(async (tx) => {
      const factures =
        cible.type === 'customer'
          ? await tx.invoice.findMany({
              where: {
                customerId: cible.id,
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                balanceDue: { gt: 0 },
              },
              orderBy: [{ date: 'asc' }, { number: 'asc' }],
              select: { id: true, balanceDue: true, currencyCode: true },
            })
          : cible.type === 'supplier'
          ? await tx.purchase.findMany({
              where: {
                supplierId: cible.id,
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                balanceDue: { gt: 0 },
              },
              orderBy: [{ date: 'asc' }, { number: 'asc' }],
              select: { id: true, balanceDue: true },
            })
          : await tx.transportInvoice.findMany({
              where: { carrierId: cible.id, balanceDue: { gt: 0 } },
              orderBy: [{ date: 'asc' }, { number: 'asc' }],
              select: { id: true, balanceDue: true },
            })

      if (factures.length === 0) {
        throw new BusinessError("Ce tiers n'a aucune facture ouverte à solder.")
      }

      let reste = montant
      let ecritures = 0

      for (const facture of factures) {
        if (reste.lessThanOrEqualTo(0)) break
        const du = round(facture.balanceDue, 3)
        const impute = round(reste.greaterThan(du) ? du : reste, 3)
        if (impute.lessThanOrEqualTo(0)) continue

        const donnees = {
          amount: impute.toFixed(3),
          currencyCode: mouvement.currencyCode,
          date: mouvement.date,
          method: 'BANK_TRANSFER' as const,
          reference: `${mouvement.bank} ${mouvement.date.toISOString().slice(0, 10)}`,
          note: mouvement.label.slice(0, 400),
          bankMovementId: mouvement.id,
          createdById: session.userId,
        }

        if (cible.type === 'customer') {
          await tx.payment.create({
            data: {
              ...donnees,
              amount: impute.toFixed(2),
              // La devise est celle de la FACTURE, pas celle du mouvement : le
              // montant saisi est en euros quand la facture l'est.
              currencyCode: (facture as { currencyCode?: string }).currencyCode ?? 'EUR',
              invoiceId: facture.id,
            },
          })
        } else if (cible.type === 'supplier') {
          await tx.purchasePayment.create({ data: { ...donnees, purchaseId: facture.id } })
        } else {
          await tx.transportPayment.create({ data: { ...donnees, transportInvoiceId: facture.id } })
        }

        reste = round(reste.minus(impute), 3)
        ecritures += 1
      }

      // Recalcul des soldes des factures touchées, comme le fait la saisie
      // manuelle d'un règlement.
      const ids = factures.map((f) => f.id)
      if (cible.type === 'customer') {
        for (const id of ids) {
          const somme = await tx.payment.aggregate({
            where: { invoiceId: id },
            _sum: { amount: true },
          })
          const facture = await tx.invoice.findUnique({
            where: { id },
            select: { netToPay: true, dueDate: true, exchangeRateTnd: true },
          })
          if (!facture) continue
          const paye = round(somme._sum.amount, 2)
          const net = round(facture.netToPay, 2)
          const solde = round(net.minus(paye), 2)
          const taux = round(facture.exchangeRateTnd, 6)
          const enRetard = Boolean(facture.dueDate && facture.dueDate < new Date())
          await tx.invoice.update({
            where: { id },
            data: {
              paidAmount: paye.toFixed(2),
              balanceDue: solde.toFixed(2),
              paidAmountTnd: paye.times(taux).toFixed(3),
              balanceDueTnd: solde.times(taux).toFixed(3),
              status:
                !net.isZero() && paye.greaterThanOrEqualTo(net)
                  ? 'PAID'
                  : enRetard
                    ? 'OVERDUE'
                    : paye.greaterThan(0)
                      ? 'PARTIALLY_PAID'
                      : 'CONFIRMED',
            },
          })
        }
      } else if (cible.type === 'supplier') {
        for (const id of ids) {
          const somme = await tx.purchasePayment.aggregate({
            where: { purchaseId: id },
            _sum: { amount: true },
          })
          const achat = await tx.purchase.findUnique({
            where: { id },
            select: { netToPay: true, status: true, dueDate: true, exchangeRateTnd: true },
          })
          if (!achat) continue
          const paye = round(somme._sum.amount, 3)
          const net = round(achat.netToPay, 3)
          const solde = round(net.minus(paye), 3)
          const taux = round(achat.exchangeRateTnd, 6)
          const enRetard = Boolean(achat.dueDate && achat.dueDate < new Date())
          await tx.purchase.update({
            where: { id },
            data: {
              paidAmount: paye.toFixed(3),
              balanceDue: solde.toFixed(3),
              paidAmountTnd: paye.times(taux).toFixed(3),
              balanceDueTnd: solde.times(taux).toFixed(3),
              status:
                !net.isZero() && paye.greaterThanOrEqualTo(net)
                  ? 'PAID'
                  : enRetard
                    ? 'OVERDUE'
                    : paye.greaterThan(0)
                      ? 'PARTIALLY_PAID'
                      : 'CONFIRMED',
            },
          })
        }
      } else {
        for (const id of ids) {
          const somme = await tx.transportPayment.aggregate({
            where: { transportInvoiceId: id },
            _sum: { amount: true },
          })
          const facture = await tx.transportInvoice.findUnique({
            where: { id },
            select: { netToPay: true, status: true },
          })
          if (!facture) continue
          const paye = round(somme._sum.amount, 3)
          const net = round(facture.netToPay, 3)
          const solde = round(net.minus(paye), 3)
          await tx.transportInvoice.update({
            where: { id },
            data: {
              paidAmount: paye.toFixed(3),
              balanceDue: solde.toFixed(3),
              status:
                !net.isZero() && paye.greaterThanOrEqualTo(net)
                  ? 'PAID'
                  : paye.greaterThan(0)
                    ? 'PARTIALLY_PAID'
                    : facture.status,
            },
          })
        }
      }

      await tx.bankMovement.update({
        where: { id: mouvement.id },
        data: { status: 'ATTRIBUTED' },
      })


      return { ecritures, impute: round(montant.minus(reste), 3).toFixed(3), reliquat: reste.toFixed(3) }
    })

    revalidate()
    return {
      ok: true,
      data: resultat,
      message:
        `${resultat.ecritures} règlement(s) créé(s) pour ${resultat.impute}.` +
        (Number(resultat.reliquat) > 0
          ? ` Reliquat non imputé : ${resultat.reliquat} — il manque probablement une facture.`
          : ''),
    }
  } catch (error) {
    return handleError(error)
  }
}

/** Classe un mouvement qui ne concerne pas les fournisseurs. */
export async function ignoreBankMovement(
  movementId: string,
  categorie: string,
): Promise<ActionResult> {
  try {
    const _session = await requirePermission('payment.write')
    const mouvement = await prisma.bankMovement.findUnique({ where: { id: movementId } })
    if (!mouvement) return fail('Mouvement introuvable.')

    await prisma.bankMovement.update({
      where: { id: movementId },
      data: { status: 'IGNORED', category: categorie.trim().slice(0, 60) },
    })

    revalidate()
    return { ok: true, message: 'Mouvement classé.' }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Remet un mouvement à traiter, en supprimant les règlements qu'il avait créés.
 *
 * C'est le geste de correction : sans lui, une attribution erronée resterait
 * gravée et il faudrait défaire les règlements un par un.
 */
export async function resetBankMovement(movementId: string): Promise<ActionResult> {
  try {
    const _session = await requirePermission('payment.write')
    const mouvement = await prisma.bankMovement.findUnique({ where: { id: movementId } })
    if (!mouvement) return fail('Mouvement introuvable.')

    await prisma.$transaction(async (tx) => {
      const achats = await tx.purchasePayment.findMany({
        where: { bankMovementId: movementId },
        select: { purchaseId: true },
      })
      const transports = await tx.transportPayment.findMany({
        where: { bankMovementId: movementId },
        select: { transportInvoiceId: true },
      })
      const ventes = await tx.payment.findMany({
        where: { bankMovementId: movementId },
        select: { invoiceId: true },
      })

      await tx.purchasePayment.deleteMany({ where: { bankMovementId: movementId } })
      await tx.transportPayment.deleteMany({ where: { bankMovementId: movementId } })
      await tx.payment.deleteMany({ where: { bankMovementId: movementId } })

      for (const id of new Set(ventes.map((v) => v.invoiceId))) {
        const somme = await tx.payment.aggregate({
          where: { invoiceId: id },
          _sum: { amount: true },
        })
        const facture = await tx.invoice.findUnique({
          where: { id },
          select: { netToPay: true, exchangeRateTnd: true },
        })
        if (!facture) continue
        const paye = round(somme._sum.amount, 2)
        const solde = round(round(facture.netToPay, 2).minus(paye), 2)
        const taux = round(facture.exchangeRateTnd, 6)
        await tx.invoice.update({
          where: { id },
          data: {
            paidAmount: paye.toFixed(2),
            balanceDue: solde.toFixed(2),
            paidAmountTnd: paye.times(taux).toFixed(3),
            balanceDueTnd: solde.times(taux).toFixed(3),
            status: paye.greaterThan(0) ? 'PARTIALLY_PAID' : 'CONFIRMED',
          },
        })
      }

      for (const id of new Set(achats.map((a) => a.purchaseId))) {
        const somme = await tx.purchasePayment.aggregate({
          where: { purchaseId: id },
          _sum: { amount: true },
        })
        const achat = await tx.purchase.findUnique({
          where: { id },
          select: { netToPay: true, exchangeRateTnd: true, dueDate: true },
        })
        if (!achat) continue
        const paye = round(somme._sum.amount, 3)
        const net = round(achat.netToPay, 3)
        const solde = round(net.minus(paye), 3)
        const taux = round(achat.exchangeRateTnd, 6)
        await tx.purchase.update({
          where: { id },
          data: {
            paidAmount: paye.toFixed(3),
            balanceDue: solde.toFixed(3),
            paidAmountTnd: paye.times(taux).toFixed(3),
            balanceDueTnd: solde.times(taux).toFixed(3),
            status: paye.greaterThan(0) ? 'PARTIALLY_PAID' : 'CONFIRMED',
          },
        })
      }

      for (const id of new Set(transports.map((t) => t.transportInvoiceId))) {
        const somme = await tx.transportPayment.aggregate({
          where: { transportInvoiceId: id },
          _sum: { amount: true },
        })
        const facture = await tx.transportInvoice.findUnique({
          where: { id },
          select: { netToPay: true },
        })
        if (!facture) continue
        const paye = round(somme._sum.amount, 3)
        const solde = round(round(facture.netToPay, 3).minus(paye), 3)
        await tx.transportInvoice.update({
          where: { id },
          data: {
            paidAmount: paye.toFixed(3),
            balanceDue: solde.toFixed(3),
            status: paye.greaterThan(0) ? 'PARTIALLY_PAID' : 'CONFIRMED',
          },
        })
      }

      await tx.bankMovement.update({
        where: { id: movementId },
        data: { status: 'PENDING', category: '' },
      })

    })

    revalidate()
    return { ok: true, message: 'Mouvement remis à traiter, ses règlements ont été supprimés.' }
  } catch (error) {
    return handleError(error)
  }
}
