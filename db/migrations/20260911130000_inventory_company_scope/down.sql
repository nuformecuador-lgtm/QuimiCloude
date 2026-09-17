-- DOWN de la migracion inventory_company_scope (QC-49). Convencion propia del repo: Prisma
-- Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ejecuta este archivo y borra la fila
-- de `_prisma_migrations` en UNA SOLA TRANSACCION: cualquier `RAISE EXCEPTION` de aqui deshace
-- todo y la migracion sigue aplicada, entera, con su fila intacta.
--
-- Revierte EXACTAMENTE el `migration.sql`, en ORDEN INVERSO, y deja el esquema anterior (R6):
-- sin las tres columnas `company_id`, sin las tres FK a `companies`, sin los dos indices de
-- FK, sin el indice unico compuesto, sin las dos funciones ni sus dos disparadores, CON el
-- indice unico GLOBAL `presentations_name_normalized_key` de QC-20 restaurado y con la RLS
-- activada y forzada en las tres tablas. NO se borra NINGUNA fila: este archivo no tiene un
-- solo `DELETE`.
--
-- LA GUARDIA DE DATOS VA LA PRIMERA (R7), en la linea de QC-76 y QC-32 -- fallar antes que
-- perder el dato. Sin ella el DOWN haria dos cosas irreparables EN SILENCIO:
--   1. quitar `company_id` convertiria el inventario de VARIAS empresas en un unico monton
--      indistinguible, que es peor que no poder revertir; y
--   2. recrear el indice unico GLOBAL de nombre de presentacion fallaria de todos modos si dos
--      empresas tuvieran cada una su «Garrafa 20 L» --que es justo lo que el UP hizo posible--,
--      y lo haria con un 23505 suelto en vez de con un mensaje que dice que pasa y que hacer.
--
-- Lo UNICO que este DOWN acepta descartar es lo que escribio SU PROPIO UP: la empresa del
-- backfill en todas las filas. Cualquier fila de OTRA empresa es dato que alguien creo
-- despues, y no es de este archivo decidir tirarlo.

-- ---------------------------------------------------------------------------------------
-- 0. PARENTESIS `NO FORCE`, EL MISMO QUE ABRE EL UP Y POR LA MISMA RAZON EXACTA (R6, R7).
--
-- Anadido el 2026-09-11 al cerrar el bloqueante 3 de la revision F2.2: este archivo se
-- CONTRADECIA con su propio UP. `migration.sql` dedica treinta lineas a explicar la mina --con
-- `FORCE ROW LEVEL SECURITY` y SIN NINGUNA POLICY, Postgres somete TAMBIEN AL DUENO de la tabla,
-- que es con quien conecta Prisma, y sin policy eso deniega todo: no solo el `UPDATE`, tambien
-- el `SELECT`-- y por eso suelta CUATRO tablas antes de leer `companies`. La guardia del bloque
-- 1 de ESTE archivo hace EXACTAMENTE esos mismos `SELECT` --`companies` dos veces, `products`,
-- `presentations` y `product_batches`-- y no abria ningun parentesis.
--
-- Si el razonamiento del UP es correcto --y lo es--, sin estas cuatro lineas la guardia leeria
-- CERO empresas, `named_company_rows` y `all_company_rows` saldrian 0 y el DOWN abortaria
-- SIEMPRE con el mensaje equivocado («hay 0 empresa(s)»): no se perderia ni un dato --falla
-- cerrado--, pero R6 dejaria de ser cumplible, o sea que la reversion dejaria de existir.
--
-- LAS CUATRO, y por el mismo criterio que el UP: `companies` porque la guardia la LEE para
-- resolver la empresa del backfill, y las tres de inventario porque la guardia cuenta sus filas
-- ajenas y sus nombres repetidos. Aqui NINGUNA se escribe: este archivo no tiene un solo
-- `UPDATE` ni un solo `DELETE`.
--
-- NO QUEDA NINGUNA VENTANA. `companies` se vuelve a forzar en cuanto termina la guardia --su
-- unico lector--, y las tres de inventario al final del archivo, en el bloque 6, que ya existia.
-- Todo ocurre dentro de la UNICA transaccion de `pnpm run db:rollback`
-- (`scripts/db-rollback.ts`), asi que ninguna otra sesion ve ninguna de las cuatro sin forzar.
-- Y EL CAMINO DE EXCEPCION SE CIERRA SOLO, sin necesidad de ningun `EXCEPTION WHEN`: cualquier
-- `RAISE EXCEPTION` de la guardia aborta esa transaccion entera y estos cuatro `ALTER` --que son
-- DDL transaccional en Postgres-- se deshacen con ella; la migracion sigue aplicada y las cuatro
-- tablas siguen forzadas.
--
-- LA TRAMPA, DICHA EN VOZ ALTA: EN LOCAL ESTO NO SE PUEDE DISTINGUIR. El `.env` de este repo
-- conecta como `postgres`, que en esta base es SUPERUSUARIO, y un superusuario se salta la RLS
-- siempre. Con ese rol ni el parentesis del UP ni este hacen absolutamente nada, y el test de R7
-- (`tests/integration/inventario/company-scope.int.test.ts`) se ejecuta en el UNICO escenario
-- donde la pregunta no se plantea: NO prueba este caso y no puede probarlo. Queda escrito en vez
-- de aparentar una verificacion que no existe. Lo que si es verificable aqui es que las cuatro
-- lineas estan ESCRITAS y bien cerradas, y eso lo vigila
-- `tests/unit/inventario/schema/inventory-company-scope-migration.test.ts`.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "companies"       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "products"        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. Guardia de datos (R7).
--
-- La empresa «del UP» se resuelve IGUAL que en el UP --por `name_normalized = 'quimicloud'`,
-- con el unico fallback de que haya exactamente una empresa-- y NUNCA por identificador. Si
-- no se puede resolver, la reversion se detiene tambien: sin saber cual escribio el UP no hay
-- forma de distinguir el dato propio del ajeno.
--
-- SALIDA TEMPRANA SOBRE UNA BASE VACIA (mismo arreglo que el UP): con las tres tablas de
-- inventario en cero no hay ningun reparto que proteger --ni inventario ajeno que descartar
-- ni nombre de presentacion que colisionar--, asi que la resolucion de la empresa ni siquiera
-- se plantea. Mismo idioma que `db/migrations/20260904180600_companies_and_user_company`. En
-- cuanto hay una sola fila en cualquiera de las tres, el `RETURN` no se dispara y las tres
-- guardias siguen abortando igual.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  target_company_id   UUID;
  named_company_rows  BIGINT;
  all_company_rows    BIGINT;
  filas_ajenas        BIGINT;
  nombres_repetidos   BIGINT;
  existing_rows       BIGINT;
