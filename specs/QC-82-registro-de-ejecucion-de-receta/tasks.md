# QC-82 — registro-de-ejecucion-de-receta · tasks.md

> **Revisado el 2026-09-24** contra `dev` (merge `9634f6ae`); qué cambió y por qué en
> `design.md > Revisión 2026-09-24`. T4 se retira; T5 cambia de contenido; nacen T23 y T24.
>
> **Antes de T1**: los ocho puntos de F1.4 (`design.md > 12`) quedaron ratificados con el spec. Hay
> **dos preguntas abiertas nuevas** (`requirements.md > Preguntas abiertas`): las tasks marcadas
> **⚑P1** o **⚑P2** no se cierran sin la respuesta del humano.
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
**Hacer:** `enum OrderExecutionAction` (seis valores) y `model OrderExecutionEntry` con
`/// @module asignaciones`, **sin** `@relation`, sin `created_at`/`updated_at`/`deleted_at`
(`design.md > 2.1`). `pnpm run db:migrate:create` **contra `QuimiCloude_QC82`**; el timestamp tiene que
ser **mayor que el de la última migración de `db/migrations/`** (hoy `20260924120000_customers`).
**Borrar a mano del SQL generado** todo `DROP CONSTRAINT`/`DROP INDEX` sobre tablas ajenas. Completar a
mano los dos `CHECK`, las dos FK compuestas, los dos índices y `ENABLE`+`FORCE ROW LEVEL SECURITY` **al
final**. `down.sql`: `DROP TABLE` sin `CASCADE` y `DROP TYPE`.
**Hecho cuando:** el test de esquema, leyendo el SQL, afirma: los seis valores y ninguno más (R1); la
lista **exacta** de columnas, ninguna con texto ni identificador del paso (R2, R4); una sola columna de
tiempo (R3); el `CHECK` del motivo con la forma literal de QC-34 (R8); el `CHECK` de posición (R5); las
dos FK compuestas contra `orders_id_company_id_key` y `users_id_company_id_key` (R6, R7); RLS activada y
forzada como últimas sentencias (R32); identificadores en inglés (R33); ninguna línea ejecutable sobre
una tabla preexistente ni ningún `INSERT` de permisos (R30); el `down.sql` revierte exactamente el UP
(R34); y que su carpeta es **la última** de `db/migrations/` por orden de nombre. Cada aserción con su
**mutación** que la pone roja. `db:migrate` → `db:rollback` → `db:migrate` sobre `QuimiCloude_QC82`,
con la salida pegada en `progress/impl_QC-82-registro-de-ejecucion-de-receta.md`; `prisma generate`.
`guard-rls-force`, `guard-empresa-en-esquema` y `guard-arquitectura-modulos` verdes.
**Depende de:** nada.

