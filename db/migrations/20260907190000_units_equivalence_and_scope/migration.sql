-- QC-76: equivalencia-y-ambito-de-unidades.
--
-- El catalogo de unidades que creo QC-32 gana DOS cosas y ninguna mas: la EQUIVALENCIA entre
-- unidades --de que unidad deriva cada una y por que factor-- y el AMBITO por empresa --de
-- quien es cada unidad, y `NULL` significa «de sistema»--.
--
-- ESCRITA ENTERA A MANO, no generada por `prisma migrate dev` (ver
-- `specs/QC-76-equivalencia-y-ambito-de-unidades/design.md` secciones 2 y 3). Motivo: `units`
-- ya carga con objetos que Prisma NO conoce --el indice GIN de trigramas y los btree de QC-57,
-- la RLS forzada de QC-32-- y a partir de esta migracion carga con muchos mas: tres CHECK, dos
-- FK, CUATRO indices unicos PARCIALES y un disparador. `prisma migrate dev` los lee como DRIFT
-- y propone RESETEAR la base de desarrollo, que tiene datos reales. Se aplica con
-- `pnpm run db:migrate` (`prisma migrate deploy`), que no mira drift.
--
-- TODA MIGRACION FUTURA SOBRE `units` HAY QUE REVISARLA A MANO por lo mismo: si el drift borra
-- un CHECK, una FK, un indice parcial o el disparador, el esquema sigue validando y el cliente
-- sigue compilando. No se entera nadie.
--
-- NO se toca `20260903121404_units_catalog` (R27): esta aplicada y editarla romperia su
-- checksum en `_prisma_migrations`.
--
-- NINGUN `INSERT` Y NINGUN `DELETE` sobre `units` (R29): esta migracion solo ACTUALIZA las
-- filas que ya hay. Lo vigila `tests/unit/unidades/schema/unidades-migration.test.ts`.
--
-- Prisma ejecuta este archivo dentro de UNA sola transaccion, asi que cualquier
-- `RAISE EXCEPTION` de aqui abajo deshace todo y la migracion queda sin aplicar y sin marcar.

-- ---------------------------------------------------------------------------------------
-- 1. Las tres columnas nuevas (design.md > 2.1). Las tres OPCIONALES.
--
--   `company_id`: la empresa duena. `NULL` = unidad DE SISTEMA (R11). NO se crea ninguna
--                 columna `system` ni bandera equivalente (R12, decision cerrada 11): dos
--                 campos que dicen casi lo mismo acaban contradiciendose.
--   `unit_id`:    la unidad de la que deriva. El nombre lo fija la decision cerrada 2.
--   `factor`:     cuantas unidades de la apuntada caben en UNA de esta (R3). `DECIMAL(14,4)`,
--                 exacto, NUNCA coma flotante: misma precision que el dinero de QC-33.
--
-- Identificadores en INGLES (R31, heredado de QC-4). SIN `deleted_at` (R32).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "units"
  ADD COLUMN "company_id" UUID,
  ADD COLUMN "unit_id"    UUID,
  ADD COLUMN "factor"     DECIMAL(14,4);

-- ---------------------------------------------------------------------------------------
-- 2. Lo que se puede decir de UNA SOLA FILA: los tres CHECK y las dos FK (design.md > 2.2).
-- Lo que necesita mirar OTRA fila --un solo nivel, el ambito del padre-- no cabe en un CHECK
-- y va en el disparador del bloque 4.
-- ---------------------------------------------------------------------------------------

-- La pareja va JUNTA O NINGUNA (R2): declarar de que unidad se deriva sin decir por cuanto
-- --o al reves-- es media equivalencia, y media equivalencia no convierte nada.
ALTER TABLE "units" ADD CONSTRAINT "units_derivation_pair_check"
  CHECK (("unit_id" IS NULL) = ("factor" IS NULL));

-- El factor SIEMPRE mayor que cero (R4, R5). Con factor cero la conversion inversa seria una
-- division por cero. `0.5000` PASA a proposito: la unidad base no tiene por que ser la mas
-- pequena de su familia (decision cerrada 5, «media garrafa»).
ALTER TABLE "units" ADD CONSTRAINT "units_factor_positive_check"
  CHECK ("factor" IS NULL OR "factor" > 0);

-- Nadie deriva de si mismo (R7). Con un solo nivel de derivacion (R6) la auto-referencia es
-- el UNICO ciclo posible, asi que esta linea cierra el tema entero.
ALTER TABLE "units" ADD CONSTRAINT "units_no_self_derivation_check"
  CHECK ("unit_id" IS NULL OR "unit_id" <> "id");

