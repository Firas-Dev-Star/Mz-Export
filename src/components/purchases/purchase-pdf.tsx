import * as React from 'react'
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { PurchaseDocumentData } from '@/services/purchase-document'

/**
 * Recapitulatif d'achat au format A4.
 *
 * CE DOCUMENT N'EST PAS UNE FACTURE. La facture d'achat est emise par le
 * fournisseur : son original est le seul document ayant valeur legale. Ce PDF
 * restitue ce que MZ EXPORT a SAISI a partir de cet original, pour le controle
 * interne, le rapprochement et le classement.
 *
 * Deux garde-fous rendent cette distinction impossible a manquer :
 *   - le titre est « RECAPITULATIF D'ACHAT », jamais « FACTURE » ;
 *   - un bandeau de pied rappelle explicitement la nature du document.
 *
 * Les roles sont inverses par rapport a une vente : le fournisseur emet,
 * MZ EXPORT recoit. Le bloc « Fournisseur » occupe donc la place tenue par
 * l'en-tete societe sur une facture de vente.
 *
 * Aucun cachet ni signature n'est genere.
 */

const NAVY = '#132038'
const BORDER = '#1f2937'
const LIGHT = '#f1f5f9'
const MUTED = '#6b7280'

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 48,
    paddingHorizontal: 28,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: '#111827',
  },

  // --- En-tete ---
  header: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 14 },
  logoBox: {
    width: '42%',
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: { maxHeight: 54, objectFit: 'contain' },
  logoText: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 2 },
  companyBox: {
    flex: 1,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    justifyContent: 'center',
  },
  companyName: { textAlign: 'center', fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  companyLine: { textAlign: 'center', fontSize: 8.5, marginBottom: 2 },

  // --- Bandeau titre / fournisseur ---
  midRow: { flexDirection: 'row', marginBottom: 10 },
  titleCol: { width: '48%' },
  titleBox: {
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 6,
  },
  titleText: { fontSize: 13, fontFamily: 'Helvetica-Bold', letterSpacing: 3, color: NAVY },
  titleSub: { fontSize: 7, color: MUTED, marginTop: 3, letterSpacing: 0.5 },
  metaLine: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  metaRef: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 2 },

  partyBox: {
    flex: 1,
    marginLeft: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
  },
  partyLabel: { fontSize: 7.5, color: MUTED, marginBottom: 3 },
  partyName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  partyLine: { fontSize: 8.5, marginBottom: 1.5 },

  // --- Filigrane statut ---
  statusBanner: {
    borderWidth: 1,
    borderColor: '#b45309',
    backgroundColor: '#fffbeb',
    color: '#92400e',
    padding: 5,
    marginBottom: 8,
    textAlign: 'center',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },

  // --- Tableau ---
  table: { borderWidth: 1, borderColor: BORDER, marginBottom: 10 },
  thead: { flexDirection: 'row', backgroundColor: LIGHT, borderBottomWidth: 1, borderColor: BORDER },
  th: { padding: 5, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#d1d5db' },
  td: { padding: 5, fontSize: 8.5 },

  colQty: { width: '12%', textAlign: 'center' },
  colDesignation: { flex: 1 },
  colUnitPrice: { width: '18%', textAlign: 'right' },
  colTotal: { width: '20%', textAlign: 'right' },

  lineRef: { fontSize: 7, color: MUTED, marginBottom: 1 },
  lineStock: { fontSize: 6.5, color: MUTED, marginTop: 1.5 },

  // --- Totaux ---
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBox: { width: '52%', borderWidth: 1, borderColor: BORDER },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderBottomWidth: 0.5,
    borderColor: '#d1d5db',
  },
  totalLabel: { fontSize: 8.5 },
  totalValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  totalStrong: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 7,
    backgroundColor: LIGHT,
  },
  totalStrongLabel: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  totalStrongValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY },

  // --- Bas de page ---
  wordsBox: { borderWidth: 1, borderColor: BORDER, padding: 7, marginTop: 10 },
  wordsText: { fontSize: 8.5 },
  notesBox: { marginTop: 8 },
  notesLabel: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
  notesText: { fontSize: 8 },

  disclaimer: {
    position: 'absolute',
    bottom: 22,
    left: 28,
    right: 28,
    borderTopWidth: 1,
    borderColor: '#d1d5db',
    paddingTop: 5,
    fontSize: 7,
    color: MUTED,
    textAlign: 'center',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 10,
    right: 28,
    fontSize: 7,
    color: MUTED,
  },
})

