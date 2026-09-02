-- DOWN de la migracion recipes_and_recipe_lines. Convencion propia del repo: Prisma Migrate
-- no genera down migrations (`docs/architecture.md > Migraciones up/down`).
-- Lo aplica `pnpm run db:rollback` (`scripts/db-rollback.ts`).
--
-- Revierte exactamente el `migration.sql`, en orden inverso. Los indices (incluido el unico
-- parcial), el CHECK y las CUATRO FK —tambien las tres escritas a mano— caen con sus tablas,
-- asi que no se dropean aparte: un `ALTER TABLE ... DROP CONSTRAINT` «por simetria» sobraria.
-- Que `created_by` / `updated_by` sean anulables (decision cerrada 22) no cambia nada aqui.
--
-- NO se elimina la extension `pgcrypto`: esta migracion no la crea en exclusiva
-- (`CREATE EXTENSION IF NOT EXISTS`) y `identity` e `inventario` dependen de ella.

DROP TABLE IF EXISTS "recipe_lines";
DROP TABLE IF EXISTS "recipes";