BEGIN
  SELECT (SELECT count(*) FROM "products")
       + (SELECT count(*) FROM "presentations")
       + (SELECT count(*) FROM "product_batches")
    INTO existing_rows;
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
        'QC-49 down: no se pudo identificar la empresa que escribio el UP (name_normalized = ''quimicloud'') y hay % empresa(s) en la tabla. Sin saber cual es, no hay forma de distinguir el inventario que escribio la migracion del que creo alguien despues: la reversion se detiene entera (R7).',
        all_company_rows;
    END IF;
  ELSE
    RAISE EXCEPTION
      'QC-49 down: hay % empresas con name_normalized = ''quimicloud'', asi que la empresa que escribio el UP es AMBIGUA: la reversion se detiene entera (R7).',
      named_company_rows;
  END IF;

  -- 1.1. Inventario de OTRA empresa. Las tres tablas se cuentan juntas: el mensaje dice
  -- cuantas filas hay en total y en cual tabla, para que se pueda actuar sin buscar a ciegas.
  SELECT (SELECT count(*) FROM "products"        WHERE "company_id" <> target_company_id)
       + (SELECT count(*) FROM "presentations"   WHERE "company_id" <> target_company_id)
       + (SELECT count(*) FROM "product_batches" WHERE "company_id" <> target_company_id)
    INTO filas_ajenas;

  IF filas_ajenas > 0 THEN
    RAISE EXCEPTION
      'QC-49 down: hay % fila(s) de inventario (products / presentations / product_batches) que pertenecen a una empresa distinta de la que escribio el UP (%). Revertir borraria `company_id` y convertiria el inventario de varias empresas en un unico monton indistinguible: la reversion se detiene entera (R7). Mueve o elimina ese inventario a mano antes de revertir.',
      filas_ajenas, target_company_id;
  END IF;

  -- 1.2. Nombres de presentacion repetidos. El UP cambio la unicidad de GLOBAL a POR EMPRESA,
  -- asi que puede haber dos «Garrafa 20 L» de dos empresas distintas. Aunque 1.1 ya garantiza
  -- que todas son de la misma empresa --y entonces el compuesto ya impedia el duplicado--, la
  -- comprobacion se escribe explicita: es la condicion EXACTA que hace imposible recrear
  -- `presentations_name_normalized_key`, y decirla aqui es mejor que un 23505 suelto tres
  -- sentencias mas abajo.
  SELECT count(*) INTO nombres_repetidos
    FROM (
      SELECT "name_normalized"
        FROM "presentations"
       GROUP BY "name_normalized"
      HAVING count(*) > 1
    ) AS repetidos;

  IF nombres_repetidos > 0 THEN
    RAISE EXCEPTION
      'QC-49 down: hay % nombre(s) normalizado(s) de presentacion compartido(s) por mas de una fila. El indice unico GLOBAL `presentations_name_normalized_key` que este DOWN tiene que restaurar no se puede crear sobre ese dato: la reversion se detiene entera (R7). Renombra o elimina las presentaciones duplicadas a mano antes de revertir.',
      nombres_repetidos;
  END IF;
