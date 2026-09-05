import 'server-only'
import { prisma } from '@/lib/prisma'
import { PAYMENT_METHOD_LABELS } from '@/lib/format'
import { add, dec, round, sub } from '@/lib/money'

/**
 * Classeur remis au comptable.
 *
 * PARTI PRIS : ce classeur ne contient AUCUN numero de compte et ne produit
 * aucune ecriture. Un plan comptable saisi ici produirait un fichier qui
 * s'importe sans erreur et fausse la comptabilite en silence — un risque qui
 * appartient au comptable, pas a MZ EXPORT.
 *
 * Ce que le classeur garantit, c'est l'exhaustivite et l'exactitude des
 * donnees : tout ce qui est arrive sur la periode, avec les references
 * permettant de retrouver chaque piece justificative. Le comptable lit et
 * ventile lui-meme.
 *
 * Les montants sont rendus en chaines decimales, jamais en nombres flottants :
 * ExcelJS ecrirait un `number` JavaScript et 89 316,000 pourrait devenir
 * 89 315,999999. Le comptable recoit du texte exact.
 */

export interface WorkbookPeriod {
  from: string
  to: string
}

export interface WorkbookSheet {
  name: string
  columns: string[]
  rows: Array<Record<string, string>>
}

export interface AccountantWorkbook {
  period: WorkbookPeriod
  sheets: WorkbookSheet[]
}

function d(value: unknown, decimals = 3): string {
  return round(value, decimals).toFixed(decimals)
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const VAT_MODE_LABELS: Record<string, string> = {
  NONE: 'Exonéré (export)',
  ZERO: 'Taux 0 %',
  RATE: 'Taux normal',
}

/** Feuille des ventes : une ligne par facture confirmee. */
async function salesSheet(period: WorkbookPeriod): Promise<WorkbookSheet> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      date: { gte: new Date(`${period.from}T00:00:00.000Z`), lte: new Date(`${period.to}T00:00:00.000Z`) },
    },
    orderBy: [{ date: 'asc' }, { number: 'asc' }],
    select: {
      number: true, date: true, dueDate: true, currencyCode: true,
      domiciliationRef: true, orderReference: true, destination: true,
      totalHt: true, vatMode: true, vatRate: true, vatAmount: true,
      stampDutyAmount: true, netToPay: true, paidAmount: true, balanceDue: true,
      exchangeRateTnd: true, netToPayTnd: true,
      customer: { select: { companyName: true, taxId: true, country: true } },
      _count: { select: { documents: true } },
    },
  })

  return {
    name: 'Ventes',
    columns: [
      'N° facture', 'Date', 'Échéance', 'Client', 'Pays', 'Matricule fiscal',
      'Domiciliation', 'Destination', 'Devise', 'Total HT', 'Régime TVA',
      'Taux TVA %', 'Montant TVA', 'Timbre fiscal', 'Net à payer',
      'Taux de change', 'Contre-valeur DT', 'Encaissé', 'Solde dû', 'Pièces jointes',
    ],
    rows: invoices.map((i) => ({
      'N° facture': i.number,
      Date: iso(i.date),
      'Échéance': i.dueDate ? iso(i.dueDate) : '',
      Client: i.customer.companyName,
      Pays: i.customer.country,
      'Matricule fiscal': i.customer.taxId,
      Domiciliation: i.domiciliationRef,
      Destination: i.destination,
      Devise: i.currencyCode,
      'Total HT': d(i.totalHt, 2),
      'Régime TVA': VAT_MODE_LABELS[i.vatMode] ?? i.vatMode,
      'Taux TVA %': d(i.vatRate, 2),
      'Montant TVA': d(i.vatAmount, 2),
      'Timbre fiscal': d(i.stampDutyAmount, 2),
      'Net à payer': d(i.netToPay, 2),
      'Taux de change': d(i.exchangeRateTnd, 6),
      'Contre-valeur DT': d(i.netToPayTnd),
      'Encaissé': d(i.paidAmount, 2),
      'Solde dû': d(i.balanceDue, 2),
      'Pièces jointes': String(i._count.documents),
    })),
  }
}

