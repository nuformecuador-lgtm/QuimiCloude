-- Migracion de DATOS: no crea, altera ni borra ninguna tabla, columna, indice, restriccion, tipo
-- ni politica de RLS; solo escribe filas en `permissions` y `role_permissions`.
--
-- El rol Empacador ya existe (lo creo `20260922120000_packer_role`): aqui solo se le suma un
-- permiso mas. Ninguna sentencia nombra al Administrador ni al Operador a proposito: sus
-- asignaciones no cambian. Las dos son idempotentes por `ON CONFLICT ... DO NOTHING`.
--
-- Los literales se duplican porque una migracion no puede importar TypeScript, y un test estatico
-- de esquema los compara contra las constantes de la app.

-- 1. El permiso.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('empaque.modificar', 'empaque', 'modificar',
   'Comenzar y terminar el empaque de los pedidos de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 2. El Empacador gana el permiso nuevo, resuelto por nombre de rol.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'empaque.modificar' FROM "roles" AS "r"
WHERE "r"."name" = 'Empacador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
