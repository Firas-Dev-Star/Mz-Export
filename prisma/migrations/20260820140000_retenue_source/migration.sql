-- Retenue a la source sur les factures d'achat.
--
-- Obligation declarative tunisienne, relevee dans la colonne « RETENU » du
-- suivi Excel (1 % du montant chez la plupart des fournisseurs, nulle chez
-- d'autres).
--
-- La retenue NE REDUIT PAS le net a payer : la charge reste le montant
-- facture. Elle est prelevee au reglement — le fournisseur percoit
-- `netToPay - withholdingAmount`, le solde est reverse a l'administration.
-- Aucun calcul de totaux existant n'est donc modifie.
--
-- Purement additif : deux colonnes avec valeur par defaut.

ALTER TABLE "purchases" ADD COLUMN "withholdingLabel" TEXT NOT NULL DEFAULT 'Retenue à la source';
ALTER TABLE "purchases" ADD COLUMN "withholdingAmount" DECIMAL(18,3) NOT NULL DEFAULT 0;
