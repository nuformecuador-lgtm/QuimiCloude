# QC-56 — migrar-listas-a-tabla-compartida · design.md

> Zona `frontend` · complejidad `medium`. Sin tablas, sin migraciones, sin RLS, sin rutas nuevas y
> sin dependencias. Todo lo citado con `archivo:línea` se leyó en el worktree el 2026-09-15.
>
> **Revisado el 2026-09-15 tras F1.4.** D12 resuelve H1 y H3, D13 resuelve H2, D14 cierra la
> pregunta 2 y D15 la 3. H4 y H5 no cambian. Aparece H6, sobre cómo se cumple D15 sin tocar el
> componente compartido.

## 0. Hallazgos

### H1 — La decisión 5 chocaba con la referencia de la decisión 2 — **RESUELTO por D12**

- **Qué se encontró.** D5 decía que la tabla pinta los tres estados, pero productos
  (`product-list-section.tsx:45-63`, `product-table.tsx:156`), el catálogo
  (`catalog-list-section.tsx:57-77`) y pedidos (`order-list-section.tsx:199-221`; su
  `design.md:549-553` descartó la alternativa) los pintan **fuera**.
- **Por qué importaba.** `DataTableError` no puede pintar reintentar ni la referencia de QC-71
  (`data-table-states.tsx:49-76`), y `DataTableLoading` pinta 5 filas fijas (`l.79, 95`;
  `data-table.tsx:259`).
- **Resolución (D12).** Vacío, error y carga van **fuera** de la tabla, como en productos, sin tocar
  el componente. El diseño está en §5.

### H2 — `SUPPLIER_QUERYABLE` no salía por el barrel de `proveedores` — **RESUELTO por D13**

`lib/modules/proveedores/index.ts:29` solo exporta la lista blanca del catálogo. D13 autoriza **una
línea** de export. No cambia lógica ni contenido (R28, R31). Tarea T1.

### H3 — «Borrar el esqueleto propio» frente a productos — **RESUELTO por D12**

Productos conserva `ProductTableSkeleton` como `fallback` (`inventario/page.tsx:93`). D12 y el
Alcance revisado mantienen el esqueleto propio de cada lista, con tantas filas como el tamaño de
página (R18, R30).

### H4 — Hay dos E2E más que dependen de los `data-testid` de la lista (sin cambios)

- `e2e/recetas-pasos.spec.ts:197-213`: su helper `findRecipeRow` usa `recipe-row`,
  `recipe-page-next` y `recipe-list`. **Se rompe** con la migración y hay que actualizarlo, sin
  ampliarlo. Al pasar a localizar la tabla compartida, **entra en la lista cerrada de E2E** de
  `tests/unit/shared/data-table-alcance.test.ts:388-420`.
- `e2e/errores.spec.ts:221-225` afirma `recipe-list-error`, `-message` y `-code` **en la página de
  edición**. `RecipeListError` lo reutilizan `formulas/[id]/page.tsx` (l.12, 86, 94, 102) y
  `formulas/nueva/page.tsx` (l.9, 51, 59). Con D12 **se conserva** y ese E2E no se toca.

### H5 — Coordinación con QC-93 (sin cambios)

- `specs/QC-93-aterrizaje-sin-permiso-de-modulo/requirements.md:55` (árbol principal) nombra «recetas
  R6» y «proveedores R52»: `e2e/recetas.spec.ts:376-388` y `e2e/proveedores.spec.ts:467-483`.
- Dentro de esos bloques esta ficha solo toca las líneas de `data-testid` (`recetas.spec.ts:386-387`,
  `proveedores.spec.ts:479-481`). El resto de líneas va declarado en `tasks.md` T15 y T17.
- **No se ha visto el diff de QC-93.** El choque lo valida el leader al sincronizar.

### H6 — «Sin resultados» (D15) se pinta con el hueco de vacío de la tabla compartida — **a confirmar**

**El problema.** D15 exige que la caja de búsqueda **no desaparezca** cuando una búsqueda o un
filtro no encuentran nada. Esa caja no es de la pantalla: vive dentro de `<DataTable>`, en
`DataTableFilters` (`data-table.tsx:245-254`, `data-table-filters.tsx:137-139`), y el barrel **no la
exporta** (`components/shared/data-table/index.ts:1-10`). Si «sin resultados» se pintara fuera de la
tabla, como el vacío de D12, la tabla se desmontaría y la caja con ella.

