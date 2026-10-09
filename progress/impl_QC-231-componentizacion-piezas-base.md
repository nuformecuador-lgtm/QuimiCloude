# QC-231 — componentizacion-piezas-base · impl

## Inventario de T3

Cada copia local se comparó con la pieza compartida renderizando las dos en vitest y exigiendo el
**mismo `innerHTML`** (34 casos en verde, con un test temporal que se borró después: no se
versiona porque importa los locales que borra la tanda 3). Se cubrieron con y sin `firstPageHref`
/ `clearSearchHref`, con 0 y 3 filas, y con error inesperado y de catálogo.

### `TableSkeleton`

Por defecto: `headCellClassName='h-4 w-24'`, `cellClassName='h-4 w-full'`, `withImage=false`.

| Copia local | Props |
|---|---|
| `inventario/components/product-table-skeleton.tsx` | `columns={PRODUCT_SKELETON_COLUMN_COUNT} rows label="Cargando productos…" testId="product-table-skeleton" rowTestId="product-row-skeleton"` |
| `produccion/formulas/components/recipe-table-skeleton.tsx` | `columns={RECIPE_SKELETON_COLUMN_COUNT} label="Cargando recetas…" testId="recipe-table-skeleton" rowTestId="recipe-row-skeleton"` |
| `proveedores/[id]/components/catalog-table-skeleton.tsx` | `columns={CATALOG_SKELETON_COLUMN_COUNT} label="Cargando el catálogo del proveedor…" testId="catalog-table-skeleton" rowTestId="catalog-row-skeleton"` |
| `clientes/components/customer-list-skeleton.tsx` | `columns={CUSTOMER_SKELETON_COLUMN_COUNT} label="Cargando clientes…" testId="customer-list-skeleton" rowTestId="customer-row-skeleton" headCellClassName="h-4 w-full"` |
| `configuracion/presentaciones/components/presentation-list-skeleton.tsx` | `columns={PRESENTATION_SKELETON_COLUMN_COUNT} label="Cargando presentaciones…" testId={PRESENTATION_LIST_SKELETON_TESTID} rowTestId={PRESENTATION_ROW_SKELETON_TESTID} headCellClassName="h-4 w-full"` |
| `configuracion/unidades/components/unit-list-skeleton.tsx` | `columns={UNIT_SKELETON_COLUMN_COUNT} label="Cargando unidades…" testId={UNIT_LIST_SKELETON_TESTID} rowTestId={UNIT_ROW_SKELETON_TESTID} headCellClassName="h-4 w-full"` |
| `configuracion/usuarios/components/user-list-skeleton.tsx` | `columns={USER_SKELETON_COLUMN_COUNT} label="Cargando usuarios…" testId={USER_LIST_SKELETON_TESTID} rowTestId={USER_ROW_SKELETON_TESTID} headCellClassName="h-4 w-full"` |
| `configuracion/usuarios/components/work-group-list-skeleton.tsx` | `columns={WORK_GROUP_SKELETON_COLUMN_COUNT} label="Cargando grupos de trabajo…" testId={WORK_GROUP_LIST_SKELETON_TESTID} rowTestId={WORK_GROUP_ROW_SKELETON_TESTID} headCellClassName="h-4 w-full"` |
| `pedidos/components/order-list-skeleton.tsx` (D11: se queda y delega) | `columns={ORDER_SKELETON_COLUMN_COUNT} label="Cargando pedidos…" testId="order-list-skeleton" rowTestId="order-row-skeleton" headCellClassName="h-4 w-full"` |
| `proveedores/components/supplier-showcase-skeleton.tsx` | **No aplica**: no es una tabla, se conserva (R21) |

**Hallazgo — `withImage`.** Ninguna copia pinta una celda de imagen en el esqueleto: las tres
listas con columna de imagen (productos, recetas, catálogo) solo se distinguen por la cabecera
`h-4 w-24`. Todas se reproducen con `withImage=false`. `withImage` existe porque lo pide R15, y
su hueco (`TABLE_SKELETON_IMAGE_CLASS_NAME = 'size-[60px] shrink-0'`, el lado de la miniatura de
`EntityImage`) no lo usa hoy ninguna lista. Activarlo cambiaría el DOM (R1).

### `EmptyState`

