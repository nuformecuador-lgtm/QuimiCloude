# QC-82 — registro-de-ejecucion-de-receta · design.md

> Verificado contra el disco de esta rama (`feature/QC-82-registro-de-ejecucion-de-receta`, base
> `4c057594`), no contra lo que la ficha daba por supuesto. Lo que no sale de la acotación no se
> rellena: está en `## 12. Puntos para F1.4`, y los requisitos que dependen de ellos van marcados ⚑.

## 0. Lo que ya existe y NO se construye aquí

| Pieza | Dónde | Qué aporta a esta ficha |
| --- | --- | --- |
| Pantalla de ejecución | `app/(private)/asignacion/[id]/` (`page.tsx`, `order-execution-screen.tsx`) | `page.tsx` abre con `requirePagePermission('asignaciones.consultar')` y llama a `startAssignedOrderAction(id)`, que transiciona y lee en una sola llamada. Avanzar y retroceder son **solo de cliente**: hoy no llaman al servidor. |
| Asistente de pasos | `components/shared/step-reader/step-reader.tsx` | Props `steps`, `onFinish`, `title`. Estado en memoria: `index` empieza en `0`, y no expone ningún aviso de cambio de paso. **No se puede cumplir R13/R17/R18 sin tocarlo** (`## 6.1`). |
| Tres casos de uso de ejecución | `lib/modules/asignaciones/domain/{get-assigned-order-execution,start-assigned-order,finish-assigned-order}.ts` | Orden fijo: `requirePermission(actor, 'asignaciones.consultar')` → `zod` → `listOrderIdsByUserInCompany` (no es tuyo = no existe) → `findAliveById(orderId, actor.companyId)`. `start` tolera `'stale'` releyendo. Se **reutiliza el patrón** en los dos casos de uso nuevos. |
| Estados que congelan | `asignaciones/domain/order-state.ts` → `assertOrderAcceptsWrites` | `ENTREGADO` → `order_delivered_frozen`, `CANCELADO` → `order_cancelled_not_assignable`. |
| Servicio de `pedidos` para otros módulos | `pedidos/domain/order-catalog.ts` (`OrderCatalog`), implementado en `pedidos/adapters/driven/persistence/order-catalog-prisma.ts` | `findAliveById`, `listAliveSummariesByIds`, `transitionAliveById` (con `from` en el `WHERE` y `'ok' \| 'not_found' \| 'stale'`). Las tres funciones usan el `prisma` **global**. |
| Cancelación | `pedidos/domain/cancel-order.ts` (`CANCELABLES = ['PENDIENTE','EN_CURSO']`, **no exportada**) → `OrderRepository.cancelAlive` → `cancelAliveOrder` en `order-prisma.ts` | Único método que escribe `CANCELADO` y el motivo **en la misma sentencia**. Hoy **no** filtra por estado en el `WHERE` (confía en la lectura previa del caso de uso). Exige `pedidos.modificar`. |
| Regla del motivo | `pedidos/domain/order-input.ts` → `cancelOrderSchema` (recorte, 1..500), **publicado** en el barril | La misma regla se reutiliza aquí (R10). La UI de `pedidos` ya la importa desde cliente (`cancel-order-dialog.tsx`). |
| `CHECK` precedente | `orders_cancellation_reason_matches_status`: `("status"::text = 'CANCELADO') = ("cancellation_reason" IS NOT NULL)` | Forma literal del `CHECK` de R8 (`[D4]`). |
| Claves candidatas para FK compuestas | `orders_id_company_id_key` (QC-60), `users_id_company_id_key` (QC-83) | Permiten que la empresa de la anotación sea la del pedido y la de la persona **por construcción** (R7). |
| Transacción con cliente inyectable | `createOrderAssignmentRepository(db = prisma)` en `asignaciones` | Fábrica que acepta el cliente transaccional. Su cabecera ya anticipa «el día que la operación gane una segunda escritura». |
| Confirmación al volver a la lista | `DELIVERED_ORDER_PARAM` (`lib/shared/routes.ts`) + `AssignedOrderDeliveredNotice` | Molde de R25 ⚑. |
| Catálogo de errores | `lib/modules/errores/domain/error-catalog.ts` | Ya trae `not_cancellable`, `order_not_found`, `invalid_input`, `unauthorized`, `order_delivered_frozen`, `order_cancelled_not_assignable`. **Ningún código nuevo.** |

## 1. La forma de la solución, en una frase

Una tabla nueva **del módulo `asignaciones`** con una fila por gesto, dos casos de uso nuevos
(`cancelAssignedOrder`, `recordStepMove`) y dos ampliados (`start`, `finish`), un **puerto de
transacción** que `lib/composition` cablea para que la anotación de `asignaciones` y el cambio de
estado de `pedidos` compartan **la misma transacción de base de datos** sin que ningún módulo toque
las tablas del otro, y una pantalla que monta `StepReader` con dos props opcionales nuevas.

## 2. Modelo de datos

### 2.1 La tabla `order_execution_entries` (modelo `OrderExecutionEntry`, `/// @module asignaciones`)

| Columna | Tipo | Nulo | Por qué |
| --- | --- | --- | --- |
| `id` | `UUID` PK, `gen_random_uuid()` | no | Convención del repo. |
| `company_id` | `UUID` | no | Columna propia de empresa (`[D15]`, R7). |
| `order_id` | `UUID` | no | El pedido es obligatorio (`[D14]`, R6). |
| `user_id` | `UUID` | no | Quién (R2). |
| `action` | enum `OrderExecutionAction` | no | `START`, `RESUME`, `ADVANCE`, `GO_BACK`, `CANCEL`, `FINISH`: **seis y ninguno más** (`[D1]` enmendada por `[D12]`, R1). Un enum de Postgres hace que la base rechace un séptimo valor. |
| `step_position` | `INTEGER` | **sí** ⚑ | La posición, desde 1 (`[D9]`, R4). `NULL` solo si la receta no tiene pasos (R5 ⚑). |
| `reason` | `TEXT` | sí | El motivo; sin longitud en la columna, igual que `orders.cancellation_reason`: el tope vive en `cancelOrderSchema` (R10). |
| `occurred_at` | `TIMESTAMPTZ(6)` | no, **sin default** | El único instante (`[D10]`, R3). Sin default para que nadie pueda olvidarse de pasarlo: lo pone el caso de uso con el **mismo `now`** que sella el cambio del pedido, así el instante de la anotación y el `updated_at` del pedido coinciden. |

