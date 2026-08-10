'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createUser, deleteUser, updateUser } from '@/actions/settings.actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { ROLE_LABELS, formatDateTime } from '@/lib/format'
import { type UserInput, userSchema } from '@/validations/settings'

export interface UserRow {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  lastLoginAt: Date | null
}

export function UsersPanel({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [editing, setEditing] = React.useState<UserRow | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [toDelete, setToDelete] = React.useState<UserRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const router = useRouter()
  const toast = useToast()

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    const result = await deleteUser(toDelete.id)
    setDeleting(false)
    setToDelete(null)
    if (result.ok) {
      toast.success(result.message ?? 'Utilisateur supprimé.')
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Utilisateurs</CardTitle>
          <CardDescription>
            ADMIN : accès complet · MANAGER : exploitation et rapports · USER : consultation et brouillons.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Nouvel utilisateur
        </Button>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernière connexion</TableHead>
              <TableHead className="w-1" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>{ROLE_LABELS[user.role] ?? user.role}</TableCell>
                <TableCell>
                  {user.isActive ? <Badge variant="success">Actif</Badge> : <Badge variant="outline">Désactivé</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(user.lastLoginAt) || '—'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(user)} aria-label="Modifier">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {user.id !== currentUserId ? (
                      <Button variant="ghost" size="icon" onClick={() => setToDelete(user)} aria-label="Supprimer">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <UserDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nouvel utilisateur"
        requirePassword
        onSubmit={createUser}
      />

      <UserDialog
        key={editing?.id ?? 'none'}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={`Modifier ${editing?.name ?? ''}`}
        defaultValues={
          editing
            ? { name: editing.name, email: editing.email, role: editing.role as UserInput['role'], isActive: editing.isActive, password: '' }
            : undefined
        }
        onSubmit={(values) => updateUser(editing!.id, values)}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Supprimer ${toDelete?.email ?? ''} ?`}
        description="L'utilisateur perdra immédiatement l'accès. Les factures qu'il a créées sont conservées."
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </Card>
  )
}

function UserDialog({
  open, onOpenChange, title, defaultValues, requirePassword, onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  defaultValues?: UserInput
  requirePassword?: boolean
  onSubmit: (values: UserInput) => Promise<{ ok: boolean; message?: string; error?: string }>
}) {
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserInput>({
    resolver: zodResolver(userSchema),
    defaultValues: defaultValues ?? { name: '', email: '', role: 'USER', isActive: true, password: '' },
  })

  async function submit(values: UserInput) {
    const result = await onSubmit(values)
    if (result.ok) {
      toast.success(result.message ?? 'Enregistré.')
      onOpenChange(false)
      router.refresh()
    } else {
      toast.error(result.error ?? 'Erreur')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <Field label="Nom" htmlFor="user-name" required error={errors.name?.message}>
            <Input id="user-name" {...register('name')} />
          </Field>
          <Field label="Email" htmlFor="user-email" required error={errors.email?.message}>
            <Input id="user-email" type="email" {...register('email')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rôle" htmlFor="user-role" error={errors.role?.message}>
              <Select id="user-role" {...register('role')}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Statut" htmlFor="user-active">
              <Select id="user-active" {...register('isActive', { setValueAs: (v) => v === 'true' || v === true })}>
                <option value="true">Actif</option>
                <option value="false">Désactivé</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Mot de passe"
            htmlFor="user-password"
            required={requirePassword}
            error={errors.password?.message}
            hint={requirePassword ? '8 caractères minimum' : 'Laisser vide pour conserver le mot de passe actuel'}
          >
            <Input id="user-password" type="password" autoComplete="new-password" {...register('password')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={isSubmitting}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
