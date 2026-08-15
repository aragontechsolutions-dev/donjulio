-- AlterTable: enlaza cada movimiento con el lote de insumo (trazabilidad)
ALTER TABLE "MovimientoStock" ADD COLUMN     "insumoLoteId" TEXT;

-- CreateIndex
CREATE INDEX "MovimientoStock_insumoLoteId_idx" ON "MovimientoStock"("insumoLoteId");

-- AddForeignKey
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_insumoLoteId_fkey" FOREIGN KEY ("insumoLoteId") REFERENCES "InsumoLote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
