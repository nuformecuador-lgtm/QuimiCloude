-- QC-32: modelo-unidades.
--
-- De Prisma salen: el `CREATE TABLE "units"`, su indice unico `units_name_normalized_key`, las
-- dos `ADD COLUMN "unit_id"`, los dos `DROP COLUMN "unit"` y los dos indices de FK.
--
-- COMPLETADO A MANO (ver `specs/QC-32-modelo-unidades/design.md` seccion 4):
--   1. La GUARDIA DE DATOS del principio (seccion 4.1, R22): si hay unidad escrita en
--      `products` o en `recipe_lines`, la migracion ABORTA entera y no se pierde ese texto.
--      Prisma ejecuta cada `migration.sql` dentro de UNA transaccion, asi que el
--      `RAISE EXCEPTION` deshace todo lo anterior y la migracion queda sin aplicar y sin
--      marcar: eso es exactamente lo que R22 pide.
--   2. La extension pgcrypto (autocontenida, como QC-4 / QC-14 / QC-24).
--   3. LAS DOS FK QUE CRUZAN DE MODULO: `products_unit_id_fkey` y `recipe_lines_unit_id_fkey`
--      hacia `units`, con `ON DELETE RESTRICT ON UPDATE CASCADE` (seccion 4.3, R12, R13, R18).
--      Prisma NO las regenera nunca, porque `unit_id` esta declarado en el esquema como campo
--      ESCALAR SIN `@relation` a proposito: asi la base garantiza la integridad y el cliente
--      Prisma no puede atravesar de `inventario` ni de `recetas` a `unidades` con un `include`
--      -- un cruce que NINGUNA guardia detecta, porque no es un import (seccion 8.1).
--   4. Los dos ALTER de RLS sobre `units` (seccion 4.4, R21).
--   5. Se REORDENO lo que genero Prisma: los dos `DROP COLUMN "unit"` van al final, despues de
--      construir todo lo nuevo. La transaccion es atomica, asi que el resultado no cambia; el
--      orden en que se lee el archivo, si.
--   6. Se BORRARON a mano cinco `DROP CONSTRAINT` que Prisma habia generado por DRIFT
--      (`products_created_by_fkey`, `products_updated_by_fkey`, `recipe_lines_product_id_fkey`,
--      `recipes_created_by_fkey`, `recipes_updated_by_fkey`): son las FK escritas a mano por
--      QC-20 y QC-24, Prisma no las conoce y por eso queria eliminarlas. Esta migracion NO las
--      toca.
--   7. EL CONJUNTO ARRANCADOR: el `INSERT` de las cuatro unidades (`mililitro`, `litro`,
--      `gramo`, `kilogramo`), colocado entre el indice unico y los ALTER de RLS (seccion 6.1,
--      R25, R26). Sustituye al seed de aplicacion que las rondas 1 y 2 habian construido y
--      que el humano retiro el 2026-09-03: el catalogo nace donde nace su tabla.
--
-- Toda migracion futura sobre `products` o `recipe_lines` hay que revisarla A MANO para que el
-- drift de `prisma migrate dev` no borre ninguna de esas FK, ni los CHECK y el RLS que dejaron
-- QC-14, QC-20 y QC-24. Si se pierden, el esquema sigue validando y el cliente sigue
-- compilando: no se entera nadie.

-- ---------------------------------------------------------------------------------------
-- 1. Guardia de datos (design.md > 4.1, R22). VA LA PRIMERA, antes del CREATE TABLE, para que
-- su mensaje llegue antes que cualquier otro error.
--
-- `recipe_lines."unit"` es NOT NULL, asi que `WHERE "unit" IS NOT NULL` cuenta TODAS sus filas.
-- Se escribe con el predicado igualmente, para que las dos ramas se lean iguales y para que
-- siga siendo correcta si alguien afloja esa columna antes de aplicar.
-- ---------------------------------------------------------------------------------------

-- QC-32: la migracion supone la base VACIA de unidades escritas (decision cerrada 6).
-- Si NO lo esta, se PARA aqui: perder el texto de unidad seria perder el dato, y esta
-- decision se reabre con el humano (requirements.md > pregunta abierta 2).
DO $$
DECLARE
  productos_con_unidad BIGINT;
  lineas_con_unidad    BIGINT;
BEGIN
  SELECT count(*) INTO productos_con_unidad FROM "products" WHERE "unit" IS NOT NULL;
  SELECT count(*) INTO lineas_con_unidad    FROM "recipe_lines" WHERE "unit" IS NOT NULL;
  IF productos_con_unidad > 0 OR lineas_con_unidad > 0 THEN
    RAISE EXCEPTION
      'QC-32: hay % producto(s) y % linea(s) de receta con unidad escrita. La migracion se detiene para no perder ese dato: reabre la decision (specs/QC-32-modelo-unidades/requirements.md, pregunta abierta 2) antes de aplicarla.',
      productos_con_unidad, lineas_con_unidad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 2. Extension: `gen_random_uuid()` para el PK uuid de `units`. Ya la crearon las migraciones
-- de QC-4, QC-14 y QC-24; aqui se vuelve a declarar con IF NOT EXISTS para que esta migracion
-- sea autocontenida. El `down.sql` NO la elimina (puede haberla creado otro).
-- ---------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "symbol" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — unicidad del nombre normalizado (decision cerrada 5, R5). Es la UNICA garantia
-- real: dos altas simultaneas que superen cualquier comprobacion previa acaban con una sola
-- fila creada y la otra rechazada con 23505. TOTAL, no parcial: sin `deleted_at` (R8) no hay
-- filas muertas que liberen el nombre. NO se crea ningun indice sobre `symbol`, y es
-- deliberado (R7, pregunta abierta 1): la identidad de la unidad es su nombre.
CREATE UNIQUE INDEX "units_name_normalized_key" ON "units"("name_normalized");

