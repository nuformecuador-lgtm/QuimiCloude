-- QC-57 (T4) — indices de orden, filtro y busqueda de los SIETE listados, mas la columna
-- normalizada de busqueda de `products`.
--
-- ESCRITA A MANO, no generada con `prisma migrate dev --create-only`, y es deliberado
-- (`design.md > 10.3`): `products`, `recipes`, `supplier_catalog_lines` y `orders` tienen FK
-- escalares sin `@relation`, CHECK y RLS que Prisma NO conoce, y una generacion automatica
-- emite `DROP CONSTRAINT` de drift sobre todos ellos. Aqui NO hay ni un solo `DROP`: esta
-- migracion solo ANADE una columna y CREA indices.
--
-- Vias y decisiones cerradas que aplica:
--   * `pg_trgm` SE HABILITA (via A, humano 2026-09-04): la busqueda sigue siendo por
--     SUBCADENA, y una subcadena solo la sirve un GIN de trigramas. Un btree no acelera
--     `LIKE '%texto%'` (`design.md > 4.3`).
--   * Los indices son PARCIALES (`WHERE deleted_at IS NULL`) en las cinco tablas con borrado
--     logico —`products`, `recipes`, `suppliers`, `supplier_catalog_lines`, `orders`—, porque
--     ese filtro va en TODA consulta de esos listados (R7). `presentations` y `units` no
--     tienen `deleted_at`, asi que sus indices son totales.
--     Prisma NO modela indices parciales: por eso viven aqui y no en `db/schema.prisma`,
--     igual que `recipes_name_unique` y `suppliers_name_unique`.
--   * `products.name_normalized` NO lleva indice unico: el nombre de producto NO es unico
--     (decision cerrada 6 de QC-14). La columna es para BUSCAR, no para identificar.
--
-- Cubre R21, R22, R23.

-- ---------------------------------------------------------------------------
-- 1. Extension de trigramas (via A). `IF NOT EXISTS`: puede estar ya puesta por otra cosa.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 2. `products.name_normalized`: la unica columna nueva de la ficha.
--    Se anade ANULABLE, se rellena, y solo despues se pone NOT NULL (R23): al reves,
--    `ADD COLUMN ... NOT NULL` sin DEFAULT fallaria con la tabla ya poblada.
-- ---------------------------------------------------------------------------
ALTER TABLE "products" ADD COLUMN "name_normalized" text;

-- Backfill de las filas que YA existen (R23). Reproduce en SQL `normalizeProductName`:
-- minusculas, sin acentos y sin nada que no sea [a-z0-9]. Se usa `translate` y no
-- `unaccent()` a proposito: no exige extension, y aqui es un CALCULO DE UNA VEZ (no un
-- indice), asi que da igual que no sea IMMUTABLE. Que el resultado coincida con la funcion
-- de TypeScript lo comprueba el test de integracion de T6, no la confianza.
UPDATE "products"
SET "name_normalized" = regexp_replace(
  lower(
    translate(
      "name",
      'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ',
      'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN'
    )
  ),
  '[^a-z0-9]', '', 'g'
);

