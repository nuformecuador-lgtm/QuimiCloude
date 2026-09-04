-- QC-47: modelo-empresa-y-membresias.
--
-- De Prisma salen: el `CREATE TABLE "companies"`, el `CREATE TABLE "memberships"` con sus tres
-- FK y su indice unico `memberships_user_id_company_id_key`, los dos indices de FK
-- (`memberships_company_id_idx`, `memberships_role_id_idx`) y el
-- `ALTER TABLE "users" DROP COLUMN "role_id"`.
--
-- COMPLETADO A MANO (ver `specs/QC-47-modelo-empresa-y-membresias/design.md` seccion 4):
--   1. La extension pgcrypto (autocontenida, como QC-4 / QC-14 / QC-24 / QC-32). El `down.sql`
--      NO la elimina: puede haberla creado otra migracion.
--   2. El indice unico `companies_name_unique`: FUNCIONAL y PARCIAL
--      (`lower("name_normalized")`, `WHERE "deleted_at" IS NULL`). Prisma no modela ni
--      `lower(...)` ni `WHERE`, asi que NO esta en `db/schema.prisma` y este archivo es el
--      unico sitio donde vive. Es la UNICA garantia de R4: no hay `SELECT` previo por
--      igualdad —seria una carrera— y el choque se traduce del SQLSTATE 23505. Parcial porque
--      una empresa dada de baja libera su nombre (decision cerrada del humano el 2026-09-04,
--      requirements.md > pregunta abierta 5), el precedente de `recipes_name_unique`,
--      `suppliers_name_unique` y `users_email_unique`.
--   3. EL BACKFILL (seccion 4.2, R24): la empresa inicial y una pertenencia por usuario con
--      EXACTAMENTE el rol que tenia en `users.role_id`. Va DESPUES de crear todo lo nuevo
--      —porque escribe en las dos tablas— y ANTES del `DROP COLUMN` —porque lee `role_id`—.
--   4. Los cuatro ALTER de RLS, AL FINAL DEL TODO (seccion 4.1 paso 8, R23).
--   5. Se BORRARON a mano los `DROP CONSTRAINT` que Prisma genero por DRIFT sobre
--      `orders`, `products`, `recipe_lines`, `recipes`, `supplier_catalog_lines` y
--      `suppliers`: son las FK escritas a mano por QC-20, QC-24, QC-32, QC-33 y QC-40; Prisma
--      no las conoce (los `*_id` son escalares sin `@relation` a proposito) y por eso queria
--      eliminarlas. Esta migracion NO las toca, como tampoco toca sus CHECK ni su RLS.
--   6. Se borro tambien el `DROP CONSTRAINT "users_role_id_fkey"` y el
--      `DROP INDEX "users_role_id_idx"` que Prisma emitio por separado: los dos cuelgan de la
--      columna `role_id` y Postgres se los lleva CON ella en el `DROP COLUMN` de abajo. El
--      `down.sql` si los recrea a mano, porque NO vuelven solos con el `ADD COLUMN` (misma
--      trampa que QC-52 documento con los CHECK de `products`).
--
-- LO QUE ESTA MIGRACION NO TOCA, Y ES EL RIESGO N.o 1 DE LA FICHA (R27): los tres indices
-- unicos FUNCIONALES y PARCIALES de `users` —`users_email_unique`, `users_username_unique` y
-- `users_document_unique`— siguen exactamente como los dejo QC-4. Si una migracion futura los
-- borra por drift, la unicidad del correo y del nombre de usuario desaparece, el esquema sigue
-- validando y el cliente sigue compilando: no se entera nadie. Lo vigila
-- `tests/unit/identity/schema/companies-migration.test.ts`.
--
-- Prisma ejecuta cada `migration.sql` dentro de UNA transaccion, asi que si cualquier paso
-- falla la migracion queda sin aplicar y sin marcar.

-- ---------------------------------------------------------------------------------------
-- 1. Extension: `gen_random_uuid()` para los PK uuid de las dos tablas nuevas.
-- ---------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable — la empresa (design.md > 2.1). `id` UUID aleatorio, ni correlativo ni derivado
-- del nombre (R1); `name` obligatorio, y esa obligatoriedad la impone la BASE (R2);
-- `name_normalized` obligatorio, lo calcula el dominio (R3); marcas de tiempo (R6); y
-- `deleted_at` anulable, que nace vacia y que NADIE escribe en esta ficha (R5). Todo TEXT, sin
-- `varchar(n)` (R21).
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (A MANO) — unicidad del nombre de empresa (R4). `lower(...)` es redundante sobre
-- una columna ya normalizada y se escribe igual, por simetria con `users_email_unique` y para
-- que la unicidad no dependa de que el llamante haya normalizado bien.
CREATE UNIQUE INDEX "companies_name_unique" ON "companies" (lower("name_normalized")) WHERE "deleted_at" IS NULL;

