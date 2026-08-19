-- Desglose de IVA en la venta.
-- Los precios se cargan con IVA incluido, así que estos montos salen de
-- adentro del total; no lo aumentan. Se guardan con la venta para que un
-- cambio de tasa posterior no altere lo que ya se cobró y facturó.

ALTER TABLE "Pedido"
  ADD COLUMN IF NOT EXISTS "neto"           DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ivaTotal"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netoIvaMinima"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ivaMinima"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netoIvaBasica"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ivaBasica"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "montoNoGravado" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "PedidoItem"
  ADD COLUMN IF NOT EXISTS "ivaRate"  "IvaRate"     NOT NULL DEFAULT 'MINIMA',
  ADD COLUMN IF NOT EXISTS "neto"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ivaMonto" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Definiciones fiscales que decide el contador, no el código.
CREATE TABLE IF NOT EXISTS "FiscalConfig" (
  "id"                    TEXT PRIMARY KEY DEFAULT 'default',
  "preciosConIvaIncluido" BOOLEAN NOT NULL DEFAULT true,
  "salonTasaBasica"       BOOLEAN NOT NULL DEFAULT false,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "FiscalConfig" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;
