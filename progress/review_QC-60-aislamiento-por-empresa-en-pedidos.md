# QC-60 — aislamiento-por-empresa-en-pedidos · review (F2.2)

> Revisado sobre HEAD `efd32bf`, diff `origin/dev...HEAD` (68 archivos). Reviewer: 2026-09-16.
> Contra `specs/QC-60-…/{requirements,design,tasks}.md`, `docs/architecture.md`,
> `docs/conventions.md` (+ regla *Comentarios (2026-09-15)* tal como la fija el leader),
> `docs/verification.md`, `CHECKPOINTS.md` y `progress/impl_QC-60-….md`.

## Veredicto: **RECHAZADO**

1 bloqueante (B1, regla de *Comentarios*) y 8 menores. Lo funcional está bien: la migración, el
filtro único, el correlativo, el catálogo y el E2E se verificaron y detectan los fallos. El rechazo
es solo por los comentarios.

## Lo que corrí yo

- **Tests de la feature y de las fichas adaptadas** (`tests/integration/pedidos`,
  `tests/integration/asignaciones`, `identity/work-group-assignments`, `tests/unit/pedidos`,
  `tests/unit/asignaciones`, la guardia de ámbito y las 4 listas cerradas):
  `Test Files 84 passed (84) · Tests 1221 passed | 5 skipped`. Ningún skip está en archivos de la feature.
- **Mutaciones**, deshechas con `git checkout` y con el árbol limpio después:
  - quitar el ámbito del `where` de `softDeleteAliveOrder` → 4 rojos (guardia R18 ×2, integración R21 ×2);
  - quitar `company_id` del subselect `max()+1` de `createOrder` → 6 rojos (guardia, R12 ×2, R13, R24, R23);
  - quitar el ámbito de `findAliveOrderTargetById` → 5 rojos (guardia ×2, R27 catálogo, los dos casos adaptados de QC-87);
  - **E2E** con `findAliveById`/`update`/`cancel`/`softDelete` sin ámbito, en Chromium → **rojo**:
    `delete-order-error` no aparece porque el borrado cruzado pasó. La petición con el id de B sí
    llegó al servidor (`waitForRequest` sobre el `postData`). Con el servicio correcto, el test pasa.
- No corrí `./init.sh`: el gate completo antes del PR es del leader (`--rapido` verde según él).

## Checklist

### Especificación y tasks
- [x] `requirements.md` en EARS, R1–R35. La enmienda de R22 está fechada (decisión humana, no es hallazgo).
- [x] `design.md` con alternativas descartadas (§10) y la enmienda de §3.3 fechada.
- [ ] `tasks.md`: T0–T18 `[x]`. **T19 (gate completo) sigue `[ ]`** y es del leader. No bloquea la revisión, pero sí el cierre.

### Trazabilidad `R<n> → test` (comprobada uno a uno en los archivos)
- [x] R1, R2, R3, R5, R6, R7, R11, R13, R25, R26 — `tests/integration/pedidos/company-scope.int.test.ts` (+ texto en `orders-company-scope-migration.test.ts`).
- [x] R4 — `orders-company-scope-migration.test.ts` + `guard-rls-force`.
- [x] R8, R9, R10, R32, R33 — `orders-company-scope-migration.test.ts`.
- [x] R12, R13 (el 78), R19, R21, R22, R23, R24, R27, R29, R30 — `company-scope-queries.int.test.ts`.
- [x] R14 — `order-sequence-race.int.test.ts`.
- [x] R15 — `order-duplicate-number.int.test.ts` (23505 real; el leader lo vio rojo sin el arreglo) + `order-prisma-errors.test.ts`.
- [x] R16, R20, R21, R22, R27, R28 — `company-isolation-service.test.ts`.
- [x] R17, R34 — `order-actions.test.ts`; R28 también en `authorization.test.ts`.
- [x] R18 — `guard-ambito-empresa-pedidos.test.ts` (detecta el fallo, ver mutaciones) + `company-scope.test.ts`.
- [x] R31 — `e2e/aislamiento-pedidos.spec.ts` (detecta el fallo, ver mutaciones).
- [x] R35 — `package.json` y el lockfile no están en el diff; `guard-dependencias-aprobadas`.
- [x] El mapa está en la bitácora: 35/35.