/** Feuille des achats : une ligne par facture fournisseur. */
async function purchasesSheet(period: WorkbookPeriod): Promise<WorkbookSheet> {
  const purchases = await prisma.purchase.findMany({
    where: {
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      date: { gte: new Date(`${period.from}T00:00:00.000Z`), lte: new Date(`${period.to}T00:00:00.000Z`) },
    },
    orderBy: [{ date: 'asc' }, { number: 'asc' }],
    select: {
      number: true, supplierReference: true, date: true, dueDate: true, currencyCode: true,
      itemsTotal: true, shippingAmount: true, otherFeesAmount: true,
      totalHt: true, vatMode: true, vatRate: true, vatAmount: true,
      stampDutyAmount: true, netToPay: true, paidAmount: true, balanceDue: true,
      withholdingLabel: true, withholdingAmount: true,
      supplier: { select: { companyName: true, taxId: true, nature: true } },
      _count: { select: { documents: true } },
    },
  })

  const natureLabels: Record<string, string> = {
    FOUTA: 'Marchandise',
    TRANSPORT: 'Transport',
    DIVERS: 'Divers',
  }

  return {
    name: 'Achats',
    columns: [
      'N° interne', 'N° facture fournisseur', 'Date', 'Échéance', 'Fournisseur',
      'Matricule fiscal', 'Nature', 'Devise', 'Marchandise', 'Transport',
      'Autres frais', 'Total HT', 'Régime TVA', 'Taux TVA %', 'TVA déductible',
      'Timbre fiscal', 'Net à payer', 'Retenue à la source', 'Net versé',
      'Réglé', 'Solde dû', 'Pièces jointes',
    ],
    rows: purchases.map((p) => ({
      'N° interne': p.number,
      'N° facture fournisseur': p.supplierReference,
      Date: iso(p.date),
      'Échéance': p.dueDate ? iso(p.dueDate) : '',
      Fournisseur: p.supplier.companyName,
      'Matricule fiscal': p.supplier.taxId,
      Nature: natureLabels[p.supplier.nature] ?? p.supplier.nature,
      Devise: p.currencyCode,
      Marchandise: d(p.itemsTotal),
      Transport: d(p.shippingAmount),
      'Autres frais': d(p.otherFeesAmount),
      'Total HT': d(p.totalHt),
      'Régime TVA': VAT_MODE_LABELS[p.vatMode] ?? p.vatMode,
      'Taux TVA %': d(p.vatRate, 2),
      'TVA déductible': d(p.vatAmount),
      'Timbre fiscal': d(p.stampDutyAmount),
      'Net à payer': d(p.netToPay),
      // La retenue est prelevee sur le reglement : la charge reste le net a
      // payer, le fournisseur percoit le net verse.
      'Retenue à la source': d(p.withholdingAmount),
      'Net versé': d(sub(p.netToPay, p.withholdingAmount)),
      'Réglé': d(p.paidAmount),
      'Solde dû': d(p.balanceDue),
      'Pièces jointes': String(p._count.documents),
    })),
  }
}

/** Feuille des encaissements clients. */
async function receiptsSheet(period: WorkbookPeriod): Promise<WorkbookSheet> {
  const payments = await prisma.payment.findMany({
    where: {
      date: { gte: new Date(`${period.from}T00:00:00.000Z`), lte: new Date(`${period.to}T00:00:00.000Z`) },
    },
    orderBy: [{ date: 'asc' }],
    select: {
      date: true, amount: true, currencyCode: true, method: true, reference: true, note: true,
      invoice: {
        select: {
          number: true, domiciliationRef: true, exchangeRateTnd: true,
          customer: { select: { companyName: true } },
        },
      },
    },
  })

  return {
    name: 'Encaissements',
    columns: [
      'Date', 'Client', 'N° facture', 'Domiciliation', 'Mode', 'Référence',
      'Devise', 'Montant', 'Taux facture', 'Contre-valeur DT', 'Note',
    ],
    rows: payments.map((p) => ({
      Date: iso(p.date),
      Client: p.invoice.customer.companyName,
      'N° facture': p.invoice.number,
      Domiciliation: p.invoice.domiciliationRef,
      Mode: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      'Référence': p.reference,
      Devise: p.currencyCode,
      Montant: d(p.amount, 2),
      'Taux facture': d(p.invoice.exchangeRateTnd, 6),
      // Contrevaleur au taux FIGE de la facture : c'est la seule conversion
      // dont l'application dispose, l'encaissement ne portant pas son propre
      // taux. Signale comme tel au comptable par le libelle de la colonne.
      'Contre-valeur DT': d(dec(p.amount).times(dec(p.invoice.exchangeRateTnd))),
      Note: p.note,
    })),
  }
}

/**
 * Feuille des reglements sortants : fournisseurs ET transporteurs.
 *
 * Les deux sont dans la meme feuille parce que le comptable les traite de la
 * meme facon — ce sont des sorties de tresorerie. La colonne « Nature » dit
 * lequel, pour qu'il ventile sans avoir a croiser deux onglets.
 */
