-- CreateTable
CREATE TABLE "Silla" (
    "id" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nombre" TEXT,
    "posX" INTEGER NOT NULL DEFAULT 0,
    "posY" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Silla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Silla_mesaId_idx" ON "Silla"("mesaId");

-- AddForeignKey
ALTER TABLE "Silla" ADD CONSTRAINT "Silla_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PedidoItem" ADD COLUMN     "sillaId" TEXT,
ADD COLUMN     "pagado" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PedidoItem_sillaId_idx" ON "PedidoItem"("sillaId");

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_sillaId_fkey" FOREIGN KEY ("sillaId") REFERENCES "Silla"("id") ON DELETE SET NULL ON UPDATE CASCADE;
