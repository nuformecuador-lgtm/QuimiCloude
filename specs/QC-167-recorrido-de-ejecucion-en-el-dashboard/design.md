# QC-167 — recorrido-de-ejecucion-en-el-dashboard · design.md

> Solo lectura sobre el registro que escribe QC-82. Todo lo que sigue se comprobó **en disco**, en
> este worktree (rama nacida de QC-82, `aef6d1c5`), no de memoria. Las rutas con `:línea` son de ese
> árbol.

## Lo que ya existe

**Términos buscados:** `order_execution_entries`, `OrderExecutionEntry`, `ExecutionLogRepository`,
`recorrido`, `dashboard.consultar`, `formatOrderNumber`, `listAliveSummariesByIds`, «duración».
Buscado en `feature_list.json` (por `key` y nombre), en `specs/` (grep) y en el código (Grep y grafo
`codebase-memory-mcp`, proyecto del worktree de QC-82: el de este worktree **no está indexado**, así
que se completó con Grep/Read).

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| El registro: tabla, enum de ocho acciones, RLS, índices `(order_id, occurred_at desc)` y `(user_id)` | `db/schema.prisma:874-905`, migración `20261006180000_order_execution_entries` (QC-82) | **Se lee**, no se toca. Ninguna migración nueva (R27) |
| Puerto del registro, solo anexar + última posición | `lib/modules/asignaciones/ports/execution-log-repository.ts` | **Se amplía** con tres lecturas (§ 3.1) |
| Adaptador Prisma del registro y mapa acción → enum | `adapters/driven/persistence/execution-log-prisma.ts:10-19` | **Se amplía**; el mapa inverso se deriva de ese, no se reescribe |
| Tipos de acción del dominio | `domain/execution-entry.ts:1-12` | **Se reutiliza** `ExecutionAction`; se añade el tipo de lectura |
| `requirePermission`, `Actor`, `currentActor()` con `runInRequestScope` | `domain/actor.ts:58`, `adapters/driving/order-assignment-actions.ts:83-95` | **Se reutilizan** tal cual |
| Errores `UnauthorizedError`, `ValidationError`, `OrderNotFoundError` | `domain/errors.ts:51,61,76` | **Se reutilizan**; ningún error nuevo |
| Contrato de pedidos para otros módulos (`OrderCatalog`) con resumen paginado por ids (número, estado) | `lib/modules/pedidos/domain/order-catalog.ts:61-67`, adaptador `order-catalog-prisma.ts:158-185` | **Se reutiliza y se amplía** con dos opciones (§ 3.3) |
| Formato del número visible | `pedidos/domain/order-number.ts:18` | **Se reutiliza**; nace su inversa al lado (§ 3.3) |
| Directorio de personas, con dadas de baja | `identity/domain/people-directory.ts:93` | **Se reutiliza** (nombres, R7) |
| Tabla compartida con filtros y paginación | `components/shared/data-table` | **Se reutiliza** sin tocarla |
| Parser/serializador de lista en URL | `app/(private)/pedidos/components/order-list-params.ts` | **Se copia el patrón**, no el archivo: es de otra ruta |
| Grupo de avatares de personas | `components/shared/responsible-avatars.tsx:79-117` | **Se reutiliza** para «personas» de la fila |
| Formato `YYYY-MM-DD HH:mm` en UTC sin `toLocaleString` | `app/(private)/inventario/components/batch-history.tsx:56-62` | **Mismo criterio** para los instantes |
| Semántica del rango de fechas (UTC, `to` inclusivo) | `pedidos/adapters/driven/persistence/list-query-sql.ts:69-93` | **Misma semántica**, reescrita en el dominio de `asignaciones` (no se puede importar un driven ajeno) |
| La costura vacía y sus tests negativos | `app/(private)/dashboard/components/dashboard-content.tsx`, `tests/unit/dashboard-page.test.tsx:152-166,195-212`, `tests/unit/dashboard-route-contract.test.ts` | **Se rellena y se enmienda** (§ 7) |

