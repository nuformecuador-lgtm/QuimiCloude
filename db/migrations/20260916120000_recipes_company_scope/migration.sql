-- aislamiento-por-empresa-en-recetas.
--
-- `recipes` gana `company_id` NOT NULL con FK a `companies`; el unico de nombre pasa de
-- `(name_normalized)` GLOBAL a `(company_id, name_normalized)` y SIGUE SIENDO PARCIAL por
-- `deleted_at IS NULL`. `recipe_lines` no aparece en ninguna sentencia de este archivo: su
-- empresa es la de su receta y cae con ella por `ON DELETE CASCADE`.
--
-- Escrita entera a mano, no generada por `prisma migrate dev`: `recipes` ya carga con un
-- indice unico parcial, dos FK escritas a mano y RLS forzada, todo lo cual `migrate dev` lee
-- como drift y propone resetear una base con datos. Se aplica con `pnpm run db:migrate`
-- (`prisma migrate deploy`), que no mira drift.
--
-- Ningun `INSERT` y ningun `DELETE` en todo el archivo: solo anade una columna, actualiza las
-- filas que ya hay y releva un indice.
--
-- Prisma ejecuta este archivo dentro de una sola transaccion: cualquier `RAISE EXCEPTION` de
-- aqui abajo deshace todo y la migracion queda sin aplicar y sin marcar en `_prisma_migrations`.

-- ---------------------------------------------------------------------------------------
-- 0. `NO FORCE` temporal en `recipes` y `companies`.
--
-- Las dos tienen RLS activada y forzada sin ninguna policy, y bajo `FORCE` eso deniega todo
-- al dueno de la tabla -con quien conecta Prisma-, incluido el `SELECT`. Este archivo escribe
-- `recipes` y lee `companies` para resolver la empresa del backfill; sin soltarlas, esa
-- lectura devolveria cero filas y la migracion abortaria por el motivo equivocado.
--
-- `companies` se vuelve a forzar en cuanto termina de leerse (paso 2); `recipes`, al final
-- (paso 6), dentro de la misma transaccion.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipes"   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "companies" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. La columna nace ANULABLE: no hay un valor por defecto que no sea una mentira. Se rellena
-- en el paso 2 y se aprieta en el 3, en la misma transaccion.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipes" ADD COLUMN "company_id" UUID;

-- ---------------------------------------------------------------------------------------
-- 2. Backfill a la unica empresa real.
--
-- La empresa se resuelve por `name_normalized` y nunca por identificador: los uuid los genera
-- `gen_random_uuid()` y difieren en cada base. Si no hay ninguna con ese nombre, el unico
-- fallback admitido es que la tabla tenga exactamente una fila; cualquier otro caso aborta.
--
-- Afecta a todas las filas, incluidas las de borrado logico: la columna va a ser NOT NULL y
-- una receta borrada sigue siendo una fila.
--
-- SALIDA TEMPRANA SOBRE UNA BASE VACIA (anadida para arreglar el arranque en una base nueva):
-- con `recipes` en cero, el backfill es un no-op y no hay ninguna receta que repartir, asi que
-- la resolucion de la empresa ni siquiera se plantea. Mismo idioma que
-- `db/migrations/20260904180600_companies_and_user_company/migration.sql` (`IF usuarios = 0
-- THEN RETURN; END IF;`). En cuanto hay una sola receta, el `RETURN` no se dispara y
-- `RAISE EXCEPTION` sigue abortando igual si la empresa es ambigua o no existe.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  target_company_id  UUID;
  named_company_rows BIGINT;
  all_company_rows   BIGINT;
  updated_rows       BIGINT;
  total_rows         BIGINT;
  existing_rows      BIGINT;
