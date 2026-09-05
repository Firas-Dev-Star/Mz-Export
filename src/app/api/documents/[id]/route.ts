import { recordAudit } from '@/lib/audit'
import { apiSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDocumentContent, getDocumentMeta } from '@/services/document.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Sert une piece jointe, en affichage ou en telechargement (`?download=1`).
 *
 * Le droit de lecture est celui du document parent, verifie ICI cote serveur :
 * comme pour la route PDF des achats, le middleware n'est jamais considere
 * comme suffisant.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const meta = await getDocumentMeta(id)
  if (!meta) return new Response('Pièce introuvable', { status: 404 })

  const session = await apiSession(
    meta.purchaseId
      ? 'purchase.read'
      : meta.transportInvoiceId
        ? 'transport.read'
        : 'invoice.read',
  )
  if (!session) return new Response('Non autorisé', { status: 401 })

  const doc = await getDocumentContent(id)
  if (!doc) return new Response('Pièce introuvable', { status: 404 })

  const download = new URL(request.url).searchParams.get('download') === '1'

  return new Response(new Uint8Array(doc.content), {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${doc.fileName}"`,
      'Content-Length': String(doc.content.byteLength),
      // Une piece justificative ne doit pas rester en cache navigateur :
      // elle est accessible sous authentification uniquement.
      'Cache-Control': 'no-store',
    },
  })
}

/** Suppression d'une piece. Reserve au droit d'ecriture du document parent. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const meta = await getDocumentMeta(id)
  if (!meta) return Response.json({ ok: false, error: 'Pièce introuvable.' }, { status: 404 })

  const session = await apiSession(
    meta.purchaseId
      ? 'purchase.write'
      : meta.transportInvoiceId
        ? 'transport.write'
        : 'invoice.write',
  )
  if (!session) return Response.json({ ok: false, error: 'Non autorisé' }, { status: 401 })

  await prisma.document.delete({ where: { id } })

  await recordAudit({
    session,
    action: 'DELETE_DOCUMENT',
    entity: meta.purchaseId
      ? 'Purchase'
      : meta.transportInvoiceId
        ? 'TransportInvoice'
        : 'Invoice',
    entityId: meta.purchaseId ?? meta.transportInvoiceId ?? meta.invoiceId,
    details: { documentId: id, fileName: meta.fileName },
  })

  return Response.json({ ok: true })
}
