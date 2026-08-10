import * as React from 'react'
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { InvoiceDocumentData } from '@/services/invoice-document'

/**
 * Facture PDF A4 — mise en page reprise du modele papier MZ EXPORT
 * (en-tete societe encadre, bloc client encadre, adresse de livraison,
 * tableau Qte/KG · Designation · P.U. · Total, bloc export + coordonnees
 * bancaires, totaux, ventilation du prix, montant en toutes lettres).
 *
 * Aucun cachet ni signature manuscrite n'est genere.
 */

const NAVY = '#132038'
const BORDER = '#1f2937'
const LIGHT = '#f1f5f9'

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 40,
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
  logoSub: { fontSize: 8, color: '#4b5563', letterSpacing: 3, marginTop: 2 },
  companyBox: {
    flex: 1,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    justifyContent: 'center',
  },
  companyLine: { textAlign: 'center', fontSize: 8.5, marginBottom: 2 },
  companyName: { textAlign: 'center', fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },

  // --- Bandeau facture / client ---
  midRow: { flexDirection: 'row', marginBottom: 10 },
  titleCol: { width: '48%' },
  titleBox: {
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 6,
  },
  title: { fontSize: 17, fontFamily: 'Helvetica-Bold', letterSpacing: 3, color: NAVY },
  metaLine: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 },

  clientBox: {
    flex: 1,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
  },
  clientLabel: { fontSize: 8, color: '#4b5563', marginBottom: 3 },
  clientName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  clientLine: { fontSize: 8.5, marginBottom: 1.5 },

  deliveryRow: { marginBottom: 8 },
  deliveryLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  deliveryText: { fontSize: 8.5 },

  // --- Tableau ---
  table: { borderWidth: 1, borderColor: BORDER },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  trLast: { flexDirection: 'row' },
  th: {
    backgroundColor: LIGHT,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  td: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    fontSize: 8.5,
  },
  tdLast: { paddingVertical: 5, paddingHorizontal: 5, fontSize: 8.5 },
  colQty: { width: '12%', textAlign: 'center' },
  colDesignation: { flex: 1 },
  colPrice: { width: '18%', textAlign: 'right' },
  colTotal: { width: '22%', textAlign: 'right' },

  itemRef: { fontSize: 7.5, color: '#4b5563' },
  itemName: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  itemDesc: { fontSize: 7.5, color: '#4b5563', marginTop: 1 },

  // --- Bloc export + banque (dans la colonne designation) ---
  infoBlock: { paddingTop: 4 },
  infoLine: { fontSize: 8.5, marginBottom: 2 },
  infoLabel: { fontFamily: 'Helvetica-Bold' },
  noticeText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 6, marginBottom: 3 },

  // --- Totaux ---
  totalsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER },
  totalsSpacer: { width: '12%', borderRightWidth: 1, borderRightColor: BORDER, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  totalsBlock: { flex: 1 },
  totalLine: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  totalLineLast: { flexDirection: 'row' },
  totalLabel: { flex: 1, paddingVertical: 4, paddingHorizontal: 5, fontSize: 8.5, borderRightWidth: 1, borderRightColor: BORDER },
  totalValue: { width: '38%', paddingVertical: 4, paddingHorizontal: 5, fontSize: 8.5, textAlign: 'right' },
  totalStrong: { fontFamily: 'Helvetica-Bold' },
  netRow: { backgroundColor: LIGHT },

  // --- Bas de page ---
  noteBox: { borderWidth: 1, borderColor: BORDER, padding: 6, marginTop: 8 },
  noteText: { fontSize: 8.5 },
  wordsBox: { borderWidth: 1, borderColor: BORDER, padding: 6, marginTop: 6 },

  footer: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 5,
  },
  footerName: { textAlign: 'center', fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  footerLine: { textAlign: 'center', fontSize: 7.5, color: '#374151', marginTop: 1.5 },

  watermark: {
    position: 'absolute',
    top: 300,
    left: 90,
    fontSize: 60,
    color: '#e5e7eb',
    fontFamily: 'Helvetica-Bold',
    transform: 'rotate(-25deg)',
  },
})

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label} : </Text>
      {value}
    </Text>
  )
}

