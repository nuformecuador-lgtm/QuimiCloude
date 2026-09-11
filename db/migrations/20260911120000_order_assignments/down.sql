-- DOWN de la migracion `order_assignments` (QC-86). Convencion propia del repo: Prisma Migrate no
-- genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ademas borra su fila de
-- `_prisma_migrations` en la MISMA transaccion.
--
-- Deja la base exactamente como estaba antes del UP (R34): sin la tabla `order_assignments` —y
-- por tanto sin su PK, sus dos indices, su CHECK, sus tres claves foraneas ni su RLS—, y con el
-- catalogo de permisos y sus asignaciones de rol en las TRECE entradas de QC-66, sin las dos de
-- `asignaciones` y sin sus tres asignaciones de rol.
--
-- Orden inverso y estricto (design.md > 5.3):
--   1. Las asignaciones de rol PRIMERO: `role_permissions_permission_code_fkey` es RESTRICT, asi
--      que borrar antes la entrada del catalogo fallaria con `23503`.
--   2. Las dos entradas del catalogo.
--   3. El `DROP TABLE`.
--
-- Los dos `DELETE` van acotados POR CODIGO, y el primero borra las asignaciones de CUALQUIER rol,
-- no solo las tres que puso el UP: el `RESTRICT` no deja otra salida y dejar la entrada huerfana
-- no es el estado anterior. Ninguna otra fila se pierde. Criterio literal del `down.sql` de
-- QC-66.
--
-- SOBRE R35: este `down.sql` si borra filas de dos tablas preexistentes (`permissions`,
-- `role_permissions`), y es CORRECTO: son exactamente las que el UP escribio, acotadas por
-- codigo, y no borrarlas dejaria el catalogo con dos entradas que ningun codigo declara. Lo que
-- NO hace es tocar ninguna otra fila, ni inventar ningun dato, ni recrear nada que pudiera
-- chocar. Ninguna de las cinco tablas preexistentes que el UP referencia —la de pedidos, la de
-- personas, la de grupos de trabajo, la de empresas y la de perfiles— aparece en una sola linea
-- de este archivo, y `pgcrypto` tampoco. Sus unicas cuatro sentencias son los dos `DELETE`
-- acotados y el `DROP TABLE`: no hay aqui ninguna modificacion de filas existentes, ninguna alta
-- y ningun cambio de esquema sobre una tabla que no sea la que el UP creo.
--
-- LO QUE LA REVERSION SI SE LLEVA, y es inevitable: las asignaciones que se hayan creado despues
-- de aplicar el UP. Es el comportamiento normal de revertir un `CREATE TABLE`, igual que en QC-74
-- y QC-83.

DELETE FROM "role_permissions"
WHERE "permission_code" IN ('asignaciones.consultar', 'asignaciones.modificar');

DELETE FROM "permissions"
WHERE "code" IN ('asignaciones.consultar', 'asignaciones.modificar');

-- SIN `CASCADE`, a proposito: si algun objeto futuro dependiera de esta tabla, el fallo debe ser
-- RUIDOSO y abortar la reversion entera, no arrastrarlo en silencio (R35, mismo criterio que
-- QC-74 y QC-83). Se lleva consigo la PK, los dos indices, el CHECK, las tres claves foraneas y
-- la RLS.
DROP TABLE "order_assignments";
