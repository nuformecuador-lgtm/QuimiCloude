# QC-145 — pedidos-terminados-en-asignacion · design.md

> Cómo se construye `requirements.md`. Los requisitos se citan como `R<n>` y las decisiones
> cerradas como `[D<n>]`, en el orden de su tabla. **No hay dependencias nuevas ni tablas nuevas**
> (R29). Lo que sigue abierto en `requirements.md > Preguntas abiertas` (2 a 5) se marca aquí como
> **propuesta** y no se da por decidido.

## 0. Hallazgos sobre `dev` (medidos el 2026-09-23, con QC-144, QC-146 y QC-147 ya mergeadas)

| Dato | Dónde | Consecuencia |
|---|---|---|
| `/asignacion` exige `asignaciones.consultar` y pinta una sola lista | `app/(private)/asignacion/page.tsx` → `AssignedOrdersListSection` → `listAssignedOrdersAction` → `domain/list-assigned-orders.ts` | «Mis asignados» es esto mismo y **no cambia** (R11) |
| El esquema de la lista es estricto: solo `page`/`pageSize` | `list-assigned-orders.ts:34` | Las vistas nuevas tienen su propio caso de uso y su propio esquema. No se amplía este |
| Orden de trabajo: `priority DESC, created_at ASC, order_year ASC, order_sequence ASC, id ASC` | `order-catalog-prisma.ts:119-125` | Es el «orden de la lista de trabajo» de R22 |
| A `ENTREGADO` se llega por **dos** caminos: `transitionAliveOrder` (Finalizar) y `updateAliveOrder` (edición, que escribe `status: data.status`) | `order-catalog-prisma.ts:145-163`, `order-prisma.ts:525-547` | D8 quita el segundo. Así, `transitionAliveOrder` queda como **único** sitio que escribe `ENTREGADO` y la fecha puede ir ahí (R3, R10) |
| La edición valida con `assertTransition(row.status, data.status)` y el formulario tiene un selector de estado | `update-order.ts:78`, `order-form.tsx:644-658`, `order-input.ts:110-113` | Se retira el campo de la entrada, del tipo, del adaptador y del formulario (R6, R7) |
| `ALLOWED` admite `X → X` para `PENDIENTE`/`EN_CURSO` y lista vacía para los finales | `order-transitions.ts:22-27` | «Quedarse igual» sirve para expresar «editable» sin tabla nueva (R8, § 2.3) |
| `orders` no tiene fecha de terminado. `updated_at` cambia con cualquier edición | `db/schema.prisma` modelo `Order` | Columna nueva (R1). No se usa `updated_at` [D3] |
| Nulos al final, explícito: precedente `{ qtyAlert: { sort: dir, nulls: 'last' } }` | `product-prisma.ts:157` (la línea exacta se movió desde la `:158` de la semilla) | Mismo mecanismo en el orden de terminados (R20) |
| Permiso de terminados = `terminados.consultar`. Lo tienen el Administrador y el Empacador. El catálogo tiene 16 permisos | `identity/domain/permissions.ts:135-140, 161-182` | R12, R18. El catálogo no cambia (R16) |
| `tests/unit/identity/roles/empacador-rol.test.ts` (QC-144 R16) exige que **ningún** archivo de producción, salvo el catálogo, nombre `terminados.consultar` | ese test, `describe('R16 — …')` | Hay que **enmendarlo** para abrir exactamente los archivos de § 3 (T6) |
| `tests/guards/guard-qc87-no-reimplementado.test.ts` enumera las acciones exportadas por `order-assignment-actions.ts` y comprueba que la lista es exacta | `ACCIONES`, línea 83 | Las dos acciones nuevas se añaden a esa lista (T7) |
| El selector de responsables no filtra por rol. La ejecución solo exige `asignaciones.consultar` y estar asignado | `assign-responsibles.ts:113-120`, `start-/finish-assigned-order.ts` | Datos añadidos a la Pregunta abierta 1 y origen de la Pregunta 5. **Esta ficha no los toca** |
| La presentación ya viaja en `AssignedOrderSummary.presentationId` y se pinta con `OrderPresentationLabel` («Sin presentación») | QC-146: `order-catalog.ts:92`, `components/shared/order-presentation-label.tsx` | Se reutiliza en «Terminados» y «Todos» (R21) |
| Fechas en tabla: `YYYY-MM-DD` en UTC con `toISOString().slice(0, 10)`, nunca `toLocale*`, para evitar discrepancias de hidratación | `order-columns.tsx:115-123` | Mismo formato para la fecha de terminado (R21) |
| La pestaña ya existe como primitiva | `components/ui/tabs.tsx` | No hace falta ningún componente ni librería nuevos |
| QC-82 (`spec_ready`, sin implementar) envolverá `finishAssignedOrder` en `transaction.run` y anotará «finalizar» en la misma operación | `specs/QC-82-…/design.md:178`, `requirements.md` R21, R24 | § 8: la fecha va en el **mismo `UPDATE`** del estado, así que vale con o sin QC-82 |

