-- Escrita a mano: anade el enum ProductType y la columna type a products.
-- Va DESPUES de 20260918130000_product_unit_and_stored_stock: el relleno de stock y unit_id
-- ya debe estar hecho antes de poblar type, aunque son independientes.

-- ---------------------------------------------------------------------------------------
-- 1. Parentesis de RLS: se suelta la tabla que la migracion escribe.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 2. Enum y columna. La columna nace con default 'PRODUCT' para que las filas existentes
-- queden correctas sin un UPDATE adicional; el UPDATE explicito de abajo es idempotente y
-- deja claro el proposito.
-- ---------------------------------------------------------------------------------------
CREATE TYPE "ProductType" AS ENUM ('PRODUCT', 'MACHINE', 'PACKAGING');

ALTER TABLE "products" ADD COLUMN "type" "ProductType" NOT NULL DEFAULT 'PRODUCT';

-- ---------------------------------------------------------------------------------------
-- 3. Relleno idempotente: deja como PRODUCT cualquier fila que por alguna razon no tenga
-- el default (ej. inserciones concurrentes en READ COMMITTED antes de que el ALTER
-- termine). No duele volver a escribir el mismo valor.
-- ---------------------------------------------------------------------------------------
UPDATE "products" SET "type" = 'PRODUCT' WHERE "type" IS DISTINCT FROM 'PRODUCT';

-- ---------------------------------------------------------------------------------------
-- 4. Se cierra el parentesis: RLS activada y forzada, sin ninguna policy, como estaba.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE  ROW LEVEL SECURITY;