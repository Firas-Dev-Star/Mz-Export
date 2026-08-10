import 'server-only'
import { prisma } from '@/lib/prisma'
import { formatDate, formatMoney, formatNumber, formatQuantity } from '@/lib/format'
import { computeInvoiceTotals } from '@/lib/invoice-totals'
import { add, dec, gt } from '@/lib/money'
import { amountToFrenchWords } from '@/lib/number-to-words-fr'
import { composeAddress } from '@/lib/utils'
import { getInvoice } from '@/services/invoice.service'

/**
 * Prepare les donnees de la facture sous forme de chaines deja formatees.
 * Le meme objet alimente l'apercu HTML imprimable ET le PDF, ce qui garantit
 * que les deux rendus affichent exactement les memes valeurs.
 */

export interface InvoiceDocumentLine {
  quantity: string
  unit: string
  reference: string
  designation: string
  description: string
  unitPrice: string
  total: string
}

export interface InvoiceDocumentData {
  company: {
    name: string
    legalLine: string
    taxLine: string
    email: string
    logoPath: string
    addressBlock: string
    contactLine: string
    footerText: string
    paymentNotice: string
    legalMentions: string
    headerNote: string
  }
  bank: { name: string; agency: string; account: string; iban: string; swift: string }
  invoice: {
    number: string
    status: string
    isDraft: boolean
    isCancelled: boolean
    date: string
    dueDate: string
    currencyCode: string
    paymentTerms: string
    notes: string
    priceBreakdownNote: string
    amountInWords: string
  }
  customer: {
    name: string
    addressBlock: string
    siret: string
    taxId: string
    vatNumber: string
    contactLine: string
  }
  delivery: { address: string; country: string }
  exportInfo: Array<{ label: string; value: string }>
  lines: InvoiceDocumentLine[]
  totals: {
    quantity: string
    goodsTotal: string
    discountTotal: string
    merchandiseAmount: string
    feesTotal: string
    totalHt: string
    vatAmount: string
    vatLabel: string
    showVat: boolean
    totalTtc: string
    stampDutyLabel: string
    stampDutyAmount: string
    showStampDuty: boolean
    netToPay: string
    paidAmount: string
    balanceDue: string
    feesIncluded: boolean
    fees: Array<{ label: string; amount: string }>
  }
}

