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

## Tanda 3 (por ruta), ajustes compartidos, Tanda 5 y T14

Notas consolidadas de cada subagente (frontend_dev).

### T9d clientes
- Borrados: customer-list-empty/error/skeleton. CustomerTable gana `status`, `empty` y `buildStates`; el fallback de page.tsx usa CustomerTable status=loading. Las constantes *_TESTID pasan a customer-table.
- Repuntados: customer-list-skeleton/error/empty.test.tsx (renderizan CustomerTable) y customer-columns.test.tsx (EMPTY_MARK). customer-list-section.test.tsx sigue verde sin tocarlo.
- D4: ninguna excepción. D5 respetado. R12: ningún sitio.
- Paridad: 3 rojos por border-transparent en EmptyState/ErrorState (buttonVariants sin cn). Arreglo delegado en las piezas compartidas.
### T10 components/shared
- step-document-view.tsx sin migrar: lo bloquea la lista cerrada de order-execution-screen.test R18 (pregunta abierta).
- MISSING_RESPONSIBLES_MARK se queda como alias de EMPTY_MARK porque lo reexporta el barrel de pedidos (D11). T14 debe aceptar el alias.
- use-async-paginated-options.ts y supplier-field.tsx sin cambios (no aplica).
### T9c pedidos
- order-list-empty/error/skeleton delegan en EmptyState/ErrorState/TableSkeleton (headCellClassName h-4 w-full) sin cambiar firma ni exports; OrderRecipeImage delega en EntityImage size=fill.
- touchTarget en 11 archivos; ErrorAlert en 8 (order-cost-quote con role=null, span y prefijo); Spinner en 3; EMPTY_MARK en order-ingredients-table, order-cost-quote y order-distribution-field.
- Sin tests repuntados: order-form-quote y use-order-cost-quote no importan la marca.
- D4: la lista de pedidos no adopta `states` (D11); sus 3 locales se conservan y delegan (borrarlos va en QC-232). ORDER_CUSTOMER_DIALOG_TOUCH_TARGET sigue exportada por el barrel D11, ahora con valor touchTarget (QC-232).
- R12: packaging-select.tsx:271 pinta con <p role=alert> y ErrorAlert no tiene `as`, así que se conserva. Sin pintar (solo lógica): order-customer-dialog, order-distribution-dialog, use-order-cost-quote.ts, use-order-distribution-availability.ts.
- Paridad: 1 rojo por border-transparent (cn), el mismo arreglo compartido.
### T9b formulas
- Borrados recipe-list-empty/error, recipe-table-skeleton. RecipeTable gana status/error/empty y monta states; fallback de page usa RecipeTable status=loading. Las 4 páginas usan ErrorState con LOAD_ERROR (repetido en las 4: un labels.ts no estaba en la lista). EMPTY_CELL borrado; quitado el export de IMAGE_COLUMN_LABEL y ACTIONS_COLUMN_LABEL.
- Repuntado recipe-route-contract.test.ts (lista de archivos). Rojo pendiente de T12: el contrato táctil de recipe-route-contract.
- D4: ninguna. R12: delete-recipe-dialog.tsx:146 pinta div role=alert / p role=alert sin contenedor; necesita `as` en ErrorAlert o exclusión.
- Paridad 15/15 sin regenerar.
### T9a inventario
- Borrados product-list-empty/error, product-table-skeleton. ProductTable gana status/error/empty + productTableStates; producto terminado reutiliza productTableStates y no pasa states.empty (nunca tuvo vacío propio). Barrel: se quitan EMPTY_CELL, IMAGE_COLUMN_LABEL y ACTIONS_COLUMN_LABEL. Borrada la reexportación de formatDateLocalISO en product-batch-date-field.
- Repuntados: product-page.test, finished-stock-table.test (EMPTY_MARK). Enmienda R8 (T12) en product-route-contract y importar-route-contract: llevaLaTallaTactil + una muestra que muerde.
- D4: ninguna. R12: delete-product-dialog.tsx:94 (p role=alert sin div: falta `as`); batch-history.tsx (D11).
- Bloqueo: product-batches-panel.tsx, fuera de la lista, importa EMPTY_CELL de ./product-columns. Se deja el alias `export const EMPTY_CELL = EMPTY_MARK` en product-columns.tsx, fuera del barrel.
### ErrorAlert `as`
- Nueva prop `as?: 'div'|'p'`. packaging-select migrado con DOM idéntico.
- Siguen comparando y pintando delete-recipe-dialog y delete-product-dialog: la etiqueta cambia según la rama (div para el inesperado, p para el de catálogo). Reproducirlo exigiría volver a meter la comparación en `as`. Son excepciones de R12 que T14 debe nombrar.
### T9f unidades
- Borrados unit-list-empty/error/skeleton. UnitTable gana status/empty (clearSearchHref, firstPageHref) y monta states; las constantes UNIT_LIST_*_TESTID pasan a unit-table y el barrel las reexporta.
- Repuntados: unidades-convenciones.test.ts (13 -> 10 componentes; sale la excepción R15 del skeleton) y un comentario de unit-page.test.tsx.
- D4: ninguna. R12: ningún sitio.
- D5, para el reviewer: con una búsqueda sin resultados la ruta pinta hoy su vacío propio («La búsqueda no encontró…» y «Limpiar la búsqueda»). Para no cambiar el DOM, la sección pasa `states.empty` también con búsqueda activa, y eso choca con el comentario de DataTableStates.empty («solo sin búsqueda ni filtro activos»).
- Alias NO_EQUIVALENCE_LABEL = EMPTY_MARK: lo usan unit-columns.tsx y unit-equivalence.test.ts, fuera de la lista. T14 debe tolerarlo.
### T9e proveedores
- Borrados supplier-list-empty/error, catalog-list-empty/error, catalog-table-skeleton. La vitrina pinta ErrorState/EmptyState directamente (R20, sin DataTable) y SupplierShowcaseSkeleton se conserva (R21). CatalogTable gana status/error/empty y monta states; CATALOG_LIST_EMPTY_TESTID pasa a catalog-table. Los errores previos de [id]/page usan ErrorState (PAGE_ERROR_STATE). El vacío del catálogo se pasa también con búsqueda activa (aviso D5).
- Repuntados: supplier-route-contract.test.ts (lista de conservados), supplier-detail-page.test.tsx y catalog-columns.test.tsx (EMPTY_MARK).
- D4: ninguna. R12 (comparan y pintan, div/p según la rama): delete-catalog-line-dialog.tsx:97 y delete-supplier-dialog.tsx:84.
- Bloqueo: supplier-detail-header.tsx, fuera de la lista, importa EMPTY_CELL de ./catalog-columns. Se deja el alias en catalog-columns.tsx, fuera del barrel.
- supplier-showcase-filters.tsx sin cambios: su constante es solo min-h-11.
### T9j dashboard
- ExecutionTraceListError (interno) borrado: ExecutionTraceTable gana status=error y monta solo states.error (ErrorState sin retry, withCode=false, gap-2). ExecutionTraceDetailError delega en ErrorState. touchTarget en el checkbox, en «Ver recorrido» y en BACK_LINK_CLASS. EMPTY_MARK en el detalle.
- Sin tests repuntados.
- D4: el dashboard solo adopta states.error (design 5.4): el cargando sigue siendo el fallback y el vacío el DataTableEmpty interno. MISSING_PERSON_MARK se reexporta como alias de EMPTY_MARK porque lo exporta el barrel recorrido/[id]/components/index.ts, fuera de la lista. Nadie lo importa.
- R12: ninguno.
### T9k login
- Borrado el submit-button.tsx local (R27, design 8) y su export del barrel; login-form usa el SubmitButton compartido (label, pendingLabel, testId login-submit, className w-full).
- Paridad: la única diferencia es la de D10 (min-h-11 min-w-11 en la clase del botón, en reposo y enviando), en un commit aparte que cita D10.
- Tests del login sin tocar: login-form.test, login-form-uncontrolled-warning, login-page-marca, login-skin (69/69). El E2E login-skin.spec.ts no se ha corrido.
### T9g presentaciones
- Borrados presentation-list-empty/error/skeleton. PresentationTable gana status/error/empty y monta states; las constantes PRESENTATION_LIST_*_TESTID pasan a presentation-table. El vacío se pasa también con búsqueda activa (aviso D5).
- Sin tests repuntados: presentation-page y presentation-columns pasan importando del barrel.
- Desviación de 5.4: el error previo de página se pinta con <PresentationTable status="error">, no con ErrorState directo. page.tsx es un Server Component y no puede leer las constantes del módulo 'use client'. El DOM es el mismo.
- R12: ninguno. presentation-columns.tsx:58-59 (fuera de la lista) tiene un comentario que ha quedado desfasado.
- configuracion-convenciones.test.ts no está en Archivos esperados, pero lo cubre design 13 («los *-convenciones.test.ts que enumeran archivos se ajustan solo para quitar los borrados»). Se ajustan sus conteos.
### T9i asignacion
- AssignedOrdersError delega en ErrorState con la misma firma y los mismos testids. ErrorAlert en order-execution-error, order-execution-screen, order-cancel-dialog y packing-order-screen (x2). touch/touchTarget en los triggers, la paginación de packing-orders-list-section, order-execution-lines, los enlaces de vuelta y packing-orders-columns. EMPTY_MARK/formatCivilDate en las columnas que no son D11; borrados formatFinishedAt y el MISSING_VALUE_MARK local que nadie importaba.
- Alias: assigned-orders-columns reexporta MISSING_VALUE_MARK = EMPTY_MARK porque lo exporta el barrel (D11).
- Repuntado assigned-orders-columns.test.tsx (EMPTY_MARK, más un caso para el alias del barrel).
- D4: ninguna (la ruta no adopta states). R12: ninguno.
- Sin tocar a propósito (D7): el vacío en línea de packing-orders-list-section (packing-orders-first-page, con el literal del par) y los vacíos assigned/company/finished-orders-empty. T14 debe excluirlos, igual que los D11 de asignación que conservan el par o «—».
### T9h usuarios y grupos
- Borrados user-list-{empty,error,skeleton} y work-group-list-{empty,error,skeleton}. UserTable/WorkGroupTable ganan status/error/empty y montan states; las constantes pasan a las tablas y el barrel las reexporta. Los fallbacks de page.tsx usan las tablas con status=loading. ErrorAlert y touch/touchTarget en diálogos, formularios y work-group-members. toDateInputValue delega en formatCivilDate. user-table.tsx sale con el diff entero por el paso de CRLF a LF (.gitattributes).
- Repuntados: grupos/work-group-list-{empty,error,skeleton}.test, user-list-empty.test, work-group-columns.test (un comentario) y usuarios-convenciones.test (31 -> 25 componentes).
- D4: ninguna. El vacío se pasa también con búsqueda activa (aviso D5). R12: ninguno.
- D13: WorkGroupRowActions conserva su TOUCH_TARGET local (work-group-columns.tsx:73). T14 debe excluirlo.
- BLOQUEO: tests/unit/configuracion-ui/grupos/alcance.test.ts (QC-85, basado en diff) da 3 rojos. Toma work-group-table.tsx como archivo central de QC-85, así que su ancla cree que esta rama es la de QC-85. Además, archivosDeLaPantalla() hace git diff --name-only sin excluir los borrados y da ENOENT. No está en la lista ni lo cubre design 13: se devuelve al leader.
- T10: step-document-view.tsx fuera de alcance, va en QC-232 (decisión del humano). T14 lo excluye explícitamente.
### T14 guardia
- tests/guards/guard-piezas-base.test.ts: 24 casos, AST de TypeScript. Seis reglas (par en constante, par literal, compara-inesperado, local-borrado, marca en constante, símbolo borrado), comprobaciones positivas y R33 por diff contra el merge-base con origin/dev (skip ruidoso fuera de la rama). Exclusiones nombradas: D11, D7 (añade conditioning-orders-empty.tsx), el vacío en línea de packing-orders-list-section, step-document-view (QC-232), WorkGroupRowActions (D13), las fuentes de R12, los 4 diálogos div/p, los alias de R31 y establecer-contrasena. Usos solo de lógica nombrados: incluye components/shared/document-upload/labels.ts. Sin huecos.

