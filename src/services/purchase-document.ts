import 'server-only'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { amountToFrenchWords } from '@/lib/number-to-words-fr'
import { prisma } from '@/lib/prisma'

/**
 * Donnees du RECAPITULATIF d'achat.
 *
 * IMPORTANT — nature du document : ce PDF n'est PAS une facture. La facture
 * d'achat est emise par le fournisseur ; l'original reste le seul document
 * ayant valeur legale et probante.
 *
 * Ce que ce document produit, c'est le recapitulatif de la SAISIE : ce que
 * MZ EXPORT a enregistre a partir de la facture recue. Il sert au controle
 * interne, au rapprochement avec l'original et au classement. C'est pourquoi
 * l'en-tete porte « RECAPITULATIF D'ACHAT » et non « FACTURE », et pourquoi la
 * reference du document fournisseur y figure en evidence.
 *
 * Le sens des roles est inverse par rapport a une vente :
 *   - l'emetteur du document d'origine est le FOURNISSEUR ;
 *   - le destinataire, c'est-a-dire le client, est MZ EXPORT.
 */

export interface PurchaseDocumentLine {
  position: number
  reference: string
  designation: string
  unit: string
  quantity: string
  unitPrice: string
  discountPercent: string
  lineTotal: string
  /** Vrai si la ligne est rattachee a un produit, donc entree en stock. */
  inStock: boolean
}

export interface PurchaseDocumentData {
  company: {
    name: string
    legalLine: string
    taxLine: string
    email: string
    logoPath: string
    addressBlock: string
    contactLine: string
    footerText: string
  }
  supplier: {
    name: string
    addressBlock: string
    taxId: string
    tradeRegister: string
    contactLine: string
  }
  purchase: {
    number: string
    supplierReference: string
    status: string
    isDraft: boolean
    isCancelled: boolean
    date: string
    dueDate: string
    currencyCode: string
    paymentTerms: string
    notes: string
    amountInWords: string
  }
  lines: PurchaseDocumentLine[]
  totals: {
    quantity: string
    itemsTotal: string
    discountTotal: string
    shippingAmount: string
    otherFeesAmount: string
    totalHt: string
    vatLabel: string
    vatAmount: string
    stampDutyLabel: string
    stampDutyAmount: string
    totalTtc: string
    paidAmount: string
    balanceDue: string
  }
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  CONFIRMED: 'Validee',
  PARTIALLY_PAID: 'Partiellement reglee',
  PAID: 'Reglee',
  CANCELLED: 'Annulee',
}

function joinLines(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p && p.trim()).join('\n')
}

function joinInline(parts: Array<string | null | undefined>, sep = ' — '): string {
  return parts.filter((p) => p && p.trim()).join(sep)
}

export async function getPurchaseDocument(
  purchaseId: string,
): Promise<PurchaseDocumentData | null> {
  const [purchase, company] = await Promise.all([
    prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        supplier: true,
        items: { orderBy: { position: 'asc' } },
      },
    }),
    prisma.company.findUnique({ where: { id: 'company' } }),
  ])

  if (!purchase) return null

  const currency = purchase.currencyCode
  const supplier = purchase.supplier

  // Le regime de TVA suit le mode enregistre sur le document, jamais une
  // valeur recalculee : c'est le taux effectivement facture qui fait foi.
  const vatLabel =
    purchase.vatMode === 'RATE'
      ? `TVA ${formatNumber(purchase.vatRate, 2)} %`
      : purchase.vatMode === 'ZERO'
        ? 'TVA 0 %'
        : 'TVA non applicable'

  return {
    company: {
      name: company?.name ?? 'MZ EXPORT SARL',
      legalLine: company?.legalForm ?? '',
      taxLine: company?.taxId ? `MF : ${company.taxId}` : '',
      email: company?.email ?? '',
      logoPath: company?.logoPath ?? '',
      addressBlock: joinLines([
        company?.addressLine1,
        company?.addressLine2,
        joinInline([company?.postalCode, company?.city], ' '),
        company?.country,
      ]),
      contactLine: joinInline([
        company?.phone ? `Tel : ${company.phone}` : '',
        company?.email ?? '',
      ]),
      footerText: company?.footerText ?? '',
    },

    supplier: {
      name: supplier.companyName,
      addressBlock: joinLines([
        supplier.addressLine1,
        supplier.addressLine2,
        joinInline([supplier.postalCode, supplier.city], ' '),
        supplier.country,
      ]),
      taxId: supplier.taxId ? `MF : ${supplier.taxId}` : '',
      tradeRegister: supplier.tradeRegister ? `RNE : ${supplier.tradeRegister}` : '',
      contactLine: joinInline([supplier.contactName, supplier.phone, supplier.email]),
    },

    purchase: {
      number: purchase.number || 'BROUILLON',
      supplierReference: purchase.supplierReference,
      status: STATUS_LABELS[purchase.status] ?? purchase.status,
      isDraft: purchase.status === 'DRAFT',
      isCancelled: purchase.status === 'CANCELLED',
      date: formatDate(purchase.date),
      dueDate: purchase.dueDate ? formatDate(purchase.dueDate) : '',
      currencyCode: currency,
      paymentTerms: purchase.paymentTerms,
      notes: purchase.notes,
      amountInWords: amountToFrenchWords(purchase.netToPay, currency),
    },

    lines: purchase.items.map((item) => ({
      position: item.position,
      reference: item.reference,
      designation: item.designation,
      unit: item.unit,
      quantity: formatNumber(item.quantity, 3),
      unitPrice: formatMoney(item.unitPrice, currency),
      discountPercent: formatNumber(item.discountPercent, 2),
      lineTotal: formatMoney(item.lineTotal, currency),
      // Une ligne sans produit rattache est une ligne libre : frais de
      // transport, prestation... Elle est facturee mais n'entre pas en stock.
      inStock: Boolean(item.productId),
    })),

    totals: {
      quantity: formatNumber(
        purchase.items.reduce((acc, item) => acc + Number(item.quantity), 0),
        3,
      ),
      itemsTotal: formatMoney(purchase.itemsTotal, currency),
      discountTotal: formatMoney(purchase.discountTotal, currency),
      shippingAmount: formatMoney(purchase.shippingAmount, currency),
      otherFeesAmount: formatMoney(purchase.otherFeesAmount, currency),
      totalHt: formatMoney(purchase.totalHt, currency),
      vatLabel,
      vatAmount: formatMoney(purchase.vatAmount, currency),
      stampDutyLabel: purchase.stampDutyLabel || 'Timbre fiscal',
      stampDutyAmount: formatMoney(purchase.stampDutyAmount, currency),
      totalTtc: formatMoney(purchase.totalTtc, currency),
      paidAmount: formatMoney(purchase.paidAmount, currency),
      balanceDue: formatMoney(purchase.balanceDue, currency),
    },
  }
}
