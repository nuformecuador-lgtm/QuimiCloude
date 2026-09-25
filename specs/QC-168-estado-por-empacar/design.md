# QC-168 — estado-por-empacar · design.md

> Medido sobre `origin/dev` 7e1087af (incluye QC-150 y QC-141). Todo lo que aquí se cita del código
> existe en ese commit; lo que no se pudo medir está marcado como tal.

## 0. Lo que hay hoy (y cambia)

| Pieza | Hoy | Tras QC-168 |
|---|---|---|
| `enum OrderStatus` (`db/schema.prisma:575`) | 4 valores; `ORDER_STATUS_VALUES` en `pedidos/domain/order-classification.ts` lo duplica y `tests/unit/pedidos/module-contract.test.ts` compara las dos listas en orden | 6 valores |
| Matriz `ALLOWED` (`pedidos/domain/order-transitions.ts`) | `PENDIENTE → [PENDIENTE, EN_CURSO, ENTREGADO]`, `EN_CURSO → [EN_CURSO, ENTREGADO]` | ver §2 |
| `createTransitionOrder` (`pedidos/domain/transition-order.ts`) | con `to === 'ENTREGADO'`: consumo (QC-141) + lote de producto terminado (QC-150) + `setReservedAt(null)` | la rama pasa a `to === 'POR_EMPACAR'`; `ENTREGADO` y `EN_EMPAQUE` dejan de ser destino de este método |
| `setAliveOrderStatus` (`pedidos/adapters/driven/persistence/order-prisma.ts:630`) | escribe `finishedAt` si `to === 'ENTREGADO'` | sin cambio de regla; ahora solo lo alcanza Terminar |
| `finishAssignedOrder` (`asignaciones/domain/finish-assigned-order.ts`) | destino `'ENTREGADO'` | destino `'POR_EMPACAR'` |
| `CANCELABLES` (`pedidos/domain/cancel-order.ts`) | `['PENDIENTE','EN_CURSO']` | **sin cambios**: D5 ya se cumple; se añaden tests |
| `NO_BORRABLES` (`pedidos/domain/delete-order.ts`) + CHECK `orders_delivered_not_deleted` | `ENTREGADO`, `CANCELADO` | + `POR_EMPACAR`, `EN_EMPAQUE` (⚑ P2) |
| `ERROR_POR_ESTADO` (`asignaciones/domain/order-state.ts`, `satisfies Record<OrderStatus,…>`) | 4 claves | 6 claves (⚑ P1) — no compila sin ellas |
| `resolveAssignmentViews` (`asignaciones/domain/assignment-views.ts`) | `todos` / `asignados` + `terminados` | + `por_empacar` si `empaque.modificar` |
| `PERMISSIONS` (`identity/domain/permissions.ts`) | **20** entradas | + `empaque.modificar` |
| CHECK `orders_finished_at_requires_delivered` | `finished_at IS NULL OR status = 'ENTREGADO'` | **sin cambios**: ya cubre R8 |

## 1. Modelo de datos

### 1.1 Enum

`ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'POR_EMPACAR'; … 'EN_EMPAQUE';` **al final** del
tipo (después de `CANCELADO`), mismo patrón que QC-34. `ORDER_STATUS_VALUES` queda
`['PENDIENTE','EN_CURSO','ENTREGADO','CANCELADO','POR_EMPACAR','EN_EMPAQUE']`. El orden del enum no
tiene significado de negocio (lo dice `order-classification.ts`); para pintar filtros en orden de
flujo, `pedidos` publica además `ORDER_STATUS_FLOW` (`PENDIENTE, EN_CURSO, POR_EMPACAR, EN_EMPAQUE,
ENTREGADO, CANCELADO`), que usan `ORDER_STATUS_FILTER_OPTIONS` y el filtro de «Todos».

Todo CHECK nuevo que nombre un valor nuevo va con `"status"::text` (el `55P04` que documenta
`20260904135210_order_cancellation/migration.sql`).

### 1.2 Quién empaca: columna `orders.packed_by` (decisión F1.4-1)