## 1. Modelo de datos

### 1.1 Columna

```prisma
model Order {
  // ...
  /// Instante en que el pedido paso a ENTREGADO al finalizarlo en planta. NULL en los entregados
  /// antes de existir la columna. Solo puede tener valor si el estado es ENTREGADO (CHECK).
  finishedAt DateTime? @map("finished_at") @db.Timestamptz(6)
}
```

- Anulable, **sin `DEFAULT`**, sin backfill y sin `UPDATE` en la migración (R2). No se deriva de
  `updated_at` [D3].
- `timestamptz(6)`, igual que `created_at`/`updated_at`/`deleted_at`.
- Sin columna de empresa nueva: `orders` ya tiene `company_id`. La tabla ya tiene RLS forzada y la
  columna no cambia nada de eso.

### 1.2 Restricción (R4)

```sql
ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_at_requires_delivered"
  CHECK ("finished_at" IS NULL OR "status" = 'ENTREGADO');
```

Todas las filas existentes la cumplen porque la columna nace nula. `ENTREGADO` es un estado final y
la base impide borrarlo (QC-34), así que ningún camino legítimo la viola. El `CHECK` es drift para
`prisma migrate dev`, igual que los demás `CHECK` de `orders`: se escribe a mano y se aplica con
`pnpm run db:migrate` (`migrate deploy`).

### 1.3 Índice parcial para «Terminados»

```sql
CREATE INDEX "orders_company_finished_idx"
  ON "orders" ("company_id", "finished_at" DESC NULLS LAST, "order_year" DESC, "order_sequence" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'ENTREGADO';
```

Cubre la consulta de R17 + R20 con la propuesta de la Pregunta abierta 2 (número descendente). Si
el humano elige el sentido ascendente, solo cambian las dos últimas columnas del índice y el
`orderBy` de § 2.2. Es parcial y solo vive en la migración, como los índices de
`list_query_indexes` («Los índices de listado son parciales y viven en la migración», comentario
del modelo `Order`). Evita el anti-patrón de consulta sin índice en una ruta caliente
(`docs/architecture.md`).

«Todos» sin filtro usa el índice existente `orders_company_id_order_year_order_sequence` y
`orders_status_idx`. El orden de trabajo no cambia respecto de «Mis asignados», que ya se consulta
así.

### 1.4 Migración `db/migrations/20260923120000_orders_finished_at/`

- `migration.sql`: `ADD COLUMN "finished_at" TIMESTAMPTZ(6)`, el `CHECK` y el índice, en ese orden.
- `down.sql`: `DROP INDEX`, `DROP CONSTRAINT` y `DROP COLUMN`, en orden inverso. Revierte
  exactamente el UP.
- Ciclo `db:migrate → db:rollback → db:migrate` contra la base propia **`QuimiCloude_QC145`**,
  nunca contra la de `.env` (T1).

## 2. Módulo `pedidos`

### 2.1 Finalizar escribe la fecha (R3, R5, R10)

`transitionAliveOrder` (`order-catalog-prisma.ts`) añade `finishedAt: now` al `data` del mismo
`updateMany` **solo cuando `to === 'ENTREGADO'`**:

