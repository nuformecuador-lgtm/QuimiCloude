-- Migracion de DATOS: no crea, altera ni borra ninguna tabla, columna, indice, restriccion, tipo
-- ni politica de RLS; solo escribe filas en `permissions` y `role_permissions`.
--
-- Las tres sentencias son idempotentes por `ON CONFLICT ... DO NOTHING`. La herencia del tercer
-- INSERT resuelve por permiso, no por nombre de rol: cualquier rol con `proveedores.modificar`
-- gana `documentos.modificar`, nunca `documentos.consultar`.
--
-- Escrita a mano porque es migracion de datos y `migrate dev` propondria un reset por el drift
-- conocido de migraciones anteriores.

INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('documentos.consultar', 'documentos', 'consultar',
   'Consultar los documentos de la empresa y el estado de su procesamiento.', CURRENT_TIMESTAMP),
  ('documentos.modificar', 'documentos', 'modificar',
   'Subir documentos PDF y encolar su procesamiento.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('documentos.consultar'), ('documentos.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT DISTINCT "rp"."role_id", 'documentos.modificar' FROM "role_permissions" AS "rp"
WHERE "rp"."permission_code" = 'proveedores.modificar'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
