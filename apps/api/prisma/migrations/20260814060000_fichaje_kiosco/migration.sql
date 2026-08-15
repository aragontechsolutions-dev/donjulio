-- AlterTable: número de empleado correlativo + PIN de fichaje
ALTER TABLE "Usuario" ADD COLUMN "numeroEmpleado" SERIAL;
ALTER TABLE "Usuario" ADD COLUMN "pinHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_numeroEmpleado_key" ON "Usuario"("numeroEmpleado");

-- CreateTable
CREATE TABLE "KioscoFichaje" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "token" TEXT NOT NULL,

    CONSTRAINT "KioscoFichaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KioscoFichaje_token_key" ON "KioscoFichaje"("token");