-- FK a la empresa (R13). `company_id` es ESCALAR SIN `@relation` en el esquema Prisma
-- (`design.md > 2.1`): `Company` es de `identity` y `Unit` de `unidades`, asi que ninguna
-- consulta puede atravesar de una a otra con un `include`, exactamente como `products.unit_id`
-- (QC-32 R18). La integridad la garantiza esta linea, no el cliente.
-- `RESTRICT` no cambia nada hoy --`companies` tiene borrado logico (QC-47), asi que ninguna
-- fila desaparece y las unidades de una empresa borrada se quedan como estan (R16)--, pero
-- deja escrito que borrar una empresa DE VERDAD no puede dejar unidades huerfanas.
ALTER TABLE "units" ADD CONSTRAINT "units_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK a la unidad de la que se deriva (R8). `RESTRICT` es la UNICA garantia real de que no se
-- borra una unidad de la que otra deriva --de ahi que R32 prohiba `deleted_at` aqui: un
-- borrado logico es un UPDATE y ninguna FK reacciona a un UPDATE--. Extiende QC-32 D10.
-- NUNCA `ON DELETE SET NULL`: dejaria la fila hija con `factor` y sin `unit_id`, que ademas
-- violaria `units_derivation_pair_check`.
ALTER TABLE "units" ADD CONSTRAINT "units_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Postgres NO indexa automaticamente el lado hijo de una FK, y por ahi pasa la verificacion
-- del `RESTRICT` en cada intento de borrar una unidad o una empresa. Estos dos son los que
-- Prisma declara con `@@index` en el esquema (design.md > 2.1); NO son unicos.
CREATE INDEX "units_company_id_idx" ON "units"("company_id");
CREATE INDEX "units_unit_id_idx"    ON "units"("unit_id");

-- ---------------------------------------------------------------------------------------
-- 3. La unicidad pasa a ser POR AMBITO (design.md > 2.3, R14, R15).
--
-- EL ORDEN IMPORTA: el indice GLOBAL de QC-32 cae ANTES de crear los parciales. Si se dejara,
-- dos empresas no podrian tener cada una su «kilogramo», que es justo lo que la decision
-- cerrada 14 abre.
--
-- POR QUE DOS INDICES POR COLUMNA Y NO UNO: en un indice unico normal dos `NULL` no chocan,
-- asi que `UNIQUE (company_id, name_normalized)` a secas dejaria meter «kilogramo» de sistema
-- tantas veces como se quiera. Los parciales dicen las dos mitades de la regla por separado y
-- se leen sin saber como trata Postgres los nulos. Mismo patron que `users_email_unique`
-- (QC-4) y `companies_name_unique` (QC-47).
--
-- Prisma NO sabe modelar indices parciales: por eso `model Unit` NO declara ningun `@@unique`
-- y lleva encima el comentario que avisa de que volver a ponerlo rompe R14 en silencio.
-- ---------------------------------------------------------------------------------------

-- DropIndex — el unico GLOBAL de QC-32 (`units_name_normalized_key`, R5 de aquella ficha).
DROP INDEX "units_name_normalized_key";

-- El nombre normalizado, unico DENTRO DE LA EMPRESA (R14). `name_normalized` lo calcula la
-- unica definicion de la normalizacion que publica el contrato del modulo (QC-32 R4).
CREATE UNIQUE INDEX "units_company_name_unique"
  ON "units" ("company_id", "name_normalized") WHERE "company_id" IS NOT NULL;

-- ...y las de sistema, unicas ENTRE ELLAS. Dos empresas distintas SI pueden tener cada una su
-- «kilogramo», y una empresa puede crear el suyo aunque exista el de sistema.
CREATE UNIQUE INDEX "units_system_name_unique"
  ON "units" ("name_normalized") WHERE "company_id" IS NULL;

-- El simbolo, unico CUANDO EXISTE y con el MISMO AMBITO que el nombre (R15, decision cerrada
-- 28, que cierra la pregunta abierta 1 de QC-32). El `WHERE "symbol" IS NOT NULL` va EXPLICITO
-- aunque el nulo no chocaria igualmente: es la mitad de R15 que dice «unico cuando existe», y
-- escrita se lee sin razonar sobre nulos. Varias unidades SIN simbolo en el mismo ambito
-- siguen siendo legales.
CREATE UNIQUE INDEX "units_company_symbol_unique"
  ON "units" ("company_id", "symbol") WHERE "company_id" IS NOT NULL AND "symbol" IS NOT NULL;

CREATE UNIQUE INDEX "units_system_symbol_unique"
  ON "units" ("symbol") WHERE "company_id" IS NULL AND "symbol" IS NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 4. Un solo nivel de derivacion (R6) y derivacion dentro del ambito (R9): disparador
