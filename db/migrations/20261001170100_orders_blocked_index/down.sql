-- DOWN de orders_blocked_index. Convencion del repo: Prisma Migrate no genera downs. Lo aplica
-- `pnpm run db:rollback`, que ejecuta este archivo entero en una sola transaccion.
--
-- El indice no se recrea al revertir: es nuevo de esta migracion y su unica razon de existir es
-- el valor que la migracion anterior anade. `IF EXISTS` para que deshacer la migracion dos
-- veces seguidas no falle.

DROP INDEX IF EXISTS "orders_blocked_company_created_idx";
