-- QC-47: la empresa y la columna de empresa del usuario (una empresa por persona, sin tabla
-- intermedia). Ver `specs/QC-47-modelo-empresa-y-membresias/design.md` seccion 3.
--
-- REESCRITA EN SU SITIO el 2026-09-04. La primera version de este archivo modelaba una
-- relacion de MUCHOS A MUCHOS —tabla intermedia, rol mudado alli y la columna del rol
-- eliminada de `users`— y el humano reacoto la ficha. Se reescribio en vez de anadir una
-- segunda migracion encima porque aquella version NUNCA se aplico fuera del worktree
-- (design.md > 3): no esta en `dev`, no esta en `main` y no hay entorno desplegado con ella.
-- Esa condicion es lo que sostiene la decision, y se verifico antes de tocar el SQL.
--
-- De Prisma salen: el `CREATE TABLE "companies"`, el `ADD COLUMN "company_id"`, su FK
-- `users_company_id_fkey` y el indice `users_company_id_idx`.
--
-- COMPLETADO A MANO (design.md > 3.1):
--   1. La extension pgcrypto (autocontenida, como QC-4 / QC-14 / QC-24 / QC-32). El `down.sql`
--      NO la elimina: puede haberla creado otra migracion.
--   2. El indice unico `companies_name_unique`: FUNCIONAL y PARCIAL
--      (`lower("name_normalized")`, `WHERE "deleted_at" IS NULL`). Prisma no modela ni
--      `lower(...)` ni `WHERE`, asi que NO esta en `db/schema.prisma` y este archivo es el
--      unico sitio donde vive. Es la UNICA garantia de R4: no hay `SELECT` previo por
--      igualdad —seria una carrera— y el choque se traduce del SQLSTATE 23505. Parcial porque
--      una empresa dada de baja libera su nombre (R5), el precedente de `recipes_name_unique`,
--      `suppliers_name_unique` y `users_email_unique`.
--   3. EL BACKFILL (design.md > 3.2, R23): la empresa inicial y TODOS los usuarios ya
--      cargados dentro de ella, incluidos los dados de baja.
--   4. Los tres `DROP INDEX` + los tres `CREATE UNIQUE INDEX` de `users` (design.md > 2.2;
--      R16, R17, R18, R19): el correo, el nombre de usuario y la pareja tipo+numero de
--      documento pasan a medirse DENTRO de la empresa. Es el riesgo n.o 1 de la ficha.
--   5. Los dos ALTER de RLS de `companies`, AL FINAL DEL TODO (R24).
--   6. Se BORRARON a mano los `DROP CONSTRAINT` que Prisma genero por DRIFT sobre `orders`,
--      `products`, `recipe_lines`, `recipes`, `supplier_catalog_lines` y `suppliers`: son las
--      FK escritas a mano por QC-20, QC-24, QC-32, QC-33 y QC-40; Prisma no las conoce (los
--      identificadores `*_id` son escalares sin `@relation` a proposito) y por eso queria
--      eliminarlas. Esta migracion NO las toca, como tampoco toca sus CHECK ni su RLS.
--
-- LO QUE ESTA MIGRACION NO TOCA, Y ES UN REQUISITO CON NOMBRE (R13): la columna del rol de
-- `users`. Ni la columna, ni su clave foranea, ni su indice. El rol sigue viviendo en la fila
-- del usuario, con el mismo nombre y el mismo tipo que dejo QC-4, y el seed, el login y la
-- sesion lo siguen leyendo de ahi sin ninguna consulta adicional (R14). Fuera de estos
-- comentarios el rol no aparece en ninguna linea ejecutable de este archivo, y eso lo vigila
-- `tests/unit/identity/schema/companies-migration.test.ts`.
--
-- `users` TAMPOCO gana ni pierde RLS: la tiene activada Y forzada desde QC-4.
--
-- Prisma ejecuta cada `migration.sql` dentro de UNA transaccion, asi que si cualquier paso
-- falla la migracion queda sin aplicar y sin marcar.

-- ---------------------------------------------------------------------------------------
-- 1. Extension: `gen_random_uuid()` para el PK uuid de la tabla nueva.
-- ---------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------------------
-- 2. CreateTable — la empresa (design.md > 1.1). `id` UUID aleatorio, ni correlativo ni
-- derivado del nombre (R1); `name` obligatorio, y esa obligatoriedad la impone la BASE (R2);
-- `name_normalized` obligatorio, lo calcula el dominio (R3); marcas de tiempo (R7); y
-- `deleted_at` anulable, que nace vacia y que NADIE escribe en esta ficha (R6). Todo TEXT, sin
-- `varchar(n)` (R8).
-- ---------------------------------------------------------------------------------------
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------------------
-- 3. CreateIndex (A MANO) — unicidad del nombre de empresa (R4, R5). `lower(...)` es
-- redundante sobre una columna ya normalizada y se escribe igual, por simetria con
-- `users_email_unique` y para que la unicidad no dependa de que el llamante haya normalizado
-- bien.
-- ---------------------------------------------------------------------------------------
CREATE UNIQUE INDEX "companies_name_unique" ON "companies" (lower("name_normalized")) WHERE "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------------------
-- 4. AlterTable — la columna de empresa entra ANULABLE: todavia no hay valor que darle. Se
-- endurece en el paso 6, despues del backfill.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "company_id" UUID;

