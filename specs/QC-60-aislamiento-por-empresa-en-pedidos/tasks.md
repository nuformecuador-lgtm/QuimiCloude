# QC-60 — aislamiento-por-empresa-en-pedidos · tasks.md

> Checklist del implementer. Cada task dice **qué archivos toca**, de **qué depende** y cuál es su
> criterio de **hecho**. `[P]` = paralelizable con las otras `[P]` de su bloque.
> El mapa `R<n> -> test` completo está en `§ Trazabilidad`, al final, y se copia a
> `progress/impl_QC-60-aislamiento-por-empresa-en-pedidos.md` (`CHECKPOINTS.md > Trazabilidad`).

## Bloque 0 — Base de datos

- [x] **T0 — Migración: columna, FK, índices y unicidad por empresa.**
  Archivos: `db/migrations/<ts>_orders_company_scope/migration.sql` (nuevo),
  `db/schema.prisma` (`model Order`).
  Contenido: paréntesis `NO FORCE` / `FORCE` de RLS (pasos 0 y 8 de `design.md > 7.1`);
  `company_id` anulable → backfill (T1, mismo archivo) → `SET NOT NULL` → FK a `companies`
  (`ON DELETE RESTRICT ON UPDATE CASCADE`) → guardia de duplicados → `DROP INDEX
  orders_order_year_order_sequence_key` + `CREATE UNIQUE INDEX orders_company_year_sequence_key`.
  En el esquema: escalar **sin `@relation`**, `@@unique([companyId, orderYear, orderSequence], map:
  "orders_company_year_sequence_key")` sustituyendo al `@@unique([orderYear, orderSequence])`, y
  ampliación del comentario `///` con el drift de la FK nueva.
  Depende de: —.
  Hecho cuando: `pnpm run db:migrate` aplica sin error, `prisma generate` produce `companyId` y
  `pnpm run typecheck` señala exactamente los sitios que T5–T9 van a tocar.
  Cubre: R1, R4, R8, R9, R10, R11.

- [x] **T1 — Backfill de los tres pedidos a «QuimiCloud», sin renumerar.**
  Archivos: el mismo `migration.sql` de T0 (paso 2).
  Contenido: resolución por `name_normalized = 'quimicloud'` con el único fallback de «hay
  exactamente una empresa»; `RAISE EXCEPTION` en cualquier otro caso; `ROW_COUNT` contra el total de
  la tabla; **ningún `INSERT`, ningún `DELETE`**; **ningún `UPDATE` sobre `order_year` ni
  `order_sequence`**.
  Depende de: T0 (mismo archivo, orden dentro de él).
  Hecho cuando: tras aplicar, los 3 pedidos tienen la empresa de «QuimiCloud» y conservan 37, 44 y
  77 de 2026; `companies` sigue con 48 filas y `order_assignments` con 0.
  Cubre: R2, R3, R13.

- [x] **T2 — Clave candidata y FK compuesta de `order_assignments`.**
  Archivos: el mismo `migration.sql` (paso 6), `db/schema.prisma` (`model Order`:
  `@@unique([id, companyId], map: "orders_id_company_id_key")`).
  Contenido: `orders_id_company_id_key` **antes** que la FK; `DROP CONSTRAINT
  order_assignments_order_id_fkey`; `ADD CONSTRAINT order_assignments_order_id_company_id_fkey
  FOREIGN KEY (order_id, company_id) REFERENCES orders(id, company_id) ON DELETE RESTRICT ON UPDATE
  CASCADE`. **Sin `@relation` en el esquema. Sin `MATCH FULL`. Ningún otro `DROP CONSTRAINT` en el
  archivo**: si `prisma migrate dev` genera alguno sobre las FK compuestas a `identity` o sobre el
  `CHECK` del nombre de grupo, se borra a mano (`design.md > 2.3`, `OJO 1`).
  Depende de: T0.
  Hecho cuando: insertar una asignación cuya empresa no es la del pedido falla con `23503` desde
  `psql`, y el `migration.sql` no contiene ningún `DROP CONSTRAINT` salvo el de la FK simple.
  Cubre: R25, R26.

