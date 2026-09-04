-- DOWN de la migracion `split_product_and_supplier_catalog` (QC-52). Convencion propia del
-- repo: Prisma Migrate no genera down migrations
-- (`docs/architecture.md > Migraciones up/down`). Lo aplica `pnpm run db:rollback`
-- (`scripts/db-rollback.ts`).
--
-- REVIERTE al esquema EXACTO anterior, no solo deshace (R28, decision cerrada 9). Por eso los
-- dos CHECK de `products` se vuelven a CREAR con su definicion literal de QC-14: se fueron
-- SOLOS con el `DROP COLUMN` -- Postgres se lleva el CHECK con la columna que solo el
-- menciona-- pero NO vuelven solos con el `ADD COLUMN`. Un down que solo dropeara dejaria
-- `products` con dos columnas sin ninguna regla de no-negatividad, que NO es el estado
-- anterior. Esa es la diferencia entre «deshacer» y «revertir».
--
-- DETALLES QUE HAY QUE COPIAR DE LAS MIGRACIONES ORIGINALES, NO DEDUCIR
-- (`20260902005510_products_and_presentations/migration.sql` lineas 31-33 y 57-59;
-- `20260903131417_suppliers_and_supplier_catalog_lines/migration.sql` lineas 54, 74-75 y 96):
--   - `products.min_purchase` es `INTEGER NOT NULL DEFAULT 0`, NO anulable. Restaurarla
--     anulable seria «casi» el esquema anterior, y R28 pide el anterior.
--   - `products.cost` es `DECIMAL(14,4)` ANULABLE y `products.delivery_time` `INTEGER`
--     ANULABLE. `delivery_time` nunca tuvo CHECK (QC-14 decision 7): no se le inventa uno.
--   - `supplier_catalog_lines.product_id` es `UUID NOT NULL`, con FK `ON DELETE RESTRICT ON
--     UPDATE CASCADE`, su indice de lado hijo y su indice unico TOTAL (no parcial: en QC-42 la
--     linea no tenia borrado logico).
--
-- ESTE DOWN ES DESTRUCTIVO POR NATURALEZA EN CUANTO HAYA UNA SOLA FILA, y conviene leerlo dos
-- veces: `product_id` NO SE PUEDE RECONSTRUIR. La ficha corto a proposito todo vinculo entre
-- la linea y el producto (decision cerrada 3), asi que no hay ninguna columna, ninguna tabla y
-- ningun nombre del que deducir a que producto apuntaba una linea -- el nombre de la linea y
-- el del producto no se relacionan de ninguna manera (P2)--. Volver atras con datos cargados
-- significa perder las lineas o inventarse a que producto pertenecen. Por eso las dos guardas
-- de abajo PARAN el rollback en vez de destruir en silencio, mismo criterio que el `down.sql`
-- de `20260903200000_product_image_path`.
--
-- Las tres columnas de `products` tampoco recuperan sus VALORES: vuelven vacias (y
-- `min_purchase` a 0, su DEFAULT). Eso el DOWN no lo puede arreglar y no finge que si.
--
-- Orden inverso al del UP: primero el indice unico parcial y las dos FK nuevas, luego las
-- cinco columnas nuevas, luego `product_id` con su FK y sus dos indices, y al final las tres
-- columnas de `products` con sus dos CHECK.

-- GUARDA 1 — `image_path` es irreversible y no se reconstruye desde ninguna otra columna.
-- Las filas con borrado logico tambien cuentan: siguen siendo datos.
DO $$
DECLARE
  con_imagen BIGINT;
BEGIN
  SELECT count(*) INTO con_imagen FROM "supplier_catalog_lines" WHERE "image_path" IS NOT NULL;
  IF con_imagen > 0 THEN
    RAISE EXCEPTION
      'split_product_and_supplier_catalog down: hay % linea(s) de catalogo con ruta de imagen escrita. Revertir la borraria sin poder reconstruirla: vacia la columna `image_path` de `supplier_catalog_lines` a mano antes de revertir.',
      con_imagen;
  END IF;
END $$;

-- GUARDA 2 — el DOWN restaura `product_id UUID NOT NULL` y NO TIENE DE DONDE SACARLO. Con una
-- sola fila en la tabla, el `ADD COLUMN ... NOT NULL` fallaria de todas formas; se para antes
-- y con un mensaje que dice que revisar, en vez de dejar un error de Postgres a medio camino.
DO $$
DECLARE
  lineas BIGINT;
BEGIN
  SELECT count(*) INTO lineas FROM "supplier_catalog_lines";
  IF lineas > 0 THEN
    RAISE EXCEPTION
      'split_product_and_supplier_catalog down: hay % linea(s) de catalogo. El esquema anterior exige `product_id` NOT NULL y esta feature corto todo vinculo con `products`: no hay de donde deducir a que producto apuntaba cada linea. Exporta esas filas y vacia `supplier_catalog_lines` a mano antes de revertir, o decide el mapeo y escribelo aqui.',
      lineas;
  END IF;
END $$;

-- La identidad de la linea vuelve a ser `(supplier_id, product_id)`, asi que el indice unico
-- PARCIAL sobre el nombre se va entero.
DROP INDEX IF EXISTS "supplier_catalog_lines_name_presentation_unique";

ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_unit_id_fkey";

ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_presentation_id_fkey";

DROP INDEX IF EXISTS "supplier_catalog_lines_unit_id_idx";

DROP INDEX IF EXISTS "supplier_catalog_lines_presentation_id_idx";

ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "deleted_at";

ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "unit_id";

ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "presentation_id";

ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "image_path";

ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "name_normalized";

ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "name";

-- `product_id` vuelve como la dejo QC-42: UUID NOT NULL. Solo puede salir bien sobre la tabla
-- vacia, y la GUARDA 2 ya lo garantizo.
ALTER TABLE "supplier_catalog_lines" ADD COLUMN "product_id" UUID NOT NULL;

ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TOTAL, no parcial: en el esquema anterior la linea no tenia `deleted_at`.
CREATE UNIQUE INDEX "supplier_catalog_lines_supplier_id_product_id_key" ON "supplier_catalog_lines"("supplier_id", "product_id");

CREATE INDEX "supplier_catalog_lines_product_id_idx" ON "supplier_catalog_lines"("product_id");

-- Las tres columnas del producto, con los tipos y los defaults LITERALES de QC-14. El orden de
-- las columnas dentro de la tabla no coincidira con el original -- Postgres las anade al
-- final-- y eso no es parte del esquema: ninguna consulta del repo usa `SELECT *` posicional.
ALTER TABLE "products" ADD COLUMN "cost" DECIMAL(14,4);

ALTER TABLE "products" ADD COLUMN "min_purchase" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "products" ADD COLUMN "delivery_time" INTEGER;

-- Los dos CHECK que el `DROP COLUMN` del UP se llevo consigo, con su definicion literal de
-- `20260902005510_products_and_presentations/migration.sql`. `delivery_time` no lleva ninguno,
-- a proposito.
ALTER TABLE "products" ADD CONSTRAINT "products_min_purchase_non_negative" CHECK ("min_purchase" >= 0);

ALTER TABLE "products" ADD CONSTRAINT "products_cost_non_negative"         CHECK ("cost" >= 0);