-- ---------------------------------------------------------------------------------------
-- 5. BACKFILL (design.md > 3.2, R23). Mete a los usuarios ya cargados en la empresa inicial.
--
-- Si NO hay ningun usuario, no se crea ninguna empresa: la deja el seed (R20), y por eso el
-- bloque empieza contando. Una empresa vacia creada por una migracion es una fila que nadie
-- pidio y que el seed tendria que reutilizar por casualidad.
--
-- Los usuarios DADOS DE BAJA entran tambien, a proposito: `company_id` va a ser NOT NULL en el
-- paso siguiente y un `WHERE deleted_at IS NULL` los dejaria fuera, con lo que ese paso
-- fallaria con 23502. La empresa no autoriza por si sola y el login sigue filtrando por
-- `deleted_at IS NULL`.
--
-- EL ROL NO SE TOCA EN NINGUNA LINEA. Esa es toda la diferencia con la primera vuelta de la
-- ficha, y es literalmente R23: no hay nada que mover.
--
-- EL SITIO NO ES COSMETICO. Va ANTES de los `ALTER ... ROW LEVEL SECURITY` del final —`FORCE`
-- sin policies deniega TAMBIEN al dueno de la tabla cuando ese dueno no es superusuario, asi
-- que una escritura colocada despues del FORCE podria no escribir nada EN SILENCIO (leccion
-- que QC-32 dejo escrita en su design.md > 6.1)— y ANTES del `SET NOT NULL`, porque es lo que
-- da valor a la columna. Lo vigila
-- `tests/unit/identity/schema/companies-migration.test.ts`.
--
-- `updated_at` va EXPLICITO en el INSERT: es NOT NULL SIN default porque su valor lo pone
-- `@updatedAt` del cliente Prisma en tiempo de ejecucion, no la base, asi que un INSERT crudo
-- sin el falla. Misma nota que QC-4 y QC-32.
--
-- `name` y `name_normalized` van LITERALES, y es el punto fragil de la ficha: no hay forma de
-- llamar a `INITIAL_COMPANY_NAME` ni a `normalizeCompanyName` (TypeScript,
-- `lib/modules/identity/domain/`) desde una migracion. Es un duplicado que se puede
-- desincronizar EN SILENCIO; lo unico que se da cuenta es el test de esquema, que importa la
-- constante y la funcion REALES y las compara con los literales extraidos de este INSERT (R21).
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  usuarios BIGINT;
  empresa  UUID;
BEGIN
  SELECT count(*) INTO usuarios FROM "users";
  IF usuarios = 0 THEN RETURN; END IF;

  INSERT INTO "companies" ("name", "name_normalized", "updated_at")
  VALUES ('QuimiCloud', 'quimicloud', CURRENT_TIMESTAMP)
  RETURNING "id" INTO empresa;

  UPDATE "users" SET "company_id" = empresa WHERE "company_id" IS NULL;
END $$;

-- ---------------------------------------------------------------------------------------
-- 6. AlterTable — y solo entonces la columna se endurece (R9). Sobre una base con usuarios y
-- sin backfill efectivo esto falla con 23502: el fallo es RUIDOSO a proposito.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;

-- ---------------------------------------------------------------------------------------
-- 7. AddForeignKey — la empresa referenciada existe de verdad (R10) y no se puede borrar
-- mientras le quede algun usuario, vivo o dado de baja (R11). RESTRICT y NUNCA CASCADE.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 8. CreateIndex — Postgres no indexa automaticamente el lado hijo de una FK, y por ahi pasa
-- la verificacion del RESTRICT en cada intento de borrar una empresa. NO es redundante con los
-- tres unicos del paso 9 aunque `company_id` sea su columna lider: los tres son PARCIALES
-- (`WHERE deleted_at IS NULL`) y el RESTRICT tiene que ver tambien a los usuarios de baja.
-- ---------------------------------------------------------------------------------------
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- ---------------------------------------------------------------------------------------
-- 9. EL CORAZON DE LA FICHA (design.md > 2; R16, R17, R18, R19). Los tres indices unicos
-- FUNCIONALES y PARCIALES que QC-4 escribio a mano se borran y se recrean CON LA EMPRESA
-- DENTRO: el correo, el nombre de usuario y la pareja tipo+numero de documento pasan a ser
-- unicos DENTRO de la empresa. Dos empresas pueden tener cada una su `admin`.
--
-- Van DESPUES del `SET NOT NULL` del paso 6: un indice sobre una columna que todavia admite
-- NULL trataria cada NULL como distinto y la particion no significaria nada.
--
-- Se conservan las DOS propiedades que Prisma no modela y que nadie debe perder por el camino:
-- `lower(...)` da la unicidad insensible a mayusculas, y `WHERE "deleted_at" IS NULL` la acota
-- a los usuarios vivos, para que un borrado logico no queme el correo, el username ni el
-- documento para siempre (R19). El UP no puede fallar por colision: viene de un mundo donde
-- las tres claves eran globales, asi que ya son unicas dentro de cualquier particion.
-- ---------------------------------------------------------------------------------------
DROP INDEX "users_email_unique";
DROP INDEX "users_username_unique";
DROP INDEX "users_document_unique";

CREATE UNIQUE INDEX "users_email_unique" ON "users" ("company_id", lower("email")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_username_unique" ON "users" ("company_id", lower("username")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_document_unique" ON "users" ("company_id", "document_type_code", "document_number") WHERE "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------------------
-- 10. RLS (A MANO) activada Y forzada en la tabla nueva (R24). Sin `FORCE`, el dueno de la
-- tabla —que es con quien se conecta Prisma— la ignora entera. Se activa sin policies:
-- deny-by-default para cualquier via que no sea Prisma. Es defensa en profundidad, no la
-- frontera de autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`), que vive
-- en el service.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