```ts
data: { status: to, updatedAt: now, updatedBy: actorId, ...(to === 'ENTREGADO' ? { finishedAt: now } : {}) }
```

- Es la misma sentencia que cambia el estado, así que es atómica por construcción (R3). No hace
  falta transacción.
- `now` es el reloj que ya inyecta `finishAssignedOrder` (`deps.now`). La firma del puerto
  `OrderCatalog.transitionAliveById` **no cambia**, y `asignaciones` no conoce la columna.
- Ninguna otra escritura toca `finishedAt`: `create`, `updateAliveOrder`, `cancelAliveOrder` y
  `softDeleteAliveOrder` no la nombran (R5). Lo fija un test de fuente (§ 10).

### 2.2 `OrderCatalog` gana una consulta por empresa (R17, R20, R22, R24, R27)

En `domain/order-catalog.ts`:

```ts
export type OrderSummaryOrdering = 'work_queue' | 'finished_recent_first';

export type AssignedOrderSummary = {
  // ...los campos de hoy...
  /** `null` = sin fecha de terminado. */
  readonly finishedAt: Date | null;
};

export interface OrderCatalog {
  // ...los tres métodos de hoy, sin cambios...
  listAliveSummariesInCompany(
    companyId: string,
    statuses: readonly OrderStatus[],
    ordering: OrderSummaryOrdering,
    page: number,
    pageSize?: number,
  ): Promise<Page<AssignedOrderSummary>>;
}
```

Adaptador (`order-catalog-prisma.ts`, función `listAliveOrderSummariesInCompany`):

- `where`: `AND: [orderCompanyScope({ companyId }), { status: { in: statuses }, deletedAt: null }]`.
  **No hay filtro de ids**: es de toda la empresa (R17, R22). `statuses` vacío no llega. Lo corta el
  dominio.
- `orderBy` según `ordering`:
  - `work_queue`: el mismo array de hoy (`priority desc, createdAt asc, orderYear asc,
    orderSequence asc, id asc`). Se extrae a una constante compartida con
    `listAliveOrderSummariesByIds` para que no diverjan.
  - `finished_recent_first`: `[{ finishedAt: { sort: 'desc', nulls: 'last' } }, { orderYear: 'desc' },
    { orderSequence: 'desc' }, { id: 'asc' }]`. El `nulls: 'last'` va explícito porque Postgres
    pone los nulos primero en `DESC` (R20, precedente `product-prisma.ts:157`). El sentido del
    número es la **propuesta** de la Pregunta abierta 2.
- `count` + `findMany` en `Promise.all`, y `buildPage`/`toOffsetLimit` de `lib/shared/pagination`
  (10 por defecto y 25 máximo, R27). Es el mismo patrón que `listAliveOrderSummariesByIds`.
- `toAssignedOrderSummary` mapea también `finishedAt`. `listAliveOrderSummariesByIds` añade
  `finishedAt: true` a su `select`. «Mis asignados» no lo pinta.

Por qué en `OrderCatalog` y no en `OrderRepository`: `asignaciones` no puede tocar `prisma.order`
ni el puerto interno de `pedidos` (`docs/architecture.md > Dominio` n.º 2). `OrderCatalog` es el
servicio que `pedidos` ya ofrece a otros módulos para esto.

El dominio de `pedidos` decide qué orden se aplica. El adaptador solo traduce el literal.

### 2.3 La edición deja de mover el estado (R6, R7, R8)

