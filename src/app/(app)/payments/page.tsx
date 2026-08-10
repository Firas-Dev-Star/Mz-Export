import Link from 'next/link'
import { CreditCard } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { ExportMenu } from '@/components/shared/export-menu'
import { Pagination } from '@/components/shared/pagination'
import { SearchToolbar } from '@/components/shared/search-toolbar'
import { DeletePaymentButton } from '@/components/payments/delete-payment-button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requireUser } from '@/lib/auth'
import { PAYMENT_METHOD_LABELS, formatDate, formatMoney } from '@/lib/format'
import { round } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export const metadata = { title: 'Paiements — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireUser()
  const params = await searchParams
  const get = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined)

  const page = Math.max(1, Number(get('page') ?? 1))
  const perPage = 25
  const search = get('q')?.trim()
  const method = get('method')

  const where: Prisma.PaymentWhereInput = {}
  if (method) where.method = method as Prisma.PaymentWhereInput['method']
  if (search) {
    where.OR = [
      { reference: { contains: search, mode: 'insensitive' } },
      { note: { contains: search, mode: 'insensitive' } },
      { invoice: { number: { contains: search, mode: 'insensitive' } } },
      { invoice: { customer: { companyName: { contains: search, mode: 'insensitive' } } } },
    ]
  }

  const [items, total, sums] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        invoice: { select: { id: true, number: true, customer: { select: { id: true, companyName: true } } } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({ by: ['currencyCode'], where, _sum: { amount: true } }),
  ])

  return (
    <>
      <PageHeader
        title="Paiements"
        description="Tous les règlements enregistrés sur les factures de vente."
        actions={<ExportMenu />}
      />

      <SearchToolbar
        placeholder="Facture, client, référence…"
        filters={[
          {
            name: 'method',
            label: 'Toutes les méthodes',
            options: Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
      />

      {sums.length > 0 ? (
        <div className="no-print mb-4 flex flex-wrap gap-4">
          {sums.map((s) => (
            <Card key={s.currencyCode} className="min-w-[220px] flex-1">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total encaissé ({s.currencyCode})</p>
                <p className="tabular mt-1 text-xl font-semibold text-emerald-700">
                  {formatMoney(round(s._sum.amount, 2).toFixed(2), s.currencyCode)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="Aucun règlement"
              description="Les règlements s'enregistrent depuis la fiche d'une facture confirmée."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="w-1" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(payment.date)}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/invoices/${payment.invoice.id}`} className="text-primary hover:underline">
                        {payment.invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      <Link href={`/customers/${payment.invoice.customer.id}`} className="hover:underline">
                        {payment.invoice.customer.companyName}
                      </Link>
                    </TableCell>
                    <TableCell>{PAYMENT_METHOD_LABELS[payment.method]}</TableCell>
                    <TableCell className="text-muted-foreground">{payment.reference || '—'}</TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-medium">
                      {formatMoney(payment.amount, payment.currencyCode)}
                    </TableCell>
                    <TableCell>
                      {can(session.role, 'payment.delete') ? <DeletePaymentButton paymentId={payment.id} /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / perPage))} total={total} />
        </CardContent>
      </Card>
    </>
  )
}
