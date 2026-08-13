import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderToBuffer } from '@react-pdf/renderer'
import { PurchasePdf } from '@/components/purchases/purchase-pdf'
import { apiSession } from '@/lib/auth'
import { getPurchaseDocument } from '@/services/purchase-document'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Prepare le logo pour le PDF. Meme logique que la route des factures de
 * vente : une data URL est exploitable telle quelle, un chemin relatif est lu
 * depuis /public.
 */
async function loadLogo(logoPath: string): Promise<string | undefined> {
  if (!logoPath) return undefined

  if (logoPath.startsWith('data:')) return logoPath

  try {
    const safe = logoPath.replace(/^\//, '')
    if (safe.includes('..')) return undefined
    const absolute = path.join(process.cwd(), 'public', safe)
    const file = await readFile(absolute)
    const ext = path.extname(safe).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
    return `data:${mime};base64,${file.toString('base64')}`
  } catch (error) {
    console.warn('[pdf] logo illisible :', logoPath.slice(0, 60), error)
    return undefined
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Le droit de lecture des achats est verifie ici, cote serveur : le
  // middleware n'est jamais considere comme suffisant.
  const session = await apiSession('purchase.read')
  if (!session) return new Response('Non autorisé', { status: 401 })

  const { id } = await params
  const data = await getPurchaseDocument(id)
  if (!data) return new Response('Facture d’achat introuvable', { status: 404 })

  const logoDataUrl = await loadLogo(data.company.logoPath)
  const buffer = await renderToBuffer(PurchasePdf({ data, logoDataUrl }))

  const url = new URL(request.url)
  const download = url.searchParams.get('download') === '1'

  // Le nom de fichier reprend la reference du FOURNISSEUR quand elle existe :
  // c'est elle qui permet de retrouver l'original dans le classeur papier.
  const base = data.purchase.supplierReference || data.purchase.number
  const filename = `Achat-${base.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
