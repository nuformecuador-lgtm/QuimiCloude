-- DOWN de la migracion orders_company_scope (QC-60). Convencion propia del repo: Prisma Migrate
-- no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ejecuta este archivo y borra la fila de
-- `_prisma_migrations` en UNA SOLA TRANSACCION: cualquier `RAISE EXCEPTION` de aqui deshace todo
-- y la migracion sigue aplicada, entera, con su fila intacta.
--
-- Revierte EXACTAMENTE el `migration.sql`, en ORDEN INVERSO, y deja el esquema anterior (R5): sin
-- `orders.company_id`, sin `orders_company_id_fkey`, sin `orders_company_year_sequence_key`, sin
-- `orders_id_company_id_key`, CON el indice unico GLOBAL `orders_order_year_order_sequence_key`
-- restaurado, CON la FK SIMPLE `order_assignments_order_id_fkey` restaurada, CON
-- `next_order_sequence(integer)` recreada IDENTICA y con la RLS activada y forzada. NO se borra
-- NINGUNA fila: este archivo no tiene un solo `DELETE` ni un solo `INSERT`.
--
-- LAS TRES GUARDIAS DE DATOS VAN LAS PRIMERAS (R6), en la linea de QC-49, QC-76 y QC-32 --fallar
-- antes que perder el dato--. Sin ellas el DOWN haria tres cosas irreparables EN SILENCIO:
--   1. recrear el indice unico GLOBAL `(ano, secuencia)` es IMPOSIBLE si dos empresas llevan cada
--      una su serie --que es justo lo que el UP hizo posible--, y con 48 empresas eso deja de ser
--      hipotetico en cuanto la segunda de de alta un pedido. La alternativa --renumerar, o borrar
--      la fila que estorba-- DESCARTARIA DATO DE UN CLIENTE EN SILENCIO, que es peor que no poder
--      revertir. Precedente literal: QC-49 R7 con las presentaciones homonimas;
--   2. quitar `company_id` convertiria los pedidos de VARIAS empresas en un unico monton
--      indistinguible; y
--   3. volver a la FK SIMPLE dejaria MINTIENDO PARA SIEMPRE a cualquier asignacion cuya empresa
--      no sea la de su pedido: ninguna restriccion la volveria a mirar.
--
-- Los tres mensajes dicen CUANTAS FILAS y QUE HACER, no solo que fallo.
--
-- Lo UNICO que este DOWN acepta descartar es lo que escribio SU PROPIO UP: la empresa del
-- backfill en todas las filas. Cualquier fila de OTRA empresa es dato que alguien creo despues, y
-- no es de este archivo decidir tirarlo.

-- ---------------------------------------------------------------------------------------
-- 0. PARENTESIS `NO FORCE`, EL MISMO QUE ABRE EL UP Y POR LA MISMA RAZON EXACTA (R5, R6).
--
-- Con `FORCE ROW LEVEL SECURITY` y SIN NINGUNA POLICY, Postgres somete TAMBIEN AL DUENO de la
-- tabla --que es con quien conecta Prisma-- y eso deniega todo: no solo el `UPDATE`, tambien el
-- `SELECT`. Las guardias de este archivo LEEN las tres tablas, asi que sin estas lineas leerian
-- CERO filas y el DOWN abortaria SIEMPRE con el mensaje equivocado («hay 0 empresa(s)»): no se
-- perderia ni un dato --falla cerrado--, pero R5 dejaria de ser cumplible, o sea que la reversion
-- dejaria de existir. Es la leccion que QC-49 tuvo que corregir en revision, y aqui se escribe ya
-- bien la primera vez.
--
-- LAS TRES: `companies` porque la guardia la LEE para resolver la empresa del UP, `orders` porque
-- cuenta sus parejas repetidas y sus filas ajenas, y `order_assignments` porque la guardia 3 la
-- cruza con `orders`. Aqui NINGUNA se escribe. `companies` y `order_assignments` se vuelven a
-- forzar en cuanto termina la guardia --su unico lector--, y `orders` al final del archivo: su
-- regimen de RLS queda EXACTAMENTE como estaba (R4).
--
-- NO QUEDA NINGUNA VENTANA: todo ocurre dentro de la UNICA transaccion de `pnpm run db:rollback`.
-- Y el camino de excepcion se cierra solo, sin ningun `EXCEPTION WHEN`: cualquier
-- `RAISE EXCEPTION` aborta esa transaccion entera y estos tres `ALTER` --DDL transaccional en
-- Postgres-- se deshacen con ella.
--
-- LA TRAMPA, DICHA EN VOZ ALTA: EN LOCAL ESTO NO SE PUEDE DISTINGUIR. El `.env` de este repo
-- conecta como `postgres`, SUPERUSUARIO en esta base, y un superusuario se salta la RLS siempre.
-- Con ese rol ni el parentesis del UP ni este hacen absolutamente nada. Lo que si es verificable
-- aqui es que las lineas estan ESCRITAS y bien cerradas, y eso lo vigila el test de esquema.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "companies"         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "orders"            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_assignments" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. Las tres guardias de datos (R6). Cualquiera de ellas ABORTA LA REVERSION ENTERA.
--
-- La empresa «del UP» se resuelve IGUAL que en el UP --por `name_normalized = 'quimicloud'`, con
-- el unico fallback de que haya exactamente una empresa-- y NUNCA por identificador. Si no se
-- puede resolver, la reversion se detiene tambien: sin saber cual escribio el UP no hay forma de
-- distinguir el dato propio del ajeno.
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
BEGIN
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