**Ninguna ficha ni spec duplica esta.** QC-82 dejó la consulta fuera con nombre propio
(`specs/QC-82-…/requirements.md:25-31`, nota del 2026-09-24) y la manda aquí. QC-124 (purga) es la
otra mitad del registro y no lo lee para pintar nada.

## 1. Forma general

```
/dashboard?<filtros>                          page.tsx  ── requirePagePermission('dashboard.consultar')
  └ DashboardContent(params)                  (servidor, sin datos propios)
      └ <Suspense> ExecutionTraceListSection  (servidor) ── listExecutionTracesAction(params)
          └ ExecutionTraceTable               ('use client') ── DataTable + router.push(URL)

/dashboard/recorrido/<orderId>?<filtros>      page.tsx  ── requirePagePermission('dashboard.consultar')
  └ getExecutionTraceAction(orderId)  → notFound() si OrderNotFoundError
  └ ExecutionTraceDetail              (servidor)
```

Los dos casos de uso viven en **`asignaciones`**, dueño del registro (R24). `pedidos` no gana
dependencia de nadie: es `asignaciones` quien le pregunta, como ya hace (`list-company-orders.ts:61`).

## 2. Modelo de datos, RLS y migraciones

**Ninguna tabla, columna, índice ni migración** (R27). El diff de `db/**` es vacío. La tabla
`order_execution_entries` ya tiene empresa propia, RLS activada y forzada (QC-82 R32) y sus dos
índices. No nace ningún permiso: se usa `dashboard.consultar`, que hoy solo tiene el Administrador
(`identity/domain/permissions.ts:253`, `:275-278`), y el catálogo y el seed no cambian (R21).

**Índice por empresa: descartado (alternativa A4, § 10).** Las lecturas por empresa del registro no
tienen índice que empiece por `company_id`. Se acepta porque el dashboard no es una ruta caliente
(`docs/architecture.md > Anti-patrones` habla de rutas calientes y crons) y QC-124 acotará el tamaño
de la tabla. Si una medición dice lo contrario, es una migración pequeña en ficha aparte.

## 3. Backend, pieza a pieza

### 3.1 Puerto del registro (`ports/execution-log-repository.ts`) — tres métodos más

```ts
/** Lo que se lee de una anotación. Mismos campos que se escriben, más `id` para desempatar. */
export type ExecutionEntryRecord = {
  readonly id: string;
  readonly orderId: string;
  readonly userId: string;
  readonly action: ExecutionAction;
  readonly stepPosition: number | null;
  readonly reason: string | null;
  readonly occurredAt: Date;
};

export type ExecutedOrdersFilter = {
  readonly userId?: string;
  readonly occurredFrom?: Date;      // inclusivo
  readonly occurredBefore?: Date;    // exclusivo
};

/** Ids distintos de los pedidos con alguna anotación que cumpla el filtro. Sin orden prometido. */
listExecutedOrderIds(companyId: string, filter: ExecutedOrdersFilter): Promise<readonly string[]>;
/** Todas las anotaciones de esos pedidos, ordenadas por (orderId, occurredAt asc, id asc). */
listEntriesForOrders(companyId: string, orderIds: readonly string[]): Promise<readonly ExecutionEntryRecord[]>;
/** Ids distintos de las personas con alguna anotación en la empresa. */
listUserIdsWithEntries(companyId: string): Promise<readonly string[]>;
```

`companyId` es **el primer parámetro** en los tres, como en `findLastStepPosition`: una llamada que
lo olvide no compila (R23). `ExecutionEntryRecord` va en `domain/execution-entry.ts`, junto a
`NewExecutionEntry`. El puerto sigue sin ningún método que modifique o borre (QC-82 R31, R22).

### 3.2 Adaptador (`adapters/driven/persistence/execution-log-prisma.ts`)

- `listExecutedOrderIds`: `orderExecutionEntry.groupBy({ by: ['orderId'], where: { companyId,
  userId?, occurredAt?: { gte, lt } } })`. Una sentencia.
