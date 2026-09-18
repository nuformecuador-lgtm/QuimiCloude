-- DOWN de recipes_company_scope. Convencion del repo: Prisma Migrate no genera downs. Lo
-- aplica `pnpm run db:rollback`, que ejecuta este archivo y borra su fila de
-- `_prisma_migrations` en una sola transaccion: cualquier `RAISE EXCEPTION` deshace todo.
--
-- Revierte el `migration.sql` en orden inverso y no borra ninguna fila: este archivo no tiene
-- un solo `DELETE`.
--
-- Las tres guardias de datos van primero; sin ellas el DOWN perderia dato en silencio:
--   1. si la empresa que escribio el UP es ambigua, no hay forma de distinguir el dato propio
--      del ajeno;
--   2. quitar `company_id` mezclaria las recetas de varias empresas en un unico monton
--      indistinguible; y
--   3. si dos recetas vivas de empresas distintas comparten nombre, el indice unico GLOBAL no
--      se puede recrear, y renombrar o borrar la que estorba descartaria dato de un cliente.
--
-- SALIDA TEMPRANA SOBRE UNA BASE VACIA (mismo arreglo que el UP): con `recipes` en cero no hay
-- ninguna receta que proteger --ni receta ajena, ni nombre repetido entre empresas--, asi que
-- las tres guardias ni se plantean. Mismo idioma que
-- `db/migrations/20260904180600_companies_and_user_company`. En cuanto hay una sola receta, el
-- `RETURN` no se dispara y las tres guardias siguen abortando igual.

-- ---------------------------------------------------------------------------------------
-- 0. `NO FORCE` temporal, por lo mismo que en el UP: con RLS forzada y sin policies, las
-- guardias de aqui abajo leerian cero filas y el DOWN abortaria siempre con el mensaje
-- equivocado. Se leen las dos tablas y no se escribe ninguna. `companies` se vuelve a forzar
-- en cuanto termina su unico lector; `recipes`, al final.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "companies" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "recipes"   NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. Las tres guardias de datos. Cualquiera de ellas ABORTA LA REVERSION ENTERA.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  target_company_id  UUID;
  named_company_rows BIGINT;
  all_company_rows   BIGINT;
  foreign_recipe_rows BIGINT;
  duplicated_names   BIGINT;
  duplicated_rows    BIGINT;
  existing_rows      BIGINT;
BEGIN
  SELECT count(*) INTO existing_rows FROM "recipes";
  IF existing_rows = 0 THEN RETURN; END IF;

  -- 1.1. GUARDIA 1 — identificar la empresa que escribio el UP, igual que en el UP (por
  -- `name_normalized`, con el unico fallback de una sola empresa) y nunca por identificador.
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
        'recipes_company_scope down: no se pudo identificar la empresa que escribio el UP (name_normalized = ''quimicloud'') y hay % empresa(s) en la tabla. Sin saber cual es, no hay forma de distinguir las recetas que asigno la migracion de las que creo alguien despues: la reversion se detiene ENTERA. Renombra la empresa que corresponda antes de revertir.',
        all_company_rows;
    END IF;
  ELSE
    RAISE EXCEPTION
      'recipes_company_scope down: hay % empresas con name_normalized = ''quimicloud'', asi que la empresa que escribio el UP es AMBIGUA: la reversion se detiene ENTERA.',
      named_company_rows;
  END IF;

  -- 1.2. GUARDIA 2 — recetas de OTRA empresa. Quitar `company_id` las convertiria en un
  -- unico monton indistinguible junto con las de la empresa del backfill.
  SELECT count(*) INTO foreign_recipe_rows
    FROM "recipes" WHERE "company_id" <> target_company_id;

  IF foreign_recipe_rows > 0 THEN
    RAISE EXCEPTION
      'recipes_company_scope down: hay % receta(s) que pertenecen a una empresa distinta de la que escribio el UP (%). Revertir borraria `company_id` y convertiria las recetas de varias empresas en un unico monton indistinguible: la reversion se detiene ENTERA. Localizalas con: SELECT id, company_id, name FROM recipes WHERE company_id <> ''%''; y mueve o elimina a mano esas recetas antes de revertir.',
      foreign_recipe_rows, target_company_id, target_company_id;
  END IF;

  -- 1.3. GUARDIA 3 — dos recetas VIVAS de empresas DISTINTAS con el mismo nombre
  -- normalizado. Es la condicion exacta que hace imposible recrear el indice unico GLOBAL
  -- `recipes_name_unique`: con 48 empresas de prueba en el catalogo, dos «Desengrasante
  -- industrial» dejan de ser hipoteticas en cuanto la segunda da de alta una receta.
  -- Renombrar o borrar la que estorba descartaria dato de un cliente en silencio, que es peor
  -- que no poder revertir.
  SELECT count(*), COALESCE(sum(repeated.copies), 0)
    INTO duplicated_names, duplicated_rows
    FROM (
      SELECT "name_normalized", count(DISTINCT "company_id") AS companies, count(*) AS copies
        FROM "recipes"
       WHERE "deleted_at" IS NULL
       GROUP BY "name_normalized"
      HAVING count(DISTINCT "company_id") > 1
    ) AS repeated;

  IF duplicated_names > 0 THEN
    RAISE EXCEPTION
      'recipes_company_scope down: hay % nombre(s) normalizado(s) compartido(s) por recetas VIVAS de mas de una empresa, repartidos en % fila(s) de `recipes`. El indice unico GLOBAL `recipes_name_unique` que este DOWN tiene que restaurar no se puede crear sobre ese dato, y renombrar o borrar la receta que estorba DESCARTARIA DATO DE UN CLIENTE EN SILENCIO: la reversion se detiene ENTERA. Localizalas con: SELECT name_normalized, count(DISTINCT company_id) FROM recipes WHERE deleted_at IS NULL GROUP BY 1 HAVING count(DISTINCT company_id) > 1; y renombra o da de baja a mano las recetas de las demas empresas antes de revertir.',
      duplicated_names, duplicated_rows;
  END IF;
END $$;

-- `companies` solo se leyo: vuelve activada y forzada en cuanto termina su unico lector.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 2. La unicidad de nombre vuelve a ser GLOBAL (paso 5 del UP, al reves): el compuesto por
-- empresa cae y se recrea `recipes_name_unique` tal cual la dejo la migracion original -
-- unico, PARCIAL por `deleted_at IS NULL`, sobre `name_normalized`-.
-- ---------------------------------------------------------------------------------------
DROP INDEX "recipes_company_name_unique";

CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------------------
-- 3. La FK a `companies` y la columna (pasos 4, 3 y 1 del UP, al reves).
--
-- La FK se dropea explicitamente, para que este archivo diga que quita; el `SET NOT NULL` se
-- va con la columna. La guardia 2 ya garantizo que no hay recetas de otra empresa. `ADD
-- COLUMN` puso la columna al final, asi que el orden ordinal de las demas queda como estaba.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_company_id_fkey";

ALTER TABLE "recipes" DROP COLUMN "company_id";

-- ---------------------------------------------------------------------------------------
-- 4. La RLS de `recipes` vuelve ACTIVADA Y FORZADA, como antes del UP. Explicito e
-- idempotente: si alguien revierte a mitad de un UP fallido, la tabla no puede quedarse sin
-- forzar.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipes" FORCE ROW LEVEL SECURITY;
