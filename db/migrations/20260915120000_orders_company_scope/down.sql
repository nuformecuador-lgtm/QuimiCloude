-- DOWN de orders_company_scope. Convencion del repo: Prisma Migrate no genera downs. Lo aplica
-- `pnpm run db:rollback`, que ejecuta este archivo y borra su fila de `_prisma_migrations` en una
-- sola transaccion: cualquier `RAISE EXCEPTION` deshace todo.
--
-- Revierte el `migration.sql` en orden inverso. No borra ni inserta ninguna fila.
--
-- Las tres guardias de datos van primero; sin ellas el DOWN perderia dato en silencio:
--   1. si dos empresas comparten `(ano, secuencia)`, el unico GLOBAL no se puede recrear, y
--      renumerar o borrar la fila que estorba descartaria el pedido de un cliente;
--   2. quitar `company_id` mezclaria los pedidos de varias empresas; y
--   3. volver a la FK SIMPLE dejaria sin vigilar las asignaciones cuya empresa no es la de su
--      pedido.
--
-- Solo se acepta descartar lo que escribio el propio UP: la empresa del backfill.
--
-- SALIDA TEMPRANA SOBRE UNA BASE VACIA (mismo arreglo que el UP): con `orders` en cero no hay
-- ningun pedido que proteger --ni pareja repetida, ni pedido ajeno, ni asignacion cruzada--,
-- asi que las tres guardias ni se plantean. Mismo idioma que
-- `db/migrations/20260904180600_companies_and_user_company`. En cuanto hay un solo pedido, el
-- `RETURN` no se dispara y las tres guardias siguen abortando igual.

-- ---------------------------------------------------------------------------------------
-- 0. `NO FORCE` temporal, por lo mismo que en el UP: con RLS forzada y sin policies, las
-- guardias leerian cero filas y el DOWN abortaria siempre con el mensaje equivocado.
--
-- Se leen las tres tablas y no se escribe ninguna. `companies` y `order_assignments` se vuelven a
-- forzar tras las guardias; `orders`, al final. Un `RAISE EXCEPTION` deshace tambien estos `ALTER`
-- (el DDL es transaccional en Postgres). Conectando como superusuario no tiene efecto visible.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "companies"         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "orders"            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_assignments" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. Las tres guardias de datos. Cualquiera de ellas ABORTA LA REVERSION ENTERA.
--
-- La empresa del UP se resuelve igual que en el UP (por `name_normalized`, con el unico fallback de
-- una sola empresa) y nunca por id: sin ella no se distingue el dato propio del ajeno.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  target_company_id    UUID;
  named_company_rows   BIGINT;
  all_company_rows     BIGINT;
  duplicated_pairs     BIGINT;
  duplicated_rows      BIGINT;
  foreign_order_rows   BIGINT;
  crossed_assignments  BIGINT;
  existing_rows        BIGINT;
