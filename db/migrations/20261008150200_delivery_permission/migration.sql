-- Migracion de DATOS: no crea, altera ni borra ninguna tabla, columna, indice, restriccion, tipo
-- ni politica de RLS; solo escribe filas en `permissions` y `role_permissions`.
--
-- Suma el permiso `entregas.modificar` y se lo da solo al Administrador, resuelto por nombre de
-- rol. Las dos sentencias son idempotentes por `ON CONFLICT ... DO NOTHING`.
--
-- Los literales se duplican porque una migracion no puede importar TypeScript, y un test de
-- integracion los compara contra las constantes de la app.

-- 1. El permiso.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('entregas.modificar', 'entregas', 'modificar',
   'Entregar al cliente el producto terminado de los pedidos de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 2. El Administrador gana el permiso nuevo.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'entregas.modificar' FROM "roles" AS "r" WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