**No hay `created_at`, `updated_at` ni `deleted_at`.** `[D10]` fija una sola columna de tiempo, y
`[D13]` dice que nada se edita ni se borra desde esta ficha: una columna de edición o de baja sería
infraestructura para algo prohibido. La purga física es de **QC-124**.

**Restricciones escritas a mano** (Prisma no modela `CHECK` ni FK compuestas sin `@relation`):

```sql
-- R8: el motivo existe si y solo si la accion es cancelar. Forma literal del CHECK de QC-34.
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_reason_matches_action"
  CHECK (("action"::text = 'CANCEL') = ("reason" IS NOT NULL));

-- R5: posicion desde 1 cuando existe.
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_step_position_positive"
  CHECK ("step_position" IS NULL OR "step_position" >= 1);

-- R6, R7: pedido de la MISMA empresa, por construccion.
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_order_id_company_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- R7: persona de la MISMA empresa, por construccion.
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_user_id_company_id_fkey"
  FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

`RESTRICT` en las dos: `orders` y `users` tienen borrado lógico, así que un `DELETE` físico sobre
ellos es una anomalía y tiene que ser ruidosa, igual que en `order_assignments`. **QC-124** borrará
filas de **esta** tabla, no de las padres, así que el `RESTRICT` no le estorba.

**Índices:**

- `order_execution_entries_order_id_occurred_at_idx` sobre `("order_id", "occurred_at" DESC)`: la
  consulta caliente es «la última posición anotada de este pedido» (R13), que corre en **cada**
  apertura de la pantalla. Sirve también la comprobación del `RESTRICT` hacia `orders` y la futura
  purga por pedido de QC-124.
- `order_execution_entries_user_id_idx` sobre `("user_id")`: la comprobación del `RESTRICT` hacia
  `users`, mismo motivo que `order_assignments_user_id_idx`.
- **Sin índice por `company_id`**: nadie consulta el registro por empresa sola; la empresa va en el
  filtro junto al pedido.

**RLS** activada y forzada, **sin policies**, **al final** de la migración (R32): la lección de
QC-32/QC-74/QC-83 que ya documenta la migración de `order_assignments`.

**Identificadores** (R33, `[D16]`): todo en inglés y `snake_case`; los valores del enum, en
mayúsculas como `OrderStatus`/`OrderPriority`.

### 2.2 La migración

`db/migrations/20260918120000_order_execution_entries/` con `migration.sql` y `down.sql`.

- **UP**, en este orden: `CREATE TYPE "OrderExecutionAction"` → `CREATE TABLE` → los dos índices →
  los dos `CHECK` → las dos FK → `ENABLE` + `FORCE ROW LEVEL SECURITY`.
- **Drift de Prisma**: `migrate dev --create-only` va a emitir `DROP CONSTRAINT` sobre las FK y
  `CHECK` escritos a mano de otras tablas (`orders`, `order_assignments`, `products`, …) y `DROP
  INDEX` de los índices de QC-57. **Se borran a mano del SQL generado**, como hicieron todas las
  migraciones desde QC-20. La migración **no ejecuta ningún DDL sobre ninguna tabla preexistente** y
  **no inserta permisos** (R30).
- **DOWN**: `DROP TABLE "order_execution_entries";` (sin `CASCADE`) y `DROP TYPE
  "OrderExecutionAction";`. Nada más: ninguna tabla preexistente aparece en una línea ejecutable. Se
  lleva las anotaciones escritas después del UP, que es lo normal al revertir un `CREATE TABLE`.
- La plantilla de integración (QC-77) se reconstruye sola: su nombre lleva la huella de las
  migraciones.

## 3. Dominio (`lib/modules/asignaciones/domain/`)

### 3.1 El tipo de la anotación

`execution-entry.ts`:

```ts
export type ExecutionAction = 'start' | 'resume' | 'advance' | 'go_back' | 'cancel' | 'finish';

type Base = {
  readonly companyId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly stepPosition: number | null;
  readonly occurredAt: Date;
};

/** El motivo existe en el TIPO si y solo si la accion es cancelar: R8 tambien en compilacion. */
export type NewExecutionEntry =
  | (Base & { readonly action: Exclude<ExecutionAction, 'cancel'> })
  | (Base & { readonly action: 'cancel'; readonly reason: string });
```

El cruce `'go_back'` ↔ `GO_BACK` lo hace el adaptador, a mano y en un solo sitio, con un mapa total
(`satisfies Record<ExecutionAction, …>`), como `order-state.ts` hace con `OrderStatus`.

### 3.2 Los dos puertos nuevos (`ports/`)

```ts
// ports/execution-log-repository.ts
export interface ExecutionLogRepository {
  append(entry: NewExecutionEntry): Promise<void>;
  /** La posicion de la ULTIMA anotacion con posicion de ese pedido en esa empresa, o null. */
  findLastStepPosition(companyId: string, orderId: string): Promise<number | null>;
}
```

**Sin `update`, sin `delete`** (R31, `[D13]`): lo que el puerto no expresa no se hace por descuido.
`companyId` primero, como en `OrderAssignmentRepository`. «La última» = `ORDER BY occurred_at DESC,
id DESC LIMIT 1` sobre las filas con `step_position IS NOT NULL`; el desempate por `id` no tiene
significado y solo hace la lectura determinista (ver `## 13`, riesgo 2).

