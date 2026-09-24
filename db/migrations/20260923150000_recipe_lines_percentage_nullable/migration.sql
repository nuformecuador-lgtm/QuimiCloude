-- Relajacion pura: `percentage` pasa a admitir NULL para lineas de MACHINE y
-- PACKAGING (las de PRODUCT lo siguen exigiendo, pero esa regla vive en el servicio,
-- no en la columna). Sin vaciado ni DEFAULT: las filas existentes conservan su valor.
--
-- El CHECK `recipe_lines_percentage_range` NO se toca: en Postgres un CHECK sobre NULL
-- no es FALSE, asi que el NULL ya pasa sin modificarlo. Parentesis de RLS como en
-- `20260922160000_recipe_lines_percentage` (la tabla lleva RLS forzada sin policies).

ALTER TABLE "recipe_lines" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "recipe_lines" ALTER COLUMN "percentage" DROP NOT NULL;

ALTER TABLE "recipe_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines" FORCE  ROW LEVEL SECURITY;
