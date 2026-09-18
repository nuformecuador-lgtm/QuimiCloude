-- QC-49: aislamiento-por-empresa-en-inventario.
--
-- Las TRES tablas de inventario --`products`, `presentations` y `product_batches`-- ganan
-- `company_id` NOT NULL con FK a `companies` (R1). El lote lleva la SUYA PROPIA y no la
-- deriva de su producto (R2, decision cerrada 2): QC-81 necesita la unicidad
-- `(company_id, lot)` y un indice no puede indexar la columna de otra tabla.
--
-- ESCRITA ENTERA A MANO, no generada por `prisma migrate dev` (design.md > 3). Motivo, el
-- mismo de QC-76 y QC-80: las tres tablas ya cargan con objetos que Prisma NO modela --los
-- GIN de trigramas y los btree PARCIALES de QC-57, los CHECK de QC-14 y QC-90, las FK a
-- `users` escritas a mano, la FK `presentations_unit_id_fkey` de QC-80, la RLS forzada-- y
-- `migrate dev` los lee como DRIFT y propone RESETEAR una base de desarrollo con datos
-- reales. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`), que no mira drift.
--
-- TODA MIGRACION FUTURA SOBRE ESTAS TRES TABLAS HAY QUE REVISARLA A MANO: las tres FK que
-- crea el bloque 4 son DRIFT para Prisma, porque `companyId` se declara ESCALAR SIN
-- `@relation` en `db/schema.prisma` a proposito (`Company` es del modulo `identity` y las
-- tres tablas son de `inventario`; con `@relation` el cliente dejaria a `inventario`
-- atravesar a `companies` con un `include`, un cruce de modulos que ninguna guardia detecta
-- porque no es un import ni un `prisma.company`). Mismo patron que `units.company_id`
-- (QC-76) y `presentations.unit_id` (QC-80).
--
-- NINGUN `INSERT` Y NINGUN `DELETE` sobre ninguna tabla (R4): esta migracion solo ANADE
-- columnas y ACTUALIZA las filas que ya hay. Las 36 empresas y las presentaciones de residuo
-- de tests se quedan donde estan: limpiarlas es QC-77, y hacerlo aqui seria QC-77 de
-- contrabando.
--
-- NO se cambia el regimen de borrado de ninguna de las tres (R9): `products` conserva su
-- borrado logico, `presentations` y `product_batches` siguen sin marca de borrado. Las marcas
-- de tiempo `created_at`/`updated_at` se conservan y NO se tocan (R8): el listado de QC-57
-- ordena por `updated_at` y escribirla reordenaria el inventario sin que ninguna decision lo
-- pida.
--
-- NINGUNA OTRA TABLA gana columna de empresa, filtro ni rechazo cruzado (R28): `recipes`,
-- `recipe_lines`, `suppliers`, `supplier_catalog_lines` y `orders` son QC-50, QC-59 y QC-60.
--
-- Prisma ejecuta este archivo dentro de UNA sola transaccion, asi que cualquier
-- `RAISE EXCEPTION` de aqui abajo deshace todo y la migracion queda sin aplicar y sin marcar
-- en `_prisma_migrations` (R3).

-- ---------------------------------------------------------------------------------------
-- 1. Las tres columnas, ANULABLES DE MOMENTO (design.md > 2.1, 3.1).
--
-- No hay valor por defecto que poner --y una columna de empresa con `DEFAULT` seria una
-- mentira: la empresa la decide quien escribe, no el esquema--, asi que nacer `NOT NULL`
-- sobre las filas que ya existen fallaria antes de poder rellenarlas. Se crean anulables, se
-- rellenan en el bloque 2 y se aprietan a `NOT NULL` en el bloque 3, todo dentro de la misma
-- transaccion: no hay ninguna ventana en la que otra sesion pueda escribir inventario sin
-- empresa.
--
-- OBLIGATORIA EN LAS TRES, y aqui esta la diferencia deliberada con QC-76: alli
-- `units.company_id` es OPCIONAL justo para que existan las unidades DE SISTEMA. Aqui NO hay
-- inventario de sistema (decision cerrada 3), y una columna opcional significaria «fila que
-- ve todo el mundo», que es exactamente lo que esta ficha cierra.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"        ADD COLUMN "company_id" UUID;
ALTER TABLE "presentations"   ADD COLUMN "company_id" UUID;
ALTER TABLE "product_batches" ADD COLUMN "company_id" UUID;

-- ---------------------------------------------------------------------------------------
-- 2. Backfill a la unica empresa real (R3, R4), ENTRE PARENTESIS DE RLS (design.md > 3.1).
--
-- AQUI ESTA LA MINA, la misma que documentaron QC-76 y QC-80. Las tres tablas de inventario
-- Y `companies` estan `ENABLE` + `FORCE ROW LEVEL SECURITY` y SIN NINGUNA POLICY. `FORCE`
-- aplica las policies TAMBIEN al dueno de la tabla --que es con quien conecta Prisma-- y, sin
-- ninguna policy, eso DENIEGA TODO: no solo el `UPDATE`, tambien el `SELECT`.
--
-- Por eso se sueltan CUATRO y no solo las tres que se escriben:
--   `products`, `presentations`, `product_batches` porque el relleno ESCRIBE en ellas, y
--   `companies`                                    porque el relleno la LEE para resolver
--                                                  «QuimiCloud». Sin soltarla, ese `SELECT`
--                                                  devolveria CERO filas y la migracion
--                                                  abortaria por el sitio equivocado --con un
--                                                  mensaje que culparia al catalogo de
--                                                  empresas de no tener la que si tiene--.
--                                                  Precedente literal: QC-80 solto `units`
--                                                  por leerla, no por escribirla.
-- `companies` NO se modifica (R4): se suelta para poder LEERLA y se vuelve a forzar al
-- cerrar este mismo bloque. El parentesis de las tres de inventario se cierra en el bloque 6.
-- Todo dentro de la unica transaccion de la migracion: no hay ninguna ventana en la que
-- ninguna de las cuatro quede sin forzar para nadie mas.
--
-- EL `down.sql` ABRE SU PROPIO PARENTESIS, Y POR ESTO MISMO (anadido el 2026-09-11, bloqueante 3
-- de la revision F2.2). Su guardia de R7 hace EXACTAMENTE estos mismos `SELECT` sobre las cuatro
-- tablas; sin soltarlas leeria cero filas y abortaria SIEMPRE con el mensaje equivocado. Las dos
-- mitades de esta migracion dicen ahora lo mismo: ver `down.sql`, bloque 0.
--
-- LA TRAMPA, DICHA EN VOZ ALTA: EN LOCAL NO SE PUEDE DISTINGUIR. El `.env` de este repo conecta
-- como `postgres`, SUPERUSUARIO en esta base, y un superusuario se salta la RLS siempre. Con ese
-- rol este parentesis --y el del DOWN-- no hacen absolutamente nada, y el test de R7
-- (`tests/integration/inventario/company-scope.int.test.ts`) corre en el UNICO escenario donde
-- la pregunta no se plantea: NO prueba este escenario y no puede probarlo aqui. Lo unico
-- verificable en local es que las cuatro lineas estan escritas y su parentesis bien cerrado, que
-- es lo que vigila `tests/unit/inventario/schema/inventory-company-scope-migration.test.ts`.
--
-- LA EMPRESA SE RESUELVE POR NOMBRE NORMALIZADO Y NUNCA POR IDENTIFICADOR: los uuid los
-- genera `gen_random_uuid()` y son DISTINTOS en cada base. El literal `'quimicloud'` es lo
-- que produce `normalizeCompanyName(INITIAL_COMPANY_NAME)`
-- (`lib/modules/identity/domain/companies.ts`), y que las dos copias no diverjan lo vigila el
-- test de esquema.
--
-- SALIDA TEMPRANA SOBRE UNA BASE VACIA (anadida para arreglar el arranque en una base nueva):
-- con las tres tablas de inventario en cero, el backfill es un no-op y no hay ningun reparto
-- que proteger, asi que la resolucion de la empresa ni siquiera se plantea. Mismo idioma que
-- `db/migrations/20260904180600_companies_and_user_company/migration.sql` (`IF usuarios = 0
-- THEN RETURN; END IF;`). La guardia de mas abajo sigue intacta: en cuanto hay una sola fila
-- que repartir, el `RETURN` no se dispara y `RAISE EXCEPTION` sigue abortando igual si la
-- empresa es ambigua o no existe.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "companies"       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "products"        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_company_id    UUID;
  named_company_rows   BIGINT;
  all_company_rows     BIGINT;
  updated_rows         BIGINT;
  total_rows           BIGINT;
  existing_rows        BIGINT;
BEGIN
  SELECT (SELECT count(*) FROM "products")
       + (SELECT count(*) FROM "presentations")
       + (SELECT count(*) FROM "product_batches")
    INTO existing_rows;
  IF existing_rows = 0 THEN RETURN; END IF;

  -- 2.1. Resolucion de la empresa. UNIVOCA O NADA (R3): nunca «una cualquiera».
  SELECT count(*) INTO named_company_rows
    FROM "companies" WHERE "name_normalized" = 'quimicloud';

  IF named_company_rows = 1 THEN
    SELECT "id" INTO target_company_id
      FROM "companies" WHERE "name_normalized" = 'quimicloud';

  ELSIF named_company_rows = 0 THEN
    -- UNICO fallback admitido: que solo haya UNA empresa en toda la tabla. Entonces no hay
    -- nada que elegir y asignar el inventario a ella no es una suposicion.
    SELECT count(*) INTO all_company_rows FROM "companies";
    IF all_company_rows = 1 THEN
      SELECT "id" INTO target_company_id FROM "companies";
    ELSE
      RAISE EXCEPTION
        'QC-49: no se pudo identificar la empresa «QuimiCloud» (name_normalized = ''quimicloud'') y hay % empresa(s) en la tabla, asi que no hay una sola candidata. La migracion se detiene ENTERA y no deja ninguna columna, indice ni restriccion a medias (R3). Crea la empresa inicial --`pnpm run db:seed`-- o renombra la que corresponda antes de migrar.',
        all_company_rows;
    END IF;

  ELSE
    RAISE EXCEPTION
      'QC-49: hay % empresas con name_normalized = ''quimicloud'', asi que la empresa destino del backfill es AMBIGUA. La migracion se detiene ENTERA (R3): elegir una cualquiera repartiria el inventario al azar entre dos clientes.',
      named_company_rows;
  END IF;

  -- 2.2. Los tres UPDATE. TODAS las filas, incluidas las de productos con borrado logico: la
  -- columna va a ser NOT NULL y un borrado logico sigue siendo una fila (R3).
  --
  -- Cada uno comprueba `ROW_COUNT` contra el numero de filas de SU tabla y aborta si no
  -- coinciden: si la RLS estuviera filtrando el `UPDATE`, afectaria a cero filas EN SILENCIO
  -- y el `SET NOT NULL` del bloque 3 fallaria mucho mas tarde y por otra razon. Fallar antes
  -- que dejar el inventario a medias.
  UPDATE "products" SET "company_id" = target_company_id;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "products";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'QC-49: el backfill de `products` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar el inventario a medias (R3).',
      updated_rows, total_rows;
  END IF;

  UPDATE "presentations" SET "company_id" = target_company_id;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "presentations";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'QC-49: el backfill de `presentations` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar el inventario a medias (R3).',
      updated_rows, total_rows;
  END IF;

  UPDATE "product_batches" SET "company_id" = target_company_id;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "product_batches";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'QC-49: el backfill de `product_batches` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar el inventario a medias (R3).',
      updated_rows, total_rows;
  END IF;
END $$;

-- Se cierra el parentesis de `companies`, que solo se LEYO. Vuelve exactamente como estaba
-- (R4): activada y forzada, y con las mismas filas que tenia al empezar.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 3. Y ahora si, OBLIGATORIA (R1). Llegar hasta aqui significa que las tres tablas tienen
-- empresa en TODAS sus filas, asi que ningun `SET NOT NULL` puede fallar por dato faltante.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"        ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "presentations"   ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "product_batches" ALTER COLUMN "company_id" SET NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 4. Las tres FK, los dos indices de FK y el intercambio del indice unico de `presentations`
-- (design.md > 2.2, 2.3).
--
-- `ON DELETE RESTRICT`: hoy `companies` tiene borrado LOGICO (QC-47), asi que ninguna fila
-- desaparece y el inventario de una empresa dada de baja no se toca (R25) sin hacer nada;
-- el `RESTRICT` deja escrito que un borrado FISICO de empresa no puede dejar inventario
-- huerfano. NUNCA `ON DELETE SET NULL`: la columna es NOT NULL.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "presentations" ADD CONSTRAINT "presentations_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Postgres NO indexa automaticamente el lado hijo de una FK, y por ahi pasa la verificacion
-- del `RESTRICT` (R10). NO son parciales a proposito: esa verificacion tiene que ver tambien
-- los productos con borrado logico --mismo razonamiento que `work_groups_company_id_idx` en
-- QC-83--. NO son unicos: una empresa tiene muchos productos y muchos lotes.
CREATE INDEX "products_company_id_idx"        ON "products"("company_id");
CREATE INDEX "product_batches_company_id_idx" ON "product_batches"("company_id");

-- `presentations` NO lleva indice propio de empresa: el unico compuesto de aqui abajo la
-- tiene de CABEZA y sirve igual para la verificacion del `RESTRICT` (R10).
--
-- EL ORDEN IMPORTA: el indice GLOBAL de QC-20 cae ANTES de crear el compuesto. Si se dejara,
-- dos empresas no podrian tener cada una su «Garrafa 20 L», que es justo lo que R20 abre. Y
-- ademas el indice global es un ORACULO DE EXISTENCIA: un alta que responde «ya existe una
-- presentacion con un nombre equivalente» sobre una fila que quien pregunta no puede ver le
-- esta contando algo del catalogo de otra empresa.
DROP INDEX "presentations_name_normalized_key";

-- UN SOLO indice compuesto y NO PARCIAL, y aqui esta la diferencia deliberada con QC-76:
-- alli hicieron falta DOS parciales por columna porque `company_id` es opcional y dos `NULL`
-- no chocan en un unico indice. Aqui la columna es NOT NULL, asi que un solo indice dice la
-- regla entera. Y al no ser parcial ni funcional, Prisma SI sabe modelarlo: se declara como
-- `@@unique([companyId, nameNormalized], map: "presentations_company_name_unique")` en
-- `model Presentation`, con lo que deja de haber drift en este punto y el `P2002` se sigue
-- traduciendo a `'duplicate'` sin tocar `presentation-prisma.ts`.
--
-- `name_normalized` lo calcula la unica definicion de la normalizacion que publica el
-- contrato del modulo (QC-20 R4): esta migracion no introduce ninguna segunda.
CREATE UNIQUE INDEX "presentations_company_name_unique"
  ON "presentations" ("company_id", "name_normalized");

-- `products` NO gana ninguna unicidad de nombre (R21). Que dos productos puedan llamarse
-- igual es decision cerrada de QC-20 (D14) y esta ficha no la reabre. Lo que cambia es la
-- RESOLUCION por nombre del alta, que pasa a mirar solo los vivos de la empresa del actor
-- (R18): eso es FILTRO y vive en el repositorio, no restriccion y no vive aqui.

-- ---------------------------------------------------------------------------------------
-- 5. Coherencia: los dos disparadores (design.md > 2.4, R22, R23).
--
-- Ni un CHECK ni una FK pueden mirar OTRA fila, y las dos reglas son predicados sobre la fila
-- PADRE. Precedente exacto en el repo: `units_check_derivation` (QC-76).
--
-- Van DESPUES del backfill a proposito: con `presentations_check_unit_scope` puesto antes, el
-- `UPDATE` del bloque 2 lo dispararia sobre filas que todavia no tienen empresa.
--
-- Son `BEFORE`, asi que la fila NO llega a escribirse. Cada `RAISE EXCEPTION` lleva MENSAJE
-- PROPIO Y DISTINGUIBLE POR CASO y `ERRCODE = '23514'` (violacion de check), para que el test
-- de integracion pueda afirmar CUAL salto y no solo «lanza algo».
--
-- Ninguna de las dos funciones es `SECURITY DEFINER`, por el mismo motivo que escribio QC-76:
-- quien escribe la fila ya tiene que poder leer aquello contra lo que se comprueba. Una
-- comprobacion no debe mirar por debajo lo que la consulta no puede ver.
-- ---------------------------------------------------------------------------------------

-- 5.a. `product_batches_check_company` (R22). La empresa del lote tiene que coincidir con la
-- de SU PRODUCTO y con la de SU PRESENTACION. Sin el, un lote de la empresa A podria colgar
-- de un producto de la B y el listado de A ensenaria existencias ajenas por la puerta de
-- atras. Es la mitad de la decision cerrada 2 que la columna sola no garantiza.
CREATE OR REPLACE FUNCTION product_batches_check_company()
  RETURNS TRIGGER AS $product_batches_check_company$
DECLARE
  product_company_id      UUID;
  presentation_company_id UUID;
BEGIN
  SELECT parent."company_id" INTO product_company_id
    FROM "products" AS parent
   WHERE parent."id" = NEW."product_id";

  -- Si el producto no existe, aqui NO se dice nada: lo rechaza
  -- `product_batches_product_id_fkey` con su 23503. El disparador no suplanta a la FK, la
  -- complementa.
  IF FOUND AND product_company_id <> NEW."company_id" THEN
    RAISE EXCEPTION
      'product_batches_company_differs_from_product: el lote % declara la empresa % pero su producto % pertenece a la empresa % (QC-49 R22).',
      NEW."id", NEW."company_id", NEW."product_id", product_company_id
      USING ERRCODE = '23514';
  END IF;

  SELECT parent."company_id" INTO presentation_company_id
    FROM "presentations" AS parent
   WHERE parent."id" = NEW."presentation_id";

  IF FOUND AND presentation_company_id <> NEW."company_id" THEN
    RAISE EXCEPTION
      'product_batches_company_differs_from_presentation: el lote % declara la empresa % pero su presentacion % pertenece a la empresa % (QC-49 R22).',
      NEW."id", NEW."company_id", NEW."presentation_id", presentation_company_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$product_batches_check_company$ LANGUAGE plpgsql;

CREATE TRIGGER "product_batches_check_company_trigger"
  BEFORE INSERT OR UPDATE ON "product_batches"
  FOR EACH ROW EXECUTE FUNCTION product_batches_check_company();

-- 5.b. `presentations_check_unit_scope` (R23). La unidad de una presentacion tiene que ser de
-- SU empresa o DE SISTEMA (`units.company_id IS NULL`). Es la lectura literal de QC-76 R9
-- desde el otro lado de la frontera: hoy la FK `presentations_unit_id_fkey` no mira de quien
-- es la unidad, asi que escribir el identificador a mano es el unico modo de apuntar a una
-- ajena.
--
-- La funcion hace `SELECT` sobre `units`, que es de OTRO MODULO: eso es legal en SQL --la FK
-- `presentations_unit_id_fkey` ya cruza-- y NO abre ningun camino para que el cliente Prisma
-- de `inventario` lea `units`, que es lo que la guardia de modulos protege. Coste asumido por
-- el humano al aprobar el spec (F1.4), con el precedente del disparador de QC-76.
CREATE OR REPLACE FUNCTION presentations_check_unit_scope()
  RETURNS TRIGGER AS $presentations_check_unit_scope$
DECLARE
  unit_company_id UUID;
BEGIN
  SELECT unit."company_id" INTO unit_company_id
    FROM "units" AS unit
   WHERE unit."id" = NEW."unit_id";

  -- Si la unidad no existe, aqui NO se dice nada: lo rechaza `presentations_unit_id_fkey` con
  -- su 23503.
  --
  -- `unit_company_id IS NULL` significa UNIDAD DE SISTEMA (QC-76 R11) y vale para TODAS las
  -- empresas: se acepta siempre, y por eso la condicion es explicita en vez de confiar en que
  -- `<>` con un nulo no sea cierto.
  IF FOUND AND unit_company_id IS NOT NULL AND unit_company_id <> NEW."company_id" THEN
    RAISE EXCEPTION
      'presentations_unit_foreign_company: la presentacion % (empresa %) no puede usar la unidad %, que pertenece a la empresa % (QC-49 R23).',
      NEW."id", NEW."company_id", NEW."unit_id", unit_company_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$presentations_check_unit_scope$ LANGUAGE plpgsql;

CREATE TRIGGER "presentations_check_unit_scope_trigger"
  BEFORE INSERT OR UPDATE ON "presentations"
  FOR EACH ROW EXECUTE FUNCTION presentations_check_unit_scope();

-- ---------------------------------------------------------------------------------------
-- 6. Se cierra el parentesis de las tres: la RLS vuelve ACTIVADA Y FORZADA (R5, heredado de
-- QC-4 R19). Sigue SIN NINGUNA POLICY: deny-by-default para cualquier via que no sea Prisma.
--
-- Es DEFENSA EN PROFUNDIDAD, NO la frontera de autorizacion (R26,
-- `docs/architecture.md > Acceso a datos y autorizacion`): Prisma se conecta como dueno y no
-- setea `request.jwt.claims`, asi que una policy no filtraria ninguna consulta de esta
-- aplicacion. El aislamiento por empresa se valida EN EL SERVICE y el filtro se escribe en el
-- unico punto de consulta del modulo (design.md > 5), NUNCA como policy: quitar estos cuatro
-- ALTER no debe cambiar el resultado de ninguna consulta ni escritura del modulo.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"        FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations"   FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;
