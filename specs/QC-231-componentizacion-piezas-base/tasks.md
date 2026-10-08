# QC-231 — componentizacion-piezas-base · tasks

**Verificación de cada tanda.** Al cerrar cada tanda se corre `pnpm run typecheck`,
`pnpm run lint`, `pnpm exec vitest related --run <archivos>` y `pnpm exec vitest run guard`.
**Nunca `pnpm test`.**

**Commits.** Uno por task, o por ruta en la tanda 3.

**Comentarios.** No se cita `QC-<n>` ni `R<n>` en producción. Al tocar una línea se limpian sus
comentarios (`docs/conventions.md > Comentarios`).

## Tanda 0 — Congelar el «antes» (bloquea todo lo demás)

- [ ] **T0. Paridad del árbol accesible** (R1, R2, R16-R18, R20, D9).
  - **Qué se escribe:**
    - el helper `tests/unit/paridad/arbol-accesible.ts` (`design.md > 12.1`);
    - un `*-paridad.test.tsx` por cada lista de `design.md > 5.4` y `5.5`, con los estados filas,
      cargando, vacío, sin resultados, error de catálogo y error inesperado;
    - `login-paridad.test.tsx`, en reposo y enviando;
    - `order-form-image-paridad.test.tsx`, con y sin imagen;
    - `error-alert-paridad.test.tsx`, una muestra por forma de `design.md > 3`.
  - **Hecho cuando:**
    - los snapshots se generan contra el código **sin tocar** y se commitean solos, en
      `test(QC-231): congela la paridad`;
    - la suite pasa en verde;
    - no se ha cambiado ni un archivo de producción.

## Tanda 1 — Piezas compartidas, con sus tests (todas [P] entre sí; dependen de T0)

- [ ] **T1 [P]. Talla táctil** (R5, R6).
  - **Qué se escribe:**
    - `lib/shared/ui/touch-target.ts`;
    - el eje `touch` en `components/ui/button.tsx`;
    - `tests/unit/shared-ui/button-touch.test.tsx`.
  - **Hecho cuando:** el test prueba tres cosas:
    - sin `touch`, las clases son idénticas a las de hoy;
    - con `touch`, se añade exactamente `touchTarget`;
    - `touch` se combina con `size="icon"` y con `variant="outline"`.
- [ ] **T2 [P]. `ErrorAlert`** (R9-R11).
  - **Qué se escribe:** `components/shared/error-alert.tsx` y
    `tests/unit/shared-ui/error-alert.test.tsx`.
  - **Hecho cuando:** el test prueba que:
    - la rama inesperada pinta `unexpected-error-notice` y su referencia;
    - la rama de catálogo pinta sin referencia;
    - `role`, `testId`, `id`, `className`, `data-code` y `renderCatalogued` se respetan.
- [ ] **T3 [P]. `EmptyState`, `ErrorState`, `TableSkeleton`** (R13-R15).
  - **Inventario previo:** las copias locales (`design.md > 5.4`), para fijar las props de
    variación (`withImage`, `headCellClassName`…). Se anota en `progress/impl_QC-231-…md`.
  - **Tests:**
    - `tests/unit/shared-ui/empty-state.test.tsx`;
    - `tests/unit/shared-ui/error-state.test.tsx`: reintento `refresh` y reintento `href`;
    - `tests/unit/shared-ui/table-skeleton.test.tsx`: filas, columnas, imagen, `role="status"` y
      `aria-busy`.
  - **Hecho cuando:** los tests están en verde y cada copia local tiene su combinación de props
    escrita en el impl.
- [ ] **T4 [P]. `Spinner`** (R22): `components/shared/spinner.tsx` y
  `tests/unit/shared-ui/spinner.test.tsx`, con `size="sm"` / `inherit` y `aria-hidden`.
- [ ] **T5 [P]. Fecha y marca** (R23-R25).
  - **Qué se escribe:**
    - `formatCivilDate` en `lib/shared/ui/date-civil.ts`;
    - `lib/shared/ui/empty-mark.ts`;
    - `components/shared/date-cell.tsx`;
    - `tests/unit/shared-ui/date-cell.test.tsx`.
  - **Hecho cuando:** el test compara `formatCivilDate` con `toISOString().slice(0, 10)` en
    instantes alrededor de la medianoche UTC, y comprueba que `DateCell` no añade ningún elemento.
