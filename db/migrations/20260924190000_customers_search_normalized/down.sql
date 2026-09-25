-- DOWN de `20260924190000_customers_search_normalized`.
--
-- Revierte EXACTAMENTE lo que hace `migration.sql`, en orden inverso: primero los tres indices,
-- despues las tres columnas. NO HACE `DROP EXTENSION pg_trgm`: la extension es un objeto de la
-- base, no de esta migracion, y otra cosa puede estar usandola.

-- 1. Indices de busqueda -------------------------------------------------------
DROP INDEX IF EXISTS "customers_city_normalized_trgm_idx";
DROP INDEX IF EXISTS "customers_last_names_normalized_trgm_idx";
DROP INDEX IF EXISTS "customers_first_names_normalized_trgm_idx";

-- 2. Las tres columnas ----------------------------------------------------------
ALTER TABLE "customers" DROP COLUMN IF EXISTS "city_normalized";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "last_names_normalized";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "first_names_normalized";
