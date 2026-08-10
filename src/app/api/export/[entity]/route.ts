import ExcelJS from 'exceljs'
import { apiSession } from '@/lib/auth'
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  VAT_MODE_LABELS,
  formatDate,
} from '@/lib/format'
import { mul } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { MOVEMENT_LABELS, STOCK_LEVEL_LABELS, movementSign, stockLevel } from '@/lib/stock-labels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = Record<string, string | number>

interface Dataset {
  filename: string
  columns: string[]
  rows: Row[]
}

const n = (value: unknown) => Number(String(value ?? 0))

async function buildDataset(entity: string): Promise<Dataset | null> {
  switch (entity) {
    case 'customers': {
      const items = await prisma.customer.findMany({ orderBy: { companyName: 'asc' } })
      return {
        filename: 'clients',
        columns: ['Code', 'Raison sociale', 'Contact', 'Adresse', 'Code postal', 'Ville', 'Pays', 'Téléphone', 'Email', 'SIRET', 'Matricule fiscal', 'TVA', 'Conditions de paiement', 'Devise', 'Actif'],
        rows: items.map((c) => ({
          Code: c.code,
          'Raison sociale': c.companyName,
          Contact: c.contactName,
          Adresse: [c.addressLine1, c.addressLine2].filter(Boolean).join(' '),
          'Code postal': c.postalCode,
          Ville: c.city,
          Pays: c.country,
          Téléphone: c.phone,
          Email: c.email,
          SIRET: c.siret,
          'Matricule fiscal': c.taxId,
          TVA: c.vatNumber,
          'Conditions de paiement': c.paymentTerms,
          Devise: c.currencyCode,
          Actif: c.isActive ? 'Oui' : 'Non',
        })),
      }
    }

    case 'products': {
      const items = await prisma.product.findMany({ orderBy: { designation: 'asc' }, include: { category: true } })
      return {
        filename: 'produits',
        columns: ['Référence', 'SKU', 'Désignation', 'Catégorie', 'Unité', 'Prix de vente EUR', 'Régime TVA', 'Taux TVA', 'NGP', 'Origine', 'Poids unitaire kg', 'Longueur cm', 'Largeur cm', 'Hauteur cm', 'Unités/colis', 'Actif'],
        rows: items.map((p) => ({
          Référence: p.reference,
          SKU: p.sku,
          Désignation: p.designation,
          Catégorie: p.category?.name ?? '',
          Unité: p.unit,
          'Prix de vente EUR': n(p.salePriceEur),
          'Régime TVA': VAT_MODE_LABELS[p.vatMode] ?? p.vatMode,
          'Taux TVA': n(p.vatRate),
          NGP: p.ngp,
          Origine: p.originCountry,
          'Poids unitaire kg': n(p.unitWeightKg),
          'Longueur cm': n(p.lengthCm),
          'Largeur cm': n(p.widthCm),
          'Hauteur cm': n(p.heightCm),
          'Unités/colis': p.unitsPerPackage,
          Actif: p.isActive ? 'Oui' : 'Non',
        })),
      }
    }

    case 'invoices': {
      const items = await prisma.invoice.findMany({
        orderBy: [{ date: 'desc' }],
        include: { customer: { select: { code: true, companyName: true } } },
      })
      return {
        filename: 'factures',
        columns: ['Numéro', 'Date', 'Échéance', 'Client', 'Code client', 'Statut', 'Devise', 'Total HTVA', 'TVA', 'Total TTC', 'Net à payer', 'Encaissé', 'Solde dû', 'Incoterm', 'NGP', 'Origine', 'Colis', 'Poids brut', 'Poids net'],
        rows: items.map((i) => ({
          Numéro: i.number,
          Date: formatDate(i.date),
          Échéance: formatDate(i.dueDate),
          Client: i.customer.companyName,
          'Code client': i.customer.code,
          Statut: INVOICE_STATUS_LABELS[i.status] ?? i.status,
          Devise: i.currencyCode,
          'Total HTVA': n(i.totalHt),
          TVA: n(i.vatAmount),
          'Total TTC': n(i.totalTtc),
          'Net à payer': n(i.netToPay),
          Encaissé: n(i.paidAmount),
          'Solde dû': n(i.balanceDue),
          Incoterm: i.incoterm,
          NGP: i.ngp,
          Origine: i.originCountry,
          Colis: i.packageCount,
          'Poids brut': n(i.grossWeightKg),
          'Poids net': n(i.netWeightKg),
        })),
      }
    }

    case 'invoice-items': {
      const items = await prisma.invoiceItem.findMany({
        orderBy: [{ invoice: { date: 'desc' } }, { position: 'asc' }],
        include: { invoice: { select: { number: true, date: true, currencyCode: true, customer: { select: { companyName: true } } } } },
      })
      return {
        filename: 'lignes-factures',
        columns: ['Facture', 'Date', 'Client', 'Référence', 'Désignation', 'Unité', 'Quantité', 'Prix unitaire', 'Remise %', 'Total ligne', 'Devise', 'NGP', 'Origine'],
        rows: items.map((i) => ({
          Facture: i.invoice.number,
          Date: formatDate(i.invoice.date),
          Client: i.invoice.customer.companyName,
          Référence: i.reference,
          Désignation: i.designation,
          Unité: i.unit,
          Quantité: n(i.quantity),
          'Prix unitaire': n(i.unitPrice),
          'Remise %': n(i.discountPercent),
          'Total ligne': n(i.lineTotal),
          Devise: i.invoice.currencyCode,
          NGP: i.ngp,
          Origine: i.originCountry,
        })),
      }
    }

    case 'payments': {
      const items = await prisma.payment.findMany({
        orderBy: { date: 'desc' },
        include: { invoice: { select: { number: true, customer: { select: { companyName: true } } } } },
      })
      return {
        filename: 'reglements',
        columns: ['Date', 'Facture', 'Client', 'Méthode', 'Référence', 'Montant', 'Devise', 'Note'],
        rows: items.map((p) => ({
          Date: formatDate(p.date),
          Facture: p.invoice.number,
          Client: p.invoice.customer.companyName,
          Méthode: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
          Référence: p.reference,
          Montant: n(p.amount),
          Devise: p.currencyCode,
          Note: p.note,
        })),
      }
    }

    case 'suppliers': {
      const items = await prisma.supplier.findMany({ orderBy: { companyName: 'asc' } })
      return {
        filename: 'fournisseurs',
        columns: ['Code', 'Raison sociale', 'Contact', 'Adresse', 'Code postal', 'Ville', 'Pays', 'Téléphone', 'Email', 'Matricule fiscal', 'Registre de commerce', 'Conditions de paiement', 'Devise', 'Actif'],
        rows: items.map((s) => ({
          Code: s.code,
          'Raison sociale': s.companyName,
          Contact: s.contactName,
          Adresse: [s.addressLine1, s.addressLine2].filter(Boolean).join(' '),
          'Code postal': s.postalCode,
          Ville: s.city,
          Pays: s.country,
          Téléphone: s.phone,
          Email: s.email,
          'Matricule fiscal': s.taxId,
          'Registre de commerce': s.tradeRegister,
          'Conditions de paiement': s.paymentTerms,
          Devise: s.currencyCode,
          Actif: s.isActive ? 'Oui' : 'Non',
        })),
      }
    }

    case 'purchases': {
      const items = await prisma.purchase.findMany({
        orderBy: [{ date: 'desc' }],
        include: { supplier: { select: { code: true, companyName: true } } },
      })
      return {
        filename: 'achats',
        columns: ['Numéro', 'Réf. fournisseur', 'Date', 'Échéance', 'Fournisseur', 'Code fournisseur', 'Statut', 'Devise', 'Total HT', 'TVA', 'Timbre', 'Net à payer', 'Réglé', 'Restant dû'],
        rows: items.map((p) => ({
          Numéro: p.number,
          'Réf. fournisseur': p.supplierReference,
          Date: formatDate(p.date),
          Échéance: formatDate(p.dueDate),
          Fournisseur: p.supplier.companyName,
          'Code fournisseur': p.supplier.code,
          Statut: INVOICE_STATUS_LABELS[p.status] ?? p.status,
          Devise: p.currencyCode,
          'Total HT': n(p.totalHt),
          TVA: n(p.vatAmount),
          Timbre: n(p.stampDutyAmount),
          'Net à payer': n(p.netToPay),
          Réglé: n(p.paidAmount),
          'Restant dû': n(p.balanceDue),
        })),
      }
    }

    case 'purchase-items': {
      const items = await prisma.purchaseItem.findMany({
        orderBy: [{ purchase: { date: 'desc' } }, { position: 'asc' }],
        include: { purchase: { select: { number: true, date: true, currencyCode: true, supplier: { select: { companyName: true } } } } },
      })
      return {
        filename: 'lignes-achats',
        columns: ['Facture', 'Date', 'Fournisseur', 'Référence', 'Désignation', 'Unité', 'Quantité', 'Prix unitaire', 'Remise %', 'Total ligne', 'Devise'],
        rows: items.map((i) => ({
          Facture: i.purchase.number,
          Date: formatDate(i.purchase.date),
          Fournisseur: i.purchase.supplier.companyName,
          Référence: i.reference,
          Désignation: i.designation,
          Unité: i.unit,
          Quantité: n(i.quantity),
          'Prix unitaire': n(i.unitPrice),
          'Remise %': n(i.discountPercent),
          'Total ligne': n(i.lineTotal),
          Devise: i.purchase.currencyCode,
        })),
      }
    }

    case 'stock': {
      const items = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: { designation: 'asc' },
        include: { category: { select: { name: true } } },
      })
      return {
        filename: 'stock',
        columns: ['Référence', 'Désignation', 'Catégorie', 'Unité', 'Suivi en stock', 'Stock', 'Stock minimum', "Prix d'achat TND", 'Valeur stock TND', 'Niveau'],
        rows: items.map((p) => ({
          Référence: p.reference,
          Désignation: p.designation,
          Catégorie: p.category?.name ?? '',
          Unité: p.unit,
          'Suivi en stock': p.trackStock ? 'Oui' : 'Non',
          Stock: n(p.stockQuantity),
          'Stock minimum': n(p.minStock),
          "Prix d'achat TND": n(p.purchasePriceTnd),
          'Valeur stock TND': Number(mul(p.stockQuantity, p.purchasePriceTnd).toFixed(3)),
          Niveau: STOCK_LEVEL_LABELS[stockLevel(p)],
        })),
      }
    }

    case 'stock-movements': {
      const items = await prisma.stockMovement.findMany({
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: {
          product: { select: { reference: true, designation: true, unit: true } },
          user: { select: { name: true } },
        },
      })
      return {
        filename: 'mouvements-stock',
        columns: ['Date', 'Référence produit', 'Produit', 'Type', 'Sens', 'Quantité', 'Stock après', 'Document', 'Motif', 'Utilisateur'],
        rows: items.map((m) => ({
          Date: formatDate(m.date),
          'Référence produit': m.product.reference,
          Produit: m.product.designation,
          Type: MOVEMENT_LABELS[m.type],
          Sens: movementSign(m.type) === 1 ? 'Entrée' : 'Sortie',
          Quantité: n(m.quantity),
          'Stock après': n(m.stockAfter),
          Document: m.reference,
          Motif: m.note,
          Utilisateur: m.user?.name ?? '',
        })),
      }
    }

    default:
      return null
  }
}