### T2 [ ] — Las restricciones, contra Postgres
**Toca:** `tests/integration/asignaciones/order-execution-entries-constraints.int.test.ts`,
`tests/integration/aislamiento.json`
**Hacer:** test en modo `transaccion` que inserte con SQL crudo y compruebe cada rechazo. Contra
`QuimiCloude_QC82`.
**Hecho cuando:** un caso por rechazo: acción fuera de las seis (R1); `CANCEL` sin motivo y `ADVANCE`
con motivo (R8); posición 0 (R5); pedido inexistente (R6); pedido de la empresa B con la fila de la A,
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
**Hecho cuando:** tests: `isCancellableStatus` en los cuatro estados; `createCancelAliveOrder` con una
unidad de trabajo doble devuelve `'ok'` (y llama a `cancelAlive`, `releaseForOrder` con el autor
recibido y `setReservedAt(null)`, en ese orden), `'not_found'` y `'not_cancellable'` **sin** llamar a
`cancelAlive` ni a `releaseForOrder` (R29); test de fuente: `cancel-order.ts` ya no declara su lista y
el módulo tiene **una** sola definición de «cancelable» y **una** sola llamada a `cancelAlive` fuera de
la caducidad diaria (R29). Los tests existentes de `cancelOrder` (unit e integración), **sin tocar**,
siguen verdes; `tests/unit/pedidos/module-contract.test.ts` y `authorization.test.ts` verdes.
**Depende de:** nada. **⚑P1** (si el humano no elige liberar todo, esta task cambia).

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
joinOrderUnitOfWork(tx) }`. Nada existente se afloja.
**Hecho cuando:** la guardia sigue verde **y muerde**: (a) quitar `companyId` del ámbito en
`cancelInsideTransaction` la pone roja; (b) cablear `createCancelAliveOrder` con otra unidad de trabajo
en la composición la pone roja. Se restaura desde copia y las mutaciones quedan en `progress/impl_…`.
**Depende de:** T3, T13.

---

## Bloque C — `asignaciones`: dominio, puertos y adaptadores

### T6 [ ] [P] — Tipos, puertos y errores
**Toca:** `lib/modules/asignaciones/domain/execution-entry.ts`,
`lib/modules/asignaciones/ports/execution-log-repository.ts`,
`lib/modules/asignaciones/ports/execution-transaction.ts`,
`lib/modules/asignaciones/domain/errors.ts`,
`tests/unit/asignaciones/execution-log-repository.test.ts`
**Hacer:** `NewExecutionEntry` con el motivo **solo** en la rama `cancel`; `ExecutionAbortedError`
interna (`design.md > 3.1`); los dos puertos de `design.md > 3.2`, con `ExecutionWriters.orders =
Pick<OrderCatalog, 'transitionAliveById'> & OrderCancellation`; `NotCancellableError` con `code =
'not_cancellable'`.
**Hecho cuando:** test de tipos: una entrada `cancel` sin `reason` y una `advance` con `reason` **no
compilan** (`@ts-expect-error`) (R8); el puerto del registro no declara `update`, `delete` ni nada
parecido (R31); `guard-catalogo-de-errores` verde.
**Depende de:** T3 (el tipo `OrderCancellation`).

### T7 [ ] — Los dos adaptadores driven
**Toca:** `lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma.ts`,
`lib/modules/asignaciones/adapters/driven/persistence/execution-transaction-prisma.ts`
**Hacer:** `createExecutionLogRepository(db = prisma)` con `append` (mapa total `ExecutionAction →` enum
de Prisma, `occurredAt` explícito) y `findLastStepPosition(companyId, orderId)`;
`withExecutionTransaction(run)` sobre `prisma.$transaction` con `maxWait: 10_000` y `timeout: 30_000`.
Ninguna sentencia de modificación ni de borrado en el archivo del registro.
**Hecho cuando:** los casos de T19 que ejercitan estos adaptadores pasan; test de fuente: el archivo del
registro no contiene `update`, `upsert` ni `delete` sobre el modelo (R31); `module-contract` (b) y
`guard-arquitectura-modulos` verdes.
**Depende de:** T1, T6.

### T8 [ ] [P] — `recordStepMove`
**Toca:** `lib/modules/asignaciones/domain/record-step-move.ts`,
`tests/unit/asignaciones/record-step-move.test.ts`
**Hacer:** prólogo de QC-63; solo `EN_CURSO`; un `append` con la posición del paso de llegada.
**Hecho cuando:** tests: sin permiso rechaza **sin llamar a ningún doble** (R26); no asignado y otra
empresa, misma respuesta que inexistente (R27); la empresa sale del actor y el esquema estricto rechaza
un `companyId` en la entrada (R28); `advance` y `go_back` escriben su acción con la posición recibida
(R17, R18); `ENTREGADO`, `CANCELADO` y `PENDIENTE` no escriben (R20).
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
Empacador (R27 ⚑P2); el actor no necesita `pedidos.modificar` ni `asignaciones.modificar` (R30).
**Depende de:** T6.

### T10 [ ] — `startAssignedOrder`: arrancar y retomar
**Toca:** `lib/modules/asignaciones/domain/start-assigned-order.ts`,
`lib/modules/asignaciones/domain/assigned-order-execution-view.ts`,
`tests/unit/asignaciones/start-assigned-order.test.ts`
**Hacer:** `design.md > 3.3`. Lee la vista antes de escribir. `PENDIENTE`: transición + `start` en
`run`; todo desenlace no `'ok'` lanza `ExecutionAbortedError`; fuera, `'stale'` relee y sigue.
`EN_CURSO`: `findLastStepPosition` → `append(resume)`, y si falla, lanza. Devuelve
`StartedOrderExecution` con `status: 'EN_CURSO'`. Tensar el `describe` de QC-63 R9 con **nota fechada**:
sigue afirmando que `transitionAliveById` no se llama **y además** que se escribe exactamente un
`resume`.
**Hecho cuando:** tests: `PENDIENTE` ⇒ un `start` con posición 1 **dentro** de `run` (R12); receta sin
pasos ⇒ posición `null` (R5); `EN_CURSO` con última posición 3 ⇒ `resume` con 3 y vista con 3 (R13);
sin anotaciones ⇒ 1 (R14); si `append(resume)` lanza, `startAssignedOrder` lanza (R15); `'stale'` ⇒ cero
`start` y un `resume` (R16); prólogo intacto (R26).
**Depende de:** T6.

### T11 [ ] — `finishAssignedOrder`: finalizar
**Toca:** `lib/modules/asignaciones/domain/finish-assigned-order.ts`,
`tests/unit/asignaciones/finish-assigned-order.test.ts`
**Hacer:** entrada `{ orderId, stepPosition }` (estricta); transición a `ENTREGADO` + `finish` en `run`;
todo desenlace no `'ok'` lanza `ExecutionAbortedError` y fuera se traduce como hoy (`stale` relee,
`insufficient_material`, `recipe_without_lines`, `not_found`). Tensar el caso de QC-63 R16 con **nota
fechada**: la entrada gana `stepPosition` y **sigue** rechazando cualquier dato de marcado.
**Hecho cuando:** tests: un `finish` con la posición recibida y el mismo `now` que la transición (R21);
`'insufficient_material'` y `'recipe_without_lines'` ⇒ su error, **cero** `append`, lanzado desde dentro
de `run` (R24); si `append` lanza, se propaga desde dentro de `run` (R24); un campo de marcado sigue
siendo `invalid_input`.
**Depende de:** T6. En serie con T10 (las dos cambian las deps que consume T12).

### T12 [ ] — El contrato del módulo, su lista cerrada y los consumidores de las deps
**Toca:** `lib/modules/asignaciones/index.ts`, `tests/unit/asignaciones/module-contract.test.ts`,
`tests/unit/asignaciones/empacador-authorization.test.ts`,
`tests/integration/asignaciones/responsible-eligibility.int.test.ts`,
`tests/integration/asignaciones/finished-orders.int.test.ts`
**Hacer:** publicar `createCancelAssignedOrder`, `createRecordStepMove`, sus `*Deps`, `ExecutionAction`,
`StartedOrderExecution`, `NotCancellableError` y los tipos de los puertos que `lib/composition` nombra
(solo tipos). Añadir los dos archivos nuevos a `CASOS_DE_USO_QC63` con nota fechada. Dar `log` y
`transaction` a quien construye `start`/`finish`: en `empacador-authorization`, dobles; en las dos
integraciones (modo `transaccion`), el registro real sobre el `tx` del test y un `transaction` de test
cuyo `run` llama a `work` con los escritores atados a ese mismo `tx`, **sin** `$transaction`
(`design.md > 7`). Las aserciones de esos tres archivos no cambian.
**Hecho cuando:** `module-contract` verde **y muerde**: quitar uno de los dos archivos de la lista lo
pone rojo; el cierre de imports del barril sigue sin `next/*`, `@prisma/client` ni `'use server'`; los
tres archivos de tests tocados, verdes contra `QuimiCloude_QC82`.
**Depende de:** T8, T9, T10, T11.

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
**Hecho cuando:** `pnpm run typecheck` verde; `guard-ambito-empresa-pedidos` y
`guard-arquitectura-modulos` verdes; los tests de `pedidos` que ejercitan `orderUnitOfWork` siguen
verdes sin tocarlos. **Parar y avisar al leader** si al abrir el archivo se ve que QC-150 ya cambió el
bloque de `orderUnitOfWork` en `dev`.
**Depende de:** T3, T7, T12.

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
(R23) y las reservas del pedido liberadas, con quien canceló como autor (R29 ⚑P1); dos
`startAssignedOrder` concurrentes sobre un `PENDIENTE` dejan **un** `START` y **un** `RESUME` (R16); un
`recordStepMove` sobre un `ENTREGADO` no escribe (R20). Entrada `commit` en `aislamiento.json` con
`motivo` y `desde`. Cada caso limpia lo suyo, anotaciones antes que pedidos.
**Depende de:** T13.

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
**Depende de:** T16, T17, T18.

### T21 [ ] [P] — Las enmiendas a QC-63, por escrito
**Toca:** `specs/QC-63-ejecutar-receta-operador/requirements.md` (solo una nota al pie)
**Hacer:** nota fechada: R10 queda enmendada por QC-82 R38 y R18 por QC-82 R37 (que se suma a la
tensión de QC-125). **No** se reescriben R10 ni R18.
**Hecho cuando:** la nota existe y no hay ningún otro cambio en ese archivo (`git diff` lo muestra).
**Depende de:** nada.

### T23 [ ] — Las limpiezas de las E2E existentes
**Toca:** las E2E cuya limpieza borra pedidos **después** de abrir la pantalla de ejecución. Candidatas
medidas el 2026-09-24: `e2e/ejecucion-receta.spec.ts`, `e2e/reserva-de-material.spec.ts`,
`e2e/recetas-porcentaje.spec.ts`, `e2e/pedidos-terminados.spec.ts`, `e2e/pedidos-asignados.spec.ts`, y
`e2e/recetas-pasos.spec.ts` si abre la pantalla.
**Hacer:** confirmar una a una si abre `assignedOrderRoute(...)`; en las que sí, borrar
`orderExecutionEntry` de su empresa antes de `order.deleteMany`. Nada más en esos archivos.
**Hecho cuando:** las E2E tocadas pasan contra `QuimiCloude_QC82`, **una a una y sin otra E2E
corriendo**, y la lista de las confirmadas y descartadas queda en `progress/impl_…`.
**Depende de:** T13, T16 (sin la pantalla anotando, la limpieza no falla y no se puede ver).

### T24 [ ] — La migración sigue siendo la última
**Toca:** la carpeta de la migración (solo su nombre, si hace falta)
**Hacer:** justo antes del PR, contra `origin/dev`: si `dev` trajo una migración con timestamp mayor,
renombrar la de esta ficha con uno posterior, aplicar `db:rollback` + `db:migrate` sobre
`QuimiCloude_QC82` y regenerar la plantilla de integración.
**Hecho cuando:** la carpeta es la última de `db/migrations/` por orden de nombre y el test de T1 lo
afirma en verde.
**Depende de:** T1; se repite en cada sincronización con `dev`.

### T22 [ ] — Cierre
**Toca:** `progress/impl_QC-82-registro-de-ejecucion-de-receta.md`
**Hacer:** el mapa `R1…R40 → test` completo; las mutaciones de T1, T5 y T12 anotadas con su rojo;
`./init.sh` completo **con `DATABASE_URL` y `DIRECT_URL` apuntando a `QuimiCloude_QC82`**.
**Hecho cuando:** los 40 requisitos tienen su test; P1 y P2 respondidas y sin ⚑ pendientes en
`requirements.md`; `./init.sh` termina en verde (o solo con los rojos ya presentes en
`tests/baseline-rojos.json`); ningún archivo de `tests/guards/` quedó más laxo que en `origin/dev`
(revisado por diff); `order-prisma.ts`, `order-catalog-prisma.ts`, `package.json` y
`docs/dependencias.md` fuera del diff y `guard-dependencias-aprobadas` verde (R35).
**Depende de:** todas.

---

## Orden y paralelismo, de un vistazo

```
T1 ─ T2
T3 ─┬─ T6 ─┬─ T7 ───────────────────────┐
    │      ├─ T8 ──┐                     │
    │      ├─ T9 ──┼─ T12 ───────────────┼─ T13 ─┬─ T5
    │      └─ T10 ─ T11 ┘                │       ├─ T19
    └────────────────────────────────────┘       └─ T14 ─ T16 ─ T17 ─┐
T18 ──────────────────────────────────────────────┘ (T14)            ├─ T20 ─ T22
T15 ─────────────────────────────────────────────────── (T16)        │
T13 + T16 ─ T23 ─────────────────────────────────────────────────────┘
T21 (cuando sea)        T24 (antes de cada PR)
```
