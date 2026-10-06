# QC-82 — registro-de-ejecucion-de-receta · tasks.md

> **Revisado el 2026-09-24** contra `dev` (merge `9634f6ae`); qué cambió y por qué en
> `design.md > Revisión 2026-09-24`. T4 se retira; T5 cambia de contenido; nacen T23 y T24.
>
> **Enmendado el 2026-09-26** contra `dev` tras el merge `811416cd`, con QC-168 ya dentro; qué cambió
> y con qué evidencia en `design.md > Revisión 2026-09-26`. Se mueven **T1** y **T2** (ocho acciones,
> tres `CHECK`), **T5**, **T6**, **T7**, **T8**, **T10**, **T11**, **T12**, **T13**, **T19**, **T20**,
> **T22**, **T23** y **T24**, y **nace T25**. **Quedan dos preguntas abiertas** (`design.md > 14.1`),
> así que la línea de «no queda nada abierto» de abajo ya no es cierta: son P1 (`already_mine` anota o
> no) y P2 (los nombres de los dos valores nuevos del enum), y las dos se resuelven **antes de T1**,
> porque de P2 dependen el `CREATE TYPE` y el tercer `CHECK`.
>
> **Revisado el 2026-10-06** contra `dev` tras el merge `abd455b4`; qué cambió y con qué
> `archivo:línea` en `design.md > Revisión 2026-10-06`. Se mueven **T1**, **T3**, **T5**, **T6**,
> **T8**, **T9**, **T10**, **T11**, **T12**, **T13**, **T15**, **T16**, **T19**, **T22**, **T23**, **T24**
> y **T25**, y **nace T26** (la fábrica de Comenzar empaque sobre `tx`, P5). **Quedan cinco preguntas
> abiertas, P1–P5, todas en `design.md > 14.1`**: P2 bloquea T1; P3 bloquea T8, T9 y T12; P5 bloquea
> T13 y T26; P1 bloquea el caso (e) de T25 y el (c) de T19; P4 no bloquea ninguna tarea (si se
> contesta «sí», abre alcance y se para). Las dos de abajo («P1 y P2 … antes de T1») siguen valiendo.
>
> **Antes de T1**: los ocho puntos de F1.4 (`design.md > 12`) quedaron ratificados con el spec. Las dos
> preguntas que abrió la revisión del 2026-09-24 las cerró el humano ese día como **D19** (cancelar
> desde la ejecución libera todo el material, por el camino único) y **D20** (el Empacador ejecuta,
> finaliza y cancela lo que tenga asignado). La enmienda del 2026-09-26 **no reabre ninguna** y no
> necesita ninguna decisión más que P1 y P2.
>
> **Antes de T1, y por cambios de `dev` que no son de esta ficha**: el worktree **no tiene `.env`**.
> Hay que crearlo (copiando el del árbol principal) apuntando a `QuimiCloude_QC82` **antes** de correr
> T1, porque sin `DATABASE_URL` no hay `db:migrate:create`. Es la misma condición que ya bloqueaba
> F2.1, y sigue abierta.
>
> **Base de datos propia, sin excepción.** La migración (T1), **todos** los tests de integración (T2,
> T19 y los que se toquen) y **todas** las E2E (T20, T23) corren contra una base propia
> **`QuimiCloude_QC82`**, con el `.env` git-ignorado del worktree apuntando a ella. **Nunca** contra la
> base del `.env` del árbol principal. Antes de cada `db:migrate`, `db:rollback`, test de integración o
> E2E se comprueba que `DATABASE_URL` y `DIRECT_URL` nombran `QuimiCloude_QC82`.
>
> **Una sola E2E a la vez en la máquina.** Antes de lanzar Playwright se comprueba que no hay otra
> corrida de E2E viva (de esta u otra sesión); si la hay, se espera.
>
> `[P]` = paralelizable con las otras `[P]` de su mismo bloque. **Ninguna dependencia nueva**: si
> alguna task parece necesitarla, se **para** y se sube la propuesta con los cuatro checks.
>
> `docs/conventions.md > Comentarios`: en producción (`app/`, `lib/`, `components/`, `db/`) **ningún
> comentario cita ficha, requisito ni decisión** (ni `QC-`, ni `R<n>`, ni `D<n>`). En `tests/` y
> `e2e/`, `R<n>` **sí** va en el nombre del caso. Al tocar un archivo se limpian los comentarios **de
> las líneas que toca la rama**, no del archivo entero, y nunca se imita el estilo de alrededor.
>
> Cada tanda cierra con `./init.sh --rapido`; la feature, con `./init.sh` completo.

---

## Bloque A — La tabla

### T1 [ ] — Modelo, migración y `down.sql`
**Toca:** `db/schema.prisma`,
`db/migrations/<AAAAMMDDhhmmss>_order_execution_entries/migration.sql`,
`db/migrations/<AAAAMMDDhhmmss>_order_execution_entries/down.sql`,
`tests/unit/asignaciones/schema/order-execution-entries-migration.test.ts`
**Hacer:** `enum OrderExecutionAction` (**ocho** valores: `START`, `RESUME`, `ADVANCE`, `GO_BACK`,
`CANCEL`, `FINISH`, `PACK_START`, `PACK_FINISH` — ⚑ los dos últimos dependen de P2) y `model
OrderExecutionEntry` con `/// @module asignaciones`, **sin** `@relation`, sin
`created_at`/`updated_at`/`deleted_at` (`design.md > 2.1`). `pnpm run db:migrate:create` **contra
`QuimiCloude_QC82`**; el timestamp tiene que ser **mayor que el de la última migración de
`db/migrations/`** (el 2026-10-06, **`20261006120000_inventory_imports`**; ni
`20260925120100_packing_permission` ni `20260924120000_customers`, que lo fueron antes).
**Borrar a mano del SQL generado** todo `DROP CONSTRAINT`/`DROP INDEX` sobre tablas ajenas. Completar a
mano los **tres** `CHECK`, las dos FK compuestas, los dos índices y `ENABLE`+`FORCE ROW LEVEL SECURITY`
**al final**. `down.sql`: `DROP TABLE` sin `CASCADE` y `DROP TYPE`.
**Hecho cuando:** el test de esquema, leyendo el SQL, afirma: los **ocho** valores y ninguno más (R1);
la lista **exacta** de columnas, ninguna con texto ni identificador del paso (R2, R4); una sola columna
de tiempo (R3); el `CHECK` del motivo con la forma literal de QC-34 (R8); el `CHECK` de posición (R5);
**el `CHECK` de que las dos de empaque no llevan posición, con la forma de R5bis**; las dos FK
compuestas contra `orders_id_company_id_key` y `users_id_company_id_key` (R6, R7); RLS activada y forzada
como últimas sentencias (R32); identificadores en inglés (R33); ninguna línea ejecutable sobre una tabla
preexistente ni ningún `INSERT` de permisos (R30); el `down.sql` revierte exactamente el UP (R34); y
que su carpeta es **la última** de `db/migrations/` por orden de nombre. Cada aserción con su
**mutación** que la pone roja. `db:migrate` → `db:rollback` → `db:migrate` sobre `QuimiCloude_QC82`,
con la salida pegada en `progress/impl_QC-82-registro-de-ejecucion-de-receta.md`; `prisma generate`.
`guard-rls-force`, `guard-empresa-en-esquema` y `guard-arquitectura-modulos` verdes.
**Depende de:** nada, y de que el humano haya respondido P1 y P2.

