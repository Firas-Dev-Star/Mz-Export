import Image from 'next/image'
import type { InvoiceDocumentData } from '@/services/invoice-document'

/**
 * Rendu HTML A4 de la facture, identique au PDF.
 * Sert d'apercu avant impression (Ctrl+P) et de secours si l'utilisateur
 * prefere imprimer depuis le navigateur.
 */
export function InvoicePrintView({ data }: { data: InvoiceDocumentData }) {
  const { company, bank, invoice, customer, delivery, exportInfo, lines, totals } = data
  const hasBank = Boolean(bank.name || bank.account || bank.iban || bank.swift)

  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white p-8 text-[11px] leading-snug text-slate-900 shadow-sm print:p-0 print:shadow-none">
      {/* En-tête */}
      <div className="flex items-stretch gap-2">
        <div className="flex w-[42%] flex-col items-center justify-center border border-slate-800 p-3">
          {company.logoPath ? (
            <Image
              src={company.logoPath}
              alt={company.name}
              width={220}
              height={70}
              className="max-h-16 w-auto object-contain"
              unoptimized
            />
          ) : (
            <>
              <span className="text-2xl font-bold tracking-[0.2em] text-navy-800">MZ</span>
              <span className="text-[10px] tracking-[0.35em] text-slate-600">EXPORT</span>
            </>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center border border-slate-800 p-3 text-center">
          <p className="text-sm font-bold">{company.name}</p>
          {company.legalLine ? <p>{company.legalLine}</p> : null}
          {company.taxLine ? <p>{company.taxLine}</p> : null}
          {company.email ? <p>{company.email}</p> : null}
          {company.headerNote ? <p>{company.headerNote}</p> : null}
        </div>
      </div>

      {/* Titre + client */}
      <div className="mt-4 flex gap-3">
        <div className="w-[48%]">
          <div className="border border-slate-800 py-3 text-center">
            <span className="text-xl font-bold tracking-[0.25em] text-navy-800">FACTURE</span>
          </div>
          <p className="mt-2 font-bold">Facture N° : {invoice.number}</p>
          <p className="font-bold">Date : {invoice.date}</p>
          {invoice.dueDate ? <p className="font-bold">Échéance : {invoice.dueDate}</p> : null}
        </div>
        <div className="flex-1 border border-slate-800 p-3">
          <p className="text-[10px] text-slate-600">Client :</p>
          <p className="text-sm font-bold">{customer.name}</p>
          {customer.addressBlock.split('\n').filter(Boolean).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {customer.siret ? <p>N° SIRET : {customer.siret}</p> : null}
          {customer.vatNumber ? <p>TVA : {customer.vatNumber}</p> : null}
          {customer.taxId ? <p>MF : {customer.taxId}</p> : null}
          {customer.contactLine ? <p>{customer.contactLine}</p> : null}
        </div>
      </div>

      {delivery.address ? (
        <p className="mt-3 font-bold">
          ADRESSE DE LIVRAISON :{' '}
          <span className="font-normal">
            {delivery.address.split('\n').filter(Boolean).join(', ')}
            {delivery.country ? ` — ${delivery.country}` : ''}
          </span>
        </p>
      ) : null}

      {/* Tableau */}
      <table className="mt-3 w-full border-collapse border border-slate-800">
        <thead>
          <tr className="bg-slate-100">
            <th className="w-[12%] border border-slate-800 px-2 py-1 text-center">Qté</th>
            <th className="border border-slate-800 px-2 py-1 text-left">Désignation</th>
            <th className="w-[18%] border border-slate-800 px-2 py-1 text-right">P.U.</th>
            <th className="w-[22%] border border-slate-800 px-2 py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td className="border border-slate-800 px-2 py-1 text-center align-top tabular">
                {line.quantity}
                {line.unit ? <span className="block text-[10px]">{line.unit}</span> : null}
              </td>
              <td className="border border-slate-800 px-2 py-1 align-top">
                {line.reference ? <span className="block text-[10px] text-slate-600">Réf. {line.reference}</span> : null}
                <span className="font-bold">{line.designation}</span>
                {line.description ? <span className="block text-[10px] text-slate-600">{line.description}</span> : null}
              </td>
              <td className="border border-slate-800 px-2 py-1 text-right align-top tabular">{line.unitPrice}</td>
              <td className="border border-slate-800 px-2 py-1 text-right align-top tabular">{line.total}</td>
            </tr>
          ))}

          <tr>
            <td className="border border-slate-800" />
            <td className="border border-slate-800 px-2 py-2 align-top">
              {exportInfo.map((info) => (
                <p key={info.label}>
                  <span className="font-bold">{info.label} : </span>
                  {info.value}
                </p>
              ))}
              {hasBank ? (
                <>
                  <p className="mt-2 font-bold">
                    {company.paymentNotice ||
                      'Veuillez nous faire le règlement de cette facture sur notre compte suivant :'}
                  </p>
                  {bank.name ? <p><span className="font-bold">Banque : </span>{bank.name}</p> : null}
                  {bank.agency ? <p><span className="font-bold">Agence : </span>{bank.agency}</p> : null}
                  {bank.account ? <p><span className="font-bold">N° de compte : </span>{bank.account}</p> : null}
                  {bank.swift ? <p><span className="font-bold">SWIFT : </span>{bank.swift}</p> : null}
                </>
              ) : null}
            </td>
            <td className="border border-slate-800" />
            <td className="border border-slate-800" />
          </tr>

          <tr>
            <td className="border border-slate-800 px-2 py-1 text-center font-bold tabular">{totals.quantity}</td>
            <td className="border border-slate-800 p-0" colSpan={3}>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="border-b border-r border-slate-800 px-2 py-1">Total HTVA</td>
                    <td className="w-[38%] border-b border-slate-800 px-2 py-1 text-right font-bold tabular">{totals.totalHt}</td>
                  </tr>
                  <tr>
                    <td className="border-b border-r border-slate-800 px-2 py-1">{totals.vatLabel}</td>
                    <td className="border-b border-slate-800 px-2 py-1 text-right tabular">
                      {totals.showVat ? totals.vatAmount : '—'}
                    </td>
                  </tr>
                  {totals.showVat ? (
                    <tr>
                      <td className="border-b border-r border-slate-800 px-2 py-1">Montant TTC</td>
                      <td className="border-b border-slate-800 px-2 py-1 text-right tabular">{totals.totalTtc}</td>
                    </tr>
                  ) : null}
                  {totals.showStampDuty ? (
                    <tr>
                      <td className="border-b border-r border-slate-800 px-2 py-1">{totals.stampDutyLabel}</td>
                      <td className="border-b border-slate-800 px-2 py-1 text-right tabular">{totals.stampDutyAmount}</td>
                    </tr>
                  ) : null}
                  <tr className="bg-slate-100">
                    <td className="border-r border-slate-800 px-2 py-1 font-bold">Net à payer</td>
                    <td className="px-2 py-1 text-right font-bold tabular">{totals.netToPay}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {invoice.priceBreakdownNote ? (
        <p className="mt-3 border border-slate-800 p-2">{invoice.priceBreakdownNote}</p>
      ) : null}

      <p className="mt-2 border border-slate-800 p-2">
        Arrêtée la présente facture à la somme de : {invoice.amountInWords}.
      </p>

      {invoice.notes ? <p className="mt-2 border border-slate-800 p-2">{invoice.notes}</p> : null}
      {company.legalMentions ? (
        <p className="mt-2 border border-slate-800 p-2">{company.legalMentions}</p>
      ) : null}

      <div className="mt-6 border-t border-slate-800 pt-2 text-center">
        <p className="font-bold">{company.name}</p>
        {company.footerText ? <p className="text-[10px] text-slate-700">{company.footerText}</p> : null}
        {company.contactLine ? <p className="text-[10px] text-slate-700">{company.contactLine}</p> : null}
      </div>
    </div>
  )
}
