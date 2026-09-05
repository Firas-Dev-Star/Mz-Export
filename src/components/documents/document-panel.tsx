'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Download, Eye, FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import type { DocumentKind } from '@/generated/prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { DOCUMENT_KIND_LABELS, formatFileSize, isPdf } from '@/lib/document-file'
import { formatDate } from '@/lib/format'

export interface DocumentPanelItem {
  id: string
  kind: DocumentKind
  fileName: string
  mimeType: string
  sizeBytes: number
  reference: string
  note: string
  createdAt: Date
  uploadedBy: { name: string } | null
}

interface DocumentPanelProps {
  documents: DocumentPanelItem[]
  /**
   * Un seul est fourni : la piece se rattache a un achat, a une vente OU a une
   * facture de transport.
   */
  purchaseId?: string
  invoiceId?: string
  transportInvoiceId?: string
  /** Natures proposees dans le menu, selon le contexte. */
  kinds: DocumentKind[]
  /** Faux en lecture seule (droit d'ecriture absent). */
  canWrite?: boolean
  title?: string
  description?: string
}

export function DocumentPanel({
  documents,
  purchaseId,
  invoiceId,
  transportInvoiceId,
  kinds,
  canWrite = true,
  title = 'Pièces jointes',
  description,
}: DocumentPanelProps) {
  const router = useRouter()
  const toast = useToast()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [kind, setKind] = React.useState<DocumentKind>(kinds[0] ?? 'OTHER')
  const [reference, setReference] = React.useState('')
  const [uploading, setUploading] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<DocumentPanelItem | null>(null)

  async function upload(file: File) {
    setUploading(true)
    try {
      const body = new FormData()
      body.set('file', file)
      body.set('kind', kind)
      body.set('reference', reference)
      if (purchaseId) body.set('purchaseId', purchaseId)
      if (invoiceId) body.set('invoiceId', invoiceId)
      if (transportInvoiceId) body.set('transportInvoiceId', transportInvoiceId)

      const response = await fetch('/api/documents', { method: 'POST', body })
      const result = (await response.json()) as { ok: boolean; error?: string }

      if (!result.ok) {
        toast.error(result.error ?? "La pièce n'a pas pu être enregistrée.")
        return
      }
      toast.success('Pièce enregistrée.')
      setReference('')
      router.refresh()
    } catch {
      toast.error('Transfert interrompu. Vérifiez le fichier et réessayez.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    const result = (await response.json()) as { ok: boolean; error?: string }
    setPending(null)
    if (!result.ok) {
      toast.error(result.error ?? 'Suppression impossible.')
      return
    }
    if (preview?.id === id) setPreview(null)
    toast.success('Pièce supprimée.')
    router.refresh()
  }

  const doomed = documents.find((d) => d.id === pending)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
          {title}
          {documents.length > 0 ? (
            <span className="text-sm font-normal text-muted-foreground">({documents.length})</span>
          ) : null}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {canWrite ? (
          <div className="grid gap-3 rounded-lg border border-dashed border-border bg-secondary/30 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Field label="Nature de la pièce" htmlFor="doc-kind">
              <Select
                id="doc-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as DocumentKind)}
                disabled={uploading}
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {DOCUMENT_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Référence du document" htmlFor="doc-ref" hint="N° de BL, de chèque…">
              <Input
                id="doc-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="BL 1204"
                disabled={uploading}
              />
            </Field>

            <div>
              <input
                ref={inputRef}
                id="doc-file"
                type="file"
                className="sr-only"
                accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/jpeg,image/png,image/tiff"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void upload(file)
                }}
              />
              <Button
                type="button"
                loading={uploading}
                onClick={() => inputRef.current?.click()}
                className="w-full sm:w-auto"
              >
                <Upload className="h-4 w-4" />
                Ajouter un fichier
              </Button>
            </div>
          </div>
        ) : null}

        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucune pièce jointe"
            description={
              canWrite
                ? 'Déposez le document original reçu : facture fournisseur, bon de livraison, justificatif de règlement.'
                : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-navy-800">
                    {DOCUMENT_KIND_LABELS[doc.kind]}
                    {doc.reference ? <span className="text-muted-foreground"> — {doc.reference}</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {doc.fileName} · {formatFileSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                    {doc.uploadedBy ? ` · ${doc.uploadedBy.name}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreview(preview?.id === doc.id ? null : doc)}
                    aria-label={`Afficher ${doc.fileName}`}
                  >
                    <Eye className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">Afficher</span>
                  </Button>
                  <a
                    href={`/api/documents/${doc.id}?download=1`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-secondary"
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">Télécharger</span>
                  </a>
                  {canWrite ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPending(doc.id)}
                      aria-label={`Supprimer ${doc.fileName}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Visionneuse : le navigateur affiche les PDF nativement, aucune
            bibliotheque necessaire. Elle rend la saisie cote a cote possible. */}
        {preview ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2">
              <p className="truncate text-xs font-medium text-navy-700">{preview.fileName}</p>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                Fermer
              </Button>
            </div>
            {isPdf(preview.mimeType) ? (
              <iframe
                src={`/api/documents/${preview.id}`}
                title={preview.fileName}
                className="h-[70vh] w-full bg-secondary/20"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/documents/${preview.id}`}
                alt={preview.fileName}
                className="max-h-[70vh] w-full bg-secondary/20 object-contain"
              />
            )}
          </div>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title="Supprimer cette pièce jointe ?"
        description={
          doomed
            ? `« ${doomed.fileName} » sera définitivement supprimé. Le document original reste chez vous, mais l'application n'en gardera plus de copie.`
            : ''
        }
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (pending) await remove(pending)
        }}
      />
    </Card>
  )
}
