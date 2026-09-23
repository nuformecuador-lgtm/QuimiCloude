# QC-145 — pedidos-terminados-en-asignacion · design.md

> Cómo se construye `requirements.md`. Los requisitos se citan como `R<n>` y las decisiones
> cerradas como `[D<n>]`, en el orden de su tabla (D1-D16). **No hay dependencias nuevas ni tablas
> nuevas** (R29).
>
> **Vuelta 2 (2026-09-23).** El humano cerró las cinco preguntas de la vuelta 1 como D13-D16. Lo
> que antes era «propuesta» en el orden (D14), las columnas (D15) y el filtro (D16) pasa a ser
> diseño. D13 añade § 3.5, § 3.6, § 6.7 y R32-R35.
>
> **Vuelta 3 (2026-09-23).** Las dos preguntas de la vuelta 2 se cerraron como D17 (las asignaciones
> previas se dejan como están, R37) y D18 (el miembro de grupo con `pedidos.consultar` se omite en
> silencio, R36). No queda ninguna pregunta abierta ni ninguna propuesta pendiente.

## 0. Hallazgos sobre `dev` (medidos el 2026-09-23, con QC-144, QC-146 y QC-147 ya mergeadas)

| Dato | Dónde | Consecuencia |
|---|---|---|
| `/asignacion` exige `asignaciones.consultar` y pinta una sola lista | `app/(private)/asignacion/page.tsx` → `AssignedOrdersListSection` → `listAssignedOrdersAction` → `domain/list-assigned-orders.ts` | «Mis asignados» es esto mismo y **no cambia** (R11) |
| El esquema de la lista es estricto: solo `page`/`pageSize` | `list-assigned-orders.ts:34` | Las vistas nuevas tienen su propio caso de uso y su propio esquema |
| Orden de trabajo: `priority DESC, created_at ASC, order_year ASC, order_sequence ASC, id ASC` | `order-catalog-prisma.ts:119-125` | Es el «orden de la lista de trabajo» de R22 |
| A `ENTREGADO` se llega por **dos** caminos: `transitionAliveOrder` (Finalizar) y `updateAliveOrder` (edición, `status: data.status`) | `order-catalog-prisma.ts:145-163`, `order-prisma.ts:525-547` | D8 quita el segundo. `transitionAliveOrder` queda como **único** sitio que escribe `ENTREGADO` (R3, R10) |
| La edición valida con `assertTransition(row.status, data.status)` y el formulario tiene selector de estado | `update-order.ts:78`, `order-form.tsx:644-658`, `order-input.ts:110-113` | Se retira el estado de la entrada, del tipo, del adaptador y del formulario (R6, R7) |
| `ALLOWED` admite `X → X` en `PENDIENTE`/`EN_CURSO` y lista vacía en los finales | `order-transitions.ts:22-27` | «Quedarse igual» expresa «editable» sin tabla nueva (R8, § 2.3) |
| `orders` no tiene fecha de terminado; `updated_at` cambia con cualquier edición | `db/schema.prisma` modelo `Order` | Columna nueva (R1), nunca `updated_at` [D3] |
| Nulos al final explícitos: `{ qtyAlert: { sort: dir, nulls: 'last' } }` | `product-prisma.ts:157` (la semilla decía `:158`) | Mismo mecanismo en el orden de terminados (R20) |
| El permiso de terminados es `terminados.consultar`. Lo tienen el Administrador y el Empacador. El catálogo tiene 16 permisos | `identity/domain/permissions.ts:135-140, 161-182` | R12, R18. El catálogo no cambia (R16) |
| `tests/unit/identity/roles/empacador-rol.test.ts` (QC-144 R16) exige que ningún archivo de producción, salvo el catálogo, nombre `terminados.consultar` | `describe('R16 — …')` | Se **enmienda** abriendo dos archivos exactos (T6) |
| `tests/guards/guard-qc87-no-reimplementado.test.ts` enumera las acciones de `order-assignment-actions.ts` y comprueba que la lista es exacta | `ACCIONES`, línea 83 | Se añaden las tres acciones nuevas (T8) |
| **El selector de responsables** ofrece todo lo que devuelve `listUsersAction` (primeros 25 usuarios; exige `usuarios.consultar` y, sin él, se degrada a lista vacía). La fila de usuario solo trae `roleName`, no permisos | `order-list-section.tsx:173-194`, `identity/domain/user-view.ts:48,76` | Con ese catálogo no se puede filtrar por permiso sin mirar el nombre del rol, que D13 prohíbe. Hace falta otra fuente (§ 3.6) |
| **Asignar** comprueba existencia, empresa y cuenta activa (`PersonRef = { id, displayName, isActive }`). Nada mira permisos | `assign-responsibles.ts:98-120`, `identity/domain/people-directory.ts:33-37` | `PersonRef` gana los permisos del rol de la persona (§ 3.5) |
| **Asignar un grupo** crea una fila por cada `activeMemberIds` y omite en silencio a los inactivos | `assignment-directory-prisma.ts:161-182` | El miembro con `pedidos.consultar` se omite igual, en silencio, y el resto se asigna (R34, R36, D18) |
| **Ejecutar exige estar asignado**: `get-`, `start-` y `finish-assigned-order.ts` comprueban `listOrderIdsByUserInCompany(...).includes(orderId)` antes de leer el pedido y responden `order_not_found` si no está | `get-assigned-order-execution.ts:48-49`, `start-assigned-order.ts:41-42`, `finish-assigned-order.ts:45-46`; la ruta `/asignacion/[id]/page.tsx:29` solo exige `asignaciones.consultar` | **Verificado:** si no puede nacer ninguna asignación nueva de alguien con `pedidos.consultar`, la ejecución por dirección directa le queda cerrada **sin tocar la ruta** (R35). **Excepción:** las asignaciones que ya existan. Esa persona sigue asignada y puede ejecutar, consecuencia aceptada por D17 (R37) |
| `scripts/seed.ts` no crea asignaciones y ninguna restricción de `order_assignments` mira permisos | `scripts/`, migraciones de QC-86 | Pueden existir filas con un Administrador asignado desde la pantalla. No se sabe cuántas porque no hay acceso a la base. D17: se dejan como están, sin migración de datos |
| La presentación viaja en `AssignedOrderSummary.presentationId` y se pinta con `OrderPresentationLabel` («Sin presentación») | QC-146: `order-catalog.ts:92`, `components/shared/order-presentation-label.tsx` | Se reutiliza (R21, R25) |
| Fechas en tabla: `YYYY-MM-DD` en UTC con `toISOString().slice(0, 10)`, nunca `toLocale*` | `order-columns.tsx:115-123` | Mismo formato para la fecha de terminado |
| Pestañas: primitiva existente | `components/ui/tabs.tsx` | Sin componente ni librería nuevos |
| QC-82 (`spec_ready`) envolverá `finishAssignedOrder` en `transaction.run` | `specs/QC-82-…/design.md:178`, `requirements.md` R21, R24 | § 8: la fecha va en el **mismo `UPDATE`** del estado |

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