- [x] **T3 — Muerte de `next_order_sequence(integer)`.**
  Archivos: el mismo `migration.sql` (paso 7).
  Contenido: `DROP FUNCTION "next_order_sequence"(integer)`. **No se borra ninguna secuencia
  `orders_sequence_<año>`** (`design.md > 3.2`, riesgo 2).
  Depende de: T0.
  Hecho cuando: la función no existe en `pg_proc` y `orders_sequence_2026` sigue existiendo con su
  `last_value`.
  Cubre: R5 (su mitad del UP).

- [x] **T4 — `down.sql` con las tres guardias y el `setval`.**
  Archivos: `db/migrations/<ts>_orders_company_scope/down.sql` (nuevo).
  Contenido, en este orden: paréntesis `NO FORCE` de RLS → **guardia 1** (dos empresas comparten
  `(año, secuencia)` → `RAISE EXCEPTION` con el recuento y qué hacer) → **guardia 2** (fila con
  empresa distinta de la del UP) → **guardia 3** (asignación cuya empresa no es la de su pedido) →
  recrear `next_order_sequence(integer)` idéntica → FK compuesta fuera y FK simple restaurada →
  `orders_id_company_id_key` fuera → único por empresa fuera y **único global restaurado** →
  `setval('orders_sequence_<año>', max(order_sequence))` por cada año presente → FK a `companies` y
  columna fuera → `ENABLE` + `FORCE`.
  Depende de: T0, T1, T2, T3.
  Hecho cuando: `pnpm run db:rollback` deja el esquema idéntico al anterior (verificado contra
  `information_schema` en el test de integración), no borra ninguna fila, deja
  `_prisma_migrations` coherente; y con dos empresas compartiendo correlativo **aborta entero**.
  Cubre: R5, R6, R7.

## Bloque 1 — Dominio y puertos

- [x] **T5 — `OrderScope` y el actor con empresa.** `[P]` con T0
  Archivos: `lib/modules/pedidos/domain/order-scope.ts` (nuevo),
  `lib/modules/pedidos/domain/actor.ts`, `lib/modules/pedidos/index.ts` (reexportar el tipo).
  Depende de: —.
  Hecho cuando: el barrel exporta `OrderScope`, `actor.ts` declara `companyId`, y el barrel sigue
  siendo importable desde un componente de cliente (`guard-arquitectura-modulos` y
  `module-contract.test.ts` en verde).
  Cubre: R16 (parte), R18 (parte).

- [x] **T6 — El puerto y el catálogo exigen el ámbito.**
  Archivos: `lib/modules/pedidos/ports/order-repository.ts`,
  `lib/modules/pedidos/domain/order-catalog.ts`.
  Contenido: `scope: OrderScope` **al final** de los seis métodos de `OrderRepository`;
  `findAliveById(id: string, companyId: string)` en `OrderCatalog` (`design.md > 6`); docblocks que
  expliquen por qué está en la firma y no dentro del adaptador, y por qué el catálogo recibe una
  cadena y no el `OrderScope`.
  Depende de: T5.
  Hecho cuando: `pnpm typecheck` falla en el adaptador, en los seis casos de uso y en los cuatro
  llamantes de `asignaciones` —eso es la prueba de que el olvido en la **llamada** no compila— y
  queda verde al terminar T7–T10.
  Cubre: R18.

- [x] **T7 — Los seis casos de uso pasan el ámbito.**
  Archivos: `lib/modules/pedidos/domain/{create,get,list,update,cancel,delete}-order.ts`.
  Contenido: tras `requirePermission` (que sigue siendo la primera línea), construir
  `{ companyId: actor.companyId }` y pasarlo al puerto. Ninguna condición SQL aquí. Ningún cambio en
  el orden permiso → zod → puerto.
  Depende de: T6.
  Hecho cuando: los seis compilan, y ningún caso de uso menciona `company` dentro de un `where`.
  Cubre: R16, R20, R21, R22, R24 (parte), R28.

