# QC-56 — migrar-listas-a-tabla-compartida · design.md

> Zona `frontend` · complejidad `medium`. Sin tablas, sin migraciones, sin RLS, sin rutas nuevas y
> sin dependencias. Todo lo citado con `archivo:línea` se leyó en el worktree el 2026-09-15.

## 0. Hallazgos que contradicen la semilla o que el humano debe decidir (NO resueltos)

Se escriben aquí porque `spec_author` no reabre decisiones cerradas. Cada uno dice qué choca, con
qué evidencia y qué tareas quedan bloqueadas hasta F1.4.

### H1 — La decisión 5 choca con la implementación de referencia de la decisión 2

- **D5** dice: «la pantalla trae los datos y los pasa por props; **la tabla pinta los tres estados**».
- **D2** dice: «se igualan a productos», y productos **no** lo hace así. Las tres pantallas ya
  migradas pintan el error y el vacío **fuera** de `<DataTable>` y le pasan siempre `status="idle"`:
  - productos: `product-list-section.tsx:45-63` y `product-table.tsx:156`;
  - catálogo de proveedor: `catalog-list-section.tsx:57-77` y `catalog-table.tsx:184`;
  - pedidos: `order-list-section.tsx:199-221`. Su `design.md:549-553` **descartó** a propósito
    alimentar `status` con esta razón: «el vacío y el error llevan acción propia y copy propio, y el
    cargando ya lo da el `<Suspense>` del servidor».
- **Qué se pierde si D5 se aplica al pie de la letra** (variante A):
  1. `DataTableError` solo recibe `texts.error` y un `errorMessage` de **texto**
     (`data-table-states.tsx:49-76`). No puede pintar **reintentar**, ni el **código**, ni la
     referencia de petición del error inesperado (`UnexpectedErrorNotice`, QC-71 R17). R19 lo exige.
     Cumplir R19 con la variante A **obliga a tocar el componente compartido**, por ejemplo con una
     prop de contenido de error. Eso necesita aprobación explícita.
  2. `DataTableLoading` pinta 5 filas fijas (`data-table-states.tsx:79, 95`), y `DataTable` no le
     pasa `rowCount` (`data-table.tsx:259`). Hoy el esqueleto pinta tantas filas como el tamaño de
     página y hay test que lo afirma (`recipe-page.test.tsx:512`). Mantenerlo también exige tocar el
     componente. La otra salida es aceptar las 5 filas y cambiar el test.
  3. Lo que la variante A **gana**: con `rows=[]` y sin error, la tabla sigue montando la barra de
     búsqueda (`data-table.tsx:240-254`). Una búsqueda sin resultados **no hace desaparecer la caja
     de búsqueda**, que es lo que hoy pasa en productos (pregunta abierta 3).
- **Variante B (igual que productos):** error y vacío fuera de la tabla, con sus componentes propios.
  El esqueleto propio sigue como `fallback` del `<Suspense>`. No toca el componente, pero **incumple
  R20 tal como está escrito** (que sale de D5) y **choca con R30** (ver H3).
- **Tareas bloqueadas hasta decidir:** T8 y T9, y con ellas T10, T12, T15, T16 y T17.

### H2 — `SUPPLIER_QUERYABLE` no se publica por el barrel de `proveedores`

- `lib/modules/proveedores/index.ts:29` solo exporta `SUPPLIER_CATALOG_LINE_QUERYABLE`.
  `RECIPE_QUERYABLE` sí sale por el suyo (`lib/modules/recetas/index.ts:28`).
- R11 obliga a derivar lo ordenable de la lista blanca publicada, y `app/**` no puede importar
  `domain/**` por ruta profunda (`docs/architecture.md > La regla de dependencias`). Hace falta
  **una línea** de export en `lib/modules/proveedores/index.ts`.
- D11 dice «el backend ya soporta todo». La línea no cambia comportamiento (R28 sigue en pie), pero
  **toca `lib/modules/`**. Hay precedente: la enmienda de QC-44 del 2026-09-07 (l.113-115) publicó así
  la lista blanca del catálogo. Se declara para aprobarla. Afecta a T1.

### H3 — «Borran su esqueleto propio» frente a productos, que conservó el suyo

