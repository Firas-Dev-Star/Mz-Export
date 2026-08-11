-- Multi-devises et conversion vers le dinar tunisien.
--
-- Cette migration est NON DESTRUCTIVE : elle ajoute des colonnes et une table,
-- sans jamais modifier un montant existant.

-- ---------------------------------------------------------------------------
-- 1. Devises supplementaires
-- ---------------------------------------------------------------------------

INSERT INTO "currencies" ("code", "name", "symbol", "decimals", "isActive")
VALUES
  ('USD', 'Dollar americain', '$', 2, true),
  ('GBP', 'Livre sterling',   '£', 2, true)
ON CONFLICT ("code") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Table des taux de change de reference
-- ---------------------------------------------------------------------------

CREATE TABLE "exchange_rates" (
  "id"           TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "rateToTnd"    DECIMAL(18,6) NOT NULL,
  "validFrom"    DATE NOT NULL,
  "source"       TEXT NOT NULL DEFAULT '',
  "note"         TEXT NOT NULL DEFAULT '',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exchange_rates_currencyCode_validFrom_key"
  ON "exchange_rates" ("currencyCode", "validFrom");

CREATE INDEX "exchange_rates_currencyCode_validFrom_idx"
  ON "exchange_rates" ("currencyCode", "validFrom");

ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "exchange_rates_currencyCode_fkey"
  FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Taux fige et contrevaleurs sur les factures de vente
-- ---------------------------------------------------------------------------

ALTER TABLE "invoices"
  ADD COLUMN "exchangeRateTnd" DECIMAL(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN "netToPayTnd"     DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "paidAmountTnd"   DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "balanceDueTnd"   DECIMAL(18,3) NOT NULL DEFAULT 0;

-- Factures deja en dinars : le taux vaut 1, la contrevaleur egale le montant.
UPDATE "invoices"
SET "netToPayTnd"   = "netToPay",
    "paidAmountTnd" = "paidAmount",
    "balanceDueTnd" = "balanceDue"
WHERE "currencyCode" = 'TND';

-- Factures en devise : on met deliberement le taux a 0 (= "non converti")
-- plutot que de laisser 1, qui ferait passer 1 EUR pour 1 TND dans les bilans.
-- Ces factures sont signalees dans le tableau de bord tant qu'un taux n'a pas
-- ete saisi manuellement sur chacune.
UPDATE "invoices"
SET "exchangeRateTnd" = 0
WHERE "currencyCode" <> 'TND';

-- Index de la requete "factures en retard" (status + dueDate).
CREATE INDEX "invoices_status_dueDate_idx" ON "invoices" ("status", "dueDate");

-- ---------------------------------------------------------------------------
-- 4. Memes colonnes sur les achats
-- ---------------------------------------------------------------------------

ALTER TABLE "purchases"
  ADD COLUMN "exchangeRateTnd" DECIMAL(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN "netToPayTnd"     DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "paidAmountTnd"   DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "balanceDueTnd"   DECIMAL(18,3) NOT NULL DEFAULT 0;

-- Les achats sont libelles en dinars : la contrevaleur est le montant lui-meme.
UPDATE "purchases"
SET "netToPayTnd"   = "netToPay",
    "paidAmountTnd" = "paidAmount",
    "balanceDueTnd" = "balanceDue"
WHERE "currencyCode" = 'TND';

UPDATE "purchases"
SET "exchangeRateTnd" = 0
WHERE "currencyCode" <> 'TND';