Por defecto: `className='flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center'`.
Orden: mensaje, `clearSearch`, `firstPage`, `children`. Los dos enlaces llevan la etiqueta y el
testid que se pasen; aquí `FP = { href: firstPageHref, label: 'Volver a la primera página', testId: <x>-list-first-page }`
y `CS = { href: clearSearchHref, label: 'Limpiar la búsqueda', testId: <x>-list-clear-search }`,
cada uno solo cuando su href está definido.

| Copia local | Props |
|---|---|
| `inventario/.../product-list-empty.tsx` | `testId="product-list-empty"`, sin `messageTestId`, `message` = «Todavía no hay productos en el catálogo.» / «Esta página ya no tiene productos.», `firstPage=FP`, `children` |
| `produccion/formulas/.../recipe-list-empty.tsx` | `testId="recipe-list-empty"`, sin `messageTestId`, `message` = «Todavía no hay recetas en el catálogo.» / «Esta página ya no tiene recetas.», `firstPage=FP`, `children` = el `Link` «Nueva fórmula» (`recipe-create-open`, `buttonVariants({ variant: 'default' })` + talla) |
| `proveedores/[id]/.../catalog-list-empty.tsx` | `testId={CATALOG_LIST_EMPTY_TESTID}`, sin `messageTestId`, `message` = «Este proveedor todavía no tiene líneas de catálogo.» / «Esta página ya no tiene líneas de catálogo.», `firstPage=FP`, `children` |
| `clientes/.../customer-list-empty.tsx` | `testId`/`messageTestId` = `CUSTOMER_LIST_EMPTY_*`, `message` = «Todavía no hay clientes registrados.» / «Esta página ya no tiene clientes.», `firstPage=FP`, y `children` **solo** si `firstPageHref === undefined && canModify` (el local los excluye con la vuelta) |
| `configuracion/presentaciones/.../presentation-list-empty.tsx` | `testId`/`messageTestId` = `PRESENTATION_LIST_EMPTY_*`, `message` = «Todavía no hay presentaciones registradas.» / «Esta página ya no tiene presentaciones.», `firstPage=FP`, `children` |
| `configuracion/unidades/.../unit-list-empty.tsx` | `testId`/`messageTestId` = `UNIT_LIST_EMPTY_*`, `message` = «No hay unidades que coincidan con lo que se está pidiendo.» / con búsqueda «La búsqueda no encontró ninguna unidad.», `clearSearch=CS`, `firstPage=FP` |
| `configuracion/usuarios/.../user-list-empty.tsx` | igual que unidades con `USER_LIST_*`; mensajes «No hay usuarios que coincidan con lo que se está pidiendo.» / «La búsqueda no encontró ningún usuario.» |
| `configuracion/usuarios/.../work-group-list-empty.tsx` | igual con `WORK_GROUP_LIST_*`; mensajes «No hay grupos de trabajo que mostrar.» / «La búsqueda no encontró ningún grupo de trabajo.» |
| `pedidos/.../order-list-empty.tsx` (D11: se queda y delega) | `testId="order-list-empty" messageTestId="order-list-empty-message"`, `message` = «Todavía no hay pedidos registrados.» / «Esta página ya no tiene pedidos.», `firstPage=FP`, `children` |
| `proveedores/.../supplier-list-empty.tsx` | `testId="supplier-list-empty"`, `message="Todavía no hay proveedores dados de alta."`, `children` |

Prop añadida respecto de `design.md > 4`: `messageTestId` (unas copias lo llevan y otras no) y
`clearSearch` (unidades, usuarios y grupos; va **antes** de la vuelta, así que no cabe en
`children`). El mensaje es en el sitio que llama, porque depende del href.

### `ErrorState`

Por defecto: `className='flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4'`,
`withCode=true`, `retryLabel='Reintentar'`. Todas: `testId="<k>-error" messageTestId="<k>-error-message" codeTestId="<k>-error-code" retryTestId="<k>-retry"`.