```ts
// ports/execution-transaction.ts
export type ExecutionWriters = {
  readonly orders: OrderCatalog;          // contrato publico de `pedidos`
  readonly log: ExecutionLogRepository;
};
export interface ExecutionTransaction {
  run<T>(work: (writers: ExecutionWriters) => Promise<T>): Promise<T>;
}
```

`run` promete una cosa y solo una: **lo que `work` escriba por `writers` se confirma entero o no se
confirma nada**. El dominio no sabe que por debajo hay Prisma ni `$transaction` (`## 4`).

### 3.3 Los casos de uso

Todos con el mismo prólogo que ya tienen los tres de QC-63 (R26, R27, R28):
`requirePermission(actor, 'asignaciones.consultar')` en la **primera línea** → `zod` strict →
`listOrderIdsByUserInCompany(actor.companyId, actor.id)` (no es tuyo ⇒ `OrderNotFoundError`) →
`orders.findAliveById(orderId, actor.companyId)` (`null` ⇒ `OrderNotFoundError`).

| Caso de uso | Entrada (`zod` strict) | Qué escribe | Cómo |
| --- | --- | --- | --- |
| `startAssignedOrder` (**ampliado**) | `{ orderId }` (sin cambios) | `PENDIENTE`: transición + `start` | **En `transaction.run`**: `orders.transitionAliveById(…, 'PENDIENTE', 'EN_CURSO', …)`; solo si `'ok'`, `log.append(start)`. `'stale'` sale del `run` sin escribir nada y el bucle relee **fuera** de la transacción, como hoy. |
| | | `EN_CURSO`: solo `resume` | `log.findLastStepPosition` → posición (o 1, R14 ⚑) → `log.append(resume)`. Una sola sentencia, no necesita transacción. **Si falla, lanza** y la pantalla no abre (R15 ⚑). |
| `finishAssignedOrder` (**ampliado**) | `{ orderId, stepPosition }` | transición a `ENTREGADO` + `finish` | En `transaction.run`, mismo esquema que `start`. |
| `cancelAssignedOrder` (**nuevo**) | `{ orderId, stepPosition, reason }` — `reason` con `cancelOrderSchema.shape.reason` del barril de `pedidos` (R10) | `CANCELADO` + motivo en el pedido + `cancel` con el mismo motivo | En `transaction.run`: `orders.cancelAliveById(orderId, companyId, from, reason, actor.id, now)`; solo si `'ok'`, `log.append({ action: 'cancel', reason, … })`. `'not_cancellable'` ⇒ `NotCancellableError`; `'stale'` ⇒ relee y reintenta como `finish`. Devuelve `{ numberText }` leído **antes** de escribir, para R25 ⚑. |
| `recordStepMove` (**nuevo**) | `{ orderId, direction: 'advance' \| 'go_back', stepPosition }` | `advance` / `go_back` | Solo si el pedido está `EN_CURSO` (R20); si no, lanza sin escribir (`assertOrderAcceptsWrites` para los cerrados, `OrderNotFoundError` para `PENDIENTE`). Un solo `log.append`: **sin** transacción, porque no hay segunda escritura. |

**`stepPosition`**: `z.number().int().min(1).nullable()`. El servidor **no** la contrasta con los
pasos de la receta: leer la receta en cada Siguiente costaría una consulta por clic para proteger una
cifra que `[D9]` ya acepta que puede quedar desalineada.

**Qué posición lleva cada acción** (R12–R22): `start` → 1; `resume` → la última anotada (o 1);
`advance`/`go_back` → la del paso **al que se llega**, que es lo que hace cierto el E2E de `[D17]`
(abrir = 1, avanzar = 2, avanzar = 3, recargar ⇒ 3); `finish` → la del último paso; `cancel` → la del
paso que se está mostrando. Con una receta sin pasos, `null` en todas (R5 ⚑).

**Lo que devuelve `startAssignedOrder`**: `AssignedOrderExecutionView` gana **un** campo,
`resumeStepPosition: number | null`, que la pantalla pasa al asistente. `get-assigned-order-execution`
no cambia de firma: el campo lo rellena `start`, que es el único que lo sabe.

**R16 sin código extra**: dos aperturas simultáneas de un `PENDIENTE` compiten por el `UPDATE ...
WHERE status = 'PENDIENTE'`. La segunda espera al bloqueo de fila, ve `count = 0`, recibe `'stale'`,
su transacción **no ha escrito nada**, relee `EN_CURSO` y cae en la rama de retomar.

### 3.4 Errores

`errors.ts` gana **una** clase: `NotCancellableError` con `code = 'not_cancellable'`, código que **ya
existe** en el catálogo («El pedido no se puede cancelar en su estado actual.») y que ya usa `pedidos`
para el mismo caso. Mismo criterio que `order_not_found`: mismo caso, mismo código, misma frase.
**Ningún código nuevo en el catálogo.**

## 4. La misma operación entre dos módulos (R24)

**El problema.** Arrancar, finalizar y cancelar escriben en dos tablas de **dos módulos**:
`orders` (de `pedidos`) y `order_execution_entries` (de `asignaciones`). La arquitectura prohíbe que
un adaptador de un módulo toque el modelo del otro (`guard-arquitectura-modulos`), que un driven
importe el driven de otro módulo, y que `lib/composition` importe el cliente Prisma
(`guard-arquitectura-modulos`, regla R17: «importa el cliente Prisma compartido fuera de un adaptador
driven»).

**La solución: un puerto de transacción del dominio, abierto por un driven y cableado en la
composición.**