- [ ] **T6 [P]. `SubmitButton`** (R26): `components/shared/submit-button.tsx` y
  `tests/unit/shared-ui/submit-button.test.tsx`.
  - **Hecho cuando:** el test prueba `pending` desde un `<form>` ancestro, `disabled`, `aria-busy`,
    las dos etiquetas, `touch` y el `testId`.
- [ ] **T7 [P]. `EntityImage` con `size`** (R28):
  `tests/unit/shared-ui/entity-image-size.test.tsx`.
  - **Hecho cuando:** `fill` reproduce el marcado de `OrderRecipeImage` (envoltorio, `key`, `alt`
    vacío y marcador) y `thumbnail` no cambia.

## Tanda 2 — La `DataTable` y sus estados (depende de T3)

- [ ] **T8. `states` en la `DataTable`** (R16-R19).
  - **Qué se toca:** `data-table-types.ts`, `data-table.tsx` (el `return` temprano va después de los
    hooks) y `index.ts`, que exporta `type DataTableStates`.
  - **Test:** `tests/unit/shared/data-table-states-sustituyen.test.tsx`. Con `states`, cargando,
    error y vacío no pintan `data-table`, ni las barras, ni la paginación. Sin `states.empty` y con
    búsqueda activa, sigue `data-table-empty` con barras.
  - **Hecho cuando:** ese test está en verde, `data-table.test.tsx` y `data-table-states.test.tsx`
    pasan **sin tocarlos** y la guardia de anclas está en verde.

## Tanda 3 — Migración por ruta (depende de T1-T8; cada ruta es [P] respecto de las demás)

**Qué se hace en cada ruta:**
- la talla táctil (`touch` o `touchTarget`);
- `ErrorAlert`;
- `states` en la tabla de la ruta, el `fallback` y la sección (`design.md > 5.3`);
- `Spinner`;
- `formatCivilDate` / `DateCell` / `EMPTY_MARK`;
- borrar los locales;
- actualizar el barrel, trasladando las constantes `*_TESTID` que se conservan;
- repuntar los tests de la ruta (`design.md > 13`).

**Hecho cuando, en cada ruta:**
- su paridad de T0 pasa **sin regenerar** el snapshot;
- sus tests están en verde;
- `vitest related` está en verde;
- toda excepción de D4 queda anotada en el impl.

- [ ] **T9a [P]. `inventario`**, incluidos `importar/` y producto terminado.
- [ ] **T9b [P]. `produccion/formulas`**: la lista, las 4 páginas con `RecipeListError` e
  `importar/`.
- [ ] **T9c [P]. `pedidos`**, incluido `OrderRecipeImage` → `EntityImage` (R29). Incluye la
  enmienda de `guard-pantalla-pedidos-se-amplia.test.ts` (R32).
- [ ] **T9d [P]. `clientes`.**
- [ ] **T9e [P]. `proveedores`** (la vitrina) y `proveedores/[id]`, con el catálogo, `importar/` y
  los errores previos de la página.
- [ ] **T9f [P]. `configuracion/unidades`.**
- [ ] **T9g [P]. `configuracion/presentaciones`.**
- [ ] **T9h [P]. `configuracion/usuarios`**: usuarios y grupos. `UserStatusBadge` y
  `WorkGroupRowActions` se quedan como están (pregunta abierta 2).
- [ ] **T9i [P]. `asignacion`.** Se hace:
  - la talla táctil y `ErrorAlert` en las pantallas de ejecución, empaque y acondicionamiento;
  - `ErrorState` en lugar de `AssignedOrdersError` en las 6 secciones;
  - `EMPTY_MARK` y `formatCivilDate` en las columnas.

  **No** se tocan los vacíos ni los esqueletos de las 5 listas (D7, R33).
- [ ] **T9j [P]. `dashboard`**: lista y detalle de recorridos.
- [ ] **T9k [P]. `(public)/login`** (R27). Su paridad pasa con la única excepción declarada, en
  un commit aparte que cita D10.

