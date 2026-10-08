# QC-217 — pestana-por-acondicionar · design.md

> Las rutas y líneas citadas son las de este worktree (rama sobre `dev` con QC-215 y QC-216
> mergeadas). El implementer las vuelve a localizar contra `dev` en F2.3.
>
> Revisado el 2026-10-08 con las respuestas del humano: D9 (solo `TERMINADO`), D10 (columnas del
> Empacador), D11 («Envases» = reparto por línea) y D12 (§10 aprobado).

## Lo que ya existe

**Buscado:** en el board (`feature_list.json`, nombre y descripción), «acondicion», «Por empacar» y
«Terminados»; en `specs/`, `por_acondicionar`, «Por acondicionar» y `conditionedBy`; en el código
(Grep), `conditioning`, `conditionedBy`, `por_acondicionar`, `resolveAssignmentViews`,
`listPackingOrders`, `listFinishedOrders`. El MCP del grafo no se consultó en esta tanda: la
búsqueda de código es por Grep/Read.

**Qué apareció y qué se reutiliza.** Nada resuelve la ficha entera, así que no hay bloqueo. Lo que
hay se reutiliza o se calca:

| Ref | Qué es | Uso aquí |
|---|---|---|
| QC-215-216-217-218-219 (board) | las cinco fichas del acondicionamiento | hermanas, no duplicadas. QC-217 es la única con pestaña y detalle |
| QC-168 «Por empacar»: `list-packing-orders.ts`, `get-packing-order.ts`, `/asignacion/empaque/[id]` | lista sin asignación y detalle por permiso de escritura | **se calca** la forma: caso de uso de lista y de detalle, `OrderNotFoundError` → 404, página con `requirePagePermission`. No se reutiliza la vista: autoriza por `empaque.modificar`, filtra otros estados y su «Envases» es un total, no el reparto (D11) |
| QC-201 / QC-215 R31 «Terminados»: `list-finished-orders.ts`, `FinishedOrderView`, `finished-orders-columns.tsx`, orden `finished_recent_first` | lista de lo que terminó el actor | **se reutilizan** el tipo de fila `FinishedOrderView`, las seis columnas (D10) y el orden. El caso de uso y la tabla del Empacador no se tocan (R13) |
| QC-145 «Todos»: `COMPANY_ORDER_STATUS_LABELS` (`company-orders-columns.tsx`) | etiquetas de estado, ya con «Por acondicionar» y «En acondicionamiento» (QC-215 R28) | **se reutilizan** |
| QC-55 tabla compartida: `components/shared/data-table` | `<DataTable>` paginada por URL | **se reutiliza** (D2) con el patrón de `finished-orders-table.tsx` |
| `components/shared/order-distribution-label.tsx` | reparto en forma corta: primera línea y «+N» | **no sirve** para «Envases» (D11 pide todas las líneas). Se reutiliza tal cual en «Presentación» de «Terminados» (D10) |
| QC-215: `orders.conditioned_by`, índice `orders_conditioned_by_idx` | la columna y su índice | **se lee** la columna |
| QC-216: `acondicionamiento.modificar`, `ROLE_ACONDICIONAMIENTO` | permiso y rol | **se consume** el permiso. El E2E crea usuarios con el rol real del seed |
| `assignment-views.ts` | qué pestañas ve cada uno | **se amplía** con dos vistas |
| `composeOrderRows`, `PeopleDirectory.findRefsIncludingDeletedInCompany` | receta, reparto, unidad, responsables y nombres | **se reutilizan** |

---

## 1. Modelo de datos

**Sin cambios** (R24). Lo que hace falta lo dejó QC-215: `orders.conditioned_by` (FK a `users` de
la misma empresa, con sus `CHECK` por estado), `orders_conditioned_by_idx` y `finished_at`. No hay
migración ni `down.sql`, y la RLS no cambia: `orders` ya la tiene activada y forzada.

**Índices de las consultas nuevas.**

- «Por acondicionar» filtra por `company_id`, `status IN (2)` y `deleted_at IS NULL`, como «Por
  empacar».
- «Terminados del acondicionador» filtra además por `conditioned_by = $actor` y
  `status = 'TERMINADO'`. Usa `orders_conditioned_by_idx`.

## 2. `pedidos`: el resumen publica quién acondiciona

