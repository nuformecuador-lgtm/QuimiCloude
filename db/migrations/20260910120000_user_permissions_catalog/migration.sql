-- QC-66: el catalogo de permisos pasa de ONCE a TRECE. Migracion de DATOS: no crea, modifica ni
-- borra ninguna columna, indice, restriccion ni tipo (R43). Los tres indices unicos de `users`
-- (QC-47) NO se tocan (R38). Los dos codigos y sus descripciones son los de
-- `lib/modules/identity/domain/permissions.ts`, que sigue siendo el unico dueno del catalogo; el
-- test estatico los compara importando esa constante, no copiandola.
--
-- Idempotente por `ON CONFLICT DO NOTHING` (R11): aplicarla sobre una base donde el seed ya
-- sembro los dos codigos no falla y no reescribe nada. `updated_at` no tiene default en
-- `permissions`, asi que se escribe explicito.

INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('usuarios.consultar', 'usuarios', 'consultar',
   'Consultar los usuarios de la empresa.', CURRENT_TIMESTAMP),
  ('usuarios.modificar', 'usuarios', 'modificar',
   'Crear, editar, borrar y cambiar el estado de cuenta de los usuarios de la empresa.',
   CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Las dos asignaciones, UNA A UNA (decision 1: `modificar` NO implica `consultar`). El rol se
-- resuelve POR NOMBRE con un subselect, nunca con un uuid escrito a mano: `roles.id` es
-- `gen_random_uuid()` y es distinto en cada instalacion.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code"
FROM "roles" AS "r"
CROSS JOIN (VALUES ('usuarios.consultar'), ('usuarios.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