- El Alcance de la semilla y R30 piden borrar el esqueleto propio. Productos, la referencia de D2,
  **lo conserva**: `ProductTableSkeleton` es el `fallback` de `inventario/page.tsx:93`, y cuenta sus
  columnas con una constante (`product-columns-skeleton.ts:15`).
- Solo se puede borrar con la variante A de H1, donde el `fallback` es la propia tabla compartida en
  `status="loading"`. Con la variante B el esqueleto se queda y R30 hay que reescribirlo.

### H4 — Hay dos E2E más que dependen de los `data-testid` de la lista

La ficha nombra `e2e/recetas.spec.ts` y `e2e/proveedores.spec.ts`. Medido en disco, hay dos más:

- `e2e/recetas-pasos.spec.ts:197-213`: su helper `findRecipeRow` usa `recipe-row`,
  `recipe-page-next` y `recipe-list`. **Se rompe** con la migración y hay que actualizarlo, sin
  ampliarlo. Al pasar a localizar la tabla compartida, **entra en la lista cerrada de E2E** de
  `tests/unit/shared/data-table-alcance.test.ts:388-420`. No es un archivo nuevo, así que no choca
  con D9, pero amplía el alcance.
- `e2e/errores.spec.ts:221-225` afirma `recipe-list-error`, `-message` y `-code`, pero **en la página
  de edición** (`FORMULAS_ROUTE/<id>`). `RecipeListError` lo reutilizan `formulas/[id]/page.tsx`
  (l.12, 86, 94, 102) y `formulas/nueva/page.tsx` (l.9, 51, 59), así que **no se borra, sea cual sea
  la respuesta a H1**, y ese E2E no se toca.

### H5 — Coordinación con QC-93

`specs/QC-93-aterrizaje-sin-permiso-de-modulo/requirements.md:55` (árbol principal) nombra como
casos suyos «**recetas R6**» y «**proveedores R52**». Son los tests del usuario que «acaba fuera»:
`e2e/recetas.spec.ts:376-388` y `e2e/proveedores.spec.ts:467-483`. Esta ficha solo toca, dentro de
esos bloques, las líneas de `data-testid` (`recetas.spec.ts:386-387`, `proveedores.spec.ts:479-481`).
Lo demás que toca está fuera de ellos (ver `tasks.md` T15 y T17). **No se ha visto el diff de
QC-93**, que vive en otra rama: el choque exacto lo valida el leader al sincronizar.

## 1. Qué se copia y de dónde

El patrón es el de la migración de productos (`749d850`), en sus archivos actuales:

| Pieza | Referencia | Recetas | Proveedores |
|---|---|---|---|
| Parser y serializador de URL, `DataTableParams` completo, acotado contra la lista blanca | `inventario/components/product-list-params.ts` | `recipe-list-params.ts` (reescrito) | `supplier-list-params.ts` (reescrito) |
| Fábrica de columnas de cliente con slot `rowActions` | `product-columns.tsx` | `recipe-columns.tsx` (sustituye a `.ts`) | `supplier-columns.tsx` (sustituye a `.ts`) |
| Tabla de cliente: `<DataTable>`, navegación dentro de `useTransition`, `aria-busy` y rótulo mientras está en vuelo | `product-table.tsx` | `recipe-table.tsx` (reescrito) | `supplier-table.tsx` (reescrito) |
| Sección de servidor: una llamada y despacho de estados | `product-list-section.tsx` | `recipe-list-section.tsx` | `supplier-list-section.tsx` |
| Página: `<Suspense>` **sin `key`** | `inventario/page.tsx:93` | `formulas/page.tsx` | `proveedores/page.tsx` |

La fecha usa lo que ya hacen pedidos: `CREATED_FROM_PARAM`/`CREATED_TO_PARAM` y `parseIsoDate`
(`pedidos/components/order-list-params.ts:46-47, 140-146, 174-180, 219-223`).

**Cada ruta mantiene su parser** y no se extrae uno genérico (alternativa 1, §10).

## 2. Datos, operaciones y rutas

