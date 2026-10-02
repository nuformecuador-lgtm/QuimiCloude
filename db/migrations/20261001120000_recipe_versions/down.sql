-- Aborta si hay alguna version guardada: sin la columna, cada version pasaria a ser una original
-- suelta (quiza con un nombre que choca con otra) y sus pedidos perderian el vinculo. Tampoco se
-- pueden borrar: `orders` las referencia con RESTRICT.
DO $$
DECLARE
  versions_count bigint;
BEGIN
  SELECT count(*) INTO versions_count FROM "recipes" WHERE "parent_recipe_id" IS NOT NULL;

  IF versions_count > 0 THEN
    RAISE EXCEPTION
      'recipe_versions: hay % version(es) de receta guardada(s) en `recipes`. Sin la columna `parent_recipe_id` pasarian a ser recetas originales sueltas y los pedidos que las usan perderian el vinculo con su original, asi que la reversion se detiene ENTERA y no cambia nada. Localizalas con: SELECT id, parent_recipe_id, name FROM recipes WHERE parent_recipe_id IS NOT NULL; y resuelvelas a mano antes de volver a revertir.',
      versions_count;
  END IF;
END $$;

DROP INDEX "recipes_version_name_unique";
DROP INDEX "recipes_company_name_unique";
CREATE UNIQUE INDEX "recipes_company_name_unique"
  ON "recipes" ("company_id", "name_normalized")
  WHERE "deleted_at" IS NULL;

ALTER TABLE "recipes" DROP CONSTRAINT "recipes_parent_not_self";
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_parent_recipe_id_fkey";
ALTER TABLE "recipes" DROP COLUMN "parent_recipe_id";
