-- Migracion de DATOS: solo escribe filas en `permissions` y `role_permissions`; no toca el
-- esquema ni la tabla `roles`. Las dos sentencias son idempotentes por `ON CONFLICT ... DO NOTHING`.
-- Los literales se duplican porque una migracion no puede importar TypeScript, y un test estatico
-- los compara contra las constantes de la app.

INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('integraciones.modificar', 'integraciones', 'modificar',
   'Ver y configurar las integraciones con servicios externos.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'integraciones.modificar' FROM "roles" AS "r"
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
