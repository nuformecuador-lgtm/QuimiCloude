-- DOWN de la migracion `user_permissions_catalog` (QC-66). Convencion propia del repo: Prisma
-- Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ademas borra su fila de
-- `_prisma_migrations` en la MISMA transaccion.
--
-- Deja el catalogo de permisos y sus asignaciones exactamente como estaban antes del UP: las ONCE
-- entradas, sin las dos nuevas y sin sus dos asignaciones (R44). No toca ninguna otra fila y no
-- toca ningun objeto del esquema: ni tabla, ni indice, ni restriccion, ni RLS.
--
-- Orden inverso: primero las asignaciones (la FK role_permissions -> permissions es RESTRICT, asi
-- que borrar el permiso antes fallaria), despues las dos entradas del catalogo.
--
-- Borra las asignaciones de CUALQUIER rol, no solo las del `Administrador`: el `RESTRICT` de
-- `role_permissions_permission_code_fkey` no deja otra salida, y dejar el permiso huerfano no es
-- el estado anterior (R44). El `DELETE` va acotado POR CODIGO: ninguna otra asignacion se pierde.

DELETE FROM "role_permissions"
WHERE "permission_code" IN ('usuarios.consultar', 'usuarios.modificar');

DELETE FROM "permissions"
WHERE "code" IN ('usuarios.consultar', 'usuarios.modificar');