**Opciones que no tocan el componente (D12):**

- **(elegida) Montar `<DataTable>` con `rows=[]` y `status="idle"`.** La tabla resuelve `'empty'` y
  sigue pintando la barra de búsqueda, los filtros y la paginación
  (`data-table-states.tsx:33-47`, `data-table.tsx:240-262, 325-332`). El copy de «sin resultados»
  entra por `texts.empty`, que es una prop, y la acción de limpiar por `emptyAction`. El contenido lo
  decide la pantalla; el marco del estado es el `data-table-empty` del componente.
- **(descartada) Pintar «sin resultados» fuera, con una caja de búsqueda propia de la ruta.**
  Duplicaría `DataTableSearchField` (rebote, borrador y emisión) en cada ruta, y los controles de
  fecha y de orden desaparecerían igual. Ver alternativa 6 de §10.

**Por qué es un hallazgo y no una decisión mía.** D12 dice «vacío, error y carga fuera de la tabla».
Aquí «sin resultados» es un estado **distinto** del vacío (así lo nombra D15) y va dentro. Si el
humano entiende que D12 también lo abarca, D15 no se puede cumplir sin duplicar la caja o tocar el
componente. **Afecta a** T8, T9, T10, T12, R32 y R33.

## 1. Qué se copia y de dónde

Se copia la migración de productos (`749d850`):

| Pieza | Referencia | Recetas | Proveedores |
|---|---|---|---|
| Parser y serializador de URL con `DataTableParams` completo, acotado contra la lista blanca | `inventario/components/product-list-params.ts` | `recipe-list-params.ts` (reescrito) | `supplier-list-params.ts` (reescrito) |
| Fábrica de columnas de cliente | `product-columns.tsx` | `recipe-columns.tsx` (sustituye a `.ts`) | `supplier-columns.tsx` (sustituye a `.ts`) |
| Número de columnas del esqueleto, sin `'use client'` | `product-columns-skeleton.ts` | `recipe-columns-skeleton.ts` (nuevo) | `supplier-columns-skeleton.ts` (nuevo) |
| Tabla de cliente: `<DataTable>` y `useTransition` | `product-table.tsx` | `recipe-table.tsx` (reescrito) | `supplier-table.tsx` (reescrito) |
| Sección de servidor y estados fuera | `product-list-section.tsx` | `recipe-list-section.tsx` | `supplier-list-section.tsx` |
| Esqueleto propio | `product-table-skeleton.tsx` | `recipe-table-skeleton.tsx` (reescrito) | `supplier-table-skeleton.tsx` (reescrito) |
| Página con `<Suspense>` **sin `key`** | `inventario/page.tsx:93` | `formulas/page.tsx` | `proveedores/page.tsx` |

**Fecha:** se copian los nombres y el acotado de pedidos (`order-list-params.ts:46-47, 140-146,
174-180, 219-223`). **Cada ruta mantiene su parser** (alternativa 1 de §10).

## 2. Datos, operaciones y rutas

- **Sin cambios de datos** (R28): ni tabla, ni columna, ni índice, ni migración, ni `down.sql`, ni
  RLS.
- **Operaciones.** `listRecipesAction(query: unknown)` (`recipe-actions.ts:178`) y
  `listSuppliersAction(query: unknown)` (`supplier-actions.ts:189`) reciben el `DataTableParams`
  **entero**: es `ListQuery` campo a campo, con `strictObject` (`recetas/domain/list-query.ts:42-45,
  99-106`).
- **Listas blancas.** Las dos declaran `sortable: ['name', 'createdAt', 'updatedAt']`,
  `filterable: { createdAt: 'dateRange' }` y `searchable: true` (`recipe-queryable.ts:13-17`,
  `supplier-queryable.ts:11-15`).
  - Recetas la importa de `@/lib/modules/recetas` (`index.ts:28`).
  - Proveedores la importa de `@/lib/modules/proveedores` tras la línea de D13:
    `export { SUPPLIER_QUERYABLE } from './domain/supplier-queryable';`.
