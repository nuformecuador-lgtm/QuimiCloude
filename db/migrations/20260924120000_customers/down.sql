-- Reversion exacta de `migration.sql`. Las asignaciones caen antes que los permisos:
-- `role_permissions_permission_code_fkey` es RESTRICT. El primer DELETE borra los dos codigos de
-- cualquier rol, no solo del Administrador: un permiso huerfano no es el estado anterior.
--
-- `DROP TABLE` se lleva la tabla, sus indices y sus FK. Sin CASCADE: si una ficha posterior cuelga
-- una FK de `customers`, revertir esta sin revertir aquella debe fallar ruidosamente.

DELETE FROM "role_permissions" WHERE "permission_code" IN ('clientes.consultar', 'clientes.modificar');
DELETE FROM "permissions" WHERE "code" IN ('clientes.consultar', 'clientes.modificar');
DROP TABLE "customers";