| Pieza | Cambio |
|---|---|
| `order-input.ts` | `updateOrderSchema = createOrderSchema` (misma forma, **sin** `status`). `z.object` descarta las claves desconocidas, así que un `status` que llegue se ignora en silencio (R6). Es el mismo criterio que ya aplica el alta con `status` y `cancellationReason`. `UpdateOrderInput` pierde `status`. |
| `order-view.ts` | Nuevo `OrderEdit = Omit<NewOrder, 'status'>`. `NewOrder` conserva `status` porque el alta lo necesita (`STATUS_DE_ALTA`). |
| `ports/order-repository.ts` | `updateAlive(id, data: OrderEdit, …)`. El tipo ya no puede expresar un estado. |
| `update-order.ts` | `assertTransition(row.status, data.status)` pasa a ser `assertTransition(row.status, row.status)`: «quedarse igual» es legal si y solo si el pedido no es final. Se conserva el mismo `invalid_transition` de hoy para `ENTREGADO`/`CANCELADO` (R8), sin tabla ni error nuevos. |
| `order-prisma.ts` `updateAliveOrder` | Quita `status: data.status` del `data`. |
| `order-actions.ts` `buildUpdateCandidate` | Deja de leer `status` del `FormData`. |
| `order-transitions.ts` | **Sin cambios**. Sigue siendo la única tabla. Ahora la consultan la planta (`transitionAliveOrder`) y la edición para «¿es editable?». |
| `index.ts` | `EDITABLE_STATUS_VALUES`, `EditableOrderStatus` e `isAllowedTransition` **se quedan** (los usa el alta y los tests del contrato). Se exporta `OrderEdit` y `OrderSummaryOrdering`. |

Cancelar (`cancel-order.ts`, `cancelAliveOrder`) **no se toca** (R9). Su test de regresión
existente queda como evidencia y se cita en § 10.

**Riesgo que se cierra de paso.** Hoy `updateAliveOrder` no filtra por estado. Una edición que
empieza antes de un Finalizar concurrente y escribe después podía devolver un `ENTREGADO` a
`EN_CURSO`. Sin `status` en el `data`, eso ya no puede pasar. La edición de otros campos de un
pedido que se entregó entre la lectura y la escritura sigue siendo posible (ventana de
milisegundos). No se cierra aquí: habría que llevar el estado al `where`, y
`update-order.ts:67-70` descarta hacerlo por motivos de oráculo de `not_found`.

## 3. Módulo `asignaciones`

### 3.1 Qué vistas ve cada quien (R11-R15)

Nuevo `domain/assignment-views.ts`:

```ts
export type AssignmentViewKind = 'asignados' | 'terminados' | 'todos';

/** Nunca lanza. La autorización real sigue en la primera línea de cada caso de uso. */
export function resolveAssignmentViews(bearer: PermissionBearer | null | undefined): readonly AssignmentViewKind[];
```

- Con `pedidos.consultar` devuelve `['todos']` (R13).
- Si no, `['asignados']` más `'terminados'` si tiene `terminados.consultar` (R11, R12).
- Pertenencia con `assertPermission` de `identity` en `try/catch`, que es exactamente el patrón de
  `canModifyAssignments` (`actor.ts:114-121`). No hay segunda definición de la regla ni se lee
  el nombre del rol (R14).
- Se publica en el barrel. Así `app/**` no escribe ningún código de permiso: la respuesta sale del
  módulo y la cadena se queda dentro.

`resolveAssignmentView(requested: string | undefined, allowed)` → la pedida si está en `allowed`,
si no `allowed[0]` (R15). Es pura y vive en el mismo archivo.

### 3.2 `domain/list-finished-orders.ts` (R17-R21, R27)

```ts
createListFinishedOrders(deps: { orders: OrderCatalog; recipes: RecipeCatalog; presentations: PresentationCatalog })
  : (actor, input: unknown) => Promise<Page<FinishedOrderView>>
```

1. `requirePermission(actor, 'terminados.consultar')` como **primera línea**, antes de `zod` y de
   cualquier puerto (R18).
2. `z.strictObject({ page, pageSize })`, el mismo que «Mis asignados».
3. `orders.listAliveSummariesInCompany(actor.companyId, ['ENTREGADO'], 'finished_recent_first', …)`.
   La empresa sale del actor, nunca de la entrada.
4. Nombres de receta (`findRefsIncludingDeleted`) y de presentación (`findRefs`) en **una**
   llamada por página cada uno, como `list-assigned-orders.ts:95-112`.

```ts
export type FinishedOrderView = {
  readonly id: string;
  readonly numberText: string;
  readonly recipeName: string | null;
  readonly quantity: string;
  readonly presentationName: string | null;
  readonly finishedAt: Date | null;
};
```

