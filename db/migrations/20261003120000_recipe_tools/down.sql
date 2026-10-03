-- DOWN de recipe_tools. Convencion del repo: Prisma Migrate no genera downs. Lo aplica
-- `pnpm run db:rollback`, que ejecuta este archivo entero en una sola transaccion.
--
-- Borrar la tabla arrastra sus FK, indices, CHECK y RLS. Se pierden las herramientas guardadas:
-- antes de esta migracion no habia donde tenerlas. `IF EXISTS` para que deshacer dos veces
-- seguidas no falle.

DROP TABLE IF EXISTS "recipe_tools";
