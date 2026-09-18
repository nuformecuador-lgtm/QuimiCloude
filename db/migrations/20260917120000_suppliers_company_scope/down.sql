-- DOWN de suppliers_company_scope. Convencion del repo: Prisma Migrate no genera downs. Lo
-- aplica `pnpm run db:rollback`, que ejecuta este archivo y borra su fila de
-- `_prisma_migrations` en una sola transaccion: cualquier `RAISE EXCEPTION` deshace todo.
--
-- Revierte el `migration.sql` en orden inverso y no borra ninguna fila: este archivo no tiene un
-- solo `DELETE`.
--
-- Las tres guardias de datos van primero; sin ellas el DOWN perderia dato en silencio:
--   1. si la empresa que escribio el UP es ambigua, no hay forma de distinguir el dato propio
--      del ajeno;
--   2. quitar `company_id` mezclaria los proveedores y las lineas de varias empresas en un unico
--      monton indistinguible; y
--   3. si dos proveedores vivos de empresas distintas comparten nombre, el indice unico GLOBAL
--      no se puede recrear, y renombrar o borrar la fila que estorba descartaria dato de un
--      cliente.
--
-- SALIDA TEMPRANA SOBRE UNA BASE VACIA (mismo arreglo que el UP): con las dos tablas en cero no
-- hay nada que proteger --ni proveedor ajeno, ni linea ajena, ni nombre repetido entre
-- empresas--, asi que las tres guardias ni se plantean. Mismo idioma que
-- `db/migrations/20260904180600_companies_and_user_company`. En cuanto hay una sola fila, el
-- `RETURN` no se dispara y las tres guardias siguen abortando igual.

-- ---------------------------------------------------------------------------------------
-- 0. `NO FORCE` temporal en las cuatro tablas, por lo mismo que en el UP: con RLS forzada y sin
-- policies, las guardias de aqui abajo leerian cero filas y el DOWN abortaria siempre con el
-- mensaje equivocado. Las cuatro se vuelven a forzar juntas al final (paso 6), una vez
-- terminadas las guardias y las alteraciones sobre las cuatro.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "companies"              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"          NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "suppliers"              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. Las tres guardias de datos. Cualquiera de ellas ABORTA LA REVERSION ENTERA.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  target_company_id   UUID;
  named_company_rows  BIGINT;
  all_company_rows    BIGINT;
  foreign_supplier_rows BIGINT;
  foreign_line_rows   BIGINT;
  duplicated_names    BIGINT;
  duplicated_rows     BIGINT;
  existing_rows       BIGINT;
