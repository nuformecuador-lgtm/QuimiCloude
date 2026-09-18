# QC-82 — registro-de-ejecucion-de-receta · tasks.md

> **Antes de T1**: el spec está en `spec_ready` y espera aprobación humana. Hay **ocho puntos para
> F1.4** (`design.md > 12`); las tasks que dependen de uno llevan **⚑ F1.4-n** y **no se empiezan**
> sin que el humano lo ratifique o lo cambie.
>
> `[P]` = paralelizable con las otras `[P]` de su mismo bloque. **Ninguna dependencia nueva**: si
> alguna task parece necesitarla, se **para** y se sube la propuesta con los cuatro checks.
>
> `docs/conventions.md > Comentarios`: en producción (`app/`, `lib/`, `components/`, `db/`) **ningún
> comentario cita ficha ni requisito**. En `tests/` y `e2e/`, `R<n>` **sí** va en el nombre del caso.
> Al tocar un archivo se limpian los comentarios **de las líneas que toca la rama**, no del archivo
> entero, y nunca se imita el estilo de alrededor.
>
> Cada tanda cierra con `./init.sh --rapido`; la feature, con `./init.sh` completo.

---

## Bloque A — La tabla

### T1 [ ] — Modelo, migración y `down.sql`
**Toca:** `db/schema.prisma`,
`db/migrations/20260918120000_order_execution_entries/migration.sql`,
`db/migrations/20260918120000_order_execution_entries/down.sql`,
`tests/unit/asignaciones/schema/order-execution-entries-migration.test.ts`
**Hacer:** `enum OrderExecutionAction` (seis valores) y `model OrderExecutionEntry` con
`/// @module asignaciones`, **sin** `@relation`, sin `created_at`/`updated_at`/`deleted_at`
(`design.md > 2.1`). `pnpm run db:migrate:create`, y **borrar a mano del SQL generado** todo
`DROP CONSTRAINT`/`DROP INDEX` sobre tablas ajenas. Completar a mano los dos `CHECK`, las dos FK
compuestas, los dos índices y `ENABLE`+`FORCE ROW LEVEL SECURITY` **al final**. `down.sql`: `DROP
TABLE` sin `CASCADE` y `DROP TYPE`.
**Hecho cuando:** el test de esquema, leyendo el SQL, afirma: los seis valores y ninguno más (R1); la
lista **exacta** de columnas —acción, instante, pedido, persona, empresa, posición y motivo, y ninguna
con texto ni identificador del paso— (R2, R4); una sola columna de tiempo (R3); el `CHECK` del motivo con la forma literal de QC-34 (R8); el `CHECK` de
posición (R5); las dos FK compuestas contra `orders_id_company_id_key` y `users_id_company_id_key` (R6,
R7); RLS activada y forzada como últimas sentencias (R32); identificadores en inglés (R33); ninguna
línea ejecutable sobre una tabla preexistente ni ningún `INSERT` de permisos (R30); el `down.sql`
revierte exactamente el UP (R34). Cada aserción con su **mutación** que la pone roja.
`pnpm run db:migrate` y `pnpm run db:rollback` aplicados y revertidos en local, con salida pegada en
`progress/impl_QC-82-registro-de-ejecucion-de-receta.md`. `guard-rls-force` y
`guard-arquitectura-modulos` verdes.
**Depende de:** nada. **⚑ F1.4-2** (si se prohíbe `NULL` en la posición, cambia la columna y el
`CHECK`).

### T2 [ ] — Las restricciones, contra Postgres
**Toca:** `tests/integration/asignaciones/order-execution-entries-constraints.int.test.ts`,
`tests/integration/aislamiento.json`
**Hacer:** test en modo `transaccion` que inserte con SQL crudo y compruebe cada rechazo.
**Hecho cuando:** hay un caso por rechazo: acción fuera de las seis (R1); `CANCEL` sin motivo y
`ADVANCE` con motivo (R8); posición 0 (R5); pedido inexistente (R6); pedido de la empresa B con la
fila de la A, y persona de la B con la fila de la A (R7); `relforcerowsecurity = true` (R32). Y el
control positivo de cada uno. Entrada `transaccion` en `aislamiento.json`;
`guard-aislamiento-integracion` verde.
**Depende de:** T1.

