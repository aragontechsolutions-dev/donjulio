-- Productos que se venden de lo producido: la venta descuenta de los lotes.
ALTER TABLE "Producto" ADD COLUMN IF NOT EXISTS "controlaStock" BOOLEAN NOT NULL DEFAULT false;
