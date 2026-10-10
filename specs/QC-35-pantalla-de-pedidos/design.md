# QC-35 — pantalla-de-pedidos · design.md

La capa visual de pedidos sobre un backend que ya está `done` y mergeado: QC-34 (las seis Server
Actions del pedido) y QC-57 (el contrato genérico de consulta de lista). Además, esta pantalla es
**el primer consumidor de la tabla de datos compartida de QC-55**, mergeada el 2026-09-04 y sin
estrenar. Este documento fija **qué se hereda**, **qué se crea**, **los archivos ajenos que se tocan
y por qué**, los contratos de entrada/salida y las alternativas descartadas. Las decisiones de
producto ya las cerró el humano el 2026-09-06 (`requirements.md > Decisiones cerradas`); aquí va su
detalle técnico.

## 0. Estado real del repo (verificado, no supuesto)

Comprobado leyendo el código el 2026-09-06, **antes** de escribir este diseño.

| Hecho | Evidencia |
| --- | --- |
| `lib/shared/routes.ts` declara `DASHBOARD_ROUTE`, `LOGIN_ROUTE`, `INVENTORY_ROUTE`, `FORMULAS_ROUTE`, `NEW_RECIPE_ROUTE`, `recipeEditRoute`, `SUPPLIERS_ROUTE`, `supplierDetailRoute`, `FORGOT_PASSWORD_ROUTE`. **No existe ninguna constante de pedidos** | `lib/shared/routes.ts:1-56` |
| `PRIVATE_ROUTE_PREFIXES` tiene hoy cuatro entradas y su guardia compara la lista contra el árbol en los **dos** sentidos | `lib/shared/routes.ts:68-76`, `tests/guards/guard-rutas-privadas-cubiertas.test.ts` |
| `ROUTE_ROLE_RULES` vive en `lib/composition/route-role-rules.ts`, tiene **tres** filas y todas reutilizan el `ADMIN_ROLE_NAME` importado como valor del barrel de `inventario` | `lib/composition/route-role-rules.ts:30-59` |
| Ese archivo tiene que poder cargar en el **borde** (lo alcanza `middleware.ts`): sin Prisma, sin `next/headers`, sin `lib/composition/index.ts` | cabecera `route-role-rules.ts:18-21` + `tests/guards/guard-middleware-edge.test.ts` |
| `private-nav.ts` declara `NAV_SECTION_OPERATION = 'Operación'` con dos ítems de nivel superior (Dashboard, Inventario) y `NAV_SECTION_CHAIN` con Producción y Proveedores | `private-nav.ts:76-77,136-180` |
| `NavIconName` incluye `'clipboard-list'` y `'shopping-cart'`, ya mapeados en `NAV_ICONS`. **No hace falta icono nuevo** | `private-nav.ts:91-100`, `nav-icons.ts` |
| Las **seis** Server Actions de pedidos existen en `lib/modules/pedidos/adapters/driving/order-actions.ts` y **no pasan por el barrel**, que lo dice expresamente | `order-actions.ts:145-261`, `lib/modules/pedidos/index.ts:7-8` |
| `create/cancel/delete` son `(prevState, formData)`; `update` es `(id, prevState, formData)` → encaja con `useActionState` + `bind`. `get(id)` y `list(query: unknown)` reciben argumentos tipados, no `FormData` | `order-actions.ts:145,163,187,209,231,252` |
| Ninguna action llama a `revalidatePath` **a propósito**: «QC-35 decide qué revalida». Ninguna exporta `INITIAL_STATE`: un archivo `'use server'` solo exporta funciones async | `order-actions.ts:48-50,74-76` |
| Campos del `FormData` que las actions leen: `recipeId`, `quantity`, `unitId`, `unitPrice`, `priority` (alta); los mismos + `status` (edición); `id` + `reason` (cancelación); `id` (borrado) | `order-actions.ts:103-142,193,201,215` |
| Códigos de error estables: `unauthorized`, `not_found`, `recipe_not_found`, `unit_not_found`, `invalid_transition`, `not_cancellable`, `not_deletable`, `duplicate_number`, `invalid_input` | `lib/modules/pedidos/domain/errors.ts` |
| `OrderView` (= `OrderSummary`) trae `recipeName` y `unitName` **ya resueltos** (`string \| null`), `numberText`, `cancellationReason`, `quantity`/`unitPrice` como **cadena**, y `createdBy`/`updatedBy` como **ids**. **No hay campo `total`** | `domain/order-view.ts:79-103` |
| El contrato público es **importable desde cliente**: esquemas (`createOrderSchema`, `updateOrderSchema`, `cancelOrderSchema`), `EDITABLE_STATUS_VALUES`, `ORDER_STATUS_VALUES`, `ORDER_PRIORITY_VALUES`, `DEFAULT_ORDER_PRIORITY`, `formatOrderNumber`, `ORDER_QUERYABLE`, tipos de `list-query` | `lib/modules/pedidos/index.ts` |
| `ORDER_QUERYABLE.sortable = ['orderNumber','priority','status','createdAt','quantity','unitPrice']`; `filterable = { status:'select', priority:'select', createdAt:'dateRange' }`; **`searchable: false`** | `domain/order-queryable.ts:14-35` |
| `ListQuery` es `{ page, pageSize?, sort, filters, search }` y su esquema es `z.strictObject`: una clave de más rompe el `parse`; una de menos se rellena por defecto | `domain/list-query.ts:54-124` |
| `DataTableParams` de QC-55 es **campo a campo la misma forma** que `ListQuery`, y su `DataTableFilterValue` es copia literal de `ListFilterValue` | `data-table-types.ts:29-46`, `list-query.ts:41-63` |
| `DataTableColumn.cell` devuelve **`ReactNode`**, no `string`; `sortable`, `filter` y `pinnable` son opcionales | `data-table-types.ts:63-75` |
| `DataTable` pinta `column.cell(row.original)` directamente, **sin** `FlexRender`, y no registra ninguna capacidad de orden/filtro/paginación de cliente | `data-table.tsx:59-86,292-312` |
| El barrel de la tabla exporta `DataTable`, los tipos, `PAGE_SIZE_OPTIONS`, `createDefaultParams` y las transiciones `with*`. **No** exporta piezas internas | `components/shared/data-table/index.ts` |
| `PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE]` (10 y 25), derivadas de `lib/shared/pagination` | `data-table-params.ts:24` |
| `Table` de shadcn ya envuelve la tabla en `div.relative.w-full.overflow-x-auto`: el scroll horizontal **está contenido en la tabla** y no lo aporta esta pantalla | `components/ui/table.tsx:7-20` |
| **`DataTableFilters` monta SIEMPRE el campo de búsqueda**: no hay forma de suprimirlo | `data-table-filters.tsx:127-137` |
| **`usePinnedColumns` arranca SIEMPRE vacío**: no hay forma de declarar una columna fijada por defecto | `use-pinned-columns.ts:120-141` |
| `listRecipesAction(query: unknown)` acepta el contrato genérico (con `search`) desde QC-57; `listUnitsAction()` devuelve el catálogo entero | `recetas/adapters/driving/recipe-actions.ts:166`, `unidades/adapters/driving/unit-actions.ts:53` |
| `RecipeSummary` trae `id` y `name`; `UnitRef` trae `id`, `name`, `symbol` | `recetas/domain/recipe-view.ts:14-24`, `unidades/domain/unit-catalog.ts:8-12` |
| `product-picker.tsx` es el patrón exacto de selector con búsqueda al servidor, rebote de 250 ms y paginación dentro del desplegable, compuesto con `Button` e `Input` del CLI | `app/(private)/produccion/formulas/components/product-picker.tsx` |
| El layout privado **ya monta `<Toaster />`** (QC-22 R22); patrón lista+sheet+tres estados ya mergeado en `inventario` y `proveedores`; Playwright y `tests/helpers/viewport.ts` montados | `app/(private)/layout.tsx`, `app/(private)/proveedores/**`, `e2e/`, `tests/helpers/viewport.ts` |