-- ---------------------------------------------------------------------------------------
-- CONJUNTO ARRANCADOR (design.md > 6.1, R25, R26). El catalogo nace CON la tabla: cuatro
-- filas insertadas aqui, sin seed de aplicacion. La idempotencia la da `_prisma_migrations`
-- —una migracion se aplica una vez—, no un `findMany` previo.
--
-- EL SITIO NO ES COSMETICO. Va DESPUES del `CREATE UNIQUE INDEX` y, sobre todo, ANTES de los
-- dos `ALTER TABLE "units" ... ROW LEVEL SECURITY` del final: `FORCE ROW LEVEL SECURITY` sin
-- policies deniega TAMBIEN al dueno de la tabla, que es con quien se conecta Prisma, asi que
-- un INSERT colocado despues del FORCE no insertaria nada. Lo vigila
-- `tests/unit/unidades/schema/unidades-migration.test.ts`.
--
-- `id` y `created_at` tienen DEFAULT; `updated_at` es NOT NULL SIN default (lo rellena
-- `@updatedAt` en tiempo de ejecucion, no en SQL crudo), por eso va explicito.
--
-- `name_normalized` va LITERAL, y es el punto fragil de la ficha: no hay forma de llamar a
-- `normalizeUnitName` (TypeScript, `lib/modules/unidades/domain/unit-name.ts`) desde una
-- migracion. Es un duplicado de la unica definicion de R4 que se puede desincronizar EN
-- SILENCIO —cambiar la funcion o un literal de aqui y que nadie se entere—. Lo unico que se
-- da cuenta es el test `migration.sql — el conjunto arrancador` de
-- `tests/unit/unidades/schema/unidades-migration.test.ts`, que importa la funcion REAL y la
-- aplica a los literales extraidos de este INSERT (R26).
--
-- Cuatro filas y no cinco, las cuatro con simbolo, nombres en minuscula: lo cerro el humano
-- el 2026-09-03 (requirements.md > pregunta abierta 4). «unidad» NO esta. El simbolo sigue
-- siendo OPCIONAL en la columna (R3) aunque ninguna fila arrancadora estrene ya la ausencia.
-- ---------------------------------------------------------------------------------------
INSERT INTO "units" ("name", "name_normalized", "symbol", "updated_at") VALUES
  ('mililitro', 'mililitro', 'ml', CURRENT_TIMESTAMP),
  ('litro',     'litro',     'l',  CURRENT_TIMESTAMP),
  ('gramo',     'gramo',     'gr', CURRENT_TIMESTAMP),
  ('kilogramo', 'kilogramo', 'kg', CURRENT_TIMESTAMP);

-- AlterTable — la unidad del producto pasa a ser una referencia al catalogo. OPCIONAL
-- (decision cerrada 7, R10).
ALTER TABLE "products" ADD COLUMN "unit_id" UUID;

-- AlterTable — la de la linea de receta, OBLIGATORIA (decision cerrada 8, R11). Un
-- `ADD COLUMN ... NOT NULL` sin DEFAULT solo es legal si la tabla esta vacia, y la guardia de
-- arriba ya lo garantizo; si tuviera filas, Postgres fallaria aqui por si solo, que es la
-- segunda red. A proposito NO lleva DEFAULT: sembraria referencias inventadas.
ALTER TABLE "recipe_lines" ADD COLUMN "unit_id" UUID NOT NULL;

-- AddForeignKey (A MANO) — producto -> unidad. Cruza a `unidades`: campo escalar en Prisma, FK
-- real aqui (R12, R18). `ON DELETE RESTRICT` es la decision cerrada 10 y la UNICA garantia real
-- de R13 -- de ahi que la decision 11 prohiba `deleted_at` en el catalogo: un borrado logico es
-- un UPDATE y ninguna FK reacciona a un UPDATE. NUNCA `ON DELETE SET NULL`, aunque la columna
-- lo permitiria: convertiria «esta unidad se borro» en «este producto no declara unidad», que
-- son cosas distintas (design.md > 8.3). `ON UPDATE CASCADE` por convencion del repo.
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (A MANO) — linea de receta -> unidad. Mismo razonamiento; aqui `SET NULL` ni
-- siquiera seria posible, porque la columna es NOT NULL.
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex — Postgres no indexa automaticamente el lado hijo de una FK, y por ahi pasa la
-- verificacion del RESTRICT en cada intento de borrar una unidad.
CREATE INDEX "products_unit_id_idx" ON "products"("unit_id");

-- CreateIndex
CREATE INDEX "recipe_lines_unit_id_idx" ON "recipe_lines"("unit_id");

-- ---------------------------------------------------------------------------------------
-- 9. Y AL FINAL se quita lo viejo: la unidad como texto libre desaparece de las dos tablas
-- (R10, R11). Llegar hasta aqui significa que la guardia del principio conto cero filas con
-- unidad escrita, asi que no se pierde ningun dato.
-- ---------------------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "products" DROP COLUMN "unit";

-- AlterTable
ALTER TABLE "recipe_lines" DROP COLUMN "unit";

-- RLS (A MANO) activado Y forzado en `units` (R21). Sin `FORCE`, el dueno de las tablas -- que
-- es con quien se conecta Prisma -- la ignora entera. Se activa sin policies: deny-by-default
-- para cualquier via que no sea Prisma. Es defensa en profundidad, no la frontera de
-- autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`), que vive en el service
-- y la fija QC-38.
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