- `listEntriesForOrders`: `findMany({ where: { companyId, orderId: { in } }, orderBy: [{ orderId:
  'asc' }, { occurredAt: 'asc' }, { id: 'asc' }] })`. `orderIds` vacío no llega: corta el caso de uso.
- `listUserIdsWithEntries`: `groupBy({ by: ['userId'], where: { companyId } })`.
- El enum Prisma → `ExecutionAction` se obtiene **invirtiendo** `EXECUTION_ACTION_TO_PRISMA` (una
  función que recorre sus entradas), con un test que comprueba que la ida y la vuelta devuelven lo
  mismo para las ocho acciones. No se escribe un segundo mapa a mano.

### 3.3 Lo que gana `pedidos` (contrato público)

Dos piezas, las dos **aditivas**: ningún llamante actual cambia.

1. **`parseOrderNumber(text: string): OrderNumber | null`** en `domain/order-number.ts`, al lado de
   `formatOrderNumber` y exportada por el barril. Acepta `^\s*(\d{4})-(\d{1,7})\s*$` con secuencia
   ≥ 1; cualquier otra cosa es `null`. Vive en `pedidos` porque es la **inversa** de un formato que es
   suyo: una segunda definición fuera divergiría (R6). Test: `parse(format(n))` devuelve `n`.
2. **`listAliveSummariesByIds` gana un sexto parámetro opcional**
   `options?: { readonly number?: OrderNumber; readonly ordering?: OrderSummaryOrdering }`, mismo
   patrón que el `filter?` de `listAliveSummariesInCompany` (`order-catalog.ts:84`). `number` añade
   `orderYear = y AND orderSequence = s` al `where`; `ordering` elige el `ORDER BY`. Y
   `OrderSummaryOrdering` gana un tercer valor, **`'number_recent_first'`**: `orderYear desc,
   orderSequence desc, id asc` (R4). Sin `options`, el comportamiento es el de hoy (`work_queue`).
   `listAliveSummariesInCompany` acepta también el valor nuevo, porque el tipo es compartido; no hay
   llamante que lo use.

Cambia el puerto `ports/order-summary-reader.ts`, la factoría `domain/list-order-summaries.ts:42-49`
(pasa `options`) y el adaptador `order-catalog-prisma.ts:158-185`. El ámbito de empresa
(`orderCompanyScope`) y `deletedAt: null` siguen siendo el **primer término del `AND`**.

### 3.4 Cálculo del recorrido (`domain/execution-trace.ts`, puro)

```ts
export type TraceDuration =
  | { readonly kind: 'closed'; readonly ms: number }
  | { readonly kind: 'open'; readonly ms: number }          // hasta `now` (R3)
  | { readonly kind: 'unclosed'; readonly ms: number }      // «sin cierre anotado» (R15)
  | { readonly kind: 'none' };                              // «sin empaque» (R15)

export type TraceStep = ExecutionEntryRecord & {
  readonly gapToNextMs: number | null;                      // null en la última (R14)
  readonly isGoBack: boolean;                               // R16
};

export function buildExecutionTrace(
  entries: readonly ExecutionEntryRecord[],                 // de UN pedido, ya ordenadas
  status: OrderStatus,
  now: Date,
): {
  readonly steps: readonly TraceStep[];
  readonly firstAt: Date; readonly lastAt: Date;
  readonly execution: TraceDuration; readonly packing: TraceDuration;
  readonly goBackCount: number;
  readonly userIds: readonly string[];                      // distintos, en orden de aparición
};
```

Reglas (R15), con la propuesta de P1 (§ 5):

- **Ejecución**: anotaciones `start | resume | advance | go_back | cancel | finish`. Desde la
  primera hasta la primera `finish` o `cancel` → `closed`. Sin cierre: `status === 'EN_CURSO'` →
  `open` hasta `now`; otro estado → `unclosed` hasta la última anotación de ejecución. Sin ninguna
  anotación de ejecución → `none`.