- **Rutas.** Las mismas. Todos los destinos se derivan de `FORMULAS_ROUTE`, `SUPPLIERS_ROUTE`,
  `NEW_RECIPE_ROUTE`, `recipeEditRoute` y `supplierDetailRoute` (`lib/shared/routes.ts:46-75`).

## 3. Contrato de la URL (R12, R13)

| Parámetro | Constante | Valor | Acotado (nunca da error) |
|---|---|---|---|
| `page` | `PAGE_PARAM` | entero ≥ 1 | inválido → 1 |
| `pageSize` | `PAGE_SIZE_PARAM` | `DEFAULT_PAGE_SIZE` o `MAX_PAGE_SIZE` | otro → por defecto |
| `sort` | `SORT_PARAM` | `campo:asc` o `campo:desc` (`SORT_SEPARATOR`) | campo fuera de `*_QUERYABLE.sortable` o dirección desconocida → sin orden |
| `q` | `SEARCH_PARAM` | texto | recortado; solo espacios → sin búsqueda |
| `createdFrom` / `createdTo` | `CREATED_FROM_PARAM` / `CREATED_TO_PARAM` | `YYYY-MM-DD` que exista | extremo inválido → `null`; los dos `null` → sin filtro |

- Ante un parámetro repetido, gana el primero.
- `parse(build(p))` devuelve `p`.
- La clave del filtro es `createdAt`, y solo existe si la lista blanca la declara `dateRange` (R11).
- Cada parser exporta `hasActiveSearchOrFilter(params)`, que devuelve
  `params.search !== '' || Object.keys(params.filters).length > 0`. Es la definición del glosario y
  decide entre vacío (R16) y «sin resultados» (R32).
- Cada parser exporta también `clearSearchAndFilters(params)`, que devuelve
  `{ ...params, search: '', filters: {}, page: FIRST_PAGE }` (R33).
  - Volver a la página 1 **aquí** no invade QC-97 punto 4: aquel habla de buscar, ordenar o filtrar,
    y esto es limpiar.
  - Sin volver a la 1, limpiar desde la página 3 podría caer en otro vacío. *Decisión de diseño
    revisable.*
- **Volver a la página 1 al buscar, ordenar o filtrar NO entra** (QC-97 punto 4;
  `data-table-params.ts:63-91`).

## 4. Piezas por pantalla

### 4.1 Columnas (R2, R3, R4, R5, R7, R9, R21)

Son fábricas `'use client'`. El tipo de id es la primera defensa de R3.

**Recetas.** `RecipeColumnId = Exclude<keyof RecipeSummary, 'id' | 'createdBy' | 'updatedBy' |
'imageUrl' | 'description'> | 'image' | 'actions'`. Añadir `'description'` al `Exclude` hace que una
columna de descripción **no compile** (D14, R2).

| id | align | sortable | filter | pinnable | celda |
|---|---|---|---|---|---|
| `image` | start | — | — | (sí) | `EntityImage` con `recipe.imageUrl` tal cual; `recipe-image` o `recipe-image-placeholder` (R5) |
| `name` | start | sí | — | (sí) | nombre |
| `stepCount` | end | — | — | (sí) | `String(stepCount)` |
| `createdAt` | start | sí | `dateRange` | (sí) | `YYYY-MM-DD` en UTC |
| `updatedAt` | start | sí | — | (sí) | `YYYY-MM-DD` en UTC |
| `actions` | end | — | — | **false** | `rowActions(recipe)` |

`RECIPE_SKELETON_COLUMN_COUNT = 6`, en `recipe-columns-skeleton.ts`. Un test lo ata a la longitud
real de `buildRecipeColumns(...)`, como `product-columns-skeleton.ts:9-15`.

**Proveedores.** `SupplierColumnId = Exclude<keyof SupplierView, 'id' | 'nameNormalized' |
'createdBy' | 'updatedBy'> | 'actions'`.

| id | align | sortable | filter | pinnable | celda |
|---|---|---|---|---|---|
| `name` | start | sí | — | (sí) | `Link` a `supplierDetailRoute(id)`, `min-h-11 min-w-11`, `supplier-detail-link` (R4) |
| `phone` | start | — | — | (sí) | teléfono o `EMPTY_CELL` |
| `email` | start | — | — | (sí) | correo o `EMPTY_CELL` |
| `createdAt` | start | sí | `dateRange` | (sí) | `YYYY-MM-DD` en UTC |
| `updatedAt` | start | sí | — | (sí) | `YYYY-MM-DD` en UTC |
| `actions` | end | — | — | **false** | `rowActions(supplier)` |