```
asignaciones/domain (caso de uso)
   └─ transaction.run(async ({ orders, log }) => { ... })       <- solo conoce los puertos
lib/composition
   └─ executionTransaction.run = (work) =>
        withExecutionTransaction((db) =>                          <- driven de asignaciones
          work({ orders: orderCatalogOn(db),                      <- driven de pedidos
                 log: createExecutionLogRepository(db) }))        <- driven de asignaciones
asignaciones/adapters/driven/persistence/execution-transaction-prisma.ts
   └─ withExecutionTransaction(work) = prisma.$transaction(work)  <- el unico que abre la transaccion
```

- **Quién abre la transacción**: un adaptador driven de `asignaciones`, el único sitio del módulo que
  puede tocar el cliente Prisma. No sabe nada de `pedidos`: entrega el cliente transaccional al
  `work` que le pasen.
- **Quién ata las dos mitades**: `lib/composition`, el único archivo que puede importar drivens de
  los dos módulos. No importa el cliente Prisma: solo recibe `db` como parámetro de una función, y su
  tipo sale del de `withExecutionTransaction`, sin importar `@prisma/client`.
- **Qué gana `pedidos`**: sus cuatro funciones de catálogo aceptan un último parámetro opcional
  `db: PrismaLike = prisma` (mismo patrón que `createOrderAssignmentRepository`), y el adaptador
  exporta `orderCatalogOn(db): OrderCatalog`, que las ata a ese cliente. El `orderCatalog` global de
  la composición **no cambia de forma**: sigue atando cada método a su función con nombre, que es lo
  que `guard-ambito-empresa-pedidos` exige leer.
- **El dominio no se entera**: recibe `ExecutionWriters`, dos interfaces que ya conoce.

## 5. `pedidos`: cancelar por encargo, por el camino único (R29)

1. **La lista de cancelables sale de `cancel-order.ts`** a un archivo de dominio propio,
   `pedidos/domain/order-cancellation.ts`, que exporta `isCancellableStatus(status)`.
   `cancel-order.ts` la usa en vez de su constante local: **una** definición, dos consumidores
   (`cancelOrder` y el catálogo). No se publica en el barril: `asignaciones` no la necesita, pregunta.
2. **`OrderCatalog` gana `cancelAliveById(id, companyId, from, reason, actorId, now)`** →
   `'ok' | 'not_found' | 'stale' | 'not_cancellable'`. Devuelve un **resultado**, no lanza un error de
   `pedidos`: el traductor de la acción de `asignaciones` solo reconoce `AsignacionesError`, y un
   `PedidosError` saldría como error inesperado.
3. **Implementación** (`order-catalog-prisma.ts` → `cancelAliveOrderTarget`): si
   `!isCancellableStatus(from)` ⇒ `'not_cancellable'` sin tocar la base; si no, **delega en
   `cancelAliveOrder`** de `order-prisma.ts` (driven → driven del **mismo** módulo, permitido), que
   sigue siendo **la única función que escribe `CANCELADO` y el motivo**. Si devuelve `'not_found'`,
   relee con `findAliveOrderTargetById` para separar `'not_found'` de `'stale'`, como hace
   `transitionAliveOrder`.
4. **`cancelAliveOrder` gana un último parámetro opcional** `options?: { from?: OrderStatus; db?:
   PrismaLike }`. Sin él, su comportamiento es **idéntico** al de hoy (los tests de QC-34 no cambian);
   con `from`, el `WHERE` filtra además por `status = from`, que es lo que impide que una cancelación
   que llegue tarde cancele un pedido que otro responsable acaba de entregar.
5. **El seed no cambia** (R30): el Operador no gana `pedidos.modificar`, y `cancelOrder` sigue
   exigiéndolo para la pantalla de pedidos.

## 6. Pantalla

### 6.1 `StepReader` gana dos props opcionales (R37 ⚑)

```ts
export type StepReaderProps = {
  readonly steps: readonly RecipeStepDocument[];
  readonly onFinish: () => void;
  readonly title?: string;
  readonly initialStepPosition?: number;                 // desde 1; se recorta a [1, steps.length]
  readonly onStepChange?: (change: { direction: 'advance' | 'go_back'; position: number }) => void;
};
```

- Sin las dos props nuevas, **el comportamiento es el de hoy**: el formulario de recetas (QC-64) no
  se entera.
- Sigue recibiendo todo por props: **no** importa `lib/composition`, Server Actions ni
  `next/navigation` (QC-64 R20 intacta, y su test de fuente sigue verde).
- El recorte a `[1, steps.length]` es R14 ⚑: una posición anotada que ya no existe en la receta
  editada abre en el último paso, sin error. Hoy ya hace `Math.min(index, steps.length - 1)`.
- `onStepChange` se llama **después** de cambiar el índice, y solo si el índice cambió (Anterior en
  el paso 1 no avisa).

### 6.2 `order-execution-screen.tsx`

- Pasa `initialStepPosition={execution.resumeStepPosition ?? 1}` y guarda la posición actual en estado
  para enviarla con Finalizar y con Cancelar.
- **Avanzar y retroceder no esperan a nadie** (R19): en `onStepChange` encola
  `recordStepMoveAction(...)` en una **cadena de promesas** de la pantalla y **no** espera su
  resultado para pintar. Cada eslabón atrapa su propio fallo y lo descarta: ni error visible, ni
  reintento, ni bloqueo de la cadena. La cadena existe para que las anotaciones **lleguen en el orden
  de los clics**: sin ella, dos Siguiente seguidos podrían escribirse al revés y R13 volvería a un
  paso equivocado sin que nadie lo notara.
- **Finalizar** sigue siendo el formulario de hoy con un campo oculto más, `stepPosition`.
- **Cancelar**: botón «Cancelar pedido» visible en todos los pasos, que abre
  `order-cancel-dialog.tsx` (`AlertDialog` + `Textarea` de shadcn/ui, ya en el repo). El motivo se
  valida en cliente con `cancelOrderSchema` del barril de `pedidos` —la misma regla, no una copia— y
  otra vez en el servidor. Confirmar envía `cancelAssignedOrderAction` con `orderId`, `stepPosition`
  y `reason`.