export function InvoicePdf({ data, logoDataUrl }: { data: InvoiceDocumentData; logoDataUrl?: string }) {
  const { company, bank, invoice, customer, delivery, exportInfo, lines, totals } = data
  const hasBank = Boolean(bank.name || bank.account || bank.iban || bank.swift)

  return (
    <Document
      title={`Facture ${invoice.number} — ${company.name}`}
      author={company.name}
      subject={`Facture ${invoice.number}`}
    >
      <Page size="A4" style={styles.page}>
        {invoice.isDraft ? <Text style={styles.watermark} fixed>BROUILLON</Text> : null}
        {invoice.isCancelled ? <Text style={styles.watermark} fixed>ANNULÉE</Text> : null}

        {/* En-tete */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {logoDataUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- <Image> de @react-pdf n'accepte pas d'attribut alt
              <Image src={logoDataUrl} style={styles.logoImage} />
            ) : (
              <>
                <Text style={styles.logoText}>MZ</Text>
                <Text style={styles.logoSub}>EXPORT</Text>
              </>
            )}
          </View>
          <View style={styles.companyBox}>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.legalLine ? <Text style={styles.companyLine}>{company.legalLine}</Text> : null}
            {company.taxLine ? <Text style={styles.companyLine}>{company.taxLine}</Text> : null}
            {company.email ? <Text style={styles.companyLine}>{company.email}</Text> : null}
            {company.headerNote ? <Text style={styles.companyLine}>{company.headerNote}</Text> : null}
          </View>
        </View>

        {/* Titre + client */}
        <View style={styles.midRow}>
          <View style={styles.titleCol}>
            <View style={styles.titleBox}>
              <Text style={styles.title}>FACTURE</Text>
            </View>
            <Text style={styles.metaLine}>Facture N° : {invoice.number}</Text>
            <Text style={styles.metaLine}>Date : {invoice.date}</Text>
            {invoice.dueDate ? <Text style={styles.metaLine}>Échéance : {invoice.dueDate}</Text> : null}
          </View>

          <View style={styles.clientBox}>
            <Text style={styles.clientLabel}>Client :</Text>
            <Text style={styles.clientName}>{customer.name}</Text>
            {customer.addressBlock
              .split('\n')
              .filter(Boolean)
              .map((line, i) => (
                <Text key={i} style={styles.clientLine}>{line}</Text>
              ))}
            {customer.siret ? <Text style={styles.clientLine}>N° SIRET : {customer.siret}</Text> : null}
            {customer.vatNumber ? <Text style={styles.clientLine}>TVA : {customer.vatNumber}</Text> : null}
            {customer.taxId ? <Text style={styles.clientLine}>MF : {customer.taxId}</Text> : null}
            {customer.contactLine ? <Text style={styles.clientLine}>{customer.contactLine}</Text> : null}
          </View>
        </View>

        {/* Adresse de livraison */}
        {delivery.address ? (
          <View style={styles.deliveryRow}>
            <Text style={styles.deliveryLabel}>
              ADRESSE DE LIVRAISON :{' '}
              <Text style={styles.deliveryText}>
                {delivery.address.split('\n').filter(Boolean).join(', ')}
                {delivery.country ? ` — ${delivery.country}` : ''}
              </Text>
            </Text>
          </View>
        ) : null}

        {/* Tableau */}
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, styles.colQty]}>Qté</Text>
            <Text style={[styles.th, styles.colDesignation]}>Désignation</Text>
            <Text style={[styles.th, styles.colPrice]}>P.U.</Text>
            <Text style={[styles.th, styles.colTotal, { borderRightWidth: 0 }]}>Total</Text>
          </View>

          {lines.map((line, index) => (
            <View key={index} style={styles.tr} wrap={false}>
              <Text style={[styles.td, styles.colQty]}>
                {line.quantity}
                {line.unit ? `\n${line.unit}` : ''}
              </Text>
              <View style={[styles.td, styles.colDesignation]}>
                {line.reference ? <Text style={styles.itemRef}>Réf. {line.reference}</Text> : null}
                <Text style={styles.itemName}>{line.designation}</Text>
                {line.description ? <Text style={styles.itemDesc}>{line.description}</Text> : null}
              </View>
              <Text style={[styles.td, styles.colPrice]}>{line.unitPrice}</Text>
              <Text style={[styles.tdLast, styles.colTotal]}>{line.total}</Text>
            </View>
          ))}

          {/* Informations export + banque */}
          <View style={styles.tr}>
            <Text style={[styles.td, styles.colQty]} />
            <View style={[styles.td, styles.colDesignation, styles.infoBlock]}>
              {exportInfo.map((info) => (
                <Info key={info.label} label={info.label} value={info.value} />
              ))}

              {hasBank ? (
                <>
                  <Text style={styles.noticeText}>
                    {company.paymentNotice ||
                      'Veuillez nous faire le règlement de cette facture sur notre compte suivant :'}
                  </Text>
                  {bank.name ? <Info label="Banque" value={bank.name} /> : null}
                  {bank.agency ? <Info label="Agence" value={bank.agency} /> : null}
                  {bank.account ? <Info label="N° de compte" value={bank.account} /> : null}
                  {bank.iban && bank.iban !== bank.account.replace(/\s/g, '') ? (
                    <Info label="IBAN" value={bank.iban} />
                  ) : null}
                  {bank.swift ? <Info label="SWIFT" value={bank.swift} /> : null}
                </>
              ) : null}
            </View>
            <Text style={[styles.td, styles.colPrice]} />
            <Text style={[styles.tdLast, styles.colTotal]} />
          </View>

          {/* Totaux */}
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsSpacer, styles.colQty]}>{totals.quantity}</Text>
            <View style={styles.totalsBlock}>
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>Total HTVA</Text>
                <Text style={[styles.totalValue, styles.totalStrong]}>{totals.totalHt}</Text>
              </View>
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>{totals.vatLabel}</Text>
                <Text style={styles.totalValue}>{totals.showVat ? totals.vatAmount : '—'}</Text>
              </View>
              {totals.showVat ? (
                <View style={styles.totalLine}>
                  <Text style={styles.totalLabel}>Montant TTC</Text>
                  <Text style={styles.totalValue}>{totals.totalTtc}</Text>
                </View>
              ) : null}
              {totals.showStampDuty ? (
                <View style={styles.totalLine}>
                  <Text style={styles.totalLabel}>{totals.stampDutyLabel}</Text>
                  <Text style={styles.totalValue}>{totals.stampDutyAmount}</Text>
                </View>
              ) : null}
              <View style={[styles.totalLineLast, styles.netRow]}>
                <Text style={[styles.totalLabel, styles.totalStrong]}>Net à payer</Text>
                <Text style={[styles.totalValue, styles.totalStrong]}>{totals.netToPay}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Ventilation du prix */}
        {invoice.priceBreakdownNote ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>{invoice.priceBreakdownNote}</Text>
          </View>
        ) : null}

        {/* Montant en toutes lettres */}
        <View style={styles.wordsBox}>
          <Text style={styles.noteText}>
            Arrêtée la présente facture à la somme de : {invoice.amountInWords}.
          </Text>
        </View>

        {invoice.notes ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>{invoice.notes}</Text>
          </View>
        ) : null}

        {company.legalMentions ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>{company.legalMentions}</Text>
          </View>
        ) : null}

        {/* Pied de page */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerName}>{company.name}</Text>
          {company.footerText ? <Text style={styles.footerLine}>{company.footerText}</Text> : null}
          {company.contactLine ? <Text style={styles.footerLine}>{company.contactLine}</Text> : null}
        </View>
      </Page>
    </Document>
  )
}
