import 'server-only'
import type { Prisma } from '@/generated/prisma/client'

export interface PurgeResult {
  invoices: number
  purchases: number
  customers: number
  suppliers: number
  products: number
  movements: number
  /**
   * Produits conserves dont le stock devient negatif apres la purge :
   * ils avaient ete approvisionnes par un document de demonstration mais
   * restent vendus par un document reel. A regulariser par un ajustement.
   */
  negativeStock: string[]
}

/**
 * Supprime les enregistrements marques « demonstration » et remet le stock
 * en coherence. A executer dans une transaction.
 *
 * Le seed ne cree plus aucune donnee de ce type : cette fonction sert a nettoyer
 * une base ou un ancien seed de demonstration a ete joue.
 *
 * Ordre :
 *   1. mouvements de stock rattaches aux documents de demonstration
 *   2. factures de vente et d'achat de demonstration (lignes et reglements en cascade)
 *   3. produits, clients et fournisseurs de demonstration devenus orphelins
 *   4. recalcul du stock des produits conserves, a partir des mouvements restants
 *
 * Les parametres societe, les utilisateurs et la numerotation ne sont jamais touches.
 */
export async function purgeDemoRecords(tx: Prisma.TransactionClient): Promise<PurgeResult> {
  const demoInvoices = await tx.invoice.findMany({ where: { isDemo: true }, select: { id: true } })
  const demoPurchases = await tx.purchase.findMany({ where: { isDemo: true }, select: { id: true } })

  const invoiceIds = demoInvoices.map((i) => i.id)
  const purchaseIds = demoPurchases.map((p) => p.id)

  const movements = await tx.stockMovement.deleteMany({
    where: {
      OR: [
        { referenceType: 'INVOICE', referenceId: { in: invoiceIds } },
        { referenceType: 'PURCHASE', referenceId: { in: purchaseIds } },
      ],
    },
  })

  const invoices = await tx.invoice.deleteMany({ where: { isDemo: true } })
  const purchases = await tx.purchase.deleteMany({ where: { isDemo: true } })

  const products = await tx.product.deleteMany({
    where: { isDemo: true, items: { none: {} }, purchaseItems: { none: {} } },
  })
  const customers = await tx.customer.deleteMany({ where: { isDemo: true, invoices: { none: {} } } })
  const suppliers = await tx.supplier.deleteMany({ where: { isDemo: true, purchases: { none: {} } } })

  // Le stock est recalcule a partir des mouvements restants : il reste ainsi
  // toujours strictement egal a la somme de son historique.
  await tx.$executeRaw`
    UPDATE "products" p SET "stockQuantity" = COALESCE((
      SELECT SUM(
        CASE WHEN m."type" IN ('PURCHASE_IN', 'ADJUST_IN', 'CUSTOMER_RETURN')
             THEN m."quantity" ELSE -m."quantity" END
      )
      FROM "stock_movements" m WHERE m."productId" = p."id"
    ), 0)
  `

  // On ne masque pas les incoherences : si un produit conserve avait ete
  // approvisionne par un achat de demonstration, son stock devient negatif.
  const negative = await tx.product.findMany({
    where: { trackStock: true, stockQuantity: { lt: 0 } },
    select: { reference: true },
    orderBy: { reference: 'asc' },
  })

  return {
    invoices: invoices.count,
    purchases: purchases.count,
    customers: customers.count,
    suppliers: suppliers.count,
    products: products.count,
    movements: movements.count,
    negativeStock: negative.map((p) => p.reference),
  }
}