function toCsv(dataset: Dataset): string {
  const escape = (value: string | number) => {
    const text = String(value ?? '')
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const header = dataset.columns.map(escape).join(';')
  const body = dataset.rows.map((row) => dataset.columns.map((c) => escape(row[c] ?? '')).join(';'))
  // BOM UTF-8 : Excel ouvre correctement les accents
  return `﻿${[header, ...body].join('\r\n')}`
}

async function toXlsx(dataset: Dataset): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MZ EXPORT — Gestion Commerciale'
  const sheet = workbook.addWorksheet(dataset.filename.slice(0, 31))

  sheet.columns = dataset.columns.map((c) => ({
    header: c,
    key: c,
    width: Math.min(38, Math.max(12, c.length + 4)),
  }))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const row of dataset.rows) sheet.addRow(row)

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function GET(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const session = await apiSession('report.read')
  if (!session) return new Response('Non autorisé', { status: 401 })

  const { entity } = await params
  const dataset = await buildDataset(entity)
  if (!dataset) return new Response('Jeu de données inconnu', { status: 404 })

  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'
  const stamp = new Date().toISOString().slice(0, 10)

  if (format === 'csv') {
    return new Response(toCsv(dataset), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${dataset.filename}-${stamp}.csv"`,
      },
    })
  }

  const buffer = await toXlsx(dataset)
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${dataset.filename}-${stamp}.xlsx"`,
    },
  })
}
