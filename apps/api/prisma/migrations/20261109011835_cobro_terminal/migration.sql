-- CreateEnum
CREATE TYPE "EstadoCobroTerminal" AS ENUM ('PENDIENTE', 'ENVIADO', 'APROBADO', 'RECHAZADO', 'CANCELADO', 'EXPIRADO', 'ERROR');

-- CreateTable
CREATE TABLE "CobroTerminal" (
    "id" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo" "PaymentMethod" NOT NULL,
    "estado" "EstadoCobroTerminal" NOT NULL DEFAULT 'PENDIENTE',
    "detalle" TEXT,
    "carrito" JSONB NOT NULL,
    "rutReceptor" TEXT,
    "pedidoId" TEXT,
    "cashSessionId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resueltoEn" TIMESTAMP(3),

    CONSTRAINT "CobroTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CobroTerminal_externalId_key" ON "CobroTerminal"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CobroTerminal_idempotencyKey_key" ON "CobroTerminal"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CobroTerminal_pedidoId_key" ON "CobroTerminal"("pedidoId");

-- CreateIndex
CREATE INDEX "CobroTerminal_estado_idx" ON "CobroTerminal"("estado");

-- CreateIndex
CREATE INDEX "CobroTerminal_cashSessionId_idx" ON "CobroTerminal"("cashSessionId");

-- CreateIndex
CREATE INDEX "CobroTerminal_createdAt_idx" ON "CobroTerminal"("createdAt");

-- AddForeignKey
ALTER TABLE "CobroTerminal" ADD CONSTRAINT "CobroTerminal_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CobroTerminal" ADD CONSTRAINT "CobroTerminal_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CobroTerminal" ADD CONSTRAINT "CobroTerminal_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