No incluye responsables ni prioridad hasta que se responda la Pregunta abierta 3 (a).

### 3.3 `domain/list-company-orders.ts` (R22-R25, R27)

```ts
createListCompanyOrders(deps: { assignments; orders; recipes; people; presentations; now? })
  : (actor, input: unknown) => Promise<Page<CompanyOrderView>>
```

1. `requirePermission(actor, 'pedidos.consultar')` como primera línea (R23). Es el mismo código que
   ya exige `list-responsibles-for-orders.ts` en este módulo.
2. `z.strictObject({ page, pageSize, statuses: z.array(z.enum(ORDER_STATUS_VALUES)).min(1).optional() })`.
   Sin `statuses`, se usan los cuatro estados (R22).
3. Orden: `statuses` deduplicado igual a `['ENTREGADO']` → `finished_recent_first`. Cualquier otro
   caso → `work_queue` (R24, lectura literal de la Pregunta abierta 4).
4. Responsables de la página con `assignments.listByOrdersInCompany` y nombres con
   `people.findRefsIncludingDeletedInCompany`, igual que `list-assigned-orders.ts:114-143`. Se
   ordenan con `compareResponsibles` y **no se excluye al actor** (R25).

```ts
export type CompanyOrderView = {
  readonly id: string;
  readonly numberText: string;
  readonly recipeName: string | null;
  readonly quantity: string;
  readonly presentationName: string | null;
  readonly priority: OrderPriority;
  readonly status: OrderStatus;
  readonly responsibles: readonly OrderResponsible[];
};
```

Receta, cantidad, presentación y prioridad son la **propuesta** de la Pregunta abierta 3 (b).
Quitarlas es borrar columnas, sin tocar consultas.

### 3.4 Barrel y guardias

- `index.ts` publica `resolveAssignmentViews`, `resolveAssignmentView`, `AssignmentViewKind`, las
  dos factories con sus `*Deps` y los dos tipos de vista. Las Server Actions **no** se publican.
- **Enmienda obligatoria** de `tests/unit/identity/roles/empacador-rol.test.ts` (QC-144 R16). La
  puerta se abre **por archivo exacto**: `lib/modules/asignaciones/domain/list-finished-orders.ts`
  y `lib/modules/asignaciones/domain/assignment-views.ts`. Ni la carpeta ni el módulo. El caso
  negativo del test se conserva.
- `tests/unit/asignaciones/module-contract.test.ts` regla (e) vigila solo `asignaciones.*`: no hace
  falta tocarla. Los archivos nuevos no nombran esos códigos.

## 4. Adaptadores driving (Server Actions)

En `lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts`, junto a
`listAssignedOrdersAction` y con el mismo cuerpo (`currentActor()` + `try` + `toErrorState`):

```ts
export async function listFinishedOrdersAction(query: unknown): Promise<FinishedOrdersListResult>;
export async function listCompanyOrdersAction(query: unknown): Promise<CompanyOrdersListResult>;
```

- No comprueban permisos. La frontera es el caso de uso.
- `currentActor()` ya usa `runInRequestScope` (una lectura de sesión). Las dos acciones se añaden a
  la lista de `tests/unit/identity/session-once-per-request-actions.test.ts` si ese test lo exige
  (lee el disco y se pone rojo si falta).
- `tests/guards/guard-qc87-no-reimplementado.test.ts`: `ACCIONES` gana las dos.

## 5. Composición

`lib/composition/index.ts` cablea `createListFinishedOrders` y `createListCompanyOrders` con los
mismos `orderCatalog`, `recipeCatalog`, `presentationCatalog`, `peopleDirectory` y repositorio de
asignaciones que ya recibe `listAssignedOrders`. `orderCatalog` gana
`listAliveSummariesInCompany: listAliveOrderSummariesInCompany`.

## 6. UI

### 6.1 `app/(private)/asignacion/page.tsx`

1. `requirePagePermission('asignaciones.consultar')`, sin cambios.
2. `const views = resolveAssignmentViews(await identity.getSessionUser())`. Es la misma lectura de
   sesión de la petición (QC-104), no una segunda.
