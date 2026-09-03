-- QC-33: modelo-pedidos.
--
-- De Prisma salen: los dos `CREATE TYPE` (`OrderStatus`, `OrderPriority` — los PRIMEROS enum
-- del repositorio), el `CREATE TABLE "orders"` con su `orders_pkey`, el indice unico compuesto
-- `orders_order_year_order_sequence_key` y los cuatro indices del lado hijo de las FK.
--
-- COMPLETADO A MANO (ver `specs/QC-33-modelo-pedidos/design.md` secciones 3, 4 y 7.1):
--   1. La extension pgcrypto (autocontenida, como QC-4 / QC-14 / QC-24 / QC-32).
--   2. LAS CUATRO FK, que cruzan las tres fronteras de modulo (`recetas`, `unidades`,
--      `identity`): `orders_recipe_id_fkey`, `orders_unit_id_fkey`, `orders_created_by_fkey` y
--      `orders_updated_by_fkey`, las cuatro `ON DELETE RESTRICT ON UPDATE CASCADE`
--      (design.md > 4, R12, R13, R14, R15, R25, R33). Prisma NO las regenera nunca, porque
--      `recipe_id`, `unit_id`, `created_by` y `updated_by` estan declarados en el esquema como
--      campos ESCALARES SIN `@relation` a proposito: asi la base garantiza la integridad y el
--      cliente Prisma no puede atravesar de `pedidos` a `recetas`, `unidades` ni `users` con un
--      `include` -- un cruce que NINGUNA guardia detecta, porque no es un import
--      (design.md > 8.1).
--   3. LOS CINCO CHECK (Prisma no modela ninguno, design.md > 3): `orders_quantity_positive`,
--      `orders_unit_price_non_negative`, `orders_delivered_not_deleted`,
--      `orders_order_sequence_positive` y `orders_order_year_matches_created_at`.
--   4. Los dos ALTER de RLS sobre `orders` -- ENABLE y FORCE (design.md > 7.1 paso 9, R37).
--
-- NO hay guardia de datos `DO $$` en esta migracion, a diferencia de QC-32, y es deliberado
-- (design.md > 7.1): esta feature CREA una tabla y dos tipos y no toca ni una fila ni una
-- columna existente, asi que no hay ningun dato que pueda perderse. Una guardia «por simetria»
-- seria ruido.
--
-- Toda migracion futura sobre `orders` hay que revisarla A MANO para que el drift de
-- `prisma migrate dev` no borre ninguna de las cuatro FK, ninguno de los cinco CHECK ni el RLS.
-- Si se pierden, el esquema sigue validando y el cliente sigue compilando: no se entera nadie.

-- Extension: `gen_random_uuid()` para el PK uuid de `orders`. Ya la crearon las migraciones de
-- QC-4, QC-14, QC-24 y QC-32; aqui se vuelve a declarar con IF NOT EXISTS para que esta
-- migracion sea autocontenida. El `down.sql` NO la elimina (puede haberla creado otro).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum — conjunto CERRADO en el propio esquema (decision cerrada 4). Anadir un valor
-- manana es un `ALTER TYPE ... ADD VALUE`, que no se puede deshacer: es el coste asumido.
CREATE TYPE "OrderStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADO');

-- CreateEnum — EL ORDEN DE DECLARACION ES EL ORDEN DE LA PRIORIDAD, de menor a mayor: Postgres
-- ordena un enum por su orden de declaracion, no alfabeticamente. Reordenar estos cuatro
-- valores cambia el significado del dato.
CREATE TYPE "OrderPriority" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateTable — un pedido es UNA linea: receta, cantidad, unidad y precio UNITARIO (decision
-- cerrada 1). NO hay columna de total ni subtotal (R10), ni impuestos ni descuentos (R11), ni
-- cliente ni destinatario (R3), ni fecha de solicitud aparte de `created_at` (R4). Las cuatro
-- ausencias son deliberadas.
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_year" INTEGER NOT NULL,
    "order_sequence" INTEGER NOT NULL,
    "recipe_id" UUID NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_id" UUID NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "priority" "OrderPriority" NOT NULL DEFAULT 'BAJA',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDIENTE',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — el correlativo por ano (decision cerrada 9, R21, R22, R23). Es la UNICA
-- garantia real de que el numero no se duplica: no hay comprobacion previa por igualdad, que
-- seria una carrera.
--
-- ES TOTAL, SIN `WHERE`, Y ESO ES LO CONTRARIO DE `recipes_name_unique` (QC-24), que si es
-- parcial y libera el nombre al borrar. Aqui el borrado es LOGICO: la fila del pedido borrado
-- sigue existiendo y sigue ocupando su (ano, posicion), asi que nadie puede reutilizar el
-- numero (R22). Anadirle `WHERE "deleted_at" IS NULL` romperia R22 EN SILENCIO, y por eso
-- `tests/unit/pedidos/schema/pedidos-migration.test.ts` incluye esa mutacion.
--
-- El reinicio anual sale gratis de que el ano este EN el indice: (2026, 1) y (2027, 1) son dos
-- claves distintas (R23). El prefijo izquierdo sirve ademas de indice para «pedidos de este
-- ano», por eso NO hay un `orders_order_year_idx` aparte: seria redundante.
CREATE UNIQUE INDEX "orders_order_year_order_sequence_key" ON "orders"("order_year", "order_sequence");

-- CreateIndex — Postgres no indexa automaticamente el lado hijo de una FK, y por ahi pasan
-- tanto la verificacion del RESTRICT como la consulta «que pedidos usan esta receta» que QC-34
-- va a necesitar el primer dia (design.md > 4).
CREATE INDEX "orders_recipe_id_idx" ON "orders"("recipe_id");

