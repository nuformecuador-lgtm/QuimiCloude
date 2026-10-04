-- DOWN de orders_packaging_cost. Convencion del repo: Prisma Migrate no genera downs. Lo aplica
-- `pnpm run db:rollback`, en una sola transaccion.
--
-- Revierte `migration.sql` en orden inverso. `ingredients_cost` no se toca: sigue siendo el
-- total, asi que quitar el desglose no cambia ningun importe.

ALTER TABLE "orders" DROP CONSTRAINT "orders_packaging_cost_matches_ingredients_cost";
ALTER TABLE "orders" DROP COLUMN "packaging_cost";