**Conclusión operativa.** No falta nada por construir salvo la pantalla, sus componentes y **dos
huecos reales del componente compartido** (§6). Layout, sidebar, `<Toaster />`, tabla compartida,
Vitest, Playwright y las primitivas de shadcn/ui **se heredan y no se re-crean** (R47): por eso
`tasks.md` abre con **T0**, el mismo mecanismo que QC-11 puso tras el choque entre las features 4 y
10.

## 1. Archivos: qué se crea y qué se toca

```
lib/shared/routes.ts                     # EDITA: ORDERS_ROUTE + prefijo privado (R2, R4)
lib/shared/navigation/private-nav.ts     # EDITA: ORDERS_LABEL + item de nivel superior en «Operación» (R3)
lib/composition/route-role-rules.ts      # EDITA: cuarta fila ruta->rol, solo Administrador (R5)

components/shared/data-table/data-table-types.ts    # EDITA: dos props opcionales (§6.2, §6.3)
components/shared/data-table/data-table.tsx         # EDITA: cablea las dos props nuevas
components/shared/data-table/data-table-filters.tsx # EDITA: no monta la busqueda si `searchable === false`
components/shared/data-table/use-pinned-columns.ts  # EDITA: fijado inicial cuando no hay nada persistido
components/shared/data-table/index.ts               # SIN CAMBIOS: los tipos ya salen por aqui

app/(private)/pedidos/
  page.tsx                               # NUEVO. Server Component: metadata + searchParams + Suspense (R1, R21)
  components/
    index.ts                             # NUEVO. Barrel de la ruta (R40)
    order-list-params.ts                 # NUEVO. Parser/serializador puro URL <-> DataTableParams (R15,R16,R17,R18,R20)
    order-list-section.tsx               # NUEVO. Server Component async: llama listOrdersAction (R7,R21,R6)
    order-list-empty.tsx                 # NUEVO. Estado vacio propio de pedidos (R21)
    order-list-error.tsx                 # NUEVO. Estado error + reintento (R21,R6)
    order-list-skeleton.tsx              # NUEVO. Fallback del <Suspense> (R21)
    order-status-badge.tsx               # NUEVO. Estado y prioridad como etiqueta legible (R8)
    order-columns.tsx                    # NUEVO (CLIENTE). Columnas como datos, incluida la de acciones (R8..R12,R19,R23)
    order-table.tsx                      # NUEVO (CLIENTE). Monta <DataTable>, traduce params -> URL (R7,R13,R14,R15,R22)
    order-row-actions.tsx                # NUEVO (CLIENTE). Editar/cancelar/borrar por fila, con su deshabilitado (R23,R24)
    order-field.tsx                       # NUEVO. Campo con label + error accesible (R34,R45)
    order-form.tsx                       # NUEVO (CLIENTE). <form action> + useActionState (R26..R30,R33,R34,R39)
    order-sheet.tsx                      # NUEVO (CLIENTE). Panel lateral alta/edicion (R25,R35)
    recipe-picker.tsx                    # NUEVO (CLIENTE). Selector de receta con busqueda al servidor (R31)
    unit-select.tsx                      # NUEVO (CLIENTE). Selector de unidad, no controlado (R32)
    cancel-order-dialog.tsx              # NUEVO (CLIENTE). Dialogo con motivo obligatorio (R37)
    delete-order-dialog.tsx              # NUEVO (CLIENTE). Confirmacion nombrando el correlativo (R38)

tests/unit/pedidos-ui/**                 # NUEVO. Tests de la pantalla y guardias de convencion
tests/unit/shared/data-table*.test.tsx   # EDITA: casos nuevos de las dos props (§6.2, §6.3)
e2e/pedidos.spec.ts                      # NUEVO. Camino completo + rechazo del no-Administrador (R48,R49)
```

