# QC-82 — registro-de-ejecucion-de-receta · design.md

> Escrito el 2026-09-18 contra la base `4c057594` y **revisado el 2026-09-24** contra `dev` tras el
> merge `9634f6ae` (la rama iba 813 commits por detrás). Lo que no sale de la acotación no se
> rellena: está en `## 12. Puntos para F1.4` (y las dos preguntas de la revisión, ya cerradas como
> `D19` y `D20`), y los
> requisitos que dependen de ellos van marcados ⚑.

## Revisión 2026-09-24 — qué cambió y por qué

Nada de lo que decidió el humano cambia. Cambia **cómo** se construye, porque el código de `dev`
ya no es el del 2026-09-18. Punto por punto:

1. **`pedidos` abre ya su propia transacción, y la comparte con `inventario`** (QC-141). Existe el
   puerto `OrderUnitOfWork` (`pedidos/ports/order-unit-of-work.ts`), que abre `withOrderTransaction`
   (`order-unit-of-work-prisma.ts`, `maxWait` 10 s, `timeout` 30 s) y cablea `lib/composition`.
   `OrderCatalog.transitionAliveById` **ya no es una función del adaptador**: es
   `createTransitionOrder({ unitOfWork: orderUnitOfWork })`, un caso de uso de dominio que bloquea
   el pedido con `FOR UPDATE`, y hacia `ENTREGADO` consume el material y escribe `finished_at`
   (QC-145) en la misma transacción. **El plan viejo ya no sirve**: añadir `db` a las funciones del
   catálogo y atarlas con `orderCatalogOn(db)` no alcanza a `transitionAliveById`, y llamar a
   `orderUnitOfWork` dentro de otra transacción abriría **una segunda** transacción en otra conexión,
   que no es «la misma operación». Solución nueva en `## 4`: una **unidad de trabajo unida**, que no
   abre nada y reutiliza la transacción de la ejecución, construida con **el mismo** constructor de
   ámbito que la de `pedidos`. Y una regla que la hace segura: **dentro de la transacción de ejecución,
   todo desenlace distinto de `'ok'` aborta la transacción entera**.
2. **Cancelar ya no es una sola sentencia.** `cancel-order.ts` bloquea el pedido, comprueba otra vez
   que sea cancelable **bajo el candado**, escribe `CANCELADO` y el motivo (`cancelAlive`, único
   método que puede), **libera el material apartado** (`releaseForOrder`) y pone `reserved_at` a
   `NULL`, todo en `OrderUnitOfWork`. Consecuencias: (a) **`order-prisma.ts` y
   `order-catalog-prisma.ts` salen del diff**: `cancelAliveOrder` no necesita `from` ni `db`, porque
   la comprobación bajo el candado ya impide cancelar un pedido que otro acaba de entregar. T4
   desaparece. (b) El cuerpo de la cancelación se extrae **una vez** y lo usan `cancelOrder` y la
   cancelación desde la pantalla (`## 5`). (c) Seguir el camino único libera **todo** el material,
   también el que el operario ya pudo gastar. Se preguntó y el humano lo cerró como **`D19`**: se
   libera todo, y lo gastado se da de baja después con un ajuste de inventario (QC-92), fuera de
   esta ficha.
3. **La cancelación no entra en `OrderCatalog`, sino en un contrato propio, `OrderCancellation`.**
   `OrderCatalog` tiene hoy **11 dobles** en tests que se romperían al compilar, y el `orderCatalog`
   global de la composición tendría que cablear un `cancelAliveById` que nadie llama: `asignaciones`
   solo cancela dentro de la transacción de ejecución. Alternativa descartada en `## 10.6`.
4. **Finalizar puede fallar por material** (QC-141): `transitionAliveById` devuelve
   `'insufficient_material'` o `'recipe_without_lines'`, y `finish-assigned-order.ts` ya los traduce a
   `MaterialShortageError` y `RecipeWithoutLinesError`. R24 lo nombra ahora: si la entrega se rechaza,
   no queda ni la anotación ni el consumo.
5. **`StepReader` ya no es el del 2026-09-18.** Tiene `minStepSeconds` (QC-125) y `mode`
   (`'lectura' | 'ejecucion'`, enmienda fuera de SDD del 2026-09-21); la pantalla lo monta con
   `mode="ejecucion"` y 5 s de espera. El test del R18 de QC-63 **ya lo tensó QC-125** a una lista
   cerrada que admite `step-reader.tsx`: esta ficha **no tiene que tensarlo**, solo no tocar otro
   archivo de la carpeta.
6. **La migración colisionaba.** `20260918120000_order_execution_entries` tenía el mismo timestamp que
   `20260918120000_inventory_movement_kind_enum_and_reason_catalog` y quedaba **detrás** de 13
   migraciones ya en `dev`. La última de `dev` hoy es `20260924120000_customers`: la de esta ficha
   lleva un timestamp **posterior**, fijado al crearla y recomprobado antes del PR (`## 2.2`).
7. **Listas cerradas y archivos nuevos que el spec viejo no veía**: `recipe-route-contract.test.ts`
   (exportaciones exactas de `lib/shared/routes.ts`), `empacador-authorization.test.ts` y dos
   integraciones que construyen `start`/`finish` con sus deps, el mock del módulo de acciones del test
   de la pantalla, y las limpiezas de E2E e integración que borran pedidos después de abrir la pantalla
   (la FK `RESTRICT` nueva las haría fallar). Tabla en `## 7`.
8. **El punto 8 viejo de F1.4 (tensar `TOCA_LA_BASE` para ver `db.`) ya no aplica**: ninguna función
   del catálogo gana parámetro. En su lugar, `guard-ambito-empresa-pedidos` gana **un caso** que vigila
   el contrato nuevo y los dos cableados sobre la transacción unida (`## 7`). Es la misma figura que
   el humano ratificó: tensar, nunca aflojar.
9. **El cruce de F2.0 cambia de socios.** QC-68 y QC-92 están `done` y su código está en `dev`: el
   cruce que dejó el F2.0 esperando **ya no existe**. Los socios nuevos son **QC-150**
   (`producto-terminado`, `fullstack`, `in_progress`), que mete un lote de producto terminado en el
   Finalizar, es decir, en `transition-order.ts`, en el ámbito de `OrderUnitOfWork` y quizá en
   `finish-assigned-order.ts`; y **QC-153** (`modelo-de-clientes`, `backend`, `in_progress`), por
   `db/schema.prisma` y las migraciones. Detalle en `## 11`.
10. **`/asignacion` tiene vistas por permiso** (QC-145). El aviso de cancelado va donde el de
    entrega, **encima** de las pestañas, así que se ve en cualquier vista. Quien tiene
    `pedidos.consultar` ya no puede ser responsable (`user_cannot_be_responsible`): el E2E asigna al
    Operador, que no lo tiene, y comprueba el motivo leyendo la base.
11. **Base propia.** Migración, integración y E2E contra `QuimiCloude_QC82`, nunca contra la del
    `.env`. Y una sola E2E a la vez en la máquina (`tasks.md`, cabecera).
