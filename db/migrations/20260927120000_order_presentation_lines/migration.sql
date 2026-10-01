-- Nace `order_presentation_lines` (el reparto del pedido en presentaciones) y `orders.unit_id`
-- (la unidad en la que se expresa `quantity`). Las dos son DDL puro sobre una base con datos:
-- ninguna toca una fila existente.
--
-- Escrita a mano: la FK compuesta de `presentation_id` hacia `presentations` y la de
-- `unit_id` hacia `units` no las genera `prisma migrate dev` sobre una base con drift. Se
-- aplica con `pnpm run db:migrate` (`prisma migrate deploy`).

-- ---------------------------------------------------------------------------------------
-- 1. La tabla del reparto.
-- ---------------------------------------------------------------------------------------
CREATE TABLE "order_presentation_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "presentation_id" UUID NOT NULL,
    "packages" INTEGER NOT NULL,
    "presentation_content" DECIMAL(14,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_presentation_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "order_presentation_lines" ADD CONSTRAINT "order_presentation_lines_packages_positive"
  CHECK ("packages" > 0);
ALTER TABLE "order_presentation_lines" ADD CONSTRAINT "order_presentation_lines_content_positive"
  CHECK ("presentation_content" IS NULL OR "presentation_content" > 0);

-- Una presentacion, una linea por pedido: repetirla suma envases sobre la misma fila.
CREATE UNIQUE INDEX "order_presentation_lines_order_id_presentation_id_key"
  ON "order_presentation_lines"("order_id", "presentation_id");

CREATE INDEX "order_presentation_lines_company_id_idx" ON "order_presentation_lines"("company_id");
CREATE INDEX "order_presentation_lines_presentation_id_idx" ON "order_presentation_lines"("presentation_id");

-- `order_id` es del MISMO modulo que `Order` (a diferencia de las FK de `orders` hacia otros
-- modulos): FK simple, sin componer con `company_id`.
ALTER TABLE "order_presentation_lines" ADD CONSTRAINT "order_presentation_lines_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- `company_id`, drift hacia `companies` (mismo patron que `inventory_movements_company_id_fkey`).
ALTER TABLE "order_presentation_lines" ADD CONSTRAINT "order_presentation_lines_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- `presentation_id` compuesta con `company_id`, drift hacia `presentations`: mismo patron que
-- tenia `orders_company_id_presentation_id_fkey`.
ALTER TABLE "order_presentation_lines" ADD CONSTRAINT "order_presentation_lines_company_id_presentation_id_fkey"
  FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS activada y forzada, sin policies (patron del repo: la autorizacion vive en el service).
ALTER TABLE "order_presentation_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_presentation_lines" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 2. `orders.unit_id`: la unidad en que se expresa `quantity`. Anulable en la base
-- (los pedidos previos no la tienen); la aplicacion la exige en el alta y en la edicion.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ADD COLUMN "unit_id" UUID;

CREATE INDEX "orders_unit_id_idx" ON "orders"("unit_id");

-- FK simple: `units` tiene ambito propio (`company_id` anulable = unidad de sistema), asi que
-- componer con `company_id` del pedido no sirve. La visibilidad para la empresa la valida la
-- aplicacion (`UnitCatalog.findRefs`) antes de escribir.
ALTER TABLE "orders" ADD CONSTRAINT "orders_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