- **Sin cambios de datos.** No hay tabla, columna, índice, migración, `down.sql` ni RLS nuevos (R28).
- **Operaciones:** `listRecipesAction(query: unknown)` (`recipe-actions.ts:178`) y
  `listSuppliersAction(query: unknown)` (`supplier-actions.ts:189`). Reciben el `DataTableParams`
  **entero y sin traducir**, que es campo a campo `ListQuery` (`recetas/domain/list-query.ts:42-45,
  99-106`). El esquema es `strictObject`, así que no se inventa ninguna clave. Hoy reciben
  `{ page, pageSize }` (`recipe-list-section.tsx:34`, `supplier-list-section.tsx:43`).
- **Listas blancas (sin tocarlas):** las dos declaran `sortable: ['name', 'createdAt', 'updatedAt']`,
  `filterable: { createdAt: 'dateRange' }` y `searchable: true` (`recipe-queryable.ts:13-17`,
  `supplier-queryable.ts:11-15`). Recetas la importa del barrel; proveedores necesita H2.
- **Rutas:** las mismas. Destinos derivados de `FORMULAS_ROUTE`, `SUPPLIERS_ROUTE`,
  `NEW_RECIPE_ROUTE`, `recipeEditRoute` y `supplierDetailRoute` (`lib/shared/routes.ts:46-75`).

## 3. Contrato de la URL (R12, R13)

| Parámetro | Constante | Valor | Acotado (nunca da error) |
|---|---|---|---|
| `page` | `PAGE_PARAM` | entero ≥ 1 | inválido → 1 |
| `pageSize` | `PAGE_SIZE_PARAM` | `DEFAULT_PAGE_SIZE` o `MAX_PAGE_SIZE` | otro valor → por defecto |
| `sort` | `SORT_PARAM` | `campo:asc` o `campo:desc`, separador `SORT_SEPARATOR` | campo fuera de `*_QUERYABLE.sortable` o dirección desconocida → sin orden |
| `q` | `SEARCH_PARAM` | texto | recortado; solo espacios → sin búsqueda |
| `createdFrom` / `createdTo` | `CREATED_FROM_PARAM` / `CREATED_TO_PARAM` | `YYYY-MM-DD` que exista | cada extremo inválido pasa a `null`; los dos `null` → sin filtro |

Los nombres son **los mismos** que productos (`q`) y pedidos (`createdFrom`/`createdTo`). Así una URL
de un listado se lee igual en todos.

- De un parámetro repetido se toma el primer valor.
- `parseXListParams(buildXListQuery(p))` devuelve `p`.
- La clave del filtro en `DataTableParams.filters` es `createdAt`, que es también el id de columna.
  Solo se acepta si `*_QUERYABLE.filterable.createdAt === 'dateRange'` (R11).

**Volver a la página 1 al buscar, ordenar o filtrar NO entra** (QC-97 punto 4). Las transiciones
`withSort`, `withFilter` y `withSearch` conservan la página (`data-table-params.ts:63-91`).

## 4. Piezas por pantalla

### 4.1 Columnas (R2, R3, R4, R5, R7, R9, R21)

Son **fábricas de cliente** (`'use client'`) que devuelven `DataTableColumn<T>[]` con el id acotado
por tipo. El tipo sigue siendo la primera defensa de R3, como hoy (`recipe-columns.ts:20-28`,
`supplier-columns.ts:25-33`):

- `RecipeColumnId = Exclude<keyof RecipeSummary, 'id' | 'createdBy' | 'updatedBy' | 'imageUrl'> | 'image' | 'actions'`
- `SupplierColumnId = Exclude<keyof SupplierView, 'id' | 'nameNormalized' | 'createdBy' | 'updatedBy'> | 'actions'`

**Recetas** (`buildRecipeColumns({ rowActions })`):

| id | align | sortable | filter | pinnable | celda |
|---|---|---|---|---|---|
| `image` | start | — | — | (sí) | `EntityImage` con `recipe.imageUrl` tal cual; testId `recipe-image` o `recipe-image-placeholder` (R5, igual que `recipe-table.tsx:83-87`) |
| `name` | start | sí | — | (sí) | nombre |
| `description` | start | — | — | (sí) | descripción o `EMPTY_CELL` |
| `stepCount` | end | — | — | (sí) | `String(stepCount)` |
| `createdAt` | start | sí | `dateRange` | (sí) | `YYYY-MM-DD` en UTC (formato actual) |
| `updatedAt` | start | sí | — | (sí) | `YYYY-MM-DD` en UTC |
| `actions` | end | — | — | **false** | `rowActions(recipe)` |

