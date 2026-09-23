-- Rollback: elimina la columna type y el enum ProductType.
-- Va ANTES de 20260918130000_product_unit_and_stored_stock.

ALTER TABLE "products" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "products" DROP COLUMN IF EXISTS "type";

DROP TYPE IF EXISTS "ProductType";

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE  ROW LEVEL SECURITY;