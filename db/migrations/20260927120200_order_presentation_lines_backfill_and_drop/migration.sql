-- Pasa la presentacion unica de cada pedido (`orders.presentation_id` + `presentation_content`)
-- a su reparto (`order_presentation_lines`), le da a cada pedido la unidad de esa presentacion
-- (`orders.unit_id`) y retira las dos columnas. CON DATOS: es la unica de las tres migraciones
-- del reparto que toca filas existentes.
--
-- Escrita a mano. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`), que la corre
-- entera en una sola transaccion: si un guardia aborta, no queda nada a medias.
--
-- NO es idempotente a proposito: una segunda aplicacion falla en el `DROP COLUMN`
-- ("column does not exist") porque la columna que alimenta el `INSERT` ya no existe. No hay forma
-- de duplicar lineas, y el fallo es ruidoso, no silencioso.

-- ---------------------------------------------------------------------------------------
-- Parentesis de RLS: con RLS forzada y sin policies, el dueno no ve ninguna fila de estas
-- tablas. Si un guardia aborta, la transaccion deshace tambien este parentesis.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders"                   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_presentation_lines" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 0. Guardias, antes de tocar ningun dato.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE sin_unidad bigint;
DECLARE sin_reparto bigint;
BEGIN
  -- Un pedido por empacar o en empaque sin presentacion se quedaria sin unidad, y la cantidad
  -- que ya se fabrico no tendria en que expresarse.
  SELECT count(*) INTO sin_unidad
    FROM "orders"
   WHERE "status"::text IN ('POR_EMPACAR', 'EN_EMPAQUE')
     AND "deleted_at" IS NULL
     AND "presentation_id" IS NULL;
  IF sin_unidad > 0 THEN
    RAISE EXCEPTION 'MIGRACION ABORTADA: hay % pedido(s) en POR_EMPACAR o EN_EMPAQUE sin presentacion. '
      'Quedarian sin unidad. Asignales una presentacion y vuelve a intentarlo.', sin_unidad;
  END IF;

  -- En empaque el reparto ya no se puede corregir: un pedido que quedaria sin ninguna linea
  -- (mismo predicado que excluye filas en el `INSERT` del paso 2) no podria empacarse nunca.
  SELECT count(*) INTO sin_reparto
    FROM "orders"
   WHERE "status"::text = 'EN_EMPAQUE'
     AND "deleted_at" IS NULL
     AND ("presentation_id" IS NULL
          OR "presentation_content" IS NULL
          OR FLOOR("quantity" / "presentation_content") < 1);
  IF sin_reparto > 0 THEN
    RAISE EXCEPTION 'MIGRACION ABORTADA: hay % pedido(s) en EN_EMPAQUE que quedarian sin ninguna linea de reparto '
      '(sin contenido en la presentacion o sin llenar un envase). Resuelvelos y vuelve a intentarlo.', sin_reparto;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 1. La unidad del pedido es la de su presentacion; incluye entregados y cancelados, que
-- conservan el dato aunque ya no se editen. Sin presentacion, queda en NULL.
-- ---------------------------------------------------------------------------------------
UPDATE "orders" o
   SET "unit_id" = p."unit_id"
  FROM "presentations" p
 WHERE p."id" = o."presentation_id"
   AND p."company_id" = o."company_id";

-- ---------------------------------------------------------------------------------------
-- 2. Una linea por pedido vivo (ni borrado, ni entregado, ni cancelado) con presentacion y
-- contenido, con los envases enteros que caben en la cantidad. Los que no estan vivos conservan
-- solo la unidad del paso 1. Sin presentacion, sin contenido o sin llenar un envase: ninguna
-- linea.
-- ---------------------------------------------------------------------------------------
INSERT INTO "order_presentation_lines"
  ("id", "order_id", "company_id", "presentation_id", "packages", "presentation_content", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", o."company_id", o."presentation_id",
       FLOOR(o."quantity" / o."presentation_content")::int, o."presentation_content",
       now(), now()
  FROM "orders" o
 WHERE o."deleted_at" IS NULL
   AND o."status"::text NOT IN ('ENTREGADO', 'CANCELADO')
   AND o."presentation_id" IS NOT NULL
   AND o."presentation_content" IS NOT NULL
   AND FLOOR(o."quantity" / o."presentation_content") >= 1;

-- ---------------------------------------------------------------------------------------
-- 3. Retiro de la presentacion unica: CHECK, FK compuesta, indice y columnas.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" DROP CONSTRAINT "orders_presentation_content_requires_presentation";
ALTER TABLE "orders" DROP CONSTRAINT "orders_presentation_content_positive";
ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_presentation_id_fkey";
DROP INDEX "orders_presentation_id_idx";
ALTER TABLE "orders" DROP COLUMN "presentation_content";
ALTER TABLE "orders" DROP COLUMN "presentation_id";

-- ---------------------------------------------------------------------------------------
-- Se cierra el parentesis.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders"                   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "presentations"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations"            FORCE  ROW LEVEL SECURITY;
ALTER TABLE "order_presentation_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_presentation_lines" FORCE  ROW LEVEL SECURITY;
