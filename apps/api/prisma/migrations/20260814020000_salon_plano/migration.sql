-- CreateTable
CREATE TABLE "SalonPlano" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "imagenUrl" TEXT,
    "ancho" INTEGER NOT NULL DEFAULT 900,
    "alto" INTEGER NOT NULL DEFAULT 520,
    "opacidad" INTEGER NOT NULL DEFAULT 100,
    "mostrarGrilla" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SalonPlano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaMesas" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL DEFAULT 'default',
    "nombre" TEXT NOT NULL DEFAULT 'Área',
    "x" INTEGER NOT NULL DEFAULT 20,
    "y" INTEGER NOT NULL DEFAULT 20,
    "ancho" INTEGER NOT NULL DEFAULT 240,
    "alto" INTEGER NOT NULL DEFAULT 180,

    CONSTRAINT "AreaMesas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AreaMesas_planoId_idx" ON "AreaMesas"("planoId");

-- AddForeignKey
ALTER TABLE "AreaMesas" ADD CONSTRAINT "AreaMesas_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "SalonPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