D2 y D7 exigen saber quién comenzó el empaque y mostrarlo; D13 dice «ninguna tabla nueva» y solo
nombra enum y catálogo. Hace falta **una columna** (no una tabla):

- `packed_by UUID NULL` en `orders`, `packedBy String? @map("packed_by") @db.Uuid` sin `@relation`
  (drift, como `createdBy`).
- FK **compuesta** `("packed_by","company_id") → users("id","company_id") ON DELETE RESTRICT ON UPDATE
  CASCADE` (patrón de `order_assignments_user_id_fkey`): el empacador es de la empresa del pedido por
  construcción (R28).
- Índice `orders_packed_by_idx` sobre `packed_by`.
- CHECK `orders_packed_by_matches_status`:
  `("status"::text <> 'EN_EMPAQUE' OR "packed_by" IS NOT NULL) AND ("status"::text NOT IN
  ('PENDIENTE','EN_CURSO','POR_EMPACAR','CANCELADO') OR "packed_by" IS NULL)`. En `ENTREGADO` puede
  ir con o sin valor (los entregados anteriores no lo tienen; los nuevos lo conservan).
- CHECK `orders_delivered_not_deleted` (mismo nombre): `"deleted_at" IS NULL OR "status"::text NOT IN
  ('ENTREGADO','CANCELADO','POR_EMPACAR','EN_EMPAQUE')` (⚑ P2).
- Sin backfill (D10). RLS de `orders` ya está activada y forzada; no cambia.
- Sin índice parcial nuevo para «Por empacar»: `orders_status_idx (status) WHERE deleted_at IS NULL`
  ya sirve el filtro, y un índice parcial sobre `status::text` no lo usaría Prisma.

### 1.3 Migraciones

1. `db/migrations/20260925120000_order_packing_states/` — enum, columna, FK, índice, dos CHECK.
   `down.sql`: guardia `RAISE` si hay filas en los estados nuevos (R47) → `DROP` de los CHECK
   `orders_packed_by_matches_status`, `orders_delivered_not_deleted`,
   `orders_cancellation_reason_matches_status`, `orders_finished_at_requires_delivered` y de los
   índices que dependen de `status` (`orders_status_idx`, `orders_expirable_idx`,
   `orders_company_finished_idx`) → drop columna → recrear el tipo con 4 valores (rename + create +
   `ALTER COLUMN TYPE … USING status::text::"OrderStatus"` con el DEFAULT quitado y repuesto) →
   recrear CHECK e índices **con su definición literal actual**. Riesgo: es el `down.sql` más largo
   de `orders`; el test estático de la migración compara cada definición recreada con la original.
2. `db/migrations/20260925120100_packing_permission/` — solo datos, calcada de
   `20260922120000_packer_role`: `INSERT … permissions ('empaque.modificar', …) ON CONFLICT DO
   NOTHING` y `role_permissions` del Empacador por nombre de rol. `down.sql`: borra esa asignación y
   ese permiso.

Timestamps: posteriores a `20260924120000_customers` (último en `dev`). QC-154 añade la suya en su
rama; si al hacer merge la suya queda después, no hay conflicto de contenido (tablas distintas).

## 2. Transiciones (`pedidos`)

```ts
const ALLOWED = {
  PENDIENTE:   ['PENDIENTE', 'EN_CURSO'],        // ⚑ P5: sale 'ENTREGADO' y no entra 'POR_EMPACAR'
  EN_CURSO:    ['EN_CURSO', 'POR_EMPACAR'],
  POR_EMPACAR: ['EN_EMPAQUE'],                    // sin «quedarse igual» ⇒ no editable (R32)
  EN_EMPAQUE:  ['ENTREGADO'],
  ENTREGADO:   [],
  CANCELADO:   [],
};
```

- `updateOrder` usa `assertTransition(s, s)`: con las listas de arriba rechaza `POR_EMPACAR` y
  `EN_EMPAQUE` con `invalid_transition` sin tocar nada más (R32).
