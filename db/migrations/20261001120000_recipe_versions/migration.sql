-- Una version de receta es una fila de `recipes` con `parent_recipe_id` no nulo. Todas las filas
-- existentes quedan como originales (columna a NULL). Sin DML.

ALTER TABLE "recipes" ADD COLUMN "parent_recipe_id" UUID;

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_parent_recipe_id_fkey"
  FOREIGN KEY ("parent_recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_parent_not_self"
  CHECK ("parent_recipe_id" IS NULL OR "parent_recipe_id" <> "id");

-- Con el indice anterior, una version llamada como otra original de la empresa chocaria con ella:
-- se parte en dos indices parciales disjuntos, uno por ambito. El nombre se conserva.
DROP INDEX "recipes_company_name_unique";
CREATE UNIQUE INDEX "recipes_company_name_unique"
  ON "recipes" ("company_id", "name_normalized")
  WHERE "deleted_at" IS NULL AND "parent_recipe_id" IS NULL;

-- Tambien sirve de indice para "versiones vivas de una original": por eso no hay otro de
-- `parent_recipe_id` suelto.
CREATE UNIQUE INDEX "recipes_version_name_unique"
  ON "recipes" ("parent_recipe_id", "name_normalized")
  WHERE "deleted_at" IS NULL AND "parent_recipe_id" IS NOT NULL;
