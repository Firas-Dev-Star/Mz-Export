import ExcelJS from 'exceljs'
import { recordAudit } from '@/lib/audit'
import { apiSession } from '@/lib/auth'
import { buildAccountantWorkbook, type AccountantWorkbook } from '@/services/accountant-workbook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Classeur mensuel destine au comptable.
 *
 * Meme convention de rendu que la route d'export existante
 * (src/app/api/export/[entity]/route.ts) : en-tete grise, premiere ligne figee,
 * largeurs de colonnes calculees.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

async function toXlsx(workbook: AccountantWorkbook): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MZ EXPORT — Gestion Commerciale'
  wb.created = new Date()

  for (const sheet of workbook.sheets) {
    // Excel refuse les noms de feuille de plus de 31 caracteres.
    const ws = wb.addWorksheet(sheet.name.slice(0, 31))

    ws.columns = sheet.columns.map((c) => ({
      header: c,
      key: c,
      width: Math.min(30, Math.max(12, c.length + 3)),
    }))
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]

    for (const row of sheet.rows) ws.addRow(row)

    // Les montants sont des chaines decimales : on les aligne a droite pour
    // qu'ils se lisent comme des nombres, sans les convertir en flottants.
    ws.columns.forEach((column) => {
      const header = String(column.header ?? '')
      const numeric = /montant|total|net|solde|base|tva|timbre|taux|encaiss|régl|marchandise|transport|frais|valeur/i.test(header)
      if (numeric) column.alignment = { horizontal: 'right' }
    })
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function GET(request: Request) {
  const session = await apiSession('report.read')
  if (!session) return new Response('Non autorisé', { status: 401 })

  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''

  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    return new Response('Indiquez une période valide (from et to au format AAAA-MM-JJ).', { status: 400 })
  }
  if (from > to) {
    return new Response('La date de début doit précéder la date de fin.', { status: 400 })
  }

  const workbook = await buildAccountantWorkbook({ from, to })
  const buffer = await toXlsx(workbook)

  const rowCount = workbook.sheets.reduce((acc, s) => acc + s.rows.length, 0)
  await recordAudit({
    session,
    action: 'EXPORT_ACCOUNTANT',
    entity: 'Report',
    reference: `${from} → ${to}`,
    details: { rows: rowCount, sheets: workbook.sheets.length },
  })

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="MZ-EXPORT-comptable-${from}_${to}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
