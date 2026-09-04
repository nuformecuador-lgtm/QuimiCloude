-- DOWN de `20260904160000_list_query_indexes` (QC-57, T4, R22).
--
-- Revierte EXACTAMENTE lo que hace `migration.sql`, en orden inverso: primero los 35
-- indices que creo, despues la columna. Ni un `DROP` de mas: los indices que ya existian
-- antes de esta migracion —`recipes_name_unique`, `suppliers_name_unique`,
-- `presentations_name_normalized_key`, `units_name_normalized_key`,
-- `supplier_catalog_lines_name_presentation_unique`, los de FK y los de auditoria— NO se
-- nombran aqui, y las FK, los CHECK y el RLS escritos a mano tampoco se tocan.
--
-- NO HACE `DROP EXTENSION pg_trgm`, Y ES DELIBERADO (`design.md > 10.4`): una extension es
-- un objeto de la BASE, no de esta migracion. Otra cosa —otro esquema, otra rama, otra
-- migracion futura— puede estar usandola, y borrarla se la llevaria por delante junto con
-- sus indices. Dejarla instalada no cuesta nada; borrarla puede costar una base. Si algun
-- dia hay que retirarla de verdad, es una decision propia y una migracion propia.
--
-- `DROP COLUMN name_normalized` SI se hace: es la unica columna que este UP anadio, y su
-- GIN se va con ella —por eso el `DROP INDEX` de arriba lleva `IF EXISTS`—.

-- 1. Indices de orden y filtro ------------------------------------------------
DROP INDEX IF EXISTS "orders_unit_price_idx";
DROP INDEX IF EXISTS "orders_quantity_idx";
DROP INDEX IF EXISTS "orders_created_at_idx";
DROP INDEX IF EXISTS "orders_priority_idx";
DROP INDEX IF EXISTS "orders_status_idx";

DROP INDEX IF EXISTS "units_updated_at_idx";
DROP INDEX IF EXISTS "units_created_at_idx";
DROP INDEX IF EXISTS "units_symbol_idx";
DROP INDEX IF EXISTS "units_name_idx";

DROP INDEX IF EXISTS "supplier_catalog_lines_updated_at_idx";
DROP INDEX IF EXISTS "supplier_catalog_lines_created_at_idx";
DROP INDEX IF EXISTS "supplier_catalog_lines_delivery_time_idx";
DROP INDEX IF EXISTS "supplier_catalog_lines_min_purchase_idx";
DROP INDEX IF EXISTS "supplier_catalog_lines_cost_idx";
DROP INDEX IF EXISTS "supplier_catalog_lines_name_idx";

DROP INDEX IF EXISTS "suppliers_updated_at_idx";
DROP INDEX IF EXISTS "suppliers_created_at_idx";
DROP INDEX IF EXISTS "suppliers_name_idx";

DROP INDEX IF EXISTS "recipes_updated_at_idx";
DROP INDEX IF EXISTS "recipes_created_at_idx";
DROP INDEX IF EXISTS "recipes_name_idx";

DROP INDEX IF EXISTS "presentations_updated_at_idx";
DROP INDEX IF EXISTS "presentations_created_at_idx";
DROP INDEX IF EXISTS "presentations_name_idx";

DROP INDEX IF EXISTS "products_updated_at_idx";
DROP INDEX IF EXISTS "products_created_at_idx";
DROP INDEX IF EXISTS "products_qty_alert_idx";
DROP INDEX IF EXISTS "products_stock_idx";
DROP INDEX IF EXISTS "products_name_idx";

-- 2. Indices de busqueda (GIN de trigramas) -----------------------------------
DROP INDEX IF EXISTS "units_name_normalized_trgm_idx";
DROP INDEX IF EXISTS "supplier_catalog_lines_name_normalized_trgm_idx";
DROP INDEX IF EXISTS "suppliers_name_normalized_trgm_idx";
DROP INDEX IF EXISTS "recipes_name_normalized_trgm_idx";
DROP INDEX IF EXISTS "presentations_name_normalized_trgm_idx";
DROP INDEX IF EXISTS "products_name_normalized_trgm_idx";

-- 3. La columna nueva ---------------------------------------------------------
ALTER TABLE "products" DROP COLUMN IF EXISTS "name_normalized";