### T2 [ ] — Las restricciones, contra Postgres
**Toca:** `tests/integration/asignaciones/order-execution-entries-constraints.int.test.ts`,
`tests/integration/aislamiento.json`
**Hacer:** test en modo `transaccion` que inserte con SQL crudo y compruebe cada rechazo. Contra
`QuimiCloude_QC82`.
**Hecho cuando:** un caso por rechazo: acción fuera de las **ocho** (R1); `CANCEL` sin motivo y
`ADVANCE` con motivo (R8); posición 0 (R5); **`PACK_START` o `PACK_FINISH` con posición, rechazado
(R5bis), y con `NULL`, aceptado**; pedido inexistente (R6); pedido de la empresa B con la fila de la A,
y persona de la B con la fila de la A (R7); `relforcerowsecurity = true` (R32). Y el control positivo
de cada uno. Entrada `transaccion` en `aislamiento.json`; `guard-aislamiento-integracion` verde.
**Depende de:** T1.

---

## Bloque B — `pedidos` cancela por encargo, por el camino único

### T3 [ ] — Una sola definición y un solo cuerpo de cancelación
**Toca:** `lib/modules/pedidos/domain/order-cancellation.ts` (nuevo),
`lib/modules/pedidos/domain/cancel-order.ts`, `lib/modules/pedidos/index.ts`,
`tests/unit/pedidos/order-cancellation.test.ts`
**Hacer:** `design.md > 5`. `isCancellableStatus` con mapa **total** sobre `OrderStatus`;
`cancelInsideTransaction(scope, input)` con el cuerpo que hoy vive dentro del `run` de
`cancel-order.ts`, sin cambiarlo (bloqueo → comprobación bajo candado → `cancelAlive` →
`releaseForOrder` con `reason: 'release'` → `setReservedAt(null)`); el tipo `OrderCancellation` y
`createCancelAliveOrder({ unitOfWork })`. `cancel-order.ts` usa las dos primeras. Barril:
`createCancelAliveOrder`, `CancelAliveOrderDeps`, `OrderCancellation`. Ni el código ni los comentarios
de estos archivos usan el vocabulario que prohíbe `tests/unit/pedidos/module-contract.test.ts`.
**Hecho cuando:** tests: `isCancellableStatus` en los **siete** estados —**`PENDIENTE`, `EN_CURSO` y
`BLOQUEADO` en `true`** (los tres de `cancel-order.ts:33`; `BLOQUEADO` es de QC-138, R29) y
**`POR_EMPACAR`, `EN_EMPAQUE`, `ENTREGADO` y `CANCELADO` en `false`** (A5, R43)—, con una mutación que
pone `BLOQUEADO` a `false` y la deja roja; `createCancelAliveOrder` con una unidad de
trabajo doble devuelve `'ok'` (y llama a `cancelAlive`, `releaseForOrder` con el autor recibido y
`setReservedAt(null)`, en ese orden), `'not_found'` y `'not_cancellable'` **sin** llamar a
`cancelAlive` ni a `releaseForOrder` (R29); test de fuente: `cancel-order.ts` ya no declara su lista y
el módulo tiene **una** sola definición de «cancelable» y **una** sola llamada a `cancelAlive` fuera de
la caducidad diaria (R29). Los tests existentes de `cancelOrder` (unit e integración), **sin tocar**,
siguen verdes; `tests/unit/pedidos/module-contract.test.ts` y `authorization.test.ts` verdes.
**Depende de:** nada.

### T4 — RETIRADA el 2026-09-24
`cancelAliveOrder` no necesita `from` ni `db`: la comprobación bajo el candado de
`cancelInsideTransaction` ya impide cancelar un pedido que otro acaba de entregar, y el cliente
transaccional llega por `OrderUnitOfWork`. `order-prisma.ts` queda fuera del diff.

### T5 [ ] — `guard-ambito-empresa-pedidos`, tensada
**Toca:** `tests/guards/guard-ambito-empresa-pedidos.test.ts`
**Hacer:** un caso nuevo, con **nota fechada** (`2026-09-24`) encima: `OrderCancellation.cancelAliveById`
declara `companyId: string`; `cancelInsideTransaction` lleva `{ companyId }` a `lockAliveById` y
`cancelAlive`; y en `lib/composition/index.ts` toda llamada a `createTransitionOrder(` o
`createCancelAliveOrder(` recibe exactamente `{ unitOfWork: orderUnitOfWork }` o `{ unitOfWork:
joinOrderUnitOfWork(tx) }`. Nada existente se afloja. **Y un caso más, con nota fechada `2026-09-26`**
(A3): toda llamada a `createOrderPackingRepository(` dentro de `lib/composition` recibe **`tx`** y nada
más —ni `prisma`, ni `orderUnitOfWork`, ni el global—. **[2026-10-06]** Ese caso se amplía: dentro de
`executionTransaction`, `createFinishPacking(` recibe `unitOfWork: joinOrderUnitOfWork(tx)` (Terminar ya
va por la unidad de trabajo) y `createStartPacking(` recibe `packing: createOrderPackingRepository(tx)`.
Las dos expresiones exactas de `METODOS_DELEGADOS_EN_DOMINIO` para el `orderCatalog` global
(`:487-511`) **no cambian**.
**Hecho cuando:** la guardia sigue verde **y muerde**: (a) quitar `companyId` del ámbito en
`cancelInsideTransaction` la pone roja; (b) cablear `createCancelAliveOrder` con otra unidad de trabajo
en la composición la pone roja; (c) **[nuevo]** atar `createOrderPackingRepository` al `prisma` global
en vez de a `tx` la pone roja; (d) **[2026-10-06]** cablear el `createFinishPacking` de
`executionTransaction` con `orderUnitOfWork` en vez de `joinOrderUnitOfWork(tx)` la pone roja. Se
restaura desde copia y las mutaciones quedan en `progress/impl_…`.
**Depende de:** T3, T13, T26.

