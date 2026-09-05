-- Module TRANSPORT : les societes de transport sortent des fournisseurs.
--
-- POURQUOI. Un transporteur ne vend pas de marchandise : rien n'entre en stock,
-- et sa facture ne se comprend qu'attachee a une expedition, donc a une facture
-- de vente. Melangee aux fournisseurs de fouta, elle faussait la liste des
-- fournisseurs et la ventilation du resultat.
--
-- Cette migration est purement STRUCTURELLE : trois tables nouvelles, une
-- colonne ajoutee a `documents`, une sequence de numerotation. Aucune donnee
-- existante n'est modifiee ni supprimee. Le deplacement des factures de
-- transport deja saisies est fait separement, par un script verifiable
-- (scripts/migrer-transport-vers-module.ts).

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "transportInvoiceId" TEXT;

-- CreateTable
CREATE TABLE "carriers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'Tunisie',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "taxId" TEXT NOT NULL DEFAULT '',
    "tradeRegister" TEXT NOT NULL DEFAULT '',
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "currencyCode" TEXT NOT NULL DEFAULT 'TND',
    "notes" TEXT NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "carrierReference" TEXT NOT NULL DEFAULT '',
    "carrierId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "shipmentRef" TEXT NOT NULL DEFAULT '',
    "invoiceId" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'TND',
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "transportLabel" TEXT NOT NULL DEFAULT 'Transport',
    "transportAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "transitLabel" TEXT NOT NULL DEFAULT 'Transit et douane',
    "transitAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "otherFeesLabel" TEXT NOT NULL DEFAULT 'Autres frais',
    "otherFeesAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "vatMode" "VatMode" NOT NULL DEFAULT 'NONE',
    "vatRate" DECIMAL(6,3) NOT NULL DEFAULT 19,
    "stampDutyLabel" TEXT NOT NULL DEFAULT 'Timbre fiscal',
    "stampDutyAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalHt" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalTtc" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netToPay" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "exchangeRateTnd" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "netToPayTnd" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "paidAmountTnd" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "balanceDueTnd" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_payments" (
    "id" TEXT NOT NULL,
    "transportInvoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'TND',
    "date" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carriers_code_key" ON "carriers"("code");

-- CreateIndex
CREATE INDEX "carriers_companyName_idx" ON "carriers"("companyName");

-- CreateIndex
CREATE UNIQUE INDEX "transport_invoices_number_key" ON "transport_invoices"("number");

-- CreateIndex
CREATE INDEX "transport_invoices_carrierId_idx" ON "transport_invoices"("carrierId");

-- CreateIndex
CREATE INDEX "transport_invoices_invoiceId_idx" ON "transport_invoices"("invoiceId");

-- CreateIndex
CREATE INDEX "transport_invoices_status_idx" ON "transport_invoices"("status");

-- CreateIndex
CREATE INDEX "transport_invoices_date_idx" ON "transport_invoices"("date");

-- CreateIndex
CREATE INDEX "transport_invoices_shipmentRef_idx" ON "transport_invoices"("shipmentRef");

-- CreateIndex
CREATE INDEX "transport_payments_transportInvoiceId_idx" ON "transport_payments"("transportInvoiceId");

-- CreateIndex
CREATE INDEX "transport_payments_date_idx" ON "transport_payments"("date");

-- CreateIndex
CREATE INDEX "documents_transportInvoiceId_idx" ON "documents"("transportInvoiceId");

-- AddForeignKey
ALTER TABLE "carriers" ADD CONSTRAINT "carriers_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_payments" ADD CONSTRAINT "transport_payments_transportInvoiceId_fkey" FOREIGN KEY ("transportInvoiceId") REFERENCES "transport_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_payments" ADD CONSTRAINT "transport_payments_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_payments" ADD CONSTRAINT "transport_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_transportInvoiceId_fkey" FOREIGN KEY ("transportInvoiceId") REFERENCES "transport_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Un document a EXACTEMENT un parent : achat, vente, ou facture de transport.
-- L'ancienne contrainte n'en connaissait que deux : elle est remplacee.
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_one_parent_chk";
ALTER TABLE "documents" ADD CONSTRAINT "documents_one_parent_chk"
  CHECK (
    (CASE WHEN "purchaseId"         IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "invoiceId"          IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "transportInvoiceId" IS NULL THEN 0 ELSE 1 END)
    = 1
  );

-- Sequence de numerotation des factures de transport. `ON CONFLICT DO NOTHING`
-- pour que la migration reste rejouable sans effet de bord.
INSERT INTO "invoice_sequences"
  ("id", "key", "label", "prefix", "suffix", "padding", "nextNumber",
   "resetYearly", "year", "includeYear", "createdAt", "updatedAt")
VALUES
  ('seq_transport', 'TRANSPORT', 'Factures de transport', 'TRP-', '', 4, 1,
   false, NULL, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