## Tanda 4 — `components/shared` (depende de T1, T2, T4 y T5; [P] con la tanda 3)

- [ ] **T10.** La talla táctil, `Spinner` y `EMPTY_MARK` en los consumidores compartidos de
  `Archivos esperados` (`data-table/*`, `document-upload/*`, `supplier/*`, `step-reader/*`,
  pickers y selects). Entra también `ErrorAlert` en `supplier/supplier-form.tsx`.
  - **Hecho cuando:** los tests de esos componentes y la paridad están en verde.

## Tanda 5 — Limpieza, enmiendas y guardia (depende de la tanda 3 y de T10)

- [ ] **T11. Limpieza** (R31): `createUrlPageFetcher`, las reexportaciones de `formatDateLocalISO` y
  las de etiquetas del barrel de inventario.
  - **Hecho cuando:** typecheck y lint están en verde y `vitest related` cubre los tests repuntados.
- [ ] **T12. Enmienda de los 3 tests de contrato táctil** (R8, `design.md > 2`).
  - **Hecho cuando:** los tres están en verde contra el código migrado. La muestra nueva prueba que
    un `<Button>` sin `touch` ni `touchTarget` **sigue fallando**.
- [ ] **T13. Enmienda de `migracion-listas-alcance.test.ts:228`** (R32), y la línea fechada en
  `specs/QC-56-…/requirements.md` y en `specs/QC-102-…/requirements.md` (`design.md > 14`).
- [ ] **T14. `tests/guards/guard-piezas-base.test.ts`** (R6, R7, R12, R21, R25, R29, R31, R33).
  - **Qué comprueba:** recorre `app/`, `components/` y `hooks/` y busca:
    - constantes con el par táctil;
    - el literal del par;
    - la comparación con `UNEXPECTED_ERROR_CODE` fuera de `ErrorAlert`;
    - los locales de estado que ya no deben existir;
    - constantes que valgan `—`;
    - los símbolos borrados.

    Lleva sus exclusiones (establecer, los vacíos y esqueletos de asignación, y `ITEM_TOUCH_TARGET` y
    compañía, cuyo valor es distinto). Por diff contra `origin/dev`, con `skip` ruidoso fuera de la
    rama, comprueba que no se tocan los archivos de R33.
  - **Hecho cuando:** está en verde y tiene una muestra que muerde por cada regla.

## Tanda 6 — Cierre (depende de todo lo anterior)

- [ ] **T15. `./init.sh` en verde**, y `progress/impl_QC-231-componentizacion-piezas-base.md` con:
  - el mapa R → test (`design.md > 18`);
  - el inventario de T3;
  - las excepciones de D4;
  - los sitios de R12 que conservan la comparación sin pintar.
- [ ] **T16. Capturas «después»** (R3) en `_trabajo/marca/capturas-despues/`, con el seed demo de
  QC-230. Son las mismas pantallas y estados que en `capturas-antes/`. **Bloqueada mientras QC-230
  no esté mergeada** (pregunta abierta 3).
  - **Hecho cuando:** cada captura «antes» tiene su pareja, y la tabla de parejas queda lista para
    el reviewer.

## Archivos esperados

### Piezas nuevas o ampliadas
- `components/ui/button.tsx`
- `lib/shared/ui/touch-target.ts`
- `lib/shared/ui/empty-mark.ts`
- `lib/shared/ui/date-civil.ts`
- `components/shared/error-alert.tsx`
- `components/shared/empty-state.tsx`
- `components/shared/error-state.tsx`
- `components/shared/table-skeleton.tsx`
- `components/shared/spinner.tsx`
- `components/shared/date-cell.tsx`
- `components/shared/submit-button.tsx`
- `components/shared/entity-image.tsx`
- `components/shared/data-table/data-table.tsx`
- `components/shared/data-table/data-table-types.ts`
- `components/shared/data-table/index.ts`