12. **La pantalla** muestra hoy «% · cantidad» por línea (QC-147) y ya no tiene factor de escala. No
    afecta a esta ficha: el registro no guarda nada de las líneas.

## 0. Lo que ya existe y NO se construye aquí

| Pieza | Dónde | Qué aporta a esta ficha |
| --- | --- | --- |
| Pantalla de ejecución | `app/(private)/asignacion/[id]/` (`page.tsx`, `components/order-execution-screen.tsx`) | `page.tsx` abre con `requirePagePermission('asignaciones.consultar')` y llama a `startAssignedOrderAction(id)`, que transiciona y lee en una sola llamada. Monta `StepReader` con `mode="ejecucion"` y `minStepSeconds={5}`. Avanzar y retroceder son **solo de cliente**. Finalizar es un `<form>` con `orderId` oculto. |
| Asistente de pasos | `components/shared/step-reader/step-reader.tsx` | Props `steps`, `onFinish`, `title`, `minStepSeconds`, `mode`. `index` empieza en `0`; no expone ningún aviso de cambio de paso. **R13, R17 y R18 no se cumplen sin tocarlo** (`## 6.1`). |
| Casos de uso de ejecución | `asignaciones/domain/{get-assigned-order-execution,start-assigned-order,finish-assigned-order}.ts` | Orden fijo: `requirePermission(actor, 'asignaciones.consultar')` → `zod` → `listOrderIdsByUserInCompany` (no es tuyo = no existe) → `findAliveById(orderId, actor.companyId)`. `start` tolera `'stale'` releyendo. `finish` lee el número **antes** de escribir y traduce `insufficient_material` y `recipe_without_lines`. Se **reutiliza el patrón**. |
| Estados que congelan | `asignaciones/domain/order-state.ts` → `assertOrderAcceptsWrites` | `ENTREGADO` → `order_delivered_frozen`, `CANCELADO` → `order_cancelled_not_assignable`. |
| Contrato de `pedidos` para otros módulos | `pedidos/domain/order-catalog.ts` (`OrderCatalog`: `findAliveById`, `listAliveSummariesByIds`, `listAliveSummariesInCompany`, `transitionAliveById`) | Las tres lecturas son funciones de `order-catalog-prisma.ts` sobre el `prisma` global. `transitionAliveById` es `createTransitionOrder` (`pedidos/domain/transition-order.ts`) sobre `OrderUnitOfWork`. |
| Unidad de trabajo de `pedidos` | `pedidos/ports/order-unit-of-work.ts` (`OrderUnitOfWork`, `OrderTransactionScope` = `orders` + `reservations` + `recipes`), `order-unit-of-work-prisma.ts` (`withOrderTransaction`) y su cableado en `lib/composition/index.ts` (`orderUnitOfWork`) | La composición construye el ámbito con **el mismo `tx`** para los tres. **Es lo que esta ficha reutiliza** para meter la anotación en la misma transacción (`## 4`). |
| Cancelación | `pedidos/domain/cancel-order.ts` (`CANCELABLES = ['PENDIENTE','EN_CURSO']`, **no exportada**) | Dentro de `OrderUnitOfWork`: `lockAliveById` → re-comprobación bajo el candado → `cancelAlive` → `releaseForOrder` (`reason: 'release'`) → `setReservedAt(null)`. Exige `pedidos.modificar`. `cancelAlive` (`OrderWriteRepository`, `cancelAliveOrder` en `order-prisma.ts`) es el **único** método que escribe `CANCELADO` y el motivo; lo usan `cancelOrder` y la caducidad diaria. |
| Regla del motivo | `pedidos/domain/order-input.ts` → `cancelOrderSchema` (recorte, 1..500), **publicado** en el barril | Se reutiliza aquí (R10). La UI de `pedidos` ya la importa desde cliente. |
| `CHECK` precedente | `orders_cancellation_reason_matches_status`: `("status"::text = 'CANCELADO') = ("cancellation_reason" IS NOT NULL)` | Forma literal del `CHECK` de R8 (`[D4]`). |
| Claves candidatas para FK compuestas | `orders_id_company_id_key` (QC-60), `users_id_company_id_key` (QC-83) | La empresa de la anotación es la del pedido y la de la persona **por construcción** (R7). |
| Repositorio con cliente inyectable | `createOrderAssignmentRepository(db = prisma)`, `createOrderWriteRepository(tx = prisma)` | Molde de la fábrica del registro. |
| Confirmación al volver a la lista | `DELIVERED_ORDER_PARAM` (`lib/shared/routes.ts`) + `AssignedOrderDeliveredNotice`, pintado en `app/(private)/asignacion/page.tsx` encima de las pestañas | Molde de R25 ⚑. |
| Catálogo de errores | `lib/modules/errores/domain/error-catalog.ts` | Ya trae `not_cancellable`, `order_not_found`, `invalid_input`, `unauthorized`, `order_delivered_frozen`, `order_cancelled_not_assignable`, `insufficient_material`, `recipe_without_lines`. **Ningún código nuevo.** |

## 1. La forma de la solución, en una frase

Una tabla nueva **del módulo `asignaciones`** con una fila por gesto; dos casos de uso nuevos
(`cancelAssignedOrder`, `recordStepMove`) y dos ampliados (`start`, `finish`); un **puerto de
transacción** de `asignaciones` que `lib/composition` cablea para que la anotación y el cambio de
`pedidos` (con lo que `pedidos` escriba en `inventario`) compartan **una sola transacción de base de
datos**, sin que ningún módulo toque las tablas de otro; y una pantalla que monta `StepReader` con
dos props opcionales nuevas.

## 2. Modelo de datos

### 2.1 La tabla `order_execution_entries` (modelo `OrderExecutionEntry`, `/// @module asignaciones`)

| Columna | Tipo | Nulo | Por qué |
| --- | --- | --- | --- |
| `id` | `UUID` PK, `gen_random_uuid()` | no | Convención del repo. |
| `company_id` | `UUID` | no | Columna propia de empresa (`[D15]`, R7). Cumple también `guard-empresa-en-esquema`. |
| `order_id` | `UUID` | no | El pedido es obligatorio (`[D14]`, R6). |
| `user_id` | `UUID` | no | Quién (R2). |
| `action` | enum `OrderExecutionAction` | no | `START`, `RESUME`, `ADVANCE`, `GO_BACK`, `CANCEL`, `FINISH`: **seis y ninguno más** (`[D1]` enmendada por `[D12]`, R1). |
| `step_position` | `INTEGER` | **sí** ⚑ | La posición, desde 1 (`[D9]`, R4). `NULL` solo si la receta no tiene pasos (R5 ⚑). |
| `reason` | `TEXT` | sí | El motivo; sin longitud en la columna, igual que `orders.cancellation_reason`: el tope vive en `cancelOrderSchema` (R10). |
| `occurred_at` | `TIMESTAMPTZ(6)` | no, **sin default** | El único instante (`[D10]`, R3). Lo pone el caso de uso con el **mismo `now`** que pasa a `pedidos`, así coincide con el `updated_at` del pedido (y con `finished_at` al finalizar). |