async function supplierPaymentsSheet(period: WorkbookPeriod): Promise<WorkbookSheet> {
  const from = new Date(`${period.from}T00:00:00.000Z`)
  const to = new Date(`${period.to}T00:00:00.000Z`)

  const [payments, transportPayments] = await Promise.all([
    prisma.purchasePayment.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }],
      select: {
        date: true, amount: true, currencyCode: true, method: true, reference: true, note: true,
        purchase: {
          select: {
            number: true, supplierReference: true,
            supplier: { select: { companyName: true, nature: true } },
          },
        },
      },
    }),
    prisma.transportPayment.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }],
      select: {
        date: true, amount: true, currencyCode: true, method: true, reference: true, note: true,
        transportInvoice: {
          select: {
            number: true, carrierReference: true, shipmentRef: true,
            carrier: { select: { companyName: true } },
          },
        },
      },
    }),
  ])

  const natureLabels: Record<string, string> = {
    FOUTA: 'Fournisseur — marchandise',
    TRANSPORT: 'Fournisseur — transport',
    DIVERS: 'Fournisseur — divers',
  }

  const rows = [
    ...payments.map((p) => ({
      Date: iso(p.date),
      Nature: natureLabels[p.purchase.supplier.nature] ?? 'Fournisseur',
      'Bénéficiaire': p.purchase.supplier.companyName,
      'N° interne': p.purchase.number,
      'N° facture reçue': p.purchase.supplierReference,
      'Expédition': '',
      Mode: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      'Référence': p.reference,
      Devise: p.currencyCode,
      Montant: d(p.amount),
      Note: p.note,
    })),
    ...transportPayments.map((p) => ({
      Date: iso(p.date),
      Nature: 'Transporteur',
      'Bénéficiaire': p.transportInvoice.carrier.companyName,
      'N° interne': p.transportInvoice.number,
      'N° facture reçue': p.transportInvoice.carrierReference,
      'Expédition': p.transportInvoice.shipmentRef,
      Mode: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      'Référence': p.reference,
      Devise: p.currencyCode,
      Montant: d(p.amount),
      Note: p.note,
    })),
  ].sort((a, b) => a.Date.localeCompare(b.Date))

  return {
    name: 'Règlements fournisseurs',
    columns: [
      'Date', 'Nature', 'Bénéficiaire', 'N° interne', 'N° facture reçue',
      'Expédition', 'Mode', 'Référence', 'Devise', 'Montant', 'Note',
    ],
    rows,
  }
}

/**
 * Feuille du transport : une ligne par facture de transporteur.
 *
 * Separee des achats parce qu'une societe de transport n'est pas un
 * fournisseur de marchandise. La colonne « Vente couverte » donne au comptable
 * le rattachement a l'expedition, ce qu'aucune feuille d'achats ne portait.
 */
async function transportSheet(period: WorkbookPeriod): Promise<WorkbookSheet> {
  const factures = await prisma.transportInvoice.findMany({
    where: {
      status: { notIn: ['DRAFT', 'CANCELLED'] },
      date: { gte: new Date(`${period.from}T00:00:00.000Z`), lte: new Date(`${period.to}T00:00:00.000Z`) },
    },
    orderBy: [{ date: 'asc' }, { number: 'asc' }],
    select: {
      number: true, carrierReference: true, date: true, dueDate: true, shipmentRef: true,
      currencyCode: true, transportAmount: true, transitAmount: true, otherFeesAmount: true,
      totalHt: true, vatMode: true, vatRate: true, vatAmount: true, stampDutyAmount: true,
      netToPay: true, paidAmount: true, balanceDue: true,
      carrier: { select: { companyName: true, taxId: true } },
      invoice: { select: { number: true, customer: { select: { companyName: true } } } },
      _count: { select: { documents: true } },
    },
  })

  return {
    name: 'Transport',
    columns: [
      'N° interne', 'N° facture transporteur', 'Date', 'Échéance', 'Transporteur',
      'Matricule fiscal', 'Expédition', 'Vente couverte', 'Client', 'Devise',
      'Transport', 'Transit', 'Autres frais', 'Total HT', 'Régime TVA',
      'Taux TVA %', 'TVA déductible', 'Timbre fiscal', 'Net à payer', 'Réglé',
      'Solde dû', 'Pièces jointes',
    ],
    rows: factures.map((f) => ({
      'N° interne': f.number,
      'N° facture transporteur': f.carrierReference,
      Date: iso(f.date),
      'Échéance': f.dueDate ? iso(f.dueDate) : '',
      Transporteur: f.carrier.companyName,
      'Matricule fiscal': f.carrier.taxId,
      'Expédition': f.shipmentRef,
      'Vente couverte': f.invoice?.number ?? '',
      Client: f.invoice?.customer.companyName ?? '',
      Devise: f.currencyCode,
      Transport: d(f.transportAmount),
      Transit: d(f.transitAmount),
      'Autres frais': d(f.otherFeesAmount),
      'Total HT': d(f.totalHt),
      'Régime TVA': VAT_MODE_LABELS[f.vatMode] ?? f.vatMode,
      'Taux TVA %': d(f.vatRate, 2),
      'TVA déductible': d(f.vatAmount),
      'Timbre fiscal': d(f.stampDutyAmount),
      'Net à payer': d(f.netToPay),
      'Réglé': d(f.paidAmount),
      'Solde dû': d(f.balanceDue),
      'Pièces jointes': String(f._count.documents),
    })),
  }
}