---

## Bloque C — `asignaciones`: dominio, puertos y adaptadores

### T6 [ ] [P] — Tipos, puertos y errores
**Toca:** `lib/modules/asignaciones/domain/execution-entry.ts`,
`lib/modules/asignaciones/ports/execution-log-repository.ts`,
`lib/modules/asignaciones/ports/execution-transaction.ts`,
`lib/modules/asignaciones/domain/errors.ts`,
`tests/unit/asignaciones/execution-log-repository.test.ts`
**Hacer:** `NewExecutionEntry` con el motivo **solo** en la rama `cancel` y `ExecutionAction` con los
**ocho** valores (`design.md > 3.1`); `ExecutionAbortedError` interna; los dos puertos de
`design.md > 3.2`, con `ExecutionWriters.orders = Pick<OrderCatalog, 'transitionAliveById'> &
OrderCancellation` y **`ExecutionWriters.packing: Pick<OrderCatalog, 'startPackingAliveById' |
'finishPackingAliveById'>`** (A3; **[2026-10-06]** `OrderPacking` no existe en el barril de `pedidos`);
`NotCancellableError` con `code = 'not_cancellable'`. **El predicado único de éxito** (`'ok'` o
`{ kind: 'ok', … }`) vive aquí, en el dominio de `asignaciones`, y lo usan los cinco casos de uso con
transacción.
**Hecho cuando:** test de tipos: una entrada `cancel` sin `reason` y una `advance` con `reason` **no
compilan** (`@ts-expect-error`) (R8); una entrada `pack_start` **con** `stepPosition` numérico tampoco
compila, y con `null` sí (R5bis); el mapa al enum es **total sobre las ocho**, con un caso por valor
(R1); el puerto del registro no declara `update`, `delete` ni nada parecido (R31); el predicado de
éxito acepta `'ok'` y `{ kind: 'ok', finishedGoods: [] }` y rechaza `'already_mine'`, `'stale'` y
cualquier otro literal, un caso por forma (R24); `guard-catalogo-de-errores` verde.
**Depende de:** T3 (el tipo `OrderCancellation`). _[2026-10-06] Ya no depende de T25: el tipo del
empaque es un `Pick` de `OrderCatalog`, que existe._

### T7 [ ] — Los dos adaptadores driven
**Toca:** `lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma.ts`,
`lib/modules/asignaciones/adapters/driven/persistence/execution-transaction-prisma.ts`
**Hacer:** `createExecutionLogRepository(db = prisma)` con `append` (mapa total `ExecutionAction →` enum
de Prisma, **ocho pares**, `occurredAt` explícito) y `findLastStepPosition(companyId, orderId)`;
`withExecutionTransaction(run)` sobre `prisma.$transaction` con `maxWait: 10_000` y `timeout: 30_000`.
Ninguna sentencia de modificación ni de borrado en el archivo del registro.
**Hecho cuando:** los casos de T19 que ejercitan estos adaptadores pasan; **el mapa tiene ocho entradas y
el test cuenta las ocho**, con mutación que quita un par y lo pone rojo (R1); test de fuente: el archivo
del registro no contiene `update`, `upsert` ni `delete` sobre el modelo (R31); `module-contract` (b) y
`guard-arquitectura-modulos` verdes.
**Depende de:** T1, T6.

### T8 [ ] [P] — `recordStepMove`
**Toca:** `lib/modules/asignaciones/domain/record-step-move.ts`,
`tests/unit/asignaciones/record-step-move.test.ts`,
`tests/unit/asignaciones/order-state.test.ts` (solo si existe como archivo propio)
**Hacer:** prólogo de QC-63 con el permiso de la **P3** ⚑ (propuesta `asignaciones.ejecutar`); solo
`EN_CURSO`; un `append` con la posición del paso de llegada. **`BLOQUEADO` ⇒ `OrderBlockedError`**,
comprobado **antes** de `assertOrderAcceptsWrites`, que lo deja pasar (`order-state.ts:59`).
**`order-state.ts` no se toca**: ya tiene las claves de `POR_EMPACAR` y `EN_EMPAQUE` con
`order_produced_frozen`. Lo que se comprueba aquí es que `recordStepMove` **usa** esa fila (A2, R43).
**Hecho cuando:** tests: sin permiso rechaza **sin llamar a ningún doble**, y `asignaciones.consultar`
solo **no** basta si la P3 se contesta con la propuesta (R26); no asignado y otra empresa, misma
respuesta que inexistente (R27); la empresa sale del actor y el esquema estricto rechaza un
`companyId` en la entrada (R28); `advance` y `go_back` escriben su acción con la posición recibida
(R17, R18); `ENTREGADO`, `CANCELADO`, `POR_EMPACAR`, `EN_EMPAQUE`, `PENDIENTE` y **`BLOQUEADO`** no
escriben; `POR_EMPACAR`/`EN_EMPAQUE` con **`order_produced_frozen`** y `BLOQUEADO` con
**`order_blocked`**, con una mutación que quita la comprobación de `BLOQUEADO` y la pone roja (R20,
R43, A2).
**Depende de:** T6; la P3 respondida.

### T9 [ ] [P] — `cancelAssignedOrder`
**Toca:** `lib/modules/asignaciones/domain/cancel-assigned-order.ts`,
`tests/unit/asignaciones/cancel-assigned-order.test.ts`
**Hacer:** `design.md > 3.3`. El motivo con `cancelOrderSchema.shape.reason` del barril de `pedidos`.
Número leído antes de escribir. Dentro de `transaction.run`: `cancelAliveById` y, solo si `'ok'`,
`append` con el **mismo** `reason` y el mismo `now`; cualquier otro desenlace lanza
`ExecutionAbortedError`, que el caso de uso traduce al salir de `run`.
**Hecho cuando:** tests: prólogo (R26–R28); motivo ausente/vacío/espacios ⇒ `invalid_input` sin abrir
la transacción (R9); tope de 501 caracteres rechazado igual que `cancelOrderSchema` (R10);
`'not_cancellable'` ⇒ `NotCancellableError`, **ningún** `append` y el error sale **desde dentro** de
`run` (R29); `'not_found'` ⇒ `OrderNotFoundError`; `'ok'` ⇒ un `append` con `action: 'cancel'` y
`reason` **idéntico** al pasado a `cancelAliveById` (R22, R23); si `append` lanza, el error se propaga
desde dentro de `run` (R24); lo puede hacer un responsable que no arrancó (R27) y, **[2026-10-06]** ⚑
con la propuesta de la P3, **no** un actor con exactamente los permisos del Empacador
(`asignaciones.consultar`, `terminados.consultar`, `empaque.modificar`), que rechaza sin llamar a ningún
doble (R26, R27; el caso «también con los permisos del Empacador» del 2026-09-26 se **invierte**, con
nota fechada); un `BLOQUEADO` cancela por `'ok'` (R29, B1); el actor no necesita `pedidos.modificar`
ni `asignaciones.modificar` (R30).
**Depende de:** T6; la P3 respondida.

