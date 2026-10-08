-- Retira el permiso `entregas.modificar` con TODAS sus asignaciones (no solo las que puso el UP)
-- y el propio permiso. No toca ninguna otra fila ni ningun rol.
--
-- La asignacion va primero: `role_permissions_permission_code_fkey` es RESTRICT, asi que borrar
-- el permiso antes fallaria.
--
-- Sin `INSERT`, `UPDATE`, `ALTER`, `DROP` ni `CASCADE`.

DELETE FROM "role_permissions" WHERE "permission_code" = 'entregas.modificar';
DELETE FROM "permissions" WHERE "code" = 'entregas.modificar';