**No hay `created_at`, `updated_at` ni `deleted_at`**: `[D10]` fija una sola columna de tiempo y
`[D13]` prohíbe editar o borrar. La purga física es de **QC-124**.

**Restricciones escritas a mano** (Prisma no modela `CHECK` ni FK compuestas sin `@relation`):

```sql
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_reason_matches_action"
  CHECK (("action"::text = 'CANCEL') = ("reason" IS NOT NULL));

ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_step_position_positive"
  CHECK ("step_position" IS NULL OR "step_position" >= 1);

ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_order_id_company_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_user_id_company_id_fkey"
  FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

`RESTRICT` en las dos: `orders` y `users` tienen borrado lógico, así que un `DELETE` físico sobre
ellos es una anomalía y tiene que ser ruidosa, igual que en `order_assignments`. **Efecto que el spec
viejo no contaba:** todo test o E2E que abra la pantalla (y por tanto anote) y después borre pedidos
físicamente en su limpieza **fallará** hasta que borre antes las anotaciones de esa empresa (`## 7`).

**Índices:**

- `order_execution_entries_order_id_occurred_at_idx` sobre `("order_id", "occurred_at" DESC)`: «la
  última posición anotada de este pedido» (R13), en **cada** apertura de la pantalla.
- `order_execution_entries_user_id_idx` sobre `("user_id")`: la comprobación del `RESTRICT` hacia
  `users`.
- **Sin índice por `company_id`**: nadie consulta el registro por empresa sola.

**RLS** activada y forzada, **sin policies**, **al final** de la migración (R32).

**Identificadores** (R33, `[D16]`): inglés y `snake_case`; los valores del enum, en mayúsculas.

### 2.2 La migración

`db/migrations/<AAAAMMDDhhmmss>_order_execution_entries/` con `migration.sql` y `down.sql`. El
timestamp **tiene que ser mayor que el de la última migración de `dev`** (hoy
`20260924120000_customers`): lo pone `db:migrate:create` al crearla, y antes del PR se comprueba otra
vez contra `origin/dev`; si `dev` trajo una posterior, se renombra la carpeta.

- **UP**, en este orden: `CREATE TYPE "OrderExecutionAction"` → `CREATE TABLE` → los dos índices →
  los dos `CHECK` → las dos FK → `ENABLE` + `FORCE ROW LEVEL SECURITY`.
- **Drift de Prisma**: `migrate dev --create-only` emitirá `DROP CONSTRAINT`/`DROP INDEX` sobre lo
  escrito a mano en otras tablas. **Se borra a mano del SQL generado.** La migración **no ejecuta
  ningún DDL sobre una tabla preexistente** y **no inserta permisos** (R30).
- **DOWN**: `DROP TABLE "order_execution_entries";` (sin `CASCADE`) y `DROP TYPE
  "OrderExecutionAction";`.
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

export type NewExecutionEntry =
  | (Base & { readonly action: Exclude<ExecutionAction, 'cancel'> })
  | (Base & { readonly action: 'cancel'; readonly reason: string });
```

El cruce `'go_back'` ↔ `GO_BACK` lo hace el adaptador, con un mapa total (`satisfies
Record<ExecutionAction, …>`).

En el mismo archivo, **`ExecutionAbortedError`**: una clase **interna** del dominio (`extends Error`,
no `AsignacionesError`, no se publica en el barril) que lleva el desenlace de `pedidos` que abortó la
transacción. La lanza el trabajo de dentro de `transaction.run` y la atrapa el propio caso de uso
**nada más salir** de `run`, para traducirla. Precedente exacto:
`StatusChangeAfterConsumptionFailedError` de `pedidos/domain/transition-order.ts`. Nunca llega al
adaptador driving.

### 3.2 Los dos puertos nuevos (`ports/`)

```ts
// ports/execution-log-repository.ts
export interface ExecutionLogRepository {
  append(entry: NewExecutionEntry): Promise<void>;
  /** La posicion de la ULTIMA anotacion con posicion de ese pedido en esa empresa, o null. */
  findLastStepPosition(companyId: string, orderId: string): Promise<number | null>;
}
```

**Sin `update`, sin `delete`** (R31). «La última» = `ORDER BY occurred_at DESC, id DESC LIMIT 1`
sobre las filas con `step_position IS NOT NULL`.

```ts
// ports/execution-transaction.ts
import type { OrderCancellation, OrderCatalog } from '@/lib/modules/pedidos';

export type ExecutionWriters = {
  /** Solo las dos escrituras de `pedidos`: dentro de la transaccion no se lee nada mas. */
  readonly orders: Pick<OrderCatalog, 'transitionAliveById'> & OrderCancellation;
  readonly log: ExecutionLogRepository;
};
export interface ExecutionTransaction {
  run<T>(work: (writers: ExecutionWriters) => Promise<T>): Promise<T>;
}
```

`run` promete **una** cosa: lo que `work` escriba por `writers` —incluido lo que `pedidos` escriba en
`inventario` por dentro— **se confirma entero o no se confirma nada**, y se deshace entero **si `work`
lanza**. Por eso la regla de `## 4`: el trabajo **lanza** ante cualquier desenlace que no sea `'ok'`.

### 3.3 Los casos de uso

Todos con el prólogo de QC-63 (R26, R27, R28): `requirePermission(actor, 'asignaciones.consultar')` en
la **primera línea** → `zod` strict → `listOrderIdsByUserInCompany(actor.companyId, actor.id)` (no es
tuyo ⇒ `OrderNotFoundError`) → `orders.findAliveById(orderId, actor.companyId)` (`null` ⇒
`OrderNotFoundError`). Las lecturas van **fuera** de la transacción, sobre el `OrderCatalog` global.