### T10 [ ] — `startAssignedOrder`: arrancar y retomar
**Toca:** `lib/modules/asignaciones/domain/start-assigned-order.ts`,
`lib/modules/asignaciones/domain/assigned-order-execution-view.ts`,
`tests/unit/asignaciones/start-assigned-order.test.ts`
**Hacer:** `design.md > 3.3`. Lee la vista antes de escribir. `PENDIENTE`: transición + `start` en
`run`; **todo desenlace que no sea un éxito** (el predicado de T6; aquí solo llega el literal `'ok'`,
`order-catalog.ts:112-119`) lanza `ExecutionAbortedError`; fuera, `'stale'` relee y sigue, y si relee
**`BLOQUEADO`** lanza `OrderBlockedError` como hoy (`start-assigned-order.ts:76`). `EN_CURSO`:
`findLastStepPosition` → `append(resume)`, y si falla, lanza. `BLOQUEADO` de entrada: `OrderBlockedError`
sin tocar el registro. Devuelve `StartedOrderExecution` con `status: 'EN_CURSO'`. Tensar el `describe`
de QC-63 R9 con **nota fechada**: sigue afirmando que `transitionAliveById` no se llama **y además** que
se escribe exactamente un `resume`. La primera línea **sigue** siendo `asignaciones.ejecutar`.
**Hecho cuando:** tests: `PENDIENTE` ⇒ un `start` con posición 1 **dentro** de `run` (R12); receta sin
pasos ⇒ posición `null` (R5); `EN_CURSO` con última posición 3 ⇒ `resume` con 3 y vista con 3 (R13);
sin anotaciones ⇒ 1 (R14); si `append(resume)` lanza, `startAssignedOrder` lanza (R15); `'stale'` ⇒ cero
`start` y un `resume` (R16); **`BLOQUEADO` ⇒ `order_blocked` y cero `append`; `'stale'` que relee
`BLOQUEADO` ⇒ `order_blocked` y cero `start`** (R44); prólogo intacto, `asignaciones.consultar` solo no
basta (R26); cualquier desenlace distinto de `'ok'` aborta sin `append` (R24).
**Depende de:** T6.

### T11 [ ] — `finishAssignedOrder`: finalizar
**Toca:** `lib/modules/asignaciones/domain/finish-assigned-order.ts`,
`tests/unit/asignaciones/finish-assigned-order.test.ts`
**Hacer:** entrada `{ orderId, stepPosition }` (estricta); transición a **`POR_EMPACAR`** (**A1** — el
código de `dev` ya lo pide así, y `finished_at` **no** se escribe aquí: lo escribiría terminar empaque)
+ `finish` en `run`; **todo desenlace que no sea un éxito** lanza `ExecutionAbortedError` y fuera se
traduce como hoy (`stale` relee en el `for(;;)` que ya tiene, `insufficient_material`,
`recipe_without_lines`, `not_found`: **solo esos**, `finish-assigned-order.ts:218-220`; los de lote y
envase son de Terminar empaque desde QC-195). **[2026-10-06]** `ensurePackerAssignments` sigue **antes y
fuera** de `run`, una sola vez; **toda** salida de `run` que no sea éxito —también un `append` que
lanza— pasa por `compensatePackerAssignments` antes de traducirse o propagarse (R24; `design.md >
10.17`). Tensar el caso de QC-63 R16 con **nota fechada**: la entrada gana `stepPosition` y **sigue**
rechazando cualquier dato de marcado.
**Hecho cuando:** tests: un `finish` con la posición recibida y el mismo `now` que la transición, y el
destino de la transición es **`'POR_EMPACAR'`, no `'ENTREGADO'`** —con su **mutación** que lo pone a
`ENTREGADO` en rojo (R21, A1)—; los **dos** rechazos de material y receta ⇒ su error, **cero** `append`,
lanzado desde dentro de `run` (R24); si `append` lanza, se propaga desde dentro de `run` **y se llama a
`deleteOne` por cada fila de empacador creada**, con su mutación que quita esa compensación y la pone
roja (R24); un campo de marcado sigue siendo `invalid_input`; `asignaciones.consultar` solo no basta
(R26). Los tests de auto-asignado de empacadores existentes siguen verdes sin tocar sus aserciones.
**Depende de:** T6. En serie con T10 (las dos cambian las deps que consume T12).