| Copia local | `k` | `title` | `retry` |
|---|---|---|---|
| `inventario/.../product-list-error.tsx` | `product-list` | «No se pudo cargar el catálogo.» | `{ kind: 'refresh' }` |
| `produccion/formulas/.../recipe-list-error.tsx` (`RecipeListError`) | `recipe-list` | «No se pudo cargar el catálogo.» | `refresh` |
| `proveedores/[id]/.../catalog-list-error.tsx` | `catalog-list` | «No se pudo cargar la información del proveedor.» | `refresh` |
| `proveedores/.../supplier-list-error.tsx` | `supplier-list` | «No se pudo cargar la lista de proveedores.» | `refresh` |
| `configuracion/presentaciones/.../presentation-list-error.tsx` | `presentation-list` (constantes `PRESENTATION_LIST_*`) | «No se pudo cargar la lista de presentaciones.» | `refresh` |
| `configuracion/unidades/.../unit-list-error.tsx` | `unit-list` (`UNIT_LIST_*`) | «No se pudo cargar la lista de unidades.» | `refresh` |
| `configuracion/usuarios/.../user-list-error.tsx` | `user-list` (`USER_LIST_*`) | «No se pudo cargar la lista de usuarios.» | `refresh` |
| `configuracion/usuarios/.../work-group-list-error.tsx` | `work-group-list` (`WORK_GROUP_LIST_*`) | «No se pudo cargar la lista de grupos de trabajo.» | `refresh` |
| `pedidos/.../order-list-error.tsx` (D11: se queda y delega) | `order-list` | «No se pudo cargar la lista de pedidos.» | `refresh` |
| `asignacion/.../assigned-orders-error.tsx` (D11: se queda y delega) | `assigned-orders` | «No se pudo cargar la lista de pedidos asignados.» | `refresh` |
| `clientes/.../customer-list-error.tsx` | `customer-list` (`CUSTOMER_LIST_*`) | «No se pudo cargar la lista de clientes.» | `{ kind: 'href', href: retryHref }` |
| `dashboard/.../execution-trace-list-section.tsx` (`ExecutionTraceListError`, interno) | — | «No se pudo cargar la lista de pedidos ejecutados.» | **sin `retry`**; `testId="execution-trace-error" messageTestId="execution-trace-error-message" withCode={false} className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-4"` |

`ExecutionTraceListError` no se pudo comparar por `innerHTML` porque no se exporta; su
combinación sale de leer el marcado. Lo cubrirá `recorridos-paridad` al migrar (T9j).

Props añadidas respecto de `design.md > 4`: `retry` opcional (con `retryTestId` obligatorio solo si
hay `retry`) y `withCode`, las dos por el recorrido del dashboard.

### `EntityImage size="fill"` (T7)

`OrderRecipeImage({ imageUrl, name })` ≡
`<EntityImage size="fill" path={imageUrl} name={name} testId={ORDER_RECIPE_IMAGE_TESTID} emptyAlt="Sin receta elegida" />`
(mismo `innerHTML` con `null`/`''`/ruta y con nombre vacío o no).

### Pendiente para cuando entren T1 y T2

- `EmptyState` y `ErrorState` replican el marcado actual: el par táctil va como literal
  `'min-h-11 min-w-11'` y `ErrorState` hace la comparación con `UNEXPECTED_ERROR_CODE` él mismo.
  Antes de T14 (R7, R12) deben pasar a `touchTarget` / `touch` y a delegar en `ErrorAlert`, sin
  cambiar el DOM (los tests de T3 lo vigilan por clases y testids).

## Tanda 1 — T1, T2, T4 y T6 (frontend_dev)

### Archivos
- Creados: `lib/shared/ui/touch-target.ts`, `components/shared/error-alert.tsx`,
  `components/shared/spinner.tsx`, `components/shared/submit-button.tsx`,
  `tests/unit/shared-ui/button-touch.test.tsx`, `tests/unit/shared-ui/error-alert.test.tsx`,
  `tests/unit/shared-ui/spinner.test.tsx`, `tests/unit/shared-ui/submit-button.test.tsx`.
- Modificado: `components/ui/button.tsx` (eje `touch`, defecto `false`; `Button` lo desestructura
  para que no llegue al DOM).
- Ningún consumidor migrado (tanda 3).

### Mapa R → test
| R | Test |
|---|---|
| R5 | `button-touch.test.tsx`: literal del defecto sin `touch`; 56 combinaciones variant×size iguales con y sin `touch: false`; `touch` añade exactamente `touchTarget`; con `size="icon"`; con `variant="outline"` + `className` |
| R6 | `button-touch.test.tsx` («la constante compartida es el par de 44 px») |
| R9, R10 | `error-alert.test.tsx`: rama inesperada con referencia, no llama a `renderCatalogued`; rama de catálogo por defecto `<p>` sin referencia; rama del consumidor |
| R11 | `error-alert.test.tsx`: `role` por defecto y `role={null}`, `testId`, `id`, `className`, `withDataCode` (ambas ramas), `before`/`after` |
| R22 | `spinner.test.tsx`: `sm` por defecto con `size-4`, `inherit` sin tamaño, `aria-hidden`, icono `lucide-loader-circle`, `className` |
| R26 | `submit-button.test.tsx`: reposo, talla táctil + `className`, `pending` desde el `<form>` ancestro (disabled, `aria-busy`, etiqueta pendiente) y vuelta a reposo |

