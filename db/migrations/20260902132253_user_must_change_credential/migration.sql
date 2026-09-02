-- QC-6: marca de "debe cambiar la contrasena la primera vez que entre".
-- Aditiva: no toca ninguna columna, indice, restriccion ni fila existente.
ALTER TABLE "users" ADD COLUMN "must_change_credential" BOOLEAN NOT NULL DEFAULT false;