export function PurchasePdf({
  data,
  logoDataUrl,
}: {
  data: PurchaseDocumentData
  logoDataUrl?: string
}) {
  const { company, supplier, purchase, lines, totals } = data

  return (
    <Document
      title={`Recapitulatif achat ${purchase.number}`}
      author={company.name}
      subject={`Achat ${purchase.supplierReference || purchase.number} — ${supplier.name}`}
    >
      <Page size="A4" style={styles.page}>
        {/* --- En-tete : le destinataire de la facture, c'est nous --- */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {logoDataUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, pas du DOM
              <Image src={logoDataUrl} style={styles.logoImage} />
            ) : (
              <Text style={styles.logoText}>MZ</Text>
            )}
          </View>
          <View style={styles.companyBox}>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.legalLine ? <Text style={styles.companyLine}>{company.legalLine}</Text> : null}
            {company.taxLine ? <Text style={styles.companyLine}>{company.taxLine}</Text> : null}
            {company.addressBlock ? (
              <Text style={styles.companyLine}>{company.addressBlock.replace(/\n/g, ' — ')}</Text>
            ) : null}
            {company.email ? <Text style={styles.companyLine}>{company.email}</Text> : null}
          </View>
        </View>

        {/* --- Titre + fournisseur emetteur --- */}
        <View style={styles.midRow}>
          <View style={styles.titleCol}>
            <View style={styles.titleBox}>
              <Text style={styles.titleText}>RECAPITULATIF D&apos;ACHAT</Text>
              <Text style={styles.titleSub}>Document interne — non contractuel</Text>
            </View>
            <Text style={styles.metaLine}>Enregistrement N° : {purchase.number}</Text>
            {purchase.supplierReference ? (
              <Text style={styles.metaRef}>
                Facture fournisseur N° : {purchase.supplierReference}
              </Text>
            ) : null}
            <Text style={styles.metaLine}>Date : {purchase.date}</Text>
            {purchase.dueDate ? (
              <Text style={styles.metaLine}>Echeance : {purchase.dueDate}</Text>
            ) : null}
            {purchase.paymentTerms ? (
              <Text style={styles.metaLine}>Reglement : {purchase.paymentTerms}</Text>
            ) : null}
          </View>

          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Fournisseur :</Text>
            <Text style={styles.partyName}>{supplier.name}</Text>
            {supplier.addressBlock
              ? supplier.addressBlock
                  .split('\n')
                  .map((l, i) => (
                    <Text key={i} style={styles.partyLine}>
                      {l}
                    </Text>
                  ))
              : null}
            {supplier.taxId ? <Text style={styles.partyLine}>{supplier.taxId}</Text> : null}
            {supplier.tradeRegister ? (
              <Text style={styles.partyLine}>{supplier.tradeRegister}</Text>
            ) : null}
            {supplier.contactLine ? (
              <Text style={styles.partyLine}>{supplier.contactLine}</Text>
            ) : null}
          </View>
        </View>

        {/* --- Statut : un brouillon ou une annulation doit sauter aux yeux --- */}
        {purchase.isDraft || purchase.isCancelled ? (
          <Text style={styles.statusBanner}>
            {purchase.isCancelled
              ? 'ACHAT ANNULE — les mouvements de stock ont ete contre-passes'
              : 'BROUILLON — non valide, le stock n a pas ete alimente'}
          </Text>
        ) : null}

        {/* --- Lignes --- */}
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.colQty]}>Qte</Text>
            <Text style={[styles.th, styles.colDesignation]}>Designation</Text>
            <Text style={[styles.th, styles.colUnitPrice]}>P.U. HT</Text>
            <Text style={[styles.th, styles.colTotal]}>Montant HT</Text>
          </View>

          {lines.map((line) => (
            <View key={line.position} style={styles.tr} wrap={false}>
              <View style={[styles.td, styles.colQty]}>
                <Text>{line.quantity}</Text>
                {line.unit ? <Text style={styles.lineRef}>{line.unit}</Text> : null}
              </View>
              <View style={[styles.td, styles.colDesignation]}>
                {line.reference ? (
                  <Text style={styles.lineRef}>Ref. {line.reference}</Text>
                ) : null}
                <Text>{line.designation}</Text>
                {Number(line.discountPercent) > 0 ? (
                  <Text style={styles.lineRef}>Remise {line.discountPercent} %</Text>
                ) : null}
                <Text style={styles.lineStock}>
                  {line.inStock ? 'Entree en stock' : 'Ligne libre — hors stock'}
                </Text>
              </View>
              <Text style={[styles.td, styles.colUnitPrice]}>{line.unitPrice}</Text>
              <Text style={[styles.td, styles.colTotal]}>{line.lineTotal}</Text>
            </View>
          ))}
        </View>

        {/* --- Totaux --- */}
        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Total lignes</Text>
              <Text style={styles.totalValue}>{totals.itemsTotal}</Text>
            </View>
            {Number(totals.discountTotal.replace(/[^\d,.-]/g, '').replace(',', '.')) > 0 ? (
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>Remise</Text>
                <Text style={styles.totalValue}>- {totals.discountTotal}</Text>
              </View>
            ) : null}
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Total HT</Text>
              <Text style={styles.totalValue}>{totals.totalHt}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>{totals.vatLabel}</Text>
              <Text style={styles.totalValue}>{totals.vatAmount}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>{totals.stampDutyLabel}</Text>
              <Text style={styles.totalValue}>{totals.stampDutyAmount}</Text>
            </View>
            <View style={styles.totalStrong}>
              <Text style={styles.totalStrongLabel}>Total TTC</Text>
              <Text style={styles.totalStrongValue}>{totals.totalTtc}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Deja regle</Text>
              <Text style={styles.totalValue}>{totals.paidAmount}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Reste a payer</Text>
              <Text style={styles.totalValue}>{totals.balanceDue}</Text>
            </View>
          </View>
        </View>

        {/* --- Montant en toutes lettres --- */}
        <View style={styles.wordsBox}>
          <Text style={styles.wordsText}>
            Arretee la presente a la somme de : {purchase.amountInWords}.
          </Text>
        </View>

        {purchase.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Observations</Text>
            <Text style={styles.notesText}>{purchase.notes}</Text>
          </View>
        ) : null}

        {/* --- Rappel de la nature du document --- */}
        <Text style={styles.disclaimer} fixed>
          Document interne de controle, edite par {company.name}. Il restitue la saisie effectuee a
          partir de la facture emise par {supplier.name}
          {purchase.supplierReference ? ` sous le numero ${purchase.supplierReference}` : ''}. Seul
          l&apos;original du fournisseur a valeur legale et probante.
        </Text>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
