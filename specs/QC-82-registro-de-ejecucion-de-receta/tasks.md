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
`db/migrations/`** (hoy **`20260925120100_packing_permission`**, no `20260924120000_customers`).
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
**Hecho cuando:** tests: `isCancellableStatus` en los **seis** estados —los dos cancelables en `true` y
**`POR_EMPACAR` y `EN_EMPAQUE` en `false`** (A5, R43)—; `createCancelAliveOrder` con una unidad de
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
más —ni `prisma`, ni `orderUnitOfWork`, ni el global—.
**Hecho cuando:** la guardia sigue verde **y muerde**: (a) quitar `companyId` del ámbito en
`cancelInsideTransaction` la pone roja; (b) cablear `createCancelAliveOrder` con otra unidad de trabajo
en la composición la pone roja; (c) **[nuevo]** atar `createOrderPackingRepository` al `prisma` global
en vez de a `tx` la pone roja. Se restaura desde copia y las mutaciones quedan en `progress/impl_…`.
**Depende de:** T3, T13.

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
OrderCancellation` y **`ExecutionWriters.packing: OrderPacking`** (A3); `NotCancellableError` con `code =
'not_cancellable'`.
**Hecho cuando:** test de tipos: una entrada `cancel` sin `reason` y una `advance` con `reason` **no
compilan** (`@ts-expect-error`) (R8); una entrada `pack_start` **con** `stepPosition` numérico tampoco
compila, y con `null` sí (R5bis); el mapa al enum es **total sobre las ocho**, con un caso por valor
(R1); el puerto del registro no declara `update`, `delete` ni nada parecido (R31);
`guard-catalogo-de-errores` verde.
**Depende de:** T3 (el tipo `OrderCancellation`), T25 (el tipo `OrderPacking` se publica desde el barril
de `pedidos`; si T25 va antes que T6, esta dependencia se invierte).

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
**Hacer:** prólogo de QC-63; solo `EN_CURSO`; un `append` con la posición del paso de llegada. **`order-state.ts`
no se toca**: QC-168 ya le puso las claves de `POR_EMPACAR` y `EN_EMPAQUE` con `order_produced_frozen`.
Lo que se comprueba aquí es que `recordStepMove` **usa** esa fila (A2, R43).
**Hecho cuando:** tests: sin permiso rechaza **sin llamar a ningún doble** (R26); no asignado y otra
empresa, misma respuesta que inexistente (R27); la empresa sale del actor y el esquema estricto rechaza
un `companyId` en la entrada (R28); `advance` y `go_back` escriben su acción con la posición recibida
(R17, R18); `ENTREGADO`, `CANCELADO`, `POR_EMPACAR`, `EN_EMPAQUE` y `PENDIENTE` no escriben, y los **dos
nuevos** lo hacen con **`order_produced_frozen`** (R20, R43, A2).
**Depende de:** T6.

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
desde dentro de `run` (R24); lo puede hacer un responsable que no arrancó, también con los permisos del
Empacador (R27); el actor no necesita `pedidos.modificar` ni `asignaciones.modificar` (R30).
**Depende de:** T6.

### T10 [ ] — `startAssignedOrder`: arrancar y retomar
**Toca:** `lib/modules/asignaciones/domain/start-assigned-order.ts`,
`lib/modules/asignaciones/domain/assigned-order-execution-view.ts`,
`tests/unit/asignaciones/start-assigned-order.test.ts`
**Hacer:** `design.md > 3.3`. Lee la vista antes de escribir. `PENDIENTE`: transición + `start` en
`run`; **todo desenlace que no sea un éxito** lanza `ExecutionAbortedError` —⚑ y «éxito» son las **dos**
formas, `'ok'` y `{ kind: 'ok', finishedGoods }` (QC-150)—; fuera, `'stale'` relee y sigue.
`EN_CURSO`: `findLastStepPosition` → `append(resume)`, y si falla, lanza. Devuelve
`StartedOrderExecution` con `status: 'EN_CURSO'`. Tensar el `describe` de QC-63 R9 con **nota fechada**:
sigue afirmando que `transitionAliveById` no se llama **y además** que se escribe exactamente un
`resume`.
**Hecho cuando:** tests: `PENDIENTE` ⇒ un `start` con posición 1 **dentro** de `run` (R12); receta sin
pasos ⇒ posición `null` (R5); `EN_CURSO` con última posición 3 ⇒ `resume` con 3 y vista con 3 (R13);
sin anotaciones ⇒ 1 (R14); si `append(resume)` lanza, `startAssignedOrder` lanza (R15); `'stale'` ⇒ cero
`start` y un `resume` (R16); prólogo intacto (R26); **[nuevo] los dos desenlaces de éxito** —`'ok'` y el
objeto— producen el mismo `append`, y cualquiera de los otros aborta (R24).
**Depende de:** T6.

### T11 [ ] — `finishAssignedOrder`: finalizar
**Toca:** `lib/modules/asignaciones/domain/finish-assigned-order.ts`,
`tests/unit/asignaciones/finish-assigned-order.test.ts`
**Hacer:** entrada `{ orderId, stepPosition }` (estricta); transición a **`POR_EMPACAR`** (**A1** — el
código de `dev` ya lo pide así, y `finished_at` **no** se escribe aquí: lo escribiría terminar empaque)
+ `finish` en `run`; **todo desenlace que no sea un éxito** lanza `ExecutionAbortedError` y fuera se
traduce como hoy (`stale` relee en el `for(;;)` que ya tiene, `insufficient_material`,
`recipe_without_lines`, **`presentation_without_content`**, **`no_whole_package`**,
**`recipe_not_found`**, `not_found`). Tensar el caso de QC-63 R16 con **nota fechada**: la entrada gana
`stepPosition` y **sigue** rechazando cualquier dato de marcado.
**Hecho cuando:** tests: un `finish` con la posición recibida y el mismo `now` que la transición, y el
destino de la transición es **`'POR_EMPACAR'`, no `'ENTREGADO'`** —con su **mutación** que lo pone a
`ENTREGADO` en rojo (R21, A1)—; los **cinco** rechazos de material y receta ⇒ su error, **cero** `append`,
lanzado desde dentro de `run` (R24); si `append` lanza, se propaga desde dentro de `run` (R24); un campo
de marcado sigue siendo `invalid_input`; los **dos** desenlaces de éxito, `'ok'` y `{ kind: 'ok',
finishedGoods }`, anotan igual y ninguno de los otros aborta (R24).
**Depende de:** T6. En serie con T10 (las dos cambian las deps que consume T12).

### T12 [ ] — El contrato del módulo, su lista cerrada y los consumidores de las deps
**Toca:** `lib/modules/asignaciones/index.ts`, `tests/unit/asignaciones/module-contract.test.ts`,
`tests/unit/asignaciones/empacador-authorization.test.ts`,
`tests/integration/asignaciones/responsible-eligibility.int.test.ts`,
`tests/integration/asignaciones/finished-orders.int.test.ts`
**Hacer:** publicar `createCancelAssignedOrder`, `createRecordStepMove`, sus `*Deps`, `ExecutionAction`,
`StartedOrderExecution`, `NotCancellableError` y los tipos de los puertos que `lib/composition` nombra
(solo tipos). Añadir los dos archivos nuevos a `CASOS_DE_USO_QC63` con nota fechada. **Los dos archivos de
empaque de QC-168 no se añaden a esa lista** (A4, R42: no nombran `asignaciones.consultar`) **y no se
crea una lista nueva**; lo que sí hay que comprobar es que `start-packing.ts` y `finish-packing.ts`
sigan exigiendo `empaque.modificar` en la primera línea, y eso lo dice su propio test. Dar `log` y
`transaction` a quien construye `start`/`finish` **y a quien construye `startPacking`/`finishPacking`**
(A3): en `empacador-authorization`, dobles —**sin** construir los de empaque, que hoy no aparecen ahí—;
en las dos integraciones (modo `transaccion`), el registro real sobre el `tx` del test y un
`transaction` de test cuyo `run` llama a `work` con los escritores atados a ese mismo `tx`, **sin**
`$transaction` (`design.md > 7`). Las aserciones de esos tres archivos no cambian.
**Hecho cuando:** `module-contract` verde **y muerde**: quitar uno de los dos archivos de la lista lo
pone rojo; **`start-packing.ts` o `finish-packing.ts` fuera de la lista sigue verde, y poner
`asignaciones.consultar` en cualquiera de los dos la pone rojo** (R42, A4); el cierre de imports del
barril sigue sin `next/*`, `@prisma/client` ni `'use server'`; los tres archivos de tests tocados,
verdes contra `QuimiCloude_QC82`.
**Depende de:** T8, T9, T10, T11, T25.

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
**A3, y son tres reglas, no una.** (a) `orderTransactionScopeOn(tx)` devuelve **`orders`, `reservations`,
`recipes` y `finishedGoods`**: los cuatro de hoy, y **ni uno más**; no se amplía para el empaque. (b)
`executionTransaction` añade `packing: createOrderPackingRepository(tx)` —ata a `tx`, no al
`orderUnitOfWork` ni al `prisma` global (`design.md > 10.12`)—, y ese `packing` **no sale** de
`executionTransaction`. (c) El predicado de éxito es **uno solo**, con las **dos** formas que QC-150
dejó (`'ok'` y el objeto), porque un `!== 'ok'` a mano abortaría un éxito.
**Hecho cuando:** `pnpm run typecheck` verde; `guard-ambito-empresa-pedidos` y
`guard-arquitectura-modulos` verdes; los tests de `pedidos` que ejercitan `orderUnitOfWork` siguen
verdes sin tocarlos; **el ámbito tiene cuatro miembros y el test cuenta cuatro**, con mutación que quita
`finishedGoods` y la pone roja; **`createOrderPackingRepository` recibe `tx`**, y cablearlo con `prisma`
pone la guardia de T5 en rojo.
**Nota de la revisión del 2026-09-26:** el «**parar y avisar al leader**» del 2026-09-24 queda
resuelto —QC-150 **ya está** en `dev` y el bloque de `orderUnitOfWork` tiene los cuatro miembros—, así
que **no hay que parar**: hay que copiar la forma que hay, no la que había. Lo que sí hay que volver a
comprobar antes del PR es `origin/dev` (`design.md > 2.2`).
**Depende de:** T3, T7, T12, T25.

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
`onStepChange` (`design.md > 6.1`), en los dos `mode`. **No** se toca ningún otro archivo de
`components/shared/step-reader/` ni el caso R18 de `order-execution-screen.test.tsx`, que ya admite este
archivo.
**Hecho cuando:** los casos existentes pasan **sin tocarlos**; casos nuevos, en `lectura` y en
`ejecucion`: empieza en la posición 3 (R13), recorta 9 a la última (R14), Siguiente avisa `{ advance, 2
}` y Anterior `{ go_back, 1 }` (R17, R18), Anterior en el paso 1 no avisa, empezar en el paso 3 no mueve
el foco en `ejecucion`; el test de fuente de QC-64 y el caso R18 de QC-63 siguen verdes (R37).
**Depende de:** nada.

### T16 [ ] — La pantalla anota los pasos
**Toca:** `app/(private)/asignacion/[id]/components/order-execution-screen.tsx`,
`tests/unit/asignaciones-ui/order-execution-step-log.test.tsx`,
`tests/unit/asignaciones-ui/order-execution-screen.test.tsx` (solo el mock y el fixture)
**Hacer:** `StartedOrderExecution`, `initialStepPosition`, posición en estado, cadena de promesas para
`recordStepMoveAction`, `stepPosition` en el formulario de Finalizar (`design.md > 6.2`). En el test
existente, el mock gana las dos acciones nuevas y el fixture `resumeStepPosition`.
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
**Hecho cuando:** arrancar con `append` fallido deja el pedido en `PENDIENTE` y cero filas; finalizar
con `append` fallido lo deja `EN_CURSO`, **sin** `finished_at` y **sin** consumo de material;
**finalizar con material insuficiente** no deja anotación, ni consumo, ni cambio de estado (R24);
cancelar con `append` fallido lo deja `EN_CURSO`, con `cancellation_reason` a `NULL` y **las reservas
intactas** (R24); cancelar con éxito deja `orders.cancellation_reason` **igual** a `reason` de la fila
(R23) y **todas** las reservas del pedido liberadas, con quien canceló como autor, sin ningún
movimiento de consumo ni de baja de material (R29); dos
`startAssignedOrder` concurrentes sobre un `PENDIENTE` dejan **un** `START` y **un** `RESUME` (R16); un
`recordStepMove` sobre un `ENTREGADO` no escribe (R20).
**A3, tres casos más, y son los que hacen que R24 sea de ocho y no de seis:** (a) **comenzar empaque**
con `append` fallido deja el pedido en `POR_EMPACAR` y cero filas, y **no** escribe `packed_by`; (b)
**terminar empaque** con `append` fallido lo deja en `EN_EMPAQUE` y **no** escribe `finished_at` (R24,
R41); (c) **`already_mine` deja cero filas nuevas y el estado donde estaba** (R41, ⚑ según P1). Y el
control de que **comenzar** y **terminar** con `append` bueno dejan **una** fila `PACK_START` /
`PACK_FINISH` **con `step_position` a `NULL`** (R41, R5bis). Con eso se comprueba también, sin decirlo
en otra task, que la anotación del empaque comparte transacción con el cambio de estado: si el packing
se atara al `prisma` global, (a) y (b) pasarían **con la fila escrita y el estado sin cambiar**, que es
justo el fallo que R24 prohíbe.
Entrada `commit` en `aislamiento.json` con `motivo` y `desde`. Cada caso limpia lo suyo, anotaciones
antes que pedidos.
**Depende de:** T13, T25.

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
**Hecho cuando:** las E2E tocadas pasan contra `QuimiCloude_QC82`, **una a una y sin otra E2E
corriendo**, y la lista de las confirmadas, añadidas y descartadas queda en `progress/impl_…`.
**Depende de:** T13, T16, T25 (sin las anotaciones del empaque, la limpieza de las dos nuevas no
falla y no se puede ver).

### T24 [ ] — La migración sigue siendo la última
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
A4/R42), ni la comprobación de responsable, ni el nombre de los desenlaces, ni la traducción de
errores: todo eso es de QC-168 y ya está. Dentro de `run`: `packing.startPackingAliveById(...)` o
`packing.finishPackingAliveById(...)`; si el desenlace **no es un éxito**, lanza `ExecutionAbortedError`;
si es **`already_mine`**, sale **sin anotar** (⚑ P1 de `design.md > 14.1`); si es éxito,
`log.append({ action: 'pack_start' | 'pack_finish', stepPosition: null, reason: undefined, … })`.
**El `packing` que reciben es el atado a `tx`** dentro de `executionTransaction` (`design.md > 4`), no un
`orderUnitOfWork` y no el `orderCatalog` global.
**Hecho cuando:** tests, **tensados con nota fechada y sin aflojar ninguna aserción previa**: (a) sin
`empaque.modificar` rechaza **sin llamar a ningún doble** y **sin** abrir la transacción (R42, A4);
(b) **`asignaciones.consultar` no basta** —un actor con ese permiso y sin `empaque.modificar` también
rechaza— (R42); (c) no asignado y otra empresa, misma respuesta que inexistente (R27, `D20`); (d) un
**éxito** deja **una** fila con su acción, **sin `reason`** (R8) y **`step_position` a `NULL`** (R5bis,
R41); (e) **`already_mine` deja cero filas** ⚑ (R41, P1), con su mutación que lo pone a uno en rojo;
(f) cualquier otro desenlace sale **sin** fila (R24); (g) si `append` lanza, el error sale **desde
dentro** de `run` (R24). Los tests de **permisos** de QC-168 siguen verdes **sin tocarlos**.
**Depende de:** T6, T7. En paralelo con T8–T11; y **T12** la necesita, porque son los consumidores de
las deps.

### T22 [ ] — Cierre
**Toca:** `progress/impl_QC-82-registro-de-ejecucion-de-receta.md`
**Hacer:** el mapa `R1…R43 → test` completo (⚑ `R5bis` y `R41`–`R43` incluidos), tomado del mapa de
`design.md > 14.2`; las mutaciones de T1, T5 y T12 anotadas con su rojo; `./init.sh` completo **con
`DATABASE_URL` y `DIRECT_URL` apuntando a `QuimiCloude_QC82`**.
**Hecho cuando:** **los 43** requisitos tienen su test, más `R5bis`; `./init.sh` termina en verde (o
solo con los rojos ya presentes en
`tests/baseline-rojos.json`); ningún archivo de `tests/guards/` quedó más laxo que en `origin/dev`
(revisado por diff); `order-prisma.ts`, `order-catalog-prisma.ts`, `order-packing.ts`,
`order-packing-repository.ts`, `order-state.ts`, `package.json` y
`docs/dependencias.md` fuera del diff y `guard-dependencias-aprobadas` verde (R35).
**Depende de:** todas.

---

## Orden y paralelismo, de un vistazo

```
T1 ─ T2                     (T1 espera P1 y P2 respondidas)
T3 ─┬─ T6 ─┬─ T7 ───────────────────────┐
    │      ├─ T8 ──┐                     │
    │      ├─ T9 ──┼─ T12 ───────────────┼─ T13 ─┬─ T5
    │      └─ T10 ─ T11 ┘                │       ├─ T19 ─┐
    │      └─ T25 ─────┘                 │       └─ T14 ─ T16 ─ T17 ─┐   (T25 entra en T12 y en T13)
    └────────────────────────────────────┘                          ├─ T20 ─ T22
T18 ──────────────────────────────────────────────┘ (T14)            │
T15 ─────────────────────────────────────────────────── (T16)        │
T13 + T16 + T25 ─ T23 ───────────────────────────────────────────────┘
T21 (cuando sea)        T24 (antes de cada PR)
```

**Lo que cambió el 2026-09-26 en este diagrama:** entra **T25** (nueva, `[P]`, depende de T6 y T7), y
**T6 ahora depende también de T25** por el tipo `OrderPacking` del barril de `pedidos`; **T12** y **T13**
la necesitan; **T19** y **T23** también. El resto de las flechas es el mismo.