3. `const view = resolveAssignmentView(firstValue(searchParams.vista), views)` (R15).
4. Con `views.length > 1` se pinta `AssignmentViewTabs` (pestañas-enlace). Con una sola vista no
   hay pestañas: el Operador y el Administrador ven su lista directamente.
5. Según `view`: `AssignedOrdersListSection` (sin cambios), `FinishedOrdersListSection` o
   `CompanyOrdersListSection`, cada una en su `<Suspense>` con su esqueleto.

Las pestañas son **enlaces** (`?vista=…`) y no estado de cliente. Así la vista sobrevive a recargar
y a la paginación, y el servidor solo consulta la vista activa.

### 6.2 Parámetros de URL (`components/assignment-view-params.ts`)

- `vista` ∈ `asignados | terminados | todos`. Si falta, es inválida o no está permitida, se aplica
  R15.
- `page`/`pageSize` con el mismo parseo tolerante de `assigned-orders-list-params.ts`. Cada href
  conserva `vista`.
- «Todos»: `status` con valores separados por `,`, que es el formato de `/pedidos`
  (`order-list-params.ts`, `STATUS_PARAM`, `FILTER_SEPARATOR`). Los valores fuera de
  `ORDER_STATUS_VALUES` se descartan al parsear. Una URL nunca produce error. Se duplican las
  constantes en vez de importar desde otra ruta (regla de barrels de ruta).

### 6.3 «Terminados» (`finished-orders-*`)

Sección, tabla, columnas, vacío, error y esqueleto, calcados de los `assigned-orders-*`.
`DataTable` con `searchable={false}` y sin filtros. Columnas (R21):

| Columna | Celda |
|---|---|
| Nº de pedido | `numberText` |
| Receta | nombre o marca de ausencia |
| Cantidad | `formatDecimalDisplay` |
| Presentación | `OrderPresentationLabel` («Sin presentación») |
| Fecha de terminado | `YYYY-MM-DD` UTC o «Sin fecha» (`data-missing`) |

**Sin columna «Entrar» ni acciones** (R26).

### 6.4 «Todos» (`company-orders-*`)

Mismo esqueleto. Columnas: Nº, Receta, Cantidad, Presentación, Prioridad (propuesta P3 b), **Estado**
con filtro `{ kind: 'select', options: los cuatro estados }` (R24) y **Responsables** con
`ResponsibleAvatars` sin `onShowAll` (R25). Sin columna «Entrar» ni acciones (R26). Los textos del
estado reutilizan las etiquetas «Pendiente / En curso / Entregado / Cancelado», declaradas en la
ruta.

### 6.5 Pedidos (R7)

`order-form.tsx` quita el bloque del selector de estado en la edición y deja de enviar `status`.
El mapa de errores de campo apunta `invalid_transition` al **error general del formulario**, porque
el campo ya no existe. El panel sigue deshabilitando la escritura de un pedido final (`isFinal`),
así que ese error solo aparece en una carrera. `ORDER_STATUS_FIELD`/`*_TESTID` se retiran si nadie
más los usa.

### 6.6 Multiplataforma

Las pestañas son la primitiva `components/ui/tabs.tsx` (Radix, ya aprobada) usada como lista de
enlaces, con objetivo táctil de al menos 44 × 44 px y sin `:hover` como única vía. La tabla y el
filtro son los de `DataTable`, ya validados en `/pedidos`. Sin excepciones de escritorio.

## 7. Contratos de entrada y salida

| Acción | Entrada | Salida | Errores |
|---|---|---|---|
| `listFinishedOrdersAction` | `{ page?: int ≥ 1, pageSize?: int ≥ 1 }` (estricto) | `{ status: 'success', data: Page<FinishedOrderView> }` | `unauthorized`, `invalid_input` |
| `listCompanyOrdersAction` | `{ page?, pageSize?, statuses?: OrderStatus[] (≥ 1) }` (estricto) | `{ status: 'success', data: Page<CompanyOrderView> }` | `unauthorized`, `invalid_input` |
| `updateOrderAction` (cambia) | `FormData` sin `status`. Un `status` enviado se ignora | sin cambios | sin cambios (`invalid_transition` para finales) |
| `finishAssignedOrderAction` | sin cambios | sin cambios | sin cambios. Ahora además deja `finished_at` |