ALTER TABLE "products" ALTER COLUMN "name_normalized" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Indices de BUSQUEDA: GIN de trigramas sobre `name_normalized`, en las SEIS tablas
--    buscables. `orders` no busca (R17), asi que no lleva.
--    Los indices que ya habia sobre esa columna NO sirven para subcadena y NO se tocan:
--    `presentations_name_normalized_key` y `units_name_normalized_key` son UNIQUE btree,
--    `recipes_name_unique` y `suppliers_name_unique` son UNIQUE btree PARCIALES, y
--    `supplier_catalog_lines_name_presentation_unique` es compuesto con `name_normalized`
--    fuera de la cabeza.
-- ---------------------------------------------------------------------------
CREATE INDEX "products_name_normalized_trgm_idx" ON "products" USING gin ("name_normalized" gin_trgm_ops) WHERE "deleted_at" IS NULL;
CREATE INDEX "presentations_name_normalized_trgm_idx" ON "presentations" USING gin ("name_normalized" gin_trgm_ops);
CREATE INDEX "recipes_name_normalized_trgm_idx" ON "recipes" USING gin ("name_normalized" gin_trgm_ops) WHERE "deleted_at" IS NULL;
CREATE INDEX "suppliers_name_normalized_trgm_idx" ON "suppliers" USING gin ("name_normalized" gin_trgm_ops) WHERE "deleted_at" IS NULL;
CREATE INDEX "supplier_catalog_lines_name_normalized_trgm_idx" ON "supplier_catalog_lines" USING gin ("name_normalized" gin_trgm_ops) WHERE "deleted_at" IS NULL;
CREATE INDEX "units_name_normalized_trgm_idx" ON "units" USING gin ("name_normalized" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 4. Indices de ORDEN y FILTRO, uno por campo declarado ordenable o filtrable que no lo
--    tenga ya (`design.md > 10.2`). NO se recrean los que ya existen —comprobado contra
--    `pg_indexes`, no contra el spec—: `products_presentation_id_idx`, `products_unit_id_idx`,
--    `supplier_catalog_lines_presentation_id_idx`, `supplier_catalog_lines_unit_id_idx`,
--    `orders_recipe_id_idx`, `orders_unit_id_idx` y `orders_order_year_order_sequence_key`
--    (que ademas sirve para ordenar por el correlativo).
-- ---------------------------------------------------------------------------

-- products
CREATE INDEX "products_name_idx" ON "products" ("name") WHERE "deleted_at" IS NULL;
CREATE INDEX "products_stock_idx" ON "products" ("stock") WHERE "deleted_at" IS NULL;
CREATE INDEX "products_qty_alert_idx" ON "products" ("qty_alert") WHERE "deleted_at" IS NULL;
CREATE INDEX "products_created_at_idx" ON "products" ("created_at") WHERE "deleted_at" IS NULL;
CREATE INDEX "products_updated_at_idx" ON "products" ("updated_at") WHERE "deleted_at" IS NULL;

-- presentations (sin borrado logico: indices totales)
CREATE INDEX "presentations_name_idx" ON "presentations" ("name");
CREATE INDEX "presentations_created_at_idx" ON "presentations" ("created_at");
CREATE INDEX "presentations_updated_at_idx" ON "presentations" ("updated_at");

-- recipes
CREATE INDEX "recipes_name_idx" ON "recipes" ("name") WHERE "deleted_at" IS NULL;
CREATE INDEX "recipes_created_at_idx" ON "recipes" ("created_at") WHERE "deleted_at" IS NULL;
CREATE INDEX "recipes_updated_at_idx" ON "recipes" ("updated_at") WHERE "deleted_at" IS NULL;

-- suppliers
CREATE INDEX "suppliers_name_idx" ON "suppliers" ("name") WHERE "deleted_at" IS NULL;
CREATE INDEX "suppliers_created_at_idx" ON "suppliers" ("created_at") WHERE "deleted_at" IS NULL;
CREATE INDEX "suppliers_updated_at_idx" ON "suppliers" ("updated_at") WHERE "deleted_at" IS NULL;

-- supplier_catalog_lines
CREATE INDEX "supplier_catalog_lines_name_idx" ON "supplier_catalog_lines" ("name") WHERE "deleted_at" IS NULL;
CREATE INDEX "supplier_catalog_lines_cost_idx" ON "supplier_catalog_lines" ("cost") WHERE "deleted_at" IS NULL;
CREATE INDEX "supplier_catalog_lines_min_purchase_idx" ON "supplier_catalog_lines" ("min_purchase") WHERE "deleted_at" IS NULL;
CREATE INDEX "supplier_catalog_lines_delivery_time_idx" ON "supplier_catalog_lines" ("delivery_time") WHERE "deleted_at" IS NULL;
CREATE INDEX "supplier_catalog_lines_created_at_idx" ON "supplier_catalog_lines" ("created_at") WHERE "deleted_at" IS NULL;
CREATE INDEX "supplier_catalog_lines_updated_at_idx" ON "supplier_catalog_lines" ("updated_at") WHERE "deleted_at" IS NULL;

-- units (sin borrado logico: indices totales)
CREATE INDEX "units_name_idx" ON "units" ("name");
CREATE INDEX "units_symbol_idx" ON "units" ("symbol");
CREATE INDEX "units_created_at_idx" ON "units" ("created_at");
CREATE INDEX "units_updated_at_idx" ON "units" ("updated_at");

-- orders (no busca por nombre, R17)
CREATE INDEX "orders_status_idx" ON "orders" ("status") WHERE "deleted_at" IS NULL;
CREATE INDEX "orders_priority_idx" ON "orders" ("priority") WHERE "deleted_at" IS NULL;
CREATE INDEX "orders_created_at_idx" ON "orders" ("created_at") WHERE "deleted_at" IS NULL;
CREATE INDEX "orders_quantity_idx" ON "orders" ("quantity") WHERE "deleted_at" IS NULL;
CREATE INDEX "orders_unit_price_idx" ON "orders" ("unit_price") WHERE "deleted_at" IS NULL;
