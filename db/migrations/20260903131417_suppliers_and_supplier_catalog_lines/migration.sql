-- QC-42: modelo-proveedores.
--
-- Las dos CREATE TABLE, la FK proveedor->linea, el indice unico compuesto y los tres
-- indices simples los produce Prisma a partir de `db/schema.prisma`.
--
-- COMPLETADO A MANO (ver `specs/QC-42-modelo-proveedores/design.md` seccion 4):
--   1. La extension pgcrypto.
--   2. LAS TRES FK QUE CRUZAN DE MODULO: `supplier_catalog_lines_product_id_fkey` hacia
--      `products` y `suppliers_created_by_fkey` / `suppliers_updated_by_fkey` hacia
--      `users`. Prisma NO las regenera nunca, porque `product_id`, `created_by` y
--      `updated_by` estan declarados en el esquema como campos ESCALARES SIN `@relation`
--      a proposito (decisiones cerradas 13 y 14, R22): asi la base garantiza la integridad
--      y el cliente Prisma no puede atravesar de `proveedores` a `inventario` ni a
--      `identity` con un `include`. Si estas tres lineas se pierden, el esquema sigue
--      validando y el cliente sigue compilando: no se entera nadie.
--   3. El indice unico PARCIAL `suppliers_name_unique` (Prisma no modela indices
--      parciales).
--   4. Los CUATRO CHECK: los tres de no negatividad de la linea y
--      `suppliers_contact_required` (Prisma no modela CHECK).
--   5. Los cuatro ALTER de RLS.
--
-- Toda migracion futura sobre `suppliers` o `supplier_catalog_lines` hay que revisarla A
-- MANO para que el drift de `prisma migrate dev` no borre ninguna de esas cinco cosas.
--
-- Esta migracion NO toca `products` (decision cerrada 2, R19): no hay ningun
-- `ALTER TABLE "products"` aqui, y las unicas menciones a `products` y a `users` son las
-- FK que las tablas de esta feature declaran sobre SI MISMAS.

-- Extension: `gen_random_uuid()` para los PK uuid. Ya la crearon las migraciones de QC-4,
-- QC-14 y QC-24; aqui se vuelve a declarar con IF NOT EXISTS para que esta migracion sea
-- autocontenida. El `down.sql` no la elimina (puede haberla creado otro).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_catalog_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "cost" DECIMAL(14,4) NOT NULL,
    "min_purchase" DECIMAL(14,4),
    "delivery_time" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplier_catalog_lines_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey — proveedor -> linea. Intra-modulo, asi que SI lleva `@relation` en el
-- esquema y la genera Prisma. El CASCADE es la red del borrado FISICO (una purga, el
-- `down.sql`): no se dispara nunca en operacion normal, porque el borrado de un proveedor
-- es LOGICO y ninguna FK reacciona a un UPDATE (`design.md` seccion 4.2, R29, R30).
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (A MANO) — linea -> producto. Cruza a `inventario`: campo escalar en
-- Prisma, FK real aqui (R22, R31). RESTRICT porque el borrado de producto es LOGICO
-- (QC-20 D5): en operacion normal no se dispara, existe para que un borrado fisico por
-- consola no deje lineas apuntando al vacio. Es lo que hace verdadera la decision 12.
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (A MANO) — auditoria: proveedor -> usuario. Cruza a `identity`: campo
-- escalar en Prisma, FK real aqui (R22, R24). Las columnas son ANULABLES (decision cerrada
-- 14) y eso no afloja nada: en SQL una FK solo se verifica cuando la columna tiene valor,
-- asi que un proveedor sin autor pasa y un proveedor con un autor inventado se rechaza con
-- 23503.
-- NUNCA `ON DELETE SET NULL`, aunque la columna lo permitiria: convertiria «al usuario lo
-- borraron» en «no lo creo una persona», que son cosas distintas y la decision 14 las
-- separa a proposito. RESTRICT mantiene esa distincion intacta (`design.md` seccion 4.1).
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex — un producto no puede aparecer dos veces en el catalogo del mismo proveedor
-- (R11). Sirve ademas de indice para «lineas de este proveedor» por el prefijo izquierdo,
-- por eso no hay un `supplier_catalog_lines_supplier_id_idx` aparte: seria redundante. Es
-- TOTAL, no parcial: la linea no tiene borrado logico, asi que no hay filas muertas de las
-- que protegerse.
CREATE UNIQUE INDEX "supplier_catalog_lines_supplier_id_product_id_key" ON "supplier_catalog_lines"("supplier_id", "product_id");

