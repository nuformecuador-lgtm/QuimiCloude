-- Escrita a mano (patrón de db/migrations/*): RLS forzada en dos pasos para que
-- los triggers y el RLS de product_batches vean los cambios de forma atómica.
-- `presentation_id` y `unit_cost` pasan a ser anulables; la validación de
-- obligatoriedad vive en la capa de dominio (product-input.ts), no en el esquema.
ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "product_batches" ALTER COLUMN "presentation_id" DROP NOT NULL;
ALTER TABLE "product_batches" ALTER COLUMN "unit_cost" DROP NOT NULL;

ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;