### 6.3 Server Actions (`asignaciones/adapters/driving/order-execution-actions.ts`)

Van **en el mismo archivo** que las dos de QC-63, a propósito: el censo de
`tests/unit/identity/session-once-per-request-actions.test.ts` es **por archivo** y ya lo cubre;
un archivo nuevo con `currentActor` lo pondría rojo.

| Acción | Entrada | Salida |
| --- | --- | --- |
| `startAssignedOrderAction` | sin cambios | la vista, ahora con `resumeStepPosition` |
| `finishAssignedOrderAction` | `FormData` + `stepPosition` | sin cambios (redirige) |
| `cancelAssignedOrderAction` (**nueva**) | `FormData` con `orderId`, `stepPosition`, `reason` | `ErrorState`, o redirige a `` `${ASSIGNED_ORDERS_ROUTE}?${CANCELLED_ORDER_PARAM}=<numero>` `` (R25 ⚑) |
| `recordStepMoveAction` (**nueva**) | `{ orderId, direction, stepPosition }` | `{ status: 'success' } \| ErrorState`; la pantalla lo ignora |

La capa driving no decide nada: actor de las dos caras de la sesión con `runInRequestScope`,
traducción por `code`. Igual que hoy.

### 6.4 La confirmación en la lista (R25 ⚑)

`lib/shared/routes.ts` gana `CANCELLED_ORDER_PARAM` (nombre de parámetro de consulta, no una ruta,
mismo caso que `DELIVERED_ORDER_PARAM`). `app/(private)/asignacion/page.tsx` pinta
`AssignedOrderCancelledNotice` («Pedido 2026-0000007 cancelado», `role="status"`), hermano de la
confirmación de entrega. Es tocar otra vez la lista de QC-88: **enmienda declarada**, la misma figura
que QC-63 usó.

## 7. Guardias y listas cerradas: qué se toca y qué muerde después

Lo que los precedentes subestimaron, archivo por archivo. «Ahora» = se pone rojo en esta rama en
cuanto el código aparece; «tras el commit» = solo muerde cuando la rama tiene diff contra `origin/dev`.

| Guardia / lista | Qué exige | Qué pasa aquí | Cuándo |
| --- | --- | --- | --- |
| `tests/guards/guard-ambito-empresa-pedidos.test.ts` | Cada método de `OrderCatalog` cableado en `const orderCatalog: OrderCatalog = {…}` a una `function` con nombre que declare `companyId: string` y lo lleve a `./company-scope`; toda función que «toca la base» (`/\b(?:prisma\|tx)\s*\./`) lo declara. | `cancelAliveById` se cablea a `cancelAliveOrderTarget` (consume vía `findAliveOrderTargetById(…, companyId, db)`). **Y la guardia se TENSA**: con `db.order.…` su regex dejaría de ver las consultas del catálogo y saldría **verde sin mirar**. Se añade `db` a `TOCA_LA_BASE`, con nota fechada y **prueba por mutación** (quitar el ámbito de una función con `db.` ⇒ rojo). | Ahora |
| `tests/unit/asignaciones/module-contract.test.ts` → `CASOS_DE_USO_QC63` | Lista **cerrada** de archivos que pueden nombrar `'asignaciones.consultar'`. | `cancel-assigned-order.ts` y `record-step-move.ts` lo nombran en su primera línea ⇒ **rojo**. Se añaden a la lista (crece, no se afloja), con nota fechada. | Ahora |
| `tests/unit/asignaciones/module-contract.test.ts` (b) | El cliente Prisma solo en `adapters/driven/persistence/`. | Los dos drivens nuevos viven ahí. Verde. | — |
| `tests/guards/guard-arquitectura-modulos.test.ts` | `@module` en cada modelo; `prisma.<modelo>` solo en su dueño; composición sin cliente Prisma; driven sin driven ajeno. | `OrderExecutionEntry` con `/// @module asignaciones`. La composición no importa `@/lib/shared/db/prisma` (`## 4`). | Ahora, si se hace mal |
| `tests/guards/guard-rls-force.test.ts` | Toda tabla creada en `db/migrations/**` con `ENABLE` + `FORCE`. | Barrido automático. Verde si la migración cierra con las dos. | Ahora |
| `tests/guards/guard-catalogo-de-errores.test.ts` | Códigos del catálogo cerrado, sin mensaje por parámetro. | `NotCancellableError` reutiliza `not_cancellable`. | Ahora, si se hace mal |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | Censo **por archivo** de acciones con `currentActor`. | Las acciones nuevas van al archivo ya censado (`## 6.3`). Si alguien las saca a otro archivo ⇒ rojo. | Ahora |
| `tests/unit/asignaciones/order-execution-actions.test.ts` | Afirma las acciones de QC-63. | Crece con las dos nuevas. | Ahora |
| `tests/unit/asignaciones/start-assigned-order.test.ts`, `finish-assigned-order.test.ts` | QC-63 R9/R10 («EN_CURSO no escribe nada») y R16 (la entrada de `finish` es solo `orderId`). | Los `deps` ganan `log` y `transaction` ⇒ no compilan hasta actualizarlos. R9 **sigue siendo cierta sobre el pedido** (`transitionAliveById` no se llama); lo que cambia es que se anota retomar (R38). R16: la entrada gana `stepPosition`, que **no** es dato de marcado. Se **tensan** con nota fechada. | Ahora |
| `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` → caso R18 de QC-63 | `git diff --name-only <merge-base> -- components/shared/step-reader` vacío. | Rojo **en cuanto se commitee** el cambio de `StepReader` (R37 ⚑). Se tensa: afirma que el diff toca **solo** `step-reader.tsx`, que las props nuevas son opcionales y que el test de fuente de QC-64 sigue verde. | **Tras el commit** |
| `tests/unit/recetas-ui/step-reader.test.tsx` | Comportamiento de QC-64. | No cambia: sin las props nuevas todo es igual. Se **añaden** casos para las nuevas. | — |
| `tests/integration/aislamiento.json` + `guard-aislamiento-integracion` | Cada `*.int.test.ts` nuevo, declarado. | `order-execution-entries-constraints.int.test.ts` → `transaccion`. `execution-atomicity.int.test.ts` → **`commit`** con `motivo` y `desde`: `withExecutionTransaction` abre su propia transacción con el cliente global, y envolverla en la del test sería un aislamiento de mentira. | Ahora |
| `tests/unit/pedidos/order-view.test.ts` | `OrderRepository` tiene seis métodos y `cancelAlive` es el único con `reason`. | `OrderRepository` **no cambia de forma** (el parámetro nuevo es de la función del adaptador, no del puerto). Verde. | — |
| `tests/unit/pedidos/*` y `tests/integration/pedidos/*` sobre `cancelAliveOrder` | Firma y semántica de hoy. | El parámetro es opcional y sin él nada cambia. Verde. | — |
| `e2e/ejecucion-receta.spec.ts` | Camino feliz de QC-63. | Debería seguir verde; si la pantalla gana el botón de cancelar en la misma fila, revisar selectores. | Solo al correr Playwright |