-- (design.md > 2.4).
--
-- Ni un CHECK ni una FK pueden mirar OTRA fila, y las dos reglas son predicados sobre la fila
-- PADRE. Precedente de funcion en el repo: `next_order_sequence`
-- (`20260904135210_order_cancellation`).
--
-- Es `BEFORE`, asi que la fila NO llega a escribirse. Cada `RAISE EXCEPTION` lleva MENSAJE
-- PROPIO Y DISTINGUIBLE y `ERRCODE = '23514'` (violacion de check) para que el test de
-- integracion pueda comprobar CUAL salto, y no solo «lanza algo».
--
-- La funcion NO es `SECURITY DEFINER` a proposito: hace `SELECT` sobre `units`, y quien
-- escribe en `units` ya tiene que poder leerla. En un entorno donde la RLS SI se aplique al
-- rol que conecta, el disparador ve exactamente lo que ve ese rol -- que es lo correcto: una
-- comprobacion no debe mirar por debajo lo que la consulta no puede ver.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION units_check_derivation() RETURNS TRIGGER AS $units_check_derivation$
DECLARE
  parent_company_id UUID;
  parent_unit_id    UUID;
BEGIN
  -- 4.1. La fila que se escribe DERIVA de alguien.
  IF NEW."unit_id" IS NOT NULL THEN
    SELECT parent."company_id", parent."unit_id"
      INTO parent_company_id, parent_unit_id
      FROM "units" AS parent
     WHERE parent."id" = NEW."unit_id";

    -- Si el padre no existe, aqui NO se dice nada: lo rechaza `units_unit_id_fkey` con su
    -- 23503. El disparador no suplanta a la FK, la complementa.
    IF FOUND THEN
      -- UN SOLO NIVEL (R6, decision cerrada 6): la unidad de la que derivo no puede derivar de
      -- una tercera. Tonelada se declara como 1.000.000 de gramos, no como 1000 kilogramos.
      IF parent_unit_id IS NOT NULL THEN
        RAISE EXCEPTION
          'units_derivation_single_level: la unidad % no puede derivar de %, que a su vez deriva de otra unidad. La derivacion es de un solo nivel (QC-76 R6).',
          NEW."id", NEW."unit_id"
          USING ERRCODE = '23514';
      END IF;

      -- AMBITO DEL PADRE (R9, decision cerrada 9): una unidad de empresa deriva de una suya o
      -- de una de sistema, NUNCA de una de OTRA empresa: romperia el aislamiento y haria que
      -- borrar algo en una empresa afectara a otra.
      IF NEW."company_id" IS NOT NULL
         AND parent_company_id IS NOT NULL
         AND parent_company_id <> NEW."company_id" THEN
        RAISE EXCEPTION
          'units_derivation_foreign_company: la unidad % (empresa %) no puede derivar de %, que pertenece a la empresa % (QC-76 R9).',
          NEW."id", NEW."company_id", NEW."unit_id", parent_company_id
          USING ERRCODE = '23514';
      END IF;

      -- La lectura literal de la misma decision: una unidad DE SISTEMA vale para TODAS las
      -- empresas, asi que no puede depender de la unidad privada de una de ellas
      -- (design.md > 2.4, ultimo parrafo).
      IF NEW."company_id" IS NULL AND parent_company_id IS NOT NULL THEN
        RAISE EXCEPTION
          'units_derivation_system_from_company: la unidad de sistema % no puede derivar de %, que pertenece a la empresa % (QC-76 R9).',
          NEW."id", NEW."unit_id", parent_company_id
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- UN SOLO NIVEL LEIDO AL REVES (R6): la fila que se escribe ya es PADRE de alguien, asi
    -- que no puede volverse derivada. Cubre el «convertir en derivada una unidad de la que ya
    -- deriva alguna» que R6 nombra explicitamente.
    IF EXISTS (SELECT 1 FROM "units" AS child WHERE child."unit_id" = NEW."id") THEN
      RAISE EXCEPTION
        'units_derivation_parent_cannot_derive: la unidad % no puede pasar a derivar de otra: ya hay unidades que derivan de ella. La derivacion es de un solo nivel (QC-76 R6).',
        NEW."id"
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 4.2. R9 LEIDO AL REVES: la fila cambia de empresa y arrastraria a sus hijas a un ambito
  -- que ya no comparten. Solo puede pasar en un UPDATE que toque `company_id`.
  IF TG_OP = 'UPDATE'
     AND NEW."company_id" IS NOT NULL
     AND NEW."company_id" IS DISTINCT FROM OLD."company_id"
     AND EXISTS (
       SELECT 1 FROM "units" AS child
        WHERE child."unit_id" = NEW."id"
          AND child."company_id" IS DISTINCT FROM NEW."company_id"
     ) THEN
    RAISE EXCEPTION
      'units_derivation_children_scope: la unidad % no puede pasar a la empresa %: hay unidades de otro ambito que derivan de ella (QC-76 R9).',
      NEW."id", NEW."company_id"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$units_check_derivation$ LANGUAGE plpgsql;

