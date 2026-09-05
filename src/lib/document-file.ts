import type { DocumentKind } from '@/generated/prisma/client'

/**
 * Validation des pieces jointes.
 *
 * REGLE ABSOLUE : le type MIME annonce par le navigateur n'est JAMAIS cru.
 * Un fichier renomme en .pdf arrive avec `application/pdf` dans l'en-tete du
 * formulaire. Seuls les premiers octets du fichier font foi.
 */

/** 15 Mo : large pour un scan A4 en 300 DPI (~1 Mo), etroit pour un abus. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  SUPPLIER_INVOICE: 'Facture fournisseur',
  DELIVERY_NOTE: 'Bon de livraison',
  TRANSPORT_INVOICE: 'Facture de transport',
  PAYMENT_PROOF: 'Justificatif de règlement',
  CUSTOMS: 'Pièce douanière',
  OTHER: 'Autre document',
}

/** Natures proposees selon le document auquel la piece se rattache. */
export const PURCHASE_DOCUMENT_KINDS: DocumentKind[] = [
  'SUPPLIER_INVOICE',
  'TRANSPORT_INVOICE',
  'PAYMENT_PROOF',
  'OTHER',
]

/**
 * Une facture de transport porte d'abord la facture du transporteur elle-meme,
 * puis le bon de livraison qu'il remet.
 */
export const TRANSPORT_DOCUMENT_KINDS: DocumentKind[] = [
  'TRANSPORT_INVOICE',
  'DELIVERY_NOTE',
  'CUSTOMS',
  'PAYMENT_PROOF',
  'OTHER',
]

export const INVOICE_DOCUMENT_KINDS: DocumentKind[] = [
  'DELIVERY_NOTE',
  'TRANSPORT_INVOICE',
  'CUSTOMS',
  'PAYMENT_PROOF',
  'OTHER',
]

interface Signature {
  mimeType: string
  extension: string
  /** Octets attendus en tete de fichier. */
  magic: number[]
  /** Decalage du motif (0 sauf cas particulier). */
  offset?: number
}

/**
 * Formats acceptes. Volontairement restreint : un scanner et un telephone ne
 * produisent que du PDF, du JPEG ou du PNG. Tout le reste est refuse.
 */
const SIGNATURES: Signature[] = [
  // %PDF-
  { mimeType: 'application/pdf', extension: 'pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // JPEG : FF D8 FF
  { mimeType: 'image/jpeg', extension: 'jpg', magic: [0xff, 0xd8, 0xff] },
  // PNG : 89 50 4E 47 0D 0A 1A 0A
  { mimeType: 'image/png', extension: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // TIFF little-endian (II*\0) et big-endian (MM\0*) : sortie courante de scanner
  { mimeType: 'image/tiff', extension: 'tif', magic: [0x49, 0x49, 0x2a, 0x00] },
  { mimeType: 'image/tiff', extension: 'tif', magic: [0x4d, 0x4d, 0x00, 0x2a] },
]

export interface SniffResult {
  ok: true
  mimeType: string
  extension: string
}

export interface SniffError {
  ok: false
  error: string
}

/** Identifie le format REEL d'un fichier par ses premiers octets. */
export function sniffDocument(bytes: Uint8Array): SniffResult | SniffError {
  if (bytes.byteLength === 0) return { ok: false, error: 'Le fichier est vide.' }

  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    const mb = Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))
    return { ok: false, error: `Le fichier dépasse ${mb} Mo. Scannez en 200 ou 300 DPI plutôt qu'en 600.` }
  }

  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0
    if (bytes.byteLength < offset + sig.magic.length) continue
    let match = true
    for (let i = 0; i < sig.magic.length; i += 1) {
      if (bytes[offset + i] !== sig.magic[i]) {
        match = false
        break
      }
    }
    if (match) return { ok: true, mimeType: sig.mimeType, extension: sig.extension }
  }

  return {
    ok: false,
    error: 'Format non reconnu. Seuls les fichiers PDF, JPEG, PNG et TIFF sont acceptés.',
  }
}

/**
 * Nettoie un nom de fichier avant stockage puis re-diffusion.
 * On ne garde que le nom de base : un chemin envoye par le client
 * (`../../etc/passwd`) ne doit jamais survivre.
 */
export function safeFileName(raw: string, extension: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const withoutExt = base.replace(/\.[^.]+$/, '')
  const cleaned = withoutExt
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
  return `${cleaned || 'document'}.${extension}`
}

/** Taille lisible pour l'affichage : 512 Ko, 1,4 Mo... */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}

/** Un PDF s'affiche dans un iframe, une image dans une balise img. */
export function isPdf(mimeType: string): boolean {
  return mimeType === 'application/pdf'
}
