'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ImageIcon, Trash2, Upload } from 'lucide-react'
import { updateLogo } from '@/actions/settings.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'

const MAX_BYTES = 1_000_000

/**
 * Le logo est stocke en base64 dans la base de donnees plutot que sur le
 * systeme de fichiers : cela fonctionne aussi sur un hebergement sans disque
 * persistant (Vercel).
 */
export function LogoUpload({ current }: { current: string }) {
  const [loading, setLoading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const router = useRouter()
  const toast = useToast()

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Format non pris en charge', 'Utilisez un fichier PNG, JPEG ou WebP.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Fichier trop volumineux', '1 Mo maximum.')
      return
    }

    setLoading(true)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const result = await updateLogo(dataUrl)
    setLoading(false)

    if (result.ok) {
      toast.success(result.message ?? 'Logo enregistré.')
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function remove() {
    setLoading(true)
    const result = await updateLogo('')
    setLoading(false)
    if (result.ok) {
      toast.success('Logo supprimé.')
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
        <CardDescription>PNG, JPEG ou WebP — 1 Mo maximum. Utilisé sur le PDF et l&apos;aperçu.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-48 items-center justify-center rounded-lg border border-dashed border-border bg-secondary/40">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt="Logo de la société" className="max-h-20 max-w-44 object-contain" />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
          <Button type="button" variant="outline" loading={loading} onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {current ? 'Remplacer' : 'Téléverser'}
          </Button>
          {current ? (
            <Button type="button" variant="ghost" loading={loading} onClick={remove}>
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
