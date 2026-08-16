-- Zoom con el que se muestra el mapa público de la landing.
ALTER TABLE "ConfigContacto" ADD COLUMN IF NOT EXISTS "mapZoom" INTEGER;