**Los archivos ajenos que se editan son exactamente los que R46 autoriza**, más los cuatro de
`components/shared/data-table/` que §6 justifica uno a uno. Cualquier otro archivo ajeno que una
task pida abrir —y en particular `lib/modules/**` y `db/**`— es señal de **parar y avisar al
leader** (R46).

## 2. La constante de ruta y el ítem de navegación (R2, R3)

`lib/shared/routes.ts` gana, siguiendo literalmente el patrón que ya escribieron `INVENTORY_ROUTE`,
`FORMULAS_ROUTE` y `SUPPLIERS_ROUTE`:

```ts
export const ORDERS_ROUTE = '/pedidos';
```

Vive **en `lib/shared/routes.ts` y no en `private-nav.ts`** porque el middleware y la regla ruta→rol
la necesitan y no pueden depender de la navegación, que arrastra etiquetas, iconos y agrupación de
UI (el porqué ya está escrito en el repo para las otras tres constantes y **no se re-decide**). Nace
aquí, no se muda, así que **no hace falta reexport de compatibilidad**.

**No hay helper de ruta de detalle**: no hay página de detalle (R1). El único derivado es la cadena
de consulta de la lista, que construye `order-list-params.ts` (§5).

El nombre de la carpeta (`pedidos/`) es el único punto donde la URL aparece como texto por
obligación del framework. Como en QC-22, QC-26 y QC-44, **R2 se comprueba derivando** la ruta
esperada de la constante (`app/(private)${ORDERS_ROUTE}/page.tsx`) y afirmando que el archivo
existe, más una guardia de fuente de que ningún archivo de la feature contiene el literal
`'/pedidos'`.

**El ítem de navegación (R3).** `private-nav.ts` gana `export const ORDERS_LABEL = 'Pedidos';` y un
`NavLink` de **nivel superior** en `NAV_SECTION_OPERATION`, con `icon: 'clipboard-list'` —que ya
existe en `NavIconName` y en `NAV_ICONS`, así que no se añade ningún icono— y
`testId: 'nav-pedidos'`. Va en «Operación» y no en «Cadena» por decisión humana: un pedido es
producción, no cadena de suministro. El test itera `PRIVATE_NAV_ITEMS` y afirma sobre `ORDERS_ROUTE`,
`ORDERS_LABEL` y el `testId`, nunca sobre el literal del copy (R44).

## 3. Protección: prefijo y regla ruta→rol (R4, R5, R6)

1. **`PRIVATE_ROUTE_PREFIXES` gana `ORDERS_ROUTE`.** Sin esto,
   `guard-rutas-privadas-cubiertas.test.ts` pone el gate en rojo nombrando `/pedidos` en cuanto
   exista la `page.tsx` — y con razón: `(private)` no aparece en la URL, así que la pantalla se
   serviría **sin sesión**.
2. **`ROUTE_ROLE_RULES` gana su cuarta fila**: `{ prefix: ORDERS_ROUTE, roles: [ADMIN_ROLE_NAME] }`.
   Se reutiliza el `ADMIN_ROLE_NAME` que ese archivo ya importa del barrel de `inventario`: **no** se
   añade un segundo import del mismo valor desde el barrel de `pedidos` y **no** se escribe un
   literal nuevo del rol.
3. **Ese archivo carga en el borde.** La fila nueva solo añade una constante de `lib/shared/routes`,
   que ya está en su cierre de imports. `guard-middleware-edge.test.ts` lo comprueba.

**R6, escrito aquí porque un rol en una cookie invita al error contrario:** la regla ruta→rol **no
autoriza nada** (QC-9 R29). Los seis casos de uso de `pedidos` llaman a `requireAdmin` como primera
línea y **ése** es el corte real. La pantalla no repite `requireAdmin`, no lee la sesión para decidir
qué renderiza y no oculta columnas por rol: si una action responde `code: 'unauthorized'`, se pinta
el estado de error (R21). Consecuencia deliberada: si alguien borrase la regla ruta→rol, la pantalla
se vería pero **no mostraría ni un dato**.

## 4. Contratos de entrada y salida

| Contrato | Valor |
| --- | --- |
| Props de la página | `searchParams: Promise<Record<string, string \| string[] \| undefined>>` |
| Lista | `listOrdersAction(query)` → `OrderListResult` (`Page<OrderSummary>`) |
| Ficha (precarga de edición) | `getOrderAction(id)` → `OrderQueryResult` (`OrderView`) |
| Alta | `createOrderAction(prevState, formData)` → `CreateOrderFormState` (`{ status:'success'; id; numberText }`) |
| Edición | `updateOrderAction(id, prevState, formData)` → `OrderMutationFormState` |
| Cancelación | `cancelOrderAction(prevState, formData)` con `id` y `reason` en el formulario → `OrderMutationFormState` |
| Borrado | `deleteOrderAction(prevState, formData)` con `id` en campo oculto → `OrderMutationFormState` |
| Recetas | `listRecipesAction({ page, pageSize, search })` → `Page<RecipeSummary>` |
| Unidades | `listUnitsAction()` → `readonly UnitRef[]` |
| Modelo de datos, tablas, RLS, migraciones | **NO APLICA**: cero cambios en `db/` (R46). El esquema de `orders`, sus dos enums, su secuencia por año y su RLS forzada son de QC-33 y QC-34, ya mergeados con `down.sql` |
| Integraciones externas / variables de entorno | **Ninguna nueva** |

**Nombres de los campos del `FormData`** —los fija el adaptador driving y basta con leerlos (§0):
`recipeId`, `quantity`, `unitId`, `unitPrice`, `priority`; más `status` en la edición; `id` y
`reason` en la cancelación; `id` en el borrado. **La prioridad ausente es ausencia y la prioridad
vacía es error** (`readOptionalFormString`), así que el formulario **siempre** emite un valor válido:
por eso R27 exige el defecto *visible*, no implícito.