-- CreateTable — la pertenencia (design.md > 2.2): tres referencias OBLIGATORIAS —persona,
-- empresa y el rol que esa persona tiene EN ESA empresa (R7, R8)— y sus marcas de tiempo (R6).
-- SIN `deleted_at` (R12): esta ficha no construye ninguna revocacion, y una columna que ningun
-- codigo escribe es deuda.
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — la pareja persona + empresa es unica (R9). TOTAL, no parcial: `memberships` no
-- tiene borrado logico, asi que no hay filas muertas que liberen la pareja. Nada impide que la
-- misma persona pertenezca a VARIAS empresas con un rol distinto en cada una (R8).
CREATE UNIQUE INDEX "memberships_user_id_company_id_key" ON "memberships"("user_id", "company_id");

-- AddForeignKey — las tres referencias existen de verdad (R10) y ninguna se puede borrar
-- mientras haya una pertenencia que la use (R11). RESTRICT y NUNCA CASCADE: borrar un rol o
-- una empresa no debe llevarse por delante pertenencias en silencio.
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex — Postgres no indexa automaticamente el lado hijo de una FK, y por ahi pasa la
-- verificacion del RESTRICT en cada intento de borrar una empresa o un rol. NO se crea
-- `memberships_user_id_idx`: el unico compuesto de arriba ya tiene `user_id` como columna
-- lider y sirve para las busquedas por usuario, que son las del login.
CREATE INDEX "memberships_company_id_idx" ON "memberships"("company_id");

-- CreateIndex
CREATE INDEX "memberships_role_id_idx" ON "memberships"("role_id");

-- ---------------------------------------------------------------------------------------
-- BACKFILL (design.md > 4.2, R24). El rol se muda de `users.role_id` a la pertenencia SIN
-- perder el de nadie.
--
-- `memberships.company_id` es NOT NULL, asi que para meter a los usuarios ya cargados hace
-- falta una empresa y hay que crearla aqui. Si NO hay ningun usuario, no se crea ninguna
-- empresa: la deja el seed (R18), y por eso el bloque empieza contando.
--
-- Los usuarios DADOS DE BAJA tambien entran, a proposito: un `WHERE deleted_at IS NULL` los
-- dejaria sin pertenencia y entonces el `down.sql` no podria devolverles su `role_id` —que es
-- NOT NULL— y R25 seria imposible de cumplir. La pertenencia no autoriza por si sola y el
-- login ya filtra por `deleted_at IS NULL`.
--
-- EL SITIO NO ES COSMETICO. Va ANTES de los cuatro `ALTER ... ROW LEVEL SECURITY` del final:
-- `FORCE ROW LEVEL SECURITY` sin policies deniega TAMBIEN al dueno de la tabla, que es con
-- quien se conecta Prisma, asi que estos INSERT colocados despues del FORCE no insertarian
-- nada y nadie se enteraria (leccion que QC-32 dejo escrita en su design.md > 6.1). Y va ANTES
-- del `DROP COLUMN "role_id"`, porque lo lee. Lo vigila
-- `tests/unit/identity/schema/companies-migration.test.ts`.
--
-- `updated_at` va EXPLICITO en los dos INSERT: es NOT NULL SIN default porque su valor lo pone
-- `@updatedAt` del cliente Prisma en tiempo de ejecucion, no la base, asi que un INSERT crudo
-- sin el falla. Misma nota que QC-4 y QC-32.
--
-- `name` y `name_normalized` van LITERALES, y es el punto fragil de la ficha: no hay forma de
-- llamar a `INITIAL_COMPANY_NAME` ni a `normalizeCompanyName` (TypeScript,
-- `lib/modules/identity/domain/`) desde una migracion. Es un duplicado que se puede
-- desincronizar EN SILENCIO; lo unico que se da cuenta es el test de esquema, que importa la
-- constante y la funcion REALES y las compara con los literales extraidos de este INSERT (R20).
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

  INSERT INTO "memberships" ("user_id", "company_id", "role_id", "updated_at")
  SELECT u."id", empresa, u."role_id", CURRENT_TIMESTAMP FROM "users" u;
END $$;

-- ---------------------------------------------------------------------------------------
-- Y AL FINAL se quita lo viejo: el rol deja de vivir en la ficha de la persona (R14). Llegar
-- hasta aqui significa que el backfill ya puso a salvo el rol de cada usuario en su
-- pertenencia. Postgres se lleva con la columna su FK `users_role_id_fkey` y su indice
-- `users_role_id_idx`; el `down.sql` los recrea A MANO, porque no vuelven solos.
-- ---------------------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "users" DROP COLUMN "role_id";

-- RLS (A MANO) activado Y forzado en las DOS tablas nuevas (R23). Sin `FORCE`, el dueno de las
-- tablas —que es con quien se conecta Prisma— la ignora entera. Se activa sin policies:
-- deny-by-default para cualquier via que no sea Prisma. Es defensa en profundidad, no la
-- frontera de autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`), que vive
-- en el service.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