### `components/shared` (consumidores)
- `components/shared/confirm-action-dialog.tsx`
- `components/shared/presentation-unit-select.tsx`
- `components/shared/presentation-select.tsx`
- `components/shared/async-autocomplete.tsx`
- `components/shared/file-field.tsx`
- `components/shared/row-actions-menu.tsx`
- `components/shared/responsible-avatars.tsx`
- `components/shared/shared-select.tsx`
- `components/shared/order-distribution-label.tsx`
- `components/shared/document-upload/document-upload.tsx`
- `components/shared/document-upload/document-upload-row.tsx`
- `components/shared/document-upload/document-upload-dialog.tsx`
- `components/shared/supplier/supplier-sheet.tsx`
- `components/shared/supplier/supplier-form.tsx`
- `components/shared/supplier/supplier-field.tsx`
- `components/shared/step-reader/step-reader.tsx`
- `components/shared/step-reader/step-document-view.tsx`
- `components/shared/data-table/data-table-scroll-nav.tsx`
- `components/shared/data-table/data-table-pagination.tsx`
- `components/shared/data-table/data-table-header-menu.tsx`
- `components/shared/data-table/data-table-filters.tsx`
- `components/shared/data-table/data-table-filter-date.tsx`
- `hooks/use-async-paginated-options.ts`

### `app/(public)/login`
- `app/(public)/login/components/submit-button.tsx`
- `app/(public)/login/components/login-form.tsx`
- `app/(public)/login/components/index.ts`

### `inventario`
- `app/(private)/inventario/page.tsx`
- `app/(private)/inventario/components/index.ts`
- `app/(private)/inventario/components/product-list-section.tsx`
- `app/(private)/inventario/components/product-table.tsx`
- `app/(private)/inventario/components/product-table-skeleton.tsx`
- `app/(private)/inventario/components/product-list-empty.tsx`
- `app/(private)/inventario/components/product-list-error.tsx`
- `app/(private)/inventario/components/product-columns.tsx`
- `app/(private)/inventario/components/finished-stock-list-section.tsx`
- `app/(private)/inventario/components/finished-stock-table.tsx`
- `app/(private)/inventario/components/finished-stock-columns.tsx`
- `app/(private)/inventario/components/product-batch-date-field.tsx`
- `app/(private)/inventario/components/delete-product-dialog.tsx`
- `app/(private)/inventario/components/product-field.tsx`
- `app/(private)/inventario/components/batch-history.tsx`
- `app/(private)/inventario/components/product-batches-sheet.tsx`
- `app/(private)/inventario/components/adjust-batch-dialog.tsx`
- `app/(private)/inventario/components/product-form.tsx`
- `app/(private)/inventario/components/product-sheet.tsx`
- `app/(private)/inventario/components/product-name-picker.tsx`
- `app/(private)/inventario/importar/page.tsx`
- `app/(private)/inventario/importar/components/inventory-import-screen.tsx`
- `app/(private)/inventario/importar/components/import-upload-field.tsx`
- `app/(private)/inventario/importar/components/import-template-button.tsx`
- `app/(private)/inventario/importar/components/import-result-summary.tsx`
- `app/(private)/inventario/importar/components/import-preview-table.tsx`
- `app/(private)/inventario/importar/components/import-preview-summary.tsx`
- `app/(private)/inventario/importar/components/import-missing-catalog.tsx`
- `app/(private)/inventario/importar/components/import-dialog-parts.tsx`
- `app/(private)/inventario/importar/components/import-create-unit-dialog.tsx`
- `app/(private)/inventario/importar/components/import-texts.ts`