Anulable, **sin `DEFAULT`**, sin backfill y sin `UPDATE` (R2). `timestamptz(6)` como el resto de
marcas. `orders` ya tiene `company_id` y RLS forzada, y esta columna no cambia nada de eso.

### 1.2 Restricción (R4)

```sql
ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_at_requires_delivered"
  CHECK ("finished_at" IS NULL OR "status" = 'ENTREGADO');
```

Todas las filas la cumplen porque la columna nace nula. `ENTREGADO` es final y la base impide
borrarlo (QC-34). Es drift para `migrate dev`, como los demás `CHECK` de `orders`.

### 1.3 Índice parcial para «Terminados» (R20, D14)

```sql
CREATE INDEX "orders_company_finished_idx"
  ON "orders" ("company_id", "finished_at" DESC NULLS LAST, "order_year" DESC, "order_sequence" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'ENTREGADO';
```

Vive solo en la migración, como los índices de `list_query_indexes`. «Todos» con otros filtros usa
los índices existentes (`orders_company_id_order_year_order_sequence`, `orders_status_idx`).

### 1.4 Migración `db/migrations/20260923120000_orders_finished_at/`

- `migration.sql`: `ADD COLUMN "finished_at" TIMESTAMPTZ(6)`, el `CHECK` y el índice.
- `down.sql`: `DROP INDEX`, `DROP CONSTRAINT` y `DROP COLUMN`, en orden inverso.
- Ciclo `db:migrate → db:rollback → db:migrate` contra **`QuimiCloude_QC145`**, nunca contra la
  base de `.env` (T1).

