import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download } from 'lucide-react'
import { InvoicePrintView } from '@/components/invoices/invoice-print-view'
import { PrintButton } from '@/components/invoices/print-button'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/auth'
import { buildInvoiceDocument } from '@/services/invoice-document'

export const dynamic = 'force-dynamic'

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  const data = await buildInvoiceDocument(id)
  if (!data) notFound()

  return (
    <div className="print:m-0 print:p-0">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/invoices/${id}`}><ArrowLeft className="h-4 w-4" />Retour</Link>
        </Button>
        <PrintButton />
        <Button asChild variant="outline" size="sm">
          <a href={`/api/invoices/${id}/pdf?download=1`}><Download className="h-4 w-4" />Télécharger le PDF</a>
        </Button>
      </div>
      <InvoicePrintView data={data} />
    </div>
  )
}
