-- aislamiento-por-empresa-en-proveedores.
--
-- `suppliers` y `supplier_catalog_lines` ganan `company_id` NOT NULL con FK a `companies`. La
-- linea lleva columna PROPIA -no la hereda de su proveedor-, y por eso el archivo tambien anade
-- dos claves candidatas `(company_id, id)` -en `suppliers` y en `presentations`- y dos FK
-- COMPUESTAS que hacen imposible que una linea contradiga la empresa de su proveedor o la de su
-- presentacion. El unico de nombre pasa de `(name_normalized)` GLOBAL a `(company_id,
-- name_normalized)` y SIGUE SIENDO PARCIAL por `deleted_at IS NULL`.
--
-- Escrita entera a mano, no generada por `prisma migrate dev`: las dos tablas ya cargan con FK
-- escritas a mano, varios `CHECK`, indices unicos parciales, indices GIN de trigramas y RLS
-- forzada, todo lo cual `migrate dev` lee como drift y propone resetear una base con datos. Se
-- aplica con `pnpm run db:migrate` (`prisma migrate deploy`), que no mira drift.
--
-- Ningun `INSERT` y ningun `DELETE` en todo el archivo: solo anade columnas, actualiza las filas
-- que ya hay, releva un indice y anade restricciones.
--
-- Prisma ejecuta este archivo dentro de una sola transaccion: cualquier `RAISE EXCEPTION` de aqui
-- abajo deshace todo y la migracion queda sin aplicar y sin marcar en `_prisma_migrations`.

-- ---------------------------------------------------------------------------------------
-- 0. `NO FORCE` temporal en las cuatro tablas.
--
-- `suppliers`, `supplier_catalog_lines`, `presentations` y `companies` tienen RLS activada y
-- forzada sin ninguna policy, y bajo `FORCE` eso deniega todo al dueno de la tabla -con quien
-- conecta Prisma-, incluido el `SELECT`. Este archivo escribe las dos primeras, lee `companies`
-- para resolver la empresa del backfill y lee y altera `presentations`; sin soltar las cuatro,
-- esas operaciones fallarian por el motivo equivocado.
--
-- `companies` se vuelve a forzar en cuanto termina de leerse (tras el paso 2); `suppliers`,
-- `supplier_catalog_lines` y `presentations`, al final (paso 8).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "suppliers"             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "companies"             NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. Las dos columnas nacen ANULABLES: no hay un valor por defecto que no sea una mentira. Se
-- rellenan en los pasos 2 y 3 y se aprietan en el 5, en la misma transaccion.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "suppliers"              ADD COLUMN "company_id" UUID;
ALTER TABLE "supplier_catalog_lines" ADD COLUMN "company_id" UUID;

-- ---------------------------------------------------------------------------------------
-- 2. Backfill de `suppliers` a la unica empresa real.
--
-- La empresa se resuelve por `name_normalized` y nunca por identificador: los uuid los genera
-- `gen_random_uuid()` y difieren en cada base. Si no hay ninguna con ese nombre, el unico
-- fallback admitido es que la tabla tenga exactamente una fila; cualquier otro caso aborta.
--
-- Afecta a todas las filas, incluidas las de borrado logico: la columna va a ser NOT NULL y un
-- proveedor dado de baja sigue siendo una fila.
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
        'suppliers_company_scope: no se pudo identificar la empresa «QuimiCloud» (name_normalized = ''quimicloud'') y hay % empresa(s) en la tabla, asi que no hay una sola candidata. La migracion se detiene ENTERA y no deja ninguna columna, indice ni restriccion a medias. Crea la empresa inicial -`pnpm run db:seed`- o renombra la que corresponda antes de migrar.',
        all_company_rows;
    END IF;

  ELSE
    RAISE EXCEPTION
      'suppliers_company_scope: hay % empresas con name_normalized = ''quimicloud'', asi que la empresa destino del backfill es AMBIGUA. La migracion se detiene ENTERA: elegir una cualquiera repartiria los proveedores al azar entre dos clientes.',
      named_company_rows;
  END IF;

  -- `ROW_COUNT` contra el total de la PROPIA tabla: si la RLS estuviera filtrando el `UPDATE`,
  -- afectaria a cero filas en silencio y el `SET NOT NULL` del paso 5 fallaria mucho mas tarde y
  -- por otra razon. Fallar antes que dejar proveedores a medias.
  UPDATE "suppliers" SET "company_id" = target_company_id;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "suppliers";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'suppliers_company_scope: el backfill de `suppliers` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o algo escribio en la tabla dentro de la transaccion: la migracion se detiene antes de dejar proveedores sin empresa.',
      updated_rows, total_rows;
  END IF;
