-- El rol Maestro, dueno de la plataforma: el unico usuario sin empresa. Sus dos permisos, la
-- empresa obligatoria segun el rol y el nombre de usuario unico en todo el sistema.
--
-- `migrate dev --create-only` genero ademas `DROP CONSTRAINT` de las FK escritas a mano y
-- `DROP INDEX` de indices escritos a mano que Prisma no modela: es drift conocido y se borro.
-- De lo generado solo queda el `DROP NOT NULL` del paso 1.
--
-- Los literales 'Maestro' y los dos codigos se duplican porque una migracion no puede importar
-- TypeScript; un test estatico los compara con las constantes de la app. Renombrar el rol obliga
-- a una migracion que rehaga `users_check_company_by_role`, que lo compara por nombre.
--
-- RLS: `users`, `roles`, `permissions` y `role_permissions` ya la tienen forzada; no se toca.

-- 0. Si dos usuarios vivos comparten nombre de usuario, el indice del paso 6 no se puede crear. Se
--    falla con la lista antes de tocar nada, sin renombrar ni dar de baja a nadie: Prisma corre el
--    archivo en una transaccion y no queda nada aplicado.
DO $$
DECLARE
  repetidos TEXT;
BEGIN
  SELECT string_agg(format('%s (%s usuarios)', nombre, total), ', ' ORDER BY nombre)
    INTO repetidos
    FROM (
      SELECT lower("username") AS nombre, count(*) AS total
        FROM "users" WHERE "deleted_at" IS NULL
       GROUP BY lower("username") HAVING count(*) > 1
    ) AS d;
  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'users_username_global: nombres de usuario repetidos entre usuarios vivos: %. '
      'Resuelvelos a mano antes de aplicar esta migracion.', repetidos
      USING ERRCODE = '23505';
  END IF;
END $$;

-- 1. La empresa deja de ser obligatoria en la columna; el disparador del paso 5 la vuelve a exigir
--    para todo rol que no sea el Maestro.
ALTER TABLE "users" ALTER COLUMN "company_id" DROP NOT NULL;

-- 2. El rol.
INSERT INTO "roles" ("name", "description", "updated_at") VALUES
  ('Maestro', 'Dueno de la plataforma: gestiona las empresas.', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 3. Los dos permisos.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('empresas.consultar', 'empresas', 'consultar', 'Consultar las empresas de la plataforma.', CURRENT_TIMESTAMP),
  ('empresas.modificar', 'empresas', 'modificar', 'Dar de alta, editar y dar de baja empresas de la plataforma.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 4. El Maestro: exactamente sus dos. Ninguna sentencia nombra a otro rol.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('empresas.consultar'), ('empresas.modificar')) AS "p"("code")
WHERE "r"."name" = 'Maestro'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

-- 5. Empresa segun rol: el Maestro sin empresa, cualquier otro con ella. Las filas existentes ya
--    cumplen (todas tienen empresa y ninguna es Maestro). Solo salta cuando cambian la empresa o el
--    rol: bloqueos, estado de cuenta y sello de sesiones no pagan la consulta a `roles`.
CREATE OR REPLACE FUNCTION users_check_company_by_role()
  RETURNS TRIGGER AS $users_check_company_by_role$
DECLARE
  role_name TEXT;
BEGIN
  SELECT r."name" INTO role_name FROM "roles" AS r WHERE r."id" = NEW."role_id";
  -- Rol inexistente: lo rechaza "users_role_id_fkey" con su 23503.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF role_name = 'Maestro' AND NEW."company_id" IS NOT NULL THEN
    RAISE EXCEPTION 'users_platform_role_without_company: el rol Maestro no pertenece a ninguna empresa'
      USING ERRCODE = '23514';
  END IF;
  -- 23502, el mismo codigo que daba el NOT NULL de la columna.
  IF role_name <> 'Maestro' AND NEW."company_id" IS NULL THEN
    RAISE EXCEPTION 'users_company_required: todo usuario que no sea Maestro necesita empresa'
      USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END;
$users_check_company_by_role$ LANGUAGE plpgsql;

CREATE TRIGGER "users_check_company_by_role_trigger"
  BEFORE INSERT OR UPDATE OF "company_id", "role_id" ON "users"
  FOR EACH ROW EXECUTE FUNCTION users_check_company_by_role();

-- 6. El nombre de usuario, unico en todo el sistema: mismo nombre de indice, sin `company_id`. Es
--    el texto literal de la migracion de usuarios y roles.
DROP INDEX "users_username_unique";
CREATE UNIQUE INDEX "users_username_unique" ON "users" (lower("username")) WHERE "deleted_at" IS NULL;

-- 7. Correo y documento entre usuarios sin empresa. Los de empresa siguen con sus indices por
--    empresa, que no se tocan.
CREATE UNIQUE INDEX "users_email_without_company_unique"
  ON "users" (lower("email")) WHERE "company_id" IS NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_document_without_company_unique"
  ON "users" ("document_type_code", "document_number") WHERE "company_id" IS NULL AND "deleted_at" IS NULL;