### `produccion/formulas`
- `app/(private)/produccion/formulas/page.tsx`
- `app/(private)/produccion/formulas/nueva/page.tsx`
- `app/(private)/produccion/formulas/[id]/page.tsx`
- `app/(private)/produccion/formulas/[id]/versiones/nueva/page.tsx`
- `app/(private)/produccion/formulas/[id]/versiones/[versionId]/page.tsx`
- `app/(private)/produccion/formulas/components/index.ts`
- `app/(private)/produccion/formulas/components/recipe-list-section.tsx`
- `app/(private)/produccion/formulas/components/recipe-table.tsx`
- `app/(private)/produccion/formulas/components/recipe-table-skeleton.tsx`
- `app/(private)/produccion/formulas/components/recipe-list-empty.tsx`
- `app/(private)/produccion/formulas/components/recipe-list-error.tsx`
- `app/(private)/produccion/formulas/components/recipe-columns.tsx`
- `app/(private)/produccion/formulas/components/recipe-version-list.tsx`
- `app/(private)/produccion/formulas/components/recipe-version-form.tsx`
- `app/(private)/produccion/formulas/components/recipe-steps-field.tsx`
- `app/(private)/produccion/formulas/components/recipe-step-editor.tsx`
- `app/(private)/produccion/formulas/components/recipe-lines-field.tsx`
- `app/(private)/produccion/formulas/components/recipe-form.tsx`
- `app/(private)/produccion/formulas/components/propagate-versions-dialog.tsx`
- `app/(private)/produccion/formulas/components/product-picker.tsx`
- `app/(private)/produccion/formulas/components/delete-recipe-dialog.tsx`
- `app/(private)/produccion/formulas/importar/[documentoId]/page.tsx`
- `app/(private)/produccion/formulas/importar/[documentoId]/components/formula-name-clash.tsx`
- `app/(private)/produccion/formulas/importar/[documentoId]/components/formula-ingredient-row.tsx`
- `app/(private)/produccion/formulas/importar/[documentoId]/components/formula-import-summary.tsx`
- `app/(private)/produccion/formulas/importar/[documentoId]/components/formula-import-review.tsx`

### `pedidos`
- `app/(private)/pedidos/page.tsx`
- `app/(private)/pedidos/components/index.ts`
- `app/(private)/pedidos/components/order-list-section.tsx`
- `app/(private)/pedidos/components/order-table.tsx`
- `app/(private)/pedidos/components/order-list-skeleton.tsx`
- `app/(private)/pedidos/components/order-list-empty.tsx`
- `app/(private)/pedidos/components/order-list-error.tsx`
- `app/(private)/pedidos/components/order-columns.tsx`
- `app/(private)/pedidos/components/order-recipe-image.tsx`
- `app/(private)/pedidos/components/order-form.tsx`
- `app/(private)/pedidos/components/order-ingredients-table.tsx`
- `app/(private)/pedidos/components/order-cost-quote.tsx`
- `app/(private)/pedidos/components/recipe-version-select.tsx`
- `app/(private)/pedidos/components/order-field.tsx`
- `app/(private)/pedidos/components/recipe-picker.tsx`
- `app/(private)/pedidos/components/order-distribution-field.tsx`
- `app/(private)/pedidos/components/packaging-select.tsx`
- `app/(private)/pedidos/components/order-distribution-dialog.tsx`
- `app/(private)/pedidos/components/order-sheet.tsx`
- `app/(private)/pedidos/components/order-customer-picker.tsx`
- `app/(private)/pedidos/components/order-responsibles.tsx`
- `app/(private)/pedidos/components/order-customer-dialog.tsx`
- `app/(private)/pedidos/components/delete-order-dialog.tsx`
- `app/(private)/pedidos/components/cancel-order-dialog.tsx`
- `app/(private)/pedidos/components/blocked-order-dialog.tsx`

### `clientes`
- `app/(private)/clientes/page.tsx`
- `app/(private)/clientes/components/index.ts`
- `app/(private)/clientes/components/customer-list-section.tsx`
- `app/(private)/clientes/components/customer-table.tsx`
- `app/(private)/clientes/components/customer-list-skeleton.tsx`
- `app/(private)/clientes/components/customer-list-empty.tsx`
- `app/(private)/clientes/components/customer-list-error.tsx`
- `app/(private)/clientes/components/customer-columns.tsx`
- `app/(private)/clientes/components/customer-form.tsx`
- `app/(private)/clientes/components/customer-sheet.tsx`
- `app/(private)/clientes/components/customer-row-actions.tsx`
- `app/(private)/clientes/components/delete-customer-dialog.tsx`