- `transitionAliveById` (el puerto que usa `asignaciones`) **rechaza como `invalid_transition` los
  destinos `EN_EMPAQUE` y `ENTREGADO`**: solo se alcanzan por los dos métodos de empaque de §3, que
  son los que conocen a quien empaca. La rama de consumo + lote pasa de `to === 'ENTREGADO'` a
  `to === 'POR_EMPACAR'`, sin otro cambio: mismo orden (receta → coste → consumo → `setStatus` →
  `receiveFromOrder` → `setReservedAt(null)`), mismos resultados. `setStatus` hacia `POR_EMPACAR` no
  escribe `finishedAt` (R8) porque la regla del adaptador es `to === 'ENTREGADO'`.
- R10 (doble Finalizar): `finishAssignedOrder` comprueba el estado leído y, si no es `EN_CURSO`
  (`PENDIENTE` por P5, o `POR_EMPACAR`/`EN_EMPAQUE`/`ENTREGADO`/`CANCELADO`), lanza sin llamar a
  `transitionAliveById`; la carrera la cierra el `'stale'` del `UPDATE … WHERE status = from`, que ya
  existe. Ningún segundo lote puede nacer: el consumo y el alta van después del bloqueo de la fila.

## 3. Empaque: contrato entre módulos

`OrderCatalog` (`pedidos/domain/order-catalog.ts`) gana dos métodos y un campo:

```ts
startPackingAliveById(id: string, companyId: string, packerId: string, now: Date):
  Promise<'ok' | 'already_mine' | 'taken' | 'not_packable' | 'not_found'>;
finishPackingAliveById(id: string, companyId: string, packerId: string, now: Date):
  Promise<'ok' | 'not_packer' | 'not_packable' | 'not_found'>;
// AssignedOrderSummary gana: readonly packedBy: string | null;
```

Implementación en `pedidos/domain/order-packing.ts` sobre dos funciones nuevas del adaptador
(`order-prisma.ts`), cada una **un `UPDATE` condicional** con ámbito de empresa:

- Comenzar: `SET status='EN_EMPAQUE', packed_by=$packer, updated_at, updated_by WHERE id AND
  company AND deleted_at IS NULL AND status='POR_EMPACAR'`. `count = 1` ⇒ `ok`. Si no, se relee la
  fila: no existe ⇒ `not_found`; `EN_EMPAQUE` con `packed_by = packer` ⇒ `already_mine`; con otro ⇒
  `taken`; cualquier otro estado ⇒ `not_packable`. Dos Comenzar simultáneos: el segundo `UPDATE`
  espera el bloqueo de fila del primero, reevalúa el `WHERE` y cuenta 0 ⇒ `taken` (R19).
- Terminar: `SET status='ENTREGADO', finished_at=$now, … WHERE … AND status='EN_EMPAQUE' AND
  packed_by=$packer`. Si no: `not_found` / `EN_EMPAQUE` de otro ⇒ `not_packer` / resto ⇒
  `not_packable`. Estado y fecha en la misma sentencia (R21).
- Ninguno abre la unidad de trabajo de inventario: no hay consumo ni lote (R25). `assertTransition`
  se llama igual antes del `UPDATE`.

`asignaciones` gana cuatro casos de uso, todos con `requirePermission(actor, 'empaque.modificar')`
en la primera línea (R13), `zod` estricto `{ orderId: uuid }` y empresa del actor:

| Caso de uso | Qué hace | Errores |
|---|---|---|
| `listPackingOrders` | `listAliveSummariesInCompany(company, ['POR_EMPACAR','EN_EMPAQUE'], 'work_queue', page, size)` + `composeOrderRows` + nombres de `packedBy` (`PeopleDirectory`) + envases (§4) | `validation` |
| `getPackingOrder` | la misma fila para una sola id; `null`/otro estado ⇒ | `order_not_found` |
| `startPacking` | mapea `ok`/`already_mine` ⇒ éxito; `taken` ⇒ `OrderPackingTakenError`; `not_packable` ⇒ `OrderNotPackableError`; `not_found` ⇒ `OrderNotFoundError` | |
| `finishPacking` | igual; `not_packer` ⇒ `OrderPackingTakenError`; devuelve `{ numberText }` leído antes | |

