-- DOWN de la migracion `work_groups_and_members` (QC-83). Convencion propia del repo: Prisma
-- Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ademas borra su fila de
-- `_prisma_migrations` en la MISMA transaccion.
--
-- Revierte exactamente el `migration.sql` y deja el esquema anterior (R25): no queda tabla,
-- columna, indice, clave foranea, restriccion unica ni RLS residual de los grupos ni de la
-- pertenencia, y `users` vuelve a tener la definicion LITERAL que tenia antes de la ficha. Ver
-- `specs/QC-83-modelo-de-grupos-de-trabajo/design.md` seccion 3.3.
--
-- Tres cosas que no son evidentes:
--   1. EL ORDEN IMPORTA. `work_group_members` cae PRIMERO: sus dos FK compuestas apuntan a
--      `work_groups` y a `users`, y un `DROP TABLE "work_groups"` con la hija todavia en pie
--      falla por dependencia. No se usa `CASCADE` en ningun `DROP TABLE`, a proposito — el
--      fallo debe ser ruidoso, no silencioso (mismo criterio que el `down.sql` de QC-74).
--   2. Ni los indices, ni las claves foraneas, ni los `ENABLE`/`FORCE ROW LEVEL SECURITY` de
--      las dos tablas nuevas se revierten uno a uno: caen con su tabla en los dos `DROP TABLE`.
--      Eso incluye `work_groups_name_unique`, `work_groups_id_company_id_key`,
--      `work_groups_company_id_idx`, `work_groups_company_id_fkey`,
--      `work_group_members_user_id_idx` y las dos FK compuestas.
--   3. `companies` NO se toca en ninguna linea, y `pgcrypto` TAMPOCO: el UP no la crea en
--      exclusiva y medio repo depende de ella. `users` se toca en UNA sola linea, la del paso 3.
--
-- SOBRE R26. Este `down.sql` no puede perder ni inventar un dato de una tabla preexistente: no
-- contiene ningun `INSERT`, ningun `UPDATE` ni ningun `DELETE`, no borra ninguna fila de `users`
-- ni de `companies`, y lo unico que elimina son las dos tablas que el propio UP creo —con los
-- grupos y pertenencias que se hayan dado de alta despues, que es el comportamiento normal e
-- inevitable de revertir un `CREATE TABLE`, igual que en QC-74—. Tampoco hay ninguna guardia
-- previa que escribir, a diferencia de QC-47 R26: alli el DOWN tenia que RECREAR un indice
-- global que podia chocar; aqui solo suelta uno trivial.

-- 1. La hija, con su PK, su indice `work_group_members_user_id_idx`, sus DOS FK compuestas y su
-- RLS. Va primero: con ella en pie, el paso 2 falla por dependencia.
DROP TABLE "work_group_members";

-- 2. El grupo, con su PK, sus tres indices —incluido el unico parcial del nombre—, su FK a
-- `companies` y su RLS. `companies` no se modifica: solo deja de tener una hija.
DROP TABLE "work_groups";

-- 3. La UNICA linea que toca una tabla preexistente: el indice unico trivial que el UP anadio a
-- `users` para que la FK compuesta tuviera a donde apuntar. Al soltarlo, `users` queda con la
-- definicion literal que tenia antes de esta feature (R25). Ni una columna, ni otro indice, ni
-- otra restriccion, ni su RLS se tocan.
DROP INDEX "users_id_company_id_key";