### `proveedores`
- `app/(private)/proveedores/components/index.ts`
- `app/(private)/proveedores/components/supplier-showcase-section.tsx`
- `app/(private)/proveedores/components/supplier-showcase-row.tsx`
- `app/(private)/proveedores/components/supplier-showcase-list.tsx`
- `app/(private)/proveedores/components/supplier-showcase-filters.tsx`
- `app/(private)/proveedores/components/supplier-list-empty.tsx`
- `app/(private)/proveedores/components/supplier-list-error.tsx`
- `app/(private)/proveedores/[id]/page.tsx`
- `app/(private)/proveedores/[id]/components/index.ts`
- `app/(private)/proveedores/[id]/components/catalog-list-section.tsx`
- `app/(private)/proveedores/[id]/components/catalog-table.tsx`
- `app/(private)/proveedores/[id]/components/catalog-table-skeleton.tsx`
- `app/(private)/proveedores/[id]/components/catalog-list-empty.tsx`
- `app/(private)/proveedores/[id]/components/catalog-list-error.tsx`
- `app/(private)/proveedores/[id]/components/catalog-columns.tsx`
- `app/(private)/proveedores/[id]/components/catalog-line-sheet.tsx`
- `app/(private)/proveedores/[id]/components/catalog-line-form.tsx`
- `app/(private)/proveedores/[id]/components/unit-select.tsx`
- `app/(private)/proveedores/[id]/components/supplier-not-found.tsx`
- `app/(private)/proveedores/[id]/components/delete-supplier-dialog.tsx`
- `app/(private)/proveedores/[id]/components/delete-catalog-line-dialog.tsx`
- `app/(private)/proveedores/[id]/importar/[documentoId]/page.tsx`
- `app/(private)/proveedores/[id]/importar/[documentoId]/components/new-presentation-units.tsx`
- `app/(private)/proveedores/[id]/importar/[documentoId]/components/crop-picker.tsx`
- `app/(private)/proveedores/[id]/importar/[documentoId]/components/catalog-import-summary.tsx`
- `app/(private)/proveedores/[id]/importar/[documentoId]/components/catalog-import-row.tsx`
- `app/(private)/proveedores/[id]/importar/[documentoId]/components/catalog-import-review.tsx`

### `configuracion`
- `app/(private)/configuracion/unidades/page.tsx`
- `app/(private)/configuracion/unidades/components/index.ts`
- `app/(private)/configuracion/unidades/components/unit-list-section.tsx`
- `app/(private)/configuracion/unidades/components/unit-table.tsx`
- `app/(private)/configuracion/unidades/components/unit-list-skeleton.tsx`
- `app/(private)/configuracion/unidades/components/unit-list-empty.tsx`
- `app/(private)/configuracion/unidades/components/unit-list-error.tsx`
- `app/(private)/configuracion/unidades/components/unit-equivalence.ts`
- `app/(private)/configuracion/unidades/components/unit-sheet.tsx`
- `app/(private)/configuracion/unidades/components/unit-form.tsx`
- `app/(private)/configuracion/unidades/components/unit-row-actions.tsx`
- `app/(private)/configuracion/unidades/components/delete-unit-dialog.tsx`
- `app/(private)/configuracion/presentaciones/page.tsx`
- `app/(private)/configuracion/presentaciones/components/index.ts`
- `app/(private)/configuracion/presentaciones/components/presentation-list-section.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-table.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-list-skeleton.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-list-empty.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-list-error.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-sheet.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-row-actions.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-form.tsx`
- `app/(private)/configuracion/presentaciones/components/delete-presentation-dialog.tsx`
- `app/(private)/configuracion/usuarios/page.tsx`
- `app/(private)/configuracion/usuarios/components/index.ts`
- `app/(private)/configuracion/usuarios/components/user-list-section.tsx`
- `app/(private)/configuracion/usuarios/components/user-table.tsx`
- `app/(private)/configuracion/usuarios/components/user-list-skeleton.tsx`
- `app/(private)/configuracion/usuarios/components/user-list-empty.tsx`
- `app/(private)/configuracion/usuarios/components/user-list-error.tsx`
- `app/(private)/configuracion/usuarios/components/user-labels.ts`
- `app/(private)/configuracion/usuarios/components/user-form.tsx`
- `app/(private)/configuracion/usuarios/components/user-sheet.tsx`
- `app/(private)/configuracion/usuarios/components/user-create-action.tsx`
- `app/(private)/configuracion/usuarios/components/user-status-dialog.tsx`
- `app/(private)/configuracion/usuarios/components/delete-user-dialog.tsx`
- `app/(private)/configuracion/usuarios/components/end-user-sessions-dialog.tsx`
- `app/(private)/configuracion/usuarios/components/usuarios-tabs-switch.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-list-section.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-table.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-list-skeleton.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-list-empty.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-list-error.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-columns.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-create-action.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-members.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-form.tsx`
- `app/(private)/configuracion/usuarios/components/delete-work-group-dialog.tsx`

