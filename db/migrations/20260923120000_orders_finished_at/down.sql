-- DOWN de orders_finished_at. Convencion del repo: Prisma Migrate no genera downs. Lo aplica
-- `pnpm run db:rollback`.
--
-- Revierte el `migration.sql` en orden inverso.

DROP INDEX "orders_company_finished_idx";

ALTER TABLE "orders" DROP CONSTRAINT "orders_finished_at_requires_delivered";

ALTER TABLE "orders" DROP COLUMN "finished_at";
