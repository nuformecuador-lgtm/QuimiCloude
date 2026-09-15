-- QC-81: lote-y-fecha-de-compra.
--
-- `product_batches` cambia en DOS cosas y en ninguna mas (requirements.md > Alcance, D4):
--   1. `lot` pasa de ANULABLE a OBLIGATORIO, sin lotes en blanco, con un largo maximo de 60 y
--      UNICO POR EMPRESA (R7, R11, R12). Las filas que hoy no tienen lote reciben un
--      correlativo por orden de creacion dentro de su empresa, continuando desde el mas alto
--      que esa empresa ya tenga (R18, D6, D7).
--   2. Nace `purchase_date`, la fecha de COMPRA del lote: fecha civil (`DATE`, no marca de
--      tiempo ni texto), obligatoria (R1, R26). Las filas que ya existen reciben la fecha civil
--      de SU PROPIO `created_at` (R19, D8), NUNCA la fecha en que corre esta migracion.
--
-- Este archivo cobra el cheque que dejo QC-49: `product_batches.company_id` existe como columna
-- PROPIA del lote justo para poder construir aqui la unicidad `(company_id, lot)`
-- (`20260911130000_inventory_company_scope/migration.sql:5-6`).
--
-- ESCRITA ENTERA A MANO, no generada por `prisma migrate dev` (design.md > 2). Motivo, el mismo
-- de QC-76, QC-80 y QC-49: la tabla ya carga con objetos que Prisma NO modela --los dos CHECK de
-- QC-90, las FK a `users` escritas a mano, la FK a `companies` sin `@relation`, el disparador
-- `product_batches_check_company` y la RLS forzada-- y `migrate dev` los lee como DRIFT y
-- propone RESETEAR la base. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`).
--
-- LO QUE ESTA MIGRACION NO HACE:
--   - NINGUN `INSERT` y NINGUN `DELETE`: solo anade una columna, rellena las filas que ya hay y
--     aprieta restricciones.
--   - NO toca `created_at` ni `updated_at` de ninguna fila: el relleno es un `UPDATE` crudo y
--     esta tabla no tiene disparador de marca de tiempo (`@updatedAt` lo pone el cliente).
--   - NO cambia el regimen de borrado de ninguna tabla (R26): `product_batches` sigue sin marca
--     de borrado y `products` sigue con borrado logico.
--   - NO pone la NO-FUTURIDAD de la fecha en la base (R4, design.md > 1.3): Postgres no admite
--     `CURRENT_DATE` en un `CHECK` y un disparador usaria el reloj del servidor de base, no el
--     del caso de uso. Una escritura por otra via PUEDE meter una fecha futura: limite conocido.
--   - NO normaliza el lote (design.md > 1.2): la unicidad es del TEXTO EXACTO. `'L1'` y `'l1'`
--     conviven en la misma empresa.
--
-- Prisma ejecuta este archivo dentro de UNA sola transaccion, asi que cualquier
-- `RAISE EXCEPTION` de aqui abajo --o cualquier restriccion que no se pueda crear-- deshace el
-- archivo entero: la migracion queda SIN APLICAR y SIN MARCAR en `_prisma_migrations`, sin
-- ninguna columna, restriccion ni indice a medias (R21, R22).
--
-- SOBRE TABLA VACIA SE APLICA SIN ERROR (R20), y es requisito, no casualidad: la guardia cuenta
-- cero, los dos `UPDATE` tocan cero filas y sus comprobaciones cuadran `0 = 0`, los
-- `SET NOT NULL` pasan y el indice se crea vacio. Ninguna sentencia exige un minimo de filas.
-- La receta de la plantilla de tests (`tests/helpers/test-database.ts`) solo tolera el fallo de
-- QC-49; si esta migracion fallara sobre base vacia, la plantilla entera se caeria.

-- ---------------------------------------------------------------------------------------
-- 0. PARENTESIS DE RLS (design.md > 2.1, paso 0). LA MINA DE QC-49.
--
-- `product_batches` esta `ENABLE` + `FORCE ROW LEVEL SECURITY` y SIN NINGUNA POLICY. `FORCE`
-- aplica las policies TAMBIEN al dueno de la tabla --que es con quien conecta Prisma-- y, sin
-- ninguna policy, eso DENIEGA TODO: no solo el `UPDATE`, tambien el `SELECT`. Esta migracion LEE
-- la tabla (guardia, maximo por empresa, recuentos) y la ESCRIBE (los dos rellenos), asi que
-- suelta el `FORCE` aqui y lo restituye en el paso 7. Todo dentro de la unica transaccion: no hay
-- ninguna ventana en la que otra sesion vea la tabla sin forzar.
--
-- Solo se suelta `product_batches`. El disparador `product_batches_check_company` se dispara con
-- el `UPDATE` del relleno y LEE `products` y `presentations`, que siguen forzadas: bajo un dueno
-- sin privilegios esas lecturas devuelven cero filas, `FOUND` sale falso y el disparador NO
-- rechaza nada; bajo superusuario las lee y las filas existentes ya son coherentes (QC-49 R22).
-- En ninguno de los dos casos la migracion aborta por ahi, asi que abrir mas parentesis de los
-- necesarios seria dejar dos tablas mas sin forzar sin ganar nada.
--
-- LA TRAMPA, DICHA EN VOZ ALTA (design.md > 9.4): el `.env` local conecta como `postgres`,
-- SUPERUSUARIO, que se salta la RLS siempre. Con ese rol este parentesis no hace nada observable.
-- Lo verificable en local es que esta ESCRITO y bien CERRADO, y eso lo vigila
-- `tests/unit/inventario/schema/product-batch-lot-migration.test.ts`.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. GUARDIA DE LOTES DUPLICADOS POR EMPRESA (R21, design.md > 2.1, paso 1).
--
-- Si dos filas de la MISMA empresa ya comparten el mismo lote escrito, el indice unico del paso 6
-- es imposible. Se dice AQUI, antes de tocar el esquema, con cuantas son y que hacer, en vez de un
-- `23505` suelto seis sentencias mas abajo (el patron de la guardia del `down.sql` de QC-49).
--
-- Los lotes EN BLANCO (`NULL`, `''` o solo espacios) NO cuentan como duplicado: el paso 4 les da a
-- cada uno un correlativo distinto. Lo que se compara es el texto EXACTO, igual que el indice.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  duplicated_lots  BIGINT;
  duplicated_rows  BIGINT;
BEGIN
  SELECT count(*), COALESCE(sum(repeated.copies), 0)
    INTO duplicated_lots, duplicated_rows
    FROM (
      SELECT "company_id", "lot", count(*) AS copies
        FROM "product_batches"
       WHERE "lot" IS NOT NULL AND btrim("lot") <> ''
       GROUP BY "company_id", "lot"
      HAVING count(*) > 1
    ) AS repeated;

  IF duplicated_lots > 0 THEN
    RAISE EXCEPTION
      'QC-81: hay % lote(s) repetido(s) dentro de una misma empresa, repartidos en % fila(s) de `product_batches`. El indice unico `product_batches_company_lot_unique` (empresa, lote) no se puede crear sobre ese dato: la migracion se detiene ENTERA y no deja ninguna columna, restriccion ni indice a medias (R21). Localizalos con: SELECT company_id, lot, count(*) FROM product_batches WHERE lot IS NOT NULL AND btrim(lot) <> '''' GROUP BY 1, 2 HAVING count(*) > 1; y renombra a mano los lotes repetidos (o vacialos para que esta migracion les asigne correlativo) antes de volver a migrar.',
      duplicated_lots, duplicated_rows;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 2. LA COLUMNA NUEVA, ANULABLE DE MOMENTO (design.md > 2.1, paso 2).
--
-- SIN `DEFAULT`, y a proposito: `CURRENT_DATE` afirmaria para todas las filas viejas una fecha de
-- compra falsa e indistinguible de una real, que es exactamente lo que D8 descarta. Nace anulable,
-- se rellena en el paso 3 y se aprieta en el paso 5, todo en la misma transaccion (R22).
--
-- `lot` ya existe y ya es anulable (`20260909120000_product_batches/migration.sql:24`): no hay que
-- crearla, solo rellenarla y apretarla.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;

-- ---------------------------------------------------------------------------------------
-- 3 y 4. LOS DOS RELLENOS (R18, R19, design.md > 2.1 pasos 3-4, > 2.3).
--
-- Cada `UPDATE` comprueba su `ROW_COUNT` y aborta si no cuadra, copiando QC-49: si la RLS
-- estuviera filtrando, el `UPDATE` afectaria a cero filas EN SILENCIO y el `SET NOT NULL` del paso
-- 5 fallaria mucho mas tarde y por otra razon.
--
-- CONTRA QUE SE COMPARA CADA UNO:
--   - el de `purchase_date` escribe TODAS las filas, asi que se compara contra el TOTAL de la
--     tabla, literal como QC-49;
--   - el de `lot` escribe SOLO las filas sin lote --las que ya lo tienen lo CONSERVAN (R18)--, asi
--     que se compara contra el numero de filas SIN LOTE contado justo antes. Compararlo contra el
--     total abortaria en cuanto una sola fila ya tuviera lote, que es el caso normal. Y despues se
--     comprueba que no queda NINGUNA fila sin lote.
-- Con la tabla vacia los tres recuentos son cero y las tres comprobaciones cuadran (R20).
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  updated_rows   BIGINT;
  total_rows     BIGINT;
  pending_rows   BIGINT;
  remaining_rows BIGINT;
BEGIN
  -- 3. `purchase_date` = fecha civil de SU PROPIO `created_at` (R19, D8).
  --
  -- `AT TIME ZONE 'UTC'` EXPLICITO y no la zona de la sesion: es la misma convencion con la que el
  -- adaptador escribe la fecha civil (`T00:00:00Z`), y sin ella la misma base migrada en dos
  -- maquinas con distinta `TimeZone` daria dos dias distintos para la misma fila.
  UPDATE "product_batches"
     SET "purchase_date" = ("created_at" AT TIME ZONE 'UTC')::date;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "product_batches";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'QC-81: el relleno de `product_batches.purchase_date` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar lotes sin fecha de compra (R22).',
      updated_rows, total_rows;
  END IF;

  -- 4. `lot` para las filas sin lote (R18, D6, D7), por orden de creacion DENTRO DE SU EMPRESA y
  -- continuando desde el maximo numerico de ESA empresa.
  --
  --   - `'^[0-9]{1,18}$'` acota a lo que cabe en `bigint`: sin la cota, un lote de 40 digitos
  --     tecleado a mano reventaria el `::bigint` con un `22003` en mitad de la migracion.
  --   - Lo NO numerico (`'ACME-2026-07'`) no entra en el maximo: no es mayor ni menor, no esta en
  --     la serie. Un `'007'` cuenta como 7 y el siguiente es `'8'`, sin ceros (D5).
  --   - El `id` desempata: dos filas con el mismo `created_at` al microsegundo tendrian orden
  --     indefinido, y un relleno no reproducible no se puede revisar.
  SELECT count(*) INTO pending_rows
    FROM "product_batches"
   WHERE "lot" IS NULL OR btrim("lot") = '';

  WITH base AS (
    SELECT "company_id", max(("lot")::bigint) AS top
      FROM "product_batches"
     WHERE "lot" ~ '^[0-9]{1,18}$'
     GROUP BY "company_id"
  ), pendientes AS (
    SELECT "id", "company_id",
           row_number() OVER (PARTITION BY "company_id" ORDER BY "created_at", "id") AS rn
      FROM "product_batches"
     WHERE "lot" IS NULL OR btrim("lot") = ''
  )
  UPDATE "product_batches" AS b
     SET "lot" = (COALESCE(base.top, 0) + pendientes.rn)::text
    FROM pendientes LEFT JOIN base ON base."company_id" = pendientes."company_id"
   WHERE b."id" = pendientes."id";
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> pending_rows THEN
    RAISE EXCEPTION
      'QC-81: el relleno de `product_batches.lot` actualizo % fila(s) de las % que no tenian lote. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar lotes sin numero (R18, R22).',
      updated_rows, pending_rows;
  END IF;

  SELECT count(*) INTO remaining_rows
    FROM "product_batches"
   WHERE "lot" IS NULL OR btrim("lot") = '';
  IF remaining_rows <> 0 THEN
    RAISE EXCEPTION
      'QC-81: tras el relleno siguen % fila(s) de `product_batches` sin lote. La migracion se detiene antes del SET NOT NULL (R7, R22).',
      remaining_rows;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 5. Y ahora si, OBLIGATORIAS (R1, R7, R22). Llegar hasta aqui significa que ninguna fila queda
-- sin fecha de compra ni sin lote, asi que ningun `SET NOT NULL` puede fallar por dato faltante.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" ALTER COLUMN "purchase_date" SET NOT NULL;
ALTER TABLE "product_batches" ALTER COLUMN "lot" SET NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 6. LAS TRES RESTRICCIONES (design.md > 1.2), DESPUES del relleno: puestas antes se dispararian
-- sobre filas todavia sin lote.
--
-- `product_batches_lot_not_blank` es lo que hace que R7 no se pueda esquivar con `''` o con solo
-- espacios. `product_batches_lot_length` replica en la base el maximo de 60 que la validacion de
-- entrada ya exige (`PRODUCT_BATCH_LOT_MAX_LENGTH`): las dos defensas no se sustituyen.
--
-- El indice unico es LA garantia de R11: esta en la base y se cumple aunque alguien escriba por
-- otra via. Compuesto `(company_id, lot)`, asi que dos empresas pueden repetir valor (R12) y una
-- empresa no puede duplicarlo aunque el codigo falle. NO es parcial ni funcional, asi que Prisma
-- SI lo modela --`@@unique([companyId, lot], map: "product_batches_company_lot_unique")`-- y no
-- queda drift en este punto, igual que `presentations_company_name_unique` (QC-49).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_lot_not_blank"
  CHECK (btrim("lot") <> '');

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_lot_length"
  CHECK (char_length("lot") <= 60);

CREATE UNIQUE INDEX "product_batches_company_lot_unique"
  ON "product_batches" ("company_id", "lot");

-- ---------------------------------------------------------------------------------------
-- 7. SE CIERRA EL PARENTESIS DEL PASO 0: la RLS vuelve ACTIVADA Y FORZADA, sin ninguna policy.
-- Idempotente y explicito. Es DEFENSA EN PROFUNDIDAD, no la frontera de autorizacion
-- (`docs/architecture.md > Acceso a datos y autorizacion`).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;
