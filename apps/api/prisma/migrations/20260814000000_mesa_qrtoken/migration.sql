-- AlterTable: token de autoservicio por mesa
ALTER TABLE "Mesa" ADD COLUMN "qrToken" TEXT;

-- Backfill de mesas existentes con un token único
UPDATE "Mesa" SET "qrToken" = gen_random_uuid()::text WHERE "qrToken" IS NULL;

-- Requerido + único
ALTER TABLE "Mesa" ALTER COLUMN "qrToken" SET NOT NULL;
CREATE UNIQUE INDEX "Mesa_qrToken_key" ON "Mesa"("qrToken");
