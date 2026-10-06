-- Migracion de DATOS: no crea, altera ni borra ninguna tabla, columna, indice, restriccion, tipo,
-- funcion, disparador ni politica de RLS; solo escribe filas en `roles`, `permissions` y
-- `role_permissions`.
--
-- Ninguna sentencia nombra a otro rol a proposito: el Administrador no recibe el permiso nuevo y
-- las asignaciones del Operador, el Empacador y el Maestro no cambian. Las tres son idempotentes
-- por `ON CONFLICT ... DO NOTHING`.
--
-- Los literales se duplican porque una migracion no puede importar TypeScript, y un test estatico
-- de esquema los compara contra las constantes de la app.
--
-- `migrate dev --create-only` genero ademas `DROP CONSTRAINT` y `DROP INDEX` de objetos escritos a
-- mano en migraciones anteriores, que el esquema de Prisma no declara (drift conocido); se
-- borraron porque esta migracion no toca el esquema.

-- 1. El rol.
INSERT INTO "roles" ("name", "description", "updated_at") VALUES
  ('Administrador de acondicionamiento', 'Acondiciona los pedidos empacados de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 2. El permiso.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('acondicionamiento.modificar', 'acondicionamiento', 'modificar',
   'Comenzar y terminar el acondicionamiento de los pedidos de la empresa y registrar sus datos de lote.',
   CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 3. El rol nuevo: exactamente sus dos, uno a uno.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('asignaciones.consultar'), ('acondicionamiento.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador de acondicionamiento'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
