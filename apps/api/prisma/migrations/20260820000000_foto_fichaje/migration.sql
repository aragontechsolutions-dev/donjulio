-- Foto del trabajador al marcar entrada/salida en el tablet.
ALTER TABLE "Shift"
  ADD COLUMN "fotoEntradaUrl" TEXT,
  ADD COLUMN "fotoSalidaUrl"  TEXT,
  ADD COLUMN "fotoToken"      TEXT,
  ADD COLUMN "fotoTokenExp"   TIMESTAMP(3);

-- El permiso de subida es de un solo uso: no puede repetirse entre turnos.
CREATE UNIQUE INDEX "Shift_fotoToken_key" ON "Shift"("fotoToken");

-- Se puede apagar si el tablet no tiene cámara.
ALTER TABLE "KioscoFichaje"
  ADD COLUMN "pedirFoto" BOOLEAN NOT NULL DEFAULT true;
