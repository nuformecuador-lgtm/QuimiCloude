-- DOWN de la migracion `permissions_and_role_permissions` (QC-74). Convencion propia del repo:
-- Prisma Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo
-- aplica `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ademas borra su fila de
-- `_prisma_migrations` en la MISMA transaccion.
--
-- Revierte exactamente el `migration.sql` y deja el esquema anterior: no queda tabla, indice,
-- clave foranea ni RLS residual de los permisos. Ver
-- `specs/QC-74-modelo-de-permisos/design.md` seccion 1.3.
--
-- Dos cosas que no son evidentes:
--   1. EL ORDEN IMPORTA. `role_permissions` cae PRIMERO: sus dos FK apuntan a `roles` y a
--      `permissions`, y un `DROP TABLE "permissions"` con la hija todavia en pie falla por
--      dependencia. No se usa `CASCADE` a proposito — el fallo debe ser ruidoso, no silencioso.
--   2. Ni los indices, ni las claves foraneas, ni los `ENABLE`/`FORCE ROW LEVEL SECURITY` se
--      revierten uno a uno: caen con su tabla en los dos `DROP TABLE`. `roles` no se toca en
--      ninguna linea, y `users` tampoco: el UP no los modifico.
--
-- No hay datos que proteger: el UP no inserto ninguna fila. Las que siembra el seed se van con
-- las tablas, que es lo correcto — el seed las vuelve a crear cuando la migracion se reaplique.

-- 1. La hija, con sus dos FK y su indice.
DROP TABLE "role_permissions";

-- 2. Y el catalogo, con su unico `permissions_module_action_key`.
DROP TABLE "permissions";
