-- El equipo que acompano un acondicionamiento: una fila por persona, solo de insercion.
--
-- La tabla, los dos indices y el unico de posicion los genera Prisma. A mano: los dos CHECK, las
-- tres FK compuestas con `company_id` (no llevan `@relation`) y la RLS. Prisma no las regenera: si
-- una migracion generada las quita como drift, nada falla. No toca ninguna tabla preexistente.

-- CreateTable
CREATE TABLE "order_conditioning_team_members" (
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "work_group_id" UUID,
    "work_group_name" TEXT,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_conditioning_team_members_pkey" PRIMARY KEY ("order_id","user_id")
);

-- CreateIndex
CREATE INDEX "order_conditioning_team_members_user_id_idx" ON "order_conditioning_team_members"("user_id");

-- CreateIndex
CREATE INDEX "order_conditioning_team_members_work_group_id_idx" ON "order_conditioning_team_members"("work_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_conditioning_team_members_order_id_position_key" ON "order_conditioning_team_members"("order_id", "position");

-- Grupo y nombre van los dos o ninguno: la persona suelta no tiene ni uno ni otro.
ALTER TABLE "order_conditioning_team_members" ADD CONSTRAINT "order_conditioning_team_members_work_group_name_matches_group"
  CHECK (("work_group_id" IS NULL) = ("work_group_name" IS NULL));

-- La posicion cuenta desde 0.
ALTER TABLE "order_conditioning_team_members" ADD CONSTRAINT "order_conditioning_team_members_position_non_negative"
  CHECK ("position" >= 0);

-- Compuestas con `company_id`: pedido, persona y grupo son de la misma empresa que la fila. RESTRICT
-- porque los tres padres se borran de forma logica; un borrado fisico tiene que fallar. La del grupo
-- es MATCH SIMPLE (el modo por defecto): sin grupo no se evalua.
ALTER TABLE "order_conditioning_team_members" ADD CONSTRAINT "order_conditioning_team_members_order_id_company_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_conditioning_team_members" ADD CONSTRAINT "order_conditioning_team_members_user_id_company_id_fkey"
  FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_conditioning_team_members" ADD CONSTRAINT "order_conditioning_team_members_work_group_id_company_id_fkey"
  FOREIGN KEY ("work_group_id", "company_id") REFERENCES "work_groups"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS activada y forzada, sin policies, al final.
ALTER TABLE "order_conditioning_team_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_conditioning_team_members" FORCE ROW LEVEL SECURITY;