## Bloque 2 — Persistencia

- [x] **T8 — El único punto de consulta.**
  Archivos: `lib/modules/pedidos/adapters/driven/persistence/company-scope.ts` (nuevo).
  Contenido: `companyScope` privada + `orderCompanyScope` (`Prisma.OrderWhereInput`) y
  `companyScopeColumns`; docblock con las reglas de uso de `design.md > 5`, incluida la del SQL crudo
  del alta, y la nota de que **no hay ninguna excepción** (a diferencia de QC-49 R29).
  Depende de: T5.
  Hecho cuando: existe y su test afirma que las dos envolturas devuelven el mismo objeto.
  Cubre: R18.

- [x] **T9 — Adaptador driven acotado, y el correlativo por empresa.**
  Archivos: `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`,
  `.../order-catalog-prisma.ts`.
  Contenido: (a) el ámbito compuesto en `buildOrderWhere` —al lado de `deletedAt: null` y **antes**
  de los filtros, nunca fundido con ellos— y en el `where` de `findAliveOrderById`,
  `updateAliveOrder`, `cancelAliveOrder`, `softDeleteAliveOrder` y `findAliveOrderTargetById`; el
  `count` sigue usando **el mismo objeto** `where` que el `findMany`. (b) `createOrder` pasa a ir
  dentro de `prisma.$transaction`, con `pg_advisory_xact_lock(<ns>, hashtext('orders_sequence:' ||
  companyId || ':' || year))` como **sentencia anterior** y el `COALESCE(max(order_sequence),0)+1`
  **dentro** del `INSERT`, con `company_id` escrito desde `companyScopeColumns` y parametrizado con
  `::uuid` (jamás interpolado). (c) `ORDER_NUMBER_UNIQUE_INDEX` pasa a
  `'orders_company_year_sequence_key'`. (d) reintento de la transacción entera hasta **3** intentos
  ante ese `23505`, **fuera** de `$transaction`; agotados, `'duplicate_number'`.
  Depende de: T0, T6, T8.
  Hecho cuando: ninguna consulta ni escritura del archivo se ejecuta sin el ámbito; el alta escribe
  la empresa del ámbito y calcula el máximo sobre **esa misma** empresa; ninguna salida pública lleva
  `companyId`.
  Cubre: R12, R14, R15, R18, R19, R20, R21, R22, R23, R24, R27.

- [x] **T10 — Server Actions con las dos caras de la sesión, y los llamantes de `asignaciones`.**
  Archivos: `lib/modules/pedidos/adapters/driving/order-actions.ts`;
  `lib/modules/asignaciones/domain/{assign-responsibles,list-order-responsibles,unassign-responsible,remove-work-group-from-order}.ts`.
  Contenido: `currentActor()` pide `getSessionUser()` **y** `getSessionContext()` en paralelo y
  devuelve `null` si falta cualquiera; las **seis** firmas públicas no cambian. En `asignaciones`,
  las cuatro llamadas a `orders.findAliveById(orderId)` pasan `actor.companyId`; nada más cambia allí.
  Depende de: T6.  `[P]` con T9.
  Hecho cuando: sin contexto de sesión ninguna action toca el repositorio; los tests existentes de
  las actions y de los cuatro casos de uso de `asignaciones` siguen verdes sin cambiar de firma
  pública.
  Cubre: R17, R27, R34.

## Bloque 3 — Pruebas

