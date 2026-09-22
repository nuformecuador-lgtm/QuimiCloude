-- QC-144: el rol Empacador y el permiso `terminados.consultar` en una instalacion QUE YA EXISTE.
-- Migracion de DATOS: no crea, altera ni borra ninguna tabla, columna, indice, restriccion, tipo
-- ni politica de RLS; solo escribe filas en `roles`, `permissions` y `role_permissions`.
--
-- Es la PRIMERA migracion que inserta en `roles`: los dos roles de hoy solo los crea el seed, que
-- corre en la instalacion y no en cada despliegue. Sin este INSERT, en una base ya sembrada el
-- subselect por nombre de los pasos 3a y 3b no encontraria al Empacador y no le asignaria nada, en
-- silencio.
--
-- Ninguna sentencia nombra al Operador: sus asignaciones no cambian. Las cuatro llevan
-- `ON CONFLICT ... DO NOTHING`, asi que aplicarla sobre una base donde el seed ya creo el rol, el
-- permiso o alguna asignacion no falla y no reescribe ninguna fila existente.
--
-- Generada a mano (sin `prisma migrate dev --create-only`): la base local tenia drift de checksum
-- en cuatro migraciones anteriores ajenas a esta ficha (`*_company_scope`), y `migrate dev` solo
-- ofrece resolverlo con un reset completo de la base de datos. `pnpm run db:migrate` (`prisma
-- migrate deploy`) no exige ese chequeo y aplica esta carpeta igual que cualquier otra. No hay
-- DDL generado que borrar: el archivo es enteramente manual, con la forma literal de QC-66 y QC-86.
--
-- Los literales `'Empacador'`, `'Administrador'` y las descripciones se duplican aqui porque una
-- migracion no puede importar TypeScript: el test estatico de esquema los compara importando
-- `ROLE_EMPACADOR`, `SEED_ROLES`, `PERMISSIONS` y `SEED_ROLE_PERMISSIONS`, para que divergir sea
-- rojo.

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
