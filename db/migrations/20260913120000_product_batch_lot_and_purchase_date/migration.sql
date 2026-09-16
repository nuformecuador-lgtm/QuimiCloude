-- Escrita a mano: `product_batches` tiene CHECK, FK, un disparador y RLS forzada que Prisma no
-- modela, y `prisma migrate dev` los leeria como drift y propondria resetear la base.
-- Tiene que aplicarse sin error sobre la tabla vacia: asi la aplica la plantilla de la base de tests.

-- Con `FORCE` y sin ninguna policy, la RLS deniega tambien al dueno de la tabla, que es con quien
-- conecta Prisma, y esta migracion lee y escribe filas. Se suelta aqui y se restituye al final.
-- Solo esta tabla: `product_batches_check_company` no rechaza cuando no ve el producto o la
-- presentacion. Un superusuario se salta la RLS, asi que en local esto no se nota.
ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;

-- Va antes de cualquier cambio, para abortar con un mensaje util en vez de con un `23505` al crear
-- el indice unico. Los lotes en blanco no cuentan: el relleno les da correlativos distintos.
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

-- Sin `DEFAULT`: `CURRENT_DATE` daria a las filas viejas una fecha de compra falsa e
-- indistinguible de una real.
ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;

-- Cada relleno comprueba su `ROW_COUNT`: si la RLS filtrara, el `UPDATE` tocaria cero filas en
-- silencio y el fallo saldria mas tarde, en el `SET NOT NULL`. El de `lot` se compara con las
-- filas sin lote y no con el total, porque las que ya tienen lote lo conservan.
DO $$
DECLARE
  updated_rows   BIGINT;
  total_rows     BIGINT;
  pending_rows   BIGINT;
  remaining_rows BIGINT;
BEGIN
  -- `AT TIME ZONE 'UTC'` explicito: con la zona de la sesion, dos maquinas con distinta
  -- `TimeZone` darian dias distintos para la misma fila.
  UPDATE "product_batches"
     SET "purchase_date" = ("created_at" AT TIME ZONE 'UTC')::date;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "product_batches";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'QC-81: el relleno de `product_batches.purchase_date` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar lotes sin fecha de compra (R22).',
      updated_rows, total_rows;
  END IF;

  -- El maximo se lee con `numeric` sobre `'^[0-9]+$'`, sin techo de digitos: con `bigint` un lote
  -- de 19 digitos quedaria fuera del maximo y el correlativo repetiria un valor existente.
  -- Limite conocido: solo aborta si una empresa tiene un lote de 60 nueves y ademas
  -- filas sin lote que rellenar.
  -- El `id` desempata: con el mismo `created_at` el orden seria indefinido y el relleno no reproducible.
  SELECT count(*) INTO pending_rows
    FROM "product_batches"
   WHERE "lot" IS NULL OR btrim("lot") = '';

  WITH base AS (
    SELECT "company_id", max(("lot")::numeric) AS top
      FROM "product_batches"
     WHERE "lot" ~ '^[0-9]+$'
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

ALTER TABLE "product_batches" ALTER COLUMN "purchase_date" SET NOT NULL;
ALTER TABLE "product_batches" ALTER COLUMN "lot" SET NOT NULL;

-- Despues del relleno: antes se dispararian sobre filas todavia sin lote. La unicidad es del texto
-- exacto, sin normalizar: `'L1'` y `'l1'` conviven en la misma empresa.
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_lot_not_blank"
  CHECK (btrim("lot") <> '');

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_lot_length"
  CHECK (char_length("lot") <= 60);

CREATE UNIQUE INDEX "product_batches_company_lot_unique"
  ON "product_batches" ("company_id", "lot");

ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;