- **Empaque**: `pack_start` → `pack_finish`. Sin `pack_finish`: `EN_EMPAQUE` → `open`; otro estado
  → `unclosed` hasta `pack_start`. Sin `pack_start` → `none`.
- El hueco entre la última de ejecución y `pack_start` no entra en ninguna de las dos.
- `goBackCount` = número de `go_back`. Es **una** función: la fila y el detalle la llaman igual, así
  que no pueden dar cifras distintas (R16).
- `now` entra por parámetro: el dominio no tiene reloj (mismo criterio que `PeopleDirectory`).

`OrderStatus` llega del contrato de `pedidos`: el dominio de `asignaciones` ya lo importa del barril.

### 3.5 Caso de uso de la lista (`domain/list-execution-traces.ts`)

```ts
createListExecutionTraces(deps: { log, orders: OrderCatalog, people: PeopleDirectory }):
  (actor, input: unknown, now: Date) => Promise<{
    readonly page: Page<ExecutionTraceRow>;
    readonly personOptions: readonly { userId: string; displayName: string }[];
  }>
```

Orden de ejecución, y es el requisito:

1. `requirePermission(actor, 'dashboard.consultar')` — **primera línea** (R19).
2. zod `strictObject`: `page ≥ 1`, `pageSize ∈ {10, 25}`, `orderNumber?: string (≤ 20)`,
   `userId?: uuid`, `from?/to?: YYYY-MM-DD`, `cancelledOnly: boolean`. Inválido → `ValidationError`.
   (La URL ya llega acotada por el parser de la pantalla; esto es la frontera, no la cortesía.)
3. `personOptions`: `log.listUserIdsWithEntries(companyId)` + `people.findRefsIncludingDeletedInCompany`
   (R7). Se pide siempre, porque el filtro tiene que poder pintarse aunque la lista quede vacía.
4. Si hay `orderNumber`: `parseOrderNumber`; `null` → página vacía **sin preguntar a `pedidos`** (R6).
5. `log.listExecutedOrderIds(companyId, { userId, occurredFrom, occurredBefore })` (R7, R8). El rango
   pasa de días a instantes aquí: `from` 00:00Z inclusivo, `to` + 1 día 00:00Z exclusivo, igual que
   `list-query-sql.ts:81-93`. Ids vacíos → página vacía.
6. `orders.listAliveSummariesByIds(companyId, ids, cancelledOnly ? ['CANCELADO'] : ORDER_STATUS_VALUES,
   page, pageSize, { number, ordering: 'number_recent_first' })` (R4, R5, R6, R9, R10). **Pagina
   `pedidos`**: el `total` es el de los pedidos que cumplen todos los filtros.
7. `log.listEntriesForOrders(companyId, idsDeLaPágina)` → agrupar → `buildExecutionTrace` por pedido.
8. `people.findRefsIncludingDeletedInCompany(companyId, userIdsDeLaPágina, now)` — **una** consulta
   para toda la página.

Fila (`ExecutionTraceRow`): `orderId`, `numberText` (`formatOrderNumber`), `status`, `people`,
`firstAt`, `lastAt`, `execution`, `packing`, `goBackCount`. Consultas por render: **5** como mucho,
constantes, sin una por fila.

### 3.6 Caso de uso del detalle (`domain/get-execution-trace.ts`)

1. `requirePermission(actor, 'dashboard.consultar')` (R19).
2. zod: `orderId` uuid; inválido → `OrderNotFoundError` (un id mal formado en la URL es un 404, no un
   500: mismo comportamiento que un id que no existe, R18).
3. `orders.listAliveSummariesByIds(companyId, [orderId], ORDER_STATUS_VALUES, 1, 1)` → vacío =
   `OrderNotFoundError` (no existe, otra empresa o dado de baja, P3).