### `asignacion` (sin los vacíos ni los esqueletos de las 5 listas: D7)
- `app/(private)/asignacion/components/index.ts`
- `app/(private)/asignacion/components/assigned-orders-error.tsx`
- `app/(private)/asignacion/components/assigned-orders-list-section.tsx`
- `app/(private)/asignacion/components/company-orders-list-section.tsx`
- `app/(private)/asignacion/components/finished-orders-list-section.tsx`
- `app/(private)/asignacion/components/conditioning-orders-list-section.tsx`
- `app/(private)/asignacion/components/conditioned-orders-list-section.tsx`
- `app/(private)/asignacion/components/packing-orders-list-section.tsx`
- `app/(private)/asignacion/components/assigned-orders-columns.tsx`
- `app/(private)/asignacion/components/company-orders-columns.tsx`
- `app/(private)/asignacion/components/finished-orders-columns.tsx`
- `app/(private)/asignacion/components/conditioning-orders-columns.tsx`
- `app/(private)/asignacion/components/packing-orders-columns.tsx`
- `app/(private)/asignacion/components/order-distribution-full.tsx`
- `app/(private)/asignacion/components/assignment-view-tabs.tsx`
- `app/(private)/asignacion/components/assigned-order-start-trigger.tsx`
- `app/(private)/asignacion/components/assigned-order-enter-trigger.tsx`
- `app/(private)/asignacion/[id]/components/order-execution-lines.tsx`
- `app/(private)/asignacion/[id]/components/order-execution-error.tsx`
- `app/(private)/asignacion/[id]/components/order-execution-screen.tsx`
- `app/(private)/asignacion/[id]/components/order-cancel-dialog.tsx`
- `app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-order-screen.tsx`

### `dashboard`
- `app/(private)/dashboard/components/execution-trace-list-section.tsx`
- `app/(private)/dashboard/components/execution-trace-table.tsx`
- `app/(private)/dashboard/components/execution-trace-columns.tsx`
- `app/(private)/dashboard/recorrido/[id]/components/execution-trace-detail.tsx`

### Tests nuevos
- `tests/unit/paridad/arbol-accesible.ts`
- `tests/unit/paridad/inventario-paridad.test.tsx`
- `tests/unit/paridad/recetas-paridad.test.tsx`
- `tests/unit/paridad/pedidos-paridad.test.tsx`
- `tests/unit/paridad/clientes-paridad.test.tsx`
- `tests/unit/paridad/proveedores-paridad.test.tsx`
- `tests/unit/paridad/catalogo-paridad.test.tsx`
- `tests/unit/paridad/unidades-paridad.test.tsx`
- `tests/unit/paridad/presentaciones-paridad.test.tsx`
- `tests/unit/paridad/usuarios-paridad.test.tsx`
- `tests/unit/paridad/grupos-paridad.test.tsx`
- `tests/unit/paridad/asignacion-paridad.test.tsx`
- `tests/unit/paridad/recorridos-paridad.test.tsx`
- `tests/unit/paridad/login-paridad.test.tsx`
- `tests/unit/paridad/order-form-image-paridad.test.tsx`
- `tests/unit/paridad/error-alert-paridad.test.tsx`
- `tests/unit/shared-ui/button-touch.test.tsx`
- `tests/unit/shared-ui/error-alert.test.tsx`
- `tests/unit/shared-ui/empty-state.test.tsx`
- `tests/unit/shared-ui/error-state.test.tsx`
- `tests/unit/shared-ui/table-skeleton.test.tsx`
- `tests/unit/shared-ui/spinner.test.tsx`
- `tests/unit/shared-ui/date-cell.test.tsx`
- `tests/unit/shared-ui/submit-button.test.tsx`
- `tests/unit/shared-ui/entity-image-size.test.tsx`
- `tests/unit/shared/data-table-states-sustituyen.test.tsx`
- `tests/guards/guard-piezas-base.test.ts`

