-- Escrita a mano: la FK compuesta hacia `products` es drift (el padre es de otro modulo) y el
-- CHECK se reescribe con el mismo nombre. Se aplica con `pnpm run db:migrate`.

-- ---------------------------------------------------------------------------------------
-- 1. products: un envase puede llevar su presentacion fija. Los envases anteriores siguen
-- sin ella, asi que la obligatoriedad vive en la aplicacion y aqui solo se permite.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products" DROP CONSTRAINT "products_finished_identity_matches_type";
ALTER TABLE "products" ADD CONSTRAINT "products_finished_identity_matches_type" CHECK (
  ("type" = 'FINISHED_PRODUCT') = ("recipe_id" IS NOT NULL)
  AND ("type" <> 'FINISHED_PRODUCT' OR "presentation_id" IS NOT NULL)
  AND ("type" IN ('FINISHED_PRODUCT', 'PACKAGING') OR "presentation_id" IS NULL)
);

-- Clave candidata para la FK compuesta de `order_presentation_lines`.
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_id_key" UNIQUE ("company_id", "id");

-- ---------------------------------------------------------------------------------------
-- 2. order_presentation_lines.packaging_product_id. NULL = linea guardada antes de que el
-- reparto nombrara envases; no se rellena.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_presentation_lines" ADD COLUMN "packaging_product_id" UUID;

CREATE INDEX "order_presentation_lines_packaging_product_id_idx"
  ON "order_presentation_lines"("packaging_product_id");

ALTER TABLE "order_presentation_lines" ADD CONSTRAINT "order_presentation_lines_company_id_packaging_product_id_fkey"
  FOREIGN KEY ("company_id", "packaging_product_id") REFERENCES "products"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 3. Unidad de sistema para contar envases: base, sin derivacion. Idempotente; si ya existe
-- derivando de otra no sirve para contar piezas y se aborta.
-- `units` tiene RLS forzada sin policies: el parentesis NO FORCE/FORCE deja escribir al dueno.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "units" NO FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "units"
     WHERE "company_id" IS NULL AND "name_normalized" = 'unidad' AND "unit_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'packaging_unit_not_base: la unidad de sistema «unidad» ya existe y deriva de otra';
  END IF;

  INSERT INTO "units" ("name", "name_normalized", "symbol", "updated_at")
  SELECT 'unidad', 'unidad', 'u', CURRENT_TIMESTAMP
   WHERE NOT EXISTS (
     SELECT 1 FROM "units" WHERE "company_id" IS NULL AND "name_normalized" = 'unidad'
   );
END $$;

ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