4. `log.listEntriesForOrders(companyId, [orderId])` → vacío = `OrderNotFoundError` (sin anotaciones).
5. Nombres con el directorio y `buildExecutionTrace`.

Los cuatro casos de R18 lanzan **el mismo error**: la página no puede distinguirlos.

### 3.7 Adaptador driving (`adapters/driving/execution-trace-actions.ts`, nuevo)

```ts
'use server'
export async function listExecutionTracesAction(input: ExecutionTraceListInput): Promise<ExecutionTraceListResult>;
export async function getExecutionTraceAction(orderId: string): Promise<ExecutionTraceResult>;
```

Argumentos tipados, no `FormData`: no vienen de un formulario. `currentActor()` **con el mismo
`runInRequestScope`** que `order-assignment-actions.ts:83-95` (una lectura de sesión por petición,
QC-104); el archivo nuevo entra en la lista `ACCIONES` de
`tests/unit/identity/session-once-per-request-actions.test.ts`, que ya falla si falta. `now = new
Date()` lo pone esta capa. Errores traducidos por `code` con `createErrorStateTranslator`, como el
resto del módulo. **Ningún permiso se comprueba aquí.** No se reexporta por el barril.

### 3.8 Composición y contrato

- `lib/composition/index.ts`: dos factorías más en el bloque `asignaciones`, con el **mismo**
  `executionLogRepository`, `orderCatalog` y `peopleDirectory` que ya existen (`:1460`, `:1495`,
  `:1514`). Ningún adaptador nuevo.
- `lib/modules/asignaciones/index.ts`: bloque nuevo al final con las dos factorías y los tipos de
  salida (`ExecutionTraceRow`, `ExecutionTrace`, `TraceDuration`, `TraceStep`). Sin `'use server'`
  ni `@prisma/client` en su cierre.

## 4. La pantalla

### 4.1 Rutas

`lib/shared/routes.ts` gana `executionTraceRoute(orderId: string): string` →
`${DASHBOARD_ROUTE}/recorrido/${orderId}`, mismo patrón que `assignedOrderRoute` (`:232`). Ya cae
bajo el prefijo privado `DASHBOARD_ROUTE` (`:297-298`).

### 4.2 Parámetros en la URL (`components/execution-trace-list-params.ts`, puro)

Mismo diseño que `order-list-params.ts`: claves explícitas, nunca JSON; `parse` **nunca falla**
(R5); `parse(build(p))` devuelve `p`.

| Parámetro | Valor | Acotado |
|---|---|---|
| `page` | entero ≥ 1 | si no, 1 |
| `pageSize` | `10` o `25` (`PAGE_SIZE_OPTIONS`) | si no, 10 |
| `q` | número de pedido, texto | `trim`, máx. 20 |
| `persona` | uuid | si no es uuid, se descarta |
| `desde`, `hasta` | `YYYY-MM-DD` válida | si no, se descarta ese extremo |
| `cancelados` | `1` | cualquier otro valor = desactivado |

`buildExecutionTraceListQuery(params)` produce la cadena; la usan la tabla al navegar, el enlace de
cada fila y el «volver» del detalle. Cambiar un filtro reinicia `page` a 1 (R11), como
`withSearchResetsPage`.

**Volver del detalle conserva los filtros (R17)** porque el enlace de cada fila es
`executionTraceRoute(id) + '?' + query` —la URL del detalle **lleva** la consulta de la lista— y el
«volver» es `DASHBOARD_ROUTE + '?' + build(parse(searchParams del detalle))`. Sin parámetros, vuelve
a la lista por defecto. La URL del detalle sigue siendo compartible: el id va en la ruta y los
parámetros solo afectan al «volver».

### 4.3 Componentes (`app/(private)/dashboard/components/`, con barril)