## 8. Multiplataforma (R36)

Botón de cancelar y botones del diálogo con `min-h-11 min-w-11`; `Textarea` con `text-base` (16 px);
el motivo del rechazo como texto en el DOM, nunca `title`; todo alcanzable con teclado (el
`AlertDialog` de Radix atrapa el foco y cierra con Escape). **Ninguna excepción de escritorio**: se
usa en planta, en móvil o tablet.

## 9. Dependencias de terceros

**Ninguna** (`[D18]`, R35). `AlertDialog`, `Textarea` y `Button` son de shadcn/ui y ya están en
`components/ui/`; la validación es `zod`; la transacción es `prisma.$transaction`, ya usado en nueve
adaptadores driven. `docs/dependencias.md` no cambia.

## 10. Alternativas descartadas

**10.1 — Abrir la transacción en `lib/composition` con `prisma.$transaction`. DESCARTADA.**
Es lo más corto, y la composición ya ata las dos mitades. Pero `guard-arquitectura-modulos` prohíbe a
`lib/composition` importar el cliente Prisma compartido (su regla R17), y la cabecera de
`orderAssignmentRepository` en la composición ya dejó escrito que abrir una transacción ahí «sería
meter una decisión de ejecución en el punto de composición». Se abre en un driven y la composición
solo reparte el cliente.

**10.2 — Que `pedidos` escriba también la anotación. DESCARTADA.**
Resolvería la atomicidad dentro de un solo módulo, pero `pedidos` pasaría a saber de pasos,
posiciones y retomar, que son de la ejecución, y la tabla tendría el dueño equivocado. Es el
«repositorio compartido entre módulos» que `docs/architecture.md > Dominio` n.º 2 prohíbe, con otro
nombre.

**10.3 — Escribir en dos pasos y compensar si falla el segundo (saga). DESCARTADA.**
No es «o las dos o ninguna»: entre las dos escrituras un fallo de proceso deja una sin la otra, y la
compensación consiste en **borrar o editar** una anotación o **deshacer** un estado del pedido; lo
primero lo prohíbe `[D13]` y lo segundo lo prohíbe la matriz de transiciones (`EN_CURSO` no vuelve a
`PENDIENTE`, `CANCELADO` no sale).

**10.4 — Un trigger de Postgres que anote al cambiar `orders.status`. DESCARTADA.**
El trigger no sabe la posición del paso, no distingue arrancar de un cambio hecho a mano desde la
pantalla de pedidos, y metería lógica de negocio en la base, donde ningún test de dominio la ve.

**10.5 — Filtrar solo en la base (`INSERT ... SELECT ... WHERE status = …`) sin transacción. DESCARTADA.**
Una sentencia de `asignaciones` que lea `orders` es exactamente el `prisma.order` fuera de su módulo
que la guardia prohíbe.

**10.6 — Que `cancelAliveById` escriba `CANCELADO` con su propio `updateMany`. DESCARTADA.**
Tendría `from` en el `WHERE` sin tocar `order-prisma.ts` —menos solape con QC-68—, pero habría **dos**
sentencias capaces de escribir `CANCELADO` y el motivo, y `[D6]` pide el camino único. Se paga el
parámetro opcional en `cancelAliveOrder`.

**10.7 — Recuperar el paso en el cliente (`localStorage`). DESCARTADA.**
`[D12]` dice «el último paso anotado **de ese pedido**», no de ese navegador: otro responsable en otra
tablet tiene que volver al mismo sitio. Y QC-64 R19 prohíbe guardar estado del asistente en el
navegador.

**10.8 — Montar `StepReader` sin tocarlo, con `key` y clics simulados. DESCARTADA.**
No se puede empezar en el paso 3 sin marcar los pasos 1 y 2, que el asistente bloquea sin escape
(QC-63 `[D4]`); y leer el cambio de paso del DOM sería acoplarse a sus `data-testid`. Las dos props
opcionales son lo mínimo, y es R37 ⚑.

**10.9 — Mandar avanzar/retroceder sin cadena, en paralelo. DESCARTADA.**
Dos Siguiente seguidos pueden llegar al revés; la última anotación sería la del paso 2 y la recarga
volvería atrás sin motivo. La cadena cuesta unas líneas y no bloquea la pantalla.

## 11. Archivos que la feature va a tocar