**Proveedores** (`buildSupplierColumns({ rowActions })`):

| id | align | sortable | filter | pinnable | celda |
|---|---|---|---|---|---|
| `name` | start | sí | — | (sí) | `Link` a `supplierDetailRoute(id)`, `min-h-11 min-w-11`, testId `supplier-detail-link` (R4, igual que `supplier-table.tsx:81-89`) |
| `phone` | start | — | — | (sí) | teléfono o `EMPTY_CELL` |
| `email` | start | — | — | (sí) | correo o `EMPTY_CELL` |
| `createdAt` | start | sí | `dateRange` | (sí) | `YYYY-MM-DD` en UTC |
| `updatedAt` | start | sí | — | (sí) | `YYYY-MM-DD` en UTC |
| `actions` | end | — | — | **false** | `rowActions(supplier)` |

- `sortable` y `filter` **coinciden** con la lista blanca, y el test lo afirma recorriendo la
  declaración contra `*_QUERYABLE` (R7, R11).
- **Columna fijada por defecto** (decisión de diseño, revisable en F1.4):
  - recetas fija `image`, como productos y el catálogo (`product-columns.tsx:93`,
    `catalog-columns.tsx:90`);
  - proveedores no tiene imagen y fija `name`, que identifica la fila y lleva el enlace, igual que
    pedidos fija su correlativo (`order-columns.tsx:84`).

### 4.2 Tablas de cliente (R1, R6, R8, R9, R10, R14, R22, R23)

`RecipeTable({ recipes, params, totalPages })` y `SupplierTable({ suppliers, params, totalPages })`
son `'use client'` y copian `product-table.tsx:94-161`:

- `tableId`: `'recetas'` y `'proveedores'`. No chocan con `'inventario'` ni con
  `'proveedor-catalogo'`; T6 y T7 comprueban el resto.
- `*_TABLE_TEXTS: DataTableTexts` como constantes exportadas. Ningún test las afirma (R25).
- **Las acciones se montan aquí**, no llegan desde la sección: una función no cruza la frontera
  servidor→cliente (`catalog-table.tsx:33-38`).
  - Recetas: `Link` a `recipeEditRoute(id)` con `recipe-edit-open`, más `DeleteRecipeDialog`.
  - Proveedores: `SupplierSheet` y `DeleteSupplierDialog`.
  - Los disparadores conservan `min-h-11 min-w-11` (R21).
- `onParamsChange={(next) => navigate(xListHref(next))}` con `router.push` dentro de
  `startTransition`. Mientras `isPending` es verdadero: `aria-busy` en el contenedor y un rótulo, sin
  desmontar la tabla (R14). No se añade una segunda región viva.
- `searchable` queda en su valor por defecto (`true`), porque las dos listas blancas lo declaran.
- **No se ordena, filtra ni recorta nada** en el cliente: `rows` se pasa tal cual (R10). La tabla
  compartida ya pinta `getRowModel()` sin transformar (`data-table.tsx:293-300`).
- `status` y lo que se pasa en los estados dependen de H1 (§5).

**API de Next usada:** `useRouter` de `next/navigation`, con `router.push(href)` y `router.refresh()`.
Se comprobó en `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:42-50`,
leído en el árbol principal porque el worktree no tiene `node_modules`. Es la misma API que ya usan
`product-table.tsx:95-130` y `recipe-list-error.tsx:36, 66`. No se usa ninguna API nueva.

### 4.3 Sección, página y barrel

- **Sección** (Server Component): `listXAction(params)` **una sola vez** (R15). Pasa a la tabla
  `params={{ ...params, page: currentPage }}`. El enlace «volver a la primera» usa
  `xListHref({ ...params, page: FIRST_PAGE })`, que conserva orden, búsqueda y rango (R17).
- **Página**: `parseXListParams(await searchParams)` después de `requirePagePermission`, que sigue en
  la primera línea. El `<Suspense>` **pierde su `key`** (hoy `formulas/page.tsx:82` y
  `proveedores/page.tsx:71`), por lo mismo que en `inventario/page.tsx:40-43`: remontar borra el foco
  del campo de búsqueda (R14).
