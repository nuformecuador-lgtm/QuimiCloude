-- Retira el permiso `acondicionamiento.modificar` con TODAS sus asignaciones (no solo las que puso
-- el UP), las asignaciones del rol Administrador de acondicionamiento y el propio rol. No toca
-- ninguna otra fila.
--
-- Las asignaciones van primero: `role_permissions_permission_code_fkey` es RESTRICT, asi que
-- borrar el permiso antes fallaria, y dejar una asignacion huerfana tampoco es el estado anterior.
--
-- Si algun usuario tiene el rol, `users_role_id_fkey` (`ON DELETE RESTRICT`) hace fallar el ultimo
-- DELETE con `23503`, y con el la transaccion entera: la reversion no reasigna a nadie a otro rol
-- por su cuenta.
--
-- Sin `INSERT`, `UPDATE`, `ALTER`, `DROP` ni `CASCADE`.

DELETE FROM "role_permissions" WHERE "permission_code" = 'acondicionamiento.modificar';
DELETE FROM "role_permissions"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Administrador de acondicionamiento');
DELETE FROM "permissions" WHERE "code" = 'acondicionamiento.modificar';
DELETE FROM "roles" WHERE "name" = 'Administrador de acondicionamiento';