> **Para F1.4 — cruce con QC-68 (`pedidos`, `in_progress`, zona `backend`) y QC-92 (`inventario`,
> `pending`, zona `fullstack`).** Esta lista es la que hay que cruzar con las ramas vivas, no con sus
> specs. Solapes esperables, dichos antes de mirar:
> - **QC-68** («búsqueda y total en el listado de pedidos»): lo probable es que toque
>   `order-prisma.ts` (listado) y quizá `order-catalog.ts`/`index.ts` de `pedidos`. Aquí se tocan
>   `order-prisma.ts` **solo en `cancelAliveOrder`**, `order-catalog.ts`, `order-catalog-prisma.ts`,
>   `cancel-order.ts` y se crea `order-cancellation.ts`. **Riesgo real de solape en
>   `order-prisma.ts`**; si QC-68 lo toca, se decide el orden de merge.
> - **QC-92** («ajuste de inventario»): aquí no se toca ningún archivo de `inventario`. El único punto
>   común previsible es `lib/composition/index.ts` y `db/schema.prisma` + una migración nueva
>   (archivos calientes, bloques distintos).

**Nuevos**

| Archivo | Qué |
| --- | --- |
| `db/migrations/20260918120000_order_execution_entries/migration.sql` | UP (`## 2.2`) |
| `db/migrations/20260918120000_order_execution_entries/down.sql` | DOWN |
| `lib/modules/asignaciones/domain/execution-entry.ts` | Tipos de la anotación |
| `lib/modules/asignaciones/domain/cancel-assigned-order.ts` | Caso de uso de cancelar |
| `lib/modules/asignaciones/domain/record-step-move.ts` | Caso de uso de avanzar/retroceder |
| `lib/modules/asignaciones/ports/execution-log-repository.ts` | Puerto del registro |
| `lib/modules/asignaciones/ports/execution-transaction.ts` | Puerto de transacción |
| `lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma.ts` | Adaptador del registro (fábrica con `db`) |
| `lib/modules/asignaciones/adapters/driven/persistence/execution-transaction-prisma.ts` | `withExecutionTransaction` |
| `lib/modules/pedidos/domain/order-cancellation.ts` | `isCancellableStatus` |
| `app/(private)/asignacion/[id]/components/order-cancel-dialog.tsx` | Diálogo del motivo |
| `app/(private)/asignacion/components/assigned-order-cancelled-notice.tsx` | Confirmación en la lista (R25 ⚑) |
| `tests/unit/asignaciones/schema/order-execution-entries-migration.test.ts` | R1, R3, R5–R8, R32–R34 sobre el SQL |
| `tests/unit/asignaciones/execution-log-repository.test.ts` | R31 (forma del puerto) |
| `tests/unit/asignaciones/cancel-assigned-order.test.ts` | R9, R10, R22–R24, R26–R30 |
| `tests/unit/asignaciones/record-step-move.test.ts` | R17, R18, R20, R26–R28 |
| `tests/unit/pedidos/order-cancellation.test.ts` | R29 (una definición, dos consumidores) |
| `tests/unit/pedidos/order-catalog-cancel.test.ts` | R29 (`cancelAliveById`) |
| `tests/unit/asignaciones-ui/order-cancel-dialog.test.tsx` | R9, R11, R22, R36 |
| `tests/unit/asignaciones-ui/order-execution-step-log.test.tsx` | R13, R14, R17–R19 en la pantalla |
| `tests/unit/asignaciones-ui/assigned-orders-cancelled-notice.test.tsx` | R25 |
| `tests/integration/asignaciones/order-execution-entries-constraints.int.test.ts` | R1, R5–R8, R32 contra Postgres |
| `tests/integration/asignaciones/execution-atomicity.int.test.ts` | R16, R24, R29 contra Postgres |
| `e2e/registro-ejecucion.spec.ts` | R39, R40 |

**Modificados**

| Archivo | Qué cambia | Riesgo |
| --- | --- | --- |
| `db/schema.prisma` | `+ enum OrderExecutionAction`, `+ model OrderExecutionEntry` (al final) | Medio: caliente |
| `lib/modules/asignaciones/domain/start-assigned-order.ts` | `start`/`resume` + transacción | Medio |
| `lib/modules/asignaciones/domain/finish-assigned-order.ts` | `stepPosition` + `finish` en transacción | Bajo |
| `lib/modules/asignaciones/domain/assigned-order-execution-view.ts` | `+ resumeStepPosition` | Bajo |
| `lib/modules/asignaciones/domain/errors.ts` | `+ NotCancellableError` | Bajo |
| `lib/modules/asignaciones/index.ts` | `+` factories nuevas, `*Deps`, tipos | Bajo |
| `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts` | `+` dos acciones; `finish` lee `stepPosition` | Bajo |
| `lib/modules/pedidos/domain/order-catalog.ts` | `+ cancelAliveById` | Bajo |
| `lib/modules/pedidos/domain/cancel-order.ts` | usa `isCancellableStatus` | Bajo |
| `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts` | `db` opcional, `cancelAliveOrderTarget`, `orderCatalogOn` | Medio |
| `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` | **solo `cancelAliveOrder`**: `options?: { from, db }` | **Medio: posible solape con QC-68** |
| `lib/composition/index.ts` | `orderCatalog.cancelAliveById`, repositorio del registro, `executionTransaction`, fachada | **Medio: archivo caliente** |
| `lib/shared/routes.ts` | `+ CANCELLED_ORDER_PARAM` (R25 ⚑) | Bajo |
| `components/shared/step-reader/step-reader.tsx` | dos props opcionales (R37 ⚑) | Medio: compartido con QC-64 |
| `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` | posición, cadena, botón de cancelar | Medio |
| `app/(private)/asignacion/[id]/components/index.ts` | `+ OrderCancelDialog` | Bajo |
| `app/(private)/asignacion/page.tsx` | pinta la confirmación de cancelado (R25 ⚑) | **Medio: es de QC-88** |
| `app/(private)/asignacion/components/index.ts` | `+ AssignedOrderCancelledNotice` | Bajo |
| `tests/guards/guard-ambito-empresa-pedidos.test.ts` | `TOCA_LA_BASE` ve `db.`; **tensada** | Medio |
| `tests/unit/asignaciones/module-contract.test.ts` | `CASOS_DE_USO_QC63` crece | Bajo |
| `tests/unit/asignaciones/start-assigned-order.test.ts` | deps nuevas; R9 tensado | Bajo |
| `tests/unit/asignaciones/finish-assigned-order.test.ts` | deps nuevas; R16 tensado | Bajo |
| `tests/unit/asignaciones/order-execution-actions.test.ts` | acciones nuevas | Bajo |
| `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` | caso R18 de QC-63 tensado | Medio |
| `tests/unit/recetas-ui/step-reader.test.tsx` | casos nuevos para las props | Bajo |
| `tests/integration/pedidos/order-repository.int.test.ts` | `+` caso de `cancelAliveOrder` con `from` (sin él, los casos de hoy no cambian) | Bajo |
| `tests/integration/aislamiento.json` | dos entradas | Bajo |
| `specs/QC-63-ejecutar-receta-operador/requirements.md` | nota fechada al pie: R10 y R18 enmendadas por QC-82 R37/R38 | Bajo |