- [x] **T11 — Test de esquema y de texto de la migración.** `[P]`
  Archivos: `tests/unit/pedidos/schema/orders-company-scope-migration.test.ts` (nuevo);
  `tests/unit/pedidos/schema/pedidos-migration.test.ts` (se amplía: la función ya no existe, el único
  cambió de nombre).
  Contenido: el UP declara la columna, la FK, el intercambio del único, `orders_id_company_id_key`,
  la FK compuesta, el `DROP FUNCTION` y el `ENABLE`+`FORCE`; **no contiene ningún `DELETE` ni
  `INSERT`**, **ningún `UPDATE` de `order_sequence`**, **ningún `MATCH FULL`** y **ningún
  `DROP CONSTRAINT` salvo el de la FK simple**; el `down.sql` abre con sus tres guardias, recrea la
  función y hace el `setval`; identificadores en inglés; los seis `CHECK` y las tres FK previas de
  `orders` siguen escritos.
  Depende de: T4.
  Cubre: R3 (parte), R4, R5, R8, R9, R26.

- [x] **T12 — Integración: restricciones, backfill y reversión.** `[P]`
  Archivos: `tests/integration/pedidos/company-scope.int.test.ts` (nuevo, declarado en
  `tests/integration/aislamiento.json` con su motivo).
  Contenido: `INSERT` de pedido sin empresa y con empresa inexistente → rechazo; dos pedidos de
  empresas distintas con la misma pareja `(año, secuencia)` → **se aceptan**; dos de la misma → 
  `23505`; asignación cuya empresa no es la del pedido → `23503`; asignación suelta
  (`work_group_id IS NULL`) → sigue aceptándose (el `MATCH SIMPLE` de `OJO 3` no se rompió);
  reversión con dos empresas compartiendo correlativo → **aborta entera**; reversión con una fila de
  otra empresa → aborta; tras la reversión, `orders_sequence_<año>` apunta al máximo.
  Depende de: T4.
  Cubre: R1, R2, R6, R7, R11, R13, R25.

- [x] **T13 — Integración: listado, escrituras y correlativo por empresa.** `[P]`
  Archivos: `tests/integration/pedidos/company-scope-queries.int.test.ts` (nuevo, declarado en
  `aislamiento.json`).
  Contenido: con pedidos de dos empresas sembrados, el listado devuelve solo los suyos **y el `total`
  también**; los filtros y el orden no ensanchan lo visible; `updateAlive`/`cancelAlive`/
  `softDeleteAlive`/`findAliveById` con un id ajeno devuelven «no existe» y **dejan la fila ajena
  intacta**; el alta escribe la empresa del ámbito; la primera alta de una empresa sin pedidos de ese
  año recibe **1**; la siguiente alta de QuimiCloud en 2026 recibe **78** y no 1; un pedido borrado y
  uno cancelado **no liberan** su número; quitar `FORCE ROW LEVEL SECURITY` no cambia ningún
  resultado (R30); una empresa marcada como borrada conserva sus pedidos y asignaciones (R29).
  Depende de: T9.
  Cubre: R12, R19, R21, R22, R23, R24, R29, R30, R34.

- [x] **T14 — Integración: la carrera del correlativo.** `[P]`
  Archivos: el mismo `company-scope-queries.int.test.ts` (bloque propio) o
  `tests/integration/pedidos/order-sequence-race.int.test.ts`, declarado en `aislamiento.json`.
  Contenido: el patrón medido de QC-81 §8 — varias rondas de altas simultáneas de la **misma**
  empresa sin `await` intermedio, esperadas con `Promise.allSettled` relanzando el primer rechazo
  **antes** de afirmar y de limpiar; se afirma que todas resuelven, que los correlativos son
  distintos y consecutivos y que **no hubo ningún reintento**; y que dos altas de **empresas
  distintas** no se esperan. Comentario en el archivo sobre el requisito de pool > 1 conexión.
  Depende de: T9.
  Hecho cuando: pasa, y **muerde**: quitar el `pg_advisory_xact_lock` lo pone rojo con la causa real.
  Cubre: R14, R15.