**Lo que ya está en el resumen** (`AssignedOrderSummary` de `listAliveSummariesInCompany` y
`listAliveSummariesByIds`):

- **el reparto**: `presentationLines`, con `presentationId`, `packages` y `packagingName`, en orden
  de alta. `composeOrderRows` lo convierte en `OrderDistributionLineView[]`, con `presentationName`;
- `finishedAt`, receta, cantidad y unidad.

Para D11 **no hay que añadir nada**: la columna «Envases» se pinta con `presentationLines`.

**Lo que falta** es saber quién acondiciona, y filtrar por esa persona:

1. **`AssignedOrderSummary.conditionedBy: string | null`**
   (`lib/modules/pedidos/domain/order-catalog.ts`). Va junto a `packedBy` y con la misma semántica:
   el id va en crudo y el nombre lo resuelve quien consulta. Viaja en `OrderSummaryRecord` (deriva
   del tipo) y en `SUMMARY_SELECT` / `toOrderSummaryRecord` de `order-catalog-prisma.ts`.
2. **`filter.conditionedBy?: string`** en `listAliveSummariesInCompany`, en el puerto
   `OrderSummaryReader.listAliveInCompany` y en `listAliveOrderSummariesInCompany`. Sigue el mismo
   patrón que `packedBy`: entra en el `where` y por tanto en `count` y en `findMany` (R11).

**Efecto en tests existentes.** El campo es obligatorio. Los fakes que construyen
`AssignedOrderSummary` a mano ganan `conditionedBy: null`, sin cambiar ninguna aserción
(`tasks.md > T1`).

## 3. `asignaciones`: tres casos de uso y las vistas

### 3.1 Vistas (`domain/assignment-views.ts`)

```ts
export type AssignmentViewKind =
  | 'asignados' | 'terminados' | 'todos' | 'por_empacar'
  | 'por_acondicionar' | 'acondicionados';
```

`resolveAssignmentViews` añade `por_acondicionar` y `acondicionados` **al final** y en ese orden,
cuando el portador tiene `acondicionamiento.modificar`. Lo comprueba con su `hasPermission`. Para el
rol de semilla salen exactamente esas dos y no se aplica la reserva `['asignados']` (R2). Para
Administrador, Operador y Empacador no cambia nada (R3). `resolveAssignmentView` ya hace caer una
vista no permitida en la primera permitida (R4).

Un usuario con `terminados.consultar` y además el permiso vería dos pestañas «Terminados». Ningún
rol de semilla combina los dos, y los permisos de un rol solo cambian por migración y seed (QC-216
R7), así que no se añade una regla.

### 3.2 Filas

**«Por acondicionar» y el detalle comparten una fila nueva** (`domain/conditioning-order-view.ts`):

```ts
export type ConditioningOrderRow = {
  id: string; numberText: string; recipeName: string | null;
  quantity: string; unitId: string | null; unitLabel: string | null;
  presentationLines: readonly OrderDistributionLineView[];   // el reparto, columna «Envases»
  status: OrderStatus;
  conditionedByName: string | null; conditionedById: string | null;
};
export function composeConditioningOrderRows(
  deps: ComposeOrderRowsDeps, companyId: string, orders: readonly AssignedOrderSummary[],
): Promise<readonly ConditioningOrderRow[]>;
```

La composición va en dos pasos:

1. `composeOrderRows` para receta, reparto y unidad;
2. `people.findRefsIncludingDeletedInCompany` con los `conditionedBy` distintos, para el nombre
   aunque la persona esté dada de baja (R7).

No usa `products`: con D11 el total de envases no se pinta. Una sola composición sirve a la lista y
al detalle (R15, «los mismos valores»).

**«Terminados» del acondicionador reutiliza `FinishedOrderView`**, la fila del Empacador (D10). La
compone con el mismo mapeo que `list-finished-orders.ts`: `composeOrderRows`, responsables incluidos.

### 3.3 Casos de uso (nuevos, `domain/`)

Los tres:

- abren con `requirePermission(actor, 'acondicionamiento.modificar')`, antes de `zod` y antes de
  cualquier puerto (R19);
- validan con `z.strictObject` (R20).

