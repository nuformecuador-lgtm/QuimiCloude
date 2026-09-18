-- Escrita a mano: `prisma migrate dev --create-only` no puede replayar la migracion
-- `inventory_company_scope` sobre una base sombra vacia, porque esa migracion exige una
-- empresa existente para resolver `company_id`. Se aplica con `pnpm run db:migrate`
-- (`prisma migrate deploy`), que no recrea la base sombra.

DROP INDEX IF EXISTS "products_stock_idx";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_stock_non_negative";
ALTER TABLE "products" DROP COLUMN "stock";
