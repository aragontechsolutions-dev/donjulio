-- AlterTable: dispositivo autorizado y tolerancia del kiosco
ALTER TABLE "KioscoFichaje" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "deviceNombre" TEXT,
ADD COLUMN     "deviceUltimoUso" TIMESTAMP(3),
ADD COLUMN     "vinculacionHasta" TIMESTAMP(3),
ADD COLUMN     "toleranciaMin" INTEGER NOT NULL DEFAULT 10;

-- AlterTable: comparación del fichaje contra el horario previsto
ALTER TABLE "Shift" ADD COLUMN     "minutosTarde" INTEGER,
ADD COLUMN     "minutosAntes" INTEGER,
ADD COLUMN     "horarioInicio" TEXT,
ADD COLUMN     "horarioFin" TEXT;

-- CreateTable
CREATE TABLE "HorarioTrabajo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,

    CONSTRAINT "HorarioTrabajo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HorarioTrabajo_usuarioId_idx" ON "HorarioTrabajo"("usuarioId");
CREATE UNIQUE INDEX "HorarioTrabajo_usuarioId_diaSemana_key" ON "HorarioTrabajo"("usuarioId", "diaSemana");

-- AddForeignKey
ALTER TABLE "HorarioTrabajo" ADD CONSTRAINT "HorarioTrabajo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