Sin comprobación de asignación (D2). Errores nuevos en `errores/domain/error-codes.ts` y
`error-catalog.ts`:

| Código | Mensaje |
|---|---|
| `order_packing_taken` | «Otro empacador está empacando este pedido.» |
| `order_not_packable` | «El pedido no está en un estado que admita esa acción de empaque.» |
| `order_produced_frozen` (⚑ P1) | «Un pedido ya producido conserva sus responsables tal como estaban.» |

## 4. Envases en «Por empacar»

`inventario` publica en `ProductCatalog` (`inventario/domain/product-catalog.ts`)
`findFinishedGoodsReceipts(orderIds, companyId): Promise<readonly { orderId; packages: string }[]>`,
leído del asiento `production` de `inventory_movements` (índice `inventory_movements_order_id_idx`)
dividido por el contenido guardado en su lote (QC-150 R41). Es lo que **entró de verdad**; filtra por
empresa (`guard-ambito-empresa-inventario`). No exige `inventario.consultar`: la autorización la hizo
el caso de uso de `asignaciones` con `empaque.modificar` (el Empacador no ve inventario, QC-144).

## 5. Permiso

- Código **`empaque.modificar`** (decisión F1.4-2). `tests/unit/identity/permissions.test.ts` R1
  exige acción `consultar|modificar`, así que `empaque.empacar` no cabe; `empaque.consultar` mentiría
  (escribe). `empaque` no es carpeta de `lib/modules/` (como `usuarios` y `terminados`).
- Es el primer módulo **solo con `modificar`**: enmienda QC-74 R3 («un módulo con escritura declara
  consultar y modificar»). `permissions.test.ts` gana una tercera lista `MODULOS_SOLO_ESCRITURA =
  ['empaque']`. Bloque de enmienda en el comentario del catálogo, ≤ 5 líneas y sin citar fichas.
- El Administrador **no** lo recibe (D6): es la primera vez que el Administrador no tiene el
  catálogo entero. Enmienda QC-74 R8 / QC-144 R9. Se ponen rojos
  `tests/unit/identity/seed/seed-initial-access.test.ts:755-756` y
  `tests/integration/identity/identity-seed.int.test.ts:797,798,835,872,1038`: pasan a comparar con
  «catálogo menos los códigos excluidos del Administrador», derivados de una constante del dominio
  (`ADMIN_EXCLUDED_PERMISSIONS`) y no escritos en el test. **QC-161** (Maestro, `empresas.*` que el
  Administrador tampoco recibe) choca aquí: quien llegue segundo añade su código a esa lista.
- `tests/unit/identity/catalogo-sin-total-fijo.test.ts` sigue mandando: ningún test nuevo fija un
  total.

## 6. Pantallas y rutas

- `/asignacion?vista=por_empacar`: `AssignmentViewKind` gana `'por_empacar'`, añadida **al final**
  (⚑ P6). Sección `PackingOrdersListSection` + `packing-orders-columns.tsx` + skeleton, en
  `app/(private)/asignacion/components/` con su barrel.
- Pantalla de pedido: **`app/(private)/asignacion/empaque/[id]/page.tsx`**, primera línea
  `requirePagePermission('empaque.modificar')` (R40; `guard-pantallas-exigen-permiso` admite cualquier
  código del catálogo). Componentes en `…/empaque/[id]/components/` con barrel. Botones como
  formularios a Server Actions nuevas en `asignaciones/adapters/driving/order-packing-actions.ts`
  (`startPackingAction`, `finishPackingAction`). Terminar redirige a
  `/asignacion?vista=por_empacar&empacado=<n>` (`PACKED_ORDER_PARAM` en `lib/shared/routes.ts`).
- Confirmación del Finalizar: `assigned-order-delivered-notice.tsx` cambia el texto de «Pedido N
  entregado» a «Pedido N por empacar» manteniendo envases y producto; los nombres de parámetro no
  cambian (evita tocar `lib/shared/routes.ts` más de lo necesario).