| Archivo | Qué es |
|---|---|
| `dashboard-content.tsx` | servidor; recibe `params` y monta la sección dentro de `<Suspense>`. Sigue **sin** importar `lib/modules`, composición ni cookies |
| `execution-trace-list-section.tsx` | servidor; llama a `listExecutionTracesAction`; error → aviso dentro del área, no tumba la pantalla |
| `execution-trace-table.tsx` | `'use client'`; `DataTable` controlada por la URL (`router.push`), `searchable` con `q`, interruptor «solo cancelados» en `toolbarActions` (`components/ui/checkbox.tsx`, con `label` y 44×44) |
| `execution-trace-columns.tsx` | `'use client'`; columnas como datos. «Personas» con `ResponsibleAvatars` y filtro `select` (opciones del servidor); «Última anotación» con filtro `dateRange`; «Nº de pedido» fijada a la izquierda; **ninguna ordenable** (R4) |
| `execution-trace-format.ts` | puro: `formatTraceDuration`, `formatTraceInstant` (UTC, `YYYY-MM-DD HH:mm:ss`), etiquetas de acción y de estado |
| `index.ts` | barril; sin `'use client'` |

Y `app/(private)/dashboard/recorrido/[id]/page.tsx` + `components/{execution-trace-detail.tsx,
index.ts}`. El detalle es un **Server Component sin estado**: una lista ordenada (`<ol>`) de
anotaciones, cada vuelta atrás con marca visible **de texto** («Vuelta atrás») además del estilo, y un
resumen arriba (número, estado, duraciones, vueltas). Importa los formateadores del barril del
dashboard (`@/app/(private)/dashboard/components`): la ruta hija comparte presentación con la madre y
no se copia. **No hay precedente de una ruta que importe el barril de otra**; si el reviewer lo
rechaza, se sube `execution-trace-format.ts` a `lib/shared/ui/`, que es hoja y puro.

**Etiquetas de estado.** El mapa `OrderStatus → texto` ya existe dos veces en rutas ajenas
(`pedidos/components/order-status-badge.tsx:32`, `asignacion/components/company-orders-columns.tsx:42`)
y ninguna ruta importa de otra. Se declara uno propio, **exhaustivo por tipo**
(`Record<OrderStatus, string>`), con «En curso» para `EN_CURSO` (R3). Promover los tres a
`components/shared/` tocaría dos rutas de otras fichas en vuelo: queda anotado como deuda, no se hace
aquí.

**Formato de duración.** `formatTraceDuration(d)`: `«1 h 05 min»`, `«12 min 30 s»`, `«45 s»`; `open`
añade «(en curso)»; `unclosed`, «(sin cierre anotado)»; `none`, «Sin empaque». Aritmética entera sobre
milisegundos, unas diez líneas. **No se usa librería** (§ 8).

### 4.4 Multiplataforma (R26)

`min-h-11 min-w-11` en el interruptor, en el enlace de cada fila y en «Volver»; los campos de texto
y fechas los pone la tabla compartida, que ya cumple 16 px. Ninguna información solo por `:hover`:
los avatares de personas ya tienen su lista accesible (`responsible-avatars.tsx`), y el nombre
completo de cada persona está además en el detalle. Nada de `100vh`. **No se declara ninguna
excepción de escritorio.** La lista del detalle es una columna: en móvil no hay tabla ancha.

## 5. P1 — La duración con pausas (para aprobación humana en F1.3)

El registro **no tiene pausa**: tiene `retomar`, y QC-82 R13 lo anota tanto al volver de una pausa
como **al recargar la pantalla**. Y avanzar/retroceder pueden perderse sin aviso (QC-82 D11/R19).

| | Opción | Qué da | Problema |
|---|---|---|---|
| **A** | **Reloj**: de la primera a la última anotación de cada parte | lo que tardó el pedido de verdad, de principio a fin | una pausa de una noche infla la cifra |
| B | Suma de tramos, **quitando el tramo anterior a cada `retomar`** | «tiempo trabajado» aparente | un `retomar` por **recarga** a mitad de un paso quita trabajo real; una anotación perdida hace el tramo más largo y se lo come igual. Da una cifra que parece precisa y no lo es |
| C | Suma de tramos, quitando los **mayores de X minutos** | se aproxima a B sin depender de `retomar` | X no está en ningún doc ni decisión: habría que inventarlo |