### Decisiones
- `ErrorAlert`: sin la prop `as` (design §3 la deja «solo si algún sitio lo necesita»; ninguno de
  los tres de la paridad lo necesita). `renderCatalogued` recibe el error ya estrechado a la rama de
  catálogo; un consumidor que declare `(e: ErrorState) => …` sigue siendo asignable.
- `Spinner` usa `Loader2Icon` (mismo icono que `LoaderCircleIcon`), sin `'use client'`.

### Salida de comandos (2026-10-08)
- `pnpm run typecheck`: sin errores.
- `pnpm run lint`: 0 errores, 7 warnings preexistentes en `confirm-catalog-import.test.ts` y
  `order-service.test.ts` (no tocados).
- Los 4 tests nuevos: 4 archivos, 81 tests en verde.
- `pnpm exec vitest related --run <archivos>`: 249/250 archivos, 3663 pass, 1 skip, 1 fail:
  `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx > '/pedidos' …`, que está en
  `tests/baseline-rojos.json` (rojo heredado; ver `progress/features/QC-226.md`). Falla igual aislado.
- `pnpm exec vitest run tests/unit/paridad`: 15 archivos, 125 tests en verde; snapshots sin cambios.
- `pnpm exec vitest run guard`: 58 archivos, 760 pass, 11 skip.

**Veredicto:** T1, T2, T4 y T6 hechas; Button sin `touch` idéntico y paridad intacta.

## Tanda 1 — T3, T5 y T7 (frontend_dev)

### Archivos
- Nuevos: `components/shared/empty-state.tsx`, `components/shared/error-state.tsx`,
  `components/shared/table-skeleton.tsx`, `components/shared/date-cell.tsx`,
  `lib/shared/ui/empty-mark.ts`.
- Modificados: `lib/shared/ui/date-civil.ts` (gana `formatCivilDate`; cabecera reescrita para
  decir cuál usar), `components/shared/entity-image.tsx` (gana `size` y `emptyAlt`; la rama
  `thumbnail` no cambia salvo `alt={alt}`, que vale `name` sin `emptyAlt`).
- Tests: `tests/unit/shared-ui/{empty-state,error-state,table-skeleton,date-cell,entity-image-size}.test.tsx`.

### Mapa R → test
| R | Test |
|---|---|
| R13 | `empty-state.test.tsx`, `error-state.test.tsx` |
| R14 | `error-state.test.tsx` (reintento `refresh` y `href`) |
| R15 | `table-skeleton.test.tsx` |
| R23, R24, R25 (la constante) | `date-cell.test.tsx` |
| R28 | `entity-image-size.test.tsx` |

### Salida de comandos (2026-10-08)
- `pnpm run typecheck`: sin errores.
- `pnpm run lint`: 0 errores, 7 warnings preexistentes (`confirm-catalog-import.test.ts`,
  `order-service.test.ts`); `eslint` sobre los archivos de T3/T5/T7: limpio.
- `vitest run` de los 5 tests nuevos: 5 archivos, 37 tests en verde.
- `vitest related --run` (archivos de T3/T5/T7): 207 archivos en verde, 1 rojo:
  `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx > '/pedidos' se sirve con el permiso`
  (`Cannot read properties of undefined (reading 'status')`). **Preexistente**: falla igual en el
  árbol principal sobre `dev` (`e5adaa90`), sin estos cambios.
- `vitest run tests/unit/paridad`: 15 archivos, 125 tests en verde, sin regenerar.
- `vitest run guard`: 58 archivos, 760 en verde, 11 skipped.

Veredicto: T3, T5 y T7 hechas; piezas en verde y cada copia local con su combinación de props.

- Ajuste posterior de T3: `empty-state.tsx` y `error-state.tsx` ya no llevan el literal
  `min-h-11 min-w-11`, sino `buttonVariants({ touch: true })` / `<Button touch>`. `ErrorState`
  delega la rama inesperado/catálogo en `ErrorAlert` (`before` = título, `after` = reintento); el DOM
  no cambia. `table-skeleton.tsx` no tenía nada que ajustar. typecheck y lint limpios;
  `vitest run tests/unit/shared-ui tests/unit/paridad`: 27 archivos, 278 en verde; `vitest run guard`:
  58 archivos, 760 en verde, 11 skipped.