| Archivo | Entrada | Consulta | Salida |
|---|---|---|---|
| `list-conditioning-orders.ts` | `{ page, pageSize? }` | `listAliveSummariesInCompany(companyId, ['POR_ACONDICIONAR','EN_ACONDICIONAMIENTO'], 'work_queue', page, pageSize)` | `Page<ConditioningOrderRow>` (R6) |
| `list-conditioned-orders.ts` | `{ page, pageSize? }` | `listAliveSummariesInCompany(companyId, ['TERMINADO'], 'finished_recent_first', page, pageSize, { conditionedBy: actor.id })` | `Page<FinishedOrderView>` (R11) |
| `get-conditioning-order.ts` | `{ orderId: uuid }` | `listAliveSummariesByIds(companyId, [orderId], ['POR_ACONDICIONAR','EN_ACONDICIONAMIENTO','TERMINADO'], 1, 1)` y la regla de abajo | `ConditioningOrderRow` (R15) u `OrderNotFoundError` (R17) |

- **Regla del detalle (R17):** si el estado es `TERMINADO` y `summary.conditionedBy !== actor.id`,
  lanza `OrderNotFoundError`, el mismo error que con un pedido inexistente. Un `ENTREGADO` ni
  siquiera sale de la consulta (D9). No hay error nuevo.
- **Barrel** (`lib/modules/asignaciones/index.ts`): los tres `create*`, `ConditioningOrderRow` y
  `composeConditioningOrderRows` si hace falta para tests.
- **Composición** (`lib/composition/index.ts`): tres claves nuevas al final de la fachada
  `asignaciones`. Usan los mismos `orderCatalog`, `orderAssignmentRepository`, `recipeCatalog`,
  `peopleDirectory`, `presentationCatalog` y `unitCatalog` que `listFinishedOrders`, sin adaptador
  nuevo.

## 4. Rutas y pantallas

### 4.1 `/asignacion` (`app/(private)/asignacion/page.tsx`)

- El permiso de página sigue siendo `asignaciones.consultar`, que el rol ya tiene (QC-216 R8).
- Dos ramas nuevas en la elección de vista, cada una dentro de `<Suspense>` con su esqueleto:
  - `por_acondicionar` → `<ConditioningOrdersListSection>`;
  - `acondicionados` → `<ConditionedOrdersListSection>`.
- Las pestañas ya se pintan con más de una vista (`views.length > 1`). En `assignment-view-tabs.tsx`
  solo cambian sus dos `Record`, con la etiqueta «Terminados» para `acondicionados` (R5).

### 4.2 Componentes de ruta (`app/(private)/asignacion/components/`, barrel `index.ts`)

| Archivo | Tipo | Qué |
|---|---|---|
| `conditioning-orders-list-section.tsx` | servidor | arma el actor con las dos caras de la sesión (calco de `packing-orders-list-section.tsx`), llama a `asignaciones.listConditioningOrders` y reparte error (`AssignedOrdersError`), vacío o tabla |
| `conditioning-orders-table.tsx` | cliente | `<DataTable>` con `searchable={false}`; `onParamsChange` navega con `?vista=por_acondicionar` (R10) |
| `conditioning-orders-columns.tsx` | cliente | las cinco columnas de R8. Número: `<Link href={conditioningOrderRoute(id)}>` con `min-h-11 min-w-11` (R14). «Envases»: `<OrderDistributionFull>`. Estado: `COMPANY_ORDER_STATUS_LABELS` y `data-status` |
| `order-distribution-full.tsx` | servidor/cliente (sin hooks) | todas las líneas del reparto, `«<envases> × <envase>»` unidas por « / », en orden de alta; vacío → «Sin presentación»; nombre ausente → «—». Mismo criterio de nombre que `OrderDistributionLabel` (`packagingName ?? presentationName`) |
| `conditioned-orders-list-section.tsx` | servidor | igual, con `asignaciones.listConditionedOrders` |
| `conditioned-orders-table.tsx` | cliente | `<DataTable>` con `buildConditionedOrdersColumns()`; navega con `?vista=acondicionados` |
| `conditioned-orders-columns.tsx` | cliente | `buildConditionedOrdersColumns()` = `buildFinishedOrdersColumns()` con **solo** la celda del número sustituida por el enlace al detalle (R12). Así, si cambian las columnas del Empacador, cambian estas |
| `conditioning-orders-empty.tsx` | servidor | los textos de R9 y R12 |
| `conditioning-orders-skeleton.tsx` | servidor | esqueleto de las dos tablas |