| Caso de uso | Entrada (`zod` strict) | Qué escribe | Cómo |
| --- | --- | --- | --- |
| `startAssignedOrder` (**ampliado**) | `{ orderId }` (sin cambios) | `PENDIENTE`: transición + `start` | Lee la vista **antes** de escribir (mismas consultas que hoy, en otro orden) para saber si hay pasos (R5). En `transaction.run`: `orders.transitionAliveById(…, 'PENDIENTE', 'EN_CURSO', …)`; si no es `'ok'`, lanza `ExecutionAbortedError`; si lo es, `log.append(start)`. Fuera: `'stale'` ⇒ relee y sigue (R16); `'not_found'` ⇒ `OrderNotFoundError`. |
| | | `EN_CURSO`: solo `resume` | `log.findLastStepPosition` → posición (o 1, R14 ⚑) → `log.append(resume)`, fuera de transacción (una sola sentencia). **Si falla, lanza** y la pantalla no abre (R15 ⚑). |
| `finishAssignedOrder` (**ampliado**) | `{ orderId, stepPosition }` | transición a `ENTREGADO` (con el consumo y `finished_at` que `pedidos` hace por dentro) + `finish` | En `transaction.run`, mismo esquema. Fuera, igual que hoy: `'stale'` ⇒ relee y reintenta; `'insufficient_material'` ⇒ `MaterialShortageError`; `'recipe_without_lines'` ⇒ `RecipeWithoutLinesError`; `'not_found'` ⇒ `OrderNotFoundError`. |
| `cancelAssignedOrder` (**nuevo**) | `{ orderId, stepPosition, reason }` — `reason` con `cancelOrderSchema.shape.reason` del barril de `pedidos` (R10) | `CANCELADO` + motivo + liberación de todo el material (`[D19]`) + `cancel` con el mismo motivo | Lee el número **antes** de escribir (como `finish`), para R25 ⚑. En `transaction.run`: `orders.cancelAliveById(orderId, companyId, reason, actor.id, now)`; si no es `'ok'`, lanza `ExecutionAbortedError`; si lo es, `log.append({ action: 'cancel', reason, … })`. Fuera: `'not_cancellable'` ⇒ `NotCancellableError`; `'not_found'` ⇒ `OrderNotFoundError`. Sin `'stale'`: la comprobación va bajo el candado. |
| `recordStepMove` (**nuevo**) | `{ orderId, direction: 'advance' \| 'go_back', stepPosition }` | `advance` / `go_back` | Solo si el pedido está `EN_CURSO` (R20); si no, lanza sin escribir (`assertOrderAcceptsWrites` para los cerrados, `OrderNotFoundError` para `PENDIENTE`). Un solo `log.append`: **sin** transacción. |

**Deps nuevas:** `start` y `finish` ganan `log` y `transaction`; `cancelAssignedOrder` recibe
`assignments`, `orders` (`OrderCatalog`, para leer), `transaction` y `now`; `recordStepMove` recibe
`assignments`, `orders`, `log` y `now`.

**`stepPosition`**: `z.number().int().min(1).nullable()` (en `FormData`, `z.coerce` o conversión
explícita en el adaptador driving). El servidor **no** la contrasta con la receta (`## 13`, riesgo 5).

**Qué posición lleva cada acción** (R12–R22): `start` → 1; `resume` → la última anotada (o 1);
`advance`/`go_back` → la del paso **al que se llega**; `finish` → la del último paso; `cancel` → la del
paso que se está mostrando. Con una receta sin pasos, `null` en todas (R5 ⚑).

**Lo que devuelve `startAssignedOrder`**: `StartedOrderExecution = AssignedOrderExecutionView & {
readonly resumeStepPosition: number | null }`, tipo nuevo en `assigned-order-execution-view.ts`.
`AssignedOrderExecutionView` y `getAssignedOrderExecution` **no cambian**: el campo lo sabe solo
`start`. La vista se devuelve con `status: 'EN_CURSO'`.

**R16 sin código extra**: dos aperturas simultáneas de un `PENDIENTE` compiten por
`lockAliveById … FOR UPDATE` dentro de `createTransitionOrder`. La segunda espera al candado, ve
`EN_CURSO`, devuelve `'stale'`, su trabajo lanza `ExecutionAbortedError`, su transacción **se deshace
sin haber escrito nada**, relee `EN_CURSO` y cae en la rama de retomar.

### 3.4 Errores

`errors.ts` gana **una** clase: `NotCancellableError` con `code = 'not_cancellable'`, que ya existe en
el catálogo y que ya usa `pedidos` para el mismo caso. **Ningún código nuevo.**

## 4. La misma operación entre dos módulos (R24)

**El problema.** Arrancar, finalizar y cancelar escriben en tablas de **tres módulos**: `orders`
(`pedidos`), las reservas y los movimientos (`inventario`, lo escribe `pedidos` por su unidad de
trabajo) y `order_execution_entries` (`asignaciones`). Ningún adaptador toca el modelo de otro
módulo, ningún driven importa el driven de otro, y `lib/composition` no importa el cliente Prisma
(`guard-arquitectura-modulos`). Y desde QC-141 `pedidos` **abre su propia transacción** para esas
operaciones.

**La solución: una transacción que abre `asignaciones`, a la que `pedidos` se une sin abrir otra.**

```
asignaciones/domain (caso de uso)
   └─ transaction.run(async ({ orders, log }) => {
        const outcome = await orders.transitionAliveById(...)      // o orders.cancelAliveById(...)
        if (outcome !== 'ok') throw new ExecutionAbortedError(outcome)   // deshace TODO lo de dentro
        await log.append(...)
      })

lib/composition
   ├─ orderTransactionScopeOn(tx): OrderTransactionScope     <- UN constructor del ambito, dos usos
   ├─ orderUnitOfWork   = { run: (work) => withOrderTransaction((tx) => work(orderTransactionScopeOn(tx))) }
   ├─ joinOrderUnitOfWork(tx) = { run: (work) => work(orderTransactionScopeOn(tx)) }   <- no abre nada
   └─ executionTransaction = { run: (work) => withExecutionTransaction((tx) => work({
          orders: {
            transitionAliveById: createTransitionOrder({ unitOfWork: joinOrderUnitOfWork(tx) }),
            cancelAliveById:     createCancelAliveOrder({ unitOfWork: joinOrderUnitOfWork(tx) }),
          },
          log: createExecutionLogRepository(tx),
        })) }

asignaciones/adapters/driven/persistence/execution-transaction-prisma.ts
   └─ withExecutionTransaction(run) = prisma.$transaction(run, { maxWait: 10_000, timeout: 30_000 })
```

- **Quién abre la transacción**: un driven de `asignaciones`, con los mismos `maxWait`/`timeout` que
  `withOrderTransaction` (Finalizar consume material dentro). No sabe nada de `pedidos`.
- **Quién ata las partes**: `lib/composition`. `orderTransactionScopeOn` es la extracción del cuerpo
  que hoy construye el ámbito **en línea** dentro de `orderUnitOfWork`: la unidad normal y la unida
  lo construyen **con la misma función**, así que lo que `pedidos` gane en su ámbito (por ejemplo, lo
  que meta QC-150 en el Finalizar) llega a las dos sin que nadie tenga que acordarse. El tipo de `tx`
  sale de `withOrderTransaction` (`Parameters<…>`), sin importar `@prisma/client`.
- **`pedidos` no cambia de adaptadores.** `createTransitionOrder` y `createCancelAliveOrder` reciben un
  `OrderUnitOfWork`; que su `run` abra o se una es cosa de la composición.
- **La regla que lo hace seguro.** La unidad unida **no confirma ni deshace**: si
  `createTransitionOrder` convierte por dentro un fallo en resultado (`'insufficient_material'`,
  `'recipe_without_lines'`, o el `'stale'` tras haber consumido), lo ya escrito seguiría vivo en la
  transacción de fuera. Por eso **el trabajo de `asignaciones` lanza ante todo desenlace distinto de
  `'ok'`**, y `withExecutionTransaction` deshace todo. Es lo que T19 comprueba contra Postgres.
- **El dominio no se entera**: recibe `ExecutionWriters`, tres métodos de interfaces que ya conoce.

## 5. `pedidos`: cancelar por encargo, por el camino único (R29)

