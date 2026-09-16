-- Aislamiento por empresa en pedidos.
--
-- `orders` gana `company_id` NOT NULL con FK a `companies`; el unico del correlativo pasa de
-- `(ano, secuencia)` a `(empresa, ano, secuencia)`; nace la clave candidata `(id, company_id)` para
-- que la FK de `order_assignments` hacia el pedido sea compuesta; y cae
-- `next_order_sequence(integer)`, cuya firma no puede expresar una serie por empresa.
--
-- Escrita a mano: las FK sin `@relation` y los CHECK escritos a mano de estas tablas son drift para
-- `prisma migrate dev`. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`), que no mira
-- drift.
--
-- El unico `DROP CONSTRAINT` es el de `order_assignments_order_id_fkey`, que sustituye la FK
-- compuesta del paso 6. Ninguna FK lleva `MATCH FULL`: en la del grupo impediria las asignaciones
-- con `work_group_id IS NULL`. No hay `INSERT` ni `DELETE`, y `order_year`/`order_sequence` no se
-- tocan: los pedidos existentes conservan su numero.
--
-- Tiene que aplicar sin error sobre `orders` vacia: con cero filas el backfill, su comprobacion y
-- el `SET NOT NULL` pasan. Lo unico que aborta ahi es no poder resolver la empresa.
--
-- Prisma ejecuta el archivo en una sola transaccion: cualquier `RAISE EXCEPTION` deshace todo.

-- ---------------------------------------------------------------------------------------
-- 0. `NO FORCE` temporal.
--
-- `orders` y `companies` tienen RLS forzada y ninguna policy, lo que deniega todo al dueno de la
-- tabla (con quien conecta Prisma), tambien el `SELECT`. El backfill escribe `orders` y lee
-- `companies`; sin soltarla, no encontraria la empresa y abortaria con un mensaje equivocado.
-- `order_assignments` solo recibe DDL, que no pasa por la RLS.
--
-- `companies` se vuelve a forzar tras el paso 2 y `orders` en el paso 8, dentro de la misma
-- transaccion. Conectando como superusuario (que se salta la RLS) esto no tiene efecto visible.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders"    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "companies" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. La columna nace ANULABLE: no hay valor por defecto valido y `NOT NULL` fallaria sobre las
-- filas existentes. Se rellena en el paso 2 y se aprieta en el 3, en la misma transaccion. Termina
-- siendo obligatoria porque no hay pedidos de sistema.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ADD COLUMN "company_id" UUID;

-- ---------------------------------------------------------------------------------------
-- 2. Backfill a la unica empresa real.
--
-- La empresa se resuelve por `name_normalized` y nunca por id: los uuid cambian en cada base.
-- `'quimicloud'` es `normalizeCompanyName(INITIAL_COMPANY_NAME)`. Si no existe, solo se admite una
-- tabla con exactamente una empresa; cualquier otro caso aborta.
--
-- Afecta a todas las filas (tambien canceladas y con borrado logico) y solo a `company_id`.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  target_company_id  UUID;
  named_company_rows BIGINT;
  all_company_rows   BIGINT;
  updated_rows       BIGINT;
  total_rows         BIGINT;
BEGIN
  SELECT count(*) INTO named_company_rows
    FROM "companies" WHERE "name_normalized" = 'quimicloud';

  IF named_company_rows = 1 THEN
    SELECT "id" INTO target_company_id
      FROM "companies" WHERE "name_normalized" = 'quimicloud';

  ELSIF named_company_rows = 0 THEN
    SELECT count(*) INTO all_company_rows FROM "companies";
    IF all_company_rows = 1 THEN
      SELECT "id" INTO target_company_id FROM "companies";
    ELSE
      RAISE EXCEPTION
        'QC-60: no se pudo identificar la empresa «QuimiCloud» (name_normalized = ''quimicloud'') y hay % empresa(s) en la tabla, asi que no hay una sola candidata. La migracion se detiene ENTERA y no deja ninguna columna, indice, restriccion ni funcion a medias (R2). Crea la empresa inicial --`pnpm run db:seed`-- o renombra la que corresponda antes de migrar.',
        all_company_rows;
    END IF;

  ELSE
    RAISE EXCEPTION
      'QC-60: hay % empresas con name_normalized = ''quimicloud'', asi que la empresa destino del backfill es AMBIGUA. La migracion se detiene ENTERA (R2): elegir una cualquiera repartiria los pedidos al azar entre dos clientes.',
      named_company_rows;
  END IF;

  -- `ROW_COUNT` contra el total de la PROPIA tabla: si la RLS estuviera filtrando el `UPDATE`,
  -- afectaria a cero filas EN SILENCIO y el `SET NOT NULL` del paso 3 fallaria mucho mas tarde y
  -- por otra razon. Fallar antes que dejar los pedidos a medias.
  UPDATE "orders" SET "company_id" = target_company_id;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "orders";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'QC-60: el backfill de `orders` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar pedidos sin empresa (R2, R3).',
      updated_rows, total_rows;
  END IF;
END $$;

-- `companies` solo se leyo: vuelve activada y forzada.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 3. Y ahora si, OBLIGATORIA. Llegar hasta aqui significa que TODAS las filas tienen empresa.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ALTER COLUMN "company_id" SET NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 4. La FK a `companies`. `ON DELETE RESTRICT`: un borrado fisico de empresa no puede dejar
-- pedidos huerfanos.
--
-- Es drift a proposito: `companyId` se declara escalar sin `@relation` en `db/schema.prisma`, para
-- que `pedidos` no pueda atravesar a `companies` (de `identity`) con un `include`.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 5. El correlativo pasa a medirse DENTRO de la empresa.
--
-- La guardia va antes del `CREATE UNIQUE INDEX` para abortar con un mensaje util en vez de con un
-- `23505` suelto.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  duplicated_pairs BIGINT;
  duplicated_rows  BIGINT;
BEGIN
  SELECT count(*), COALESCE(sum(repeated.copies), 0)
    INTO duplicated_pairs, duplicated_rows
    FROM (
      SELECT "company_id", "order_year", "order_sequence", count(*) AS copies
        FROM "orders"
       GROUP BY "company_id", "order_year", "order_sequence"
      HAVING count(*) > 1
    ) AS repeated;

  IF duplicated_pairs > 0 THEN
    RAISE EXCEPTION
      'QC-60: hay % pareja(s) (ano, secuencia) repetida(s) dentro de una misma empresa, repartidas en % fila(s) de `orders`. El indice unico `orders_company_year_sequence_key` (empresa, ano, secuencia) no se puede crear sobre ese dato: la migracion se detiene ENTERA y no deja ninguna columna, indice ni restriccion a medias (R2, R11). Localizalas con: SELECT company_id, order_year, order_sequence, count(*) FROM orders GROUP BY 1, 2, 3 HAVING count(*) > 1; y renumera a mano los pedidos repetidos antes de volver a migrar.',
      duplicated_pairs, duplicated_rows;
  END IF;
END $$;

-- El unico GLOBAL cae antes de crear el compuesto: con el, dos empresas no podrian llevar cada una
-- su propia serie, y los huecos de la numeracion de una delatarian cuantos pedidos hace otra.
DROP INDEX "orders_order_year_order_sequence_key";

-- Con `company_id` de cabeza sirve tambien para filtrar por empresa y para el `RESTRICT` de la FK
-- del paso 4: no hace falta un indice propio de empresa. No es parcial porque un pedido borrado o
-- cancelado conserva su numero. Prisma lo modela con `@@unique(..., map:
-- "orders_company_year_sequence_key")`. El adaptador reconoce el duplicado por el SQLSTATE `23505`,
-- no por el nombre del indice. Los indices parciales de listado de `orders` no se recomponen.
CREATE UNIQUE INDEX "orders_company_year_sequence_key"
  ON "orders" ("company_id", "order_year", "order_sequence");

-- ---------------------------------------------------------------------------------------
-- 6. La clave candidata y la FK COMPUESTA de `order_assignments` hacia el pedido, como ya lo son
-- sus FK hacia `users` y `work_groups`: asignar un pedido de otra empresa falla en la base
-- (`23503`).
--
-- La clave candidata va antes que la FK que la referencia, o Postgres responde `42830`.
-- `order_assignments` es del modulo `asignaciones`: el cruce entre modulos ocurre solo en la base,
-- no en el codigo. Mismos `ON DELETE RESTRICT ON UPDATE CASCADE` que la FK simple que sustituye.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ADD CONSTRAINT "orders_id_company_id_key" UNIQUE ("id", "company_id");

ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_fkey";

ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_company_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 7. Cae `next_order_sequence(integer)`: dejarla viva seria una segunda definicion del
-- correlativo. El numero lo reparte ahora el adaptador, con `pg_advisory_xact_lock` en una
-- sentencia anterior y `max()+1` dentro del `INSERT`. El `down.sql` la recrea.
--
-- Las secuencias `orders_sequence_<ano>` no se borran: el `down.sql` las usa para su `setval`.
-- ---------------------------------------------------------------------------------------
DROP FUNCTION "next_order_sequence"(integer);

-- ---------------------------------------------------------------------------------------
-- 8. La RLS de `orders` vuelve ACTIVADA Y FORZADA, sin policies. Explicito e idempotente.
--
-- Es defensa en profundidad, no la frontera: Prisma conecta como dueno y no setea
-- `request.jwt.claims`, asi que el aislamiento lo hace el filtro por empresa del adaptador
-- (`docs/architecture.md > Acceso a datos y autorizacion`).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
