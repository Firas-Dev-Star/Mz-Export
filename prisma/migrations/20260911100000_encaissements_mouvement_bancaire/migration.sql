-- Rattache un encaissement client au mouvement bancaire dont il est issu.
--
-- La premiere migration n'avait couvert que les reglements fournisseurs et
-- transport. Sans cette colonne, une attribution erronee sur une facture
-- client ne pourrait pas etre defaite : la remise a traiter n'aurait aucun
-- moyen de retrouver les encaissements qu'elle a crees.
ALTER TABLE "payments" ADD COLUMN "bankMovementId" TEXT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_bankMovementId_fkey"
  FOREIGN KEY ("bankMovementId") REFERENCES "bank_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
