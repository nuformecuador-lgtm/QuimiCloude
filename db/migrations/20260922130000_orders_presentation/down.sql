-- DOWN de orders_presentation. Convencion del repo: Prisma Migrate no genera downs. Lo aplica
-- `pnpm run db:rollback`.
--
-- Revierte el `migration.sql` en orden inverso. Es DESTRUCTIVO A CONCIENCIA: revertir pierde
-- las presentaciones ya elegidas en los pedidos, que no se pueden recalcular. Queda escrito
-- aqui para que nadie lo descubra al hacer rollback.

ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_presentation_id_fkey";

DROP INDEX "orders_presentation_id_idx";

ALTER TABLE "orders" DROP COLUMN "presentation_id";