-- CreateIndex — Postgres no indexa automaticamente el lado hijo de una FK, y por ahi pasan
-- tanto la verificacion del RESTRICT como «que proveedores me venden este producto».
CREATE INDEX "supplier_catalog_lines_product_id_idx" ON "supplier_catalog_lines"("product_id");

-- CreateIndex — mismo motivo, lado hijo de las dos FK de auditoria.
CREATE INDEX "suppliers_created_by_idx" ON "suppliers"("created_by");

-- CreateIndex
CREATE INDEX "suppliers_updated_by_idx" ON "suppliers"("updated_by");

-- CreateIndex (A MANO) — unicidad del nombre normalizado (decision cerrada 8, R7).
-- PARCIAL: un proveedor dado de baja libera su nombre (R9). Prisma no modela indices
-- parciales, asi que este indice vive SOLO aqui: si alguien anade `@unique` en el esquema,
-- la unicidad pasa a alcanzar tambien a los proveedores borrados y R9 deja de cumplirse en
-- silencio. La columna la normaliza `normalizeSupplierName` (`design.md` seccion 3).
CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized") WHERE "deleted_at" IS NULL;

-- CHECK (A MANO) de no negatividad (decision cerrada 5, R17). En SQL un CHECK que evalua a
-- NULL SE CUMPLE, asi que estos aceptan la fila sin valor: la ausencia de `min_purchase` y
-- de `delivery_time` es legitima (R13) y quien la prohibe donde no lo es es el NOT NULL de
-- `cost`.
-- Es `>= 0`, no `> 0`: la decision 5 dice «ninguno admite negativos». Que un costo de 0 sea
-- valido es la pregunta abierta 1 de `requirements.md` y hoy la respuesta de la base es que
-- si.
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_cost_non_negative"          CHECK ("cost" >= 0);
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_min_purchase_non_negative"  CHECK ("min_purchase" >= 0);
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_delivery_time_non_negative" CHECK ("delivery_time" >= 0);

-- CHECK (A MANO) — regla cruzada «al menos telefono o correo» (decision cerrada 7, R4).
-- Vive EN LA BASE a proposito: la garantiza el esquema, no solo la aplicacion. Un proveedor
-- sin ninguno de los dos es un proveedor al que no se puede comprar.
-- Tres cosas sabidas y aceptadas (`design.md` seccion 4.4): solo mira AUSENCIA DE VALOR
-- —un telefono en blanco lo satisface, y el texto en blanco lo rechaza `zod` en QC-43
-- (pregunta abierta 6)—; alcanza tambien a los proveedores dados de baja, porque un CHECK
-- se evalua en toda fila (pregunta abierta 8); y se dispara igual en INSERT y en UPDATE,
-- asi que un UPDATE que borre el unico contacto falla con 23514 (R4 dice «persistir o
-- modificar»).
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_contact_required"
  CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL);

-- RLS (A MANO) activado Y forzado en las dos tablas (R33). Sin `FORCE`, el dueno de las
-- tablas —que es con quien se conecta Prisma— la ignora entera. Se activa sin policies:
-- deny-by-default para cualquier via que no sea Prisma. Es defensa en profundidad, no la
-- frontera de autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`), que
-- vive en el service y la fija QC-43.
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" FORCE ROW LEVEL SECURITY;
