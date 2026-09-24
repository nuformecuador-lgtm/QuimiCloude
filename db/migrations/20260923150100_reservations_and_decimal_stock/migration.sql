-- Escrita a mano: cambia el tipo nativo de columnas ya pobladas, anade una tabla nueva con FK
-- compuestas que Prisma no modela y una columna con dos CHECK cruzados. Nada de esto sale de
-- `prisma migrate dev` sobre una base con datos.

-- ---------------------------------------------------------------------------------------
-- 0. Parentesis de RLS: se sueltan las tablas cuyo tipo de columna se reescribe con USING.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_batches"     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "orders"              NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. Los enteros pasan a decimal(14,4). El USING convierte cada entero ya guardado en el mismo
-- valor exacto en decimal, sin redondear ni truncar nada.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches"
  ALTER COLUMN "stock" TYPE DECIMAL(14,4) USING "stock"::DECIMAL(14,4);
ALTER TABLE "inventory_movements"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,4) USING "quantity"::DECIMAL(14,4);
ALTER TABLE "products"
  ALTER COLUMN "stock" TYPE DECIMAL(14,4) USING "stock"::DECIMAL(14,4);
ALTER TABLE "products"
  ALTER COLUMN "qty_alert" TYPE DECIMAL(14,4) USING "qty_alert"::DECIMAL(14,4);

-- ---------------------------------------------------------------------------------------
-- 2. Clave unica compuesta nueva: sin ella una FK compuesta contra (id, company_id) no puede
-- crearse, porque Postgres exige una restriccion unica sobre exactamente esas columnas.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_id_company_id_key" UNIQUE ("id", "company_id");

-- ---------------------------------------------------------------------------------------
-- 3. El libro de reservas: append-only, sin updated_at ni deleted_at, como inventory_movements.
-- Las cuatro FK van a mano: el pedido y el lote son FK compuestas contra (id, company_id) para
-- que una fila no pueda declarar una empresa distinta de la de su pedido o de su lote.
-- ---------------------------------------------------------------------------------------
CREATE TYPE "ReservationMovementKind" AS ENUM ('reserve', 'release', 'expire', 'consume');

CREATE TABLE "reservation_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "kind" "ReservationMovementKind" NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reservation_movements_batch_id_idx" ON "reservation_movements"("batch_id");
CREATE INDEX "reservation_movements_order_id_idx" ON "reservation_movements"("order_id");
CREATE INDEX "reservation_movements_company_id_idx" ON "reservation_movements"("company_id");
CREATE INDEX "reservation_movements_created_by_idx" ON "reservation_movements"("created_by");

-- El signo de la cantidad lo da "kind", nunca la columna: siempre positiva.
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_quantity_positive" CHECK ("quantity" > 0);

-- La caducidad nunca tiene autor: la dispara el proceso diario, no una persona. No se exige lo
-- contrario para los demas tipos: la migracion que aparta los pedidos vivos inserta "reserve"
-- sin autor tambien.
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_expire_without_author" CHECK ("kind" <> 'expire' OR "created_by" IS NULL);

ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_order_id_fkey" FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_batch_id_fkey" FOREIGN KEY ("batch_id", "company_id") REFERENCES "product_batches"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_movements" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 4. inventory_movements gana order_id: solo un asiento de consumo lo lleva, y consumir se
-- guarda sin motivo, igual que el alta.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "inventory_movements" ADD COLUMN "order_id" UUID;

CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (
    ("kind" = 'adjustment' AND "reason" IS NOT NULL)
    OR ("kind" IN ('opening', 'consumption') AND "reason" IS NULL)
  );

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind" = 'consumption') = ("order_id" IS NOT NULL));

-- ---------------------------------------------------------------------------------------
-- 5. orders.reserved_at: el instante desde el que cuentan los 15 dias de la reserva. El indice
-- es parcial (solo pedidos pendientes, vivos y con algo apartado), asi que Prisma no lo modela y
-- vive aqui.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ADD COLUMN "reserved_at" TIMESTAMPTZ(6);

CREATE INDEX "orders_expirable_idx" ON "orders" ("reserved_at")
  WHERE "status" = 'PENDIENTE' AND "deleted_at" IS NULL AND "reserved_at" IS NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 6. Se cierra el parentesis: RLS activada y forzada, sin policies, como estaba.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"            FORCE  ROW LEVEL SECURITY;
ALTER TABLE "product_batches"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches"     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "orders"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders"              FORCE  ROW LEVEL SECURITY;
