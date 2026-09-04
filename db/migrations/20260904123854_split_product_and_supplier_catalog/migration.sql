-- QC-52: separar-producto-de-catalogo-de-proveedor. UNA SOLA migracion con LOS DOS cambios
-- (`specs/QC-52-separar-producto-de-catalogo-de-proveedor/design.md` secciones 1, 2 y 3, R27):
--   1. `products` PIERDE `cost`, `min_purchase` y `delivery_time`. No son propiedades de la
--      cosa: son TERMINOS COMERCIALES y dependen de a quien se la compres.
--   2. `supplier_catalog_lines` PIERDE `product_id` -- y con el todo vinculo con `products`,
--      ni siquiera opcional (decision cerrada 3, R9)-- y GANA `name`, `name_normalized`,
--      `presentation_id`, `unit_id`, `image_path` y `deleted_at`, o sea la estructura del
--      producto MENOS `stock` y `qty_alert`: cuanto tienes es tuyo, no del proveedor.
-- Y NADA MAS. Esta migracion NO toca ninguna otra tabla (R27): las unicas menciones a
-- `presentations` y a `units` son las dos FK que `supplier_catalog_lines` declara sobre SI
-- MISMA. Tampoco toca RLS (R26): sigue habilitada y forzada en las dos tablas desde sus
-- migraciones originales, y una sentencia aqui solo podria estropearlo.
--
-- SALE BARATA PORQUE `supplier_catalog_lines` ESTA VACIA, y esa es la razon de hacerlo hoy:
-- verificado el 2026-09-04, 0 filas (QC-42 fue esquema puro y QC-43 no sembro nada). Los dos
-- `ADD COLUMN ... NOT NULL` sin DEFAULT -- `name` y `name_normalized`-- son legales solo por
-- eso; con una sola fila cargada Postgres los rechazaria y habria que inventarse un backfill
-- para un nombre que no existe en ningun sitio. El DO de abajo lo comprueba y para con un
-- mensaje legible en vez de dejar que reviente el tercer ALTER.
--
-- AVISO DE DRIFT — de todo lo que hay en este archivo, Prisma sabe generar los dos bloques
-- `AlterTable`, los dos `DropIndex`, el `DropForeignKey` de `product_id` y los dos
-- `CreateIndex` simples. NO sabe generar, y por eso van A MANO: las dos FK nuevas hacia
-- `presentations` y `units` -- campos ESCALARES SIN `@relation` a proposito (decision cerrada
-- 10, R30): con `@relation`, el cliente Prisma ofreceria `include: { presentation: true }`
-- desde `proveedores`, un cruce de modulo que NINGUNA guardia detecta porque no es un
-- import-- y el INDICE UNICO PARCIAL de la identidad de la linea, porque Prisma no modela
-- indices parciales.
--
-- AVISO DE DRIFT 2, EL CARO — `prisma migrate dev --create-only` genero ADEMAS **quince**
-- `DROP CONSTRAINT` que NO estan aqui: `orders_created_by_fkey`, `orders_recipe_id_fkey`,
-- `orders_unit_id_fkey`, `orders_updated_by_fkey`, `products_created_by_fkey`,
-- `products_unit_id_fkey`, `products_updated_by_fkey`, `recipe_lines_product_id_fkey`,
-- `recipe_lines_unit_id_fkey`, `recipes_created_by_fkey`, `recipes_updated_by_fkey`,
-- `supplier_catalog_lines_created_by_fkey`, `supplier_catalog_lines_updated_by_fkey`,
-- `suppliers_created_by_fkey` y `suppliers_updated_by_fkey`. Son TODAS las FK que cruzan de
-- modulo del repo, y las propone precisamente porque ninguna esta declarada en el esquema. SE
-- BORRARON A MANO, UNA POR UNA: aplicarlas habria destruido en silencio la integridad
-- referencial de cinco features ya mergeadas (R29). En QC-43 fueron diez; el numero crece con
-- cada modulo. TODA migracion futura sobre cualquiera de estas tablas hay que auditarla igual.
-- Los `CHECK` no aparecen en la lista porque Prisma no los modela en absoluto, ni para
-- crearlos ni para borrarlos; los seis de `products` y `supplier_catalog_lines` se comprobaron
-- uno a uno contra el censo previo.
--
-- El unico `DROP CONSTRAINT` que queda es LEGITIMO, y el unico `DROP INDEX` unico tambien:
-- son `supplier_catalog_lines_product_id_fkey` y
-- `supplier_catalog_lines_supplier_id_product_id_key`, que se van con `product_id`.
--
-- NOTA DE PROCESO — `prisma migrate dev --create-only` se niega a correr sin TTY cuando avisa
-- de perdida de datos, y aqui avisa por las tres columnas de `products`. El SQL de este
-- archivo es la salida literal de `prisma migrate diff --from-schema-datasource
-- --to-schema-datamodel --script` (mismo motor, mismo diff), auditada y completada a mano.

-- GUARDA — la migracion asume la tabla vacia y lo dice arriba; aqui lo comprueba.
DO $$
DECLARE
  lineas BIGINT;
BEGIN
  SELECT count(*) INTO lineas FROM "supplier_catalog_lines";
  IF lineas > 0 THEN
    RAISE EXCEPTION
      'split_product_and_supplier_catalog: hay % linea(s) de catalogo cargada(s). Esta migracion anade `name` y `name_normalized` NOT NULL sin DEFAULT y borra `product_id`: no hay de donde sacar el nombre de esas filas. Decide y escribe un backfill antes de aplicarla.',
      lineas;
  END IF;
END $$;

