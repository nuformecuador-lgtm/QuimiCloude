-- Migracion de DATOS: no crea, altera ni borra ninguna tabla, columna, indice, restriccion, tipo
-- ni politica de RLS; solo escribe filas en `permissions` y `role_permissions`.
--
-- Suma el permiso `asignaciones.ejecutar` y se lo da al Administrador y al Operador, resueltos por
-- nombre de rol. El Empacador y el Maestro no lo reciben. Las dos sentencias son idempotentes por
-- `ON CONFLICT ... DO NOTHING`.
--
-- Los literales se duplican porque una migracion no puede importar TypeScript, y un test de
-- integracion los compara contra las constantes de la app.

-- 1. El permiso.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('asignaciones.ejecutar', 'asignaciones', 'ejecutar',
   'Entrar, comenzar y terminar la ejecución de los pedidos asignados.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 2. El Administrador y el Operador ganan el permiso nuevo.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'asignaciones.ejecutar' FROM "roles" AS "r"
WHERE "r"."name" IN ('Administrador', 'Operador')
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