**D13 no toca el esquema.** Permisos y roles viven en tablas de `identity` y el rol de un usuario
puede cambiar. Un `CHECK` no puede leer otra tabla, y un trigger sería el primero del repo (§ 9, alt. 6).

## 2. Módulo `pedidos`

### 2.1 Finalizar escribe la fecha (R3, R5, R10)

`transitionAliveOrder` (`order-catalog-prisma.ts`) añade `finishedAt: now` al `data` del mismo
`updateMany` **solo cuando `to === 'ENTREGADO'`**. Va en la misma sentencia que el estado, así que es
atómico sin transacción. `now` es el reloj que ya inyecta `finishAssignedOrder`. La firma de
`OrderCatalog.transitionAliveById` no cambia. Ninguna otra escritura (`create`, `updateAliveOrder`,
`cancelAliveOrder`, `softDeleteAliveOrder`) nombra `finishedAt` (R5). Lo fija un test de fuente (§ 10).

### 2.2 `OrderCatalog.listAliveSummariesInCompany` (R17, R20, R22, R24, R27)

```ts
export type OrderSummaryOrdering = 'work_queue' | 'finished_recent_first';

export type AssignedOrderSummary = {
  // ...los campos de hoy...
  readonly finishedAt: Date | null;
};

listAliveSummariesInCompany(
  companyId: string,
  statuses: readonly OrderStatus[],
  ordering: OrderSummaryOrdering,
  page: number,
  pageSize?: number,
): Promise<Page<AssignedOrderSummary>>;
```

- `where`: ámbito de empresa + `status in statuses` + `deletedAt: null`, **sin filtro de ids**.
- `work_queue`: el `orderBy` de hoy, extraído a una constante compartida con
  `listAliveOrderSummariesByIds` para que no diverjan.
- `finished_recent_first`: `[{ finishedAt: { sort: 'desc', nulls: 'last' } }, { orderYear: 'desc' },
  { orderSequence: 'desc' }, { id: 'asc' }]`. Los nulos van al final, explícito (R20). Los «sin
  fecha», por número descendente (D14).
- `count` + `findMany` en `Promise.all`, con `buildPage`/`toOffsetLimit` (10 / 25, R27).
- `toAssignedOrderSummary` mapea `finishedAt`. `listAliveOrderSummariesByIds` lo añade a su `select`.

Va en `OrderCatalog` y no en `OrderRepository` porque `asignaciones` no puede tocar el puerto
interno de `pedidos` (`docs/architecture.md > Dominio` n.º 2).

### 2.3 La edición deja de mover el estado (R6, R7, R8, R9)

| Pieza | Cambio |
|---|---|
| `order-input.ts` | `updateOrderSchema = createOrderSchema`, sin `status`. `z.object` descarta un `status` que llegue (R6), el mismo criterio que el alta. `UpdateOrderInput` pierde `status` |
| `order-view.ts` | `OrderEdit = Omit<NewOrder, 'status'>`. `NewOrder` conserva `status` para el alta |
| `ports/order-repository.ts` | `updateAlive(id, data: OrderEdit, …)` |
| `update-order.ts` | `assertTransition(row.status, row.status)`: «quedarse igual» es legal si y solo si el pedido no es final. Da el mismo `invalid_transition` de hoy (R8) |
| `order-prisma.ts` `updateAliveOrder` | Sin `status` en `data` |
| `order-actions.ts` `buildUpdateCandidate` | No lee `status` |
| `order-transitions.ts` | Sin cambios |
| `index.ts` | Exporta `OrderEdit` y `OrderSummaryOrdering`. `EDITABLE_STATUS_VALUES`, `EditableOrderStatus` e `isAllowedTransition` se quedan |

Cancelar no se toca (R9). **Riesgo que se cierra de paso:** una edición concurrente con un Finalizar
ya no puede devolver un `ENTREGADO` a `EN_CURSO`. La edición de otros campos de un pedido entregado
entre la lectura y la escritura sigue siendo posible. No se cierra aquí (`update-order.ts:67-70`).

## 3. Módulo `asignaciones`

### 3.1 Vistas por permiso (R11-R15)

`domain/assignment-views.ts`:

```ts
export type AssignmentViewKind = 'asignados' | 'terminados' | 'todos';
export function resolveAssignmentViews(bearer: PermissionBearer | null | undefined): readonly AssignmentViewKind[];
export function resolveAssignmentView(requested: string | undefined, allowed: readonly AssignmentViewKind[]): AssignmentViewKind;
```