END $$;

-- Se cierra el parentesis de `companies`, que solo se LEYO --nunca se escribio-- y que ya no
-- vuelve a aparecer en este archivo. Exactamente el mismo cierre, y en el mismo sitio relativo,
-- que el del bloque 2 del UP: en cuanto termina su unico lector.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 2. Disparadores y funciones (bloque 5 del UP, al reves). Los disparadores primero: una
-- funcion no se puede borrar mientras alguien la use.
-- ---------------------------------------------------------------------------------------
DROP TRIGGER "presentations_check_unit_scope_trigger" ON "presentations";
DROP FUNCTION presentations_check_unit_scope();

DROP TRIGGER "product_batches_check_company_trigger" ON "product_batches";
DROP FUNCTION product_batches_check_company();

-- ---------------------------------------------------------------------------------------
-- 3. La unicidad de `presentations` vuelve a ser GLOBAL (bloque 4 del UP, al reves). El
-- compuesto cae y se recrea `presentations_name_normalized_key` tal y como lo dejo QC-20:
-- unico, TOTAL, sobre `name_normalized`. Sin el, la tabla quedaria sin ninguna garantia de
-- unicidad, que no es «el esquema anterior» sino uno peor.
-- ---------------------------------------------------------------------------------------
DROP INDEX "presentations_company_name_unique";

CREATE UNIQUE INDEX "presentations_name_normalized_key" ON "presentations"("name_normalized");

-- ---------------------------------------------------------------------------------------
-- 4. Indices de FK y las tres FK (bloque 4 del UP, al reves). Se dropean EXPLICITAMENTE en vez
-- de dejar que caigan con sus columnas, para que este archivo diga exactamente que quita.
-- ---------------------------------------------------------------------------------------
DROP INDEX "product_batches_company_id_idx";
DROP INDEX "products_company_id_idx";

ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_company_id_fkey";
ALTER TABLE "presentations"   DROP CONSTRAINT "presentations_company_id_fkey";
ALTER TABLE "products"        DROP CONSTRAINT "products_company_id_fkey";

-- ---------------------------------------------------------------------------------------
-- 5. Y al final las tres columnas (bloques 3 y 1 del UP). Llegar hasta aqui significa que la
-- guardia conto cero filas de otra empresa, asi que no se pierde ningun dato que no sea el que
-- escribio el propio UP. El `SET NOT NULL` del bloque 3 no necesita revertirse por separado:
-- se va con la columna.
--
-- LIMITE CONOCIDO, el mismo que anotan los down de QC-32 y QC-76: las columnas desaparecen del
-- final de la tabla, que es donde `ADD COLUMN` las puso, asi que el orden ordinal queda como
-- estaba. No hay nada que reordenar aqui.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" DROP COLUMN "company_id";
ALTER TABLE "presentations"   DROP COLUMN "company_id";
ALTER TABLE "products"        DROP COLUMN "company_id";

-- ---------------------------------------------------------------------------------------
-- 6. Se CIERRA el parentesis de las tres de inventario que abrio el bloque 0: la RLS vuelve
-- ACTIVADA Y FORZADA, que es como estaban antes del UP (R6, R5).
--
-- Corregido el 2026-09-11 (bloqueante 3 de F2.2): este comentario decia que el DOWN «no escribe
-- datos, asi que no necesita abrir el parentesis», y era falso por el motivo que el propio UP
-- explica --bajo `FORCE` y sin ninguna policy se deniega tambien el `SELECT`, y este archivo LEE
-- las cuatro tablas en su guardia--. El bloque 0 lo abre ahora; estas seis lineas lo cierran.
--
-- Los seis ALTER son ademas explicitos e IDEMPOTENTES: si alguien revierte a mitad de un UP
-- fallido, ninguna de las tres puede quedarse sin forzar. `companies` no se nombra aqui porque su
-- parentesis se cierra arriba, justo despues de la guardia que es su unica lectora.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"        FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations"   FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;
