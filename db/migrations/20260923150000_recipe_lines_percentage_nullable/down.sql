-- Vuelta a NOT NULL rellenando con 0 los NULL que haya (decision del humano:
-- el DOWN fabrica el dato en vez de fallar). El 0 NO cumple
-- `recipe_lines_percentage_range` (`percentage > 0`), asi que el CHECK se retira
-- primero: este DOWN deja la columna NOT NULL con 0s fabricados y SIN el check de
-- rango, y diverge a proposito del estado previo al UP. Re-poner el CHECK con esos
-- 0s dentro lo rechaza; hay que corregirlos a mano antes.

ALTER TABLE "recipe_lines" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "recipe_lines" DROP CONSTRAINT "recipe_lines_percentage_range";

UPDATE "recipe_lines" SET "percentage" = 0 WHERE "percentage" IS NULL;

ALTER TABLE "recipe_lines" ALTER COLUMN "percentage" SET NOT NULL;

ALTER TABLE "recipe_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines" FORCE  ROW LEVEL SECURITY;