`pageSize` por encima de 25 se recorta en el adaptador (`toOffsetLimit`), como hoy.

## 8. Convivencia con QC-82

QC-82 (no implementada) envolverá `finishAssignedOrder` en `transaction.run` y pasará un cliente
transaccional al catálogo. Como la fecha va dentro del **mismo `UPDATE`** que el estado (§ 2.1), da
igual qué cliente ejecute ese `UPDATE`: estado y fecha caen juntos, y con QC-82 caen además junto a
la anotación «finalizar». Esta ficha no crea transacción ni la necesita, y QC-82 no tiene que
tocar la fecha. Si QC-82 cambiara `transitionAliveOrder` por una variante con cliente, la línea
`finishedAt` viaja con ella. Lo avisa el test de integración de R3, que finaliza por el caso de
uso real.

## 9. Alternativas descartadas

1. **Derivar la fecha de `updated_at` o del registro de ejecución de QC-82.** `updated_at` cambia
   con cualquier edición [D3]. El registro de QC-82 no existe todavía y su fila «¿Cuánto se
   conserva?» prevé **purgarlo** X días después de terminar el pedido. La fecha desaparecería justo
   de los pedidos más viejos.
2. **Un trigger que ponga `finished_at` al pasar a `ENTREGADO`.** Cubriría también un `UPDATE` por
   consola, pero sería el primer trigger del repo, algo que QC-34 descartó expresamente
   (`order-transitions.ts:15-20`). Con D8 el único camino de la aplicación ya es uno y el `CHECK`
   de § 1.2 impide la incoherencia inversa. Coste aceptado: un `UPDATE` manual a `ENTREGADO` deja
   el pedido «Sin fecha», que es lo mismo que pasa con los históricos.
3. **Un único caso de uso de listado con un parámetro `vista`.** Mezclaría tres permisos distintos
   en un solo `requirePermission` condicional y un esquema con claves que solo valen para una
   vista. Tres casos de uso con su permiso en la primera línea se prueban por separado y no pueden
   autorizar de más por un `if` mal puesto.
4. **Filtrar «Terminados» en `OrderRepository.listAlive` de `pedidos` y exponerlo por una acción
   de `pedidos`.** Obligaría a `pedidos` a conocer `terminados.consultar` y a componer
   responsables, que son de `asignaciones`. La pantalla es de `asignaciones`. `OrderCatalog` ya es
   la interfaz entre los dos.
5. **Rechazar con `invalid_input` una edición que trae `status`** en vez de ignorarlo. Rompería a
   cualquier cliente viejo en mitad del despliegue y no protege nada que no proteja ya el tipo
   `OrderEdit`. Ignorarlo es el criterio que ya usa el alta.

## 10. Trazabilidad `R<n>` → test

