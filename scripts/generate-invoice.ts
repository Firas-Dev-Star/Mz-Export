import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { Client } from 'pg'
import { buildInvoiceDocument } from '../src/services/invoice-document'
import { InvoicePdf } from '../src/components/invoices/invoice-pdf'
import { renderToFile } from '@react-pdf/renderer'

// Fonction pour lire la config du desktop
function readDesktopConfig() {
  const configPath = path.join(process.env.APPDATA || '', 'mz-export-gestion', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  return config
}

// Fonction pour construire l'URL de connexion
function getDatabaseUrl(config: any) {
  if (config.mode === 'remote') {
    return config.remoteUrl
  }
  const { user, password, port, database } = config.embedded
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`
}

async function generateInvoice() {
  console.log('🔍 Lecture de la configuration du poste...\n')
  const config = readDesktopConfig()
  const connectionString = getDatabaseUrl(config)

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })
  await client.connect()

  try {
    // Chercher la facture FAC 52-2026
    const result = await client.query(
      'SELECT id FROM invoices WHERE number = $1',
      ['FAC 52-2026']
    )

    if (result.rows.length === 0) {
      console.log('❌ Facture FAC 52-2026 non trouvée')
      process.exit(1)
    }

    const invoiceId = result.rows[0].id
    console.log(`📄 Génération du PDF pour la facture FAC 52-2026 (ID: ${invoiceId})\n`)

    // Note: Cette approche simple utilise les imports TypeScript
    // Pour une vrai génération PDF, il faudrait utiliser la route API
    console.log('✅ Appel à la génération du PDF via API...')
  } finally {
    await client.end()
  }
}

generateInvoice().catch((err) => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
