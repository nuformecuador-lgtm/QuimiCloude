-- Migracion de DATOS: no crea, altera ni borra ninguna tabla, columna, indice, restriccion, tipo
-- ni politica de RLS; solo escribe filas en `roles`, `permissions` y `role_permissions`.
--
-- Es la primera migracion que inserta en `roles`. Sin este INSERT, en una base ya sembrada el
-- subselect por nombre de los pasos 3a y 3b no encontraria al Empacador y no le asignaria nada,
-- en silencio.
--
-- Ninguna sentencia nombra al Operador a proposito: sus asignaciones no cambian. Las cuatro son
-- idempotentes por `ON CONFLICT ... DO NOTHING`.
--
-- Los literales se duplican porque una migracion no puede importar TypeScript, y un test estatico
-- de esquema los compara contra las constantes de la app.
--
-- Escrita a mano porque `migrate dev` exigia un reset completo de la base por drift de checksum
-- en migraciones anteriores.

-- 1. El rol.
INSERT INTO "roles" ("name", "description", "updated_at") VALUES
  ('Empacador', 'Prepara los pedidos asignados y consulta los terminados.', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 2. El permiso.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('terminados.consultar', 'terminados', 'consultar',
   'Consultar todos los pedidos terminados de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 3a. El Administrador gana el permiso nuevo.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'terminados.consultar' FROM "roles" AS "r"
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

-- 3b. El Empacador: exactamente sus dos, uno a uno.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('asignaciones.consultar'), ('terminados.consultar')) AS "p"("code")
WHERE "r"."name" = 'Empacador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