**`useActionState` y el `id`.** `updateOrderAction` tiene la firma `(id, prevState, formData)`, que
no es la que `useActionState` espera. Se resuelve con `updateOrderAction.bind(null, order.id)` en el
componente cliente —el patrón estándar de React— y no cambiando nada del módulo (R46). Cancelación y
borrado no lo necesitan: el `id` viaja en un `input` oculto, tal como su código documenta.

**El literal `{ status: 'idle' }`** lo construye el cliente con el tipo exportado: un archivo
`'use server'` no puede exportar constantes (§0).

## 5. El estado de lista: URL ↔ `DataTableParams` ↔ `ListQuery`

**El estado de lista vive en la cadena de consulta, no en React.** Así recargar, compartir el enlace
o volver con «atrás» conserva página, orden y filtros, que es justo lo que R25 exige al cerrar el
panel lateral: la lista **es** su URL, no hay estado que restaurar.

`order-list-params.ts` es puro y testeable sin DOM:

```
parseOrderListParams(searchParams) -> DataTableParams
buildOrderListQuery(params)        -> string
```

Codificación, explícita y legible (nada de serializar JSON en la URL):

| Clave | Forma | Acotación (R18) |
| --- | --- | --- |
| `page` | entero ≥ 1 | cualquier otra cosa → 1 |
| `pageSize` | 10 o 25, **importados de `PAGE_SIZE_OPTIONS`** | cualquier otra cosa → `DEFAULT_PAGE_SIZE` |
| `sort` | `campo:asc` \| `campo:desc` | campo fuera de `ORDER_QUERYABLE.sortable` o dirección desconocida → sin orden |
| `status` | lista separada por comas | valores fuera de `ORDER_STATUS_VALUES` se descartan; lista vacía → sin filtro |
| `priority` | lista separada por comas | valores fuera de `ORDER_PRIORITY_VALUES` se descartan; lista vacía → sin filtro |
| `createdFrom` / `createdTo` | fecha ISO | vacío o no parseable → ese extremo a `null`; los dos a `null` → sin filtro |
| `search` | **no se lee ni se escribe nunca** | R20 |

**Los conjuntos válidos se importan del contrato público, no se escriben a mano**: si mañana aparece
un quinto estado, la pantalla lo acepta sin tocarse. Acotar es de esta capa; validar sigue siendo del
dominio, que además **no falla** ante un campo no declarado: lo omite y lo registra (QC-57 R5). Se
acota igual **por no depender de esa cortesía** y para que la URL que el usuario ve sea la que la
consulta usa.

**El paso a la consulta es directo.** `DataTableParams` y `ListQuery` tienen los mismos cinco campos
con los mismos tipos (§0), así que `listOrdersAction(params)` recibe exactamente lo que
`createListQuerySchema()` —un `z.strictObject`— espera, sin traducción y sin claves de más. `search`
va **siempre** como `''`, que es «sin búsqueda» (R20).

**Emitir → navegar.** `order-table.tsx` es cliente y pasa a `<DataTable>` un `onParamsChange` que
hace `router.push(`${ORDERS_ROUTE}?${buildOrderListQuery(next)}`)`. El servidor vuelve a renderizar
`OrderListSection`. La tabla compartida **solo emite** (QC-55 R2, R13) y no filtra ni ordena en
cliente: eso es lo que hace verdad a R13 y R15.

**Los tres estados (R21).**

```tsx
<Suspense key={buildOrderListQuery(params)} fallback={<OrderListSkeleton pageSize={params.pageSize} />}>
  <OrderListSection params={params} />
</Suspense>
```

La `key` es lo que hace reaparecer el esqueleto en **cada** cambio de página, orden o filtro; sin
ella Next reutiliza el límite y el usuario se queda mirando el resultado anterior. `OrderListSection`
es un Server Component `async` que llama a `listOrdersAction` **una sola vez** —nunca
`getOrderAction` por fila— y despacha a error / vacío / tabla, con el caso «`items` vacío con
`page > 1`» resuelto como enlace a la primera página, igual que `product-list-section.tsx`.

**Los tres estados se pintan fuera de `<DataTable>`, no con su `status`.** La tabla compartida recibe
siempre `status: 'idle'` y filas ya resueltas: el vacío y el error de esta pantalla necesitan copy y
acciones propias (crear el primer pedido, reintentar) y el «cargando» lo aporta el `<Suspense>` del
servidor, que es lo que el repo ya usa. `resolveDataTableState` sigue siendo quien despacha dentro
del componente compartido; esta pantalla no reimplementa su lógica, simplemente no la alimenta con
estados que no tiene.

## 6. Las tres deudas de QC-55, que esta ficha hereda por ser el primer consumidor

### 6.1 P1 — Cómo se declara una columna de ACCIONES: **se resuelve sin tocar el componente**

Es la pregunta abierta 4 de QC-55 y el bloqueo declarado de QC-56. **Leído el código, ya está
resuelta por el contrato**: `DataTableColumn.cell` devuelve `ReactNode` —no `string`— y
`data-table.tsx` lo pinta con `column.cell(row.original)` directamente, sin `FlexRender` (§0). Una
columna de acciones es, por tanto, **una columna normal**:

```ts
{ id: 'actions', label: …, align: 'end', pinnable: false, cell: (order) => <OrderRowActions order={order} /> }
```

Sin `sortable` (no ordena) y sin `filter` (no aparece en la barra de filtros), y `pinnable: false`
para que el usuario no la fije y tape la de correlativo. **Consecuencia real y declarada:** una
configuración de columnas con celdas interactivas contiene funciones y elementos, así que **no puede
cruzar la frontera servidor→cliente**; por eso `order-columns.tsx` es un módulo **de cliente** y
`OrderListSection` (servidor) le pasa solo datos serializables. Es exactamente el reparto que R43
pide.

