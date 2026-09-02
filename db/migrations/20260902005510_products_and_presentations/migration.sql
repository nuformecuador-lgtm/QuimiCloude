-- QC-14: modelo-producto.
--
-- El SQL de las dos tablas, la FK y el indice lo produce Prisma a partir de
-- `db/schema.prisma`. COMPLETADO A MANO: la extension pgcrypto, los cuatro CHECK de no
-- negatividad y los cuatro ALTER de RLS no salen del esquema porque Prisma no los modela
-- (ver `specs/QC-14-modelo-producto/design.md` seccion 3).
-- Toda migracion futura de estas tablas hay que revisarla a mano para que el drift no
-- borre ninguna de esas tres cosas.

-- Extension: `gen_random_uuid()` para los PK uuid. Ya la creo la migracion de QC-4;
-- aqui se vuelve a declarar con IF NOT EXISTS para que esta migracion sea autocontenida.
-- El `down.sql` no la elimina (puede haberla creado otro).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "presentations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "presentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "presentation_id" UUID NOT NULL,
    "stock" INTEGER,
    "cost" DECIMAL(14,4),
    "min_purchase" INTEGER NOT NULL DEFAULT 0,
    "delivery_time" INTEGER,
    "qty_alert" INTEGER,
    "unit" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex — Postgres no indexa automaticamente el lado hijo de una FK, y por ahi
-- pasan tanto «productos de esta presentacion» como la verificacion del RESTRICT.
CREATE INDEX "products_presentation_id_idx" ON "products"("presentation_id");

-- CHECK de no negatividad (R9), escritos a mano: Prisma no modela CHECK.
-- En SQL un CHECK que evalua a NULL SE CUMPLE, asi que estos aceptan la fila sin valor
-- (stock, qty_alert y cost son opcionales, R5) y rechazan el valor negativo. No se
-- escribe `IS NULL OR ...`: diria lo mismo con mas ruido.
-- `delivery_time` NO lleva CHECK a proposito: la decision cerrada 7 enumera estas cuatro
-- columnas y el tiempo de entrega no esta en la lista (`design.md` seccion 9, pregunta 4).
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative"        CHECK ("stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_min_purchase_non_negative" CHECK ("min_purchase" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_qty_alert_non_negative"    CHECK ("qty_alert" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_cost_non_negative"         CHECK ("cost" >= 0);

-- RLS activado Y forzado en las dos tablas (R21). Sin `FORCE`, el dueno de las tablas
-- —que es con quien se conecta Prisma— la ignora entera. Se activa sin policies:
-- deny-by-default para cualquier via que no sea Prisma. Es defensa en profundidad, no
-- la frontera de autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`).
ALTER TABLE "presentations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
