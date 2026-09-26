-- Retira el permiso `empaque.modificar` con TODAS sus asignaciones (no solo la que puso el UP)
-- y el propio permiso. No toca ninguna otra fila, ni el rol Empacador.
--
-- La asignacion va primero: `role_permissions_permission_code_fkey` es RESTRICT, asi que borrar
-- el permiso antes fallaria.
--
-- Sin `INSERT`, `UPDATE`, `ALTER`, `DROP` ni `CASCADE`.

DELETE FROM "role_permissions" WHERE "permission_code" = 'empaque.modificar';
DELETE FROM "permissions" WHERE "code" = 'empaque.modificar';
