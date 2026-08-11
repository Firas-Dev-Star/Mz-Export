import { PageHeader } from '@/components/layout/page-header'
import { CompanyForm } from '@/components/settings/company-form'
import { DemoDataPanel } from '@/components/settings/demo-data-panel'
import { ExchangeRatesPanel } from '@/components/settings/exchange-rates-panel'
import { LogoUpload } from '@/components/settings/logo-upload'
import { SequenceForm } from '@/components/settings/sequence-form'
import { UsersPanel } from '@/components/settings/users-panel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { can, requirePermission } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { previewNextNumber } from '@/lib/numbering'
import { prisma } from '@/lib/prisma'
import { listRates } from '@/services/exchange.service'
import type { CompanyInput } from '@/validations/settings'

export const metadata = { title: 'Paramètres — MZ EXPORT' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await requirePermission('settings.read')
  const isAdmin = can(session.role, 'settings.write')

  const [company, sequence, preview, users, demoCounts, auditLogs, rates, currencies] = await Promise.all([
    prisma.company.findUnique({ where: { id: 'company' } }),
    prisma.invoiceSequence.findUnique({ where: { key: 'SALE' } }),
    previewNextNumber('SALE'),
    isAdmin
      ? prisma.user.findMany({
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
        })
      : Promise.resolve([]),
    Promise.all([
      prisma.invoice.count({ where: { isDemo: true } }),
      prisma.purchase.count({ where: { isDemo: true } }),
      prisma.customer.count({ where: { isDemo: true } }),
      prisma.supplier.count({ where: { isDemo: true } }),
      prisma.product.count({ where: { isDemo: true } }),
    ]),
    can(session.role, 'audit.read')
      ? prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
      : Promise.resolve([]),
    listRates(),
    prisma.currency.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { code: true, name: true },
    }),
  ])

  const companyValues: CompanyInput = {
    name: company?.name ?? 'MZ EXPORT SARL',
    legalForm: company?.legalForm ?? '',
    capital: String(company?.capital ?? '0'),
    capitalCurrency: company?.capitalCurrency ?? 'TND',
    taxId: company?.taxId ?? '',
    tradeRegister: company?.tradeRegister ?? '',
    activity: company?.activity ?? '',
    addressLine1: company?.addressLine1 ?? '',
    addressLine2: company?.addressLine2 ?? '',
    postalCode: company?.postalCode ?? '',
    city: company?.city ?? '',
    country: company?.country ?? '',
    phone: company?.phone ?? '',
    phone2: company?.phone2 ?? '',
    fax: company?.fax ?? '',
    email: company?.email ?? '',
    website: company?.website ?? '',
    bankName: company?.bankName ?? '',
    bankAgency: company?.bankAgency ?? '',
    bankAccount: company?.bankAccount ?? '',
    iban: company?.iban ?? '',
    swift: company?.swift ?? '',
    defaultCurrency: company?.defaultCurrency ?? 'EUR',
    defaultVatMode: company?.defaultVatMode ?? 'NONE',
    defaultVatRate: String(company?.defaultVatRate ?? '0'),
    defaultStampDuty: String(company?.defaultStampDuty ?? '0'),
    defaultStampLabel: company?.defaultStampLabel ?? 'Timbre fiscal',
    defaultPaymentTerms: company?.defaultPaymentTerms ?? '',
    defaultIncoterm: company?.defaultIncoterm ?? '',
    defaultOrigin: company?.defaultOrigin ?? '',
    headerNote: company?.headerNote ?? '',
    paymentNotice: company?.paymentNotice ?? '',
    legalMentions: company?.legalMentions ?? '',
    footerText: company?.footerText ?? '',
  }

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Société, facturation, numérotation, utilisateurs et journal d'audit."
      />

      {!isAdmin ? (
        <Card className="mb-4">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Consultation seule : seul un administrateur peut modifier ces paramètres.
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <div className="space-y-4">
          <LogoUpload current={company?.logoPath ?? ''} />
          <CompanyForm defaultValues={companyValues} />
          <SequenceForm
            preview={preview}
            defaultValues={{
              prefix: sequence?.prefix ?? '',
              suffix: sequence?.suffix ?? '',
              padding: sequence?.padding ?? 4,
              nextNumber: sequence?.nextNumber ?? 1,
              includeYear: sequence?.includeYear ?? false,
              resetYearly: sequence?.resetYearly ?? false,
            }}
          />
          <ExchangeRatesPanel rates={rates} currencies={currencies} canEdit={isAdmin} />
          <UsersPanel users={users} currentUserId={session.userId} />
          <DemoDataPanel
            counts={{
              invoices: demoCounts[0],
              purchases: demoCounts[1],
              customers: demoCounts[2],
              suppliers: demoCounts[3],
              products: demoCounts[4],
            }}
          />
        </div>
      ) : null}

      {auditLogs.length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Journal d&apos;audit</CardTitle>
            <CardDescription>30 dernières actions enregistrées.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entité</TableHead>
                  <TableHead>Référence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>{log.userEmail}</TableCell>
                    <TableCell className="font-medium">{log.action}</TableCell>
                    <TableCell className="text-muted-foreground">{log.entity}</TableCell>
                    <TableCell className="text-muted-foreground">{log.reference ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}