/**
 * Recapitulatif TVA : collectee et deductible, par taux.
 *
 * La TVA collectee est presque toujours nulle chez MZ EXPORT (ventes export
 * exonerees), mais la ligne est produite quand meme : une periode qui en
 * afficherait sans raison est une anomalie que le comptable doit voir.
 */
async function vatSheet(period: WorkbookPeriod): Promise<WorkbookSheet> {
  const from = new Date(`${period.from}T00:00:00.000Z`)
  const to = new Date(`${period.to}T00:00:00.000Z`)

  const [collected, deductible] = await Promise.all([
    prisma.invoice.groupBy({
      by: ['vatRate', 'currencyCode'],
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, date: { gte: from, lte: to } },
      _sum: { totalHt: true, vatAmount: true },
      _count: { _all: true },
    }),
    prisma.purchase.groupBy({
      by: ['vatRate', 'currencyCode'],
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, date: { gte: from, lte: to } },
      _sum: { totalHt: true, vatAmount: true },
      _count: { _all: true },
    }),
  ])

  // Le transport est deductible comme le reste : l'oublier ici gonflerait le
  // solde de TVA a reverser.
  const deductibleTransport = await prisma.transportInvoice.groupBy({
    by: ['vatRate', 'currencyCode'],
    where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, date: { gte: from, lte: to } },
    _sum: { totalHt: true, vatAmount: true },
    _count: { _all: true },
  })

  const rows: Array<Record<string, string>> = []

  for (const row of collected) {
    rows.push({
      Sens: 'TVA collectée (ventes)',
      'Taux %': d(row.vatRate, 2),
      Devise: row.currencyCode,
      'Base HT': d(row._sum.totalHt, 2),
      'Montant TVA': d(row._sum.vatAmount, 2),
      Documents: String(row._count._all),
    })
  }
  for (const row of deductible) {
    rows.push({
      Sens: 'TVA déductible (achats)',
      'Taux %': d(row.vatRate, 2),
      Devise: row.currencyCode,
      'Base HT': d(row._sum.totalHt),
      'Montant TVA': d(row._sum.vatAmount),
      Documents: String(row._count._all),
    })
  }
  for (const row of deductibleTransport) {
    rows.push({
      Sens: 'TVA déductible (transport)',
      'Taux %': d(row.vatRate, 2),
      Devise: row.currencyCode,
      'Base HT': d(row._sum.totalHt),
      'Montant TVA': d(row._sum.vatAmount),
      Documents: String(row._count._all),
    })
  }

  // Solde de TVA en dinars uniquement : additionner des devises n'aurait
  // aucun sens, et les achats sont toujours libelles en dinars.
  const collectedTnd = add(
    ...collected.filter((r) => r.currencyCode === 'TND').map((r) => r._sum.vatAmount),
  )
  const deductibleTnd = add(
    ...deductible.filter((r) => r.currencyCode === 'TND').map((r) => r._sum.vatAmount),
    ...deductibleTransport.filter((r) => r.currencyCode === 'TND').map((r) => r._sum.vatAmount),
  )

  rows.push({ Sens: '', 'Taux %': '', Devise: '', 'Base HT': '', 'Montant TVA': '', Documents: '' })
  rows.push({
    Sens: 'Solde (collectée − déductible)',
    'Taux %': '',
    Devise: 'TND',
    'Base HT': '',
    'Montant TVA': d(collectedTnd.minus(deductibleTnd)),
    Documents: '',
  })

  return {
    name: 'Récapitulatif TVA',
    columns: ['Sens', 'Taux %', 'Devise', 'Base HT', 'Montant TVA', 'Documents'],
    rows,
  }
}

export async function buildAccountantWorkbook(period: WorkbookPeriod): Promise<AccountantWorkbook> {
  const sheets = await Promise.all([
    salesSheet(period),
    purchasesSheet(period),
    transportSheet(period),
    receiptsSheet(period),
    supplierPaymentsSheet(period),
    vatSheet(period),
  ])
  return { period, sheets }
}
