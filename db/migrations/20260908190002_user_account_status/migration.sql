-- QC-65: el estado de cuenta del usuario y el rastro de su ultimo cambio. Ver
-- `specs/QC-65-estado-de-cuenta-de-usuario/design.md` seccion 3.1.
--
-- Migracion ADITIVA (R17): anade UN tipo y TRES columnas a `users` y nada mas. No toca
-- `deleted_at`, ni las columnas del bloqueo por intentos fallidos de QC-19
-- (`failed_login_attempts`, `lock_level`, `locked_until`), ni los tres indices unicos
-- funcionales y parciales de QC-4/QC-47, ni el RLS —`users` la tiene activada Y forzada desde
-- QC-4 y anadir columnas no lo altera—, ni ninguna otra tabla (R15, R16, R18).
--
-- De Prisma salen: el `CREATE TYPE`, el `ADD COLUMN` de las tres columnas y el
-- `CREATE INDEX` del final.
--
-- COMPLETADO A MANO (design.md > 3.1):
--   1. EL BACKFILL del paso 3: `UPDATE "users" SET "account_status" = 'active'` SIN `WHERE`.
--      El `ADD COLUMN` de arriba rellena las filas que ya existen con el DEFAULT, que es
--      `pending` —el valor de las cuentas NUEVAS (R5)—, y las que ya estaban tienen que
--      quedar `active` (R6, decision cerrada 4): sin este UPDATE, el usuario inicial del seed
--      de QC-6 quedaria fuera del sistema en cuanto QC-78 corte el login por estado. Va sin
--      `WHERE` A PROPOSITO: TAMBIEN las filas dadas de baja logicamente (`deleted_at` no
--      nulo), que son usuarios como los demas y a las que el estado no dice nada (R16).
--      `account_status_changed_by` se queda NULL: la migracion es «el sistema», no una
--      persona (R10).
--   2. LA FK `users_account_status_changed_by_fkey` del paso 4. Prisma NO la genera: el campo
--      es un ESCALAR uuid sin `@relation`, y es deliberado (`design.md > 1.3`). Queda como
--      DRIFT: toda migracion futura de `users` hay que revisarla a mano para que no emita su
--      `DROP CONSTRAINT`, igual que ya pasa con los tres indices unicos funcionales.
--   3. Se BORRARON a mano los diecinueve `DROP CONSTRAINT` y los nueve `DROP INDEX` que
--      `prisma migrate dev --create-only` emitio por DRIFT sobre `orders`, `products`,
--      `recipe_lines`, `recipes`, `supplier_catalog_lines`, `suppliers`, `units` y
--      `presentations`: son las FK y los indices escritos a mano por QC-20, QC-24, QC-32,
--      QC-33, QC-40 y QC-45, que Prisma no conoce y por eso queria eliminar. Esta migracion
--      no toca ninguna de esas tablas, y eso lo vigila
--      `tests/unit/identity/schema/account-status-migration.test.ts`.
--
-- SOBRE EL BACKFILL Y `FORCE ROW LEVEL SECURITY` (design.md > 3.1, ultimo parrafo; T3): la
-- pregunta ya esta respondida y MEDIDA en
-- `progress/impl_QC-47-modelo-empresa-y-membresias.md > La comprobacion de RLS (T5)`. El rol
-- de `DIRECT_URL` en local es `postgres`, superusuario CON `BYPASSRLS`, asi que el `UPDATE`
-- pasa; QC-47 escribio su backfill tal cual, sin envolverlo en `NO FORCE`/`FORCE`, y aqui se
-- aplica LA MISMA decision. No se inventa una salida nueva.
--
-- Los cuatro valores del `CREATE TYPE` son un DUPLICADO de `USER_ACCOUNT_STATUSES`
-- (`lib/modules/identity/domain/account-status.ts`), que es la unica definicion del conjunto
-- (R3): el SQL no puede importar TypeScript. Que las dos copias no diverjan lo vigila el test
-- estatico de la migracion, que importa la constante REAL y la compara con los literales
-- extraidos de aqui.
--
-- Prisma ejecuta cada `migration.sql` dentro de UNA transaccion: si cualquier paso falla, la
-- migracion queda sin aplicar y sin marcar.

-- ---------------------------------------------------------------------------------------
-- 1. CreateEnum — el conjunto CERRADO de cuatro valores, en ingles y en minuscula (R1, R4).
-- Es la garantia de R2: escribir un valor fuera del conjunto lo rechaza la BASE con 22P02,
-- no una comprobacion previa en codigo.
-- ---------------------------------------------------------------------------------------
CREATE TYPE "UserAccountStatus" AS ENUM ('active', 'pending', 'inactive', 'blocked');

-- ---------------------------------------------------------------------------------------
-- 2. AlterTable — las tres columnas. `account_status` NOT NULL con DEFAULT 'pending' (R1,
-- R5); `account_status_changed_at` NOT NULL con DEFAULT CURRENT_TIMESTAMP, que es lo que la
-- rellena sola en el alta y en esta misma migracion (R8, R9); y `account_status_changed_by`
-- ANULABLE, porque NULL significa «lo cambio el sistema» (R10).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN     "account_status" "UserAccountStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "account_status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "account_status_changed_by" UUID;

-- ---------------------------------------------------------------------------------------
-- 3. BACKFILL (A MANO, R6). Todas las filas que YA existian quedan `active`, incluidas las
-- dadas de baja: SIN `WHERE`. Va DESPUES del `ADD COLUMN` porque la columna tiene que
-- existir, y el `DEFAULT 'pending'` se queda puesto porque es el valor de las filas NUEVAS
-- (R5): las dos cosas conviven sin contradecirse, el UPDATE solo alcanza a lo que ya estaba.
-- ---------------------------------------------------------------------------------------
UPDATE "users" SET "account_status" = 'active';

-- ---------------------------------------------------------------------------------------
-- 4. AddForeignKey (A MANO, R11, R12). El autor del ultimo cambio existe de verdad —un uuid
-- inventado se rechaza con 23503— y no se puede BORRAR FISICAMENTE a alguien que figure como
-- autor de algun cambio. RESTRICT y NUNCA CASCADE ni SET NULL: perder el rastro en silencio
-- al borrar seria peor que no tenerlo. Auto-referencia sobre la propia `users`.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_account_status_changed_by_fkey" FOREIGN KEY ("account_status_changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 5. CreateIndex — Postgres no indexa solo el lado hijo de una FK, y por ahi pasa la
-- verificacion del RESTRICT en cada intento de borrado fisico de un usuario. NO hay indice
-- sobre `account_status`: nadie consulta por el todavia (R19), y lo anadira quien estrene la
-- consulta (QC-67).
-- ---------------------------------------------------------------------------------------
CREATE INDEX "users_account_status_changed_by_idx" ON "users"("account_status_changed_by");