**Esto es lo que QC-56 va a adoptar**, y por eso queda escrito aquí en vez de en un comentario del
componente. No se añade ninguna prop `renderRowActions` al componente compartido: sería una segunda
manera de hacer lo que `cell` ya hace.

### 6.2 La barra monta SIEMPRE una caja de búsqueda, y esta pantalla no la lleva

`DataTableFilters` renderiza `DataTableSearchField` incondicionalmente (§0). La decisión cerrada de
esta ficha dice que **la barra no monta caja de búsqueda** (R20). No hay forma de cumplir las dos sin
tocar `components/shared/data-table/`, así que se toca, y se dice en el PR (P1 lo autoriza
expresamente):

- `DataTableProps` gana `readonly searchable?: boolean` (**ausente = `true`**, para que ningún
  consumidor futuro cambie de comportamiento);
- `DataTable` se lo pasa a `DataTableFilters`, que **no renderiza el campo** cuando es `false`.

`DataTableTexts` **no se toca**: sus campos siguen siendo obligatorios, así que la pantalla entrega
igualmente un `texts.search` que no se pinta. Es el diff mínimo; hacer opcional un campo del contrato
de textos afectaría a todos los consumidores futuros para ahorrar una cadena. Se añade su caso a
`tests/unit/shared/data-table-filters.test.tsx`: con `searchable: false` no existe
`data-table-search`; sin la prop, sí.

### 6.3 No hay forma de fijar una columna por defecto

`usePinnedColumns` arranca en `EMPTY_PINNING` siempre y solo restaura de `localStorage` (§0). La
decisión cerrada dice que **la columna del correlativo va fijada** (R19), y «fijada» no puede
significar «si al usuario se le ocurre fijarla». Segundo cambio al componente compartido, también
declarado en el PR:

- `DataTableProps` gana `readonly defaultPinnedColumns?: readonly string[]` (lado izquierdo);
- `usePinnedColumns(tableId, columnIds, defaultPinned)` lo usa **solo cuando no hay nada persistido**
  para ese `tableId`, dentro del mismo efecto de restauración —nunca en render, para no reintroducir
  la discrepancia de hidratación que su cabecera documenta—.

Así QC-55 R25 y R26 siguen intactos: el usuario puede soltar la columna y su decisión se recuerda.
Se añade su caso a `tests/unit/shared/data-table.test.tsx`.

### 6.4 P2 y P3 — se arrastran, y por qué

- **Ancho de columna (P2).** `DataTableColumn` no lo expone y todo cae en los 150 px por defecto de
  la librería. Esta pantalla tiene tres columnas angostas (correlativo, estado, prioridad) y dos
  anchas (receta, motivo). Se comprueba en viewport angosto y ancho (R45); **si el resultado es
  inservible, se para y se avisa**: la salida sería una prop de ancho en el componente compartido, y
  eso es un tercer cambio a QC-55 que el humano decide, no una decisión de implementación.
- **`focusColumnFilter` sin acotar por `tableId` (P3).** Esta pantalla monta **una sola** tabla, así
  que no puede destaparla. Se arrastra sin tocarla.

## 7. Columnas (R8–R12, R19, R23)

`order-columns.tsx` declara las columnas **como datos**, en este orden:

| `id` | Contenido | Ordenable | Filtro | Notas |
| --- | --- | --- | --- | --- |
| `orderNumber` | `formatOrderNumber(order.number)` | sí | — | **fijada por defecto** (§6.3) |
| `status` | etiqueta legible del estado | sí | `select` con `ORDER_STATUS_VALUES` | |
| `priority` | etiqueta legible de la prioridad | sí | `select` con `ORDER_PRIORITY_VALUES` | |
| `recipeName` | nombre, o marcador si `null` | no | — | R9 |
| `quantity` | cadena tal cual | no | — | R39 |
| `unitName` | nombre, o marcador si `null` | no | — | R9 |
| `unitPrice` | cadena tal cual | no | — | R39 |
| `createdAt` | fecha de solicitud | sí | `dateRange` | R12, R14 |
| `cancellationReason` | motivo, o marcador de ausencia | no | — | R11 |
| `actions` | `<OrderRowActions>` | no | — | `pinnable: false` (§6.1) |

**Las cuatro ordenables son exactamente `ORDER_QUERYABLE.sortable` menos `quantity` y `unitPrice`**,
que la decisión cerrada no pide: declarar `sortable: true` en una columna cuya cabecera nadie
acordó sería inventar alcance. El test de R12 lo afirma en positivo y en negativo.

**No hay columna de total** (R8, R39) y **no hay columna de creador ni de modificador** (R8): la vista
trae ids y resolverlos exige consumir el contrato de `identity`, que esta ficha no abre. El test de
R8 es doble: en positivo sobre las diez columnas declaradas, y en negativo recorriendo la
configuración para comprobar que ninguna clave es `total`, `createdBy` ni `updatedBy`.

**Estado y prioridad se pintan por su etiqueta legible** (`order-status-badge.tsx`), derivada de los
valores del contrato con un mapa exhaustivo tipado: un quinto estado rompería el `typecheck` en vez
de pintar un hueco.

## 8. Formulario, panel lateral y acciones de fila (R23–R36)

**Un solo componente de formulario en dos modos** (`OrderForm`), dentro de un `sheet` de shadcn/ui.
El patrón es el de `product-form.tsx` y `supplier-form.tsx`, ya mergeados:

- `<form action={formAction}>` **no controlado**, `useActionState(action, { status: 'idle' })`, y
  `isPending` para deshabilitar el envío.
- **La validación previa usa los esquemas del contrato público** (`createOrderSchema`,
  `updateOrderSchema`), importados del **barrel** de `pedidos`, que es client-safe (§0). No se
  reescribe ninguna regla: el patrón decimal, el «mayor que cero» de la cantidad, el cero admitido en
  el precio y los conjuntos cerrados son del esquema. El servidor revalida igual: el cliente nunca es
  la frontera.
