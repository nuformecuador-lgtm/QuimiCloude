-- DOWN de finished_products_and_content_copies. Es DESTRUCTIVO A CONCIENCIA: quitar estas
-- columnas pierde el contenido tecleado en las presentaciones y las copias que guardan los
-- pedidos, que no se pueden recalcular despues. Se acepta porque la guarda de abajo impide
-- revertir mientras exista algun producto terminado o algun asiento de produccion.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products" WHERE "type" = 'FINISHED_PRODUCT') THEN
    RAISE EXCEPTION
      'finished_products_and_content_copies_in_use: hay productos con type = FINISHED_PRODUCT; revertir perderia su identidad.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "inventory_movements" WHERE "kind" = 'production') THEN
    RAISE EXCEPTION
      'finished_products_and_content_copies_in_use: hay asientos con kind = production; revertir perderia el lote que causaron.'
      USING ERRCODE = '23514';
  END IF;
END $$;

-- 5. inventory_movements: vuelve al estado anterior a esta migracion.
DROP INDEX "inventory_movements_one_production_per_order";
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_production_quantity_positive";

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (
    ("kind" = 'adjustment' AND "reason" IS NOT NULL)
    OR ("kind" IN ('opening', 'consumption') AND "reason" IS NULL)
  );

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind" = 'consumption') = ("order_id" IS NOT NULL));

-- 4. product_batches.package_content y el CHECK de costo, de vuelta al estado anterior.
ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_package_content_requires_unit_cost";

ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_unit_cost_positive";
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_unit_cost_positive"
  CHECK ("unit_cost" > 0);

ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_package_content_positive";
ALTER TABLE "product_batches" DROP COLUMN "package_content";

-- 3. orders.presentation_content.
ALTER TABLE "orders" DROP CONSTRAINT "orders_presentation_content_requires_presentation";
ALTER TABLE "orders" DROP CONSTRAINT "orders_presentation_content_positive";
ALTER TABLE "orders" DROP COLUMN "presentation_content";

-- 2. La identidad del producto terminado en products.
DROP INDEX "products_recipe_id_idx";
DROP INDEX "products_finished_identity_key";
ALTER TABLE "products" DROP CONSTRAINT "products_finished_identity_matches_type";
ALTER TABLE "products" DROP CONSTRAINT "products_company_id_presentation_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT "products_recipe_id_fkey";
ALTER TABLE "products" DROP COLUMN "presentation_id";
ALTER TABLE "products" DROP COLUMN "recipe_id";

-- 1. presentations.content.
ALTER TABLE "presentations" DROP CONSTRAINT "presentations_content_positive";
ALTER TABLE "presentations" DROP COLUMN "content";
