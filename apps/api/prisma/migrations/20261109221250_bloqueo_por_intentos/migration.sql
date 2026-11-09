-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "bloqueadaEn" TIMESTAMP(3),
ADD COLUMN     "intentosFallidos" INTEGER NOT NULL DEFAULT 0;