- Con `pedidos.consultar` devuelve `['todos']`. Si no, `['asignados']`, más `'terminados'` si tiene
  `terminados.consultar`.
- La pertenencia se comprueba con `assertPermission` en `try/catch`, el mismo patrón que
  `canModifyAssignments`. Nunca por el rol (R14).
- `resolveAssignmentView`: devuelve la vista pedida si está permitida y, si no, la primera (R15).
- Se publican en el barrel para que `app/**` no escriba códigos de permiso.

### 3.2 `domain/list-finished-orders.ts` (R17-R21, R27)

Dependencias: `assignments`, `orders`, `recipes`, `people`, `presentations` y `now?`.

1. `requirePermission(actor, 'terminados.consultar')`, primera línea (R18).
2. `z.strictObject({ page, pageSize })`.
3. `orders.listAliveSummariesInCompany(actor.companyId, ['ENTREGADO'], 'finished_recent_first', …)`.
4. Una llamada por página para recetas, presentaciones y responsables
   (`listByOrdersInCompany` + `findRefsIncludingDeletedInCompany`, ordenados con `compareResponsibles`,
   **sin excluir al actor**). Es el patrón de `list-assigned-orders.ts:95-143`, extraído a un helper
   común del dominio (`compose-order-rows.ts`) que usan también § 3.3 y, sin cambiar su salida,
   «Mis asignados».

```ts
export type FinishedOrderView = {
  readonly id: string; readonly numberText: string; readonly recipeName: string | null;
  readonly quantity: string; readonly presentationName: string | null;
  readonly finishedAt: Date | null; readonly responsibles: readonly OrderResponsible[];
};
```

### 3.3 `domain/list-company-orders.ts` (R22-R25, R27, R31)

1. `requirePermission(actor, 'pedidos.consultar')`, primera línea (R23).
2. `z.strictObject({ page, pageSize, statuses: z.array(z.enum(ORDER_STATUS_VALUES)).min(1).optional() })`.
   Si falta `statuses`, se usan los cuatro estados.
3. Si `statuses`, deduplicado, es exactamente `['ENTREGADO']`, el orden es `finished_recent_first`.
   Con cualquier otra combinación, `work_queue` (D16).
4. Composición con el helper de § 3.2.

```ts
export type CompanyOrderView = {
  readonly id: string; readonly numberText: string; readonly recipeName: string | null;
  readonly quantity: string; readonly presentationName: string | null;
  readonly priority: OrderPriority; readonly status: OrderStatus;
  readonly responsibles: readonly OrderResponsible[];
  /** Siempre viaja; la columna solo se pinta con el filtro exactamente ENTREGADO (R31). */
  readonly finishedAt: Date | null;
};
```

### 3.4 Barrel y guardias

- `index.ts` publica `resolveAssignmentViews`, `resolveAssignmentView`, `AssignmentViewKind`,
  `canBeResponsible` (§ 3.5), las tres factories nuevas con sus `*Deps` y los tipos de vista.
  Las Server Actions no se publican.
- **Enmienda** de `tests/unit/identity/roles/empacador-rol.test.ts` (QC-144 R16): la puerta se abre
  solo a `list-finished-orders.ts` y `assignment-views.ts`, por archivo exacto.
- La regla (e) de `tests/unit/asignaciones/module-contract.test.ts` permite `asignaciones.modificar`
  en `domain/**`, así que el caso de uso de § 3.6 cabe. `asignaciones.consultar` no se nombra en
  ningún archivo nuevo.

### 3.5 Quién puede ser responsable (D13; R33, R34)

**Identity.** `PersonRef` gana `readonly permissions: readonly PermissionCode[]`: los códigos del rol
de la persona, leídos en la misma consulta de `findAliveRefsInCompany` /
`findRefsIncludingDeletedInCompany` (`role → rolePermissions → permission.code` en el `select`).
Los consumidores actuales (`list-*-responsibles`, `list-batch-movements` de `inventario`) ignoran
el campo nuevo. El tipo se amplía y ningún campo existente cambia.

**Asignaciones.** Predicado nuevo en `domain/responsible-eligibility.ts`:

```ts
/** Una persona con `pedidos.consultar` no puede ser responsable de un pedido. Nunca lanza. */
export function canBeResponsible(person: PermissionBearer): boolean;
```

