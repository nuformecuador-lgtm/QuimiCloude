-- Escrita a mano, como `20260918130000_product_unit_and_stored_stock`: la tabla lleva RLS forzada
-- sin policies y el DELETE de esta migracion tiene que verse a si mismo, no ser filtrado por ella.

-- ---------------------------------------------------------------------------------------
-- 1. Parentesis de RLS.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipe_lines" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 2. Vaciado. No toca "recipes": nombre, descripcion, imagen, pasos, empresa, autoria,
-- "updated_at" y "deleted_at" quedan como estaban.
-- ---------------------------------------------------------------------------------------
DELETE FROM "recipe_lines";

-- ---------------------------------------------------------------------------------------
-- 3. Fuera la unidad.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipe_lines" DROP CONSTRAINT "recipe_lines_unit_id_fkey";
DROP INDEX "recipe_lines_unit_id_idx";
ALTER TABLE "recipe_lines" DROP COLUMN "unit_id";

-- ---------------------------------------------------------------------------------------
-- 4. Fuera la cantidad.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipe_lines" DROP CONSTRAINT "recipe_lines_quantity_positive";
ALTER TABLE "recipe_lines" DROP COLUMN "quantity";

-- ---------------------------------------------------------------------------------------
-- 5. El porcentaje. Sin DEFAULT: legal porque la tabla esta vacia (paso 2).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipe_lines" ADD COLUMN "percentage" DECIMAL(5,2) NOT NULL;

ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_percentage_range"
  CHECK ("percentage" > 0 AND "percentage" <= 100);

-- ---------------------------------------------------------------------------------------
-- 6. Cierre del parentesis.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipe_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines" FORCE  ROW LEVEL SECURITY;
