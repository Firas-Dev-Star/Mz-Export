import 'server-only'
import type { DocumentKind, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Acces aux pieces jointes.
 *
 * Le contenu binaire (`content`) n'est JAMAIS charge par les listes : une fiche
 * achat qui afficherait cinq scans de 1 Mo tirerait 5 Mo de la base a chaque
 * rendu. Il n'est lu que par la route qui sert le fichier.
 */

/** Champs d'une piece jointe hors contenu binaire. */
const LIST_SELECT = {
  id: true,
  kind: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  reference: true,
  note: true,
  createdAt: true,
  purchaseId: true,
  invoiceId: true,
  transportInvoiceId: true,
  uploadedBy: { select: { name: true } },
} satisfies Prisma.DocumentSelect

export type DocumentListItem = Prisma.DocumentGetPayload<{ select: typeof LIST_SELECT }>

/**
 * Cible d'un rattachement : un achat, une vente OU une facture de transport.
 * Jamais deux a la fois — la base porte la meme contrainte.
 */
export type DocumentTarget =
  | { purchaseId: string }
  | { invoiceId: string }
  | { transportInvoiceId: string }

export async function listDocuments(target: DocumentTarget): Promise<DocumentListItem[]> {
  return prisma.document.findMany({
    where: target,
    orderBy: [{ createdAt: 'asc' }],
    select: LIST_SELECT,
  })
}

/** Metadonnees seules : sert au controle d'acces avant de servir le fichier. */
export async function getDocumentMeta(id: string) {
  return prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      purchaseId: true,
      invoiceId: true,
      transportInvoiceId: true,
    },
  })
}

/** Contenu binaire, charge uniquement au moment de servir le fichier. */
export async function getDocumentContent(id: string) {
  return prisma.document.findUnique({
    where: { id },
    select: { id: true, fileName: true, mimeType: true, content: true },
  })
}

export interface CreateDocumentInput {
  target: DocumentTarget
  kind: DocumentKind
  fileName: string
  mimeType: string
  content: Uint8Array
  reference: string
  note: string
  uploadedById: string | null
}

export async function createDocument(input: CreateDocumentInput) {
  return prisma.document.create({
    data: {
      ...input.target,
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.content.byteLength,
      content: Buffer.from(input.content),
      reference: input.reference,
      note: input.note,
      uploadedById: input.uploadedById,
    },
    select: { id: true, fileName: true, kind: true },
  })
}

/**
 * Piece a privilegier pour representer un achat : la facture fournisseur
 * scannee. C'est elle qui a valeur probante, le recapitulatif genere n'est
 * qu'un document interne (cf. src/services/purchase-document.ts).
 */
export async function findPrimaryPurchaseDocument(purchaseId: string) {
  return prisma.document.findFirst({
    where: { purchaseId, kind: 'SUPPLIER_INVOICE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fileName: true, mimeType: true },
  })
}

/** Nombre de pieces par achat, pour afficher un compteur dans les listes. */
export async function countDocumentsByPurchase(purchaseIds: string[]) {
  if (purchaseIds.length === 0) return new Map<string, number>()
  const rows = await prisma.document.groupBy({
    by: ['purchaseId'],
    where: { purchaseId: { in: purchaseIds } },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.purchaseId as string, r._count._all]))
}
