-- DOWN de orders_packaging_cost. Convencion del repo: Prisma Migrate no genera downs. Lo aplica
-- `pnpm run db:rollback`, en una sola transaccion.
--
-- Revierte `migration.sql` en orden inverso. Este down no toca `ingredients_cost`: sigue siendo
-- el total, asi que quitar el desglose no cambia ningun importe que haya quedado guardado.
--
-- No repone los importes que el up dejo en NULL: pedidos que ya tenian `ingredients_cost` y
-- lineas con envase. El valor anterior no se guarda en ningun sitio, asi que esos pedidos siguen
-- sin importe hasta que se costeen al Terminar. Ese caso solo existe en bases de desarrollo de
-- esta rama.

ALTER TABLE "orders" DROP CONSTRAINT "orders_packaging_cost_matches_ingredients_cost";
ALTER TABLE "orders" DROP COLUMN "packaging_cost";