-- Se cierra el parentesis de las dos tablas que este archivo solo LEYO --nunca escribio-- y que
-- ya no vuelven a aparecer salvo para el DDL del bloque 3, que no pasa por la RLS. Exactamente el
-- mismo cierre, y en el mismo sitio relativo, que el del paso 2 del UP: en cuanto termina su
-- unico lector. El de `orders` se cierra en el bloque 7.
ALTER TABLE "companies"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies"         FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_assignments" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 2. Se recrea `next_order_sequence(integer)` IDENTICA (paso 7 del UP, al reves; R5).
--
-- Copia literal de `db/migrations/20260904135210_order_cancellation/migration.sql` (QC-34, R11,
-- R12), incluido su comentario sobre los huecos: una transaccion abortada consume su numero y
-- nadie lo reutiliza, que es lo que QC-33 R42 acepto a conciencia. Sin ella el esquema no seria
-- «el de antes»: el alta de QC-34 la invocaba desde su `INSERT`.
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
-- 3. El enlace de `order_assignments` vuelve a ser SIMPLE (paso 6 del UP, al reves; R5).
--
-- La FK compuesta cae PRIMERO y la clave candidata DESPUES: al reves, Postgres se niega a soltar
-- `orders_id_company_id_key` mientras una FK la referencie.
--
-- La FK simple se restaura TAL Y COMO LA DEJO QC-86: `("order_id")` hacia `"orders"("id")`, con
-- los mismos `ON DELETE RESTRICT ON UPDATE CASCADE` y sin `MATCH FULL`. Las otras dos FK de la
-- tabla --las compuestas hacia `users` y `work_groups`-- y su `CHECK` NO SE TOCAN en ningun punto
-- de este archivo (R26).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_company_id_fkey";

ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" DROP CONSTRAINT "orders_id_company_id_key";

-- ---------------------------------------------------------------------------------------
-- 4. La unicidad del correlativo vuelve a ser GLOBAL (paso 5 del UP, al reves; R5).
--
-- El compuesto cae y se recrea `orders_order_year_order_sequence_key` tal y como lo dejo QC-33:
-- unico, TOTAL --un pedido dado de baja conserva su numero-- y sobre `("order_year",
-- "order_sequence")`. Sin el, la tabla quedaria sin ninguna garantia de unicidad del correlativo,
-- que no es «el esquema anterior» sino uno peor. La guardia 1 ya garantizo que el dato lo admite.
-- ---------------------------------------------------------------------------------------
DROP INDEX "orders_company_year_sequence_key";

CREATE UNIQUE INDEX "orders_order_year_order_sequence_key"
  ON "orders"("order_year", "order_sequence");

-- ---------------------------------------------------------------------------------------
-- 5. El contador GLOBAL por ano vuelve a ser coherente con las filas (R7).
--
-- Es literalmente el remedio que la cabecera de la migracion de QC-34 dejo escrito para las
-- importaciones: `SELECT setval('orders_sequence_<ano>', max("order_sequence") de ese ano)`. Sin
-- esto, revertir dejaria el contador apuntando a un numero YA USADO --o a 1, si la secuencia del
-- ano ni siquiera existe-- y la primera alta posterior chocaria contra el indice global que
-- acaba de recrearse.
--
-- LA SECUENCIA SE CREA SI NO EXISTE, con la MISMA forma con la que la crea
-- `next_order_sequence` (`AS integer MINVALUE 1 START WITH 1`): sobre una base donde el UP se
-- aplico sin que nadie diera de alta ningun pedido por la via de QC-34, la secuencia del ano no
-- existe y la funcion recien recreada la crearia empezando en 1, que es exactamente el choque que
-- R7 prohibe. Crearla aqui y sembrarla es la unica forma de que el primer `nextval` devuelva
-- `max + 1`.
--
-- `is_called` se deja en su valor por defecto (cierto), asi que el siguiente `nextval` entrega
-- `max + 1` y no `max`. Un ano sin ninguna fila no aparece en el bucle y su secuencia --si
-- existe-- se queda como esta: no hay ningun maximo con el que sembrarla.
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
-- 6. La FK a `companies` y la columna (pasos 4, 3 y 1 del UP, al reves; R5).
--
-- La FK se dropea EXPLICITAMENTE en vez de dejar que caiga con su columna, para que este archivo
-- diga exactamente que quita. El `SET NOT NULL` del paso 3 no necesita revertirse por separado:
-- se va con la columna.
--
-- Llegar hasta aqui significa que la guardia 2 conto CERO pedidos de otra empresa, asi que no se
-- pierde ningun dato que no sea el que escribio el propio UP.
--
-- LIMITE CONOCIDO, el mismo que anotan los down de QC-32, QC-76 y QC-49: la columna desaparece
-- del final de la tabla, que es donde `ADD COLUMN` la puso, asi que el orden ordinal queda como
-- estaba. No hay nada que reordenar.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_fkey";

ALTER TABLE "orders" DROP COLUMN "company_id";

-- ---------------------------------------------------------------------------------------
-- 7. Se CIERRA el parentesis de `orders` que abrio el bloque 0: la RLS vuelve ACTIVADA Y FORZADA,
-- que es como estaba antes del UP (R4, R5). Explicitos e IDEMPOTENTES: si alguien revierte a
-- mitad de un UP fallido, la tabla no puede quedarse sin forzar. `companies` y
-- `order_assignments` no se nombran aqui porque su parentesis se cierra arriba, justo despues de
-- la guardia que es su unica lectora.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
