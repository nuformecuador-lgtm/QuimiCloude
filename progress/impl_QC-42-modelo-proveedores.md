# QC-42 -- modelo-proveedores - progreso de implementacion

## Archivos creados / modificados

Todo lo listado abajo estaba en el commit b60236f ("wip(QC-42): esquema, migracion y
armazon del modulo SIN auditar") o se anadio despues, auditado y verificado:

- db/schema.prisma -- modelos Supplier y SupplierCatalogLine anadidos al final,
  Product intacto (verificado en T1, git diff sin lineas dentro de model Product).
- db/migrations/20260903131417_suppliers_and_supplier_catalog_lines/migration.sql --
  UP completo: dos CREATE TABLE, las cuatro FK (una generada por Prisma, tres a mano),
  el indice unico parcial suppliers_name_unique, los cuatro CHECK, los cuatro ALTER
  de RLS.
- db/migrations/20260903131417_suppliers_and_supplier_catalog_lines/down.sql -- DOWN
  manual, dos DROP TABLE en orden inverso.
- lib/modules/proveedores/index.ts -- contrato publico, reexporta
  normalizeSupplierName.
- lib/modules/proveedores/domain/supplier-name.ts -- normalizeSupplierName.
- lib/modules/proveedores/ports/.gitkeep,
  lib/modules/proveedores/adapters/driven/.gitkeep,
  lib/modules/proveedores/adapters/driving/.gitkeep -- armazon vacio.
- tests/unit/proveedores/domain/supplier-name.test.ts -- normalizacion (T8).
- tests/unit/proveedores/schema/proveedores-schema.test.ts -- contrato estatico del
  esquema (T6, nuevo).
- tests/unit/proveedores/schema/proveedores-migration.test.ts -- contrato estatico del
  SQL, con tests de sensibilidad (T7, nuevo).
- tests/unit/proveedores/module-contract.test.ts -- forma del modulo y cruce por ORM
  contra Prisma.dmmf (T9, nuevo).
- tests/integration/proveedores/proveedores-constraints.int.test.ts -- 25 casos contra
  Postgres real (T11, nuevo).
- progress/impl_QC-42-modelo-proveedores.md -- este archivo.
- specs/QC-42-modelo-proveedores/tasks.md -- checkboxes T0-T12 marcadas [x].

No se toco: lib/composition/index.ts (T5, confirmado por diff vacio contra
origin/dev), lib/modules/inventario/index.ts, package.json, pnpm-lock.yaml (T12,
diff vacio contra origin/dev), ningun modelo del esquema fuera de los dos nuevos.

## Auditoria del commit b60236f

Se dejo sin auditar por un implementer anterior (red de seguridad, no verificacion).
Se comparo linea por linea contra specs/QC-42-modelo-proveedores/design.md antes de
tocar nada mas:

- db/schema.prisma: campos, tipos, las tres FK escalares sin @relation, comentarios
  "OJO" completos -- coincide con design.md seccion 2. Sin defectos.
- migration.sql: las tres FK a mano con RESTRICT, el CASCADE proveedor-linea, el
  indice unico PARCIAL suppliers_name_unique, los cuatro CHECK, los cuatro ALTER de
  RLS, orden del UP -- coincide con design.md seccion 4. Sin defectos.
- down.sql: exactamente dos DROP TABLE en orden inverso, no toca pgcrypto -- coincide
  con design.md seccion 4.7. Sin defectos.
- lib/modules/proveedores/: armazon completo -- coincide con design.md seccion 5.1.
  Sin defectos.
- tests/unit/proveedores/domain/supplier-name.test.ts: cubre R8 (acentos, mayusculas,
  signos, vacio, idempotencia, distincion). Sin defectos.

Ningun defecto encontrado. T0 verificado con pnpm exec prisma validate sin error de
variable de entorno. T5 confirmado por diff vacio.

## T10 -- ciclo real apply -> rollback -> apply

1. pnpm run db:migrate -> "Applying migration ..." -> "All migrations have been
   successfully applied."
2. Verificacion SQL directa contra pg_tables, pg_constraint, pg_indexes, pg_class:
   - Tablas suppliers y supplier_catalog_lines: existen.
   - Las cuatro FK en pg_constraint: supplier_catalog_lines_product_id_fkey hacia
     products (confdeltype=r), supplier_catalog_lines_supplier_id_fkey hacia
     suppliers (confdeltype=c), suppliers_created_by_fkey y suppliers_updated_by_fkey
     hacia users (confdeltype=r las dos).
   - Los cuatro CHECK (contype=c): supplier_catalog_lines_cost_non_negative,
     min_purchase_non_negative, delivery_time_non_negative, suppliers_contact_required
     con OR.
   - Indice unico parcial suppliers_name_unique: USING btree (name_normalized) WHERE
     (deleted_at IS NULL).
   - RLS: relrowsecurity=true y relforcerowsecurity=true en las dos tablas.
3. pnpm run db:rollback -> "20260903131417_suppliers_and_supplier_catalog_lines
   revertida."
4. Verificacion post-rollback: las dos tablas desaparecen; document_types,
   presentations, products, recipe_lines, recipes, roles, users siguen presentes;
   products conserva sus 9 constraints originales (incluida products_unit_id_fkey, ver
   nota de terreno compartido abajo) sin nada relacionado con proveedores;
   _prisma_migrations sin la fila de esta migracion.
5. pnpm run db:migrate (segunda aplicacion) -> mismo resultado exitoso.

Nota de terreno compartido (no bloqueante, confirma design.md seccion 10): la base
fisica de este worktree (Postgres compartido entre worktrees) ya trae
products.unit_id en vez de products.unit -- es la migracion de QC-32, aplicada por
otro worktree contra la misma instancia fisica, aunque QC-32 todavia no esta mergeada
en origin/dev (ver T13 abajo). QC-42 no toca products en ningun caso: la migracion de
esta feature no menciona esa columna, y el ciclo apply->rollback->apply salio limpio
con o sin esa columna presente.

## T11 -- tests de integracion contra Postgres real

tests/integration/proveedores/proveedores-constraints.int.test.ts -- 25 tests, cada
uno dentro de prisma.$transaction con ROLLBACK de aislamiento; toda operacion que se
espera que falle usa SAVEPOINT + $executeRaw, afirmando sobre el SQLSTATE (23502,
23503, 23505, 23514, y 42804 documentado para el caso de tipo de delivery_time), nunca
sobre el texto del error.

## T12 -- sin dependencia nueva

git diff origin/dev -- package.json pnpm-lock.yaml vacio.

## T13 -- sincronizar con dev

git fetch origin dev + git merge origin/dev -> "Already up to date": origin/dev es
ancestro directo de esta rama (git merge-base HEAD origin/dev == HEAD de origin/dev).
QC-32 todavia no esta mergeada en origin/dev -- solo existe en un branch/worktree
local de otra sesion, lo que explica el drift fisico anotado en T10. Sin conflicto de
merge, sin cambios en db/schema.prisma ni en db/migrations/, asi que no hace falta
repetir T10 (nada cambio que revalidar). El gate completo ./init.sh sin flags lo corre
el leader, segun AGENTS.md > Regla del gate y la cabecera de T13 en tasks.md ("La
corre el leader, no el implementer").

## Salida real de los tests (ultima corrida, tras T10-T12)

pnpm exec vitest run tests/unit/proveedores tests/integration/proveedores tests/guards
  Test Files  16 passed (16)
       Tests  193 passed (193)

## Mapa R<n> -> test

Abreviaturas: S = tests/unit/proveedores/schema/proveedores-schema.test.ts *
M = tests/unit/proveedores/schema/proveedores-migration.test.ts *
N = tests/unit/proveedores/domain/supplier-name.test.ts *
C = tests/unit/proveedores/module-contract.test.ts *
I = tests/integration/proveedores/proveedores-constraints.int.test.ts *
G1 = tests/guards/guard-rls-force.test.ts *
G2 = tests/guards/guard-arquitectura-modulos.test.ts *
G3 = tests/guards/guard-dependencias-aprobadas.test.ts *
T10 = ciclo real apply -> rollback -> apply, documentado arriba.

| R | Estatico / unitario / guardia | Base real |
| --- | --- | --- |
| R1 | S | I - crea y relee un proveedor completo |
| R2 | M | I - 23502 sin nombre |
| R3 | S | I - solo telefono / solo correo |
| R4 | M (CHECK con OR, sensible a AND) | I - los 5 casos (a-e), incluido UPDATE, 23514 |
| R5 | S, M (sin VARCHAR) | I - 500 caracteres en nombre y correo |
| R6 | M (sin indice/CHECK de formato) | I - telefono/correo compartidos, correo sin forma |
| R7 | M (indice unico, sensible) | I - 23505 contra proveedor vivo |
| R8 | N, S, C | -- (funcion pura) |
| R9 | M (parcial, sensible al WHERE) | I - libera el nombre tras la baja |
| R10 | S | I - linea con costo/minimo/plazo propios |
| R11 | M | I - 23505 segunda linea del mismo producto |
| R12 | -- | I - muchas lineas, mismo producto en dos proveedores |
| R13 | S, M | I - NULL, no cero |
| R14 | S, M (sensible a DOUBLE PRECISION) | I - 4 decimales exactos, numeric(14,4) |
| R15 | S | I - 2.5 sin redondear |
| R16 | S, M | I - 42804 en fraccionario, entero aceptado |
| R17 | M (sensible a > -1) | I - 23514 en los tres, cero aceptado |
| R18 | S | -- (ausencia de columna) |
| R19 | S, M | T10 - products identica tras el rollback |
| R20 | S, G2 | -- |
| R21 | C, G2 | -- |
| R22 | S, M (sensible a RESTRICT->CASCADE), C (Prisma.dmmf exacto) | I - 23503 con FK a mano |
| R23 | C, G2 | -- |
| R24 | S, M | I - autor/editor, sin autor, 23503 |
| R25 | S | -- |
| R26 | S | I - baja conserva la fila |
| R27 | S | I - timestamps en las dos tablas |
| R28 | S | I - DELETE fisico sin deleted_at |
| R29 | M (sensible a CASCADE->RESTRICT) | I - CASCADE fisico sin huerfanas |
| R30 | -- | I - baja logica deja lineas intactas |
| R31 | M | I - producto de baja conserva linea; DELETE fisico 23503 |
| R32 | S, M (vocabulario ingles, sensible) | -- |
| R33 | M, G1 | -- (RLS con Prisma sale verde igual; se cierra por SQL) |
| R34 | M | T10 - apply -> rollback -> apply |
| R35 | C | -- (sin flujo navegable) |
| R36 | G3, T12 | -- |

Los 36 requisitos tienen al menos un test ejecutado, no solo escrito.

## Preguntas abiertas -- estado

Ninguna de las 8 de requirements.md (5 del humano, 3 de spec_author) ni las 3 de
design.md seccion 11 se resolvio durante la implementacion: ninguna bloqueaba el
modelo y todas se dejaron en su posicion por defecto, tal como estaban escritas. Nada
que llevar a la tabla de decisiones.

## Tareas

T0-T12 cerradas [x]. T13 (fetch+merge sin conflicto, documentado arriba) hecha en su
parte de implementer; el ./init.sh completo lo corre el leader. T14 es este archivo.