**Recomendación: A.** Es la única que no afirma nada que el registro no sabe. La pausa larga **no se
esconde**: el detalle enseña cada tramo (R14), y el tramo anterior a un `retomar` es justo el que se
verá largo. Si el humano prefiere B o C, cambian `buildExecutionTrace` y R15, nada más; para C hace
falta además que diga el valor de X.

## 6. P2 — Con qué se busca un pedido

Comprobado en el código: el identificador visible es el número `AAAA-NNNNNNN`
(`order-number.ts:18`), el de la columna «Nº de pedido» (`order-columns.tsx:182-190`). La búsqueda
`q` de la pantalla de pedidos **busca por nombre de receta**, no por número (`list-orders.ts:153-159`):
aquí no hay nada que copiar de ella. Por eso nace `parseOrderNumber` en `pedidos` (§ 3.3) y la
coincidencia es **exacta** (R6). Un texto que no tiene forma de número deja la lista vacía en vez de
ignorarse: quien filtra y ve la lista entera creería que su pedido no está.

## 7. La costura del dashboard (QC-75 / QC-12) y los tests que se enmiendan

| Test | Hoy | Después |
|---|---|---|
| `tests/unit/dashboard-page.test.tsx` «el area de contenido se renderiza vacia» (`:152-166`) | área sin hijos ni texto | **enmendado con nota fechada**: el área contiene la sección del recorrido (`data-testid` propio) **y nada más**; la sección se simula en el test |
| mismo archivo, R12 (`:195-212`) | `area.children` = 0 a dos anchos | el área tiene **un** hijo, a los dos anchos |
| mismo archivo, R2 y R4 | un `h1`, sin landmarks nuevos | **sin cambios**: la lista no añade `h1` (su título es `h2`) ni landmarks |
| `tests/unit/dashboard-route-contract.test.ts` R6 (`:117-129`) | ni el área ni la página consultan datos | **se mantiene entero** para `dashboard-content.tsx` y `page.tsx`: la consulta vive en la sección. Se añade la sección a las fuentes vigiladas por `100vh`/`hover` |
| mismo archivo, R7 (`:176-189`) | sin `use client` ni estado | **se mantiene** para `page.tsx` y `dashboard-content.tsx` |
| mismo archivo, R8 (`:191-199`) | la página no valida sesión | **se mantiene**: sin `redirect`, `next/headers` ni `getSessionUser` |
| `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` (`:164-170`) | dashboard `leeAlgo: false` | `searchParams` espía y `leeAlgo: true`; **caso nuevo** para el detalle |
| `tests/guards/guard-pantallas-exigen-permiso.test.ts` (`:250-278`) | veinte pantallas | **veintiuna**, con `/dashboard/recorrido/[id]` y su nota fechada |
| `tests/unit/identity/session-once-per-request-actions.test.ts` (`:165`) | lista `ACCIONES` | fila nueva para `execution-trace-actions.ts` |

Los comentarios de producción de `dashboard-content.tsx` y `page.tsx` que dicen «vacía a propósito»
o «sin datos» dejan de ser ciertos: se reescriben en las líneas que se tocan, sin citar fichas
(`docs/conventions.md > Comentarios`).

## 8. Dependencias de terceros

**Ninguna nueva** (R27). Verificado en disco: no hay librería de fechas en `package.json`, y no hace
falta. Lo que se usa ya está: `components/shared/data-table`, `components/ui/checkbox.tsx`,
`components/shared/responsible-avatars.tsx`, `zod`.

Se consideró `date-fns` (`formatDuration`/`intervalToDuration`) para el formato de duraciones y se
descarta: ahorraría unas diez líneas de aritmética entera, y meterla obligaría a pasar los cuatro
checks y la aprobación por un caso trivial (`docs/architecture.md > Dependencias de terceros`).
`Intl.DurationFormat` tampoco: su soporte en Safari/WebKit y Chrome Android no está verificado aquí, y
sin verificar es un desconocido (regla 6).