### T11, T12 y T13
- T11 (R31): se borran `createUrlPageFetcher` y `PageParamNames` de `hooks/use-async-paginated-options.ts`, y la reexportación de `formatDateLocalISO` de `data-table-filter-date.tsx`. Se repuntan `data-table-filter-date.test.tsx` y `data-table-viewport.test.tsx`.
- T12 (R8): `recipe-route-contract.test.ts` gana `llevaLaTallaTactil` y `constantesTactilesDe`, y una muestra que muerde (`<Button>` sin `touch`, `touch={false}`, `buttonVariants({touch:false})`, `ontouchstart`). El caso `touch={false}` se añade también a los dos contratos de inventario.
- T13 (R32): `migracion-listas-alcance.test.ts`, caso «R30 (enmendado el 2026-10-08)», y una nota fechada bajo R30/D12 en `specs/QC-56-…/requirements.md`. La de QC-102 va en QC-232.
- `configuracion-convenciones.test.ts` (design 13, «los *-convenciones que enumeran archivos»): los conteos pasan de 11 a 8 y de `>10` a `>7`, por los 3 archivos borrados de presentaciones.

## Consolidado (T15)

### Mapa R → test
| R | Test |
|---|---|
| R1, R2, R16-R18 | `tests/unit/paridad/*-paridad.test.tsx` (15 archivos, 125 snapshots). Solo cambia `login-paridad`, en el commit `73834fb4`, por la excepción declarada en D10 |
| R3 | Capturas «después»: **pendiente (T16)**, a la espera de QC-230 |
| R4 | Tests repuntados de cada ruta (arriba), con las mismas aserciones; la suite completa en CI |
| R5 | `tests/unit/shared-ui/button-touch.test.tsx` |
| R6, R7, R12, R21, R25, R29, R31, R33 | `tests/guards/guard-piezas-base.test.ts` |
| R8 | `product-route-contract`, `importar-route-contract` y `recipe-route-contract`, cada uno con su caso «R8 — …» |
| R9-R11 | `tests/unit/shared-ui/error-alert.test.tsx` (con `as`) y `error-alert-paridad` |
| R13, R14 | `tests/unit/shared-ui/empty-state.test.tsx`, `error-state.test.tsx` |
| R15 | `tests/unit/shared-ui/table-skeleton.test.tsx` |
| R16-R19 | `tests/unit/shared/data-table-states-sustituyen.test.tsx`. `data-table.test.tsx` y `data-table-states.test.tsx` no se han tocado |
| R20 | La paridad de proveedores, recetas (las 4 páginas), pedidos y asignación |
| R22 | `tests/unit/shared-ui/spinner.test.tsx` y la paridad |
| R23, R24 | `tests/unit/shared-ui/date-cell.test.tsx` |
| R26, R27 | `tests/unit/shared-ui/submit-button.test.tsx`, `login-paridad` y `tests/unit/login-form.test.tsx` (sin editar). La parte de `establecer-contrasena` está **pendiente (T9l)** |
| R28, R29 | `tests/unit/shared-ui/entity-image-size.test.tsx`, `order-form-image-paridad` |
| R30 | `tests/guards/guard-dependencias-aprobadas.test.ts` (sin cambios: no entra ninguna dependencia) |
| R32 | `tests/unit/shared/migracion-listas-alcance.test.ts`, enmendado |