---

## Bloque B — `pedidos` cancela por encargo, por el camino único

### T3 [ ] [P] — Una sola definición de «cancelable»
**Toca:** `lib/modules/pedidos/domain/order-cancellation.ts` (nuevo),
`lib/modules/pedidos/domain/cancel-order.ts`, `tests/unit/pedidos/order-cancellation.test.ts`
**Hacer:** mover la lista de `cancel-order.ts` a `isCancellableStatus(status)` con un mapa **total**
sobre `OrderStatus` (`satisfies Record<…>`); `cancel-order.ts` la usa. No se publica en el barril.
**Hecho cuando:** test de la función en los cuatro estados; test de fuente que afirma que
`cancel-order.ts` ya no declara su propia lista y que `isCancellableStatus` es la única definición del
módulo (R29). Los tests de `cancelOrder` existentes, **sin tocar**, siguen verdes.
**Depende de:** nada.

### T4 [ ] [P] — `cancelAliveOrder` acepta `from` y el cliente
**Toca:** `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (**solo
`cancelAliveOrder`**), `tests/integration/pedidos/order-repository.int.test.ts`
**Hacer:** último parámetro opcional `options?: { from?: OrderStatus; db?: PrismaLike }`
(`design.md > 5`, punto 4). Sin `options`, idéntico a hoy.
**Hecho cuando:** los casos de hoy siguen verdes sin tocarlos; caso nuevo: con `from: 'EN_CURSO'` sobre
un pedido ya `ENTREGADO` devuelve `'not_found'` y **no** lo cancela. `guard-ambito-empresa-pedidos`
verde. **Parar y avisar al leader** si al abrir el archivo se ve que QC-68 ya lo cambió en `dev`.
**Depende de:** nada.

### T5 [ ] — El catálogo: cliente inyectable, `cancelAliveById` y la guardia tensada
**Toca:** `lib/modules/pedidos/domain/order-catalog.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`,
`tests/unit/pedidos/order-catalog-cancel.test.ts`,
`tests/guards/guard-ambito-empresa-pedidos.test.ts`
**Hacer:** `+ cancelAliveById` en `OrderCatalog` → `'ok' | 'not_found' | 'stale' | 'not_cancellable'`.
En el adaptador: `db: PrismaLike = prisma` como último parámetro de las cuatro funciones;
`cancelAliveOrderTarget` (no cancelable ⇒ `'not_cancellable'` sin tocar la base; si no, delega en
`cancelAliveOrder` con `{ from, db }` y separa `not_found` de `stale` releyendo); y
`orderCatalogOn(db): OrderCatalog`. En la guardia, `TOCA_LA_BASE` pasa a reconocer también `db.`,
con **nota fechada** (`2026-09-18`) encima.
**Hecho cuando:** tests de `cancelAliveById` en los cuatro desenlaces, incluido que **no** escribe
nada cuando no es cancelable (R29); la guardia sigue verde **y muerde**: se quita a mano el
`orderCompanyScope` de una función que usa `db.` y la guardia se pone roja; se restaura desde copia.
La mutación queda anotada en `progress/impl_…`. `pnpm exec tsc --noEmit` verde.
**Depende de:** T3, T4. **⚑ F1.4-8**.

---

## Bloque C — `asignaciones`: dominio, puertos y adaptadores

### T6 [ ] [P] — Tipos, puertos y el error
**Toca:** `lib/modules/asignaciones/domain/execution-entry.ts`,
`lib/modules/asignaciones/ports/execution-log-repository.ts`,
`lib/modules/asignaciones/ports/execution-transaction.ts`,
`lib/modules/asignaciones/domain/errors.ts`,
`tests/unit/asignaciones/execution-log-repository.test.ts`
**Hacer:** `NewExecutionEntry` con el motivo **solo** en la rama `cancel`; los dos puertos de
`design.md > 3.2`; `NotCancellableError` con `code = 'not_cancellable'`.
**Hecho cuando:** test de tipos: una entrada `cancel` sin `reason` y una `advance` con `reason` **no
compilan** (`@ts-expect-error`) (R8); el puerto del registro no declara `update`, `delete` ni nada
parecido (R31); `guard-catalogo-de-errores` verde.
**Depende de:** nada.

### T7 [ ] — Los dos adaptadores driven
**Toca:** `lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma.ts`,
`lib/modules/asignaciones/adapters/driven/persistence/execution-transaction-prisma.ts`
**Hacer:** `createExecutionLogRepository(db = prisma)` con `append` (mapa total `ExecutionAction →`
enum de Prisma, `occurredAt` explícito) y `findLastStepPosition(companyId, orderId)` (`design.md >
3.2`); `withExecutionTransaction(work)`. Ninguna sentencia de modificación ni de borrado en el archivo.
**Hecho cuando:** los casos de T19 que ejercitan estos adaptadores pasan; test de fuente: el archivo
del registro no contiene `update`, `upsert` ni `delete` sobre el modelo (R31); `module-contract` (b) y
`guard-arquitectura-modulos` verdes.
**Depende de:** T1, T6.

### T8 [ ] [P] — `recordStepMove`
**Toca:** `lib/modules/asignaciones/domain/record-step-move.ts`,
`tests/unit/asignaciones/record-step-move.test.ts`
**Hacer:** prólogo de QC-63; solo `EN_CURSO`; un `append` con la posición del paso de llegada.
**Hecho cuando:** tests: sin permiso rechaza **sin llamar a ningún doble** (R26); no asignado y otra
empresa, misma respuesta que inexistente (R27); la empresa sale del actor aunque la entrada traiga
`companyId` (el esquema estricto lo rechaza) (R28); `advance` y `go_back` escriben su acción con la
posición recibida (R17, R18); `ENTREGADO`, `CANCELADO` y `PENDIENTE` no escriben (R20).
**Depende de:** T6.

### T9 [ ] [P] — `cancelAssignedOrder`
**Toca:** `lib/modules/asignaciones/domain/cancel-assigned-order.ts`,
`tests/unit/asignaciones/cancel-assigned-order.test.ts`
**Hacer:** `design.md > 3.3`. El motivo con `cancelOrderSchema.shape.reason` del barril de `pedidos`.
Todo dentro de `transaction.run`: `cancelAliveById` y, solo si `'ok'`, `append` con el **mismo**
`reason` y el mismo `now`.
**Hecho cuando:** tests: prólogo (R26–R28); motivo ausente/vacío/espacios ⇒ `invalid_input` sin
abrir la transacción (R9); tope de 501 caracteres rechazado igual que `cancelOrderSchema` (R10);
`'not_cancellable'` ⇒ `NotCancellableError` y **ningún** `append` (R29); `'ok'` ⇒ un `append` con
`action: 'cancel'` y `reason` **idéntico** al pasado a `cancelAliveById` (R22, R23); si `append` lanza,
el error se propaga **desde dentro** de `run` (R24); lo puede hacer un responsable que no arrancó
(R27); el actor no necesita `pedidos.modificar` ni `asignaciones.modificar` (R30).
**Depende de:** T5, T6.

### T10 [ ] — `startAssignedOrder`: arrancar y retomar
**Toca:** `lib/modules/asignaciones/domain/start-assigned-order.ts`,
`lib/modules/asignaciones/domain/assigned-order-execution-view.ts`,
`tests/unit/asignaciones/start-assigned-order.test.ts`
**Hacer:** `design.md > 3.3`. `PENDIENTE`: transición + `start` en `run`; `'stale'` sale del `run` sin
escribir y el bucle relee fuera. `EN_CURSO`: `findLastStepPosition` → `append(resume)`, y si falla,
lanza. `resumeStepPosition` en la vista. Tensar el `describe` de QC-63 R9 con **nota fechada**: sigue
afirmando que `transitionAliveById` no se llama **y además** que se escribe exactamente un `resume`.
**Hecho cuando:** tests: `PENDIENTE` ⇒ un `start` con posición 1 **dentro** de `run` (R12); receta sin
pasos ⇒ posición `null` (R5); `EN_CURSO` con última posición 3 ⇒ `resume` con 3 y vista con 3 (R13);
sin anotaciones ⇒ 1 (R14); si `append(resume)` lanza, `startAssignedOrder` lanza (R15); `'stale'` ⇒
cero `start` y un `resume` (R16); prólogo intacto (R26).
**Depende de:** T6. **⚑ F1.4-2, F1.4-3, F1.4-4**.

### T11 [ ] [P] — `finishAssignedOrder`: finalizar
**Toca:** `lib/modules/asignaciones/domain/finish-assigned-order.ts`,
`tests/unit/asignaciones/finish-assigned-order.test.ts`
**Hacer:** entrada `{ orderId, stepPosition }` (estricta); transición a `ENTREGADO` + `finish` en
`run`. Tensar el caso de QC-63 R16 con **nota fechada**: la entrada gana `stepPosition` y **sigue**
rechazando cualquier dato de marcado.
**Hecho cuando:** tests: un `finish` con la posición recibida y el mismo `now` que la transición
(R21); si `append` lanza, se propaga desde dentro de `run` (R24); un campo de marcado sigue siendo
`invalid_input`.
**Depende de:** T6.

### T12 [ ] — El contrato del módulo y su lista cerrada
**Toca:** `lib/modules/asignaciones/index.ts`, `tests/unit/asignaciones/module-contract.test.ts`
**Hacer:** publicar `createCancelAssignedOrder`, `createRecordStepMove`, sus `*Deps`,
`ExecutionAction`, `NotCancellableError` y los tipos de los puertos que `lib/composition` necesita
nombrar (solo tipos). Añadir los dos archivos nuevos a `CASOS_DE_USO_QC63` con nota fechada.
**Hecho cuando:** `module-contract` verde **y muerde**: quitar uno de los dos archivos de la lista lo
pone rojo; el cierre de imports del barril sigue sin `next/*`, `@prisma/client` ni `'use server'`.
**Depende de:** T8, T9, T10, T11.

---

## Bloque D — Cableado y Server Actions

### T13 [ ] — `lib/composition`
**Toca:** `lib/composition/index.ts`
**Hacer:** `orderCatalog` gana `cancelAliveById: cancelAliveOrderTarget` (función con nombre, no
lambda); `executionLogRepository`; `executionTransaction` según `design.md > 4`; la fachada
`asignaciones` gana `cancelAssignedOrder`, `recordStepMove` y las deps nuevas de `start`/`finish`, con
`now: () => new Date()` explícito. **Ningún** import de `@/lib/shared/db/prisma` ni de
`@prisma/client`.
**Hecho cuando:** `pnpm run typecheck` verde; `guard-ambito-empresa-pedidos` y
`guard-arquitectura-modulos` verdes.
**Depende de:** T5, T7, T12.

### T14 [ ] — Las acciones
**Toca:** `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`,
`tests/unit/asignaciones/order-execution-actions.test.ts`
**Hacer:** `cancelAssignedOrderAction` y `recordStepMoveAction` **en este mismo archivo**
(`design.md > 6.3`); `finishAssignedOrderAction` lee `stepPosition`.
**Hecho cuando:** tests de traducción por `code` y de redirección de cancelar;
`session-once-per-request-actions.test.ts` verde **sin tocarlo**.
**Depende de:** T13. **⚑ F1.4-6** (la redirección con parámetro).

---

## Bloque E — Pantalla

### T15 [ ] [P] — `StepReader`: dos props opcionales
**Toca:** `components/shared/step-reader/step-reader.tsx`,
`tests/unit/recetas-ui/step-reader.test.tsx`,
`tests/unit/asignaciones-ui/order-execution-screen.test.tsx` (solo el caso de QC-63 R18)
**Hacer:** `initialStepPosition` (recortada a `[1, steps.length]`) y `onStepChange`
(`design.md > 6.1`). Tensar el caso R18 de QC-63 con **nota fechada**: el diff contra la base de
fusión toca **solo** `step-reader.tsx`.
**Hecho cuando:** los casos de QC-64 pasan **sin tocarlos**; casos nuevos: empieza en la posición 3
(R13), recorta 9 a la última (R14), Siguiente avisa `{ advance, 2 }` y Anterior `{ go_back, 1 }`
(R17, R18), Anterior en el paso 1 no avisa; el test de fuente de QC-64 sigue verde (R37).
**Depende de:** nada. **⚑ F1.4-1, F1.4-5**.

### T16 [ ] — La pantalla anota los pasos
**Toca:** `app/(private)/asignacion/[id]/components/order-execution-screen.tsx`,
`tests/unit/asignaciones-ui/order-execution-step-log.test.tsx`
**Hacer:** `initialStepPosition`, posición en estado, cadena de promesas para
`recordStepMoveAction`, `stepPosition` en el formulario de Finalizar (`design.md > 6.2`).
**Hecho cuando:** tests con la acción doblada: Siguiente dos veces ⇒ dos llamadas **en orden** con 2 y
3 (R17); con la acción que **rechaza** o **lanza**, el paso cambia igual, no aparece ningún `role="alert"`
y no hay segunda llamada (R19); con `resumeStepPosition: 3` la pantalla enseña «Paso 3 de N» (R13);
Finalizar envía la posición del último paso (R21).
**Depende de:** T14, T15.

### T17 [ ] — El diálogo de cancelar
**Toca:** `app/(private)/asignacion/[id]/components/order-cancel-dialog.tsx`,
`app/(private)/asignacion/[id]/components/index.ts`,
`app/(private)/asignacion/[id]/components/order-execution-screen.tsx`,
`tests/unit/asignaciones-ui/order-cancel-dialog.test.tsx`
**Hacer:** botón «Cancelar pedido» + `AlertDialog` con `Textarea`; valida con `cancelOrderSchema`;
envía `cancelAssignedOrderAction` con `orderId`, `stepPosition` y `reason`.
**Hecho cuando:** tests: sin motivo o solo espacios no se envía y el motivo del rechazo es **texto
visible** (R9); con motivo se envía el texto recortado tal cual (R22, R23); el error de la acción se
pinta (R24); botón y controles con `min-h-11 min-w-11`, `Textarea` con `text-base`, todo por teclado,
nada en `title` (R36). Retroceder sigue sin diálogo (R11).
**Depende de:** T14, T16 (las dos tocan `order-execution-screen.tsx`: van en serie).

### T18 [ ] [P] — Confirmación en la lista
**Toca:** `lib/shared/routes.ts`, `app/(private)/asignacion/page.tsx`,
`app/(private)/asignacion/components/assigned-order-cancelled-notice.tsx`,
`app/(private)/asignacion/components/index.ts`,
`tests/unit/asignaciones-ui/assigned-orders-cancelled-notice.test.tsx`
**Hacer:** `CANCELLED_ORDER_PARAM` y el aviso gemelo del de entrega (`design.md > 6.4`).
**Hecho cuando:** test: con `?<param>=2026-0000007` la lista enseña «Pedido 2026-0000007 cancelado»
con `role="status"` (R25); sin el parámetro, nada. `guard-pantallas-exigen-permiso` y
`guard-rutas-privadas-cubiertas` verdes.
**Depende de:** nada. **⚑ F1.4-6** (si se descarta, esta task desaparece y R25 se reescribe).

---

## Bloque F — Pruebas de extremo a extremo y cierre

### T19 [ ] — Atomicidad y carrera, contra Postgres
**Toca:** `tests/integration/asignaciones/execution-atomicity.int.test.ts`,
`tests/integration/aislamiento.json`
**Hacer:** con la composición real (o los adaptadores reales cableados igual): forzar que el `append`
falle dentro de `run` (p. ej. una posición 0 que el `CHECK` rechaza) y comprobar el pedido.
**Hecho cuando:** arrancar con `append` fallido deja el pedido en `PENDIENTE` y cero filas; finalizar
fallido lo deja `EN_CURSO`; cancelar fallido lo deja `EN_CURSO` y `cancellation_reason` a `NULL` (R24);
cancelar con éxito deja `orders.cancellation_reason` **igual** a `reason` de la fila (R23, R29); dos
`startAssignedOrder` concurrentes sobre un `PENDIENTE` dejan **un** `START` y **un** `RESUME` (R16);
un `recordStepMove` sobre un `ENTREGADO` no escribe (R20). Entrada `commit` en `aislamiento.json` con
`motivo` y `desde` (`design.md > 7`). Cada caso limpia lo suyo.
**Depende de:** T13.

### T20 [ ] — E2E
**Toca:** `e2e/registro-ejecucion.spec.ts`
**Hacer:** usar `e2e/helpers/landing.ts` para entrar (lo exige `guard-e2e-landing`). Fixtures: dos
pedidos asignados al Operador sobre una receta de al menos tres pasos.
**Hecho cuando:** (a) el Operador abre el primero, marca y avanza dos pasos, **recarga** y ve «Paso 3
de N» (R39); (b) cancela el segundo con un motivo, vuelve a la lista con la confirmación, y el pedido
queda `CANCELADO` con **ese** motivo, comprobado en la base o en la ficha del pedido como
Administrador (R40). Salida de Playwright pegada en `progress/impl_…`. `guard-e2e-landing` verde.
**Depende de:** T16, T17, T18.

### T21 [ ] [P] — Las enmiendas a QC-63, por escrito
**Toca:** `specs/QC-63-ejecutar-receta-operador/requirements.md` (solo una nota al pie)
**Hacer:** nota fechada `2026-09-18`: R10 queda enmendada por QC-82 R38 y R18 por QC-82 R37. **No** se
reescriben R10 ni R18.
**Hecho cuando:** la nota existe y no hay ningún otro cambio en ese archivo (`git diff` lo muestra).
**Depende de:** ratificación de **F1.4-1**.

### T22 [ ] — Cierre
**Toca:** `progress/impl_QC-82-registro-de-ejecucion-de-receta.md`
**Hacer:** el mapa `R1…R40 → test` completo; las mutaciones de T1, T5, T12 anotadas con su rojo;
`./init.sh` completo.
**Hecho cuando:** los 40 requisitos tienen su test; `./init.sh` termina en verde (o solo con los rojos
ya presentes en `tests/baseline-rojos.json`); ningún archivo de `tests/guards/` quedó más laxo que en
`origin/dev` (revisado por diff); `package.json` y `docs/dependencias.md` fuera del diff y
`guard-dependencias-aprobadas` verde (R35).
**Depende de:** todas.

---

## Orden y paralelismo, de un vistazo

```
T1 ─ T2
T3 ┐
T4 ┴ T5 ─────────────┐
T6 ─ T7 ─────────────┼─ T13 ─ T14 ─ T16 ─ T17 ─┐
T6 ─ T8/T9/T10/T11 ─ T12 ┘            │         ├─ T20 ─ T22
T15 ──────────────────────────────────┘         │
T18 ────────────────────────────────────────────┘
T13 ─ T19            T21 (tras ratificar F1.4-1)
```