export async function buildInvoiceDocument(invoiceId: string): Promise<InvoiceDocumentData | null> {
  const [invoice, company] = await Promise.all([
    getInvoice(invoiceId),
    prisma.company.findUnique({ where: { id: 'company' } }),
  ])
  if (!invoice) return null

  const currency = invoice.currencyCode

  const totals = computeInvoiceTotals({
    items: invoice.items.map((i) => ({
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountPercent: i.discountPercent,
    })),
    feesIncluded: invoice.feesIncluded,
    shippingAmount: invoice.shippingAmount,
    transitAmount: invoice.transitAmount,
    insuranceAmount: invoice.insuranceAmount,
    otherFeesAmount: invoice.otherFeesAmount,
    vatMode: invoice.vatMode,
    vatRate: invoice.vatRate,
    stampDutyAmount: invoice.stampDutyAmount,
    paidAmount: invoice.paidAmount,
  })

  const totalQuantity = invoice.items.reduce(
    (acc, item) => add(acc, item.quantity),
    dec(0),
  )

  const fees = [
    { label: invoice.shippingLabel, amount: totals.shippingAmount },
    { label: invoice.transitLabel, amount: totals.transitAmount },
    { label: invoice.insuranceLabel, amount: totals.insuranceAmount },
    { label: invoice.otherFeesLabel, amount: totals.otherFeesAmount },
  ]
    .filter((f) => f.amount.greaterThan(0))
    .map((f) => ({ label: f.label, amount: formatMoney(f.amount, currency) }))

  const exportInfo: Array<{ label: string; value: string }> = []
  const pushInfo = (label: string, value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value).trim()
    if (text && text !== '0') exportInfo.push({ label, value: text })
  }

  pushInfo('NGP', invoice.ngp)
  pushInfo('ORIGINE', invoice.originCountry)
  if (invoice.packageCount > 0) {
    const type = invoice.packageType || 'COLIS'
    const dims = invoice.packageDimensions ? ` — ${invoice.packageDimensions}` : ''
    exportInfo.push({ label: 'COLISAGE', value: `${invoice.packageCount} ${type}${dims}` })
  }
  if (gt(invoice.grossWeightKg, 0)) {
    exportInfo.push({ label: 'POIDS BRUT', value: `${formatNumber(invoice.grossWeightKg, 0)} KG` })
  }
  if (gt(invoice.netWeightKg, 0)) {
    exportInfo.push({ label: 'POIDS NET', value: `${formatNumber(invoice.netWeightKg, 0)} KG` })
  }
  pushInfo('INCOTERM', invoice.incoterm)
  pushInfo('TRANSPORT', invoice.transportMode)
  pushInfo('DÉPART', invoice.departurePort)
  pushInfo('DESTINATION', invoice.destination)
  pushInfo('RÉF. COMMANDE', invoice.orderReference)
  pushInfo('MODE DE PAIEMENT', invoice.paymentTerms)

  const c = company

  return {
    company: {
      name: c?.name ?? 'MZ EXPORT SARL',
      legalLine: [c?.legalForm, c?.capital && gt(c.capital, 0)
        ? `au capital de ${formatNumber(c.capital, 0)} ${c.capitalCurrency}`
        : '']
        .filter(Boolean)
        .join(' '),
      taxLine: c?.taxId ? `MF : ${c.taxId}` : '',
      email: c?.email ?? '',
      logoPath: c?.logoPath ?? '',
      addressBlock: composeAddress([
        c?.addressLine1,
        c?.addressLine2,
        [c?.postalCode, c?.city].filter(Boolean).join(' '),
        c?.country,
      ]),
      contactLine: [c?.phone, c?.phone2, c?.fax ? `Fax : ${c.fax}` : '', c?.email]
        .filter(Boolean)
        .join(' — '),
      footerText: c?.footerText ?? '',
      paymentNotice: c?.paymentNotice ?? '',
      legalMentions: c?.legalMentions ?? '',
      headerNote: c?.headerNote ?? '',
    },
    bank: {
      name: c?.bankName ?? '',
      agency: c?.bankAgency ?? '',
      account: c?.bankAccount ?? '',
      iban: c?.iban ?? '',
      swift: c?.swift ?? '',
    },
    invoice: {
      number: invoice.status === 'DRAFT' ? 'BROUILLON' : invoice.number,
      status: invoice.status,
      isDraft: invoice.status === 'DRAFT',
      isCancelled: invoice.status === 'CANCELLED',
      date: formatDate(invoice.date),
      dueDate: formatDate(invoice.dueDate),
      currencyCode: currency,
      paymentTerms: invoice.paymentTerms,
      notes: invoice.notes,
      priceBreakdownNote: invoice.priceBreakdownNote,
      amountInWords: invoice.amountInWords || amountToFrenchWords(totals.netToPay, currency),
    },
    customer: {
      name: invoice.customer.companyName,
      addressBlock: composeAddress([
        invoice.customer.addressLine1,
        invoice.customer.addressLine2,
        [invoice.customer.postalCode, invoice.customer.city].filter(Boolean).join(' '),
        invoice.customer.country,
      ]),
      siret: invoice.customer.siret,
      taxId: invoice.customer.taxId,
      vatNumber: invoice.customer.vatNumber,
      contactLine: [invoice.customer.contactName, invoice.customer.contactPhone]
        .filter(Boolean)
        .join(' — '),
    },
    delivery: {
      address: invoice.deliveryAddress,
      country: invoice.deliveryCountry,
    },
    exportInfo,
    lines: invoice.items.map((item) => ({
      quantity: formatQuantity(item.quantity),
      unit: item.unit,
      reference: item.reference,
      designation: item.designation,
      description: item.description,
      unitPrice: formatMoney(item.unitPrice, currency),
      total: formatMoney(item.lineTotal, currency),
    })),
    totals: {
      quantity: formatQuantity(totalQuantity),
      goodsTotal: formatMoney(totals.goodsTotal, currency),
      discountTotal: formatMoney(totals.discountTotal, currency),
      merchandiseAmount: formatMoney(totals.merchandiseAmount, currency),
      feesTotal: formatMoney(totals.feesTotal, currency),
      totalHt: formatMoney(totals.totalHt, currency),
      vatAmount: formatMoney(totals.vatAmount, currency),
      vatLabel:
        invoice.vatMode === 'RATE'
          ? `TVA ${formatNumber(invoice.vatRate, 2)} %`
          : invoice.vatMode === 'ZERO'
            ? 'TVA 0 %'
            : 'Exonéré de TVA (export)',
      showVat: invoice.vatMode !== 'NONE',
      totalTtc: formatMoney(totals.totalTtc, currency),
      stampDutyLabel: invoice.stampDutyLabel || 'Timbre fiscal',
      stampDutyAmount: formatMoney(totals.stampDutyAmount, currency),
      showStampDuty: totals.stampDutyAmount.greaterThan(0),
      netToPay: formatMoney(totals.netToPay, currency),
      paidAmount: formatMoney(totals.paidAmount, currency),
      balanceDue: formatMoney(totals.balanceDue, currency),
      feesIncluded: invoice.feesIncluded,
      fees,
    },
  }
}
