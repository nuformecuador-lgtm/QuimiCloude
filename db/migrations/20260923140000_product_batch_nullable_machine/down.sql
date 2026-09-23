-- Reversa: re-afirma NOT NULL. Falla con error si quedan filas con NULL
-- (p. ej. lotes de MACHINE creados con la columna anulable): esa es la
-- guarda correcta, no borrar datos en una reversa.
ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "product_batches" ALTER COLUMN "presentation_id" SET NOT NULL;
ALTER TABLE "product_batches" ALTER COLUMN "unit_cost" SET NOT NULL;

ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;