Resuelve la pertenencia con `assertPermission` en `try/catch`, igual que `canModifyAssignments`, y
no mira nunca el rol. Es la **única** definición de la regla. La usan § 3.5 y § 3.6.

**`assign-responsibles.ts`**:

- **Paso 4 (personas sueltas):** después de `isActive`, `if (!canBeResponsible(person)) throw new
  UserCannotBeResponsibleError()`. La operación se rechaza **entera**, sin escribir (R33). El orden
  de rechazos queda así: no existe → cuenta inactiva → no elegible.
- **Paso 5 (grupos), D18:** tras resolver los snapshots, se hace **una** llamada
  `people.findAliveRefsInCompany(companyId, unión de activeMemberIds, now)` y se quitan del grupo los
  miembros no elegibles antes de componer. Se les **omite en silencio**, igual que a los inactivos:
  la operación no se rechaza y el resto del grupo se asigna (R34, R36). Si después de omitirlos no
  queda nadie que asignar, el comportamiento es exactamente el de hoy para un grupo sin miembros
  activos, sea cual sea. No se añade ninguna rama ni error nuevo.
- `UserCannotBeResponsibleError`, con `code` estable `user_cannot_be_responsible`, se da de alta en
  el catálogo de `lib/modules/errores` (`error-codes.ts`, `error-catalog.ts`) con el mensaje «Esta
  persona no puede ser responsable de un pedido.». No se reutiliza `user_not_assignable`, cuyo
  mensaje habla de la cuenta inactiva y sería falso aquí.

**Qué NO cambia (D17, R37).** No hay migración de datos: las asignaciones previas de personas con
`pedidos.consultar` se quedan como están, se siguen leyendo y pintando como responsables, y se
pueden quitar a mano con «quitar responsable» o «quitar grupo», que no cambian. La lectura de
responsables no filtra a nadie. **Los casos de uso de ejecución (`get-`, `start-`,
`finish-assigned-order.ts`) y sus rutas no se tocan**, así que no se pisa nada de QC-63 ni de QC-82.

**Por qué esto cierra la ejecución por dirección (R35).** Los tres casos de uso de ejecución
responden `order_not_found` a quien no está en `order_assignments` para ese pedido (§ 0). Si § 3.5
impide que nazcan filas nuevas para quien tiene `pedidos.consultar`, esa persona nunca llega a estar
asignada y la ruta `/asignacion/<id>` le responde como a cualquier no asignado. **No se cierra**
para las filas que ya existan antes de esta ficha, ni para una persona cuyo rol gane
`pedidos.consultar` después de asignarla (hoy los permisos solo cambian por migración). Es la
consecuencia que D17 acepta: esas personas pueden seguir ejecutando por URL los pedidos que ya
tenían asignados, hasta que se terminen o se cancelen (R37). R35 se prueba con los casos de uso
reales para un Administrador no asignado, y R37 con uno asignado **antes** mediante una fila
sembrada directamente en la base.

### 3.6 El selector: `domain/list-responsible-candidates.ts` (R32)

```ts
createListResponsibleCandidates(deps: { people: PeopleDirectory; now? })
  : (actor, input: unknown) => Promise<readonly ResponsibleCandidate[]>   // { id, displayName }
```

1. `requirePermission(actor, 'asignaciones.modificar')`: es para escribir, y es la misma condición
   con la que hoy se monta el panel.
2. `z.strictObject({})`.
3. `people.listAliveInCompany(actor.companyId, now, MAX_CANDIDATES)`. Es un **método nuevo** de
   `PeopleDirectory` que devuelve `PersonRef` (con permisos) de las personas vivas de la empresa,
   ordenadas por `last_names, first_names, id` y con el tope de 25 que hoy tiene el selector.
4. Se queda con las que cumplen `canBeResponsible` y devuelve `{ id, displayName }`. No se filtra
   por cuenta activa: hoy el selector tampoco lo hace, y el service ya rechaza a las inactivas
   (`user_not_assignable`).

**Cambio de comportamiento que se declara.** Hoy la lista de personas sale de `listUsersAction`,
que exige `usuarios.consultar`, y sin ese permiso se degrada a vacía (QC-102). Con este caso de uso
la lista depende solo de `asignaciones.modificar`, el permiso que ya decide si hay panel. Los
grupos siguen saliendo de `listWorkGroupsAction`, sin cambios. Si el humano prefiere conservar la
degradación, la alternativa es quedarse con la intersección de `listUsersAction` y este caso de
uso: cuesta una llamada más y no cambia ningún requisito.