- **`order-distribution-full.tsx` vive en la ruta**, no en `components/shared/`: hoy lo usan solo
  esta columna y el detalle. Si lo pide otra ruta, se promueve
  (`docs/architecture.md > Regla: sin sobre-ingenieria`).
- **No se cambia `OrderDistributionLabel`**: su forma corta la usan `/pedidos` y «Terminados».
- **Las secciones llaman a la fachada desde el Server Component**, como «Por empacar», y no a una
  Server Action, como «Terminados». Así no aparece una acción nueva con las dos caras de la sesión.

### 4.3 El detalle: `/asignacion/acondicionamiento/[id]`

**La ruta.** `lib/shared/routes.ts` gana
`conditioningOrderRoute(id) = ${ASSIGNED_ORDERS_ROUTE}/acondicionamiento/${id}`. Sin fila en
`PRIVATE_ROUTE_PREFIXES`, igual que `packingOrderRoute`.

**`page.tsx`**, en este orden:

1. `await requirePagePermission('acondicionamiento.modificar')` (R18);
2. arma el actor;
3. `asignaciones.getConditioningOrder(actor, { orderId: id })`;
4. traduce `OrderNotFoundError` y `ValidationError` (un id que no es uuid) en `notFound()` (R17).

**`components/conditioning-order-screen.tsx`** (Server Component, sin estado ni acciones) pinta:

- el número (`h1`);
- la receta, o «Esta receta está dada de baja.»;
- la cantidad con su unidad;
- el reparto con `OrderDistributionFull`, importado desde el barrel de
  `app/(private)/asignacion/components`;
- el estado, con `data-status`;
- «Lo acondiciona <nombre>.»;
- el enlace de vuelta de R16.

**Solo lectura.** Sin formulario, sin botón y sin import de ningún adaptador driving (R16). QC-218
añadirá ahí sus acciones.

**Multiplataforma.** `min-h-dvh`, textos de 16 px y enlaces de 44 px.

## 5. Contratos de entrada y salida

| Caso de uso | Entrada (zod strict) | Éxito | Errores |
|---|---|---|---|
| `listConditioningOrders` | `{ page: int ≥ 1 = 1, pageSize?: int ≥ 1 }` | `Page<ConditioningOrderRow>` | `unauthorized`, `invalid_input` |
| `listConditionedOrders` | ídem | `Page<FinishedOrderView>` | ídem |
| `getConditioningOrder` | `{ orderId: uuid }` | `ConditioningOrderRow` | `unauthorized`, `invalid_input`, `order_not_found` |

Sin códigos de error nuevos.

## 6. Autorización y guardias

- **Service:** R19 en la primera línea de los tres casos de uso. La página da el 404 (R18), pero no
  es la frontera.
- **`tests/unit/identity/roles/acondicionamiento-rol.test.ts`** (barrido de QC-216 R17, ampliado
  por QC-215): las rutas permitidas pasan de tres a ocho, en dos listas.
  - Casos de uso que deben exigir el código con `requirePermission`: los dos de QC-215 y los tres
    nuevos.
  - Consumidores que no son caso de uso: `domain/assignment-views.ts` (`hasPermission`) y
    `app/(private)/asignacion/acondicionamiento/[id]/page.tsx` (`requirePagePermission`).
- **`tests/guards/guard-pantallas-exigen-permiso.test.ts`:** de veinte a veintiuna pantallas.
- **`guard-autorizacion-por-permiso`:** sin cambios.
- **`tests/unit/identity/session-once-per-request-render.test.tsx`:** suma las dos vistas y el
  detalle.

## 7. E2E (`e2e/acondicionamiento.spec.ts`, nuevo)

Sigue el patrón de `e2e/empaque.spec.ts`:

- roles **reales** del seed por constante (`ROLE_ACONDICIONAMIENTO`, `ROLE_OPERADOR`,
  `ROLE_EMPACADOR`, `ROLE_ADMINISTRADOR`);
- usuarios con `createPasswordHash` en una empresa nueva;
- pedidos sembrados con `prisma`, cumpliendo los `CHECK` de QC-215:
  - `packed_by` siempre;
  - `conditioned_by` en `EN_ACONDICIONAMIENTO` y `TERMINADO`;
  - `finished_at` en `TERMINADO`;
  - el pedido A con **dos líneas de reparto**, para afirmar la columna «Envases» completa.

