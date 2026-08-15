-- CreateEnum
CREATE TYPE "ReservaStatus" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'SENTADA', 'CANCELADA', 'NO_SHOW');

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "mesaId" TEXT,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "personas" INTEGER NOT NULL DEFAULT 2,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "status" "ReservaStatus" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reserva_fechaHora_idx" ON "Reserva"("fechaHora");
CREATE INDEX "Reserva_status_idx" ON "Reserva"("status");
CREATE INDEX "Reserva_mesaId_idx" ON "Reserva"("mesaId");

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