## 4. Adaptadores driving (Server Actions)

En `order-assignment-actions.ts`, con el cuerpo de `listAssignedOrdersAction` (`currentActor()` +
`try` + `toErrorState`):

- `listFinishedOrdersAction(query)`
- `listCompanyOrdersAction(query)`
- `listResponsibleCandidatesAction()`

La traducción de `user_cannot_be_responsible` en `assignResponsiblesAction` sale sola por `code`
(`createErrorStateTranslator`). Las tres acciones nuevas se añaden a `ACCIONES` de
`guard-qc87-no-reimplementado.test.ts` y, si su lista lo exige, a
`session-once-per-request-actions.test.ts`.

## 5. Composición

`lib/composition/index.ts` cablea las tres factories nuevas con el `orderCatalog`, `recipeCatalog`,
`presentationCatalog`, `assignmentDirectoryPrisma` y el repositorio de asignaciones que ya existen.
`orderCatalog` gana `listAliveSummariesInCompany`. `assignmentDirectoryPrisma` gana
`listAliveInCompany`.

## 6. UI

### 6.1 `app/(private)/asignacion/page.tsx`

`requirePagePermission('asignaciones.consultar')` no cambia. Después:
`resolveAssignmentViews(await identity.getSessionUser())`, que es la misma lectura de sesión de la
petición (QC-104). Luego `resolveAssignmentView(searchParams.vista, views)`. Con más de una vista,
`AssignmentViewTabs` (pestañas-enlace `?vista=…`). Por último, la sección de la vista activa en su
`<Suspense>`. Operador y Administrador tienen una sola vista y no ven pestañas.

### 6.2 Parámetros (`components/assignment-view-params.ts`)

- `vista`: si no es válida o no está permitida, se aplica R15.
- `page` y `pageSize`: parseo tolerante. Cada href conserva `vista`.
- «Todos»: `status` separado por comas, el formato de `/pedidos`. Los valores fuera de
  `ORDER_STATUS_VALUES` se descartan. Las constantes se duplican en la ruta.

### 6.3 «Terminados» (`finished-orders-*`) — D15

Columnas: Nº · Receta · Cantidad (`formatDecimalDisplay`) · Presentación (`OrderPresentationLabel`) ·
Fecha de terminado (`YYYY-MM-DD` UTC o «Sin fecha» con `data-missing`) · Responsables
(`ResponsibleAvatars` sin `onShowAll`). **Sin columna «Entrar» ni acciones** (R26).

### 6.4 «Todos» (`company-orders-*`) — D15, D16

Columnas: Nº · Receta · Cantidad · Presentación · Prioridad · **Estado**, con filtro `select` de los
cuatro estados (R24) · **Responsables**. Con el filtro exactamente `['ENTREGADO']` se añade
**Fecha de terminado** (R31). La lista de columnas se construye en el servidor a partir de los
parámetros ya parseados y baja por props. Sin «Entrar» ni acciones (R26).

### 6.5 Pedidos: formulario sin estado (R7)

`order-form.tsx` quita el selector de estado y el envío de `status`. `invalid_transition` pasa a
mostrarse como error general del formulario.

### 6.6 Multiplataforma

Las pestañas usan `components/ui/tabs.tsx` como lista de enlaces, con al menos 44 × 44 px y sin
`:hover` como única vía. Tabla y filtro son los de `DataTable`. Sin excepciones de escritorio.

### 6.7 Pedidos: selector de responsables (R32)

`order-list-section.tsx`, `loadResponsiblesCatalog`: `people` sale de
`listResponsibleCandidatesAction()` en vez de `listUsersAction(...)`. `order-responsibles.tsx` no
cambia: sigue filtrando por texto sobre lo que le llega por props.

## 7. Contratos de entrada y salida