### Migración y reversión (leídas como SQL)
- [x] UP, en este orden: columna anulable → backfill por `name_normalized = 'quimicloud'` (con el fallback «una sola empresa», declarado en `design.md` §7.1) y `ROW_COUNT` contra el total → `SET NOT NULL` → FK `RESTRICT` → guardia de duplicados → `DROP INDEX` del único global → único `(company_id, order_year, order_sequence)` → clave candidata `(id, company_id)` → FK compuesta.
- [x] **No renumera**: ningún `UPDATE` sobre `order_year`/`order_sequence` y ningún `INSERT`/`DELETE`. Que el siguiente sea el 78 está probado en integración.
- [x] **No borra `orders_sequence_2026`**: el UP no tiene `DROP SEQUENCE`, solo `DROP FUNCTION next_order_sequence(integer)`.
- [x] **Un único `DROP CONSTRAINT`** en el UP (`order_assignments_order_id_fkey`). Ninguno de los dos archivos nombra las FK compuestas a `users`/`work_groups` ni el `CHECK order_assignments_work_group_name_matches_group`. **Cero `MATCH FULL`**. El modelo `OrderAssignment` no tiene hoy bloques `OJO` que este diff haya podido perder: el aviso de drift vive en su `///`, que se amplió.
- [x] El paréntesis `NO FORCE` está bien cerrado en los dos archivos (`companies` en el UP, las tres tablas en el DOWN) y dentro de la transacción. La RLS termina en `ENABLE`+`FORCE`; `order_assignments` vuelve a `FORCE`, que es lo que tenía (`20260911120000_order_assignments`).
- [x] DOWN: las tres guardias van **antes** de cualquier DDL, en un solo `DO` que aborta entero. La función se recrea **idéntica byte a byte** a la de `20260904135210_order_cancellation` (diff vacío). La FK compuesta cae antes que la clave candidata. Se recrea el único global. Hay `setval` al máximo por año, creando la secuencia si falta (R7). No borra ninguna fila.

### Filtro por empresa en un único punto
- [x] `company-scope.ts` define la condición una sola vez. `order-prisma.ts` la usa en `findAliveOrderById`, en `buildOrderWhere` (el mismo `where` para `findMany` y `count`), en los tres `updateMany` y en el alta en SQL crudo (en la columna y en el subselect, parametrizada con `::uuid`). `order-catalog-prisma.ts` también la usa.
- [x] `list-query-sql.ts` de `pedidos` no consulta la base: solo construye condiciones, que acaban dentro del `AND` junto al ámbito.
- [x] No hay ningún otro `prisma.order` en `lib/` ni en `app/` fuera de los dos adaptadores.

### `OrderCatalog.findAliveById` (R27) y `asignaciones`
- [x] Los 4 archivos de `asignaciones` cambian **una línea** cada uno: solo añaden `actor.companyId`/`companyId` como argumento. El único cambio observable es el que exige R27 (pedido ajeno → `order_not_found`).
- [x] `lib/composition/index.ts` no necesita cambios (la aridad encaja).

### Tests de otras fichas adaptados y listas cerradas
- [x] Los dos casos de QC-87 se reescribieron a `order_not_found` con la fila intacta. Lo que dejan de detectar (`companyId` en el `where` de `listByOrderInCompany`/`deleteOne`/`deleteByWorkGroup`) lo siguen cubriendo `order-assignment-prisma.int.test.ts:360, :393, :457`.
- [x] Centinela `tests/unit/pedidos/scope.test.ts`: pasa de dos a tres specs **nombrados** y sigue cerrado.
- [x] `data-table-alcance` (de 12 a 13, nombrado), `guard-identificador-de-request` (E2E y migración nombrados), `recipe-route-contract` (`MIGRACION_QC60` con dos rutas exactas) e `inventario/scope.test.ts` (nueva lista cerrada que **exige** `companyId` en `Order` y lo sigue prohibiendo en el resto): todas **se tensaron** y ninguna se relajó.
- [x] `aislamiento.json`: las altas entran en `commit` con motivo; `order-sequence.int.test.ts` pasa de `transaccion` a `commit`, también con motivo.

### Calidad, seguridad y arquitectura
- [x] El permiso va primero en los seis casos de uso. La empresa sale de `getSessionContext()` en el servidor, nunca de la entrada.
- [x] `orders` tiene RLS `ENABLE`+`FORCE` sin policies, y el aislamiento no depende de la RLS.
- [x] Sin secretos, sin hardcode de entorno, sin dependencias nuevas y sin UI nueva (el punto multiplataforma no aplica).
- [x] El dominio no importa Prisma (`OrderScope` es un tipo puro) e `index.ts` exporta solo el tipo.
- [ ] **Regla de *Comentarios***: ver B1.

## Hallazgos

### B1 — BLOQUEANTE: los comentarios de producción citan fichas y requisitos, y los archivos tocados no se limpiaron
La regla *Comentarios (2026-09-15)* dice que nunca se cita una ficha ni un requisito en un
comentario de producción, sin excepciones, y que al tocar un archivo se limpia entero, en commits
`chore(<key>)` aparte. El leader la marca como parte del contrato de esta revisión, y es la misma
por la que se rechazó QC-81 (su B1). Este diff la incumple a gran escala:
- **Líneas nuevas**: unas 99 líneas de comentario añadidas citan `QC-<n>`, `R<n>`, `design.md` o
  «decisión cerrada». Las que más: `migration.sql` (58), `down.sql` (26), `order-prisma.ts` (20)
  y `company-scope.ts` (13). Además, el mismo bloque de 4 líneas `// QC-60 (R16): …` está pegado en
  los seis casos de uso, y también hay citas en `actor.ts`, `order-catalog.ts`, `order-scope.ts`,
  `index.ts`, `order-repository.ts`, `order-actions.ts`, `order-catalog-prisma.ts` y
  `db/schema.prisma` (3).