`SUPPLIER_SKELETON_COLUMN_COUNT = 6`, en `supplier-columns-skeleton.ts`.

**Coherencia con la lista blanca.** `sortable` y `filter` coinciden con ella, y hay test que lo
recorre (R7, R11).

**Columna fijada por defecto** (decisión de diseño, revisable):

- recetas fija `image`, como `product-columns.tsx:93` y `catalog-columns.tsx:90`;
- proveedores fija `name`, como pedidos fija su correlativo (`order-columns.tsx:84`).

### 4.2 Tablas de cliente (R1, R6, R8, R9, R10, R14, R21–R23, R32, R33)

`RecipeTable` y `SupplierTable` son `'use client'` y copian `product-table.tsx:94-161`.

**Props.**
- Recetas: `recipes`, `params`, `totalPages` y `noResults?: NoResultsSlot`.
- Proveedores: lo mismo con `suppliers`.

**Montaje de `<DataTable>`.**
- `tableId`: `'recetas'` y `'proveedores'`. No chocan con `'inventario'` ni con
  `'proveedor-catalogo'`; T6 y T7 comprueban el resto.
- `*_TABLE_TEXTS` son constantes exportadas. No se afirman en los tests (R25).
- `searchable` queda en su valor por defecto (`true`).
- `status` es **siempre `'idle'`** (D12). Los estados vacío y error nunca llegan a la tabla.

**Acciones de fila.** Se montan en la propia tabla, porque una función no cruza la frontera
servidor→cliente (`catalog-table.tsx:33-38`). Los disparadores conservan `min-h-11 min-w-11`.
- Recetas: `Link` a `recipeEditRoute` con `recipe-edit-open`, y `DeleteRecipeDialog`.
- Proveedores: `SupplierSheet` y `DeleteSupplierDialog`.

**Navegación.** `onParamsChange` llama a `router.push(xListHref(next))` dentro de `startTransition`.
Mientras `isPending`, el contenedor lleva `aria-busy` y un rótulo, y la tabla no se desmonta (R14).

**No se transforma nada en el cliente.** `rows` se pasa tal cual (R10, `data-table.tsx:293-300`).

**«Sin resultados»** (R32, R33, H6).
- **Qué baja.** `noResults` llega desde la sección solo cuando `rows` está vacío y hay búsqueda o
  filtro activos. Es serializable: `{ clearHref: string; firstPageHref?: string }`.
- **Qué hace la tabla.** Pasa a `<DataTable>`:
  - `texts={{ ...X_TABLE_TEXTS, empty: X_NO_RESULTS_TEXT }}`;
  - `emptyAction`, que contiene:
    - un contenedor `data-testid="recipe-list-no-results"` (`supplier-list-no-results` en
      proveedores);
    - el enlace «limpiar» `recipe-list-clear-search` / `supplier-list-clear-search`, que navega a
      `clearHref` con la misma transición;
    - si llega `firstPageHref`, el enlace `recipe-list-no-results-first-page` /
      `supplier-list-no-results-first-page`.

**API de Next.** `useRouter` de `next/navigation`, con `router.push` y `router.refresh`
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:42-50`, leído en el
árbol principal porque el worktree no tiene `node_modules`). Es la misma API que ya usan
`product-table.tsx:95-130` y `recipe-list-error.tsx:36, 66`.

### 4.3 Sección, página y barrel

**Sección (Server Component)**, en este orden:
1. Llama a `listXAction(params)` una sola vez (R15).
2. Si `status === 'error'`, devuelve `<XListError error={result} />` fuera de la tabla (R19).
3. Si `items.length === 0` y **no** `hasActiveSearchOrFilter(params)`, devuelve `<XListEmpty>` fuera
   de la tabla, con la acción de crear y, si `currentPage > FIRST_PAGE`, el `firstPageHref` de
   `xListHref({ ...params, page: FIRST_PAGE })` (R16, R17).
4. En cualquier otro caso, filas o «sin resultados», devuelve **la misma estructura**:
   `<div data-testid="x-list"><XTable … /></div>`, más el disparador de alta en proveedores si hoy
   está ahí. La diferencia es solo `noResults`:

```tsx
<XTable
  … rows={items} params={{ ...params, page: currentPage }} totalPages={totalPages}
  noResults={items.length === 0
    ? { clearHref: xListHref(clearSearchAndFilters(params)),
        firstPageHref: currentPage > FIRST_PAGE ? xListHref({ ...params, page: FIRST_PAGE }) : undefined }
    : undefined}