- [x] **T15 — Guardia estática por función.** `[P]`
  Archivos: `tests/guards/guard-ambito-empresa-pedidos.test.ts` (nuevo), calcado de
  `guard-ambito-empresa-inventario.test.ts`.
  Contenido: **método a método** de `OrderRepository` y de `OrderCatalog`, y función a función de
  todo `pedidos/adapters/driven/persistence/`, que la implementación declara el ámbito y que ese
  valor llega hasta una envoltura de `./company-scope` — incluido el camino del SQL crudo del alta.
  **Sin lista de excepciones.**
  Depende de: T8, T9.
  Cubre: R18.

- [x] **T16 — Service: el rechazo cruzado, con dobles.** `[P]`
  Archivos: `tests/unit/pedidos/company-isolation-service.test.ts` (nuevo);
  `tests/unit/pedidos/authorization.test.ts` y `.../order-actions.test.ts` (se amplían);
  `tests/unit/pedidos/company-scope.test.ts` (nuevo: las dos envolturas, la forma de la salida
  pública).
  Contenido: los seis casos de uso reciben el ámbito **del actor** y no de la entrada; ficha /
  edición / cancelación / borrado de un pedido ajeno → `OrderNotFoundError` y **nunca**
  `UnauthorizedError`; el permiso se exige **antes** del ámbito (actor sin permiso y de otra empresa
  → error de autorización sin tocar el puerto); una `companyId` en la entrada → `invalid_input`; falta
  el contexto de sesión → la action no llama al caso de uso; ninguna salida pública lleva `companyId`.
  Depende de: T7, T10.
  Cubre: R16, R17, R18, R20, R21, R22, R23, R28.

- [ ] **T17 — E2E de aislamiento.** **(E2E — Playwright)**
  Archivos: `e2e/aislamiento-pedidos.spec.ts` (nuevo), con el patrón de
  `e2e/aislamiento-inventario.spec.ts` y `e2e/permisos.spec.ts`: fixture propio, prefijo por worker,
  limpieza defensiva, **una sola sesión real** (la de A) y los datos de B sembrados con Prisma.
  Contenido: login por la UI como usuario de A; `/pedidos` no contiene el pedido de B (aserción sobre
  el HTML servido); se abre el diálogo de borrado de un pedido **propio** y se sustituye por DOM el
  identificador por el del pedido **de B**, se confirma, se espera el mensaje de error y se comprueba
  con Prisma que el pedido de B sigue con `deleted_at` nulo; y un alta en A obtiene su propio
  correlativo, sin que la serie de B lo desplace.
  Depende de: T9, T10.
  Hecho cuando: pasa en Chromium **y** en WebKit, y el fixture deja la base como la encontró.
  Cubre: R31, y ejercita R19, R20, R21, R11 de extremo a extremo.

## Bloque 4 — Cierre

- [ ] **T18 — Documentación de la deuda saldada.**
  Archivos: `docs/architecture.md > Dominio` (quitar `pedidos (QC-60)` de la lista de deuda
  registrada, `:33-37`, dejando el resto intacto); `db/schema.prisma` (comentarios `///` de `Order` y
  de `OrderAssignment`: la FK del pedido ya es compuesta, `OJO 2` deja de decir «esta ficha NO se lo
  añade»); `progress/impl_QC-60-…​.md` con el mapa `R<n> -> test`.
  Depende de: T17.
  Hecho cuando: la viñeta ya no nombra pedidos y el mapa de trazabilidad está escrito.
  Cubre: el checkpoint de trazabilidad de `CHECKPOINTS.md`.

- [ ] **T19 — Gate completo.**
  `./init.sh` en verde (no `--rapido`: es lo que exige cerrar la feature y todo PR).
  Depende de: T18.
  Hecho cuando: typecheck, lint, unit, integración, guardias y E2E pasan; en particular
  `guard-rls-force`, `guard-arquitectura-modulos`, `guard-dependencias-aprobadas`,
  `guard-aislamiento-integracion` y la guardia del catálogo de errores.
  Cubre: R32, R33, R35 (por ausencia: ninguna tabla de `recetas` cambia, ninguna empresa se borra,
  `ERROR_CODES` no crece y `package.json` no se toca).

## Trazabilidad — `R<n> -> test`