1. **`pedidos/domain/order-cancellation.ts` (nuevo)** exporta:
   - `isCancellableStatus(status)`: mapa **total** sobre `OrderStatus` (`satisfies Record<OrderStatus,
     boolean>`); sustituye a `CANCELABLES` de `cancel-order.ts`. **Una** definición.
   - `cancelInsideTransaction(scope: OrderTransactionScope, input: { id, reason, actorId, now,
     companyId })` → `'ok' | 'not_found' | 'not_cancellable'`: el cuerpo que hoy vive dentro del `run`
     de `cancel-order.ts`, **sin cambiar nada**: `lockAliveById` → `isCancellableStatus` sobre la fila
     bloqueada → `cancelAlive` → `releaseForOrder` (`reason: 'release'`, autor `actorId`) →
     `setReservedAt(null)`.
   - El tipo `OrderCancellation = { cancelAliveById(id: string, companyId: string, reason: string,
     actorId: string, now: Date): Promise<'ok' | 'not_found' | 'not_cancellable'> }` y
     `createCancelAliveOrder({ unitOfWork }): OrderCancellation['cancelAliveById']`, que abre
     `unitOfWork.run` y llama a `cancelInsideTransaction`. Mismo papel que `createTransitionOrder`.
2. **`cancel-order.ts`** usa `isCancellableStatus` en su comprobación previa y
   `cancelInsideTransaction` dentro de su `run`, traduciendo `'not_cancellable'` a
   `NotCancellableError` y `'not_found'` a `OrderNotFoundError` como hoy. Su comportamiento observable
   no cambia: sus tests siguen verdes **sin tocarlos**.
3. **Barril**: `createCancelAliveOrder`, `CancelAliveOrderDeps` y el tipo `OrderCancellation`.
   `isCancellableStatus` y `cancelInsideTransaction` **no** se publican.
4. **Vocabulario vigilado**: `tests/unit/pedidos/module-contract.test.ts` prohíbe en todo archivo de
   `pedidos` (comentarios incluidos) palabras como `transition`, `transicion…`, `nextStatus` o
   `allowedStatus…`. Los archivos nuevos o tocados de `pedidos` no las usan.
5. **El seed no cambia** (R30): el Operador no gana `pedidos.modificar`, y `cancelOrder` sigue
   exigiéndolo para la pantalla de pedidos.

## 6. Pantalla

### 6.1 `StepReader` gana dos props opcionales (R37 ⚑)

```ts
export type StepReaderProps = {
  // … las cinco de hoy: steps, onFinish, title, minStepSeconds, mode
  readonly initialStepPosition?: number;                 // desde 1; se recorta a [1, steps.length]
  readonly onStepChange?: (change: { direction: 'advance' | 'go_back'; position: number }) => void;
};
```

- Sin las dos props nuevas, **el comportamiento es el de hoy** en los dos `mode`.
- Sigue recibiendo todo por props (QC-64 R20 intacta).
- `initialStepPosition` fija el estado **inicial** de `index`; el efecto de foco de `'ejecucion'` sigue
  saltándose el montaje, así que empezar en el paso 3 no roba el foco. La espera mínima arranca en el
  paso de entrada como en cualquier llegada.
- El recorte a `[1, steps.length]` es R14 ⚑.
- `onStepChange` se llama **después** de cambiar el índice, y solo si cambió.
- Solo cambia `step-reader.tsx`: es lo que admite hoy la lista cerrada del test R18 de QC-63.

### 6.2 `order-execution-screen.tsx`

- Recibe `StartedOrderExecution`; pasa `initialStepPosition={execution.resumeStepPosition ?? 1}` y
  guarda la posición actual en estado para Finalizar y Cancelar.
- **Avanzar y retroceder no esperan a nadie** (R19): en `onStepChange` encola
  `recordStepMoveAction(...)` en una **cadena de promesas** y **no** espera su resultado para pintar.
  Cada eslabón atrapa y descarta su fallo. La cadena existe para que las anotaciones **lleguen en el
  orden de los clics** (`## 10.9`).
- **Finalizar** gana un campo oculto `stepPosition`.
- **Cancelar**: botón «Cancelar pedido» visible en todos los pasos, que abre `order-cancel-dialog.tsx`
  (`AlertDialog` + `Textarea` de shadcn/ui, ya en el repo). El motivo se valida en cliente con
  `cancelOrderSchema` del barril de `pedidos` y otra vez en el servidor. Confirmar envía
  `cancelAssignedOrderAction` con `orderId`, `stepPosition` y `reason`. El botón no va dentro de la
  barra fija de `StepReader` (que no se toca por esto).

### 6.3 Server Actions (`asignaciones/adapters/driving/order-execution-actions.ts`)

Van **en el mismo archivo** que las dos de QC-63: el censo de
`tests/unit/identity/session-once-per-request-actions.test.ts` es **por archivo** y ya lo cubre.

| Acción | Entrada | Salida |
| --- | --- | --- |
| `startAssignedOrderAction` | sin cambios | `StartedOrderExecution` |
| `finishAssignedOrderAction` | `FormData` + `stepPosition` | sin cambios (redirige) |
| `cancelAssignedOrderAction` (**nueva**) | `FormData` con `orderId`, `stepPosition`, `reason` | `ErrorState`, o redirige a `` `${ASSIGNED_ORDERS_ROUTE}?${CANCELLED_ORDER_PARAM}=<numero>` `` (R25 ⚑) |
| `recordStepMoveAction` (**nueva**) | `{ orderId, direction, stepPosition }` | `{ status: 'success' } \| ErrorState`; la pantalla lo ignora |

### 6.4 La confirmación en la lista (R25 ⚑)

`lib/shared/routes.ts` gana `CANCELLED_ORDER_PARAM` (nombre de parámetro de consulta). La lista
cerrada de `tests/unit/recetas-ui/recipe-route-contract.test.ts` gana esa entrada, con nota fechada,
como hizo `DELIVERED_ORDER_PARAM`; el valor no puede aludir al asistente (el mismo test lo barre).
`app/(private)/asignacion/page.tsx` pinta `AssignedOrderCancelledNotice` junto al aviso de entrega,
**encima de las pestañas de vista** (QC-145), así que se ve sea cual sea la vista.

## 7. Guardias y listas cerradas: qué se toca y qué muerde después