- **Barrel** `components/index.ts`: deja de exportar `RecipeListToolbar`/`SupplierListToolbar`,
  `RECIPE_COLUMNS`/`SUPPLIER_COLUMNS` y los tipos `*ListParams`. Exporta las constantes nuevas del
  parser, la fábrica de columnas, `*_TABLE_ID`, `*_TABLE_TEXTS` y `*_DEFAULT_PINNED_COLUMNS`.
- **Se borran** (R30): `recipe-list-toolbar.tsx` y `supplier-list-toolbar.tsx` en las dos variantes;
  `recipe-table-skeleton.tsx` y `supplier-table-skeleton.tsx` solo con la variante A (H3).

## 5. Los tres estados, según lo que se responda a H1

| Estado | Variante A (D5 al pie de la letra) | Variante B (igual que productos) |
|---|---|---|
| Error | La sección monta la tabla con `rows=[]`, `status="error"` y `errorMessage`. **Para cumplir R19** (reintentar, código, referencia de QC-71) hace falta **una prop nueva en el componente compartido**, que habría que aprobar. Sin ella, R19 se incumple. | `RecipeListError`/`SupplierListError` fuera de la tabla, como hoy. Cumple R19; no cumple R20. |
| Vacío | Tabla con `rows=[]` y `status="idle"`. Crear y «volver a la primera» van en `emptyAction`. El texto vacío se elige por caso en `texts` (es una prop). La búsqueda sigue a la vista. | `RecipeListEmpty`/`SupplierListEmpty` fuera de la tabla, como hoy. La búsqueda desaparece (pregunta 3). |
| Primera carga | `fallback` del `<Suspense>`: la tabla con `rows=[]`, `status="loading"` y `totalPages=1` (las props son serializables). Pinta 5 filas fijas (H1.2). | `fallback`: el esqueleto propio, que cuenta columnas con una constante atada por test a la fábrica (`product-columns-skeleton.ts`). |
| Gesto en vuelo | `useTransition` (§4.2) en las dos variantes | igual |

`RecipeListError` **se queda en las dos variantes** (H4). En la variante A,
`recipe-list-section.tsx` deja de importarlo; `nueva/` y `[id]/` lo siguen usando.
`SupplierListError` solo lo usa su sección, así que con la variante A queda huérfano y se borra.

## 6. Pregunta abierta 1: ¿caben las columnas? (medición)

**Cómo se midió.** Leyendo el código, sin navegador: en la fase de spec no hay navegador.

1. **La tabla compartida no fija anchos.** `DataTableColumn` no tiene ancho
   (`data-table-types.ts:63-75`). `data-table.tsx:153-164` no pasa `size`, y solo usa
   `getStart`/`getAfter` para el desplazamiento de las columnas fijadas (l.217-226). Las celdas no
   reciben ancho: el navegador los calcula con el algoritmo automático de tabla.
2. **El primitivo es el mismo de hoy.** `components/ui/table.tsx:73, 86` pone `whitespace-nowrap`
   en `th` y `td`, y `l.11` envuelve con `overflow-x-auto`. `recipe-table.tsx` y `supplier-table.tsx`
   usan hoy **ese mismo** primitivo. La migración **no cambia** cómo se calcula el ancho de las
   celdas de datos.
3. **Lo único que crece es la cabecera.** Las columnas ordenables añaden un botón de orden, y todas
   las fijables un disparador de menú de 44 px (`data-table-header-menu.tsx:100-110, 211-221`). Son
   unos 44-90 px más por cabecera.
4. **Contenido más largo posible**, tomado de los esquemas de alta:

   | Columna | Máximo | Origen |
   |---|---|---|
   | Nombre de receta | 120 caracteres | `recipe-input.ts:55` |
   | **Descripción de receta** | **500 caracteres** | `recipe-input.ts:60` |
   | Nombre de proveedor | 120 caracteres | `supplier-input.ts:14` |
   | Teléfono | 40 caracteres | `supplier-input.ts:15` |
   | Correo electrónico | 160 caracteres | `supplier-input.ts:16` |
   | Fechas | 10 caracteres | formato `YYYY-MM-DD` |
   | Pasos | entero | — |

   **Los píxeles no se han medido**: no hay navegador en esta fase. Sin salto de línea, 500
   caracteres a `text-sm` dan una columna de miles de píxeles.

**Conclusión.**

