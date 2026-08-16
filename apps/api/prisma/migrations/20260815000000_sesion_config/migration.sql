-- CreateTable
CREATE TABLE "SesionConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "adminMin" INTEGER NOT NULL DEFAULT 5,
    "cajeroMin" INTEGER NOT NULL DEFAULT 30,
    "produccionMin" INTEGER NOT NULL DEFAULT 30,
    "mozoMin" INTEGER NOT NULL DEFAULT 0,
    "deliveryMin" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SesionConfig_pkey" PRIMARY KEY ("id")
);
