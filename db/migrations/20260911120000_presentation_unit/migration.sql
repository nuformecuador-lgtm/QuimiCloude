-- QC-80: unidad-desde-la-presentacion.
--
-- Dos mitades del MISMO movimiento, y por eso una sola migracion (design.md > 11, alternativa
-- F): la PRESENTACION gana una unidad OBLIGATORIA (`presentations.unit_id`, NOT NULL, con FK
-- real a `units` y ON DELETE RESTRICT) y el PRODUCTO deja de declarar la suya
-- (`products.unit_id`, su indice y su FK se van). Partirlas en dos abriria un estado
-- intermedio en el que nadie declara la unidad.
--
-- ESCRITA ENTERA A MANO, no generada por `prisma migrate dev` (design.md > 2). Motivo, el
-- mismo de QC-76: `units` y `presentations` cargan con objetos que Prisma NO modela --el GIN
-- de trigramas y los btree de QC-57, los indices unicos PARCIALES de QC-76, su disparador, la
-- RLS forzada-- y `migrate dev` los lee como DRIFT y propone RESETEAR una base de desarrollo
-- con datos reales. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`), que no mira
-- drift.
--
-- TODA MIGRACION FUTURA SOBRE `presentations` HAY QUE REVISARLA A MANO: la FK que crea el
-- bloque 6 es DRIFT para Prisma, porque `unitId` se declara ESCALAR SIN `@relation` en
-- `db/schema.prisma` a proposito (`Unit` es del modulo `unidades` y `Presentation` de
-- `inventario`; con `@relation` el cliente dejaria a `inventario` atravesar a `units` con un
-- `include`, un cruce de modulos que ninguna guardia detecta porque no es un import). Mismo
-- patron que tenia `products.unit_id` (QC-32 R18) y que tiene `units.company_id` (QC-76).
--
-- NINGUN `INSERT` Y NINGUN `DELETE` sobre `presentations` ni sobre `units` (R5): esta
-- migracion solo ACTUALIZA las filas que ya hay. Rellenar NO es limpiar: el borrado de las 113
-- presentaciones y las 2 unidades de residuo que dejaron las corridas de tests es QC-77, y
-- hacerlo aqui seria QC-77 de contrabando. Lo vigila
-- `tests/unit/inventario/schema/presentation-unit-migration.test.ts`.
--
-- Prisma ejecuta este archivo dentro de UNA sola transaccion, asi que cualquier
-- `RAISE EXCEPTION` de aqui abajo deshace todo y la migracion queda sin aplicar y sin marcar
-- en `_prisma_migrations` (R4).

-- ---------------------------------------------------------------------------------------
-- 1. La columna, ANULABLE DE MOMENTO (design.md > 2.1).
--
-- No hay valor por defecto que poner --y R1 prohibe explicitamente el `@default`--, asi que
-- nacer `NOT NULL` sobre las 114 filas que ya existen fallaria antes de poder rellenarlas. Se
-- crea anulable, se rellena en el bloque 3 y se aprieta a `NOT NULL` en el bloque 5, todo
-- dentro de la misma transaccion: no hay ninguna ventana en la que otra sesion pueda insertar
-- una presentacion sin unidad.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "presentations" ADD COLUMN "unit_id" UUID;

-- ---------------------------------------------------------------------------------------
-- 2. Se ABRE el parentesis de RLS, en LAS DOS TABLAS (R6, design.md > 2.2).
--
-- AQUI ESTA LA MINA. `presentations` (QC-14) y `units` (QC-32) estan las dos `ENABLE` +
-- `FORCE ROW LEVEL SECURITY` y SIN NINGUNA POLICY. `FORCE` hace que las policies se apliquen
-- TAMBIEN al dueno de la tabla --que es con quien se conecta Prisma-- y, sin ninguna policy,
-- eso DENIEGA TODO: no solo el `UPDATE`, tambien el `SELECT`.
--
-- Por eso se sueltan LAS DOS y no solo la que se escribe:
--   `presentations` porque el relleno ESCRIBE en ella, y
--   `units`        porque el relleno la LEE para resolver `kilogramo`. Sin soltarla, ese
--                  `SELECT` devolveria CERO filas, `unit_id` se quedaria en NULL y la
--                  migracion abortaria por el sitio equivocado --con un mensaje que culparia
--                  al catalogo de no tener la unidad que si tiene--.
--
-- QC-76 solto `units` porque escribia en ella; aqui se suelta ademas porque se LEE. El
-- parentesis se cierra en el bloque 4, dentro de la misma transaccion.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "presentations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "units"         NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 3. El relleno, GUARDADO (R4, R5, design.md > 2.3).
--
-- Las 114 presentaciones existentes pasan a `kilogramo` (decision cerrada del 2026-09-11): 113
-- son residuo de corridas de tests, sin referenciar por ningun lote --hay 0 lotes--, y la unica
-- real, «Bolsa 5 KG», es kilogramo.
--
-- La unidad se busca por `name_normalized` Y `company_id IS NULL` --o sea, la de SISTEMA
-- (QC-76 R11)-- y NUNCA POR ID: los uuid los genero `gen_random_uuid()` en la migracion de
-- QC-32 y son DISTINTOS en cada base. Cualquier base puede ademas tener un «kilogramo» propio
-- de alguna empresa; el de sistema es el unico que existe seguro en todas.
--
-- DOS guardias, no una, porque fallan por motivos distintos y el mensaje tiene que decir cual:
--   3.1 la unidad de sistema `kilogramo` no esta en el catalogo (o la RLS filtro el SELECT), y
--   3.3 el UPDATE dejo alguna presentacion con `unit_id` nulo.
-- Sin la segunda, el `SET NOT NULL` del bloque 5 fallaria igualmente pero con un 23502 pelado
-- que no dice ni que ficha lo puso ni por que.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  kilogram_id    UUID;
  updated_rows   INTEGER;
  remaining_null BIGINT;
BEGIN
  -- 3.1. La unidad de sistema `kilogramo`.
  SELECT "id" INTO kilogram_id
    FROM "units"
   WHERE "name_normalized" = 'kilogramo'
     AND "company_id" IS NULL;

  IF kilogram_id IS NULL THEN
    RAISE EXCEPTION
      'QC-80: no existe la unidad de sistema kilogramo (name_normalized = kilogramo con company_id nulo) en "units", asi que no hay con que rellenar "presentations.unit_id". La migracion se detiene ENTERA antes de dejar la columna a medias (R4). Revisa que 20260903121404_units_catalog este aplicada y que la RLS de "units" no este filtrando el SELECT.';
  END IF;

  -- 3.2. El relleno. Un solo UPDATE, SIN `WHERE`: R4 pide TODAS las presentaciones, y la
  -- columna acaba de nacer, asi que todas estan en NULL. Ni un INSERT ni un DELETE (R5).
  UPDATE "presentations" SET "unit_id" = kilogram_id;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  -- 3.3. Y la comprobacion de que no quedo ninguna suelta. Cuenta lo que HAY, no lo que se
  -- creia que habia: el numero de presentaciones no lo fija ningun requisito --eran 114 el
  -- 2026-09-11 y cualquier base de desarrollo puede llevar otras-- asi que comparar contra una
  -- constante abortaria por algo que no es un error. Lo que SI es un error es que quede una
  -- sola fila sin unidad.
  SELECT count(*) INTO remaining_null FROM "presentations" WHERE "unit_id" IS NULL;
  IF remaining_null <> 0 THEN
    RAISE EXCEPTION
      'QC-80: el relleno actualizo % presentacion(es) y quedan % con "unit_id" nulo. O la RLS esta filtrando el UPDATE, o alguien escribio en la tabla en mitad de la migracion: se detiene ENTERA antes de apretar la columna a NOT NULL (R4).',
      updated_rows, remaining_null;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 4. Se CIERRA el parentesis: la RLS vuelve ACTIVADA Y FORZADA en las dos tablas, y SIN
-- NINGUNA POLICY (R6), que es exactamente como estaban antes.
--
-- Deny-by-default para cualquier via que no sea Prisma. Es DEFENSA EN PROFUNDIDAD, NO la
-- frontera de autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`): la
-- frontera es el `requirePermission(actor, 'inventario.modificar')` del caso de uso. Prisma se
-- conecta como dueno y no setea `request.jwt.claims`, asi que una policy no filtraria ninguna
-- consulta de esta aplicacion.
--
-- El `ENABLE` va explicito aunque el bloque 2 solo solto el `FORCE`: es idempotente y deja el
-- estado final escrito entero en el archivo, sin obligar a deducirlo de lo que habia antes.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "presentations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "units"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units"         FORCE  ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 5. La columna se aprieta (R1). Llegar hasta aqui significa que el bloque 3 conto CERO nulos.
-- SIN `DEFAULT`: no hay unidad «por defecto» que valga para una presentacion futura, y ponerla
-- convertiria «no dijo unidad» en «dijo kilogramo» en silencio.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "presentations" ALTER COLUMN "unit_id" SET NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 6. La FK y su indice (R2, R3).
--
-- `ON DELETE RESTRICT`, heredado de QC-32 D10 y confirmado por la decision cerrada 11 de esta
-- ficha. NUNCA `SET NULL`: convertiria «esta unidad se borro» en «esta presentacion no declara
-- unidad», que es justo lo que la columna NOT NULL del bloque 5 prohibe --ni la base lo
-- permitiria--. NUNCA `CASCADE` al borrar: borrar una unidad no puede llevarse por delante las
-- presentaciones que la usan. `ON UPDATE CASCADE` porque un id que cambia tiene que arrastrar
-- a sus hijas, aunque `gen_random_uuid()` no cambie ninguno en la practica.
--
-- Postgres NO indexa el lado hijo de una FK, y por ahi pasa la verificacion del `RESTRICT` en
-- cada intento de borrar una unidad. El indice es el que `@@index([unitId])` declara en
-- `db/schema.prisma`; NO es unico: muchas presentaciones comparten unidad.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "presentations_unit_id_idx" ON "presentations"("unit_id");

-- ---------------------------------------------------------------------------------------
-- 7. La mudanza inversa: `products` deja de declarar unidad (R7, design.md > 2.7).
--
-- La unidad de un producto pasa a DERIVARSE de la presentacion de su lote mas reciente (R22),
-- asi que la columna no se sustituye por nada: desaparece. NO se le devuelve al producto
-- ninguna `presentation_id` (R25): la presentacion vive SOLO en `product_batches` desde QC-90.
--
-- AVISO DE PERDIDA DE DATOS, ACEPTADO Y COMPROBADO contra la base el 2026-09-11: la columna
-- esta VACIA en las 7 filas vivas, asi que no se pierde ningun valor y no hay nada que
-- rescatar. Por eso el `down.sql` la devuelve vacia y eso basta.
--
-- El orden es el unico posible: el indice, luego la FK, luego la columna. Los tres `IF EXISTS`
-- estan por si alguna base ya hubiera perdido alguno de los objetos por un drift anterior; no
-- porque se dude de que existen.
-- ---------------------------------------------------------------------------------------
DROP INDEX IF EXISTS "products_unit_id_idx";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_unit_id_fkey";
ALTER TABLE "products" DROP COLUMN     IF EXISTS "unit_id";
