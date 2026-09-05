-- Incoterm habituel d'un client, repris sur ses nouvelles factures.
--
-- POURQUOI. Certains clients enlevent la marchandise eux-memes (EXW) : aucun
-- transport n'est alors a notre charge, et l'absence de facture de
-- transporteur sur leur expedition est normale. Sans ce champ, la regle vivait
-- dans la memoire de celui qui saisit, et le rapprochement transport / ventes
-- signalait un oubli qui n'en etait pas un.
--
-- Colonne additive, valeur par defaut vide : aucune donnee existante touchee.
ALTER TABLE "customers" ADD COLUMN "defaultIncoterm" TEXT NOT NULL DEFAULT '';
