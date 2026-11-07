-- Venta por mostrador: productos que se cobran por peso además de por unidad.

CREATE TYPE "UnidadVenta" AS ENUM ('UNIDAD', 'KG');

ALTER TABLE "Producto"
  ADD COLUMN "unidadVenta" "UnidadVenta" NOT NULL DEFAULT 'UNIDAD';

-- La cantidad pasa a admitir decimales (0,350 kg). Es una ampliación del tipo:
-- los enteros que ya existen quedan igual.
ALTER TABLE "PedidoItem"
  ALTER COLUMN "cantidad" TYPE DECIMAL(12,3);
