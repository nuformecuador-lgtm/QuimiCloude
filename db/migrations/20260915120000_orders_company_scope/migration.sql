-- QC-60: aislamiento-por-empresa-en-pedidos.
--
-- `orders` gana `company_id` NOT NULL con FK a `companies` (R1), el correlativo pasa a medirse
-- DENTRO de la empresa --el unico global `(ano, secuencia)` se cambia por `(empresa, ano,
-- secuencia)` (R11)--, nace la clave candidata `(id, company_id)` que hace posible convertir en
-- COMPUESTA la FK de `order_assignments` hacia el pedido (R25), y muere
-- `next_order_sequence(integer)`, cuya firma ya no puede expresar la serie (design.md > 3.2).
--
-- ESCRITA ENTERA A MANO, no generada por `prisma migrate dev` (design.md > 7). Motivo, el mismo
-- de QC-76, QC-80, QC-49 y QC-81: `orders` y `order_assignments` cargan con cinco CHECK, cinco
-- FK escritas a mano --dos de ellas COMPUESTAS hacia `identity`--, cuatro indices parciales de
-- QC-57 y RLS forzada, y `migrate dev` lo lee todo como DRIFT y propone RESETEAR una base de
-- desarrollo con datos reales. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`),
-- que no mira drift.
--
-- NINGUN `DROP CONSTRAINT` EN ESTE ARCHIVO SALVO UNO (R26): el de
-- `order_assignments_order_id_fkey`, la FK SIMPLE que el paso 6 sustituye por la compuesta. Las
-- dos FK compuestas hacia `users` y `work_groups`, el CHECK
-- `order_assignments_work_group_name_matches_group`, la PK `(order_id, user_id)` y la ausencia de
-- marca de borrado se conservan INTACTAS. Si una futura migracion generada propone tirarlos, se
-- le borra a mano el `DROP CONSTRAINT` (riesgo 1 de design.md > 12).
--
-- Y NINGUN `MATCH FULL` en ninguna FK de este archivo. En la del pedido daria igual --`order_id`
-- y `company_id` son las dos NOT NULL--, pero escribirlo «por coherencia» en la del grupo mataria
-- las asignaciones sueltas (`work_group_id IS NULL`), que QC-86 R13 acepta a proposito. `MATCH
-- SIMPLE`, el de Postgres por defecto, en todas.
--
-- NINGUN `INSERT` Y NINGUN `DELETE` sobre ninguna tabla (R3): esta migracion solo ANADE una
-- columna y ACTUALIZA las filas que ya hay. Y NINGUN `UPDATE` sobre `order_year` ni sobre
-- `order_sequence`: los pedidos que ya existen CONSERVAN su numero --37, 44 y 77 de 2026-- y NO
-- se renumeran (R13, decision cerrada 3). Las 48 empresas se asignan, no se limpian: eso es
-- QC-77.
--
-- NO se cambia el regimen de borrado de ninguna de las dos tablas (R9): `orders` conserva su
-- borrado logico y `order_assignments` sigue sin marca de borrado. Las marcas de tiempo
-- `created_at`/`updated_at` se conservan y NO se tocan (R8): el listado ordena por ellas.
--
-- NINGUNA OTRA TABLA cambia (R32, R33): `recipes` y `recipe_lines` son QC-50, los proveedores
-- QC-59. Aqui no se crea ninguna guardia de esquema (QC-61) ni se borra ninguna empresa (QC-77).
--
-- TIENE QUE APLICARSE SIN ERROR SOBRE `orders` VACIA (design.md > 7.2): asi la aplica la
-- plantilla de la base de tests, que tolera UNA SOLA migracion fallida --la de QC-49-- y ya esta
-- gastada. Con cero pedidos el backfill actualiza cero filas y `0 = 0` pasa, el `SET NOT NULL`
-- pasa y los indices se crean vacios. Lo que SI aborta, y es lo que R2 pide, es no poder resolver
-- la empresa: por eso la plantilla siembra «QuimiCloud» antes de migrar.
--
-- Prisma ejecuta este archivo dentro de UNA sola transaccion, asi que cualquier `RAISE EXCEPTION`
-- de aqui abajo deshace todo y la migracion queda sin aplicar y sin marcar en
-- `_prisma_migrations` (R2).

-- ---------------------------------------------------------------------------------------
-- 0. PARENTESIS `NO FORCE` (design.md > 7.1, paso 0). LA MINA DE QC-49.
--
-- `orders` y `companies` estan `ENABLE` + `FORCE ROW LEVEL SECURITY` y SIN NINGUNA POLICY.
-- `FORCE` somete a las policies TAMBIEN AL DUENO de la tabla --que es con quien conecta Prisma--
-- y, sin ninguna policy, eso DENIEGA TODO: no solo el `UPDATE`, tambien el `SELECT`.
--
-- Se sueltan DOS:
--   `orders`     porque el backfill la ESCRIBE y las dos guardias la LEEN;
--   `companies`  porque el backfill la LEE para resolver «QuimiCloud». Sin soltarla, ese `SELECT`
--                devolveria CERO filas y la migracion abortaria por el sitio equivocado, con un
--                mensaje que culparia al catalogo de empresas de no tener la que si tiene.
--                Precedente literal: QC-49 solto `companies` por leerla, no por escribirla.
--
-- `order_assignments` NO se suelta: este archivo solo le hace DDL (paso 6), y el DDL no pasa por
-- la RLS. Su regimen de RLS queda exactamente como estaba (R4).
--
-- `companies` NO se modifica (R3): se suelta para poder LEERLA y se vuelve a forzar al cerrar el
-- paso 2. El parentesis de `orders` se cierra en el paso 8. Todo dentro de la unica transaccion
-- de la migracion: no hay ninguna ventana en la que ninguna de las dos quede sin forzar para
-- nadie mas.
--
-- LA TRAMPA, DICHA EN VOZ ALTA: EN LOCAL NO SE PUEDE DISTINGUIR. El `.env` de este repo conecta
-- como `postgres`, SUPERUSUARIO en esta base, y un superusuario se salta la RLS siempre. Con ese
-- rol este parentesis --y el del DOWN-- no hacen absolutamente nada. Lo unico verificable en
-- local es que las lineas estan ESCRITAS y su parentesis bien cerrado, y eso lo vigila el test de
-- esquema de esta ficha.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders"    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "companies" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. La columna, ANULABLE DE MOMENTO (design.md > 2.1; 7.1, paso 1).
--
-- No hay valor por defecto que poner --y una columna de empresa con `DEFAULT` seria una mentira:
-- la empresa la decide quien escribe, no el esquema--, asi que nacer `NOT NULL` sobre las filas
-- que ya existen fallaria antes de poder rellenarlas. Se crea anulable, se rellena en el paso 2 y
-- se aprieta a `NOT NULL` en el paso 3, todo dentro de la misma transaccion: no hay ninguna
-- ventana en la que otra sesion pueda escribir un pedido sin empresa.
--
-- OBLIGATORIA, y aqui esta la diferencia deliberada con QC-76: alli `units.company_id` es
-- OPCIONAL justo para que existan las unidades DE SISTEMA. Aqui NO hay pedidos de sistema, y una
-- columna opcional significaria «pedido que ve todo el mundo», que es exactamente lo que esta
-- ficha cierra.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ADD COLUMN "company_id" UUID;

-- ---------------------------------------------------------------------------------------
-- 2. Backfill a la unica empresa real (R2, R3, R13; design.md > 7.1, paso 2).
--
-- LA EMPRESA SE RESUELVE POR NOMBRE NORMALIZADO Y NUNCA POR IDENTIFICADOR: los uuid los genera
-- `gen_random_uuid()` y son DISTINTOS en cada base. El literal `'quimicloud'` es lo que produce
-- `normalizeCompanyName(INITIAL_COMPANY_NAME)` (`lib/modules/identity/domain/companies.ts`), y
-- que las dos copias no diverjan lo vigila el test de esquema.
--
-- UNIVOCA O NADA (R2): nunca «una cualquiera». El UNICO fallback admitido es que la tabla tenga
-- exactamente UNA empresa, porque entonces no hay nada que elegir y asignarle los pedidos no es
-- una suposicion. Cualquier otro caso --cero, o varias sin la del nombre-- aborta la migracion
-- ENTERA.
--
-- UN SOLO `UPDATE`, y solo sobre `company_id`. NO se toca `order_year` ni `order_sequence` (R13):
-- los tres pedidos conservan 37, 44 y 77 de 2026 y el siguiente sera el 78, porque el correlativo
-- pasa a calcularse como `max()+1` sobre el dato y no a partir de ningun contador que haya que
-- sembrar (design.md > 3.4). TODAS las filas, incluidas las canceladas y las de borrado logico:
-- la columna va a ser NOT NULL y un borrado logico sigue siendo una fila.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  target_company_id  UUID;
  named_company_rows BIGINT;
  all_company_rows   BIGINT;
  updated_rows       BIGINT;
  total_rows         BIGINT;
BEGIN
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
        'QC-60: no se pudo identificar la empresa «QuimiCloud» (name_normalized = ''quimicloud'') y hay % empresa(s) en la tabla, asi que no hay una sola candidata. La migracion se detiene ENTERA y no deja ninguna columna, indice, restriccion ni funcion a medias (R2). Crea la empresa inicial --`pnpm run db:seed`-- o renombra la que corresponda antes de migrar.',
        all_company_rows;
    END IF;

  ELSE
    RAISE EXCEPTION
      'QC-60: hay % empresas con name_normalized = ''quimicloud'', asi que la empresa destino del backfill es AMBIGUA. La migracion se detiene ENTERA (R2): elegir una cualquiera repartiria los pedidos al azar entre dos clientes.',
      named_company_rows;
  END IF;

  -- `ROW_COUNT` contra el total de la PROPIA tabla: si la RLS estuviera filtrando el `UPDATE`,
  -- afectaria a cero filas EN SILENCIO y el `SET NOT NULL` del paso 3 fallaria mucho mas tarde y
  -- por otra razon. Fallar antes que dejar los pedidos a medias.
  UPDATE "orders" SET "company_id" = target_company_id;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "orders";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'QC-60: el backfill de `orders` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar pedidos sin empresa (R2, R3).',
      updated_rows, total_rows;
  END IF;
END $$;

-- Se cierra el parentesis de `companies`, que solo se LEYO --nunca se escribio-- y que ya no
-- vuelve a aparecer en este archivo. Vuelve exactamente como estaba (R3): activada y forzada, y
-- con las mismas filas que tenia al empezar.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 3. Y ahora si, OBLIGATORIA (R1). Llegar hasta aqui significa que TODAS las filas tienen
-- empresa, asi que este `SET NOT NULL` no puede fallar por dato faltante.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ALTER COLUMN "company_id" SET NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 4. La FK a `companies` (design.md > 2.1; R1).
--
-- `ON DELETE RESTRICT`: hoy `companies` tiene borrado LOGICO (QC-47), asi que ninguna fila
-- desaparece y los pedidos de una empresa dada de baja no se tocan (R29) sin hacer nada; el
-- `RESTRICT` deja escrito que un borrado FISICO de empresa no puede dejar pedidos huerfanos.
-- NUNCA `ON DELETE SET NULL`: la columna es NOT NULL.
--
-- ES DRIFT, a proposito: `companyId` se declara ESCALAR SIN `@relation` en `db/schema.prisma`
-- (`Company` es de `identity` y `orders` es de `pedidos`; con `@relation` el cliente dejaria a
-- `pedidos` atravesar a `companies` con un `include`, un cruce de modulos que ninguna guardia de
-- imports detecta porque no es un import ni un `prisma.company`). Mismo patron que las otras tres
-- FK de `orders` y que las tres de QC-49.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 5. El correlativo pasa a medirse DENTRO de la empresa (design.md > 2.2; R10, R11).
--
-- La guardia va ANTES del `CREATE UNIQUE INDEX` para abortar con un mensaje util en vez de con un
-- `23505` suelto. Hoy es imposible que salte --el unico GLOBAL todavia vive dos sentencias mas
-- abajo-- y se escribe igual: si alguien reaplica esta migracion sobre una base a la que se le
-- cargaron pedidos por otra via, el mensaje dice que pasa y que hacer. Calcado de QC-81 > 2.1.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  duplicated_pairs BIGINT;
  duplicated_rows  BIGINT;
BEGIN
  SELECT count(*), COALESCE(sum(repeated.copies), 0)
    INTO duplicated_pairs, duplicated_rows
    FROM (
      SELECT "company_id", "order_year", "order_sequence", count(*) AS copies
        FROM "orders"
       GROUP BY "company_id", "order_year", "order_sequence"
      HAVING count(*) > 1
    ) AS repeated;

  IF duplicated_pairs > 0 THEN
    RAISE EXCEPTION
      'QC-60: hay % pareja(s) (ano, secuencia) repetida(s) dentro de una misma empresa, repartidas en % fila(s) de `orders`. El indice unico `orders_company_year_sequence_key` (empresa, ano, secuencia) no se puede crear sobre ese dato: la migracion se detiene ENTERA y no deja ninguna columna, indice ni restriccion a medias (R2, R11). Localizalas con: SELECT company_id, order_year, order_sequence, count(*) FROM orders GROUP BY 1, 2, 3 HAVING count(*) > 1; y renumera a mano los pedidos repetidos antes de volver a migrar.',
      duplicated_pairs, duplicated_rows;
  END IF;
END $$;

-- EL ORDEN IMPORTA: el indice GLOBAL de QC-33 cae ANTES de crear el compuesto. Si se dejara, dos
-- empresas no podrian llevar cada una su propia serie, que es justo lo que la decision cerrada 2
-- abre. Y ademas el indice global es un ORACULO: la empresa B veria en su numeracion los huecos
-- que delatan cuantos pedidos hace la A.
DROP INDEX "orders_order_year_order_sequence_key";

-- UN SOLO indice compuesto, NO PARCIAL y con `company_id` DE CABEZA, asi que sirve tambien para
-- el filtro del listado y para la verificacion del `RESTRICT` de la FK del paso 4: `orders` NO
-- necesita ademas un `orders_company_id_idx` propio (R10), mismo criterio con el que QC-49 dejo
-- `presentations` sin indice de empresa. No es parcial a proposito: esa verificacion tiene que
-- ver tambien los pedidos con borrado logico, y un pedido borrado o cancelado CONSERVA su numero
-- y no lo libera (R12).
--
-- Al no ser parcial ni funcional, Prisma SI sabe modelarlo: se declara como
-- `@@unique([companyId, orderYear, orderSequence], map: "orders_company_year_sequence_key")` en
-- `model Order` y en ese punto NO queda drift. El adaptador reconoce el duplicado por el SQLSTATE
-- `23505`, no por el nombre del indice: renombrarlo no toca el adaptador.
--
-- LOS CUATRO INDICES PARCIALES DE QC-57 NO SE RECOMPONEN (`orders_status_idx`,
-- `orders_priority_idx`, `orders_created_at_idx`, `orders_quantity_idx`). Lo correcto a largo
-- plazo seria anteponerles `company_id`; con tres pedidos eso es afinar sobre un `seq scan` que
-- ya gana. Coste aceptado y anotado (design.md > 12, riesgo 6).
CREATE UNIQUE INDEX "orders_company_year_sequence_key"
  ON "orders" ("company_id", "order_year", "order_sequence");

-- ---------------------------------------------------------------------------------------
-- 6. La clave candidata y el enlace COMPUESTO de `order_assignments` (design.md > 2.3; R25).
--
-- Aqui se cobra el cheque que QC-86 dejo firmado por escrito: su FK hacia el pedido nacio SIMPLE
-- porque «`orders` no tiene `company_id` --eso es la epica QC-46--», mientras sus dos FK hacia
-- `users` y `work_groups` ya son compuestas con `company_id`. Con CERO filas en la tabla cuesta
-- cero: no hay backfill ni guardia de datos que escribir para esta FK (la del `down.sql` si
-- existe, R6).
--
-- LA CLAVE CANDIDATA VA ANTES QUE LA FK QUE LA REFERENCIA, o Postgres responde `42830` («there is
-- no unique constraint matching given keys»). Es literalmente el patron de
-- `users_id_company_id_key` y `work_groups_id_company_id_key` (QC-83), a los que las otras dos FK
-- de `order_assignments` ya apuntan. Se declara tambien en el esquema como
-- `@@unique([id, companyId], map: "orders_id_company_id_key")`.
--
-- LA FRONTERA, DECLARADA: `order_assignments` es del modulo `asignaciones`, no de `pedidos`. Esta
-- migracion toca una tabla de otro modulo y lo hace en la unica capa donde eso es legal --la base
-- de datos, no el codigo--: ni `pedidos` importa nada de `asignaciones` ni al reves mas alla del
-- contrato publico que ya existe. Decision cerrada 5.
--
-- Efecto util inmediato: asignar un pedido de otra empresa pasa a ser IMPOSIBLE POR CONSTRUCCION,
-- con un `23503` de Postgres, sin que `asignaciones` escriba una sola linea. El caso de uso lo
-- rechazara antes y con mejor mensaje (R27), pero la base ya no depende de que nadie se olvide.
--
-- `ON DELETE RESTRICT ON UPDATE CASCADE`, los MISMOS que tenia la FK simple (QC-86): el pedido
-- tiene borrado logico, asi que un `DELETE` fisico sobre `orders` es una anomalia y la asignacion
-- es parte de la historia del pedido. Y `MATCH SIMPLE`, el de por defecto: NO se escribe
-- `MATCH FULL`, ni aqui ni en ninguna otra FK de este archivo.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ADD CONSTRAINT "orders_id_company_id_key" UNIQUE ("id", "company_id");

ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_fkey";

ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_company_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 7. Muere `next_order_sequence(integer)` (design.md > 3.2; R5).
--
-- Su firma --solo el ano-- ya no puede expresar una serie por `(empresa, ano)`, y dejarla viva
-- seria una SEGUNDA DEFINICION del correlativo esperando a que alguien la llame. El numero pasa a
-- repartirlo el adaptador, dentro de una `prisma.$transaction`, con
-- `pg_advisory_xact_lock(<ns>, hashtext('orders_sequence:' || empresa || ':' || ano))` como
-- sentencia ANTERIOR y `COALESCE(max("order_sequence"), 0) + 1` DENTRO del `INSERT`. El
-- `down.sql` la recrea IDENTICA.
--
-- Va la ultima a proposito: mientras exista, nadie la llama ya.
--
-- LAS SECUENCIAS `orders_sequence_<ano>` QUE ELLA CREO NO SE BORRAN, y es deliberado: son el
-- unico sitio donde vive el estado del contador GLOBAL, y el `down.sql` las necesita para su
-- `setval` (R7). Del UP al DOWN quedan como objetos inertes que nadie llama. Coste aceptado y
-- anotado (design.md > 12, riesgo 2).
-- ---------------------------------------------------------------------------------------
DROP FUNCTION "next_order_sequence"(integer);

-- ---------------------------------------------------------------------------------------
-- 8. Se cierra el parentesis del paso 0: la RLS de `orders` vuelve ACTIVADA Y FORZADA (R4).
-- Sigue SIN NINGUNA POLICY: deny-by-default para cualquier via que no sea Prisma. Explicito e
-- IDEMPOTENTE, para que ni un UP fallido a medias pueda dejar la tabla sin forzar.
--
-- Es DEFENSA EN PROFUNDIDAD, NO la frontera de autorizacion (R30,
-- `docs/architecture.md > Acceso a datos y autorizacion`): Prisma se conecta como dueno y no
-- setea `request.jwt.claims`, asi que ninguna policy filtraria ninguna consulta de esta
-- aplicacion. El aislamiento se valida EN EL SERVICE y el filtro se escribe en el unico punto de
-- consulta del modulo: quitar estas dos lineas NO debe cambiar el resultado de ninguna consulta
-- ni escritura del modulo.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
