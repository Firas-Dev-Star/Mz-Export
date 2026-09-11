-- Mouvements bancaires importes depuis les relevés, et leur rattachement aux
-- reglements.
--
-- POURQUOI. Les fournisseurs sont regles par ACOMPTES sur compte courant : 96 %
-- des virements sont des montants ronds qui ne correspondent a aucune facture
-- precise. Le rapprochement demande donc un arbitrage humain. Sans cette table,
-- ce travail se refaisait entierement a chaque fois, de memoire et sur des
-- relevés papier -- ce qui avait laisse 1,37 million de dinars de dettes
-- fictives dans la base.
--
-- L'empreinte `fingerprint` rend l'import IDEMPOTENT : reimporter le meme
-- releve, ou deux relevés qui se chevauchent, n'introduit aucun doublon.

CREATE TYPE "BankMovementStatus" AS ENUM ('PENDING', 'ATTRIBUTED', 'IGNORED');

CREATE TABLE "bank_movements" (
    "id"           TEXT NOT NULL,
    "bank"         TEXT NOT NULL,
    "date"         DATE NOT NULL,
    "valueDate"    DATE,
    "label"        TEXT NOT NULL,
    "reference"    TEXT NOT NULL DEFAULT '',
    "amount"       DECIMAL(18,3) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'TND',
    "fingerprint"  TEXT NOT NULL,
    "status"       "BankMovementStatus" NOT NULL DEFAULT 'PENDING',
    "category"     TEXT NOT NULL DEFAULT '',
    "note"         TEXT NOT NULL DEFAULT '',
    "importedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_movements_fingerprint_key" ON "bank_movements"("fingerprint");
CREATE INDEX "bank_movements_status_idx" ON "bank_movements"("status");
CREATE INDEX "bank_movements_date_idx" ON "bank_movements"("date");
CREATE INDEX "bank_movements_bank_idx" ON "bank_movements"("bank");

-- Rattachement des reglements au mouvement dont ils sont issus. Nullable :
-- une saisie manuelle reste possible et n'a pas de mouvement d'origine.
ALTER TABLE "purchase_payments"  ADD COLUMN "bankMovementId" TEXT;
ALTER TABLE "transport_payments" ADD COLUMN "bankMovementId" TEXT;

ALTER TABLE "purchase_payments"
  ADD CONSTRAINT "purchase_payments_bankMovementId_fkey"
  FOREIGN KEY ("bankMovementId") REFERENCES "bank_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transport_payments"
  ADD CONSTRAINT "transport_payments_bankMovementId_fkey"
  FOREIGN KEY ("bankMovementId") REFERENCES "bank_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
