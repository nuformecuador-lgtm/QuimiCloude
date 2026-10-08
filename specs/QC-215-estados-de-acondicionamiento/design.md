# QC-215 — estados-de-acondicionamiento · design.md

> El **qué** está en `requirements.md` (R1–R35); aquí, el **cómo**. Lo marcado **[P1]** es la parte
> de `TERMINADO`, que esta ficha crea (D12, 2026-10-07; § 8). Ninguna librería nueva.

## Lo que ya existe

Términos buscados en el board (`feature_list.json`, todas las columnas), en `specs/` y en el código
(Grep; el grafo no hizo falta): `acondicion`, `TERMINADO`, `EN_EMPAQUE`, `finished_at`, `packed_by`,
`Terminados`.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| **QC-202** `estado-terminado-tras-empaque` (`pending`, solo `requirements.md`) | Estado `TERMINADO` tras el empaque | Se solapaba. Resuelto el 2026-10-07: **se encadenan** (D11) y **QC-215 crea `TERMINADO`** (D12). Su spec queda desfasado: cancelarla o reducirla es tarea del leader |
| **QC-216** (`done`, PR #157) | Rol y permiso `acondicionamiento.modificar` en `lib/modules/identity/domain/permissions.ts` | Se **consume** en los dos casos de uso. Su R17 (barrido) se relaja abriendo esas dos rutas exactas |
| **QC-168** (`done`) | `POR_EMPACAR`/`EN_EMPAQUE`, `packed_by`, Comenzar/Terminar el empaque | **Patrón que se copia**: columna de quién + `CHECK` atado al estado + `UPDATE` condicional + relectura para clasificar. Terminar el empaque se **enmienda** (R5) |
| **QC-138** (`done`) | `BLOQUEADO`: `ADD VALUE` + `down.sql` que recrea el tipo y aborta si hay filas | **Patrón del rollback** (R27) |
| **QC-145** / **QC-201** (`done`) | «Todos», «Terminados», filtro `packedBy` | Se **amplían** etiquetas y filtro (R28). «Terminados» cambia a `TERMINADO` (R31) |
| **QC-217 / QC-218 / QC-219** (`pending`) | Pestaña, acción Acondicionar con equipo y datos de lote | **No se tocan**. Consumen lo que deja esta ficha: casos de uso, columna `conditioned_by` y estados |
| `specs/QC-211-pasos-de-envasado` | Nombra QC-202 como `pending` | Sin efecto |

No hay código de acondicionamiento previo fuera de lo de QC-216.

## 1. Modelo de datos

### 1.1 Enum `OrderStatus` (R1, R30)

Se añade al final, como `POR_EMPACAR`, `EN_EMPAQUE` y `BLOQUEADO`, porque reordenar obliga a
recrear el tipo: `… BLOQUEADO, POR_ACONDICIONAR, EN_ACONDICIONAMIENTO, TERMINADO`.

`ORDER_STATUS_VALUES` (`lib/modules/pedidos/domain/order-classification.ts`) copia el orden del
enum; `module-contract.test.ts` ya compara las dos listas. `ORDER_STATUS_FLOW` pasa a ser el de R2.

### 1.2 Columna `orders.conditioned_by` (R8, R12, R25)

```prisma
/// Quien tiene o tuvo el pedido en acondicionamiento. Obligatorio en EN_ACONDICIONAMIENTO y
/// TERMINADO, NULL antes de comenzar y opcional en ENTREGADO; lo exige el CHECK
/// `orders_conditioned_by_matches_status`. Sin `@relation`: FK compuesta escrita a mano.
conditionedBy       String?       @map("conditioned_by") @db.Uuid
@@index([conditionedBy], map: "orders_conditioned_by_idx")
```

- FK compuesta `orders_conditioned_by_company_id_fkey` `(conditioned_by, company_id) → users(id,
  company_id)`, `ON DELETE RESTRICT ON UPDATE CASCADE`. Es el mismo patrón que `packed_by`: la
  empresa coincide por construcción.
- La columna es la base de dos reglas: «solo él termina» (R13) y, en QC-217, «Terminados» del
  acondicionador y la columna «quién acondiciona».

### 1.3 Restricciones de `orders`

Todas comparan `"status"::text`. Así pueden ir en la misma migración que el `ADD VALUE` (55P04),
igual que hizo `20260925120000_order_packing_states`.

| Restricción | Antes | Después |
|---|---|---|
| `orders_conditioned_by_matches_status` (nueva) | — | `(status NOT IN ('EN_ACONDICIONAMIENTO','TERMINADO') OR conditioned_by IS NOT NULL) AND (status NOT IN ('PENDIENTE','EN_CURSO','POR_EMPACAR','EN_EMPAQUE','POR_ACONDICIONAR','CANCELADO','BLOQUEADO') OR conditioned_by IS NULL)` (R25) |
| `orders_packed_by_matches_status` | exige en `EN_EMPAQUE`; prohíbe en `PENDIENTE, EN_CURSO, POR_EMPACAR, CANCELADO` | exige también en `POR_ACONDICIONAR`, `EN_ACONDICIONAMIENTO` (R24) y `TERMINADO` [P1] |
| `orders_delivered_not_deleted` | `ENTREGADO, CANCELADO, POR_EMPACAR, EN_EMPAQUE` | + `POR_ACONDICIONAR`, `EN_ACONDICIONAMIENTO` (R24) y `TERMINADO` [P1] |
| `orders_finished_at_requires_delivered` | `finished_at IS NULL OR status = 'ENTREGADO'` | `finished_at IS NULL OR status::text IN ('TERMINADO','ENTREGADO')` [P1] (R24, R30). Mismo nombre: es la misma regla, ampliada |
| `orders_finished_requires_finished_at` (nueva) [P1] | — | `status::text <> 'TERMINADO' OR finished_at IS NOT NULL` (R30) |

Las filas existentes cumplen todo (R26). Hoy no hay ningún pedido en un estado nuevo; los
`ENTREGADO` quedan como están y los `EN_EMPAQUE` no llevan `conditioned_by`.

### 1.4 Índices

- `orders_conditioned_by_idx` (FK).
- [P1] `orders_company_terminated_idx`: el gemelo de `orders_company_finished_idx` con `WHERE
  deleted_at IS NULL AND status = 'TERMINADO'`. Compara el valor del enum, así que va en una
  **segunda migración**, como la de `BLOQUEADO`. `orders_company_finished_idx` (`ENTREGADO`) se
  queda: «Todos» con filtro exacto `ENTREGADO` sigue usándolo (R32).

### 1.5 Migraciones

- **M1** `db/migrations/<ts>_order_conditioning_states/`. `migration.sql`:
  1. `ADD VALUE IF NOT EXISTS` de los valores de § 1.1;
  2. columna, índice y FK;
  3. los `CHECK` de § 1.3 (`DROP` + `ADD` con el mismo nombre).

  `down.sql`, con el patrón de `20261001170000_order_status_blocked/down.sql`:
  1. `DO $$` que aborta si hay filas en un estado nuevo (R27);
  2. `DROP` de los `CHECK` e índices que nombran `status`;
  3. `DROP` de FK, índice y columna;
  4. recrear el tipo con los valores de antes;
  5. recrear `CHECK` e índices con su **texto literal** de antes.
- **M2** [P1] `db/migrations/<ts+1>_order_terminated_finished_index/`: solo el índice de § 1.4,
  con su `down.sql`.
- Las dos van en la lista de migraciones conocidas de `tests/guards/guard-identificador-de-request.test.ts`.

### 1.6 RLS

No hay tabla nueva. `orders` ya tiene RLS y `FORCE`, y esta ficha no lo cambia. La frontera es el
caso de uso (`docs/architecture.md > Acceso a datos y autorizacion`): `requirePermission(actor,
'acondicionamiento.modificar')` antes de validar la entrada y antes de cualquier puerto (R15).

## 2. Puertos y adaptadores (`pedidos`)

### 2.1 Puerto nuevo `lib/modules/pedidos/ports/order-conditioning-repository.ts`

```ts
export interface OrderConditioningRepository {
  startConditioningAlive(id: string, conditionerId: string, now: Date, scope: OrderScope):
    Promise<'ok' | 'already_mine' | 'taken' | 'not_conditionable' | 'not_found'>;
  finishConditioningAlive(id: string, conditionerId: string, now: Date, scope: OrderScope):
    Promise<'ok' | 'not_conditioner' | 'not_conditionable' | 'not_found'>;
}
```

`scope` va el último (`tests/guards/guard-ambito-empresa-pedidos.test.ts`).

### 2.2 Adaptador (en `order-prisma.ts`, junto a los de empaque)

- **Comenzar**: un único `updateMany` con `where { company, id, deletedAt: null, status:
  'POR_ACONDICIONAR' }` y `data { status: 'EN_ACONDICIONAMIENTO', conditionedBy, updatedAt,
  updatedBy }`.
  - `count === 1` → `'ok'`.
  - Si no, se relee `status` y `conditionedBy` y se clasifica: `null` → `'not_found'`;
    `EN_ACONDICIONAMIENTO` propio → `'already_mine'`; ajeno → `'taken'`; cualquier otro →
    `'not_conditionable'`.
  - **Concurrencia (R10):** en READ COMMITTED, el segundo `UPDATE` espera el bloqueo de fila,
    reevalúa el `WHERE` sobre la versión confirmada, mueve 0 filas y su relectura ve `taken`. No
    hace falta `SELECT … FOR UPDATE`: Comenzar el empaque lo necesita para contar el reparto en
    otra tabla, y aquí no hay nada que contar.
- **Terminar**: un único `updateMany` con `where { …, status: 'EN_ACONDICIONAMIENTO',
  conditionedBy }` y `data { status: 'TERMINADO', finishedAt: now, updatedAt, updatedBy }`. Si no
  mueve la fila, se relee y se clasifica: `'not_found'`; `EN_ACONDICIONAMIENTO` ajeno →
  `'not_conditioner'`; resto → `'not_conditionable'`.
- **Sin `OrderUnitOfWork`:** ninguna de las dos toca inventario (R8, R12).

### 2.3 Dominio `lib/modules/pedidos/domain/order-conditioning.ts`

`createStartConditioning` y `createFinishConditioning` implementan dos métodos nuevos de
`OrderCatalog`, `startConditioningAliveById(id, companyId, conditionerId, now)` y
`finishConditioningAliveById(...)`, con las mismas uniones de resultado del puerto. Cada uno hace
`assertTransition` de su único par (`POR_ACONDICIONAR → EN_ACONDICIONAMIENTO` y
`EN_ACONDICIONAMIENTO → TERMINADO`) y delega en el puerto. Es el mismo esquema que
`createStartPacking`. Se cablean en `lib/composition/index.ts` con un objeto
`orderConditioningRepository`.

### 2.4 Cambios en lo que ya existe

| Archivo | Cambio | R |
|---|---|---|
| `domain/order-transitions.ts` | `ALLOWED` de R3, con comentario actualizado | R3 |
| `domain/order-classification.ts` | valores y flujo | R1, R2 |
| `domain/transition-order.ts` | rechaza también los destinos `POR_ACONDICIONAR`, `EN_ACONDICIONAMIENTO` y `TERMINADO` | R4 |
| `domain/order-packing.ts` | `assertTransition('EN_EMPAQUE', 'POR_ACONDICIONAR')` | R5 |
| `adapters/driven/persistence/order-prisma.ts` | `finishPackingAliveOrder` escribe `status: 'POR_ACONDICIONAR'` **sin** `finishedAt`; `setAliveOrderStatus` ya no escribe `finishedAt` con ningún destino | R5, R33 |
| `domain/delete-order.ts` | `NO_BORRABLES` + los estados nuevos | R19, R30 |
| `domain/cancel-order.ts` | ninguno: `CANCELABLES` es lista blanca | R18 |
| `domain/update-order*.ts` | ninguno: la edición hace `assertTransition(s, s)` y los estados nuevos no admiten «quedarse igual»; reparto y unidad usa lista blanca | R19 |
| `domain/order-catalog.ts` | dos métodos nuevos y JSDoc de Terminar el empaque | R5, R8, R12 |

`ALLOWED` y `ORDER_STATUS_IS_FINAL`/`ERROR_POR_ESTADO`/etiquetas son `Record<OrderStatus, …>`: si
falta un estado, el `typecheck` falla. Esa es la red que encuentra todo consumidor.

## 3. Casos de uso (`asignaciones`)

Son el sitio de `start-packing.ts` y `finish-packing.ts`: ahí está el `Actor` con permisos.

```ts
// lib/modules/asignaciones/domain/start-conditioning.ts
createStartConditioning({ orders: OrderCatalog, now? })
  : (actor: Actor | null | undefined, input: unknown) => Promise<void>
// lib/modules/asignaciones/domain/finish-conditioning.ts
createFinishConditioning({ orders: OrderCatalog, now? })
  : (actor, input) => Promise<{ readonly numberText: string }>
```

1. `requirePermission(actor, 'acondicionamiento.modificar')` (R15).
2. `z.strictObject({ orderId: z.string().uuid() })`; si falla, `ValidationError` (R16).
3. **Terminar** lee el número antes de transicionar, como `finish-packing.ts`, para devolver
   `numberText` (lo pintará QC-218).
4. Se llama al catálogo y el resultado se traduce:

| Resultado | Error | `code` |
|---|---|---|
| `'ok'`, `'already_mine'` | — | — |
| `'taken'`, `'not_conditioner'` | `OrderConditioningTakenError` (nuevo) | `order_conditioning_taken` |
| `'not_conditionable'` | `OrderNotConditionableError` (nuevo) | `order_not_conditionable` |
| `'not_found'` | `OrderNotFoundError` | `order_not_found` |

Los dos códigos son una **enmienda al catálogo cerrado** de errores
(`lib/modules/errores/domain/error-codes.ts` + `error-catalog.ts`). Textos propuestos, en el
estilo del catálogo (sin tildes, como sus vecinos):

- `'Otra persona esta acondicionando este pedido.'`
- `'El pedido no esta en un estado que admita esa accion de acondicionamiento.'`

Se exportan desde `lib/modules/asignaciones/index.ts` y se cablean en `asignaciones` de
`lib/composition/index.ts` (`startConditioning`, `finishConditioning`). **No hay Server Action
ni ruta**: la acción es de QC-218.

`order-state.ts`: `ERROR_POR_ESTADO` suma `POR_ACONDICIONAR`, `EN_ACONDICIONAMIENTO` y `TERMINADO`
[P1] con `OrderProducedFrozenError` (R20, R21, R30). R21 sale solo:

- `get-assigned-order-execution` ya rechaza todo lo que no sea `PENDIENTE` ni `EN_CURSO` con
  `order_not_found`;
- `start-assigned-order` y `finish-assigned-order` pasan por `assertOrderAcceptsWrites`.

R23: `list-packing-orders` y `get-packing-order` filtran por `POR_EMPACAR`/`EN_EMPAQUE`; la
caducidad, por `PENDIENTE`; el desbloqueo, por `BLOQUEADO`; «Mis asignados», por estados de
trabajo. Ninguno cambia. Lo cubren tests.

## 4. «Terminados», «Todos» y etiquetas

| Archivo | Cambio | R |
|---|---|---|
| `app/(private)/asignacion/components/company-orders-columns.tsx` | etiquetas «Por acondicionar», «En acondicionamiento» y «Terminado» [P1] | R28, R32 |
| `app/(private)/asignacion/components/assignment-view-params.ts` | `ROUTE_ORDER_STATUS_VALUES` en el orden de R2; [P1] `isExactlyDelivered` → «exactamente `ENTREGADO` o exactamente `TERMINADO`» | R28, R32 |
| `app/(private)/asignacion/components/company-orders-skeleton.tsx` | [P1] la misma regla para la columna de fecha | R32 |
| `lib/modules/asignaciones/domain/list-company-orders.ts` | [P1] `resolveOrdering`: también exactamente `['TERMINADO']` | R32 |
| `lib/modules/asignaciones/domain/list-finished-orders.ts` | [P1] `['TERMINADO']` en vez de `['ENTREGADO']` | R31 |
| `app/(private)/pedidos/components/order-status-badge.tsx` | textos y variantes de los estados nuevos (`secondary` para `POR_ACONDICIONAR`, `default` para `EN_ACONDICIONAMIENTO`, igual que sus gemelos de empaque) | R29, R32 |
| `app/(private)/pedidos/components/order-row-actions.tsx` | `ORDER_STATUS_IS_FINAL: true` y `ACCEPTS_DISTRIBUTION_EDIT: false` en los nuevos | R22 |
| `app/(private)/asignacion/components/packed-order-notice.tsx` | «Pedido <n> empacado» | R7 |

Zona `backend`, pero estos `app/` se tocan solo porque los mapas son exhaustivos sobre
`OrderStatus` y no compilarían sin los valores. No hay pantalla nueva.

## 5. Contratos de entrada y salida

- `startConditioning(actor, { orderId })` devuelve `void`.
- `finishConditioning(actor, { orderId })` devuelve `{ numberText }`.
- Errores: `unauthorized`, `invalid_input`, `order_not_found`, `order_conditioning_taken` y
  `order_not_conditionable`.
- `OrderCatalog` solo gana los dos métodos de § 2.3. `AssignedOrderSummary` **no** gana
  `conditionedBy`: lo añadirá QC-217, que es quien lo pinta.

## 6. Alternativas descartadas

1. **Reutilizar `packed_by` como «quién tiene el pedido ahora».** Se descarta: `packed_by` tiene que
   sobrevivir al acondicionamiento, porque «Terminados» del Empacador filtra por él (QC-201,
   R31), y QC-217 necesita a los dos a la vez.
2. **Una tabla `order_conditionings`** (pedido, quién, cuándo), que además podría alojar el equipo de
   QC-218. Se descarta para «quién acondiciona»: un `CHECK` no puede atar una fila de otra tabla al
   estado del pedido. R25 quedaría como regla solo de aplicación, y el patrón de `packed_by` ya
   está probado. El equipo de QC-218 sí es una tabla aparte, y la diseña esa ficha.
3. **Copiar `startPackingAliveOrder` con `SELECT … FOR UPDATE`.** Innecesario (§ 2.2): no hay una
   segunda tabla que leer bajo el bloqueo, y un único `UPDATE` condicional serializa igual.
4. **Reutilizar `order_packing_taken` / `order_not_packable`.** Sus textos dicen «empacador» y
   «empaque»: un acondicionador leería un mensaje falso. Dos códigos nuevos cuestan una enmienda al
   catálogo y nada más.
5. **Dejar `finished_at` en Terminar el empaque y añadir otra columna para el fin del
   acondicionamiento.** Contradice D11: `finished_at` es el paso a `TERMINADO`.

## 7. Consecuencias que conviene ver al aprobar

- **El Empacador deja de ver en «Terminados» lo que acaba de empacar** hasta que se acondiciona: el
  pedido sale de «Por empacar» al terminar y entra en «Terminados» solo como `TERMINADO`. Es la
  lectura literal de D11 y de QC-202 D5. Los `ENTREGADO` antiguos que empacó desaparecen de su
  «Terminados» (QC-202 P1, que el humano no había confirmado).
- Los E2E de empaque que hoy afirman `ENTREGADO` y su aparición en «Terminados» se ajustan (R34),
  y también los que siembran `ENTREGADO` para «Terminados»: `e2e/pedidos-terminados.spec.ts` y
  `e2e/pedidos-asignados.spec.ts`.
- **Orden de merge con QC-216:** ya está mergeada, así que no hay bloqueo.

## 8. `TERMINADO` lo crea esta ficha (D12)

Decidido el 2026-10-07 (P1 = A). En esta ficha:

- `depends_on` es solo `QC-216`;
- el enum gana 3 valores (§ 1.1);
- M1 escribe las filas [P1] de § 1.3;
- M2 crea el índice de `TERMINADO` (§ 1.4);
- se hacen aquí `list-finished-orders`, `resolveOrdering`, `isExactlyDelivered` y la etiqueta
  «Terminado» (§ 4), con los tests de R30–R33 y los E2E de «Terminados» (§ 7);
- `tasks.md` lo hace en T15–T17 (Bloque 5).

QC-202 queda absorbida: el leader la cancela o la reduce.

**Alternativa descartada, (B): QC-215 espera a QC-202.** QC-202 se reescribiría con la cadena de
D11: crearía `TERMINADO` cerrado, con «Terminados», etiqueta y filtro, sin tocar Terminar el
empaque. Mergearía antes y QC-215 dependería de ella. Se descarta porque:

- QC-202 había que reescribirla igual: sus R2, R3 y R24 contradicen D11;
- las dos fichas tocarían y revisarían dos veces los mismos archivos: `order-transitions.ts`, las
  `CHECK` de `orders`, `order-row-actions.tsx`, `company-orders-columns.tsx`,
  `assignment-view-params.ts` y `list-finished-orders.ts`;
- habría dos migraciones seguidas que recrean las mismas restricciones;
- QC-215 se bloquearía tras una ficha sin assignee.