CREATE TRIGGER "units_check_derivation_trigger"
  BEFORE INSERT OR UPDATE ON "units"
  FOR EACH ROW EXECUTE FUNCTION units_check_derivation();

-- ---------------------------------------------------------------------------------------
-- 5. La actualizacion de datos (R28), ENTRE PARENTESIS DE RLS (design.md > 3.2).
--
-- `units` ya esta `ENABLE` + `FORCE ROW LEVEL SECURITY` desde QC-32 y SIN NINGUNA POLICY, y
-- `FORCE` deniega TAMBIEN al dueno de la tabla, que es con quien se conecta Prisma. QC-32
-- resolvio lo mismo colocando su INSERT antes del FORCE; aqui el FORCE ya esta puesto de
-- antes, asi que el parentesis se abre y se cierra explicitamente. Todo dentro de la unica
-- transaccion de la migracion: no hay ninguna ventana en la que la tabla quede sin forzar para
-- nadie mas.
--
-- Las filas se buscan por `name_normalized` y NUNCA POR ID: los uuid los genero
-- `gen_random_uuid()` en la migracion de QC-32 y son DISTINTOS en cada base.
--
-- LAS GUARDIAS CUENTAN LAS DOS FILAS DERIVADAS, NO EL CATALOGO ENTERO. R29 dice que esta
-- migracion no crea ni borra unidades, no que el catalogo tenga que tener exactamente cuatro
-- filas cuando se aplica: cualquier base de desarrollo puede llevar unidades sembradas a mano
-- --la local llevaba cinco el 2026-09-07-- y contar el total abortaria por algo que no es un
-- error. Lo que si es un error es que `litro` o `kilogramo` no esten: sin ellas el catalogo
-- queda a medias y en silencio.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "units" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  updated_rows INTEGER;
BEGIN
  -- 5.1. Las unidades existentes son DE SISTEMA (R28, R11). `ADD COLUMN` ya las dejo en NULL,
  -- asi que esto es un no-op; se escribe explicito para que R28 se lea entera en el archivo.
  -- Sin guardia de filas a proposito: afecta a TODO el catalogo, cuyo tamano no fija R29.
  UPDATE "units" SET "company_id" = NULL;

  -- 5.2. litro -> mililitro, factor 1000 (R28). El factor dice cuantos mililitros caben en un
  -- litro (decision cerrada 2).
  UPDATE "units" AS derived
     SET "unit_id" = base."id",
         "factor"  = 1000.0000
    FROM "units" AS base
   WHERE derived."name_normalized" = 'litro'
     AND base."name_normalized"    = 'mililitro';
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RAISE EXCEPTION
      'QC-76: se esperaba actualizar 1 fila (litro -> mililitro) y se actualizaron %. O falta alguna de las dos unidades del catalogo, o la RLS esta filtrando el UPDATE: la migracion se detiene antes de dejar el catalogo a medias (R28).',
      updated_rows;
  END IF;

  -- 5.3. kilogramo -> gramo, factor 1000 (R28).
  UPDATE "units" AS derived
     SET "unit_id" = base."id",
         "factor"  = 1000.0000
    FROM "units" AS base
   WHERE derived."name_normalized" = 'kilogramo'
     AND base."name_normalized"    = 'gramo';
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RAISE EXCEPTION
      'QC-76: se esperaba actualizar 1 fila (kilogramo -> gramo) y se actualizaron %. O falta alguna de las dos unidades del catalogo, o la RLS esta filtrando el UPDATE: la migracion se detiene antes de dejar el catalogo a medias (R28).',
      updated_rows;
  END IF;
END $$;

-- `mililitro` y `gramo` se quedan SIN derivacion, que es lo que R28 pide: son las bases. No
-- hace falta ninguna sentencia para eso, y escribir un UPDATE que las ponga a NULL seria
-- mentir sobre lo que hace la migracion.
--
-- `updated_at` NO se toca a proposito: ningun requisito lo pide y el listado de QC-57 ordena
-- por esa columna, asi que tocarla reordenaria el catalogo sin que ninguna decision lo pida.

-- ---------------------------------------------------------------------------------------
-- 6. Se cierra el parentesis: la RLS vuelve ACTIVADA Y FORZADA (R30, heredado de QC-4 R19).
-- Sigue SIN policies: deny-by-default para cualquier via que no sea Prisma. Es defensa en
-- profundidad, NO la frontera de autorizacion (`docs/architecture.md > Acceso a datos y
-- autorizacion`), que vive en el service. El filtro por empresa del listado se escribe en el
-- repositorio (design.md > 4.2), NUNCA como policy: Prisma se conecta como dueno y no setea
-- `request.jwt.claims`, asi que una policy no filtraria ninguna consulta de esta aplicacion.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
