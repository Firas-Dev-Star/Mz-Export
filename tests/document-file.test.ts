import { describe, expect, it } from 'vitest'
import { MAX_DOCUMENT_BYTES, safeFileName, sniffDocument } from '@/lib/document-file'

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

/** Un vrai PDF commence par %PDF- (0x25 0x50 0x44 0x46 0x2d). */
const PDF_HEAD = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37)
const JPEG_HEAD = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10)
const PNG_HEAD = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00)

describe('sniffDocument', () => {
  it('reconnait un PDF', () => {
    const result = sniffDocument(PDF_HEAD)
    expect(result).toEqual({ ok: true, mimeType: 'application/pdf', extension: 'pdf' })
  })

  it('reconnait un JPEG', () => {
    const result = sniffDocument(JPEG_HEAD)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mimeType).toBe('image/jpeg')
  })

  it('reconnait un PNG', () => {
    const result = sniffDocument(PNG_HEAD)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.extension).toBe('png')
  })

  it('reconnait les deux boutismes du TIFF', () => {
    expect(sniffDocument(bytes(0x49, 0x49, 0x2a, 0x00, 0x08)).ok).toBe(true)
    expect(sniffDocument(bytes(0x4d, 0x4d, 0x00, 0x2a, 0x00)).ok).toBe(true)
  })

  // Le coeur du garde-fou : c'est ce cas qui justifie de ne pas croire le
  // type MIME du navigateur. Un .exe renomme en .pdf arrive avec
  // "application/pdf" dans l'en-tete du formulaire.
  it('refuse un executable renomme en PDF', () => {
    const exe = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03) // en-tete MZ (PE Windows)
    const result = sniffDocument(exe)
    expect(result.ok).toBe(false)
  })

  it('refuse une archive ZIP deguisee', () => {
    const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0x14)
    expect(sniffDocument(zip).ok).toBe(false)
  })

  it('refuse un fichier vide', () => {
    const result = sniffDocument(new Uint8Array(0))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('vide')
  })

  it('refuse un fichier trop volumineux avant meme de lire les octets', () => {
    // Un buffer valide en tete mais au-dela du plafond doit etre rejete sur la
    // taille : la verification de taille passe AVANT la signature.
    const tooBig = new Uint8Array(MAX_DOCUMENT_BYTES + 1)
    tooBig.set(PDF_HEAD, 0)
    const result = sniffDocument(tooBig)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('dépasse')
  })

  it('refuse un fichier plus court que la signature', () => {
    expect(sniffDocument(bytes(0x25, 0x50)).ok).toBe(false)
  })
})

describe('safeFileName', () => {
  it('conserve un nom simple et force l’extension reelle', () => {
    expect(safeFileName('FAC L-41.pdf', 'pdf')).toBe('FAC-L-41.pdf')
  })

  it('neutralise une traversee de repertoire', () => {
    const result = safeFileName('../../etc/passwd', 'pdf')
    expect(result).toBe('passwd.pdf')
    expect(result).not.toContain('..')
    expect(result).not.toContain('/')
  })

  it('neutralise un chemin Windows', () => {
    expect(safeFileName('C:\\Users\\MZEXP\\scan.pdf', 'pdf')).toBe('scan.pdf')
  })

  // L'extension retenue est celle deduite des octets, pas celle du nom : un
  // JPEG nomme .pdf doit ressortir en .jpg.
  it('remplace une extension mensongere par la vraie', () => {
    expect(safeFileName('facture.pdf', 'jpg')).toBe('facture.jpg')
  })

  it('produit un nom de repli quand il ne reste rien', () => {
    expect(safeFileName('...', 'pdf')).toBe('document.pdf')
    expect(safeFileName('', 'pdf')).toBe('document.pdf')
  })

  it('borne la longueur du nom', () => {
    const long = `${'a'.repeat(200)}.pdf`
    const result = safeFileName(long, 'pdf')
    expect(result.length).toBeLessThanOrEqual(84)
  })
})