BEGIN
  SELECT (SELECT count(*) FROM "suppliers")
       + (SELECT count(*) FROM "supplier_catalog_lines")
    INTO existing_rows;
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
        'suppliers_company_scope down: no se pudo identificar la empresa que escribio el UP (name_normalized = ''quimicloud'') y hay % empresa(s) en la tabla. Sin saber cual es, no hay forma de distinguir los proveedores que asigno la migracion de los que creo alguien despues: la reversion se detiene ENTERA. Renombra la empresa que corresponda antes de revertir.',
        all_company_rows;
    END IF;
  ELSE
    RAISE EXCEPTION
      'suppliers_company_scope down: hay % empresas con name_normalized = ''quimicloud'', asi que la empresa que escribio el UP es AMBIGUA: la reversion se detiene ENTERA.',
      named_company_rows;
  END IF;

  -- 1.2. GUARDIA 2 — proveedores o lineas de OTRA empresa. Quitar `company_id` los convertiria
  -- en un unico monton indistinguible junto con los de la empresa del backfill. Se cuentan las
  -- dos tablas por separado, cada una con su propio mensaje.
  SELECT count(*) INTO foreign_supplier_rows
    FROM "suppliers" WHERE "company_id" <> target_company_id;

  IF foreign_supplier_rows > 0 THEN
    RAISE EXCEPTION
      'suppliers_company_scope down: hay % proveedor(es) que pertenecen a una empresa distinta de la que escribio el UP (%). Revertir borraria `company_id` y convertiria los proveedores de varias empresas en un unico monton indistinguible: la reversion se detiene ENTERA. Localizalos con: SELECT id, company_id, name FROM suppliers WHERE company_id <> ''%''; y mueve o elimina a mano esos proveedores antes de revertir.',
      foreign_supplier_rows, target_company_id, target_company_id;
  END IF;

  SELECT count(*) INTO foreign_line_rows
    FROM "supplier_catalog_lines" WHERE "company_id" <> target_company_id;

  IF foreign_line_rows > 0 THEN
    RAISE EXCEPTION
      'suppliers_company_scope down: hay % linea(s) de catalogo que pertenecen a una empresa distinta de la que escribio el UP (%). Revertir borraria `company_id` y convertiria las lineas de varias empresas en un unico monton indistinguible: la reversion se detiene ENTERA. Localizalas con: SELECT id, company_id, supplier_id, name FROM supplier_catalog_lines WHERE company_id <> ''%''; y mueve o elimina a mano esas lineas antes de revertir.',
      foreign_line_rows, target_company_id, target_company_id;
  END IF;

  -- 1.3. GUARDIA 3 — dos proveedores VIVOS de empresas DISTINTAS con el mismo nombre
  -- normalizado. Es la condicion exacta que hace imposible recrear el indice unico GLOBAL
  -- `suppliers_name_unique`: con 48 empresas de prueba en el catalogo, dos «Quimicos del
  -- Pacifico» dejan de ser hipoteticos en cuanto la segunda da de alta un proveedor. Renombrar o
  -- borrar el que estorba descartaria dato de un cliente en silencio, que es peor que no poder
  -- revertir.
  SELECT count(*), COALESCE(sum(repeated.copies), 0)
    INTO duplicated_names, duplicated_rows
    FROM (
      SELECT "name_normalized", count(DISTINCT "company_id") AS companies, count(*) AS copies
        FROM "suppliers"
       WHERE "deleted_at" IS NULL
       GROUP BY "name_normalized"
      HAVING count(DISTINCT "company_id") > 1
    ) AS repeated;

  IF duplicated_names > 0 THEN
    RAISE EXCEPTION
      'suppliers_company_scope down: hay % nombre(s) normalizado(s) compartido(s) por proveedores VIVOS de mas de una empresa, repartidos en % fila(s) de `suppliers`. El indice unico GLOBAL `suppliers_name_unique` que este DOWN tiene que restaurar no se puede crear sobre ese dato, y renombrar o borrar el proveedor que estorba DESCARTARIA DATO DE UN CLIENTE EN SILENCIO: la reversion se detiene ENTERA. Localizalos con: SELECT name_normalized, count(DISTINCT company_id) FROM suppliers WHERE deleted_at IS NULL GROUP BY 1 HAVING count(DISTINCT company_id) > 1; y renombra o da de baja a mano los proveedores de las demas empresas antes de revertir.',
      duplicated_names, duplicated_rows;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 2. Las dos FK COMPUESTAS fuera, despues las dos FK simples a `companies` fuera, y despues las
-- dos claves candidatas fuera (pasos 6 del UP, al reves).
--
-- Las compuestas caen ANTES que las candidatas que referencian: al reves, Postgres se niega a
-- soltar una clave unica mientras una FK la referencie. Las FK simples hacia `suppliers` y
-- `presentations` que ya existian -`supplier_catalog_lines_supplier_id_fkey` y
-- `supplier_catalog_lines_presentation_id_fkey`- nunca se tocaron y no se tocan aqui.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey";
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_supplier_id_fkey";

ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_fkey";
ALTER TABLE "suppliers"              DROP CONSTRAINT "suppliers_company_id_fkey";

ALTER TABLE "presentations" DROP CONSTRAINT "presentations_company_id_id_key";
ALTER TABLE "suppliers"     DROP CONSTRAINT "suppliers_company_id_id_key";

-- ---------------------------------------------------------------------------------------
-- 3. La unicidad de nombre vuelve a ser GLOBAL y sigue siendo PARCIAL (paso 7 del UP, al reves).
-- La guardia 3 ya garantizo que el dato lo admite.
-- ---------------------------------------------------------------------------------------
DROP INDEX "suppliers_company_name_unique";

CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized") WHERE "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------------------
-- 4. El indice compuesto de la linea fuera (paso 7 del UP, al reves).
-- ---------------------------------------------------------------------------------------
DROP INDEX "supplier_catalog_lines_company_id_supplier_id_idx";

-- ---------------------------------------------------------------------------------------
-- 5. Las dos columnas fuera (pasos 5 y 1 del UP, al reves).
--
-- El `SET NOT NULL` se va con la columna. Las guardias 2 y 3 ya garantizaron que no hay dato de
-- otra empresa ni nombres que choquen. `ADD COLUMN` puso las columnas al final, asi que el orden
-- ordinal de las demas queda como estaba.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "suppliers"              DROP COLUMN "company_id";
ALTER TABLE "supplier_catalog_lines" DROP COLUMN "company_id";

-- ---------------------------------------------------------------------------------------
-- 6. La RLS de las cuatro tablas vuelve ACTIVADA Y FORZADA, como antes del UP. Explicito e
-- idempotente: si alguien revierte a mitad de un UP fallido, ninguna tabla puede quedarse sin
-- forzar.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "companies"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies"              FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations"          FORCE ROW LEVEL SECURITY;
ALTER TABLE "suppliers"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers"              FORCE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" FORCE ROW LEVEL SECURITY;