- **No hace falta tocar el componente compartido** para cumplir D7 y R24. El desbordamiento queda
  contenido en el contenedor del primitivo, igual que hoy. Las acciones siguen alcanzables con el
  scroll, y la columna fijada por defecto mantiene la fila identificable mientras se desplaza.
- La descripción es un problema de **legibilidad**, no de que no quepa, y ya existe hoy. Acotarla es
  posible **dentro de la celda** (un `span` con ancho máximo y `truncate` que devuelve `cell`), sin
  añadir `width` a `DataTableColumn`. Pero esconde texto: es la pregunta abierta 2.
- **Deuda anterior, no se arregla aquí:** con **dos o más** columnas fijadas, el desplazamiento sale
  de `getSize()` de la librería y no del ancho real. Con la fijación por defecto (una sola columna,
  desplazamiento 0) no se nota. El tamaño por defecto de `@tanstack/table-core` **no se ha podido
  verificar**: la ruta de `node_modules` no apareció ni en el worktree ni en el árbol principal. Es
  un dato desconocido y lo verá QC-114 en dispositivo real.

## 7. Requisitos que se invierten (R6, R8, R10)

| Requisito | Qué dice hoy | Tests que hoy lo afirman en negativo |
|---|---|---|
| QC-26 R14 (`specs/QC-26-pantalla-de-recetas/requirements.md:107`) | La pantalla no ofrece búsqueda ni orden | `tests/unit/recetas-ui/recipe-page.test.tsx:450-466` (sin `searchbox` ni `textbox`, un solo `combobox`, sin botones en las cabeceras); `tests/unit/recetas-ui/recipe-route-contract.test.ts:749-752` (ningún archivo contiene `type="search"`, `orderBy`, `sortBy` ni `sortDirection`) |
| QC-44 R11, **para la lista de proveedores** (`specs/QC-44-pantalla-de-proveedores/requirements.md:93`, enmienda l.95-115 que decía «la lista de PROVEEDORES no cambia», l.106) | Ninguna de las dos listas ofrece búsqueda ni orden | `tests/unit/proveedores-ui/supplier-page.test.tsx:517-535` (mismas cuatro afirmaciones) |

**Cómo se actualizan** (mismo procedimiento que `749d850` con QC-22 R13):

1. **Enmienda en el spec origen**, sin borrar el requisito. Se añade un bloque «ENMIENDA DEL
   2026-09-15» debajo de QC-26 R14 y otro que amplía la enmienda de QC-44 (l.95-115), con el formato
   de `specs/QC-22-pantalla-de-productos/requirements.md:105-121`. Dicen qué se invierte, por qué
   (la lista blanca de QC-57), que lo que protegía sigue en pie (R10 de esta ficha) y qué cambia de
   dueño (paginación y tamaño, con los `data-testid` de la tabla compartida).
2. **Los tests en negativo se reescriben en positivo**, no se borran. El mismo `it` pasa a afirmar:
   - hay un `searchbox`;
   - las cabeceras de `name`, `createdAt` y `updatedAt` tienen botón y `aria-sort`;
   - las de las demás columnas no;
   - activarlas **navega** con `sort` en la URL (`router.push` simulado);
   - las filas pintadas son las del simulador de la operación, en su orden (R10).
3. **El negativo del contrato de ruta** (`recipe-route-contract.test.ts:751`) se sustituye por dos
   afirmaciones:
   - «ningún archivo de la lista contiene `.sort(`, `.filter(` ni `.includes(` sobre las filas
     recibidas», acotado a los archivos de tabla y de columnas;
   - «el parser importa `RECIPE_QUERYABLE`».

   `orderBy` sigue prohibido: es Prisma y no tiene sitio en la UI.

## 8. Tests y trazabilidad prevista

| Requisitos | Dónde se prueban |
|---|---|
| R11, R12, R13, R22 | `recipe-list-params.test.ts`, `supplier-list-params.test.ts`: ida y vuelta, acotado caso por caso, derivado de `*_QUERYABLE` |
| R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R14, R15, R16, R17, R18, R19, R20, R21, R23, R24 | `recipe-page.test.tsx`, `supplier-page.test.tsx`: árbol real de la página con los simuladores de siempre; vistas angosta y ancha con `tests/helpers/viewport.ts` para R24 |
| R3, R10, R15, R30 | `recipe-route-contract.test.ts` y el equivalente de proveedores si existe (T12 lo comprueba) |
| R29 | `tests/unit/shared/data-table-alcance.test.ts` |
| R26 | `e2e/recetas.spec.ts`, `e2e/proveedores.spec.ts` (§9) |
| R25 | revisión sobre los propios tests, sin guardia nueva |
| R27 | `tests/guards/guard-dependencias-aprobadas.test.ts`, sin cambios |
| R28 | `tests/unit/shared/listas-blancas-listados.test.ts`, sin cambios, más la lista de archivos tocados en `progress/impl_*` |