## Tanda 2 (T8)

**Archivos**
- `components/shared/data-table/data-table-types.ts`: `DataTableStates` (`loading: TableSkeletonProps`, `error: ErrorStateProps`, `empty: EmptyStateProps`, todas opcionales) y `DataTableProps.states?`.
- `components/shared/data-table/data-table.tsx`: tres `return` tempranos (`TableSkeleton`/`ErrorState`/`EmptyState`) despues del ultimo hook (`useRef`), solo si `visibleState` coincide y la clave existe. Sin `states`, rama de siempre.
- `components/shared/data-table/index.ts`: exporta `type DataTableStates`.
- `tests/unit/shared/data-table-states-sustituyen.test.tsx` (nuevo).

**Decision:** `states.error` es `ErrorStateProps` tal cual, no `Omit<ErrorStateProps,'error'> & { error: OperationError }` (design 5.1). Equivale en tipo (`error` ya es `OperationError`), pero el `Omit` aplana la union de reintento (`retry`/`retryTestId`) y `data-table.test.tsx` prohibe `@/lib/modules` en el directorio, asi que `OperationError` no se puede importar alli.

**R -> test** (`tests/unit/shared/data-table-states-sustituyen.test.tsx`)
- R16 -> «cargando (R16)»: `TableSkeleton` es la raiz, filas = `pageSize`, sin `data-table`/barras/paginacion.
- R17 -> «error (R17)»: `ErrorState` raiz, «Reintentar», referencia del inesperado, sin filas.
- R18 -> «vacio (R18, D5)»: sin busqueda `EmptyState` raiz; con busqueda y sin `states.empty`, `data-table-empty` con barras.
- R19 -> «sin la clave del estado: como hoy (R19)» (3 casos) + `data-table.test.tsx` y `data-table-states.test.tsx` sin tocar, en verde.

**Salida**
- `pnpm run typecheck`: sin errores.
- `pnpm run lint`: 0 errors (warnings heredados ajenos a T8); eslint de los archivos tocados: sin issues.
- `vitest run` del test nuevo + `data-table.test.tsx` + `data-table-states.test.tsx`: 3 files, 41 passed.
- `vitest run tests/unit/shared tests/unit/paridad`: 50 files passed, 504 passed / 2 skipped.
- `vitest run guard`: 58 files passed, 760 passed / 11 skipped.
- `vitest related` sobre los 3 archivos: cortado a los 500 s (arrastra a todos los consumidores); hasta ahi solo el rojo heredado `pantallas-exigen-permiso.test.tsx > '/pedidos'` (baseline).

**Veredicto:** T8 hecha; `states` aditivo, sin cambio sin `states`.

## Tanda 4 (T10)

### Archivos y pieza que entró en cada uno
| Archivo | Pieza |
|---|---|
| `components/shared/confirm-action-dialog.tsx` | `touchTarget` (Cancel/Action de AlertDialog) |
| `components/shared/presentation-unit-select.tsx` | `touchTarget` |
| `components/shared/presentation-select.tsx` | `touchTarget` (tooltip, input, item, input de alta); `<Button touch>` (3 botones del alta); `Spinner` |
| `components/shared/async-autocomplete.tsx` | `Spinner` |
| `components/shared/file-field.tsx` | `<Button touch className="self-start">` |
| `components/shared/row-actions-menu.tsx` | `touchTarget` (trigger por render-prop); `ITEM_TOUCH_TARGET` se queda (valor distinto) |
| `components/shared/responsible-avatars.tsx` | `touchTarget`; `EMPTY_MARK` |
| `components/shared/shared-select.tsx` | `touchTarget` |
| `components/shared/order-distribution-label.tsx` | `EMPTY_MARK` (fuera `MISSING_NAME_MARK`) |
| `components/shared/document-upload/document-upload.tsx` | `touchTarget` + `'text-base'` en la `label`; `<Button touch className="text-base">` (3) |
| `components/shared/document-upload/document-upload-row.tsx` | `` `inline-flex ${touchTarget} items-center text-base underline` `` |
| `components/shared/document-upload/document-upload-dialog.tsx` | `` `${touchTarget} text-base` `` (triggers por render-prop) |
| `components/shared/supplier/supplier-sheet.tsx` | `touchTarget` (render-prop) |
| `components/shared/supplier/supplier-form.tsx` | `ErrorAlert` (catálogo con mensaje + código, `after` = enlace a la lista); `touchTarget` en el enlace y en Cancelar (render-prop); `<Button touch>` en Guardar |
| `components/shared/step-reader/step-reader.tsx` | `<Button touch>` en Anterior; `touchTarget` en la rama no-ejecución del primario |
| `components/shared/data-table/data-table-scroll-nav.tsx` | `touchTarget` |
| `components/shared/data-table/data-table-pagination.tsx` | `<Button touch>` (anterior/siguiente); `touchTarget` en el SelectTrigger |
| `components/shared/data-table/data-table-header-menu.tsx` | `touchTarget` |
| `components/shared/data-table/data-table-filters.tsx` | `touchTarget`; `<Button touch>` en limpiar |
| `components/shared/data-table/data-table-filter-date.tsx` | `touchTarget` en el PopoverTrigger; `<Button touch>` en los 3 atajos |