BEGIN
  SELECT count(*) INTO existing_rows FROM "recipes";
  IF existing_rows = 0 THEN RETURN; END IF;

  SELECT count(*) INTO named_company_rows
    FROM "companies" WHERE "name_normalized" = 'quimicloud';

  IF named_company_rows = 1 THEN
    SELECT "id" INTO target_company_id
      FROM "companies" WHERE "name_normalized" = 'quimicloud';

  ELSIF named_company_rows = 0 THEN
    SELECT count(*) INTO all_company_rows FROM "companies";
    IF all_company_rows = 1 THEN
      SELECT "id" INTO target_company_id FROM "companies";
    ELSE
      RAISE EXCEPTION
        'recipes_company_scope: no se pudo identificar la empresa «QuimiCloud» (name_normalized = ''quimicloud'') y hay % empresa(s) en la tabla, asi que no hay una sola candidata. La migracion se detiene ENTERA y no deja ninguna columna, indice ni restriccion a medias. Crea la empresa inicial -`pnpm run db:seed`- o renombra la que corresponda antes de migrar.',
        all_company_rows;
    END IF;

  ELSE
    RAISE EXCEPTION
      'recipes_company_scope: hay % empresas con name_normalized = ''quimicloud'', asi que la empresa destino del backfill es AMBIGUA. La migracion se detiene ENTERA: elegir una cualquiera repartiria las recetas al azar entre dos clientes.',
      named_company_rows;
  END IF;

  -- `ROW_COUNT` contra el total de la PROPIA tabla: si la RLS estuviera filtrando el `UPDATE`,
  -- afectaria a cero filas en silencio y el `SET NOT NULL` del paso 3 fallaria mucho mas tarde
  -- y por otra razon. Fallar antes que dejar recetas a medias.
  UPDATE "recipes" SET "company_id" = target_company_id;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "recipes";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'recipes_company_scope: el backfill de `recipes` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar recetas sin empresa.',
      updated_rows, total_rows;
  END IF;
END $$;

-- `companies` solo se leyo: vuelve activada y forzada tal cual estaba.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 3. Y ahora si, OBLIGATORIA. Llegar hasta aqui significa que todas las filas tienen empresa.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipes" ALTER COLUMN "company_id" SET NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 4. La FK a `companies`. `ON DELETE RESTRICT`: `companies` tiene borrado logico, asi que un
-- borrado fisico de empresa no puede dejar recetas huerfanas.
--
-- Es drift a proposito: `companyId` se declara escalar sin `@relation` en `db/schema.prisma`,
-- para que `recetas` no pueda atravesar a `companies` con un `include`.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 5. El relevo del indice unico de nombre: de GLOBAL a POR EMPRESA, y sigue siendo PARCIAL.
--
-- La guardia va antes del `CREATE UNIQUE INDEX` para abortar con un mensaje util en vez de
-- con un `23505` suelto. Con el indice global todavia vivo en este punto, la condicion es
-- imposible hoy -por eso se escribe igual, para el dia que deje de serlo-.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  duplicated_names BIGINT;
  duplicated_rows  BIGINT;
BEGIN
  SELECT count(*), COALESCE(sum(repeated.copies), 0)
    INTO duplicated_names, duplicated_rows
    FROM (
      SELECT "company_id", "name_normalized", count(*) AS copies
        FROM "recipes"
       WHERE "deleted_at" IS NULL
       GROUP BY "company_id", "name_normalized"
      HAVING count(*) > 1
    ) AS repeated;

  IF duplicated_names > 0 THEN
    RAISE EXCEPTION
      'recipes_company_scope: hay % nombre(s) normalizado(s) compartido(s) por mas de una receta VIVA dentro de la misma empresa, repartidos en % fila(s) de `recipes`. El indice unico `recipes_company_name_unique` (empresa, nombre) no se puede crear sobre ese dato: la migracion se detiene ENTERA y no deja ningun indice a medias. Localizalas con: SELECT company_id, name_normalized, count(*) FROM recipes WHERE deleted_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1; y renombra o da de baja a mano las recetas repetidas antes de volver a migrar.',
      duplicated_names, duplicated_rows;
  END IF;
END $$;

-- El unico GLOBAL cae antes de crear el compuesto: con el, dos empresas no podrian tener cada
-- una su propia receta con el mismo nombre.
DROP INDEX "recipes_name_unique";

-- Sigue siendo PARCIAL: una receta borrada logicamente libera su nombre para su empresa. Sin
-- el `WHERE`, la unicidad alcanzaria tambien a las recetas borradas y esa liberacion dejaria
-- de cumplirse en silencio. No hace falta un indice propio de `company_id`: este lo lleva de
-- cabeza y sirve igual para lo que haga falta filtrar por empresa.
CREATE UNIQUE INDEX "recipes_company_name_unique"
  ON "recipes" ("company_id", "name_normalized")
  WHERE "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------------------
-- 6. Se cierra el parentesis de `recipes`: RLS vuelve ACTIVADA Y FORZADA, sin policies.
-- Explicito e idempotente. `recipe_lines` no se toco en ningun paso y conserva la suya.
--
-- Es defensa en profundidad, no la frontera de autorizacion: Prisma conecta como dueno y no
-- setea `request.jwt.claims`, asi que el aislamiento por empresa lo hace el filtro del
-- adaptador, no una policy.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipes" FORCE ROW LEVEL SECURITY;
