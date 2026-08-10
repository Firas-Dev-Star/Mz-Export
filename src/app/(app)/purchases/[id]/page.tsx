import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CreditCard, Pencil } from 'lucide-react'
import { deletePurchase } from '@/actions/purchase.actions'
import { PageHeader } from '@/components/layout/page-header'
import { CancelPurchaseButton, ConfirmPurchaseButton } from '@/components/purchases/purchase-actions'
import {
  DeletePurchasePaymentButton,
  PurchasePaymentDialog,
} from '@/components/purchases/purchase-payment-dialog'
import { DeleteButton } from '@/components/shared/delete-button'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { MOVEMENT_LABELS } from '@/lib/stock-labels'
import { PAYMENT_METHOD_LABELS, formatDate, formatDateTime, formatMoney, formatQuantity } from '@/lib/format'
import { gt, round } from '@/lib/money'
import { previewNextNumber } from '@/lib/numbering'
import { prisma } from '@/lib/prisma'
import { getPurchase } from '@/services/purchase.service'

export const dynamic = 'force-dynamic'

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser()
  const { id } = await params

  const purchase = await getPurchase(id)
  if (!purchase) notFound()

  const isDraft = purchase.status === 'DRAFT'
  const isCancelled = purchase.status === 'CANCELLED'
  const remaining = round(purchase.balanceDue, 3).toFixed(3)
  const nextNumber = isDraft ? await previewNextNumber('PURCHASE') : ''

  const movements = await prisma.stockMovement.findMany({
    where: { referenceType: 'PURCHASE', referenceId: id },
    orderBy: { createdAt: 'asc' },
    include: { product: { select: { id: true, designation: true, unit: true } } },
  })

  return (
    <>
      <PageHeader
        title={isDraft ? "Brouillon d'achat" : `Facture d'achat ${purchase.number}`}
        description={`${purchase.supplier.companyName} — ${formatDate(purchase.date)}`}
        actions={
          <>
            {isDraft && can(session.role, 'purchase.write') ? (
              <Button asChild variant="outline">
                <Link href={`/purchases/${purchase.id}/edit`}><Pencil className="h-4 w-4" />Modifier</Link>
              </Button>
            ) : null}
            {isDraft && can(session.role, 'purchase.confirm') ? (
              <ConfirmPurchaseButton purchaseId={purchase.id} nextNumber={nextNumber} />
            ) : null}
            {!isDraft && !isCancelled && can(session.role, 'purchase.cancel') ? (
              <CancelPurchaseButton purchaseId={purchase.id} number={purchase.number} />
            ) : null}
            {(isDraft || isCancelled) && can(session.role, 'purchase.delete') ? (
              <DeleteButton
                action={async () => {
                  'use server'
                  return deletePurchase(purchase.id)
                }}
                title="Supprimer définitivement ?"
                description="Une facture d'achat validée doit être annulée plutôt que supprimée."
                redirectTo="/purchases"
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p>
            <div className="mt-2"><StatusBadge status={purchase.status} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Net à payer</p>
            <p className="tabular mt-1 text-xl font-semibold text-navy-800">
              {formatMoney(purchase.netToPay, purchase.currencyCode)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Réglé</p>
            <p className="tabular mt-1 text-xl font-semibold text-emerald-700">
              {formatMoney(purchase.paidAmount, purchase.currencyCode)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Solde dû</p>
            <p className="tabular mt-1 text-xl font-semibold text-amber-700">
              {formatMoney(purchase.balanceDue, purchase.currencyCode)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Lignes</CardTitle></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Désignation</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
                <TableHead className="text-right">P.U.</TableHead>
                <TableHead className="text-right">Remise</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{item.reference || '—'}</TableCell>
                  <TableCell className="font-medium">{item.designation}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">
                    {formatQuantity(item.quantity)} {item.unit}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right">
                    {formatMoney(item.unitPrice, purchase.currencyCode)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {gt(item.discountPercent, 0) ? `${formatQuantity(item.discountPercent)} %` : '—'}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-right font-medium">
                    {formatMoney(item.lineTotal, purchase.currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex justify-end px-5">
            <dl className="w-full max-w-sm space-y-1 text-sm">
              <div className="flex justify-between py-1">
                <dt className="text-muted-foreground">Total des lignes</dt>
                <dd className="tabular">{formatMoney(purchase.itemsTotal, purchase.currencyCode)}</dd>
              </div>
              {gt(purchase.shippingAmount, 0) ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">{purchase.shippingLabel}</dt>
                  <dd className="tabular">{formatMoney(purchase.shippingAmount, purchase.currencyCode)}</dd>
                </div>
              ) : null}
              {gt(purchase.otherFeesAmount, 0) ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">{purchase.otherFeesLabel}</dt>
                  <dd className="tabular">{formatMoney(purchase.otherFeesAmount, purchase.currencyCode)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-border py-1 pt-2">
                <dt className="text-muted-foreground">Total HT</dt>
                <dd className="tabular font-medium">{formatMoney(purchase.totalHt, purchase.currencyCode)}</dd>
              </div>
              {purchase.vatMode !== 'NONE' ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">TVA {formatQuantity(purchase.vatRate)} %</dt>
                  <dd className="tabular">{formatMoney(purchase.vatAmount, purchase.currencyCode)}</dd>
                </div>
              ) : null}
              {gt(purchase.stampDutyAmount, 0) ? (
                <div className="flex justify-between py-1">
                  <dt className="text-muted-foreground">{purchase.stampDutyLabel}</dt>
                  <dd className="tabular">{formatMoney(purchase.stampDutyAmount, purchase.currencyCode)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between rounded-md bg-navy-800 px-3 py-2 text-white">
                <dt className="font-medium">Net à payer</dt>
                <dd className="tabular font-semibold">{formatMoney(purchase.netToPay, purchase.currencyCode)}</dd>
              </div>
            </dl>
          </div>

          {purchase.notes ? (
            <p className="mx-5 mt-4 rounded-md border border-border bg-secondary/40 p-3 text-xs">{purchase.notes}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Règlements</CardTitle>
              <CardDescription>{purchase.payments.length} règlement(s) enregistré(s).</CardDescription>
            </div>
            {can(session.role, 'payment.write') && !isDraft && !isCancelled && gt(remaining, 0) ? (
              <PurchasePaymentDialog
                purchaseId={purchase.id}
                currencyCode={purchase.currencyCode}
                remaining={remaining}
              />
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {purchase.payments.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="Aucun règlement"
                description={isDraft ? 'Validez la facture pour enregistrer un règlement.' : undefined}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Méthode</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="w-1" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchase.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(payment.date)}</TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[payment.method]}</TableCell>
                      <TableCell className="text-muted-foreground">{payment.reference || '—'}</TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatMoney(payment.amount, payment.currencyCode)}
                      </TableCell>
                      <TableCell>
                        {can(session.role, 'payment.delete') ? (
                          <DeletePurchasePaymentButton paymentId={payment.id} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mouvements de stock générés</CardTitle>
            <CardDescription>Traçabilité des entrées produites par cette facture.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {movements.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="Aucun mouvement"
                description={
                  isDraft
                    ? 'Les entrées en stock seront créées à la validation de la facture.'
                    : 'Aucune ligne de cette facture n’est rattachée à un produit suivi en stock.'
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Stock après</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <Link href={`/products/${movement.product.id}`} className="text-primary hover:underline">
                          {movement.product.designation}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {MOVEMENT_LABELS[movement.type]}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right">
                        {formatQuantity(movement.quantity)} {movement.product.unit}
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap text-right font-medium">
                        {formatQuantity(movement.stockAfter)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Créée par {purchase.createdBy?.name ?? '—'} le {formatDateTime(purchase.createdAt)}
        {purchase.confirmedAt ? ` · validée le ${formatDateTime(purchase.confirmedAt)}` : ''}
        {purchase.cancelledAt ? ` · annulée le ${formatDateTime(purchase.cancelledAt)}` : ''}
      </p>
    </>
  )
}
