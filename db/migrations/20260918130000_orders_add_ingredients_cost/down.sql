-- DOWN de orders_add_ingredients_cost. Convencion del repo: Prisma Migrate no genera downs.
-- Revierte el `migration.sql` en orden inverso. Destructivo a conciencia: el importe es
-- derivado y se recalcula editando el pedido.
ALTER TABLE "orders" DROP COLUMN "ingredients_cost";
