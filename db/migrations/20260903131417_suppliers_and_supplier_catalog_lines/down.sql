-- DOWN de la migracion suppliers_and_supplier_catalog_lines. Convencion propia del repo:
-- Prisma Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`).
-- Lo aplica `pnpm run db:rollback` (`scripts/db-rollback.ts`).
--
-- Revierte exactamente el `migration.sql`, en orden inverso. Los indices (incluido el unico
-- PARCIAL `suppliers_name_unique`), los CUATRO CHECK y las CUATRO FK —tambien las tres
-- escritas a mano hacia `products` y `users`— caen con sus tablas, asi que no se dropean
-- aparte: un `ALTER TABLE ... DROP CONSTRAINT` «por simetria» sobraria. Que `created_by` /
-- `updated_by` sean anulables (decision cerrada 14) no cambia nada aqui.
--
-- NO se elimina la extension `pgcrypto`: esta migracion no la crea en exclusiva
-- (`CREATE EXTENSION IF NOT EXISTS`) y QC-4, QC-14 y QC-24 dependen de ella; dropearla
-- romperia esas tres.

DROP TABLE IF EXISTS "supplier_catalog_lines";
DROP TABLE IF EXISTS "suppliers";