BEGIN
  SELECT count(*) INTO existing_rows FROM "orders";
  IF existing_rows = 0 THEN RETURN; END IF;

  -- 1.1. GUARDIA 1 — dos empresas comparten `(ano, secuencia)`. Es la condicion EXACTA que hace
  -- imposible recrear `orders_order_year_order_sequence_key`, y decirla aqui es mejor que un
  -- `23505` suelto varias sentencias mas abajo. Cuenta TODAS las filas, tambien las canceladas y
  -- las de borrado logico: el indice global era TOTAL, no parcial.
  SELECT count(*), COALESCE(sum(repeated.copies), 0)
    INTO duplicated_pairs, duplicated_rows
    FROM (
      SELECT "order_year", "order_sequence", count(*) AS copies
        FROM "orders"
       GROUP BY "order_year", "order_sequence"
      HAVING count(*) > 1
    ) AS repeated;

  IF duplicated_pairs > 0 THEN
    RAISE EXCEPTION
      'QC-60 down: hay % pareja(s) (ano, secuencia) compartida(s) por mas de un pedido, repartidas en % fila(s) de `orders`. El indice unico GLOBAL `orders_order_year_order_sequence_key` que este DOWN tiene que restaurar no se puede crear sobre ese dato, y renumerar o borrar la fila que estorba DESCARTARIA EL PEDIDO DE UN CLIENTE EN SILENCIO: la reversion se detiene ENTERA (R6). Localizalas con: SELECT order_year, order_sequence, count(*) FROM orders GROUP BY 1, 2 HAVING count(*) > 1; y renumera o elimina a mano los pedidos de las demas empresas antes de revertir.',
      duplicated_pairs, duplicated_rows;
  END IF;

  -- 1.2. Resolucion de la empresa que escribio el UP, para la guardia 2.
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
        'QC-60 down: no se pudo identificar la empresa que escribio el UP (name_normalized = ''quimicloud'') y hay % empresa(s) en la tabla. Sin saber cual es, no hay forma de distinguir los pedidos que asigno la migracion de los que creo alguien despues: la reversion se detiene ENTERA (R6). Renombra la empresa que corresponda antes de revertir.',
        all_company_rows;
    END IF;
  ELSE
    RAISE EXCEPTION
      'QC-60 down: hay % empresas con name_normalized = ''quimicloud'', asi que la empresa que escribio el UP es AMBIGUA: la reversion se detiene ENTERA (R6).',
      named_company_rows;
  END IF;

  -- 1.3. GUARDIA 2 — pedidos de OTRA empresa. Quitar `company_id` los convertiria en un unico
  -- monton indistinguible junto con los de la empresa del backfill.
  SELECT count(*) INTO foreign_order_rows
    FROM "orders" WHERE "company_id" <> target_company_id;

  IF foreign_order_rows > 0 THEN
    RAISE EXCEPTION
      'QC-60 down: hay % pedido(s) que pertenecen a una empresa distinta de la que escribio el UP (%). Revertir borraria `company_id` y convertiria los pedidos de varias empresas en un unico monton indistinguible: la reversion se detiene ENTERA (R6). Localizalos con: SELECT id, company_id, order_year, order_sequence FROM orders WHERE company_id <> ''%''; y mueve o elimina a mano esos pedidos antes de revertir.',
      foreign_order_rows, target_company_id, target_company_id;
  END IF;

  -- 1.4. GUARDIA 3 — asignaciones cruzadas. Hoy la FK COMPUESTA las hace imposibles, pero este
  -- archivo tiene que ser correcto tambien si alguien la deshabilito o la valido `NOT VALID`:
  -- volver a la FK SIMPLE dejaria esa fila mintiendo para siempre y ninguna restriccion la
  -- volveria a mirar. `JOIN` y no `LEFT JOIN` a proposito: una asignacion sin pedido ya la
  -- rechaza la propia FK y no es asunto de esta guardia.
  SELECT count(*) INTO crossed_assignments
    FROM "order_assignments" AS a
    JOIN "orders" AS o ON o."id" = a."order_id"
   WHERE a."company_id" <> o."company_id";

  IF crossed_assignments > 0 THEN
    RAISE EXCEPTION
      'QC-60 down: hay % asignacion(es) cuya empresa no coincide con la del pedido al que apuntan. Restaurar la clave foranea SIMPLE `order_assignments_order_id_fkey` dejaria esas filas mintiendo para siempre, porque ninguna restriccion volveria a mirar la empresa: la reversion se detiene ENTERA (R6). Localizalas con: SELECT a.order_id, a.user_id, a.company_id, o.company_id FROM order_assignments a JOIN orders o ON o.id = a.order_id WHERE a.company_id <> o.company_id; y corrigelas o eliminalas a mano antes de revertir.',
      crossed_assignments;
  END IF;
END $$;