### Tests enmendados o repuntados (`design.md > 13`)
- `tests/unit/inventario/product-route-contract.test.ts`
- `tests/unit/recetas-ui/recipe-route-contract.test.ts`
- `tests/unit/inventario/importar/importar-route-contract.test.ts`
- `tests/unit/shared/migracion-listas-alcance.test.ts`
- `tests/guards/guard-pantalla-pedidos-se-amplia.test.ts`
- `tests/unit/clientes-ui/customer-list-skeleton.test.tsx`
- `tests/unit/clientes-ui/customer-list-error.test.tsx`
- `tests/unit/clientes-ui/customer-list-empty.test.tsx`
- `tests/unit/clientes-ui/customer-list-section.test.tsx`
- `tests/unit/clientes-ui/customer-columns.test.tsx`
- `tests/unit/configuracion-ui/grupos/work-group-list-skeleton.test.tsx`
- `tests/unit/configuracion-ui/grupos/work-group-list-error.test.tsx`
- `tests/unit/configuracion-ui/grupos/work-group-list-empty.test.tsx`
- `tests/unit/configuracion-ui/grupos/work-group-columns.test.tsx`
- `tests/unit/configuracion-ui/user-list-empty.test.tsx`
- `tests/unit/configuracion-ui/user-list-section.test.tsx`
- `tests/unit/configuracion-ui/unit-page.test.tsx`
- `tests/unit/configuracion-ui/unit-columns.test.tsx`
- `tests/unit/configuracion-ui/presentation-page.test.tsx`
- `tests/unit/configuracion-ui/presentation-columns.test.tsx`
- `tests/unit/configuracion-ui/unidades-convenciones.test.ts`
- `tests/unit/configuracion-ui/usuarios-convenciones.test.ts`
- `tests/unit/pedidos-ui/order-list-skeleton.test.tsx`
- `tests/unit/pedidos-ui/order-list-section.test.tsx`
- `tests/unit/pedidos-ui/order-table.test.tsx`
- `tests/unit/pedidos-ui/order-columns.test.tsx`
- `tests/unit/pedidos-ui/order-form-quote.test.tsx`
- `tests/unit/pedidos-ui/use-order-cost-quote.test.ts`
- `tests/unit/inventario/product-page.test.tsx`
- `tests/unit/inventario/finished-stock-table.test.tsx`
- `tests/unit/recetas-ui/recipe-page.test.tsx`
- `tests/unit/recetas-ui/recipe-version-pages.test.tsx`
- `tests/unit/recetas-ui/recipe-form.test.tsx`
- `tests/unit/proveedores-ui/supplier-detail-page.test.tsx`
- `tests/unit/proveedores-ui/supplier-showcase-page.test.tsx`
- `tests/unit/proveedores-ui/supplier-route-contract.test.ts`
- `tests/unit/proveedores-ui/catalog-columns.test.tsx`
- `tests/unit/asignaciones-ui/assigned-orders-states.test.tsx`
- `tests/unit/asignaciones-ui/a11y-tactil.test.tsx`
- `tests/unit/asignaciones-ui/assigned-orders-columns.test.tsx`
- `tests/unit/asignaciones-ui/packing-orders-list-section.test.tsx`
- `tests/unit/asignaciones-ui/finished-orders-list-section.test.tsx`
- `tests/unit/asignaciones-ui/conditioning-orders-list-section.test.tsx`
- `tests/unit/asignaciones-ui/company-orders-list-section.test.tsx`
- `tests/unit/shared-ui/responsible-avatars.test.tsx`
- `tests/unit/shared/data-table-viewport.test.tsx`
- `tests/unit/shared/data-table-filter-date.test.tsx`

### Specs enmendados
- `specs/QC-56-migrar-listas-a-tabla-compartida/requirements.md`
- `specs/QC-102-responsables-en-la-pantalla-de-pedidos/requirements.md`
