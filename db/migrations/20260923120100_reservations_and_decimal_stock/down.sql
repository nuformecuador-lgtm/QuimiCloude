-- Orden inverso al de migration.sql. Antes de devolver ninguna columna a entero, falla si
-- alguna tiene parte decimal: truncarla en silencio perderia existencia real.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "product_batches" WHERE "stock" <> trunc("stock")) THEN
    RAISE EXCEPTION
      'reservations_and_decimal_stock_down_has_decimals: product_batches.stock tiene valores con parte decimal; revertir los truncaria.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "inventory_movements" WHERE "quantity" <> trunc("quantity")) THEN
    RAISE EXCEPTION
      'reservations_and_decimal_stock_down_has_decimals: inventory_movements.quantity tiene valores con parte decimal; revertir los truncaria.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "products" WHERE "stock" <> trunc("stock")) THEN
    RAISE EXCEPTION
      'reservations_and_decimal_stock_down_has_decimals: products.stock tiene valores con parte decimal; revertir los truncaria.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "products" WHERE "qty_alert" IS NOT NULL AND "qty_alert" <> trunc("qty_alert")) THEN
    RAISE EXCEPTION
      'reservations_and_decimal_stock_down_has_decimals: products.qty_alert tiene valores con parte decimal; revertir los truncaria.'
      USING ERRCODE = '23514';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- Parentesis de RLS: las mismas cuatro tablas que abrio migration.sql.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_batches"     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "orders"              NO FORCE ROW LEVEL SECURITY;

-- 5. orders.reserved_at
DROP INDEX IF EXISTS "orders_expirable_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "reserved_at";

-- 4. inventory_movements.order_id y sus dos CHECK
ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_order_id_matches_kind";
ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind" = 'adjustment' AND "reason" IS NOT NULL) OR ("kind" = 'opening' AND "reason" IS NULL));
ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_order_id_fkey";
DROP INDEX IF EXISTS "inventory_movements_order_id_idx";
ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "order_id";

-- 3. El libro de reservas entero.
DROP TABLE IF EXISTS "reservation_movements";
DROP TYPE IF EXISTS "ReservationMovementKind";

-- 2. La clave unica compuesta.
ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "product_batches_id_company_id_key";

-- 1. Los tipos vuelven a entero: ya se comprobo arriba que ninguno tiene parte decimal.
ALTER TABLE "products"
  ALTER COLUMN "qty_alert" TYPE INTEGER USING "qty_alert"::INTEGER;
ALTER TABLE "products"
  ALTER COLUMN "stock" TYPE INTEGER USING "stock"::INTEGER;
ALTER TABLE "inventory_movements"
  ALTER COLUMN "quantity" TYPE INTEGER USING "quantity"::INTEGER;
ALTER TABLE "product_batches"
  ALTER COLUMN "stock" TYPE INTEGER USING "stock"::INTEGER;

-- ---------------------------------------------------------------------------------------
-- Se cierra el parentesis.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"            FORCE  ROW LEVEL SECURITY;
ALTER TABLE "product_batches"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches"     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "orders"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders"              FORCE  ROW LEVEL SECURITY;