-- `companies` y `order_assignments` solo se leyeron: vuelven activadas y forzadas en cuanto
-- termina su unico lector. La de `orders` se cierra en el bloque 7.
ALTER TABLE "companies"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies"         FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_assignments" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 2. Se recrea `next_order_sequence(integer)` (paso 7 del UP, al reves), copia literal de la de
-- `db/migrations/20260904135210_order_cancellation/migration.sql`, comentario incluido.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "next_order_sequence"(p_year integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  seq_name text := format('orders_sequence_%s', p_year);
BEGIN
  RETURN nextval(seq_name::regclass)::integer;
EXCEPTION WHEN undefined_table THEN
  -- PRIMERA ALTA DEL ANO. El lock de aviso serializa SOLO esta rama -- la creacion, una vez al
  -- ano -- y nunca el camino normal de `nextval`. Sin el, dos altas simultaneas el 1 de enero
  -- pueden intentar crear la misma secuencia y una se lleva un 42P07/23505 de `pg_class`.
  PERFORM pg_advisory_xact_lock(hashtext(seq_name));
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I AS integer MINVALUE 1 START WITH 1', seq_name);
  RETURN nextval(seq_name::regclass)::integer;
END;
$$;

-- ---------------------------------------------------------------------------------------
-- 3. El enlace de `order_assignments` vuelve a ser SIMPLE (paso 6 del UP, al reves).
--
-- La FK compuesta cae PRIMERO y la clave candidata DESPUES: al reves, Postgres se niega a soltar
-- `orders_id_company_id_key` mientras una FK la referencie.
--
-- La FK simple se restaura con los mismos `ON DELETE RESTRICT ON UPDATE CASCADE`. Las FK hacia
-- `users` y `work_groups` y el `CHECK` de la tabla no se tocan.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_company_id_fkey";

ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" DROP CONSTRAINT "orders_id_company_id_key";

-- ---------------------------------------------------------------------------------------
-- 4. La unicidad del correlativo vuelve a ser GLOBAL (paso 5 del UP, al reves).
--
-- Unico y TOTAL: un pedido dado de baja conserva su numero. La guardia 1 ya garantizo que el
-- dato lo admite.
-- ---------------------------------------------------------------------------------------
DROP INDEX "orders_company_year_sequence_key";

CREATE UNIQUE INDEX "orders_order_year_order_sequence_key"
  ON "orders"("order_year", "order_sequence");

-- ---------------------------------------------------------------------------------------
-- 5. El contador GLOBAL por ano vuelve a ser coherente con las filas.
--
-- Cada `orders_sequence_<ano>` se siembra con el maximo de su ano: sin eso, el siguiente `nextval`
-- repetiria un numero ya usado y chocaria con el indice global recien recreado. Se crea si no
-- existe, con la misma forma que usa `next_order_sequence`. `is_called` queda en cierto, asi que
-- el siguiente `nextval` entrega `max + 1`. Un ano sin filas no se toca.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  fila     RECORD;
  seq_name TEXT;
BEGIN
  FOR fila IN
    SELECT "order_year" AS year, max("order_sequence") AS top
      FROM "orders"
     GROUP BY "order_year"
  LOOP
    seq_name := format('orders_sequence_%s', fila.year);
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I AS integer MINVALUE 1 START WITH 1', seq_name);
    PERFORM setval(seq_name::regclass, fila.top);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- 6. La FK a `companies` y la columna (pasos 4, 3 y 1 del UP, al reves).
--
-- La FK se dropea explicitamente, para que este archivo diga que quita; el `SET NOT NULL` se va
-- con la columna. La guardia 2 ya garantizo que no hay pedidos de otra empresa. `ADD COLUMN` puso
-- la columna al final, asi que el orden ordinal de las demas queda como estaba.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_fkey";

ALTER TABLE "orders" DROP COLUMN "company_id";

-- ---------------------------------------------------------------------------------------
-- 7. La RLS de `orders` vuelve ACTIVADA Y FORZADA, como antes del UP. Explicito e idempotente:
-- si alguien revierte a mitad de un UP fallido, la tabla no puede quedarse sin forzar.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
