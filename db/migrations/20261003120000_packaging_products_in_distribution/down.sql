-- Reversion de `migration.sql`, en orden inverso. Aborta si ya hay envases con presentacion:
-- el CHECK anterior no los admite y no hay a donde llevarlos sin perder la presentacion.

-- 3. La unidad de envases, solo si nada la usa.
ALTER TABLE "units" NO FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  DELETE FROM "units" WHERE "company_id" IS NULL AND "name_normalized" = 'unidad';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'la unidad de sistema «unidad» sigue en uso y se conserva';
END $$;

ALTER TABLE "units" FORCE ROW LEVEL SECURITY;

-- 2. La linea del reparto pierde el envase.
ALTER TABLE "order_presentation_lines" DROP CONSTRAINT "order_presentation_lines_company_id_packaging_product_id_fkey";
DROP INDEX "order_presentation_lines_packaging_product_id_idx";
ALTER TABLE "order_presentation_lines" DROP COLUMN "packaging_product_id";

-- 1. products: clave candidata y CHECK con su texto literal anterior.
ALTER TABLE "products" DROP CONSTRAINT "products_company_id_id_key";

ALTER TABLE "products" DROP CONSTRAINT "products_finished_identity_matches_type";
ALTER TABLE "products" ADD CONSTRAINT "products_finished_identity_matches_type" CHECK (
  ("type" = 'FINISHED_PRODUCT') = ("recipe_id" IS NOT NULL AND "presentation_id" IS NOT NULL)
  AND ("recipe_id" IS NULL) = ("presentation_id" IS NULL)
);