### Excepciones de D4
- Pedidos (D11): la lista no adopta `states`; sus 3 locales y `OrderRecipeImage` delegan en las piezas compartidas. `ORDER_CUSTOMER_DIALOG_TOUCH_TARGET` sigue exportada y ahora vale `touchTarget`.
- Dashboard: solo `states.error`, como dice design 5.4.
- Producto terminado: no pasa `states.empty`, porque nunca tuvo un vacío propio.
- Presentaciones: el error previo de página se pinta con `<PresentationTable status="error">` y no con `ErrorState` directo, porque el módulo de constantes es `'use client'`.
- D5: en catálogo, unidades, presentaciones, usuarios y grupos, la sección pasa `states.empty` también con búsqueda activa, porque hoy se ve el vacío de la sección. El snapshot no cambia, pero choca con el comentario de `DataTableStates.empty`. Tiene que mirarlo el reviewer.

### Sitios de R12 que conservan la comparación
- Pintan, y la etiqueta cambia según la rama (`div`/`p`): `delete-recipe-dialog`, `delete-product-dialog`, `delete-catalog-line-dialog` y `delete-supplier-dialog`. Están excluidos y nombrados en la guardia.
- Solo lógica, sin pintar: `order-customer-dialog`, `order-distribution-dialog`, `use-order-cost-quote.ts`, `use-order-distribution-availability.ts`, `packaging-select.tsx` (la lógica de la línea ~82) y `components/shared/document-upload/labels.ts`.

