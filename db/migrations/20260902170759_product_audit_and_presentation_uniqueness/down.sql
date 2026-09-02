-- DOWN de la migracion product_audit_and_presentation_uniqueness. Convencion propia del
-- repo: Prisma Migrate no genera down migrations (`docs/architecture.md > Migraciones
-- up/down`). Lo aplica `pnpm run db:rollback` (`scripts/db-rollback.ts`).
--
-- Revierte exactamente el `migration.sql`, en ORDEN INVERSO al UP: primero lo ultimo que
-- se creo (el indice de presentations), y al final lo primero (las columnas de products).

DROP INDEX IF EXISTS "presentations_name_normalized_key";
ALTER TABLE "presentations" DROP COLUMN IF EXISTS "name_normalized";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_updated_by_fkey";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_created_by_fkey";
ALTER TABLE "products" DROP COLUMN IF EXISTS "updated_by";
ALTER TABLE "products" DROP COLUMN IF EXISTS "created_by";
