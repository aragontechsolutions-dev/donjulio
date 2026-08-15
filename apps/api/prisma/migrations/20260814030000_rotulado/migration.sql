-- CreateTable
CREATE TABLE "RotuladoProducto" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "porcion" TEXT,
    "ingredientes" TEXT,
    "alergenos" TEXT,
    "esLiquido" BOOLEAN NOT NULL DEFAULT false,
    "energiaKcal" DECIMAL(10,2),
    "proteinas" DECIMAL(10,2),
    "carbohidratos" DECIMAL(10,2),
    "azucares" DECIMAL(10,2),
    "grasasTotales" DECIMAL(10,2),
    "grasasSaturadas" DECIMAL(10,2),
    "grasasTrans" DECIMAL(10,2),
    "fibra" DECIMAL(10,2),
    "sodioMg" DECIMAL(10,2),
    "autoOctogonos" BOOLEAN NOT NULL DEFAULT true,
    "excesoAzucares" BOOLEAN NOT NULL DEFAULT false,
    "excesoSodio" BOOLEAN NOT NULL DEFAULT false,
    "excesoGrasas" BOOLEAN NOT NULL DEFAULT false,
    "excesoGrasasSat" BOOLEAN NOT NULL DEFAULT false,
    "contieneEdulcorantes" BOOLEAN NOT NULL DEFAULT false,
    "contieneCafeina" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RotuladoProducto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RotuladoProducto_productoId_key" ON "RotuladoProducto"("productoId");

-- AddForeignKey
ALTER TABLE "RotuladoProducto" ADD CONSTRAINT "RotuladoProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