| Guardia / lista | Qué exige | Qué pasa aquí | Cuándo |
| --- | --- | --- | --- |
| `tests/guards/guard-ambito-empresa-pedidos.test.ts` | Cada método de `OrderCatalog` cableado en `const orderCatalog`; `transitionAliveById` exactamente a `createTransitionOrder({ unitOfWork: orderUnitOfWork })` (`METODOS_DELEGADOS_EN_DOMINIO`); barrido sin excepciones de toda función de persistencia que toque la base. | `orderCatalog` **no cambia**, así que lo existente sigue verde. **Se tensa con un caso nuevo**: `OrderCancellation.cancelAliveById` declara `companyId: string`; `cancelInsideTransaction` lleva `{ companyId }` a `lockAliveById` y `cancelAlive`; y en `lib/composition` toda llamada a `createTransitionOrder(` o `createCancelAliveOrder(` recibe `unitOfWork: orderUnitOfWork` o `unitOfWork: joinOrderUnitOfWork(tx)` y nada más. Con **mutación** que lo pone rojo. | Ahora |
| `tests/unit/pedidos/module-contract.test.ts` | Vocabulario de transiciones prohibido en `pedidos`; quién consume `assertTransition`. | Los archivos nuevos de `pedidos` no usan ese vocabulario ni `assertTransition`. Verde. | Ahora, si se hace mal |
| `tests/unit/pedidos/authorization.test.ts` (`SIETE_ARCHIVOS`) | Los siete casos de uso de `pedidos` exigen solo `pedidos.consultar`/`pedidos.modificar`. | `cancel-order.ts` sigue exigiendo `pedidos.modificar`; `order-cancellation.ts` no exige nada (como `transition-order.ts`). Verde. | — |
| `tests/unit/asignaciones/module-contract.test.ts` → `CASOS_DE_USO_QC63` | Lista **cerrada** de archivos que pueden nombrar `'asignaciones.consultar'`. | `cancel-assigned-order.ts` y `record-step-move.ts` ⇒ **rojo**. Se añaden a la lista (crece, no se afloja), con nota fechada. | Ahora |
| `tests/guards/guard-arquitectura-modulos.test.ts` | `@module` en cada modelo; `prisma.<modelo>` solo en su dueño; composición sin cliente Prisma; driven sin driven ajeno. | `OrderExecutionEntry` con `/// @module asignaciones`. La composición no importa `@/lib/shared/db/prisma` (`## 4`). | Ahora, si se hace mal |
| `tests/guards/guard-empresa-en-esquema.test.ts` | Todo modelo con `company_id` o en `EXENTAS`. | Tiene `company_id`. Verde. | — |
| `tests/guards/guard-rls-force.test.ts` | Toda tabla creada con `ENABLE` + `FORCE`. | Verde si la migración cierra con las dos. | Ahora |
| `tests/guards/guard-catalogo-de-errores.test.ts` | Códigos del catálogo cerrado, sin mensaje por parámetro. | `NotCancellableError` reutiliza `not_cancellable`. `ExecutionAbortedError` no es de la jerarquía de errores del módulo (precedente de `transition-order.ts`). | Ahora, si se hace mal |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | Censo **por archivo** de acciones con `currentActor`. | Las acciones nuevas van al archivo ya censado. | Ahora |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | Exportaciones **exactas** de `lib/shared/routes.ts`. | `CANCELLED_ORDER_PARAM` ⇒ **rojo**. Se añade con nota fechada. | Ahora |
| `tests/unit/asignaciones/start-assigned-order.test.ts`, `finish-assigned-order.test.ts` | QC-63 R9/R10 y R16. | Deps nuevas; R9 **sigue cierta sobre el pedido**, y se anota retomar (R38); R16: la entrada gana `stepPosition`. Se **tensan** con nota fechada. | Ahora |
| `tests/unit/asignaciones/empacador-authorization.test.ts` | QC-144 R12: el Empacador concede en `start` y `finish`. | Construye `start`/`finish` con sus deps ⇒ no compila hasta darle `log` y `transaction` (dobles). Sus aserciones no cambian. | Ahora |
| `tests/integration/asignaciones/responsible-eligibility.int.test.ts`, `finished-orders.int.test.ts` | Modo `transaccion`: todo corre en la transacción del test y `$transaction` **no** viaja por el proxy (`prisma-tx-holder.ts`). | Construyen `start`/`finish` ⇒ necesitan `log` (el adaptador real sobre el `tx` del test) y un `transaction` de test cuyo `run` llame a `work` con los escritores atados a ese mismo `tx`, **sin** `withExecutionTransaction`. Así siguen dentro del `ROLLBACK` del test. | Ahora |
| `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` | Mock del módulo de acciones con solo `finishAssignedOrderAction`; caso R18 de QC-63 (lista cerrada). | El mock gana `recordStepMoveAction` y `cancelAssignedOrderAction`; el fixture gana `resumeStepPosition`. El caso R18 **no se toca**: ya admite `step-reader.tsx`. | Ahora |
| `tests/unit/recetas-ui/step-reader.test.tsx` | Comportamiento de QC-64/QC-125. | No cambia. Se **añaden** casos. | — |
| `tests/integration/aislamiento.json` + `guard-aislamiento-integracion` | Cada `*.int.test.ts` nuevo, declarado. | `order-execution-entries-constraints.int.test.ts` → `transaccion`. `execution-atomicity.int.test.ts` → **`commit`** con `motivo` y `desde`: `withExecutionTransaction` abre su propia transacción. | Ahora |
| Limpiezas que borran pedidos (`order.deleteMany`) en E2E e integración `commit` | Borran pedidos físicamente al terminar. | Las que abren la pantalla de ejecución anotan, y la FK `RESTRICT` rompe su limpieza ⇒ borran antes `orderExecutionEntry` de su empresa. Candidatas medidas: `e2e/ejecucion-receta.spec.ts`, `e2e/reserva-de-material.spec.ts`, `e2e/recetas-porcentaje.spec.ts`, `e2e/pedidos-terminados.spec.ts`, `e2e/pedidos-asignados.spec.ts` (y `e2e/recetas-pasos.spec.ts` si abre la pantalla). Se confirma una a una. | Al correr E2E |
| `e2e/ejecucion-receta.spec.ts` | Camino feliz de QC-63. | Debería seguir verde salvo la limpieza; revisar selectores si el botón de cancelar cae cerca. | Al correr Playwright |

## 8. Multiplataforma (R36)

Botón de cancelar y botones del diálogo con `min-h-11 min-w-11`; `Textarea` con `text-base` (16 px);
el motivo del rechazo como texto en el DOM, nunca `title`; todo alcanzable con teclado. **Ninguna
excepción de escritorio**: se usa en planta, en móvil o tablet.

## 9. Dependencias de terceros

**Ninguna** (`[D18]`, R35). `AlertDialog`, `Textarea` y `Button` ya están en `components/ui/`; la
validación es `zod`; la transacción es `prisma.$transaction`, ya usado en diez adaptadores driven.
`docs/dependencias.md` no cambia.

## 10. Alternativas descartadas

**10.1 — Abrir la transacción en `lib/composition` con `prisma.$transaction`.** La composición no
puede importar el cliente Prisma (`guard-arquitectura-modulos`). Se abre en un driven.

**10.2 — Que `pedidos` escriba también la anotación.** `pedidos` pasaría a saber de pasos y de
retomar, y la tabla tendría el dueño equivocado.

**10.3 — Escribir en dos pasos y compensar (saga).** La compensación sería borrar una anotación
(`[D13]` lo prohíbe) o deshacer un estado (la matriz de transiciones lo prohíbe).

**10.4 — Un trigger que anote al cambiar `orders.status`.** No sabe la posición ni distingue arrancar
de un cambio desde la oficina.

