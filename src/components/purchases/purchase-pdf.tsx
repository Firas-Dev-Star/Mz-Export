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
  // Disposition calquee sur les factures fournisseurs : l'EMETTEUR occupe la
  // gauche, le CLIENT — c'est-a-dire nous — l'encadre de droite.
  header: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 14 },
  emitterBox: {
    width: '52%',
    borderWidth: 1,
    borderColor: BORDER,
    padding: 9,
    justifyContent: 'center',
  },
  emitterName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  emitterLine: { fontSize: 8.5, marginBottom: 1.5 },

  clientBox: {
    flex: 1,
    marginLeft: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 9,
    justifyContent: 'center',
  },
  clientLabel: { fontSize: 7.5, color: MUTED, marginBottom: 3 },
  clientName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  clientLine: { fontSize: 8.5, marginBottom: 1.5 },
  logoImage: { maxHeight: 30, objectFit: 'contain', marginBottom: 5 },

  // --- Bandeau titre / fournisseur ---
  midRow: { flexDirection: 'row', marginBottom: 10 },
  titleCol: { width: '52%' },
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
  // `minHeight` force le tableau a occuper une hauteur constante meme avec une
  // seule ligne : le document garde la meme allure qu'il porte 1 ou 10 articles,
  // et le bloc des totaux reste toujours a la meme place sur la page.
  table: { borderWidth: 1, borderColor: BORDER, marginBottom: 10, minHeight: 300 },
  tbody: { flexGrow: 1 },
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
        {/* --- En-tete : l'emetteur du document d'origine est le FOURNISSEUR --- */}
        <View style={styles.header}>
          <View style={styles.emitterBox}>
            <Text style={styles.emitterName}>{supplier.name}</Text>
            {supplier.addressBlock
              ? supplier.addressBlock
                  .split('\n')
                  .map((l, i) => (
                    <Text key={i} style={styles.emitterLine}>
                      {l}
                    </Text>
                  ))
              : null}
            {supplier.taxId ? <Text style={styles.emitterLine}>{supplier.taxId}</Text> : null}
            {supplier.tradeRegister ? (
              <Text style={styles.emitterLine}>{supplier.tradeRegister}</Text>
            ) : null}
            {supplier.contactLine ? (
              <Text style={styles.emitterLine}>{supplier.contactLine}</Text>
            ) : null}
          </View>

          {/* Sur un achat, le client c'est nous : meme place que sur l'original. */}
          <View style={styles.clientBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, pas du DOM */}
            {logoDataUrl ? <Image src={logoDataUrl} style={styles.logoImage} /> : null}
            <Text style={styles.clientLabel}>Client :</Text>
            <Text style={styles.clientName}>{company.name}</Text>
            {company.addressBlock
              ? company.addressBlock
                  .split('\n')
                  .map((l, i) => (
                    <Text key={i} style={styles.clientLine}>
                      {l}
                    </Text>
                  ))
              : null}
            {company.taxLine ? <Text style={styles.clientLine}>{company.taxLine}</Text> : null}
            {company.email ? <Text style={styles.clientLine}>{company.email}</Text> : null}
          </View>
        </View>

        {/* --- Titre et references --- */}
        <View style={styles.midRow}>
          <View style={styles.titleCol}>
            <View style={styles.titleBox}>
              <Text style={styles.titleText}>RECAPITULATIF D&apos;ACHAT</Text>
              <Text style={styles.titleSub}>Document interne — non contractuel</Text>
            </View>
            {purchase.supplierReference ? (
              <Text style={styles.metaRef}>
                Facture fournisseur N° : {purchase.supplierReference}
              </Text>
            ) : null}
            <Text style={styles.metaLine}>Date : {purchase.date}</Text>
            <Text style={styles.metaLine}>Enregistrement N° : {purchase.number}</Text>
            {purchase.dueDate ? (
              <Text style={styles.metaLine}>Echeance : {purchase.dueDate}</Text>
            ) : null}
            {purchase.paymentTerms ? (
              <Text style={styles.metaLine}>Reglement : {purchase.paymentTerms}</Text>
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

          <View style={styles.tbody}>
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
          </View>
        </View>

        {/* --- Montant en toutes lettres --- */}
        <View style={styles.wordsBox}>
          <Text style={styles.wordsText}>
            Arretee la presente a la somme de : {purchase.amountInWords}.
          </Text>
        </View>

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
