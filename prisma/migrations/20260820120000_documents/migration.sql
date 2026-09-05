-- Pieces jointes : documents originaux recus de tiers (facture fournisseur
-- scannee, bon de livraison du transporteur, facture de transport, justificatif
-- de reglement, piece douaniere).
--
-- Aucune donnee existante n'est touchee : une table nouvelle, trois cles
-- etrangeres, aucune colonne modifiee ou supprimee.

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('SUPPLIER_INVOICE', 'DELIVERY_NOTE', 'TRANSPORT_INVOICE', 'PAYMENT_PROOF', 'CUSTOMS', 'OTHER');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "purchaseId" TEXT,
    "invoiceId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_purchaseId_idx" ON "documents"("purchaseId");

-- CreateIndex
CREATE INDEX "documents_invoiceId_idx" ON "documents"("invoiceId");

-- CreateIndex
CREATE INDEX "documents_kind_idx" ON "documents"("kind");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un document est rattache soit a un achat, soit a une vente, jamais aux deux
-- ni a aucun des deux. Prisma ne sait pas exprimer cette contrainte : elle est
-- posee ici pour que la base la garantisse quoi qu'il arrive cote application.
ALTER TABLE "documents" ADD CONSTRAINT "documents_one_parent_chk"
  CHECK (
    ("purchaseId" IS NOT NULL AND "invoiceId" IS NULL)
    OR
    ("purchaseId" IS NULL AND "invoiceId" IS NOT NULL)
  );