**10.5 — Llamar al `orderUnitOfWork` global dentro de la transacción de ejecución. DESCARTADA (nueva
el 2026-09-24).** Es lo más corto —ningún cableado nuevo—, pero `withOrderTransaction` abre **otra**
transacción en **otra** conexión: la anotación y el cambio del pedido se confirmarían por separado,
que es justo lo que R24 prohíbe, y con el pedido bloqueado por la de dentro mientras la de fuera
espera se arriesga un bloqueo mutuo bajo el pooler.

**10.6 — Meter `cancelAliveById` en `OrderCatalog`. DESCARTADA (nueva el 2026-09-24).** Era el plan
del 2026-09-18. Hoy `OrderCatalog` tiene 11 dobles en tests que dejarían de compilar, y el
`orderCatalog` global tendría que cablear un método que nadie llama fuera de la transacción de
ejecución. Un contrato propio y estrecho, `OrderCancellation`, dice lo mismo sin cableado muerto.

**10.7 — Savepoints (`SAVEPOINT` crudo) para que la unidad unida pueda deshacer lo suyo.**
**DESCARTADA (nueva el 2026-09-24).** Resolvería los resultados que `createTransitionOrder` convierte
en valores, pero mete SQL crudo de control de transacciones en la composición o en un driven, y
Prisma no los modela. Abortar la transacción entera ante todo desenlace no `'ok'` es más simple y
cumple R24 igual.

**10.8 — `cancelAliveById` con su propio `updateMany`.** Habría **dos** sentencias capaces de escribir
`CANCELADO` y el motivo, y **no liberaría el material**: `[D6]` pide el camino único.

**10.9 — Recuperar el paso en el cliente (`localStorage`).** `[D12]` dice «el último paso anotado **de
ese pedido**», no de ese navegador; y QC-64 R19 prohíbe guardar estado del asistente en el navegador.

**10.10 — Montar `StepReader` sin tocarlo, con `key` y clics simulados.** No se puede empezar en el
paso 3 sin marcar los pasos 1 y 2 y esperar sus 5 s.

**10.11 — Mandar avanzar/retroceder sin cadena, en paralelo.** Dos Siguiente seguidos pueden llegar
al revés y la recarga volvería atrás.

## 11. Archivos que la feature va a tocar

> **Para F2.0 — cruce con las ramas vivas (medido el 2026-09-24).** QC-68 y QC-92 están `done`: su
> cruce ya no aplica. Socios nuevos:
> - **QC-150** (`producto-terminado`, `fullstack`, `in_progress`): mete un lote de producto terminado
>   en el Finalizar de `/asignacion/[id]`. Solape probable en `pedidos/domain/transition-order.ts` (no
>   lo toca esta ficha), `pedidos/ports/order-unit-of-work.ts` y **`lib/composition/index.ts`**, en el
>   bloque de `orderUnitOfWork`, que esta ficha refactoriza a `orderTransactionScopeOn`. Quizá en
>   `finish-assigned-order.ts` (error nuevo). **Riesgo real**: se decide el orden de merge; quien vaya
>   segundo mete su pieza en `orderTransactionScopeOn`.
> - **QC-153** (`modelo-de-clientes`, `backend`, `in_progress`): `db/schema.prisma` y una migración
>   nueva. Bloques distintos; lo único que obliga es el orden de timestamps (`## 2.2`).

**Nuevos**

| Archivo | Qué |
| --- | --- |
| `db/migrations/<AAAAMMDDhhmmss>_order_execution_entries/migration.sql` | UP (`## 2.2`) |
| `db/migrations/<AAAAMMDDhhmmss>_order_execution_entries/down.sql` | DOWN |
| `lib/modules/asignaciones/domain/execution-entry.ts` | Tipos de la anotación y `ExecutionAbortedError` |
| `lib/modules/asignaciones/domain/cancel-assigned-order.ts` | Caso de uso de cancelar |
| `lib/modules/asignaciones/domain/record-step-move.ts` | Caso de uso de avanzar/retroceder |
| `lib/modules/asignaciones/ports/execution-log-repository.ts` | Puerto del registro |
| `lib/modules/asignaciones/ports/execution-transaction.ts` | Puerto de transacción |
| `lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma.ts` | Adaptador del registro (fábrica con `db`) |
| `lib/modules/asignaciones/adapters/driven/persistence/execution-transaction-prisma.ts` | `withExecutionTransaction` |
| `lib/modules/pedidos/domain/order-cancellation.ts` | `isCancellableStatus`, `cancelInsideTransaction`, `OrderCancellation`, `createCancelAliveOrder` |
| `app/(private)/asignacion/[id]/components/order-cancel-dialog.tsx` | Diálogo del motivo |
| `app/(private)/asignacion/components/assigned-order-cancelled-notice.tsx` | Confirmación en la lista (R25 ⚑) |
| `tests/unit/asignaciones/schema/order-execution-entries-migration.test.ts` | R1, R3, R5–R8, R32–R34 sobre el SQL |
| `tests/unit/asignaciones/execution-log-repository.test.ts` | R8 (tipos), R31 (forma del puerto) |
| `tests/unit/asignaciones/cancel-assigned-order.test.ts` | R9, R10, R22–R24, R26–R30 |
| `tests/unit/asignaciones/record-step-move.test.ts` | R17, R18, R20, R26–R28 |
| `tests/unit/pedidos/order-cancellation.test.ts` | R29 (una definición, un cuerpo, dos consumidores) |
| `tests/unit/asignaciones-ui/order-cancel-dialog.test.tsx` | R9, R11, R22, R36 |
| `tests/unit/asignaciones-ui/order-execution-step-log.test.tsx` | R13, R14, R17–R19 en la pantalla |
| `tests/unit/asignaciones-ui/assigned-orders-cancelled-notice.test.tsx` | R25 |
| `tests/integration/asignaciones/order-execution-entries-constraints.int.test.ts` | R1, R5–R8, R32 contra Postgres |
| `tests/integration/asignaciones/execution-atomicity.int.test.ts` | R16, R20, R23, R24, R29 contra Postgres |
| `e2e/registro-ejecucion.spec.ts` | R39, R40 |

**Modificados**