-- CreateIndex
CREATE INDEX "orders_unit_id_idx" ON "orders"("unit_id");

-- CreateIndex — mismo motivo, lado hijo de las dos FK de auditoria.
CREATE INDEX "orders_created_by_idx" ON "orders"("created_by");

-- CreateIndex
CREATE INDEX "orders_updated_by_idx" ON "orders"("updated_by");

-- AddForeignKey (A MANO) — pedido -> receta. Cruza a `recetas` (R14, R33). RESTRICT porque el
-- borrado de receta es LOGICO (QC-24, decision 16): en operacion normal esta FK no se dispara
-- nunca -- una FK no reacciona a un UPDATE -- y el pedido conserva su referencia. Existe para
-- que un borrado FISICO por consola o una purga no deje pedidos apuntando al vacio (R15).
ALTER TABLE "orders" ADD CONSTRAINT "orders_recipe_id_fkey"
  FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (A MANO) — pedido -> unidad. Cruza a `unidades` (R12, R33). Aqui el RESTRICT si
-- es la garantia ACTIVA: `units` NO tiene borrado logico (QC-32, decision 11), asi que un
-- DELETE sobre una unidad usada es posible y esto es lo unico que lo para (R13).
ALTER TABLE "orders" ADD CONSTRAINT "orders_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (A MANO) — auditoria: pedido -> usuario. Cruza a `identity` (R25, R33). Las
-- columnas son ANULABLES (decision cerrada 18, R26) y eso no afloja nada: en SQL una FK solo se
-- verifica cuando la columna tiene valor, asi que un pedido sin autor pasa y uno con un autor
-- inventado se rechaza con 23503.
-- NUNCA `ON DELETE SET NULL`, aunque la columna lo permitiria: convertiria «al usuario lo
-- borraron» en «no lo creo una persona», que son cosas distintas y la decision 18 las separa a
-- proposito. Literal de QC-24.
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK (A MANO) — la cantidad es siempre positiva (decision cerrada 7, R7). `> 0`, no `>= 0`:
-- ni negativa ni cero. La ausencia la rechaza el NOT NULL (23502) y el cero, este CHECK
-- (23514). Copiado literal de `recipe_lines_quantity_positive` (QC-24).
ALTER TABLE "orders" ADD CONSTRAINT "orders_quantity_positive" CHECK ("quantity" > 0);

-- CHECK (A MANO) — el precio unitario nunca es negativo (decision cerrada 6, R9). `>= 0`, NO
-- `> 0`: el cero es un precio legitimo (una muestra, una reposicion sin cargo) y la decision
-- dice «nunca negativo», no «siempre positivo». Es la diferencia DELIBERADA con el CHECK de
-- arriba.
ALTER TABLE "orders" ADD CONSTRAINT "orders_unit_price_non_negative" CHECK ("unit_price" >= 0);

-- CHECK (A MANO) — un pedido ENTREGADO no se puede borrar (decision cerrada 14, R29). Escrito
-- TAL CUAL lo fijo el humano; no se reformula ni se «mejora». Misma filosofia que QC-20 D16:
-- sin garantia en la base no es una garantia real, y la validacion de QC-34 se ANADE a esta, no
-- la sustituye.
--
-- Es simetrico, y conviene leerlo en los dos sentidos: bloquea el UPDATE que pone `deleted_at`
-- en un ENTREGADO, bloquea TAMBIEN el UPDATE que pone `status = 'ENTREGADO'` en uno ya borrado
-- -- un pedido borrado no se entrega --, y bloquea el INSERT que nace con las dos cosas a la
-- vez. NO bloquea nada mas: borrar un PENDIENTE o un EN_CURSO sigue siendo legal (R30).
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status" <> 'ENTREGADO');

-- CHECK (A MANO) — la posicion del correlativo es un entero positivo (R20). Sale de
-- «correlativo unico y creciente» (decision cerrada 9): una posicion 0 o negativa no es un
-- correlativo. NO se anade ninguna restriccion de CONTINUIDAD: los huecos se aceptan a
-- proposito (decision cerrada 27, R42).
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_sequence_positive" CHECK ("order_sequence" > 0);

-- CHECK (A MANO) — el ano del correlativo es el ano de `created_at` medido en UTC (decision
-- cerrada 28, R41). La garantia vive en la base, no en QC-34: sin esto, nada impide un pedido
-- de 2027 numerado como 2026-0000001.
--
-- LA FORMA DE DOS ARGUMENTOS NO ES COSMETICA. `"created_at" AT TIME ZONE 'UTC'` es
-- `timezone(text, timestamptz)`, que devuelve un `timestamp` SIN zona y es IMMUTABLE: la zona
-- va escrita en el propio constraint, no se lee del `TimeZone` de la conexion.
-- `EXTRACT(YEAR FROM "created_at")` a secas sobre un `timestamptz` es STABLE, y Postgres
-- RECHAZA la migracion con «functions in check constraint must be marked IMMUTABLE». NO se
-- simplifica.
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_year_matches_created_at"
  CHECK ("order_year" = EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'UTC'))::int);

-- RLS (A MANO) activado Y forzado en `orders` (R37). Sin `FORCE`, el dueno de las tablas -- que
-- es con quien se conecta Prisma -- la ignora entera. Se activa sin policies: deny-by-default
-- para cualquier via que no sea Prisma. Es defensa en profundidad, no la frontera de
-- autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`), que vive en el caso de
-- uso y la fija QC-34.
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
