-- DOWN de order_terminated_finished_index. Convencion del repo: Prisma Migrate no genera downs. Lo
-- aplica `pnpm run db:rollback`, que ejecuta este archivo entero en una sola transaccion.
--
-- El indice no se recrea al revertir: es nuevo de esta migracion. `IF EXISTS` para que deshacer
-- la migracion dos veces seguidas no falle.

DROP INDEX IF EXISTS "orders_company_terminated_idx";