| R | Test | Nivel |
| --- | --- | --- |
| R1 | `tests/integration/pedidos/company-scope.int.test.ts` | integración |
| R2 | `tests/integration/pedidos/company-scope.int.test.ts` (backfill) | integración |
| R3 | `tests/unit/pedidos/schema/orders-company-scope-migration.test.ts` | unit |
| R4 | `tests/guards/guard-rls-force.test.ts` + test de esquema de T11 | guardia + unit |
| R5 | `tests/unit/pedidos/schema/orders-company-scope-migration.test.ts` | unit |
| R6 | `tests/integration/pedidos/company-scope.int.test.ts` (reversión abortada) | integración |
| R7 | `tests/integration/pedidos/company-scope.int.test.ts` (`setval` tras revertir) | integración |
| R8 | test de esquema de T11 | unit |
| R9 | test de esquema de T11 | unit |
| R10 | test de esquema de T11 (el único lleva `company_id` de cabeza) | unit |
| R11 | `tests/integration/pedidos/company-scope.int.test.ts` | integración |
| R12 | `tests/integration/pedidos/company-scope-queries.int.test.ts` | integración |
| R13 | `tests/integration/pedidos/company-scope.int.test.ts` (backfill) + `company-scope-queries.int.test.ts` (el siguiente es 78) | integración |
| R14 | `tests/integration/pedidos/order-sequence-race.int.test.ts` | integración |
| R15 | `order-sequence-race.int.test.ts` + `tests/unit/pedidos/order-prisma.test.ts` (traducción del `23505`) | integración + unit |
| R16 | `tests/unit/pedidos/company-isolation-service.test.ts` | unit |
| R17 | `tests/unit/pedidos/order-actions.test.ts` | unit |
| R18 | `tests/guards/guard-ambito-empresa-pedidos.test.ts` + `tests/unit/pedidos/company-scope.test.ts` + `company-scope-queries.int.test.ts` | guardia + unit + integración |
| R19 | `tests/integration/pedidos/company-scope-queries.int.test.ts` | integración |
| R20 | `tests/unit/pedidos/company-isolation-service.test.ts` | unit |
| R21 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R22 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R23 | `tests/unit/pedidos/company-scope.test.ts` (forma de la salida pública) | unit |
| R24 | `tests/integration/pedidos/company-scope-queries.int.test.ts` (el máximo se lee de la empresa que se escribe) | integración |
| R25 | `tests/integration/pedidos/company-scope.int.test.ts` (FK compuesta) | integración |
| R26 | test de esquema de T11 (ningún `DROP CONSTRAINT` de más, ningún `MATCH FULL`) + `company-scope.int.test.ts` (asignación suelta sigue aceptándose) | unit + integración |
| R27 | `tests/unit/pedidos/company-isolation-service.test.ts` + los tests de los cuatro casos de uso de `asignaciones` (se amplían) | unit |
| R28 | `tests/unit/pedidos/authorization.test.ts` (se amplía) + `company-isolation-service.test.ts` | unit |
| R29 | `tests/integration/pedidos/company-scope-queries.int.test.ts` (empresa de baja) | integración |
| R30 | `tests/integration/pedidos/company-scope-queries.int.test.ts` (sin `FORCE`, mismo resultado) | integración |
| **R31** | **`e2e/aislamiento-pedidos.spec.ts`** | **E2E** |
| R32 | test de esquema de T11 (la migración no toca `recipes` ni `recipe_lines`) | unit |
| R33 | test de esquema de T11 (no crea guardia, no borra empresas, no toca las tablas de las otras fichas) | unit |
| R34 | `tests/unit/pedidos/order-actions.test.ts` y `tests/unit/pedidos/list-orders.test.ts` (firmas y forma de salida intactas) | unit |
| R35 | `tests/guards/guard-dependencias-aprobadas.test.ts` | guardia |

**E2E**: solo **T17 / R31**. Todo lo demás es unit, integración o guardia.
