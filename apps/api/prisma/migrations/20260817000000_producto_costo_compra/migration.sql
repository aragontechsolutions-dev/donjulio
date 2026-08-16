-- Costo de compra de los productos de reventa (los elaborados lo sacan de la receta).
ALTER TABLE "Producto" ADD COLUMN IF NOT EXISTS "costoCompra" DECIMAL(12,4);