## 9. Lo que se propone y espera visto bueno (⚑)

| | Propuesta | Requisitos | Si el humano elige otra cosa |
|---|---|---|---|
| **P1** | Duración de reloj por parte (§ 5) | R15 | cambia `buildExecutionTrace` |
| **P3** | Los pedidos dados de baja no salen y su detalle es 404 | R18 | método de `pedidos` con borrados y marca en la fila |
| ⚑ | Orden por número descendente | R4 | cambia `ordering` |
| ⚑ | Coincidencia exacta del número (P2) | R6 | parcial exige otro filtro en `pedidos` |

## 10. Alternativas descartadas

**A1 — Que `asignaciones` haga un `JOIN` con `orders` en su adaptador (SQL crudo).** Una sola
consulta paginada, con filtros de estado y número dentro. **Descartada**: es consultar una tabla de
otro módulo, que `docs/architecture.md > Anti-patrones` prohíbe; el SQL crudo solo escondería el
`prisma.order` a la guardia de arquitectura sin cambiar lo que hace.

**A2 — Deducir «cancelado» y «en curso» del propio registro** (hay `cancel` / no hay `finish`), sin
preguntar a `pedidos`. Paginaría todo en `asignaciones`. **Descartada**: un pedido `EN_CURSO`
cancelado desde la pantalla de **pedidos** no deja anotación (el camino único de cancelación vive en
`pedidos` y no conoce el registro), así que saldría «en curso» para siempre y «solo cancelados» no lo
encontraría. R9 pide el estado real.

**A3 — Paginar en `asignaciones` por última actividad y pedir a `pedidos` solo la página.** Ordenaría
por lo más reciente. **Descartada**: con «solo cancelados» o con número, el filtro de estado lo
tendría que aplicar `pedidos` **después** de paginar, y las páginas saldrían cortas o vacías; para
evitarlo haría falta pedir el estado de **todos** los pedidos ejecutados, que es la misma lista de ids
de la solución elegida pero en dos idas.

**A4 — Índice `(company_id, occurred_at)` en el registro.** Ver § 2: no es ruta caliente, la purga lo
acota y la ficha se evaluó «sin tablas nuevas». Se mide antes de migrar.

**A5 — El detalle como panel lateral en la misma página** (como el de pedidos). **Descartada por D7**:
la decisión pide página propia con URL compartible.

**A6 — `router.back()` para volver.** **Descartada**: con un enlace compartido no hay historial al que
volver y se saldría de la aplicación; R17 pide la lista con los filtros, y eso solo lo garantiza
llevarlos en la URL.

## 11. Riesgos

1. **La lista de ids pasa entera a `pedidos`** (§ 3.5, paso 6): un `IN` con todos los pedidos
   ejecutados de la empresa que cumplen los filtros de persona y fecha. Crece hasta que QC-124 purgue.
   Prisma tiene un tope de parámetros por sentencia; con un registro de decenas de miles de pedidos
   habría que trocear o cambiar de estrategia. Hoy no se acerca: la tabla nació con QC-82, que **aún
   no está en `dev`**.
2. **La rama nace de la de QC-82 sin mergear** (`progress/features/QC-167.md > Decisiones`). Si QC-82
   cambia el puerto, el adaptador o el enum antes de mergear, esta rama tiene que traerlo.
3. **Instantes en UTC.** La pantalla enseña UTC, como el historial de lotes. No hay huso de empresa
   en el modelo; un Administrador en UTC−5 verá las 14:00 como 19:00. Es el criterio vigente del repo,
   no una decisión nueva; si molesta, es ficha aparte.
4. **Pedidos ejecutados antes de QC-82** no tienen anotaciones y no salen (R1). Uno que empezó antes y
   terminó después sale con el recorrido a medias; su duración se mide desde la primera anotación que
   haya.