**Sin tocar, a propósito:** `lib/modules/identity/domain/permissions.ts` y el seed (R30),
`lib/modules/pedidos/domain/order-transitions.ts`, `lib/modules/asignaciones/domain/order-state.ts`,
`lib/modules/pedidos/ports/order-repository.ts` (el puerto no cambia de forma),
`lib/modules/errores/**` (ningún código nuevo), `app/(private)/pedidos/**`, `lib/modules/inventario/**`,
`package.json`.

## 12. Puntos para F1.4 — no salen de la acotación

Cada uno tiene una propuesta escrita en los requisitos marcados ⚑. **Ninguno se implementa sin que
el humano lo ratifique o lo cambie.**

1. **Enmendar QC-63 R18: `StepReader` gana dos props opcionales (R37).** `[D5]` y `[D12]` lo hacen
   inevitable (`## 10.8`), pero QC-63 escribió «NO DEBE modificar ninguno de sus archivos» y tiene un
   test de diff que se pondrá rojo tras el commit. Es la misma figura que QC-63 usó con QC-88: enmienda
   declarada, test tensado con nota fechada.
2. **Receta sin pasos (R5).** `StepReader` enseña un estado vacío sin Siguiente ni Finalizar. Se
   propone `step_position` **anulable** solo para ese caso. Alternativa: prohibir `NULL` y anotar 1
   aunque no exista el paso 1.
3. **Si falla anotar retomar, ¿no se abre la pantalla? (R15).** `[D11]` pone retomar en el grupo de
   «la misma operación», pero retomar no cambia nada del pedido. La propuesta es la lectura estricta:
   sin anotación, no se abre. La otra lectura —abrir igual y perder la anotación— es la de avanzar.
4. **Pedido `EN_CURSO` sin ninguna anotación (R14, primera mitad).** Existe hoy: todo pedido que QC-63
   puso `EN_CURSO` antes de esta ficha, o que la oficina movió a mano. Propuesta: empezar en el paso 1.
5. **Posición anotada mayor que los pasos de la receta editada (R14, segunda mitad).** Propuesta:
   abrir en el último paso, sin error. Es la consecuencia de `[D9]`, pero el cómo no está decidido.
6. **Confirmación visible al cancelar (R25).** `[D6]` pide el botón y el motivo, no qué pasa después.
   Propuesta: volver a la lista con «Pedido X cancelado», gemela de la de entrega. Obliga a tocar otra
   vez `app/(private)/asignacion/page.tsx` (de QC-88) y `lib/shared/routes.ts`. Alternativa: volver
   a la lista sin confirmación.
7. **Cancelaciones y entregas hechas desde la pantalla de pedidos (QC-35, oficina).** No se anotan:
   la acotación habla de la pantalla de ejecución y la ficha dice que la conecta a ella. Si el humano
   quiere que también se anoten, es otra ficha (tocaría `pedidos` y su pantalla).
8. **Tensar `guard-ambito-empresa-pedidos`** para que vea `db.` además de `prisma.` y `tx.` (`## 7`).
   No es opcional si el catálogo pasa a aceptar el cliente por parámetro —sin esto la guardia queda
   ciega—, pero es tocar una guardia y se dice.

## 13. Riesgos

1. **Solape con QC-68 en `order-prisma.ts`** (`## 11`). Mitigación: el cambio se limita a la firma y
   al `where` de `cancelAliveOrder`.
2. **Orden de las anotaciones en el mismo instante.** `occurred_at` sale del reloj del servidor con
   precisión de milisegundo; la cadena de la pantalla serializa las de un mismo navegador. Dos
   responsables en dos tablets moviendo el mismo pedido en el mismo milisegundo desempatan por `id`,
   sin significado. Es la consecuencia que `[D12]` ya acepta («puede volver a un paso anterior al
   real»).
3. **Cada petición de la página anota un retomar.** La página es un `GET` con efecto desde QC-63; ahora
   además escribe una fila. El `<Link>` de la lista a una ruta dinámica no pide el RSC de la página al
   prefetchear, así que no debería anotar al pasar el ratón; **no está verificado** en este repo y lo
   comprueba el E2E (tras abrir y recargar una vez: una sola fila de retomar).
4. **Transacciones interactivas sobre el pooler** (`DATABASE_URL` en modo transacción). Ya las usan
   nueve adaptadores driven; no es nuevo, pero sí la primera que cruza dos módulos.
5. **La posición no se valida contra la receta** (`## 3.3`): una petición forjada puede anotar la
   posición 999. Al retomar se recorta al último paso (punto 5 de `## 12`). Se acepta por el mismo
   motivo que `[D9]`.