### T12 [ ] — El contrato del módulo, su lista cerrada y los consumidores de las deps
**Toca:** `lib/modules/asignaciones/index.ts`, `tests/unit/asignaciones/module-contract.test.ts`,
`tests/unit/asignaciones/empacador-authorization.test.ts`,
`tests/unit/asignaciones/authorization.test.ts` **[2026-10-06]**,
`tests/integration/asignaciones/responsible-eligibility.int.test.ts`,
`tests/integration/asignaciones/finished-orders.int.test.ts`,
`tests/integration/asignaciones/batch-states.int.test.ts` **[2026-10-06]**,
`tests/integration/asignaciones/finish-auto-assign-packers.int.test.ts` **[2026-10-06]**
**Hacer:** publicar `createCancelAssignedOrder`, `createRecordStepMove`, sus `*Deps`, `ExecutionAction`,
`StartedOrderExecution`, `NotCancellableError` y los tipos de los puertos que `lib/composition` nombra
(solo tipos). **[2026-10-06]** `CASOS_DE_USO_QC63` legitima hoy **`asignaciones.ejecutar`**
(`module-contract.test.ts:439-455`) y un caso fija la lista exacta de quién lo nombra (`:1047-1054`). ⚑
Según la P3: **(propuesta)** los dos archivos nuevos entran en `CASOS_DE_USO_QC63` con nota fechada, y
el caso exacto crece con ellos; **(letra de `D7`)** entran en dos entradas nuevas de
`CONSUMO_LEGITIMO` con `codigo: 'asignaciones.consultar'` y `CASOS_DE_USO_QC63` no se toca. **Los dos
archivos de empaque de QC-168 no se añaden a ninguna lista** (A4, R42: no nombran ningún código de
`asignaciones`) **y no se crea una lista nueva**; lo que sí hay que comprobar es que `start-packing.ts` y `finish-packing.ts`
sigan exigiendo `empaque.modificar` en la primera línea, y eso lo dice su propio test. Dar `log` y
`transaction` a quien construye `start`/`finish` **y a quien construye `startPacking`/`finishPacking`**
(A3): en `empacador-authorization` y **`authorization`** (que construye los dos de empaque,
`:596-658`), dobles; en las **cuatro** integraciones, el registro real sobre el `tx` del test y un
`transaction` de test cuyo `run` llama a `work` con los escritores atados a ese mismo `tx`, **sin**
`$transaction` (`design.md > 7`); si alguna corre en modo `commit` (mirar `aislamiento.json`) y borra
pedidos, borra antes `orderExecutionEntry`. Las aserciones de esos archivos no cambian.
**Hecho cuando:** `module-contract` verde **y muerde**: quitar uno de los dos archivos de la lista lo
pone rojo; **`start-packing.ts` o `finish-packing.ts` fuera de la lista sigue verde, y poner
`asignaciones.consultar` o `asignaciones.ejecutar` en cualquiera de los dos la pone rojo** (R42, A4);
el cierre de imports del barril sigue sin `next/*`, `@prisma/client` ni `'use server'`; los archivos de
tests tocados, verdes contra `QuimiCloude_QC82`.
**Depende de:** T8, T9, T10, T11, T25; la P3 respondida.

---

## Bloque D — Cableado y Server Actions

### T13 [ ] — `lib/composition`
**Toca:** `lib/composition/index.ts`
**Hacer:** `design.md > 4`. Extraer el cuerpo que hoy construye el ámbito dentro de `orderUnitOfWork` a
`orderTransactionScopeOn(tx)` (sin cambiar lo que construye) y que `orderUnitOfWork` lo use;
`joinOrderUnitOfWork(tx)`; `executionLogRepository`; `executionTransaction`; la fachada `asignaciones`
gana `cancelAssignedOrder`, `recordStepMove` y las deps nuevas de `start`/`finish`, con `now: () => new
Date()` explícito. `orderCatalog` **no cambia**. **Ningún** import de `@/lib/shared/db/prisma` ni de
`@prisma/client`.
**A3, y son tres reglas, no una (corregidas el 2026-10-06).** (a) `orderTransactionScopeOn(tx)`
devuelve **`orders`, `reservations`, `recipes`, `finishedGoods`, `products` y `units`**: los **seis** de
hoy (`lib/composition/index.ts:1263-1270`), y **ni uno más**; no se amplía para el empaque. (b)
`executionTransaction.packing` tiene dos métodos: `startPackingAliveById: createStartPacking({ packing:
createOrderPackingRepository(tx) })` (T26) y `finishPackingAliveById: createFinishPacking({ packing:
createOrderPackingRepository(tx), unitOfWork: joinOrderUnitOfWork(tx), recipes, products, units,
presentations, packaging })` con los mismos catálogos globales que el `orderCatalog` de hoy
(`:1460-1468`); ninguno sale de `executionTransaction` (`design.md > 4`, `> 10.12`). (c) El predicado de
éxito es el de T6, con las **dos** formas: el objeto es de **Terminar empaque**.
**Hecho cuando:** `pnpm run typecheck` verde; `guard-ambito-empresa-pedidos` y
`guard-arquitectura-modulos` verdes; los tests de `pedidos` que ejercitan `orderUnitOfWork` siguen
verdes sin tocarlos; **el ámbito tiene seis miembros y el test cuenta seis**, con mutación que quita
`units` y la pone roja; **`createOrderPackingRepository` recibe `tx`**, y cablearlo con `prisma`
pone la guardia de T5 en rojo; el `orderCatalog` global sigue idéntico.
**Nota de la revisión del 2026-09-26:** el «**parar y avisar al leader**» del 2026-09-24 queda
resuelto —QC-150 **ya está** en `dev` y el bloque de `orderUnitOfWork` tiene los cuatro miembros—, así
que **no hay que parar**: hay que copiar la forma que hay, no la que había. Lo que sí hay que volver a
comprobar antes del PR es `origin/dev` (`design.md > 2.2`). _2026-10-06: «cuatro» eran seis; misma
regla: copiar lo que haya el día de T13._
**Depende de:** T3, T7, T12, T25, T26; la P5 respondida.

### T14 [ ] — Las acciones
**Toca:** `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`,
`tests/unit/asignaciones/order-execution-actions.test.ts`
**Hacer:** `cancelAssignedOrderAction` y `recordStepMoveAction` **en este mismo archivo**
(`design.md > 6.3`); `finishAssignedOrderAction` lee `stepPosition`.
**Hecho cuando:** tests de traducción por `code` y de redirección de cancelar;
`session-once-per-request-actions.test.ts` verde **sin tocarlo**.
**Depende de:** T13, T18 (usa `CANCELLED_ORDER_PARAM`).

---

## Bloque E — Pantalla

### T15 [ ] [P] — `StepReader`: dos props opcionales
**Toca:** `components/shared/step-reader/step-reader.tsx`, `tests/unit/recetas-ui/step-reader.test.tsx`
**Hacer:** `initialStepPosition` (recortada a `[1, steps.length]`, fija el estado inicial) y
`onStepChange` (`design.md > 6.1`), en los dos `mode`, sin tocar `finishLabel` ni `finishBusy`
(QC-211). **No** se toca ningún otro archivo de `components/shared/step-reader/` ni el caso R18 de
`order-execution-screen.test.tsx`, que ya admite este archivo.
**Hecho cuando:** los casos existentes pasan **sin tocarlos**; casos nuevos, en `lectura` y en
`ejecucion`: empieza en la posición 3 (R13), recorta 9 a la última (R14), Siguiente avisa `{ advance, 2
}` y Anterior `{ go_back, 1 }` (R17, R18), Anterior en el paso 1 no avisa, empezar en el paso 3 no mueve
el foco en `ejecucion`, y con `finishLabel` puesto el último paso sigue mostrando ese texto; el test de
fuente de QC-64, el caso R18 de QC-63 y **`tests/unit/asignaciones-ui/packing-order-screen.test.tsx`**
siguen verdes sin tocarlos (R37).
**Depende de:** nada.

