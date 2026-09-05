import type { DocumentKind } from '@/generated/prisma/client'
import { recordAudit } from '@/lib/audit'
import { apiSession } from '@/lib/auth'
import {
  DOCUMENT_KIND_LABELS,
  MAX_DOCUMENT_BYTES,
  safeFileName,
  sniffDocument,
} from '@/lib/document-file'
import { prisma } from '@/lib/prisma'
import { type DocumentTarget, createDocument } from '@/services/document.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Depot d'une piece jointe.
 *
 * Pourquoi une route et non une server action : les server actions de Next
 * plafonnent le corps de requete a 1 Mo par defaut. Un scan de 3 Mo echouerait
 * sans message clair. Une route handler recoit le FormData sans cette limite.
 */

function bad(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status })
}

function isDocumentKind(value: string): value is DocumentKind {
  return Object.prototype.hasOwnProperty.call(DOCUMENT_KIND_LABELS, value)
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  if (!form) return bad('Requête illisible.')

  const purchaseId = String(form.get('purchaseId') ?? '').trim()
  const invoiceId = String(form.get('invoiceId') ?? '').trim()
  const transportInvoiceId = String(form.get('transportInvoiceId') ?? '').trim()

  // Exactement un rattachement. La base porte la meme contrainte, mais on
  // refuse ici pour renvoyer un message utile plutot qu'une erreur SQL.
  const parents = [purchaseId, invoiceId, transportInvoiceId].filter(Boolean)
  if (parents.length !== 1) {
    return bad('Indiquez un seul rattachement : un achat, une vente ou une facture de transport.')
  }

  // Le droit d'ecriture est celui du document parent : qui peut modifier
  // l'achat peut y joindre une piece.
  const session = await apiSession(
    purchaseId ? 'purchase.write' : transportInvoiceId ? 'transport.write' : 'invoice.write',
  )
  if (!session) return bad('Non autorisé', 401)

  const target: DocumentTarget = purchaseId
    ? { purchaseId }
    : transportInvoiceId
      ? { transportInvoiceId }
      : { invoiceId }

  // Le parent doit exister : sans ce controle, une cle etrangere invalide
  // remonterait en erreur 500 illisible.
  const parent = purchaseId
    ? await prisma.purchase.findUnique({ where: { id: purchaseId }, select: { id: true, number: true } })
    : transportInvoiceId
      ? await prisma.transportInvoice.findUnique({
          where: { id: transportInvoiceId },
          select: { id: true, number: true },
        })
      : await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, number: true } })
  if (!parent) return bad('Document de rattachement introuvable.', 404)

  const parentEntity = purchaseId ? 'Purchase' : transportInvoiceId ? 'TransportInvoice' : 'Invoice'

  const file = form.get('file')
  if (!(file instanceof File)) return bad('Aucun fichier reçu.')
  if (file.size > MAX_DOCUMENT_BYTES) {
    const mb = Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))
    return bad(`Le fichier dépasse ${mb} Mo. Scannez en 200 ou 300 DPI plutôt qu'en 600.`)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  // Le type MIME annonce par le navigateur est ignore : seuls les premiers
  // octets du fichier decident.
  const sniffed = sniffDocument(bytes)
  if (!sniffed.ok) return bad(sniffed.error)

  const rawKind = String(form.get('kind') ?? 'OTHER')
  const kind: DocumentKind = isDocumentKind(rawKind) ? rawKind : 'OTHER'

  const created = await createDocument({
    target,
    kind,
    fileName: safeFileName(file.name, sniffed.extension),
    mimeType: sniffed.mimeType,
    content: bytes,
    reference: String(form.get('reference') ?? '').trim().slice(0, 120),
    note: String(form.get('note') ?? '').trim().slice(0, 500),
    uploadedById: session.userId,
  })

  await recordAudit({
    session,
    action: 'CREATE_DOCUMENT',
    entity: parentEntity,
    entityId: parent.id,
    reference: parent.number,
    details: {
      documentId: created.id,
      kind: created.kind,
      fileName: created.fileName,
      sizeBytes: bytes.byteLength,
    },
  })

  return Response.json({ ok: true, data: created })
}