- **Ninguna dependencia nueva** (R33, R42): no entra `react-hook-form`, no se corre `shadcn add form`.
- **En modo edición** aparece el selector de estado, con `EDITABLE_STATUS_VALUES` —que **excluye
  `CANCELADO` por construcción**, derivado y no escrito a mano (§0)—. En modo alta **no hay** selector
  de estado (R26): el alta siempre nace `PENDIENTE` y lo pone el caso de uso.

**Traducción de errores por `code`, nunca por texto (R34).** El mapa vive en un solo sitio:

| `code` | Dónde se pinta |
| --- | --- |
| `recipe_not_found` | junto al selector de **receta** |
| `unit_not_found` | junto al selector de **unidad** |
| `invalid_input` | junto al campo cuando el esquema del cliente ya lo señaló; si no, en la región `role="alert"` del formulario |
| `invalid_transition` | junto al selector de **estado**, en la edición |
| `not_cancellable` | región del diálogo de cancelación |
| `not_deletable` | región del diálogo de borrado |
| `not_found` | región del formulario o del diálogo, con invitación a recargar la lista |
| `duplicate_number` | región del formulario |
| `unauthorized` | región del formulario o del diálogo |

**Éxito (R35).** Se cierra el panel, `toast.success(...)` sobre el `<Toaster />` que el layout ya
monta (R36: **no se monta otro**; el test lo comprueba renderizando layout + pantalla y contando
regiones) y `router.refresh()`, que vuelve a ejecutar el Server Component de la lista. **No se llama
a `revalidatePath`**: exigiría abrir `lib/modules/pedidos/adapters/driving/`, que R46 prohíbe; las
propias actions dejaron escrito que «QC-35 decide qué revalida», y lo decide **en la pantalla**.

**Acciones de fila y estados finales (R23, R24).** `OrderRowActions` recibe la fila por props y
calcula un único predicado, `isFinal = status === 'ENTREGADO' || status === 'CANCELADO'`, derivado de
los valores del contrato. Si es final, los tres controles van `disabled` con su motivo visible —no
solo `title`, que en táctil no existe (R45)— y **no se monta ningún diálogo**. La pantalla
**anticipa** la regla; el backend la impide igual (`invalid_transition`, `not_cancellable`,
`not_deletable`), y por eso el mapa de errores de arriba sigue existiendo: anticipar no es confiar.

**Cancelación (R37).** Diálogo propio con un campo de motivo, `id` en oculto, validado con
`cancelOrderSchema` del contrato (recorte, mínimo 1, tope 500) antes de enviar. El botón de confirmar
está deshabilitado mientras el motivo esté vacío, y el test comprueba en negativo que
`cancelOrderAction` **no se invoca**. Es el único camino a `CANCELADO`: `updateOrderAction` no puede
ni formularlo (§0).

**Borrado (R38).** `alert-dialog` que nombra el pedido **por su correlativo** —`formatOrderNumber`,
nunca el uuid— y advierte de que no se puede deshacer. En base es borrado lógico, pero el backend no
expone forma de restaurar: para el usuario es irreversible y se presenta como tal.

## 9. Los dos selectores del formulario

### 9.1 Receta, con búsqueda al servidor (R31)

`recipe-picker.tsx` es **copia de forma** de `product-picker.tsx` (§0), no de contenido: `Button` e
`Input` del CLI compuestos a mano, rebote de 250 ms, paginación **dentro** del desplegable y la
búsqueda resuelta con `listRecipesAction({ page, pageSize: MAX_PAGE_SIZE, search })`. Ni un `.filter(`
por texto sobre los items descargados: filtrar en cliente solo miraría la página cargada y mentiría
sobre el catálogo. Es posible porque **QC-57 le dio `search` a `recetas`**; antes del 2026-09-06 no
lo era.

**No se promueve `ProductPicker` a `components/shared/`**: consulta otro catálogo y otro tipo de
opción, y `docs/architecture.md > Regla: sin sobre-ingeniería` pide promover cuando dos features lo
necesitan **con la misma API**, que no es el caso. Se comparte el patrón, no el archivo.

> **Enmienda 2026-10-08 (QC-233):** el párrafo anterior queda sin efecto. Desde QC-233 los seis
> buscadores asíncronos, `ProductPicker` y `RecipePicker` incluidos, pintan su campo y su
> desplegable a través de `components/shared/async-autocomplete.tsx`. Cada uno conserva en su
> archivo su consulta, su regla de elección y sus piezas de campo
> (`specs/QC-233-componentizacion-buscadores/requirements.md > R6, R18`).

La primera página llega **por props** (R43): la pide una vez `OrderSheet`/la sección de servidor y
baja al selector, igual que hace la página de receta con sus ingredientes.

### 9.2 Unidad, sin alta (R32)

`unit-select.tsx` es **no controlado**: el `sheet` usa `<form action>`, así que el valor viaja en el
`FormData` con el nombre `unitId`, no en estado de React. `UnitPicker` de QC-26 **no sirve tal cual**
—es controlado (`value`/`onChange`)— y `UnitSelect` de QC-44 vive dentro de la ruta de proveedores y
admite «sin unidad», que aquí **no** es válido: `createOrderSchema` exige un uuid. Se escribe el de
esta ruta, con `symbol` cuando existe y `name` cuando no, sin opción vacía y **sin alta de unidad**
(eso es QC-38 y su pantalla QC-39). Las unidades llegan **por props** desde el servidor con una sola
llamada a `listUnitsAction()` (R43).

## 10. Importes (R39)

`quantity` y `unitPrice` viajan como **cadena decimal** de punta a punta:

- El control es `type="text"` con `inputMode="decimal"` y el patrón del esquema; **nunca
  `type="number"`**, porque el valor de un input numérico de HTML pasa por el binario de coma
  flotante.