- Etiquetas «Por empacar» / «En empaque» en `order-status-badge.tsx`, `company-orders-columns.tsx`,
  `ROUTE_ORDER_STATUS_VALUES`. `ORDER_STATUS_IS_FINAL` (`order-row-actions.tsx`) pone `true` para los
  dos estados nuevos: se reutiliza `FINAL_ORDER_REASON` («ya está cerrado…»), que sigue siendo cierto.
  No se renombra ninguna exportación del barrel de Pedidos (`guard-pantalla-pedidos-se-amplia`).
- Multiplataforma: `min-h-11 min-w-11` en botones, sin `100vh`, sin hover (R43).

## 7. Alternativas descartadas

1. **Guardar el empacador como una fila más de `order_assignments`.** Ahorraba la columna, pero lo
   mezclaba con los responsables (aparecería en «Mis asignados», en «Responsables» y en
   «Terminados» como si hubiera producido), y la regla «el primero se lo queda» no se puede expresar
   con la PK `(order_id, user_id)`. Además «asignar empacadores» está fuera de alcance.
2. **Reutilizar `transitionAliveById` para empaque** con un parámetro opcional de empacador. Un
   método que según el destino consume inventario, escribe fecha o fija empacador es justo el que
   ya costó dos revisiones en QC-141; dos métodos de un `UPDATE` cada uno se prueban solos.
3. **Añadir los valores `BEFORE 'ENTREGADO'`** para que el enum quede en orden de flujo. Postgres lo
   admite, pero no se pudo verificar sin red cómo lo trata el diff de Prisma (drift), y QC-34 dejó
   escrito «va el último». El orden de pantalla lo da `ORDER_STATUS_FLOW`.
4. **Calcular los envases en `pedidos`** con `quantity / presentation_content`. Inexacto para
   pedidos sin copia del contenido (QC-150 R44 usa el vigente al Finalizar, que puede haber
   cambiado); el asiento de producción es la cifra real.
5. **Ruta `/asignacion/[id]/empaque`.** Anidaría la pantalla del Empacador bajo la del Operario,
   cuyo `[id]` exige estar asignado; una ruta hermana deja claros los dos permisos.

## 8. Enmiendas a specs ya cerrados (se anotan con fecha en cada uno en la task T15)

- **QC-63**: R11 (Finalizar deja `POR_EMPACAR`), R12 (la transición que pregunta es `→ POR_EMPACAR`),
  R14 (+ los dos estados nuevos, ⚑ P1), R15 (la confirmación dice «por empacar»).
- **QC-141**: R15 («entregar» → «finalizar»), R22 (+ `POR_EMPACAR`, `EN_EMPAQUE`), R27, R30, R31, R50
  (el consumo ocurre al pasar a `POR_EMPACAR`), **R51 se parte**: consumo + estado `POR_EMPACAR` en
  una transacción; la fecha de terminado sale de esa operación y pasa a Terminar. R48 (E2E: «finalizar
  consume»).
- **QC-150**: R10, R24, R26 (el Finalizar deja `POR_EMPACAR`); R13 (la «fecha civil del Finalizar»
  no cambia); R27 sigue siendo cierto; R37 (E2E).
- **QC-145**: R3 y R30 (la fecha de terminado la escribe Terminar, no Finalizar).
- **QC-74** R3 y R8, **QC-144** R9 (§5).

## 9. Lo que QC-82 tendrá que enmendar (sin tocar su spec, R45)

1. **R21** y `design.md:178` / `tasks.md` T11: «en la misma operación que deja el pedido
   `ENTREGADO`» → `POR_EMPACAR`.
2. `design.md:14` «Estados que congelan»: faltan `POR_EMPACAR` y `EN_EMPAQUE` con el error que se
   decida en P1.