### T16 [ ] — La pantalla anota los pasos
**Toca:** `app/(private)/asignacion/[id]/components/order-execution-screen.tsx`,
`tests/unit/asignaciones-ui/order-execution-step-log.test.tsx`,
`tests/unit/asignaciones-ui/order-execution-screen.test.tsx` (solo el mock y el fixture)
**Hacer:** `StartedOrderExecution`, `initialStepPosition`, posición en estado, cadena de promesas para
`recordStepMoveAction`, `stepPosition` en el formulario de Finalizar que hoy envía `ConfirmActionDialog`
(`design.md > 6.2`). En el test existente, el mock gana las dos acciones nuevas y el fixture
`resumeStepPosition`; la tarjeta de herramientas (QC-194) no se toca.
**Hecho cuando:** tests con la acción doblada: Siguiente dos veces ⇒ dos llamadas **en orden** con 2 y 3
(R17); con la acción que **rechaza** o **lanza**, el paso cambia igual, no aparece ningún
`role="alert"` y no hay segunda llamada (R19); con `resumeStepPosition: 3` la pantalla enseña «Paso 3 de
N» (R13); Finalizar envía la posición del último paso (R21). El test existente de la pantalla, verde.
**Depende de:** T14, T15.

### T17 [ ] — El diálogo de cancelar
**Toca:** `app/(private)/asignacion/[id]/components/order-cancel-dialog.tsx`,
`app/(private)/asignacion/[id]/components/index.ts`,
`app/(private)/asignacion/[id]/components/order-execution-screen.tsx`,
`tests/unit/asignaciones-ui/order-cancel-dialog.test.tsx`
**Hacer:** botón «Cancelar pedido» + `AlertDialog` con `Textarea`; valida con `cancelOrderSchema`; envía
`cancelAssignedOrderAction` con `orderId`, `stepPosition` y `reason`.
**Hecho cuando:** tests: sin motivo o solo espacios no se envía y el motivo del rechazo es **texto
visible** (R9); con motivo se envía el texto recortado tal cual (R22, R23); el error de la acción se
pinta (R24); botón y controles con `min-h-11 min-w-11`, `Textarea` con `text-base`, todo por teclado,
nada en `title` (R36). Retroceder sigue sin diálogo (R11).
**Depende de:** T14, T16 (las dos tocan `order-execution-screen.tsx`: van en serie).

### T18 [ ] [P] — Confirmación en la lista
**Toca:** `lib/shared/routes.ts`, `app/(private)/asignacion/page.tsx`,
`app/(private)/asignacion/components/assigned-order-cancelled-notice.tsx`,
`app/(private)/asignacion/components/index.ts`,
`tests/unit/asignaciones-ui/assigned-orders-cancelled-notice.test.tsx`,
`tests/unit/recetas-ui/recipe-route-contract.test.ts`
**Hacer:** `CANCELLED_ORDER_PARAM` y el aviso gemelo del de entrega, pintado junto a él, **encima** de
las pestañas de vista (`design.md > 6.4`). La constante entra en la lista exacta de
`recipe-route-contract.test.ts` con nota fechada; su valor no alude al asistente.
**Hecho cuando:** test: con `?<param>=2026-0000007` la lista enseña «Pedido 2026-0000007 cancelado» con
`role="status"`, en cualquier vista (R25); sin el parámetro, nada. `recipe-route-contract`,
`guard-pantallas-exigen-permiso` y `guard-rutas-privadas-cubiertas` verdes.
**Depende de:** nada.

---

## Bloque F — Pruebas de extremo a extremo y cierre