- **Longitud**: hay bloques muy por encima de las ~5 líneas (la cabecera de `migration.sql` tiene
  unas 50; `company-scope.ts` tiene 61 líneas de comentario para 15 de código; el docblock de
  `createOrder` ronda las 40).
- **Mensajes de `RAISE EXCEPTION`**: en los dos SQL empiezan por `QC-60` / `QC-60 down:` y terminan en `(R2)`/`(R6)`.
- **Archivos tocados sin limpiar**: los 22 archivos de producción del diff suman unas 500 líneas
  con citas (por ejemplo `order-prisma.ts` 71, `order-actions.ts` 38, `assign-responsibles.ts` 37).
  No hay ningún commit `chore(QC-60): limpia comentarios de …`.
- **Comentarios que ya dicen algo falso** (lo agrava la parte de la regla «si el motivo no está verificado, no se escribe»):
  - `db/migrations/20260915120000_orders_company_scope/migration.sql:234-236`: «El adaptador reconoce el `23505` por el NOMBRE del indice … la constante `ORDER_NUMBER_UNIQUE_INDEX` cambia con el». Desde la ronda 2 se reconoce por SQLSTATE, y la constante ya no existe.
  - `lib/modules/pedidos/adapters/driven/persistence/company-scope.ts:30`: «lo que el esquema no declara se rechaza por campo desconocido». Desde la enmienda de R22 se **descarta**.

**Qué falta para cumplirlo**: limpiar los comentarios de todos los archivos de `lib/` y `db/` del
diff, incluidos los 4 de `asignaciones`, en commits `chore(QC-60): limpia comentarios de <archivo>`
que solo toquen comentarios. Deben quedar solo porqués cortos y verificados. Hay que quitar también
`QC-60`/`R<n>` del texto de los `RAISE EXCEPTION`. Tocar los SQL cambia el checksum de una migración
que la base de desarrollo ya tiene aplicada: `migrate deploy` no lo bloquea, pero conviene dejarlo
dicho en la bitácora. En `tests/` y `e2e/` rige lo mismo para los comentarios (el `R<n>` en el
nombre del caso sí vale).

### Menores
- **m1** — `lib/modules/pedidos/domain/order-scope.ts:22` y el docblock de `index.ts` llaman a `OrderCatalog` «la excepción deliberada», mientras `company-scope.ts:38` y `order-catalog-prisma.ts` dicen «no hay ninguna excepción». Hablan de cosas distintas (el tipo `string` frente al ámbito), pero se leen como una contradicción. Se resuelve con B1.
- **m2** — `lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts:123` sigue diciendo que `isDuplicateOrderNumber` reconoce el duplicado «con el nombre de su indice». Está fuera del módulo y fuera del diff: anotarlo como deuda.
- **m3** — R6, guardia 3 (asignación cruzada al revertir): solo la cubre el test de **texto**. Las guardias 1 y 2 tienen test de integración y la 3 no. Con la FK compuesta no se puede fabricar ese dato sin soltar la FK, pero sí se puede soltar dentro de la transacción del test. Hoy ningún test la ve abortar.
- **m4** — R30 («quitar la RLS no cambia nada») se mide conectando como `postgres`, un superusuario que se salta la RLS siempre, así que el test no puede ponerse rojo en local. Lo reconoce la propia migración: es un límite declarado, no una prueba.
- **m5** — `docs/conventions.md` **no tiene** la sección *Comentarios* ni en este worktree ni en `origin/dev`: solo existe en `feature/opencode-arnes-en-dos-herramientas`. B1 se aplica por instrucción del leader y por el precedente de QC-81, pero hasta que la regla llegue a `dev` ningún documento de la rama la respalda (deuda del arnés, ya vista en QC-106).
- **m6** — `tasks.md > T19` sigue `[ ]` (gate completo, del leader). Hay que cerrarlo antes del PR.
- **m7** — `docs/architecture.md:34`: la viñeta editada deja una línea de ~110 columnas, más ancha que el resto del párrafo. Cosmético.
- **m8** — R27 cambia algo observable en `asignaciones`: desasignar desde otra empresa pasa de `order_assignment_not_found` a `order_not_found`. Es lo correcto y tiene test; conviene decirlo en el PR para quien consuma ese código desde la UI de QC-102.