| Acción | Entrada | Salida | Errores |
|---|---|---|---|
| `listFinishedOrdersAction` | `{ page?, pageSize? }` estricto | `Page<FinishedOrderView>` | `unauthorized`, `invalid_input` |
| `listCompanyOrdersAction` | `{ page?, pageSize?, statuses?: OrderStatus[] (≥ 1) }` estricto | `Page<CompanyOrderView>` | `unauthorized`, `invalid_input` |
| `listResponsibleCandidatesAction` | ninguna | `readonly { id, displayName }[]` (≤ 25) | `unauthorized` |
| `assignResponsiblesAction` (cambia) | sin cambios | sin cambios | **+ `user_cannot_be_responsible`** |
| `updateOrderAction` (cambia) | `FormData` sin `status`; si llega, se ignora | sin cambios | `invalid_transition` para pedidos finales |
| `finishAssignedOrderAction` | sin cambios | sin cambios | sin cambios; además deja `finished_at` |

## 8. Convivencia con QC-82

La fecha va en el mismo `UPDATE` que el estado (§ 2.1), sea cual sea el cliente que lo ejecute. Con
QC-82 caen juntos estado, fecha y la anotación «finalizar». Esta ficha no crea transacción ni toca
`finish-assigned-order.ts`. D13 no toca los casos de uso de ejecución, así que no pisa nada de QC-82.

## 9. Alternativas descartadas

1. **Derivar la fecha de `updated_at` o del registro de QC-82.** `updated_at` cambia con cualquier
   edición [D3]. El registro de QC-82 no existe todavía y está previsto purgarlo.
2. **Un trigger para `finished_at`.** Sería el primer trigger del repo, algo que QC-34 descartó
   (`order-transitions.ts:15-20`). Con D8 hay un solo camino y el `CHECK` cubre la incoherencia
   inversa.
3. **Un único caso de uso de listado con parámetro `vista`.** Mezclaría tres permisos en un
   `requirePermission` condicional.
4. **Filtrar «Terminados» desde `pedidos`.** Obligaría a `pedidos` a conocer `terminados.consultar`
   y los responsables.
5. **Rechazar la edición que trae `status`.** Rompería clientes viejos durante el despliegue.
   Ignorarlo es el criterio del alta.
6. **D13 en la base** (trigger o `CHECK` sobre `order_assignments`). El permiso se deriva de otras
   tablas (`users → roles → role_permissions`), así que haría falta un trigger, el primero del
   repo, y además rechazaría al cambiar un rol con asignaciones vivas. La autorización vive en el
   service (`docs/architecture.md > Acceso a datos y autorizacion`).
7. **Filtrar el selector por `roleName === 'Administrador'`** con el `listUsersAction` de hoy.
   Prohibido por D13 y por QC-86/87: por permiso, nunca por nombre de rol.
8. **Cerrar además la ruta `/asignacion/<id>` o los casos de uso de ejecución a quien tiene
   `pedidos.consultar`, o borrar sus asignaciones previas con una migración de datos.** D13 dice
   «sin tocar la ruta», y D17 decide dejar las asignaciones previas como están y no tocar QC-63 ni
   QC-82.
9. **Rechazar la asignación de un grupo entero si contiene a alguien con `pedidos.consultar`**
   (opción (b) de la vuelta 2). Descartada por D18, que prefiere omitirlo como a un inactivo.

## 10. Trazabilidad `R<n>` → test

