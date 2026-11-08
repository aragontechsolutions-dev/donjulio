-- Proveedores con ficha completa, los rubros que se les compran y el
-- proveedor de cada producto.

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "proveedorId" TEXT;

-- AlterTable
ALTER TABLE "Proveedor" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "rut" TEXT,
-- Con DEFAULT para no romper si ya hay proveedores cargados; el valor en
-- cada update lo pone Prisma (@updatedAt).
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "_CategoriaToProveedor" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CategoriaToProveedor_AB_unique" ON "_CategoriaToProveedor"("A", "B");

-- CreateIndex
CREATE INDEX "_CategoriaToProveedor_B_index" ON "_CategoriaToProveedor"("B");

-- CreateIndex
CREATE INDEX "Producto_proveedorId_idx" ON "Producto"("proveedorId");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoriaToProveedor" ADD CONSTRAINT "_CategoriaToProveedor_A_fkey" FOREIGN KEY ("A") REFERENCES "Categoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoriaToProveedor" ADD CONSTRAINT "_CategoriaToProveedor_B_fkey" FOREIGN KEY ("B") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