| Pedido | Estado | Quién acondiciona |
|---|---|---|
| A | `POR_ACONDICIONAR`, 2 líneas | — |
| B | `EN_ACONDICIONAMIENTO` | acondicionador 2 |
| C | `TERMINADO` | acondicionador 1 |
| D | `TERMINADO` | acondicionador 2 |
| E | `ENTREGADO` | acondicionador 1 |

**R22, con el acondicionador 1:**

1. aterriza en `/asignacion` con las pestañas exactas;
2. ve A con «<n1> × <e1> / <n2> × <e2>» en «Envases», y B con el nombre del acondicionador 2;
3. el número de A abre el detalle, con número, estado y cero `button`;
4. en «Terminados» ve C y no ve D ni E;
5. el número de C abre su detalle.

**R23**, un `test` por cada rol sin el permiso:

1. en `/asignacion` no está `assignment-view-tab-por_acondicionar`;
2. `?vista=por_acondicionar` tampoco la pinta, ni su sección;
3. `conditioningOrderRoute(A)` responde con el 404 de la zona privada.

Los pedidos se siembran directamente porque el recorrido de empaque ya lo cubre `empaque.spec.ts`.
Para E, la fila `ENTREGADO` se escribe con `prisma`: ninguna vía de la aplicación lo produce.

## 8. Alternativas descartadas

1. **Reutilizar la vista `terminados` y `listFinishedOrders`, abriéndolos también por el permiso.**
   Se descarta por tres motivos:
   - cambia la autorización de un caso de uso ya mergeado;
   - mezcla dos filtros (`packedBy`, `conditionedBy`) en una función que decide por permisos;
   - QC-216 §7.2 lo desaconseja.

   Se reutilizan el tipo de fila y las columnas, no el caso de uso (R13).
2. **Dar `terminados.consultar` al rol.** Abriría el Terminados de la empresa (o lo que empacó), no
   «lo que acondicionó él». Contradice QC-216 R8.
3. **Cambiar `OrderDistributionLabel` para que pinte todas las líneas.** Cambiaría `/pedidos` y el
   Terminados del Empacador, que esta ficha no debe tocar (R13). Se hace un componente de ruta
   aparte.
4. **Copiar las seis columnas del Empacador en un archivo nuevo.** Duplica rótulos y celdas que D10
   quiere idénticos. Se derivan con `buildFinishedOrdersColumns()` y se sustituye solo la celda del
   número.
5. **Tabla de servidor sin `<DataTable>`, como «Por empacar».** D2 pide la tabla compartida.
6. **Método nuevo en `OrderCatalog`.** Duplicaría la paginación y el orden de
   `listAliveSummariesInCompany`. Basta un campo más en el filtro opcional.
7. **Detalle en `/asignacion/[id]` según el permiso.** Esa es la ejecución del Operador, con su
   propio permiso de página; mezclarlas rompe el corte por página (R18).

## 9. Dependencias de terceros

Ninguna (D8, R24).

## 10. Decisiones de F1.4 (aprobadas el 2026-10-08, fila D12)

| # | Decisión | Dónde |
|---|---|---|
| N1 | URL `?vista=por_acondicionar` y `?vista=acondicionados`; etiqueta de la segunda «Terminados» | §3.1 |
| N2 | Ruta del detalle `/asignacion/acondicionamiento/[id]` | §4.3 |
| N3 | Textos: «No hay pedidos por acondicionar en tu empresa.», «Esta página ya no tiene pedidos.», «Todavía no has terminado ningún acondicionamiento.», «Lo acondiciona <nombre>.», «Volver a «Por acondicionar»» / «Volver a «Terminados»» | R9, R12, R16 |
| N4 | P1 (a), P2 (b), P3 (b): filas D9, D10 y D11 | `requirements.md` |

## 11. Choques previsibles

- `lib/composition/index.ts`, `lib/modules/asignaciones/index.ts`,
  `app/(private)/asignacion/page.tsx` y `components/index.ts`: QC-218 los tocará después. Depende
  de esta ficha, así que no hay solape en vuelo.
- `tests/guards/guard-pantallas-exigen-permiso.test.ts`: QC-221 (integraciones), si añade pantallas,
  tensa el mismo contador. La segunda en mergear lo resuelve en F2.3.
- **Pendiente para QC-219:** con D9 un `ENTREGADO` no sale en «Terminados» y su detalle da 404.
  Corregir datos de lote tras la entrega necesitará otra vía de acceso.