### Pendiente
- T9l (`establecer-contrasena`): espera a que el leader compruebe el choque con QC-96.
- T16 (capturas «después»): espera a QC-230.
- Bloqueos de tests de alcance basados en diff (`progress/features/QC-231.md > Preguntas abiertas`): `grupos/alcance.test.ts` (3 rojos) y `shared/data-table-alcance.test.ts` (1 rojo).
- Alias `EMPTY_CELL` en `product-columns.tsx` y `catalog-columns.tsx`, que importan archivos fuera de la lista (`product-batches-panel.tsx`, `supplier-detail-header.tsx`).

### Salida real de `./init.sh` (modo rápido, 2026-10-08, HEAD `a5e843eb`)
```
test:rapido (vitest related sobre el diff de la rama)
 FAIL  |ui| tests/unit/navegacion/pantallas-exigen-permiso.test.tsx > ... > '/pedidos' se sirve con el permiso, sin 404 ni redirección
 Test Files  1 failed | 267 passed (268)
      Tests  1 failed | 3893 passed | 10 skipped (3904)
guardias
 Test Files  59 passed (59)
      Tests  784 passed | 11 skipped (795)
[test:rapido] 3 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
== init OK ==
```
El único rojo está en `tests/baseline-rojos.json`: es heredado de `dev` y ya fallaba sin esta rama. `vitest related` no selecciona los dos tests de alcance basados en diff (`grupos/alcance.test.ts` y `shared/data-table-alcance.test.ts`), que en CI saldrán rojos (ver Pendiente).