| R | Test |
|---|---|
| R1, R2, R4, R29 (esquema) | `tests/unit/pedidos/schema/orders-finished-at-migration.test.ts`; `tests/integration/pedidos/order-finished-at.int.test.ts` (R4 `CHECK`; R2 entregados previos `NULL`) |
| R3 | `order-finished-at.int.test.ts` «Finalizar deja ENTREGADO y `finished_at = now`»; `tests/unit/pedidos/order-catalog.test.ts` «a ENTREGADO lleva `finishedAt`; a EN_CURSO no» |
| R5, R10 | `tests/unit/pedidos/qc145-estado-solo-planta.test.ts` (fuente); `order-finished-at.int.test.ts` «editar y cancelar no tocan `finished_at`» |
| R6 | `tests/unit/pedidos/update-order.test.ts`, `order-input.test.ts`; `tests/integration/pedidos/order-crud.int.test.ts` |
| R7 | `tests/unit/pedidos-ui/order-form.test.tsx`; E2E |
| R8 | `update-order.test.ts` «ENTREGADO/CANCELADO → `invalid_transition` sin escribir» |
| R9 | `tests/unit/pedidos/cancel-order.test.ts` (existente); `order-finished-at.int.test.ts` |
| R11-R15 | `tests/unit/asignaciones/assignment-views.test.ts`; `tests/unit/asignaciones-ui/asignacion-page.test.tsx` |
| R16 | `tests/unit/identity/permissions.test.ts` (existente) |
| R17, R19 | `tests/unit/asignaciones/list-finished-orders.test.ts`; `tests/integration/asignaciones/finished-orders.int.test.ts` |
| R18, R23 | `tests/unit/asignaciones/authorization.test.ts` |
| R20 | `finished-orders.int.test.ts` «recientes primero; sin fecha al final por número descendente; estable entre páginas»; `order-catalog.test.ts` «`nulls: 'last'` explícito» |
| R21 | `tests/unit/asignaciones-ui/finished-orders-columns.test.tsx`; `list-finished-orders.test.ts` (responsables con el actor incluido) |
| R22, R24 | `tests/unit/asignaciones/list-company-orders.test.ts`; `tests/integration/asignaciones/company-orders.int.test.ts` («exactamente ENTREGADO → orden de terminados; ENTREGADO+otro → orden de trabajo») |
| R25, R31 | `tests/unit/asignaciones-ui/company-orders-columns.test.tsx` (columnas; la fecha solo aparece con el filtro exactamente ENTREGADO) |
| R26 | `finished-orders-columns.test.tsx`, `company-orders-columns.test.tsx` «sin acción ni enlace a `/asignacion/<id>`» |
| R27 | `list-finished-orders.test.ts`, `list-company-orders.test.ts`; `*-list-section.test.tsx` |
| R28 | `e2e/pedidos-terminados.spec.ts` |
| R30 | `finished-orders.int.test.ts` «finalizar por el caso de uso real → aparece con fecha»; E2E |
| R32 | `tests/unit/asignaciones/list-responsible-candidates.test.ts` (excluye a quien tiene `pedidos.consultar`; firma sin rol; `asignaciones.modificar` exigido); `tests/unit/pedidos-ui/order-list-section.test.tsx` (el catálogo sale de la acción nueva); `tests/integration/identity/assignment-directory.int.test.ts` o equivalente (`listAliveInCompany` con permisos y ámbito de empresa); E2E |
| R33 | `tests/unit/asignaciones/assign-responsibles.test.ts` «persona suelta con `pedidos.consultar` → `user_cannot_be_responsible`, ninguna escritura»; `tests/integration/asignaciones/responsible-eligibility.int.test.ts` (llamada directa al caso de uso, sin formulario) |
| R34, R36 | `assign-responsibles.test.ts` y `responsible-eligibility.int.test.ts` «asignar un grupo con un Administrador y un Operador → la operación no falla, el Operador queda asignado y el Administrador sin fila» |
| R37 | `responsible-eligibility.int.test.ts` «un Administrador con una asignación sembrada antes (fila directa en `order_assignments`) sigue pudiendo abrir, arrancar y finalizar ese pedido; la migración de esta ficha no toca `order_assignments`»; `orders-finished-at-migration.test.ts` «el SQL no nombra `order_assignments`» |
| R35 | `tests/integration/asignaciones/responsible-eligibility.int.test.ts` «Administrador no asignado: get/start/finish → `order_not_found`, sin escribir» (casos de uso reales); E2E (`/asignacion/<id>` como Administrador → 404/aviso de no encontrado) |
| R29 (dependencias) | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) |

## 11. Riesgos

1. **Asignaciones previas de personas con `pedidos.consultar`** (D17, aceptado). Siguen vivas, se
   pueden seguir ejecutando por dirección hasta que el pedido se termine o se cancele, y siguen
   pintándose como responsables. Esta ficha no las toca.
2. **Colisión con QC-82** en `order-catalog-prisma.ts` (solo el `data` de `transitionAliveOrder`).
   `finish-assigned-order.ts` no se toca.
3. **`PersonRef` amplía su forma.** Los dobles de `PeopleDirectory` en `tests/unit/**` (asignaciones
   e inventario) ganan `permissions` y `listAliveInCompany`. Se arreglan en la task que los rompe (T6).
4. **Tests que cuentan exportaciones, acciones o códigos de error** (`module-contract` de `pedidos`
   y `asignaciones`, `guard-qc87`, `session-once-per-request-actions`, `empacador-rol` R16, el test
   del catálogo de `errores`). Se actualizan con su porqué, sin ensanchar puertas a carpeta.
5. **Degradación del selector** (§ 3.6): deja de depender de `usuarios.consultar`. Se declara aquí
   para que el humano lo vea al aprobar.