| Archivo | Qué cambia | Riesgo |
| --- | --- | --- |
| `db/schema.prisma` | `+ enum OrderExecutionAction`, `+ model OrderExecutionEntry` (al final) | Medio: caliente (QC-153) |
| `lib/modules/asignaciones/domain/start-assigned-order.ts` | `start`/`resume` + transacción | Medio |
| `lib/modules/asignaciones/domain/finish-assigned-order.ts` | `stepPosition` + `finish` en transacción | Medio: posible solape con QC-150 |
| `lib/modules/asignaciones/domain/assigned-order-execution-view.ts` | `+ StartedOrderExecution` | Bajo |
| `lib/modules/asignaciones/domain/errors.ts` | `+ NotCancellableError` | Bajo |
| `lib/modules/asignaciones/index.ts` | `+` factories nuevas, `*Deps`, tipos | Bajo |
| `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts` | `+` dos acciones; `finish` lee `stepPosition` | Bajo |
| `lib/modules/pedidos/domain/cancel-order.ts` | usa `isCancellableStatus` y `cancelInsideTransaction` | Bajo |
| `lib/modules/pedidos/index.ts` | `+ createCancelAliveOrder`, `CancelAliveOrderDeps`, `OrderCancellation` | Bajo |
| `lib/composition/index.ts` | `orderTransactionScopeOn`, `joinOrderUnitOfWork`, `executionLogRepository`, `executionTransaction`, fachada | **Alto: archivo caliente y solape con QC-150** |
| `lib/shared/routes.ts` | `+ CANCELLED_ORDER_PARAM` (R25 ⚑) | Bajo |
| `components/shared/step-reader/step-reader.tsx` | dos props opcionales (R37 ⚑) | Medio: compartido con QC-64/QC-125 |
| `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` | posición, cadena, botón de cancelar | Medio |
| `app/(private)/asignacion/[id]/components/index.ts` | `+ OrderCancelDialog` | Bajo |
| `app/(private)/asignacion/page.tsx` | pinta la confirmación de cancelado (R25 ⚑) | Medio |
| `app/(private)/asignacion/components/index.ts` | `+ AssignedOrderCancelledNotice` | Bajo |
| `tests/guards/guard-ambito-empresa-pedidos.test.ts` | caso nuevo, **tensada** | Medio |
| `tests/unit/asignaciones/module-contract.test.ts` | `CASOS_DE_USO_QC63` crece | Bajo |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | `+ CANCELLED_ORDER_PARAM` en la lista exacta | Bajo |
| `tests/unit/asignaciones/start-assigned-order.test.ts` | deps nuevas; R9 tensado | Bajo |
| `tests/unit/asignaciones/finish-assigned-order.test.ts` | deps nuevas; R16 tensado | Bajo |
| `tests/unit/asignaciones/empacador-authorization.test.ts` | deps nuevas, sin cambiar aserciones | Bajo |
| `tests/unit/asignaciones/order-execution-actions.test.ts` | acciones nuevas | Bajo |
| `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` | mock y fixture (el caso R18 no se toca) | Bajo |
| `tests/unit/recetas-ui/step-reader.test.tsx` | casos nuevos para las props | Bajo |
| `tests/integration/asignaciones/responsible-eligibility.int.test.ts`, `finished-orders.int.test.ts` | deps nuevas atadas al `tx` del test | Bajo |
| `tests/integration/aislamiento.json` | dos entradas | Bajo |
| E2E cuya limpieza borra pedidos tras abrir la pantalla (`## 7`) | borrar antes las anotaciones | Bajo |
| `specs/QC-63-ejecutar-receta-operador/requirements.md` | nota fechada al pie: R10 y R18 enmendadas por QC-82 R37/R38 | Bajo |

**Sin tocar, a propósito:** `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` y
`order-catalog-prisma.ts` (novedad de esta revisión), `lib/modules/pedidos/domain/order-catalog.ts`,
`transition-order.ts`, `order-transitions.ts`, `pedidos/ports/**`, `lib/modules/identity/**` y el seed
(R30), `lib/modules/asignaciones/domain/order-state.ts`, `get-assigned-order-execution.ts`,
`lib/modules/inventario/**`, `lib/modules/errores/**`, `app/(private)/pedidos/**`, `package.json`.

## 12. Puntos para F1.4 — no salen de la acotación

Ratificados con el spec el 2026-09-18. La revisión del 2026-09-24 **no** los reabre; anota solo lo
que el código de hoy cambia de ellos.

1. **Enmendar QC-63 R18: `StepReader` gana dos props opcionales (R37).** _Revisión_: QC-125 ya tensó
   el test a lista cerrada con `step-reader.tsx` dentro; esta ficha no toca el test.
2. **Receta sin pasos (R5)**: `step_position` anulable solo para ese caso.
3. **Si falla anotar retomar, no se abre la pantalla (R15).**
4. **Pedido `EN_CURSO` sin anotaciones (R14)**: empieza en el paso 1.
5. **Posición anotada mayor que los pasos de hoy (R14)**: abre en el último, sin error.
6. **Confirmación visible al cancelar (R25).** _Revisión_: ahora obliga además a tocar
   `recipe-route-contract.test.ts`.
7. **Cancelaciones y entregas hechas desde la oficina no se anotan.** _Revisión_: desde QC-145 la
   oficina ya no entrega editando; solo cancela (y la caducidad diaria cancela `PENDIENTE`). Ninguna
   de las dos se anota.
8. **Tensar `guard-ambito-empresa-pedidos`.** _Revisión_: ya no es ver `db.` en `TOCA_LA_BASE`
   (ninguna función gana ese parámetro), sino el caso nuevo de `## 7`. Misma figura: la guardia
   crece, no se afloja.

La revisión abrió dos preguntas **nuevas**, que el humano cerró el 2026-09-24: **`D19`** (cancelar
desde la pantalla libera todo el material, por el camino único) y **`D20`** (el Empacador ejecuta,
finaliza y, por `D7`, cancela lo que tenga asignado). La consulta del recorrido irá en el dashboard
del Administrador, en **QC-167**, bloqueada por esta ficha.

## 13. Riesgos

1. **Solape con QC-150 en `lib/composition/index.ts`** y en el Finalizar (`## 11`). Mitigación: el
   constructor único del ámbito; se decide el orden de merge en F2.0.
2. **Orden de las anotaciones en el mismo instante.** Dos responsables en el mismo milisegundo
   desempatan por `id`, sin significado. `[D12]` ya lo acepta.
3. **Cada petición de la página anota un retomar.** No está verificado que el prefetch del `<Link>` no
   pida el RSC; lo comprueba el E2E (abrir y recargar una vez: una sola fila de retomar).
4. **Transacciones interactivas sobre el pooler.** Ya las usan diez adaptadores y la de `pedidos` con
   `inventario`; esta es la primera que cruza **tres** módulos (`asignaciones`, `pedidos`,
   `inventario`) y la de Finalizar es la más larga. Mismos `maxWait`/`timeout` que la de `pedidos`.
5. **La posición no se valida contra la receta**: una petición forjada puede anotar 999. Al retomar se
   recorta al último paso. Se acepta por el mismo motivo que `[D9]`.
6. **`recordStepMove` comprueba `EN_CURSO` y luego escribe, sin candado.** Un avanzar que llegue en el
   mismo instante en que otro responsable finaliza puede quedar anotado justo después del
   `ENTREGADO`. Es una fila de más en un registro que `[D11]` ya declara con pérdidas; bloquear el
   pedido en cada clic costaría una transacción por Siguiente.
7. **Una unidad de trabajo unida usada fuera de una transacción** escribiría sin atomicidad. Solo la
   construye `lib/composition`, y solo dentro de `withExecutionTransaction`; lo vigila el caso nuevo
   de `guard-ambito-empresa-pedidos` (`## 7`).