### E2E
No se ha escrito ni tocado ningún spec de `e2e/`, así que no se corre ninguno en local (design 18: `e2e/login-skin.spec.ts` y `e2e/errores.spec.ts` sin editar, y corren en CI).

## Tras las decisiones del humano del 2026-10-08
- Merge de `origin/dev` (con QC-230, #182): sin conflictos y sin migraciones.
- T9l `4d65bd6b`: `establecer-contrasena/[token]/components/submit-button.tsx` delega en el `SubmitButton` compartido, con la misma firma y el testid `set-credential-submit`. El botón gana `min-w-11`, que es la excepción de D12 y no se ve en un botón `w-full`. `set-credential-form.test.tsx` y `scope.test.ts` pasan sin tocarlos (131/131), y el diff de la ruta es un solo archivo.
- Tests de alcance con el ancla endurecida:
  - `grupos/alcance.test.ts` (QC-85) se activa solo si la rama es exactamente `feature/QC-85-pantalla-de-grupos-de-trabajo`: se lee con `git rev-parse` y, si sale `HEAD`, con `GITHUB_HEAD_REF`. El diff usa `--diff-filter=d`. La señal antigua de las dos piezas solo la usa ya el ancla. Hay muestras nuevas (igualdad exacta, `null`/`HEAD`, QC-67 y QC-231 no cuentan). Los casos de «filtro de columna» y «fetch» ganan la misma comprobación de rama.
  - `shared/data-table-alcance.test.ts` (QC-56) usa el mismo ancla por nombre de rama, con muestras. **No se le pone `--diff-filter=d`:** ese test no lee archivos, solo lista nombres, y con el filtro un borrado en la tabla compartida dejaría de contar para R20 y R28, lo que los debilitaría.
- `guard-piezas-base`: los alias `EMPTY_CELL` citan ya QC-232.

### Salida final (2026-10-08, tras el merge de dev, HEAD `92b2692c` + bitácora)
`./init.sh` (rápido): `== init OK ==`
```
related:        Test Files 1 failed | 269 passed (270)   Tests 1 failed | 3927 passed | 30 skipped
  FAIL pantallas-exigen-permiso > '/pedidos'                    (baseline)
tests de árbol: Test Files 2 failed | 97 passed (99)     Tests 2 failed | 1366 passed | 28 skipped
  FAIL recetas/module-contract.test.ts, recetas/scope.test.ts    (baseline)
```
Los tres rojos están en `tests/baseline-rojos.json` y son deuda heredada de `dev`.

A mano, `pnpm exec vitest run tests/unit/configuracion-ui/grupos/alcance.test.ts tests/unit/shared`:
```
 Test Files  36 passed (36)
      Tests  402 passed | 20 skipped (422)
```
Los 20 saltados son los 18 casos de QC-85 y los 2 de QC-56 (R20 y R28). Saltan con su motivo escrito porque esta no es la rama de su feature.