Tests: ninguno tocado (ninguno necesitaba repunte: `responsible-avatars.test.tsx` importa la marca
del barrel de pedidos y sigue en verde; `data-table-viewport` / `data-table-filter-date` solo se
repuntan con la limpieza de `formatDateLocalISO`, que es T11).

### Decisiones
- **`touch` solo en `<Button>` directo** con el par al principio del `className`: la cadena que
  produce `buttonVariants` es idéntica (base, variant, size, par, resto). En los `Button` pasados
  por `render` a un trigger de Base UI y en los no-`Button` va `touchTarget` en la misma posición
  que tenía la constante local.
- **Constantes compuestas** (`document-upload*`) en línea como plantilla con `touchTarget`, mismo
  orden de clases; no queda ninguna constante local `*TOUCH_TARGET` con el par.
- **`MISSING_RESPONSIBLES_MARK` se conserva como alias de `EMPTY_MARK`**: la reexporta
  `app/(private)/pedidos/components/index.ts`, que es D11. Su borrado pasa a QC-232. T14 debe
  tolerar el alias (no vale el literal `—`).
- **`step-document-view.tsx` NO se migró (revertido)**: `order-execution-screen.test.tsx > R18`
  cierra `components/shared/step-reader/**` a solo `step-reader.tsx`. Sigue con su
  `const TOUCH_TARGET = 'min-h-11 min-w-11'` local. **Abierto para el leader**: o se enmienda la
  lista cerrada de ese test, o T14 excluye ese archivo, o pasa a QC-232.
- **`hooks/use-async-paginated-options.ts` sin cambios**: no tiene talla, `Spinner` ni marca; su
  entrada en `Archivos esperados` es por `createUrlPageFetcher` (T11).
- `supplier-field.tsx` no se toca: su constante vale solo `min-h-11` (no es el par).
- Comentarios: se borraron los de las constantes eliminadas (citaban R<n>/QC) y el de
  `supplier-form` sobre la región de error; el del botón de ayuda de `presentation-select` se
  acortó porque afirmaba que usaba una constante local.

### Salida de comandos (2026-10-08)
- `pnpm run typecheck`: sin errores.
- `pnpm run lint`: 0 errores, 7 warnings preexistentes (`confirm-catalog-import.test.ts`,
  `order-service.test.ts`).
- `pnpm exec vitest related --run <21 archivos>`: 229 archivos, 3377 pass, 1 skip, 2 fail:
  `pantallas-exigen-permiso > '/pedidos'` (baseline) y `order-execution-screen > R18` (lista
  cerrada de step-reader, por `step-document-view.tsx`). Tras revertir ese archivo:
  `order-execution-screen.test.tsx` + `step-reader.test.tsx`: 107/107 en verde.
- `pnpm exec vitest run tests/unit/paridad`: 14/15 archivos, 124/125; el rojo es
  `pedidos-paridad > vacio en una pagina posterior` (`order-list-first-page` gana
  `border-transparent`), que viene de los cambios en curso de `app/(private)/pedidos/components/order-list-empty.tsx`
  (T9c, otro agente), no de T10. Snapshots no regenerados.
- `pnpm exec vitest run guard`: 58 archivos, 760 pass, 11 skip.

**Veredicto:** T10 hecha en 20 consumidores con DOM idéntico; `step-document-view.tsx` queda
pendiente de decisión por la lista cerrada de step-reader.