-- DropForeignKey — la linea deja de conocer el producto (R9). Es uno de los dos unicos
-- borrados de restriccion legitimos de esta migracion. Postgres se la llevaria igual con el
-- `DROP COLUMN`, pero dejarlo implicito haria que el `down.sql` no tuviera contraparte
-- visible que recrear.
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_product_id_fkey";

-- DropIndex — el otro borrado legitimo: la identidad de la linea ya no es
-- `(supplier_id, product_id)`. La nueva se crea al final, y es PARCIAL.
DROP INDEX "supplier_catalog_lines_supplier_id_product_id_key";

-- DropIndex — el indice del lado hijo de la FK que acaba de irse.
DROP INDEX "supplier_catalog_lines_product_id_idx";

-- AlterTable — el producto adelgaza (R1). Postgres se lleva CON la columna los CHECK que solo
-- ella menciona, asi que `products_cost_non_negative` y `products_min_purchase_non_negative`
-- desaparecen sin sentencia propia; el `down.sql` SI tiene que recrearlos a mano, porque no
-- vuelven solos con el `ADD COLUMN`. `delivery_time` nunca tuvo CHECK (QC-14 decision 7).
-- Los CHECK de `stock` y `qty_alert`, las dos FK de autoria, la FK de unidad y la de
-- presentacion NO se tocan (R3).
ALTER TABLE "products" DROP COLUMN "cost",
DROP COLUMN "delivery_time",
DROP COLUMN "min_purchase";

-- AlterTable — la linea engorda (R8). `name` y `name_normalized` van NOT NULL sin DEFAULT: un
-- DEFAULT '' convertiria «esta linea no tiene nombre» en un valor valido, y la tabla esta
-- vacia (ver la guarda). `presentation_id` es OBLIGATORIA porque forma parte de la identidad
-- de la linea (decision cerrada 4); `unit_id` es opcional (QC-32 la dejo opcional en el
-- producto y aqui manda el mismo criterio). `image_path` va SIN CHECK, SIN DEFAULT y SIN
-- indice, igual que `products.image_path`: la forma de la ruta no esta acordada en el repo y
-- un patron inventado aqui seria la definicion de facto de algo que nadie decidio (P1).
-- `deleted_at` es el borrado logico que la linea gana aqui (decision cerrada 11, R21).
ALTER TABLE "supplier_catalog_lines" DROP COLUMN "product_id",
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "image_path" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "name_normalized" TEXT NOT NULL,
ADD COLUMN     "presentation_id" UUID NOT NULL,
ADD COLUMN     "unit_id" UUID;

-- CreateIndex — Postgres no indexa el lado hijo de una FK, y por ahi pasa la verificacion del
-- RESTRICT al borrar una presentacion o una unidad.
CREATE INDEX "supplier_catalog_lines_presentation_id_idx" ON "supplier_catalog_lines"("presentation_id");

-- CreateIndex
CREATE INDEX "supplier_catalog_lines_unit_id_idx" ON "supplier_catalog_lines"("unit_id");

-- AddForeignKey (A MANO) — linea -> presentacion. Cruza a `inventario`, asi que es escalar en
-- Prisma y FK real aqui (R30). `ON DELETE RESTRICT`, no `CASCADE` ni `SET NULL`:
-- `presentations` no tiene borrado logico -- se borra de verdad (QC-20 D6)-- y el RESTRICT es
-- justo lo que impide que borrar una presentacion deje lineas apuntando al vacio. Es el mismo
-- trato que `products_presentation_id_fkey`.
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_presentation_id_fkey"
  FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (A MANO) — linea -> unidad. Cruza al modulo `unidades`, mismo criterio. La
-- columna es anulable y eso no afloja nada: en SQL una FK solo se verifica cuando la columna
-- tiene valor, asi que una linea sin unidad pasa (R10) y una con una unidad inventada se
-- rechaza con 23503.
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex (A MANO) — LA IDENTIDAD DE LA LINEA (decision cerrada 4, R15, R16, R17).
-- PARCIAL sobre las vivas, porque la linea ya tiene borrado logico: dar de baja una linea
-- LIBERA su combinacion para otra del mismo proveedor (R17). Por eso NO esta en el esquema
-- Prisma como `@@unique` -- Prisma no modela indices parciales-- y por eso el que se acaba de
-- borrar era TOTAL y este no lo es.
--
-- Es la UNICA garantia de la unicidad (R15): no hay `SELECT` previo por igualdad, porque
-- entre el `SELECT` y el `INSERT` cabe otra transaccion y dos altas simultaneas crearian dos
-- filas. El puerto ni siquiera expone busqueda por nombre, de modo que esa comprobacion no es
-- expresable. El mensaje al usuario sale de traducir el SQLSTATE `23505` (`P2002`).
--
-- EL ORDEN DE LAS COLUMNAS NO ES INDIFERENTE: el prefijo izquierdo `supplier_id` sirve ademas
-- como indice de «lineas de este proveedor», que es la consulta del listado paginado, y por
-- eso no hay un `supplier_catalog_lines_supplier_id_idx` aparte -- seria redundante--. Al
-- hacerse parcial deja de cubrir las filas muertas; el listado ya filtra por
-- `deleted_at IS NULL`, asi que sigue sirviendo.
--
-- Dos proveedores SI pueden tener cada uno la misma linea, y un mismo proveedor puede tener el
-- mismo nombre en dos presentaciones distintas con precios distintos (R16): las dos cosas
-- salen de que `supplier_id` y `presentation_id` estan en la clave.
CREATE UNIQUE INDEX "supplier_catalog_lines_name_presentation_unique"
  ON "supplier_catalog_lines" ("supplier_id", "name_normalized", "presentation_id")
  WHERE "deleted_at" IS NULL;