END $$;

-- `companies` solo se leyo: vuelve activada y forzada tal cual estaba.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 3. Backfill de `supplier_catalog_lines`: la empresa de su proveedor, NUNCA repitiendo la
-- resolucion por nombre. Derivarla del proveedor es lo que garantiza que no existe ni un
-- instante con una linea cuya empresa discrepe de la de su proveedor.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  updated_rows BIGINT;
  total_rows   BIGINT;
BEGIN
  UPDATE "supplier_catalog_lines" AS l
     SET "company_id" = s."company_id"
    FROM "suppliers" AS s
   WHERE s."id" = l."supplier_id";
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO total_rows FROM "supplier_catalog_lines";
  IF updated_rows <> total_rows THEN
    RAISE EXCEPTION
      'suppliers_company_scope: el backfill de `supplier_catalog_lines` actualizo % fila(s) de un total de %. O la RLS esta filtrando el UPDATE, o alguna linea no encontro su proveedor: la migracion se detiene antes de dejar lineas sin empresa.',
      updated_rows, total_rows;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 4. Guardia: ninguna linea puede apuntar a una presentacion de otra empresa. Imposible con el
-- dato de hoy -la unica linea viva es de QuimiCloud y su presentacion tambien-, pero se escribe
-- igual: el mensaje dice cuantas filas y que hacer, en vez de un `23503` suelto mas adelante.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  crossed_lines BIGINT;
BEGIN
  SELECT count(*) INTO crossed_lines
    FROM "supplier_catalog_lines" AS l
    JOIN "presentations" AS p ON p."id" = l."presentation_id"
   WHERE l."company_id" <> p."company_id";

  IF crossed_lines > 0 THEN
    RAISE EXCEPTION
      'suppliers_company_scope: hay % linea(s) de catalogo cuya empresa no coincide con la de la presentacion a la que apuntan. La migracion se detiene ENTERA: forzar `company_id` NOT NULL dejaria esas filas contradiciendo la FK compuesta que se anade en el paso 6. Localizalas con: SELECT l.id, l.company_id, p.id, p.company_id FROM supplier_catalog_lines l JOIN presentations p ON p.id = l.presentation_id WHERE l.company_id <> p.company_id; y corrigelas a mano antes de volver a migrar.',
      crossed_lines;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 5. Y ahora si, OBLIGATORIAS. Llegar hasta aqui significa que todas las filas tienen empresa.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "suppliers"              ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "supplier_catalog_lines" ALTER COLUMN "company_id" SET NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 6. Las dos claves candidatas, las dos FK simples a `companies` y las dos FK COMPUESTAS.
