-- Escrita a mano, como `20260911130000_inventory_company_scope` y
-- `20260917120000_drop_product_stock`: `products` ya lleva CHECK, FK escritas a mano y RLS forzada
-- que Prisma no modela, y `migrate dev` los leeria como drift sobre una base con datos.
-- Va DESPUES de las dos migraciones del libro de movimientos: el relleno de "stock" tiene que
-- sumar los lotes ya ajustados, no los de antes del ajuste.

-- ---------------------------------------------------------------------------------------
-- 1. Parentesis de RLS: se sueltan las tres tablas que el relleno lee o escribe.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"   NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 2. Las columnas. "unit_id" nace anulable: un producto sin lotes no tiene de donde sacar una
-- unidad y no hay ninguna "por defecto" que valga. "stock" nace en 0 para que las filas ya
-- existentes sin lotes queden correctas sin tocar nada mas.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products" ADD COLUMN "unit_id" UUID;
ALTER TABLE "products" ADD COLUMN "stock" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------------------
-- 3. Relleno. Un producto con lotes gana la unidad de la presentacion de su lote MAS RECIENTE
-- (empate por id descendente) y una existencia igual a la suma de todos sus lotes. No se
-- comprueba si esos lotes mezclan unidades: los disparadores del bloque 5 lo impiden desde
-- ahora en adelante, pero una fila que ya mezclara antes de esta migracion no se parte ni se
-- rechaza aqui.
-- ---------------------------------------------------------------------------------------
UPDATE "products" AS p
SET "unit_id" = latest."unit_id"
FROM (
  SELECT DISTINCT ON (b."product_id") b."product_id", pr."unit_id"
  FROM "product_batches" AS b
  JOIN "presentations" AS pr ON pr."id" = b."presentation_id"
  ORDER BY b."product_id", b."created_at" DESC, b."id" DESC
) AS latest
WHERE p."id" = latest."product_id";

UPDATE "products" AS p
SET "stock" = totals."total"
FROM (
  SELECT b."product_id", COALESCE(SUM(b."stock"), 0) AS "total"
  FROM "product_batches" AS b
  GROUP BY b."product_id"
) AS totals
WHERE p."id" = totals."product_id";

-- ---------------------------------------------------------------------------------------
-- 4. CHECK, FK e indices. "products_stock_idx" es parcial y por eso vive aqui y no en
-- `db/schema.prisma`, que no modela indices parciales; recupera el nombre y la forma que tenia
-- antes de `20260917120000_drop_product_stock`.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0);

ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "products_unit_id_idx" ON "products"("unit_id");
CREATE INDEX "products_stock_idx" ON "products" ("stock") WHERE "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------------------
-- 5. Los dos disparadores, DESPUES del relleno: puestos antes, dispararian sobre filas que
-- todavia no tienen unidad. Cada uno lleva mensaje propio y `ERRCODE = '23514'`, igual que
-- `product_batches_check_company`.
-- ---------------------------------------------------------------------------------------

-- Un lote solo puede escribirse en la unidad de su producto. Si el producto no tiene unidad
-- (recien creado, sin producto todavia) o la presentacion no existe, no se dice nada aqui: lo
-- rechaza la FK correspondiente.
CREATE OR REPLACE FUNCTION product_batches_check_unit()
  RETURNS TRIGGER AS $product_batches_check_unit$
DECLARE
  product_unit_id      UUID;
  presentation_unit_id UUID;
BEGIN
  SELECT parent."unit_id" INTO product_unit_id
    FROM "products" AS parent
   WHERE parent."id" = NEW."product_id";

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT parent."unit_id" INTO presentation_unit_id
    FROM "presentations" AS parent
   WHERE parent."id" = NEW."presentation_id"
     FOR SHARE;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF product_unit_id IS NULL OR product_unit_id <> presentation_unit_id THEN
    RAISE EXCEPTION
      'product_batches_unit_differs_from_product: el lote % declara la presentacion % (unidad %), pero su producto % tiene la unidad %.',
      NEW."id", NEW."presentation_id", presentation_unit_id, NEW."product_id", product_unit_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$product_batches_check_unit$ LANGUAGE plpgsql;

CREATE TRIGGER "product_batches_check_unit_trigger"
  BEFORE INSERT OR UPDATE OF "product_id", "presentation_id" ON "product_batches"
  FOR EACH ROW EXECUTE FUNCTION product_batches_check_unit();

-- Una presentacion con al menos un lote no puede cambiar de unidad: es el unico camino por el
-- que un producto podria terminar con lotes en dos unidades sin pasar por el alta.
CREATE OR REPLACE FUNCTION presentations_check_unit_locked()
  RETURNS TRIGGER AS $presentations_check_unit_locked$
BEGIN
  IF NEW."unit_id" IS DISTINCT FROM OLD."unit_id" AND EXISTS (
    SELECT 1 FROM "product_batches" AS b WHERE b."presentation_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION
      'presentations_unit_locked_by_batches: la presentacion % ya tiene lotes y no puede cambiar de unidad % a %.',
      NEW."id", OLD."unit_id", NEW."unit_id"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$presentations_check_unit_locked$ LANGUAGE plpgsql;

CREATE TRIGGER "presentations_check_unit_locked_trigger"
  BEFORE UPDATE OF "unit_id" ON "presentations"
  FOR EACH ROW EXECUTE FUNCTION presentations_check_unit_locked();

-- ---------------------------------------------------------------------------------------
-- 6. Se cierra el parentesis: RLS activada y forzada, sin ninguna policy, como estaba.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "presentations"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations"   FORCE  ROW LEVEL SECURITY;
