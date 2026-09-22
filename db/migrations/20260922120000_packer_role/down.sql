-- DOWN de la migracion `packer_role` (QC-144). Convencion propia del repo: Prisma Migrate no
-- genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ademas borra su fila de
-- `_prisma_migrations` en la MISMA transaccion.
--
-- Retira el permiso `terminados.consultar` con TODAS sus asignaciones (no solo las que puso el
-- UP), las asignaciones del rol Empacador y el propio rol. No toca ninguna otra fila.
--
-- Orden inverso y acotado, en el orden exacto de `design.md > 3.3`:
--   1. Las asignaciones del permiso nuevo, de CUALQUIER rol: `role_permissions_permission_code_fkey`
--      es RESTRICT, asi que borrar antes el permiso fallaria, y dejar una asignacion huerfana
--      tampoco es el estado anterior.
--   2. Las asignaciones que le quedan al rol Empacador (por si alguien le anadio otra a mano).
--   3. El permiso.
--   4. El rol. Si algun usuario tiene el rol Empacador, `users_role_id_fkey` (`ON DELETE RESTRICT`)
--      hace fallar este DELETE con `23503`, y con el la transaccion entera: es deliberado, la
--      reversion no reasigna a nadie a otro rol por su cuenta.
--
-- Sin `INSERT`, `UPDATE`, `ALTER`, `DROP` ni `CASCADE`.

DELETE FROM "role_permissions" WHERE "permission_code" = 'terminados.consultar';
DELETE FROM "role_permissions"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Empacador');
DELETE FROM "permissions" WHERE "code" = 'terminados.consultar';
DELETE FROM "roles" WHERE "name" = 'Empacador';
