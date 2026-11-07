-- De una línea de caja se tiene que poder llegar a qué se vendió.
ALTER TABLE "CashMovement" ADD COLUMN "pedidoId" TEXT;

CREATE INDEX "CashMovement_pedidoId_idx" ON "CashMovement"("pedidoId");

ALTER TABLE "CashMovement"
  ADD CONSTRAINT "CashMovement_pedidoId_fkey"
  FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