- La celda de la tabla pinta la cadena **tal cual la entrega la consulta**. Sin `Intl.NumberFormat`,
  sin `toFixed`, sin división ni multiplicación, y **sin total**: el total lo calculará el servidor en
  QC-68 y llegará hecho.
- El test de R39 es doble: uno de comportamiento (escribir `0.1005` y comprobar que la action recibe
  exactamente esa cadena) y una guardia de fuente de que en la ruta no aparecen `parseFloat(`,
  `Number(` ni `toFixed(` sobre cantidad o precio, ni `type="number"` en esos dos campos.

## 11. Modelo de datos, RLS y migraciones

**NO APLICA, y se declara en vez de omitirse.** Cero cambios en `db/` (R46): `orders`, sus dos enums,
su secuencia de correlativo por año, sus `CHECK` y su RLS forzada son de QC-33 y QC-34, mergeadas con
su `down.sql`. Esta feature no añade ninguna columna, índice, restricción ni migración, y no lee ni
escribe ningún dato de negocio fuera de las Server Actions de los módulos.

## 12. Dependencias de terceros

**Ninguna nueva** (R33, R42). Las primitivas de shadcn/ui que hacen falta —`table`, `select`,
`sheet`, `alert-dialog`, `dropdown-menu`, `sonner`, `button`, `input`, `label`, `textarea`,
`skeleton`— **ya están en el repo** desde QC-11, QC-22, QC-44 y QC-55; `@tanstack/react-table` entró
aprobada con QC-55 y esta ficha la usa **solo a través** del componente compartido. Si al montar el
diálogo de cancelación faltara `textarea`, se añade por CLI y **se compara `package.json` antes y
después**; si el CLI añadió una entrada, se **para y se avisa** (regla 7 de `CLAUDE.md`;
`tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría en rojo igualmente).

**No se propone ninguna librería**, y en particular **no entra `decimal.js`**: la pantalla no hace
aritmética (R39) y el total lo calculará el servidor con el decimal que Prisma ya opera (decisión
cerrada). Los cuatro checks de `docs/architecture.md > Dependencias de terceros` **no se rellenan
para ninguna librería porque no se propone ninguna**; si la implementación descubriera que hace
falta una, el `frontend_dev` **para, escribe los cuatro checks y la propone** — no la instala.

## 13. E2E (R48, R49)

`e2e/pedidos.spec.ts`, sobre el patrón ya mergeado de `e2e/inventario.spec.ts`, `e2e/recetas.spec.ts`
y `e2e/proveedores.spec.ts`: fixtures propios con prefijo `qc35_e2e_`, `RUN_ID` por worker, limpieza
de huérfanos por edad y borrado en `afterAll`. Dos recorridos:

1. **Camino completo del Administrador (R48):** login → `ORDERS_ROUTE` → alta de pedido (receta
   tomada del selector con búsqueda, cantidad y precio decimales, prioridad por defecto visible) →
   el pedido aparece en la lista con su correlativo → cancelarlo con un motivo que lleva el `RUN_ID`
   → el motivo se ve en su fila.
2. **Rechazo del no-Administrador (R49):** sesión válida con otro rol pide `ORDERS_ROUTE` y acaba
   fuera, sin ver la lista.

Los asserts filtran **por el correlativo devuelto en el alta y por el motivo con `RUN_ID`**, nunca
por «la primera fila» ni por totales: Chromium y WebKit corren a la vez. El recorrido 1 necesita al
menos una receta y una unidad vivas: las crea el propio fixture con prefijo, o **para y avisa** si la
base de E2E no permite crearlas.

## 14. Alternativas descartadas (y por qué)

**A — Copiar el esqueleto de tabla de `proveedores` en vez de estrenar la tabla compartida.** Cero
riesgo de tocar código ajeno. **Descartada por decisión humana del 2026-09-06**, y el motivo también
es técnico: QC-55 lleva mergeada desde el 2026-09-04 **sin un solo consumidor**, y un componente
compartido que nadie usa es un componente que nadie sabe si funciona. Además, esta pantalla necesita
orden por cabecera, filtros y fijado de columna, que el esqueleto copiado **no tiene**: replicarlos a
mano sería reimplementar QC-55 entera en una ruta.

**B — Añadir al componente compartido una prop `renderRowActions` para la columna de acciones.**
Parecía la respuesta a P1. **Descartada:** `cell` ya devuelve `ReactNode` (§6.1), así que sería una
segunda manera de hacer lo mismo, y la primera consecuencia sería que dos consumidores declararan sus
acciones de forma distinta. La solución es documentar el mecanismo que ya existe, que es lo que QC-56
necesita.

**C — Dejar la caja de búsqueda montada pero inerte.** Cero cambios en QC-55. **Descartada por
decisión humana**, con el motivo escrito en el alcance: una caja que no hace nada miente, y si se
cableara al `search` de la consulta mentiría peor —`ORDER_QUERYABLE.searchable` es `false`, así que
el término se omitiría en silencio y la lista devolvería todo como si no se hubiera buscado—.

**D — Buscar o filtrar los pedidos en el cliente.** **Descartada por decisión humana**, con el motivo
técnico: la tabla compartida solo tiene cargada la página visible, así que filtrar el array
descargado solo miraría esa página. Es una función que miente. La búsqueda por nombre de receta es
trabajo de backend y va en QC-68.

**E — Esperar a QC-68 para que la lista naciera con búsqueda y columna de total.** **Descartada por
decisión humana del 2026-09-06:** encadenaría esta pantalla a una ficha que hoy no está hecha, y el
coste de enchufarlas después es una columna y un control, no un rediseño.

**F — Cambiar el estado desde la lista, con un desplegable por fila.** Ahorra abrir el panel.
**Descartada por decisión humana:** pasar a `ENTREGADO` cierra el pedido para siempre —no se edita,
no se cancela, no se borra— y no hay flujo de devolución (P4). Un desplegable de una pulsación para
una acción irreversible, además con un sitio distinto donde presentar `invalid_transition`, es cómo
se pierde un pedido sin querer.

**G — Reordenar la lista en el cliente para el orden por defecto.** **Descartada:** el orden por
defecto —prioridad y luego antigüedad— ya lo aplica el adaptador driven, y reordenar la página
descargada daría un orden falso en cuanto haya más de una página. `DATA_TABLE_FEATURES` ni siquiera
registra ordenación de cliente (§0), así que la tabla pinta las filas tal cual llegan.

**H — Guardar el estado de lista en React (`useState`) en vez de en la URL.** Menos código de
parseo. **Descartada:** al cerrar el panel lateral o al volver con «atrás» se perdería la página, el
orden y los filtros, que es exactamente lo que R25 prohíbe; y el enlace dejaría de ser compartible.
El repo ya resolvió esto en QC-22 y QC-44 con la cadena de consulta.

**I — Serializar `DataTableParams` como JSON en un solo parámetro de la URL.** Trivial de escribir.
**Descartada:** la URL deja de ser legible y de poder escribirse a mano, y cualquier basura en ese
parámetro obligaría a un `try/catch` que decide entre «acotar» y «fallar». Las claves explícitas de
§5 se acotan campo a campo y nunca fallan (R18).

**J — Una página de detalle del pedido.** Simétrica con QC-44. **Descartada por decisión humana:**
del pedido no cuelga nada —no tiene líneas, ni catálogo, ni sublista paginada—, así que la página de
detalle estaría vacía salvo por los mismos datos que ya muestra la fila.

**K — Formulario controlado, como el de recetas.** **Descartada por el contrato, no por gusto:** las
actions de pedidos reciben `(prevState, FormData)`, que es justo la firma de `useActionState`, y el
pedido son cinco campos planos sin listas anidadas. El patrón no controlado es el más barato y ya
está probado en `product-form.tsx` y `supplier-form.tsx`.

**L — `react-hook-form` + `shadcn add form`.** **Descartada:** son entradas nuevas en `package.json`
bajo la regla 7, y la tabla de decisiones de esta ficha las veta expresamente remitiendo a QC-22 P2.

**M — Resolver el nombre de la receta y el de la unidad desde la pantalla.** **Descartada:**
`OrderView` ya los trae resueltos, con **una** consulta a cada catálogo por página hecha en el caso
de uso (QC-34 R43, R45). Pedirlos otra vez serían hasta 25 consultas por página para obtener el dato
que ya está en la mano.

**N — Mostrar el nombre de quien creó o modificó el pedido.** El dato (el id) está en la vista.
**Descartada por decisión humana:** resolver ids a nombres exige consumir el contrato público de
`identity`, trabajo nuevo que la ficha del board no pide. Mismo criterio que QC-22 y QC-44.

**O — Declarar `ORDERS_ROUTE` en `private-nav.ts`.** Ahorra tocar un archivo. **Descartada por
decisión humana**, con el mismo argumento ya escrito en el repo para las otras tres constantes: el
middleware y la regla ruta→rol no pueden depender del módulo de navegación.

**P — Colgar «Pedidos» del grupo «Producción» en la sección «Cadena».** **Descartada por decisión
humana del 2026-09-06:** un pedido es operación, no cadena de suministro, y esconderlo bajo un grupo
lo alejaría de Inventario, que es donde el usuario lo va a buscar.

**Q — Alimentar `<DataTable status>` con `'loading'`/`'error'` en vez de pintar los tres estados
fuera.** Usa más del componente compartido. **Descartada:** el vacío y el error de esta pantalla
llevan acción propia (crear el primer pedido, reintentar) y copy propio, y el «cargando» ya lo da el
`<Suspense>` del servidor, que es el mecanismo del repo. Alimentar `status` obligaría a mantener un
estado de carga en cliente en paralelo al del servidor: dos verdades sobre lo mismo.

## 15. Riesgos y cómo se mitigan

1. **La guardia de rutas privadas pone el gate en rojo** en cuanto exista la `page.tsx` sin el
   prefijo. Por eso la task de constante + prefijo + regla de rol va **antes** que la página.
2. **Tocar `components/shared/data-table/` rompe a QC-55.** Mitiga: las dos props son **opcionales y
   con el comportamiento actual por defecto** (§6.2, §6.3), y la suite de `tests/unit/shared/
   data-table*` tiene que seguir verde **sin modificar un solo test existente**; si alguno hay que
   cambiarlo, se **para y se avisa**.
3. **Conflicto de archivos con QC-56**, que migra productos y recetas a la misma tabla compartida. Lo
   vigila el leader (`AGENTS.md > Paralelismo`) con la lista de archivos de `tasks.md`. Si QC-56 está
   en vuelo sobre `components/shared/data-table/`, esta feature **para y avisa** antes de T2.
4. **P2 (ancho de columna) hace la tabla inservible en angosto.** Mitiga la comprobación explícita de
   R45 en su task; la salida es una tercera prop en QC-55 y **la decide el humano**.
5. **El estado de lista y la consulta se desincronizan.** Mitiga que `DataTableParams` se pase
   **entero y sin traducir** a la action (§5) y el test de ida y vuelta `parse(build(params)) ===
   params`.
6. **Colar el `id` en `useActionState`.** Si `bind` no encajara con la firma real al implementar, se
   **para y se avisa**: la salida no es tocar el adaptador driving de QC-34.
7. **El E2E ensucia la base y pone rojo un test de integración ajeno** (le pasó a QC-9). Mitiga el
   patrón de prefijos `qc35_e2e_` y la limpieza en `afterAll`.
8. **`dev` no compila hoy** por dos tests de integración de QC-57 que crean usuarios sin `companyId`
   (QC-47 lo hizo obligatorio seis minutos después). **No es de esta feature y no se arregla aquí**;
   queda anotado para que su gate rojo no se lea como un fallo de QC-35.