3. `design.md:118` `ExecutionAction` gana las dos acciones de D8 («comenzar empaque», «terminar
   empaque»), anotadas desde `startPacking`/`finishPacking` de esta ficha. Esos dos casos de uso hoy
   son un `UPDATE` sin transacción: QC-82 tendrá que envolverlos en su `transaction.run` igual que
   `start`/`finish`, y el retorno `already_mine` (Comenzar repetido) no debe anotar dos veces.
4. **R26**: sus escrituras exigen `asignaciones.consultar`; las dos de empaque exigen
   `empaque.modificar`. **R30** («el seed no cambia») sigue siendo cierto respecto a QC-82.
5. `tasks.md:76` (`cancelAliveById`): con `POR_EMPACAR`/`EN_EMPAQUE` debe devolver
   `not_cancellable`, no `not_found`.
6. Su E2E (D17) espera `ENTREGADO` tras Finalizar.

## 10. Tests y guardias que se ponen rojos (y se arreglan en su task)

Unitarios: `pedidos/order-transitions.test.ts` (matriz 16 → 36 pares), `transition-order.test.ts`,
`module-contract.test.ts` (enum), `schema/pedidos-schema.test.ts` y `schema/pedidos-migration.test.ts`
(censo de CHECK de `orders`), `cancel-order.test.ts`, `delete-order.test.ts`, `update-order.test.ts`,
`qc145-estado-solo-planta.test.ts`; `asignaciones/finish-assigned-order.test.ts`,
`start-assigned-order.test.ts`, `order-state.test.ts`, `assignment-views.test.ts`;
`asignaciones-ui/assigned-orders-delivered-notice.test.tsx`, `assignment-view-params.test.ts`,
`company-orders-columns.test.tsx`, `asignacion-page.test.tsx`; `pedidos-ui/order-row-actions.test.tsx`,
`order-columns.test.tsx`; `identity/permissions.test.ts`, `seed/seed-initial-access.test.ts`;
`errores/catalogo.test.ts` (`toHaveLength(56)` → 59; choca con cualquier ficha que añada códigos);
el test de «una lectura de sesión por petición» que lee `adapters/driving/` del disco (acción nueva).
Integración: `pedidos/finish-with-finished-goods`, `order-finished-at`, `pedidos-constraints`,
`order-repository`, `identity/identity-seed`; los nuevos entran en `tests/integration/aislamiento.json`.
Guardias: `guard-catalogo-de-errores`, `guard-pantallas-exigen-permiso`, `guard-ambito-empresa-pedidos`,
`guard-ambito-empresa-inventario`, `guard-aislamiento-integracion`, `guard-permisos-sembrados`,
`guard-arquitectura-modulos`. E2E: `ejecucion-receta`, `producto-terminado`, `reserva-de-material`,
`pedidos-terminados`, `pedidos-asignados` (todos asumen `ENTREGADO` tras Finalizar).

## 11. Cruce de archivos con otras fichas

- **QC-154** (`in_progress`): comparte `db/schema.prisma` (bloque `Customer`, distinto de `Order` y
  del enum) y `db/migrations/` (carpetas distintas). Conflicto textual improbable; se cruza en F2.0.
- **QC-161** (`pending`): `permissions.ts`, `permissions.test.ts`, seed tests y la lista
  `ADMIN_EXCLUDED_PERMISSIONS` (§5).
- **QC-82** (`spec_ready`): `finish-assigned-order.ts`, `start-assigned-order.ts`, `order-state.ts`,
  `order-execution-actions.ts` y sus tests. Va después (D9).

## 12. Dependencias

Ninguna (D13).

## Decisiones para F1.4

1. Columna `orders.packed_by` (§1.2): D13 no la nombra pero D2/D7 la necesitan.
2. Código `empaque.modificar` y la enmienda a QC-74 R3 (módulo solo de escritura) y a «el
   Administrador tiene todo el catálogo» (§5).
3. P1, P2, P5, P6 de `requirements.md`.
4. Comenzar repetido por el mismo Empacador es éxito sin escritura (R20).
5. Texto de la confirmación del Finalizar («Pedido N por empacar») y de los tres errores nuevos.
