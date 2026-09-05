-- Domiciliation bancaire sur les factures de vente, et nature du fournisseur.
--
-- Purement additif : deux colonnes avec valeur par defaut, un type enum, un
-- index. Aucune colonne existante modifiee, aucun calcul touche.
--
-- La domiciliation n'est PAS unique : dans le suivi MZ EXPORT, le numero
-- 1821140 porte deux factures du meme client a la meme date. Une contrainte
-- d'unicite rejetterait des donnees legitimes.

-- CreateEnum
CREATE TYPE "SupplierNature" AS ENUM ('FOUTA', 'TRANSPORT', 'DIVERS');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "domiciliationRef" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "nature" "SupplierNature" NOT NULL DEFAULT 'DIVERS';

-- CreateIndex
CREATE INDEX "invoices_domiciliationRef_idx" ON "invoices"("domiciliationRef");
