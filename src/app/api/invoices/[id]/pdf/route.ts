import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePdf } from '@/components/invoices/invoice-pdf'
import { apiSession } from '@/lib/auth'
import { buildInvoiceDocument } from '@/services/invoice-document'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Charge le logo depuis /public et le convertit en data URL pour le PDF. */
async function loadLogo(logoPath: string): Promise<string | undefined> {
  if (!logoPath) return undefined
  try {
    const safe = logoPath.replace(/^\/+/, '')
    if (safe.includes('..')) return undefined
    const absolute = path.join(process.cwd(), 'public', safe)
    const file = await readFile(absolute)
    const ext = path.extname(safe).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
    return `data:${mime};base64,${file.toString('base64')}`
  } catch {
    return undefined
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await apiSession('invoice.read')
  if (!session) return new Response('Non autorisé', { status: 401 })

  const { id } = await params
  const data = await buildInvoiceDocument(id)
  if (!data) return new Response('Facture introuvable', { status: 404 })

  const logoDataUrl = await loadLogo(data.company.logoPath)
  const buffer = await renderToBuffer(InvoicePdf({ data, logoDataUrl }))

  const url = new URL(request.url)
  const download = url.searchParams.get('download') === '1'
  const filename = `Facture-${data.invoice.number.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