| R | Test |
|---|---|
| R1, R2, R4, R29 (esquema) | `tests/unit/pedidos/schema/orders-finished-at-migration.test.ts` (anulable, sin `DEFAULT`, sin `UPDATE`, `CHECK`, índice parcial, `down.sql` inverso) + `tests/integration/pedidos/order-finished-at.int.test.ts` («la base rechaza `finished_at` en un pedido no entregado», R4; «tras migrar, los entregados previos quedan sin fecha», R2) |
| R3 | `order-finished-at.int.test.ts` «Finalizar deja ENTREGADO y `finished_at = now` en la misma fila»; `tests/unit/pedidos/order-catalog.test.ts` «`transitionAliveOrder` a ENTREGADO incluye `finishedAt` en el mismo `updateMany`; a EN_CURSO no» |
| R5, R10 | `tests/unit/pedidos/qc145-estado-solo-planta.test.ts` (fuente: `finishedAt` solo aparece en `transitionAliveOrder`; `status` solo lo escriben el alta con `PENDIENTE`, `transitionAliveOrder` y `cancelAliveOrder`) + `order-finished-at.int.test.ts` «editar y cancelar no tocan `finished_at`» |
| R6 | `tests/unit/pedidos/update-order.test.ts` «la edición no cambia el estado aunque la entrada traiga `status`»; `order-input.test.ts` «`updateOrderSchema` descarta `status`»; `tests/integration/pedidos/order-crud.int.test.ts` «editar un EN_CURSO lo deja EN_CURSO» |
| R7 | `tests/unit/pedidos-ui/order-form.test.tsx` «la edición no pinta selector de estado ni envía `status`» + E2E (R28) |
| R8 | `update-order.test.ts` «editar ENTREGADO/CANCELADO → `invalid_transition` sin escribir» |
| R9 | `tests/unit/pedidos/cancel-order.test.ts` (existente, sin cambios) + `order-finished-at.int.test.ts` |
| R11-R15 | `tests/unit/asignaciones/assignment-views.test.ts` (matriz de permisos → vistas; sin rol en la firma; vista pedida no permitida → primera); `tests/unit/asignaciones-ui/asignacion-page.test.tsx` (pestañas por conjunto de permisos; sin pestañas con una sola vista; «Mis asignados» sin cambios) |
| R16 | `tests/unit/identity/permissions.test.ts` (existente: 16 y seed exacto; sigue en verde) |
| R17, R19 | `tests/unit/asignaciones/list-finished-orders.test.ts` + `tests/integration/asignaciones/finished-orders.int.test.ts` (solo ENTREGADO vivos de la empresa; no asignados al actor incluidos; otra empresa y borrados excluidos; vacío) |
| R18, R23 | `tests/unit/asignaciones/authorization.test.ts` (sin permiso → `unauthorized` sin tocar ningún puerto) |
| R20 | `finished-orders.int.test.ts` «recientes primero, sin fecha al final ordenados por número, estable entre páginas»; `order-catalog.test.ts` «`nulls: 'last'` explícito» |
| R21 | `tests/unit/asignaciones-ui/finished-orders-columns.test.tsx` (presentación / «Sin presentación», fecha / «Sin fecha», sin columna Entrar) |
| R22, R24 | `tests/unit/asignaciones/list-company-orders.test.ts` + `tests/integration/asignaciones/company-orders.int.test.ts` (cuatro estados, empresa, borrados, filtro, `['ENTREGADO']` → orden de terminados, mezcla → orden de trabajo) |
| R25 | `list-company-orders.test.ts` «incluye al actor entre los responsables; sin responsables → lista vacía»; `tests/unit/asignaciones-ui/company-orders-columns.test.tsx` |
| R26 | `finished-orders-columns.test.tsx` y `company-orders-columns.test.tsx` «ninguna columna de acción ni enlace a `/asignacion/<id>`» |
| R27 | `list-finished-orders.test.ts` y `list-company-orders.test.ts` (esquema estricto, `pageSize` 25); `*-list-section.test.tsx` (página fuera de rango → vacío con vuelta a la 1) |
| R28 | `e2e/pedidos-terminados.spec.ts` (Operador, Empacador, Administrador y edición sin estado) |
| R30 | `finished-orders.int.test.ts` «finalizar por el caso de uso real → aparece con fecha; un ENTREGADO sembrado sin fecha → Sin fecha» + E2E |
| R29 (dependencias) | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) |

## 11. Riesgos

1. **Colisión de archivos con QC-82** (`finish-assigned-order.ts`, `order-catalog-prisma.ts`). Esta
   ficha **no toca** `finish-assigned-order.ts`. En `order-catalog-prisma.ts` toca `data` de
   `transitionAliveOrder` y añade una función. Si QC-82 entra antes, el cambio de § 2.1 se
   rehace sobre su versión.
2. **Fixtures que construyen ediciones con `status`.** Dejan de compilar (`OrderEdit`) o pasan a
   ignorarlo. Se arreglan en la misma task que los rompe (T3).
3. **Tests que cuentan exportaciones o acciones** (`module-contract` de `pedidos` y
   `asignaciones`, `guard-qc87`, `session-once-per-request-actions`, `empacador-rol` R16). Se
   actualizan con su porqué, nunca ensanchando una puerta a carpeta.