### T19 [ ] — Atomicidad y carrera, contra Postgres
**Toca:** `tests/integration/asignaciones/execution-atomicity.int.test.ts`,
`tests/integration/aislamiento.json`
**Hacer:** con la composición real (o los adaptadores reales cableados igual, incluida
`joinOrderUnitOfWork`), contra `QuimiCloude_QC82`: forzar que el `append` falle dentro de `run` (una
posición 0 que el `CHECK` rechaza) y comprobar el pedido y el inventario.
**Hecho cuando:** arrancar con `append` fallido deja el pedido en `PENDIENTE` y cero filas; **abrir un
`BLOQUEADO` deja cero filas y el estado igual (R44)**; finalizar con `append` fallido lo deja
`EN_CURSO`, **sin** consumo de material y **sin** las filas de responsable de empacador que había creado
(R24, compensación);
**finalizar con material insuficiente** no deja anotación, ni consumo, ni cambio de estado (R24);
cancelar con `append` fallido lo deja `EN_CURSO`, con `cancellation_reason` a `NULL` y **las reservas
intactas** (R24); cancelar con éxito deja `orders.cancellation_reason` **igual** a `reason` de la fila
(R23) y **todas** las reservas del pedido liberadas, con quien canceló como autor, sin ningún
movimiento de consumo ni de baja de material (R29); dos
`startAssignedOrder` concurrentes sobre un `PENDIENTE` dejan **un** `START` y **un** `RESUME` (R16); un
`recordStepMove` sobre un `ENTREGADO` no escribe (R20).
**A3, tres casos más, y son los que hacen que R24 sea de ocho y no de seis:** (a) **comenzar empaque**
con `append` fallido deja el pedido en `POR_EMPACAR` y cero filas, y **no** escribe `packed_by`; (b)
**terminar empaque** con `append` fallido lo deja en `EN_EMPAQUE`, **no** escribe `finished_at`, **no**
deja ningún lote de producto terminado ni consumo de envases (R24, R41; **[2026-10-06]** lo que
Terminar escribe desde QC-195); (b') **terminar empaque con envases insuficientes** no deja anotación
ni nada de lo anterior —es el caso en que `createFinishPacking` atrapa dentro de la unidad **unida** y
devuelve un valor— (R24); (c) **Comenzar con `already_mine` deja cero filas nuevas y el estado donde
estaba** (R41, ⚑ según P1). Y el
control de que **comenzar** y **terminar** con `append` bueno dejan **una** fila `PACK_START` /
`PACK_FINISH` **con `step_position` a `NULL`** (R41, R5bis). Con eso se comprueba también, sin decirlo
en otra task, que la anotación del empaque comparte transacción con el cambio de estado: si el packing
se atara al `prisma` global, (a) y (b) pasarían **con la fila escrita y el estado sin cambiar**, que es
justo el fallo que R24 prohíbe.
Entrada `commit` en `aislamiento.json` con `motivo` y `desde`. Cada caso limpia lo suyo, anotaciones
antes que pedidos (y lotes de producto terminado antes que productos, como hacen las E2E de empaque).
**Depende de:** T13, T25, T26.

### T20 [ ] — E2E
**Toca:** `e2e/registro-ejecucion.spec.ts`
**Hacer:** usar `e2e/helpers/landing.ts` para entrar (lo exige `guard-e2e-landing`). Fixtures: dos
pedidos asignados al **Operador** (no tiene `pedidos.consultar`, así que puede ser responsable) sobre
una receta de al menos tres pasos. La limpieza borra `orderExecutionEntry` de su empresa **antes** que
los pedidos. Contra `QuimiCloude_QC82` y **sin otra E2E corriendo en la máquina**.
**Hecho cuando:** (a) el Operador abre el primero, marca y avanza dos pasos, **recarga** y ve «Paso 3
de N», y la base tiene una sola fila `RESUME` de esa recarga (R39); (b) cancela el segundo con un
motivo, vuelve a la lista con la confirmación, y el pedido queda `CANCELADO` con **ese** motivo,
comprobado en la base (R40). Salida de Playwright (Chromium y WebKit) pegada en `progress/impl_…`.
`guard-e2e-landing` verde.
**A6, y es una aclaración, no trabajo nuevo:** esta E2E **no** finaliza ningún pedido, así que **no**
cambia por el `POR_EMPACAR`. La E2E que sí finaliza es la de **QC-168** (`e2e/empaque.spec.ts`), y ya
espera `POR_EMPACAR` desde antes de esta ficha: es una **premisa cumplida** (R43c), no un entregable
nuestro. Lo único que hace QC-82 por ella es la limpieza de T23.
**Depende de:** T16, T17, T18.

### T21 [ ] [P] — Las enmiendas a QC-63, por escrito
**Toca:** `specs/QC-63-ejecutar-receta-operador/requirements.md` (solo una nota al pie)
**Hacer:** nota fechada: R10 queda enmendada por QC-82 R38 y R18 por QC-82 R37 (que se suma a la
tensión de QC-125). **No** se reescriben R10 ni R18.
**Hecho cuando:** la nota existe y no hay ningún otro cambio en ese archivo (`git diff` lo muestra).
**Depende de:** nada.

### T23 [ ] — Las limpiezas de las E2E existentes
**Toca:** las E2E cuya limpieza borra pedidos **después** de abrir la pantalla de ejecución, y las dos
que A3 vuelve a anotar.
**Hacer:** confirmar una a una si abre `assignedOrderRoute(...)`; en las que sí, borrar
`orderExecutionEntry` de su empresa antes de `order.deleteMany`. Nada más en esos archivos.
**Candidatas medidas el 2026-09-24** (a reconfirmar): `e2e/ejecucion-receta.spec.ts`,
`e2e/reserva-de-material.spec.ts`, `e2e/recetas-porcentaje.spec.ts`, `e2e/pedidos-terminados.spec.ts`,
`e2e/pedidos-asignados.spec.ts`.
**Candidatas añadidas el 2026-09-26**, que las de arriba no incluían y que A3 **obliga** a arreglar:
- **`e2e/empaque.spec.ts`** (de QC-168): llama a las dos Server Actions de empaque, que desde A3 anotan
  ⇒ borra `orderExecutionEntry` antes de `order.deleteMany`.
- **`e2e/producto-terminado.spec.ts`** (de QC-150): abre `assignedOrderRoute`, o sea que **anota**, y
  luego hace `order.deleteMany`.
- **`e2e/recetas-pasos.spec.ts`: fuera de la lista.** El 2026-09-24 quedó con la duda de si abría la
  pantalla; la medida de este día dice que **no** la abre y **no** necesita limpieza. Queda aquí escrito
  para que nadie la vuelva a añadir.
**Candidatas añadidas el 2026-10-06** (entraron después y navegan a `assignedOrderRoute` o
`packingOrderRoute`): **`e2e/envases-del-pedido.spec.ts`** (QC-195), **`e2e/pasos-de-envasado.spec.ts`**
(QC-211, Comenzar y Terminar desde el paso a paso) y **`e2e/pedido-en-varias-presentaciones.spec.ts`**
(QC-170). **A reconfirmar**, sin navegación directa encontrada pero con `order.deleteMany`:
`e2e/pedido-bloqueado.spec.ts`, `e2e/pedido-conversion-de-unidad.spec.ts`,
`e2e/versiones-de-receta.spec.ts`.
**Hecho cuando:** las E2E tocadas pasan contra `QuimiCloude_QC82`, **una a una y sin otra E2E
corriendo**, y la lista de las confirmadas, añadidas y descartadas queda en `progress/impl_…`.
**Depende de:** T13, T16, T25 (sin las anotaciones del empaque, la limpieza de las dos nuevas no
falla y no se puede ver).

### T24 [ ] — La migración sigue siendo la última
_2026-10-06: hoy la última de `dev` es `20261006120000_inventory_imports`._
**Toca:** la carpeta de la migración (solo su nombre, si hace falta)
**Hacer:** justo antes del PR, contra `origin/dev`: si `dev` trajo una migración con timestamp mayor,
renombrar la de esta ficha con uno posterior, aplicar `db:rollback` + `db:migrate` sobre
`QuimiCloude_QC82` y regenerar la plantilla de integración.
**Hecho cuando:** la carpeta es la última de `db/migrations/` por orden de nombre y el test de T1 lo
afirma en verde.
**Depende de:** T1; se repite en cada sincronización con `dev`.

### T25 [ ] [P] — `startPacking` y `finishPacking` anotan
**Toca:** `lib/modules/asignaciones/domain/start-packing.ts`,
`lib/modules/asignaciones/domain/finish-packing.ts`,
`tests/unit/asignaciones/start-packing.test.ts`,
`tests/unit/asignaciones/finish-packing.test.ts`
**Hacer:** `design.md > 3.3` y `## 4`. Solo **deps**: los dos ganan `log` y `transaction`. **No** se
toca la autorización (sigue siendo `requirePermission(actor, 'empaque.modificar')` en la primera línea,
A4/R42), ni el nombre de los desenlaces, ni la traducción de errores: todo eso es de QC-168 y ya está.
**No** se añade comprobación de responsable: no la tienen (`start-packing.ts:3-5`,
`finish-packing.ts:3-6`) y R42 prohíbe añadirla. Dentro de `run`: `packing.startPackingAliveById(...)`
o `packing.finishPackingAliveById(...)`; con el predicado de T6, si el desenlace **no es un éxito**,
lanza `ExecutionAbortedError` y fuera se traduce como hoy; **solo en Comenzar**, `already_mine` sale
**sin anotar** y sin abortar (⚑ P1); si es éxito —`'ok'` en Comenzar, **`{ kind: 'ok', finishedGoods }`
en Terminar**—, `log.append({ action: 'pack_start' | 'pack_finish', stepPosition: null, … })`. En
Terminar, el número del pedido se sigue leyendo **antes** y **fuera** de `run`. **El `packing` que
reciben es el atado a `tx`** dentro de `executionTransaction` (`design.md > 4`), no el `orderCatalog`
global.
**Hecho cuando:** tests, **tensados con nota fechada y sin aflojar ninguna aserción previa**: (a) sin
`empaque.modificar` rechaza **sin llamar a ningún doble** y **sin** abrir la transacción (R42, A4);
(b) **ni `asignaciones.consultar` ni `asignaciones.ejecutar` bastan** (R42); (c) **[2026-10-06,
corregido]** otra empresa ⇒ la misma respuesta que inexistente, y un actor con `empaque.modificar`
**no asignado** al pedido **sí** empaca y **sí** anota —el (c) del 2026-09-26 pedía lo contrario y el
código nunca lo hizo— (R42); (d) un **éxito** deja **una** fila con su acción, **sin `reason`** (R8) y
**`step_position` a `NULL`** (R5bis, R41); en Terminar, el éxito es el **objeto**, con una mutación que
compara con `'ok'` y lo pone rojo (R24); (e) **`already_mine` de Comenzar deja cero filas** ⚑ (R41, P1),
con su mutación que lo pone a uno en rojo; (f) cualquier otro desenlace sale **sin** fila y con el
mismo error que hoy (R24); (g) si `append` lanza, el error sale **desde dentro** de `run` (R24). Los
tests de **permisos** de QC-168 siguen verdes **sin tocarlos**.
**Depende de:** T6, T7. En paralelo con T8–T11; y **T12** la necesita, porque son los consumidores de
las deps.

### T26 [ ] [P] — `pedidos`: Comenzar empaque sobre un cliente dado (nueva el 2026-10-06, ⚑ P5)
**Toca:** `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`,
`tests/integration/pedidos/order-packing.int.test.ts`
**Hacer:** `design.md > 4` y `> 14.1 P5`. Extraer el cuerpo de `startPackingAliveOrder` (las tres
sentencias de hoy: `SELECT … FOR UPDATE`, conteo del reparto, `UPDATE`; `order-prisma.ts:921-…`) a
`createOrderPackingRepository(db: PrismaLike = prisma): OrderPackingRepository`, que las corre sobre
`db` **sin abrir** transacción; `startPackingAliveOrder` conserva su firma y pasa a abrir su
`prisma.$transaction` y delegar en la fábrica. `scope` sigue siendo el último parámetro. **Ningún**
puerto ni dominio de `pedidos` cambia; el cableado del `orderCatalog` global **no** cambia. Si el humano
contesta la P5 con la alternativa (`design.md > 10.15`), esta tarea se reescribe antes de empezarla.
**Hecho cuando:** los tests existentes de `order-packing.int.test.ts` y `tests/unit/pedidos/order-packing.test.ts`
pasan **sin tocarlos**; caso nuevo: la fábrica sobre un `tx` abierto por el test mueve la fila a
`EN_EMPAQUE` y un `ROLLBACK` de ese `tx` la devuelve a `POR_EMPACAR` (R24, R42);
`guard-ambito-empresa-pedidos` verde (la función nueva entra en su barrido) y `guard-arquitectura-modulos`
verde.
**Depende de:** nada; la P5 respondida.

### T22 [ ] — Cierre
**Toca:** `progress/impl_QC-82-registro-de-ejecucion-de-receta.md`
**Hacer:** el mapa `R1…R44 → test` completo (⚑ `R5bis`, `R41`–`R43` y **`R44`** incluidos), tomado del
mapa de `design.md > 14.2` (rehecho el 2026-10-06 por archivo de test); las mutaciones de T1, T3, T5,
T8, T11, T12 y T25 anotadas con su rojo; `./init.sh` completo **con `DATABASE_URL` y `DIRECT_URL`
apuntando a `QuimiCloude_QC82`**.
**Hecho cuando:** **los 44** requisitos tienen su test, más `R5bis` (45); `./init.sh` termina en verde (o
solo con los rojos ya presentes en
`tests/baseline-rojos.json`); ningún archivo de `tests/guards/` quedó más laxo que en `origin/dev`
(revisado por diff); `order-catalog-prisma.ts`, `order-packing.ts`, `order-packing-repository.ts`,
`order-state.ts`, `order-catalog.ts`, `package.json` y `docs/dependencias.md` fuera del diff, y de
`order-prisma.ts` **solo** la fábrica de T26 (revisión 2026-10-06); `guard-dependencias-aprobadas` verde
(R35).
**Depende de:** todas.

---

## Orden y paralelismo, de un vistazo

```
T1 ─ T2                     (T1 espera P2 respondida)
T3 ─┬─ T6 ─┬─ T7 ───────────────────────┐
    │      ├─ T8 ──┐  (P3)               │
    │      ├─ T9 ──┼─ T12 ───────────────┼─ T13 ─┬─ T5
    │      └─ T10 ─ T11 ┘ (P3)           │       ├─ T19 ─┐
    │      └─ T25 ─────┘                 │       └─ T14 ─ T16 ─ T17 ─┐   (T25 entra en T12 y en T13)
    └────────────────────────────────────┘                          ├─ T20 ─ T22
T26 (P5) ───────────────────────────────────── (T13, T5, T19)        │
T18 ──────────────────────────────────────────────┘ (T14)            │
T15 ─────────────────────────────────────────────────── (T16)        │
T13 + T16 + T25 ─ T23 ───────────────────────────────────────────────┘
T21 (cuando sea)        T24 (antes de cada PR)
```

**Lo que cambió el 2026-10-06 en este diagrama:** entra **T26** (`[P]`, sin dependencias de código,
espera la P5), que necesitan T5, T13 y T19; **T6 ya no depende de T25**; T8, T9 y T12 esperan la P3.

**Lo que cambió el 2026-09-26 en este diagrama:** entra **T25** (nueva, `[P]`, depende de T6 y T7), y
**T6 ahora depende también de T25** por el tipo `OrderPacking` del barril de `pedidos` _(retirado el
2026-10-06: ese tipo no existe)_; **T12** y **T13** la necesitan; **T19** y **T23** también. El resto de
las flechas es el mismo.