## 9. E2E (R26)

- **Datos:** además de lo que cada spec ya crea, dos filas propias con nombres
  `${FIXTURE_PREFIX}orden_a_${RUN_ID}` y `${FIXTURE_PREFIX}orden_b_${RUN_ID}`. Se afirma **solo** sobre
  ellas, nunca sobre «la primera fila» ni sobre totales, porque las tablas son compartidas. Se borran
  en `afterAll` por su nombre exacto.
- **Cómo se crean:** en proveedores, con Prisma en `beforeAll` (el proveedor solo exige nombre y una
  vía de contacto). En recetas, **qué campos obligatorios exige `Recipe` con Prisma no se ha
  verificado**; T15 lo mira en `db/schema.prisma` antes de elegir entre Prisma y la UI.
- **Recorrido:**
  1. Escribir `RUN_ID` en `data-table-search`.
  2. Esperar a que la URL lleve `SEARCH_PARAM`.
  3. Afirmar que las dos filas (`[data-testid^="data-table-row-"]` filtrado por nombre) están
     visibles.
  4. Pedir `data-table-sort-desc-name`.
  5. Esperar a que `SORT_PARAM` sea `name:desc` y a que `data-table-head-name` tenga
     `aria-sort="descending"`.
  6. Afirmar que la fila `b` va antes que la `a` en el DOM.
- **Motores:** Chromium y WebKit, con los proyectos que ya tiene la config.

## 10. Alternativas descartadas

1. **Un parser de lista genérico compartido por recetas y proveedores**, que tienen la misma lista
   blanca. *Descartada:* ataría dos rutas por sus componentes internos. El precedente escrito es que
   cada ruta tenga el suyo (`supplier-list-params.ts:24-26`); productos, pedidos y el catálogo lo
   cumplen. Promoverlo a `components/shared/` exigiría una API común que hoy no pide nadie
   (`docs/architecture.md > Regla: sin sobre-ingeniería`).
2. **Añadir `width`/`minWidth` a `DataTableColumn`** para resolver la pregunta 1 de raíz.
   *Descartada:* la medición (§6) muestra que no hace falta para cumplir las decisiones, y tocaría el
   contrato de siete consumidores y la guardia de «componente intacto» de QC-45.
3. **Conservar la `key` del `<Suspense>`** para que el esqueleto reaparezca en cada gesto, como hoy.
   *Descartada:* remonta la barra de filtros y pierde el foco y el texto del campo de búsqueda. Es
   justo lo que productos corrigió (`inventario/page.tsx:40-43`) e incumpliría R14.
4. **Pasar las acciones de fila como slot desde la sección de servidor.** *Descartada:* una función
   no cruza la frontera servidor→cliente. Rompió el catálogo de proveedor el 2026-09-07
   (`catalog-table.tsx:33-38`).
5. **Búsqueda u orden en el navegador sobre la página ya descargada.** *Descartada* por D2 y R10:
   miraría solo la página visible y mentiría sobre el total.

## 11. Dependencias

**Ninguna** (D10, R27). La tabla compartida, `@tanstack/react-table` y `react-day-picker` ya están
aprobados y montados (`tests/unit/shared/data-table-alcance.test.ts:82-107`).

## 12. Riesgos

- **El flake de carga de jsdom** ya documentado en `supplier-page.test.tsx` (`history.md:2286-2288`):
  un rojo ahí no es por fuerza de esta ficha. Lo diagnostica el leader, no el subagente.
- **Choque con QC-93** en los dos E2E (H5).
- **Barrels de ruta con listas cerradas en sus tests de contrato** (`recipe-route-contract.test.ts`):
  al cambiar las exportaciones se ponen en rojo a propósito y se actualizan en la misma tarea (T11,
  T12).