/>
```

**Por qué la misma estructura** (R14, R33). Si «sin resultados» cambiara el elemento padre o la
posición de `<XTable>`, React remontaría la tabla al volver la navegación, y el campo de búsqueda
perdería el foco y el borrador justo mientras el usuario escribe. Así, con cero filas sigue montado
`DataTableSearchField` y su `useState(params.search)` (`data-table-filters.tsx:58`) no se reinicia.

**`totalPages` con cero filas.** `lib/shared/pagination.ts:62` devuelve `1` cuando `total === 0`, así
que la paginación dice «1 de 1» con los dos botones deshabilitados
(`data-table-pagination.tsx:55-56`). Que las dos operaciones pasen por esa función **no está
verificado**: T6 y T7 lo comprueban, y si no, acotan `totalPages` a un mínimo de 1 en la tabla.

**Página.**
- `requirePagePermission` sigue en la primera línea, y después
  `parseXListParams(await searchParams)`.
- El `<Suspense>` pierde su `key` (hoy `formulas/page.tsx:82`, `proveedores/page.tsx:71`), por lo
  mismo que `inventario/page.tsx:40-43`.
- `fallback={<XTableSkeleton rows={params.pageSize} />}` (R18).

**Esqueleto** (`recipe-table-skeleton.tsx`, `supplier-table-skeleton.tsx`). Deja de importar
`RECIPE_COLUMNS`/`SUPPLIER_COLUMNS`, que pasan a ser fábricas de cliente, y cuenta con
`*_SKELETON_COLUMN_COUNT`. Conserva `role="status"`, `aria-busy`, `recipe-table-skeleton` /
`supplier-table-skeleton` y `*-row-skeleton` × `rows` (R18).

**Vacío y error.**
- `recipe-list-empty.tsx`, `supplier-list-empty.tsx`, `recipe-list-error.tsx` y
  `supplier-list-error.tsx` **se conservan** (R30).
- El error no cambia: sigue con reintentar y con `UnexpectedErrorNotice`.
- El vacío tampoco cambia salvo que su `firstPageHref` llega ya calculado con `xListHref`, que
  conserva el orden.

**Barrel `components/index.ts`.**
- Deja de exportar `RecipeListToolbar`/`SupplierListToolbar`, `RECIPE_COLUMNS`/`SUPPLIER_COLUMNS` y
  los tipos `*ListParams`/`*PageSize`.
- Pasa a exportar las constantes y funciones del parser (incluidas `hasActiveSearchOrFilter` y
  `clearSearchAndFilters`), la fábrica de columnas, `*_SKELETON_COLUMN_COUNT`, `*_TABLE_ID`,
  `*_TABLE_TEXTS`, `*_NO_RESULTS_TEXT` y `*_DEFAULT_PINNED_COLUMNS`.

**Se borran** (R30): `recipe-list-toolbar.tsx`, `supplier-list-toolbar.tsx`, `recipe-columns.ts` y
`supplier-columns.ts`; los dos últimos los sustituyen sus versiones `.tsx`.

## 5. Los estados (D12, D15)

| Situación | Quién lo pinta | Identificador | Acciones |
|---|---|---|---|
| Error de la operación | `XListError`, **fuera** de la tabla | `recipe-list-error` / `supplier-list-error`, `role="alert"` | reintentar (`router.refresh()`); `UnexpectedErrorNotice` si el error es inesperado (QC-71) |
| Cero filas sin búsqueda ni filtro | `XListEmpty`, **fuera** | `recipe-list-empty` / `supplier-list-empty` | crear; volver a la primera si `page > 1` |
| Cero filas con búsqueda o filtro | `<DataTable>` con `rows=[]`: marco `data-table-empty`, contenido de la pantalla (H6) | `recipe-list-no-results` / `supplier-list-no-results` | limpiar búsqueda y filtros; volver a la primera si `page > 1`. **Sin** crear |
| Primera carga | `XTableSkeleton`, **fuera**, como `fallback` | `recipe-table-skeleton` / `supplier-table-skeleton`, `aria-busy` | — (filas = `pageSize`) |
| Gesto en vuelo | la tabla de cliente (`useTransition`) | `aria-busy` en el contenedor de la tabla | — |
| Con filas | `<DataTable>` | `data-table-row-<id>` | las de fila |

**Exclusión mutua** (R20):
- error, vacío y filas/«sin resultados» salen de ramas distintas de la sección;
- el esqueleto solo existe mientras la sección está suspendida;
- «sin resultados» y «con filas» dependen de `rows.length`, que resuelve la propia tabla
  (`resolveDataTableState`).

**El componente compartido no se toca** (D12, R20). T13 lo afirma sobre el diff.

## 6. Pregunta abierta 1: medición de anchos (se conserva; la descripción ya no entra)

- **La tabla compartida no fija anchos.** `DataTableColumn` no tiene ancho
  (`data-table-types.ts:63-75`), y `data-table.tsx` solo usa `getStart`/`getAfter` para fijar columnas
  (l.217-226).
- **El primitivo es el mismo que hoy.** `components/ui/table.tsx:73, 86` pone `whitespace-nowrap` y
  `l.11` envuelve con `overflow-x-auto`. La migración no cambia cómo se mide una celda de datos.
- **Lo único que crece es la cabecera**: unos 44-90 px por el botón de orden y el menú
  (`data-table-header-menu.tsx:100-110, 211-221`).
- **Contenido más largo que queda:** nombre de receta o de proveedor, 120 caracteres
  (`recipe-input.ts:55`, `supplier-input.ts:14`); teléfono, 40 (`l.15`); correo, 160 (`l.16`). **La
  descripción de 500 caracteres ya no se pinta (D14)**, y era la única columna problemática.
- **No se han medido píxeles en un navegador.**
- **Conclusión:** no hace falta tocar el componente, y el desbordamiento queda contenido (R24).
- **Deuda anterior, sin arreglar.** Con dos o más columnas fijadas, el desplazamiento sale de
  `getSize()` de la librería. El tamaño por defecto de `@tanstack/table-core` **no se ha podido
  verificar**: no apareció su `node_modules`. Queda para QC-114.

## 7. Requisitos de otras fichas que cambian

| Requisito | Qué dice hoy | Qué lo cambia | Tests que lo afirman hoy |
|---|---|---|---|
| QC-26 R14 (`specs/QC-26-pantalla-de-recetas/requirements.md:107`) | no hay búsqueda ni orden | D2: se **invierte** | `recipe-page.test.tsx:450-466`; `recipe-route-contract.test.ts:749-752` |
| QC-26 R8 (columnas de la lista) | incluye la descripción | D14: la descripción **sale** | `recipe-page.test.tsx`, que recorre `RECIPE_COLUMNS`; `recipe-route-contract.test.ts:718-719` |
| QC-44 R11, para la lista de proveedores (`requirements.md:93`; enmienda l.95-115, «la lista de PROVEEDORES no cambia» en l.106) | no hay búsqueda ni orden | D2: se **invierte** | `supplier-page.test.tsx:517-535` |

**Cómo se actualizan** (procedimiento de `749d850` con QC-22 R13):

1. **Enmiendas fechadas** en el spec de origen, con el formato de
   `specs/QC-22-pantalla-de-productos/requirements.md:105-121`: debajo de QC-26 R8, debajo de QC-26
   R14 y a continuación de la enmienda de QC-44. No se borra ni se renumera nada.
2. **Los tests en negativo pasan a positivo** en el mismo `it`, que afirma:
   - que hay `searchbox`;
   - que las cabeceras `name`, `createdAt` y `updatedAt` tienen botón y `aria-sort`, y las demás no;
   - que activarlas navega con `SORT_PARAM`;
   - que las filas son las del simulador y en su orden.
3. **El negativo del contrato de ruta** (`recipe-route-contract.test.ts:751`) se sustituye por:
   - ningún archivo de tabla o de columnas aplica `.sort(`, `.filter(` ni recorte a las filas
     recibidas;
   - el parser importa `RECIPE_QUERYABLE` del barrel.

   `orderBy` sigue prohibido.
4. **La columna de descripción:** el test de columnas afirma que `description` **no** está entre los
   ids y que no aparece ninguna celda `data-table-cell-description` (R2).

## 8. Tests y trazabilidad prevista

| Requisitos | Dónde se prueban |
|---|---|
| R11, R12, R13, R22, y las funciones de R32/R33 | `recipe-list-params.test.ts`, `supplier-list-params.test.ts` |
| R1–R10, R14–R24, R32, R33 | `recipe-page.test.tsx`, `supplier-page.test.tsx`: árbol real de la página; vistas angosta y ancha con `tests/helpers/viewport.ts` (R24); **foco en `data-table-search` que se conserva** al pasar de filas a «sin resultados» con el mismo árbol (R33) |
| R3, R10, R15, R30 | `recipe-route-contract.test.ts` (y el de proveedores si cierra archivos) |
| R20 (componente intacto), R29 | `tests/unit/shared/data-table-alcance.test.ts` |
| R26 | `e2e/recetas.spec.ts`, `e2e/proveedores.spec.ts` |
| R25 | revisión de los propios tests |
| R27 | `tests/guards/guard-dependencias-aprobadas.test.ts`, sin cambios |
| R28, R31 | `tests/unit/shared/listas-blancas-listados.test.ts` sin cambios, `guard-arquitectura-modulos` y un test que importa `SUPPLIER_QUERYABLE` desde `@/lib/modules/proveedores` y lo compara con el de `domain/` |

## 9. E2E (R26)

**Filas propias del spec.** `${FIXTURE_PREFIX}orden_a_${RUN_ID}` y `${FIXTURE_PREFIX}orden_b_${RUN_ID}`.
Los asserts miran solo esas dos, y `afterAll` las borra por nombre exacto.
- Proveedores: se crean con Prisma.
- Recetas: **no se ha verificado qué campos exige `Recipe`**. T15 mira `db/schema.prisma` antes de
  elegir entre Prisma y la UI.

**Recorrido:**
1. Escribir `RUN_ID` en `data-table-search`.
2. Esperar a que la URL lleve `SEARCH_PARAM`.
3. Comprobar que las dos filas (`data-table-row-*` filtradas por nombre) están visibles.
4. Pulsar `data-table-sort-desc-name`.
5. Esperar `SORT_PARAM` y `aria-sort="descending"` en `data-table-head-name`.
6. Comprobar que la fila `b` va antes que la `a`.

Corre en Chromium y en WebKit.

## 10. Alternativas descartadas

1. **Un parser genérico compartido** entre las dos rutas. *Descartada:* acopla rutas por sus
   internos; el precedente es un parser por ruta (`supplier-list-params.ts:24-26`).
2. **Añadir `width` a `DataTableColumn`.** *Descartada:* no hace falta (§6), y D12 prohíbe tocar el
   componente.
3. **Conservar la `key` del `<Suspense>`.** *Descartada:* borra el foco del campo de búsqueda
   (`inventario/page.tsx:40-43`); incumpliría R14 y R33.
4. **Acciones de fila como slot desde la sección de servidor.** *Descartada:* las funciones no cruzan
   la frontera (`catalog-table.tsx:33-38`).
5. **Buscar u ordenar en el navegador.** *Descartada* por D2 y R10.
6. **«Sin resultados» fuera de la tabla, con una caja de búsqueda propia de la ruta.** *Descartada*
   (H6): duplica en dos rutas el rebote, el borrador y la emisión de `DataTableSearchField`, que no se
   exporta; hace desaparecer el control de fecha y el orden, y deja dos cajas distintas según haya
   filas o no. Montar la tabla con `rows=[]` lo cumple sin código duplicado y sin tocar el
   componente.
7. **Pasar `status="error"` o `"loading"` a la tabla** (la antigua variante A). *Descartada por D12.*

## 11. Dependencias

**Ninguna** (D10, R27).

## 12. Riesgos

- **Flake de carga de jsdom** en `supplier-page.test.tsx` (`history.md:2286-2288`). Lo diagnostica el
  leader.
- **Choque con QC-93** en los dos E2E (H5).
- **Remontaje accidental de la tabla** si la sección pinta «sin resultados» con otro árbol (§4.3).
  Hay test que lo afirma.
