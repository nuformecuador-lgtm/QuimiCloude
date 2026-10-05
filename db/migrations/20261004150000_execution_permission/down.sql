-- Retira el permiso `asignaciones.ejecutar` con TODAS sus asignaciones (no solo las que puso el
-- UP) y el propio permiso. No toca ninguna otra fila ni ningun rol.
--
-- La asignacion va primero: `role_permissions_permission_code_fkey` es RESTRICT, asi que borrar
-- el permiso antes fallaria.
--
-- Sin `INSERT`, `UPDATE`, `ALTER`, `DROP` ni `CASCADE`.

DELETE FROM "role_permissions" WHERE "permission_code" = 'asignaciones.ejecutar';
DELETE FROM "permissions" WHERE "code" = 'asignaciones.ejecutar';
