-- Registro de los movimientos sobre la ejecucion de un pedido: una fila por accion, solo de
-- insercion.
--
-- El tipo, la tabla y los dos indices los genera Prisma. A mano: los tres CHECK, las dos FK
-- compuestas con `company_id` (no llevan `@relation`) y la RLS. Prisma no las regenera: si una
-- migracion generada las quita como drift, nada falla. No toca ninguna tabla preexistente.

-- CreateEnum
CREATE TYPE "OrderExecutionAction" AS ENUM ('START', 'RESUME', 'ADVANCE', 'GO_BACK', 'CANCEL', 'FINISH', 'PACK_START', 'PACK_FINISH');

-- CreateTable
CREATE TABLE "order_execution_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "OrderExecutionAction" NOT NULL,
    "step_position" INTEGER,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_execution_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_execution_entries_order_id_occurred_at_idx" ON "order_execution_entries"("order_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "order_execution_entries_user_id_idx" ON "order_execution_entries"("user_id");

-- El motivo existe si y solo si la accion es cancelar: igualdad de dos booleanos, asi que rechaza
-- tanto cancelar sin motivo como un motivo en otra accion.
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_reason_matches_action"
  CHECK (("action"::text = 'CANCEL') = ("reason" IS NOT NULL));

-- La posicion del paso cuenta desde 1; nula cuando la receta no tiene pasos.
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_step_position_positive"
  CHECK ("step_position" IS NULL OR "step_position" >= 1);

-- El empaque no recorre pasos de la receta: sus dos acciones van siempre sin posicion.
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_packing_has_no_step"
  CHECK (("action"::text IN ('PACK_START', 'PACK_FINISH')) = ("step_position" IS NULL));

-- Compuestas con `company_id`: el pedido y la persona son de la misma empresa que la fila. RESTRICT
-- porque `orders` y `users` se borran de forma logica; un borrado fisico tiene que fallar.
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_order_id_company_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_user_id_company_id_fkey"
  FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS activada y forzada, sin policies, al final.
ALTER TABLE "order_execution_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_execution_entries" FORCE ROW LEVEL SECURITY;