--
-- Las candidatas van antes que las FK que las referencian, o Postgres responde
-- `there is no unique constraint matching given keys`. Las compuestas van despues del paso 4,
-- por lo mismo: nunca puede existir una linea que las contradiga.
--
-- `ON DELETE RESTRICT` en las FK simples: `companies` tiene borrado logico, asi que un borrado
-- fisico de empresa no puede dejar proveedores ni lineas huerfanos. Es drift a proposito:
-- `companyId` se declara escalar sin `@relation` en `db/schema.prisma`, para que `proveedores`
-- no pueda atravesar a `companies` con un `include`.
--
-- La FK compuesta hacia `suppliers` usa `ON DELETE CASCADE` -como la FK simple
-- `supplier_catalog_lines_supplier_id_fkey`, que SE CONSERVA y no se sustituye-. La FK compuesta
-- hacia `presentations` usa `ON DELETE RESTRICT`, como `supplier_catalog_lines_presentation_id_fkey`,
-- que tambien se conserva.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "suppliers"     ADD CONSTRAINT "suppliers_company_id_id_key"     UNIQUE ("company_id", "id");
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_company_id_id_key" UNIQUE ("company_id", "id");

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_company_id_supplier_id_fkey"
  FOREIGN KEY ("company_id", "supplier_id") REFERENCES "suppliers"("company_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey"
  FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 7. Guardia + relevo del indice unico de nombre: de GLOBAL a POR EMPRESA, y SIGUE SIENDO
-- PARCIAL.
--
-- La guardia va antes del `CREATE UNIQUE INDEX` para abortar con un mensaje util en vez de con
-- un `23505` suelto. Con el indice global todavia vivo en este punto, la condicion es imposible
-- hoy -por eso se escribe igual, para el dia que deje de serlo-.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  duplicated_names BIGINT;
  duplicated_rows  BIGINT;
BEGIN
  SELECT count(*), COALESCE(sum(repeated.copies), 0)
    INTO duplicated_names, duplicated_rows
    FROM (
      SELECT "company_id", "name_normalized", count(*) AS copies
        FROM "suppliers"
       WHERE "deleted_at" IS NULL
       GROUP BY "company_id", "name_normalized"
      HAVING count(*) > 1
    ) AS repeated;

  IF duplicated_names > 0 THEN
    RAISE EXCEPTION
      'suppliers_company_scope: hay % nombre(s) normalizado(s) compartido(s) por mas de un proveedor VIVO dentro de la misma empresa, repartidos en % fila(s) de `suppliers`. El indice unico `suppliers_company_name_unique` (empresa, nombre) no se puede crear sobre ese dato: la migracion se detiene ENTERA y no deja ningun indice a medias. Localizalos con: SELECT company_id, name_normalized, count(*) FROM suppliers WHERE deleted_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1; y renombra o da de baja a mano los proveedores repetidos antes de volver a migrar.',
      duplicated_names, duplicated_rows;
  END IF;
END $$;

-- El unico GLOBAL cae antes de crear el compuesto: con el, dos empresas no podrian tener cada
-- una su propio proveedor con el mismo nombre.
DROP INDEX "suppliers_name_unique";

-- Sigue siendo PARCIAL: un proveedor dado de baja libera su nombre para su empresa. Sin el
-- `WHERE`, la unicidad alcanzaria tambien a los proveedores borrados y esa liberacion dejaria de
-- cumplirse en silencio. No hace falta un indice propio de `company_id`: la clave candidata del
-- paso 6 lo lleva de cabeza y es total, asi que sirve tambien para eso.
CREATE UNIQUE INDEX "suppliers_company_name_unique"
  ON "suppliers" ("company_id", "name_normalized")
  WHERE "deleted_at" IS NULL;

-- Da indice al lado hijo de la FK compuesta hacia `suppliers`, con `company_id` de cabeza. El
-- lado hijo de la FK hacia `presentations` se apoya en `supplier_catalog_lines_presentation_id_idx`,
-- que ya existe.
CREATE INDEX "supplier_catalog_lines_company_id_supplier_id_idx"
  ON "supplier_catalog_lines" ("company_id", "supplier_id");

-- ---------------------------------------------------------------------------------------
-- 8. Se cierra el parentesis de `suppliers`, `supplier_catalog_lines` y `presentations`: RLS
-- vuelve ACTIVADA Y FORZADA, sin policies. Explicito e idempotente.
--
-- Es defensa en profundidad, no la frontera de autorizacion: Prisma conecta como dueno y no
-- setea `request.jwt.claims`, asi que el aislamiento por empresa lo hace el filtro del
-- adaptador, no una policy.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "suppliers"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers"              FORCE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "presentations"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations"          FORCE ROW LEVEL SECURITY;
