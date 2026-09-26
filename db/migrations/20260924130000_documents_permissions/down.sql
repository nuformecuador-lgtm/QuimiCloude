-- Reversion exacta de `migration.sql`. Las asignaciones caen antes que los permisos:
-- `role_permissions_permission_code_fkey` es RESTRICT. El primer DELETE borra los dos codigos de
-- cualquier rol, incluidas las heredadas por el tercer INSERT del UP: antes del UP nadie las
-- tenia, asi que es el estado anterior exacto.
--
-- Sin `UPDATE`, `ALTER`, `DROP` ni `CASCADE`.

DELETE FROM "role_permissions" WHERE "permission_code" IN ('documentos.consultar', 'documentos.modificar');
DELETE FROM "permissions" WHERE "code" IN ('documentos.consultar', 'documentos.modificar');
