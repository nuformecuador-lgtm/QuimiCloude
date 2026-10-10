# QC-232 — componentizacion-formularios-y-acciones · implementación

Rama `feature/QC-232-componentizacion-formularios-y-acciones`, worktree
`.worktrees/QC-232-componentizacion-formularios-y-acciones`.
Tanda 0 (T0a, T0b): `frontend_dev`, 2026-10-09. T0c (capturas) es del leader.

## TA
- **P1 cerrada por el leader** (2026-10-09, `progress/features/QC-232.md > Decisiones`): los diffs de
  QC-223, QC-217 y QC-234 no tocan `order-form.tsx`, `order-sheet.tsx`, `order-field.tsx`,
  `delete-order-dialog.tsx` ni `cancel-order-dialog.tsx`. **Pedidos entra.**
- `node scripts/archivos-en-vuelo.mjs --candidata QC-232`: **sin conflicto**.
- P2 verbo corto; P3 entra todo; P4 selects especializados fuera (deuda); P5 `step-document-view` a
  deuda si obliga a tocar su test; P6 el `DatePicker` del filtro entra.

## Campos

Lista cerrada de T0a (R17; `design.md > 2.3`). Cada sitio se confirmó leyendo el código el
2026-10-09. «Pieza» es la pieza compartida en la que delega en la tanda 2; la columna «Lo que pasa a
props» es lo que hoy lo distingue y la pieza tiene que reproducir para que `campos-paridad` y
`formularios-paridad` pasen sin regenerar.

**Regla común que sale de la lectura.** Hoy conviven dos formas del error de campo: con
`role="alert"` (clientes, unidades, usuarios, presentaciones, importación) y **sin** rol (producto,
pedido, catálogo, proveedor, `UnitSelect`, fecha de lote). `FieldError` pinta `role="alert"` por
defecto y **acepta quitarlo por prop**: si no, la migración cambiaría el árbol accesible de los
segundos. Igual con `aria-describedby`: solo con error, en todos los sitios.

### Texto → `TextField` (+ `FieldError`)

| # | Sitio | Archivo | Lo que pasa a props |
|---|---|---|---|
| T1 | `CustomerTextField` (6 campos) | `app/(private)/clientes/components/customer-form.tsx` | no controlado con `key={value}`; `required` + `aria-required`; `maxLength` del esquema; `inputMode` (`tel`/`email`); `autoComplete="off"`; `min-h-11 text-base md:text-base`; error con rol; testids `customer-field-*` / `customer-error-*` |
| T2 | `UnitTextField` (nombre, símbolo, factor) | `app/(private)/configuracion/unidades/components/unit-form.tsx` | no controlado con `key`; `required` solo en nombre; `inputMode="decimal"` en factor; el error **solo se pinta si hay `errorTestId`** (el factor no lo tiene); error con rol |
| T3 | `UserTextField` (nombres, apellidos, nacimiento, correo, teléfono, documento, usuario) | `app/(private)/configuracion/usuarios/components/user-form.tsx` | **controlado en el alta** (`value` + `onValueChange`, `key={name}`) y no controlado en la edición (`key={value}`); `type` `text`/`email`/`tel`/`date` (la fecha de nacimiento sigue siendo `type="date"` nativo, no `DatePicker`); `required` siempre; `children` después del error (la sugerencia de usuario); error con rol |
| T4 | `ProductField` (se queda como envoltorio exportado y delega) | `app/(private)/inventario/components/product-field.tsx` | la etiqueta va dentro de `div.flex.items-center.gap-1.5` **siempre**, con el botón de ayuda (`Tooltip`, `product-helper-*`) opcional; `type` `text`/`number`/`date` (`number` fija `inputMode="numeric"`, `step=1`, `min=0`); controlado opcional (`value`/`onChange`, sin `key`); `touchTarget` en el input; error **sin rol**. Lo usan también `product-cost-fields.tsx` (sin tocar: hereda por `ProductField`) |
| T5 | `OrderField` (cantidad) | `app/(private)/pedidos/components/order-field.tsx` | no controlado con `key`; `type="number"` con `step`/`min`; `onValueChange` espía y redondeo `roundDecimals` en `onBlur`; `min-h-11`; error **sin rol** |
| T6 | `CatalogField` (nombre, coste, compra mínima, entrega, material, diámetro, alto, boca) | `app/(private)/proveedores/[id]/components/catalog-line-form.tsx` | no controlado con `key`; `pattern`, `type="number"`/`step`/`min` en entrega; `touchTarget`; error **sin rol** |
| T7 | `SupplierField` (nombre, teléfono, correo) | `components/shared/supplier/supplier-field.tsx` | no controlado con `key`; `inputMode`, `autoComplete`; `min-h-11` local; error **sin rol** |
| T8 | `DialogTextField` | `app/(private)/inventario/importar/components/import-dialog-parts.tsx` | **controlado** (`value`/`onChange`) y **sin `name`** (no viaja en `FormData`; R19: no se le añade); error con rol |
| T9 | Nombre de la presentación (en línea) | `app/(private)/configuracion/presentaciones/components/presentation-form.tsx` | no controlado con `key`; `required`; error con rol |
| T10 | Contenido de la presentación (en línea) | `app/(private)/configuracion/presentaciones/components/presentation-form.tsx` | el input va dentro de `div.flex.items-center.gap-2` con el sufijo de unidad (`span aria-hidden`); `flex-1` en el input; `inputMode="decimal"`; error con rol |

### Select → `SelectField` (sobre `SharedSelect` ampliado)

| # | Sitio | Archivo | Lo que pasa a props |
|---|---|---|---|
| S1 | `UserSelectField` (tipo de documento, rol) | `app/(private)/configuracion/usuarios/components/user-form.tsx` | etiqueta `span` con `id` + `aria-labelledby` en el disparador; `key={value}`; testid de disparador y de opción; `touchTarget` + 16 px; sin opciones no inventa ninguna; error con rol |
| S2 | `SelectField` local (prioridad) | `app/(private)/pedidos/components/order-form.tsx` | choca de nombre con el compartido: el local desaparece o el compartido se importa con alias; `data-value` en cada opción; error **sin rol** (`order-error-priority`) |
| S3 | «Deriva de» | `app/(private)/configuracion/unidades/components/unit-form.tsx` | opción «ninguna» **explícita** con su testid (`unit-option-no-base`), testid por opción (`unit-option-base`); `key={initialBase}`; error con rol (`unit-error-base`) |
| S4 | `UnitSelect` | `app/(private)/proveedores/[id]/components/unit-select.tsx` | opción «Sin unidad» explícita (`unit-option-none`); testid `unit-select` / `unit-option`; error **sin rol** (`unit-select-error`) |
| S5 | `SharedSelect` de tipo de producto | `app/(private)/inventario/components/product-form.tsx` | **no se migra**: ya es la base de `SelectField` y la ampliación es aditiva (`design.md > 3.3`, «su único consumidor de hoy no cambia»). Su paridad entra en `campos-paridad` para vigilar que la ampliación no lo mueva |

### Fecha → `DatePicker`

| # | Sitio | Archivo | Lo que pasa a props |
|---|---|---|---|
| F1 | `ProductBatchDateField` (fecha de compra) | `app/(private)/inventario/components/product-batch-date-field.tsx` | modo `single`; «hoy» por defecto y días futuros deshabilitados; `input type="hidden"` `purchaseDate` (`product-batch-date-value`); etiqueta `span` + `aria-labelledby`; el disparador muestra el valor `YYYY-MM-DD`; error **sin rol** (`product-error-purchaseDate`) |
| F2 | `DataTableFilterDate` (P6: entra) | `components/shared/data-table/data-table-filter-date.tsx` | modo **rango**; 1 o 2 meses según el ancho; los tres atajos (`data-table-date-last-*`) encima del calendario; **sin** input oculto (emite por `onChange`); la etiqueta va dentro del disparador (`data-table-filter-date-<columna>`) |

### `FieldError`
El `<p>` de error de cada sitio de las tres tablas de arriba, con su `id`, su testid y el rol según
la regla común. No entran los 57 `<p className="text-sm text-destructive">` de fuera de estos campos
(`requirements.md > Lo que NO entra`, QC-227).

### Fuera (con motivo)

| Sitio | Archivo | Motivo |
|---|---|---|
| Nombre del grupo de trabajo (en línea) | `app/(private)/configuracion/usuarios/components/work-group-form.tsx` | No se puede migrar sin cambiar el árbol ni abrir la API a atributos arbitrarios: su error lleva `data-code` (sale en la paridad) y `data-issue`, y el campo es controlado con validación en vivo (`touched` en `onChange`/`onBlur`) que alimenta el `disabled` del pie. Se deja tal cual; deuda para QC-227 |
| `RecipeVersionSelect` | `app/(private)/pedidos/components/recipe-version-select.tsx` | P4: select especializado, fuera (deuda) |
| `PresentationUnitSelect` | `components/shared/presentation-unit-select.tsx` (en presentación, producto, pedido y los diálogos de importación y reparto) | P4: select especializado, fuera (deuda) |
| `MeasurementUnitSelect` (diámetro, alto) | `app/(private)/proveedores/[id]/components/catalog-line-form.tsx` | P4: select especializado, fuera (deuda) |
| `PresentationSelect`, `PackagingSelect`, `RecipePicker`, `ProductNamePicker`, `OrderCustomerPicker` | `components/shared/presentation-select.tsx`, `pedidos/components/*` , `inventario/components/product-name-picker.tsx` | Son los buscadores de QC-233 (R30): no se tocan |
| Select de estado de la cuenta | `app/(private)/configuracion/usuarios/components/user-status-dialog.tsx` | No está en `design.md > 2.3`: viaja como `children` del `ConfirmDialog` (`design.md > 3.2`) sin cambio |
| Motivo de cancelación (`Textarea`) | `pedidos/components/cancel-order-dialog.tsx`, `asignacion/[id]/components/order-cancel-dialog.tsx` | Es un `Textarea` dentro del diálogo, no un campo de texto de formulario de `design.md > 2.3`; viaja como `children` del `ConfirmDialog` |
| Tipo de producto en solo lectura y presentación del envase | `app/(private)/inventario/components/product-form.tsx` | No son campos editables (un `<p>` y un `input type="hidden"`) |

## Archivos tocados

### Tanda 0 (T0a, T0b) — cero archivos de producción
- `progress/impl_QC-232-componentizacion-formularios-y-acciones.md` (este archivo)
- `specs/QC-232-componentizacion-formularios-y-acciones/tasks.md` (T0a y T0b `[x]`; el test nuevo
  `asignacion-listas-paridad` añadido a `Archivos esperados > Tests nuevos`)
- `tests/unit/paridad/formularios-paridad.test.tsx` + `.snap` (65 casos, 73 snapshots)
- `tests/unit/paridad/confirmaciones-paridad.test.tsx` + `.snap` (57 casos, 57 snapshots)
- `tests/unit/paridad/campos-paridad.test.tsx` + `.snap` (30 casos, 57 snapshots)
- `tests/unit/paridad/acciones-por-fila.test.tsx` + `.snap` (16 casos, 16 snapshots)
- `tests/unit/paridad/asignacion-listas-paridad.test.tsx` + `.snap` (19 casos, 19 snapshots)

`git diff` / `git status`: ningún archivo de `app/`, `components/`, `hooks/` ni `lib/`.

### Notas de la tanda 0 para las tandas siguientes
- **`asignacion-paridad` no cubría** el vacío de mis asignados, terminados y todos ni el esqueleto
  de las cuatro listas: van en `asignacion-listas-paridad.test.tsx` (nuevo; `asignacion-paridad`
  no se editó).
- **Operaciones «en vuelo»:** se usa una promesa que se suelta en `afterEach`, no `nuncaResuelve()`.
  React enreda toda transición nueva con una acción asíncrona pendiente, y una que no termina
  nunca dejaba colgados los estados de error de los tests siguientes del mismo archivo.
- **`campos-paridad`** guarda, además del árbol, los atributos de envío de cada `input`/`textarea`
  del campo (`name`, `type`, `inputmode`, `required`, `maxlength`, `min`, `step`, `pattern`,
  `autocomplete` y el valor): el árbol accesible no los guarda y R17/R19 piden conservarlos.
  **`formularios-paridad`** guarda el `FormData` del alta y de la edición de cada panel (R19).
- **`acciones-por-fila`**: el helper está dentro del test (no en `tests/helpers/`, reservado a la
  tanda 3). Lee la celda `data-table-cell-actions`; con `aria-haspopup="menu"` abre el menú y lee
  los `menuitem`, si no lee `button, a[href]`. Guarda `testid`, `deshabilitada`, `href` y `abre` (el
  testid del `dialog`/`alertdialog` nuevo), sin nombre accesible ni testid del disparador. Cada
  acción se pulsa sobre la pantalla recién pintada.
- **Presentaciones y unidades no tienen caso «solo consulta»:** la página entera exige
  `inventario.modificar` / `unidades.modificar` (`requirePagePermission`), así que sin el permiso
  no hay fila.
- **Lo que congela el inventario hoy** (sale en el `.snap`): productos y producto terminado
  enseñan las tres acciones también sin permisos de escritura; recetas y catálogo, las dos; la
  unidad de sistema (`isSystem`) tiene la celda vacía; clientes, grupos y usuarios la vacían sin
  permiso.
- **Estabilidad:** «hoy» fijado con `vi.useFakeTimers({ toFake: ['Date'] })` (fecha de compra y
  calendario); en el pedido se espera la cotización del disponible (`ORDER_DISTRIBUTION_DEBOUNCE_MS`)
  tras abrir y tras enviar; en el borrado de receta se espera a que termine la transición tras
  pintar el error.
- `guard-convenciones-proveedores` prohíbe importar `proveedores/[id]/components` por ruta
  profunda también desde los tests: los tres archivos importan del barrel.

### Tandas 1–5: producción (base `bfc41570`, `git diff --name-status`)
Rutas relativas a `app/(private)/` salvo `components/` y `hooks/`. A = nuevo, D = borrado.

- **Piezas (tanda 1):** A `components/shared/form-sheet.tsx`, A `hooks/use-entity-sheet.ts`,
  A `components/shared/confirm-dialog.tsx`, A `components/shared/delete-confirm-dialog.tsx`,
  A `components/shared/field-error.tsx`, A `components/shared/text-field.tsx`,
  A `components/shared/select-field.tsx`, A `components/shared/date-picker.tsx`,
  M `components/shared/shared-select.tsx` (aditivo: `SharedSelectControl`),
  M `components/shared/row-actions-menu.tsx` (items `href`), A `components/shared/data-table/actions-column.tsx`,
  M `components/shared/data-table/index.ts`.
- **clientes:** customer-form, customer-sheet, delete-customer-dialog, customer-row-actions, customer-columns.
- **configuracion/presentaciones:** presentation-form, presentation-sheet, delete-presentation-dialog,
  presentation-row-actions, presentation-columns.
- **configuracion/unidades:** unit-form, unit-sheet, delete-unit-dialog, unit-row-actions, unit-columns.
- **configuracion/usuarios:** user-form, user-sheet, work-group-form, work-group-sheet,
  delete-user-dialog, delete-work-group-dialog, user-status-dialog, end-user-sessions-dialog,
  user-table, work-group-table, user-columns, work-group-columns, index.ts (barrel).
- **inventario:** product-form, product-sheet, product-field, product-batch-date-field,
  delete-product-dialog, product-batches-sheet, product-batches-panel, product-table,
  product-columns, A product-row-actions, finished-stock-table, finished-stock-columns,
  importar/components/import-dialog-parts.
- **produccion/formulas:** delete-recipe-dialog, recipe-table, recipe-columns, A recipe-row-actions.
- **proveedores/[id] y components/shared/supplier:** catalog-line-form, catalog-line-sheet,
  delete-catalog-line-dialog, delete-supplier-dialog, unit-select, catalog-table, catalog-columns,
  A catalog-line-row-actions, supplier-detail-header; supplier-form, supplier-sheet, supplier-field.
- **pedidos:** order-form, order-sheet, order-field, delete-order-dialog, cancel-order-dialog.
- **asignacion:** [id]/order-cancel-dialog, [id]/order-execution-screen, empaque/[id]/packing-order-screen,
  assigned-order-start-trigger, A assignment-list-parts y los 15 archivos de
  assigned/company/finished/packing-orders-{columns,empty,list-section,skeleton};
  D `components/shared/confirm-action-dialog.tsx` (el borrado entró por error en el commit
  `546c9863` de pedidos porque ya estaba en el índice; pertenece a T2i).
- **filtro:** `components/shared/data-table/data-table-filter-date.tsx` (P6).

### Tandas 1–5: tests
- **Nuevos:** `tests/unit/shared-ui/{form-sheet,use-entity-sheet,confirm-dialog,campos,row-actions-menu-href,actions-column,confirm-dialog-montado}.test.tsx`,
  `tests/helpers/row-actions-menu.ts`, `tests/guards/guard-formularios-y-acciones.test.ts`.
- **Editados:** ver `## Ediciones de test (R4)`.
- **Otros:** `progress/deudas.md` (D37–D50); `specs/…/requirements.md` (enmienda R33);
  `specs/…/tasks.md` (marcas, T2k, barrel de usuarios, `user-table`/`work-group-table`,
  `data-table.test.tsx`, y sale `step-document-view` por P5).

## Desvíos y decisiones durante la implementación

- **API de las piezas** distinta en detalle de `design.md > 3` (el design lo permite si la paridad
  pasa sin regenerar):
  - `FormSheet`: `handleSaved(message?)` para el aviso con lote del producto; sin `beforeBody` (el
    `ErrorAlert` va en `children`); props aditivas `beforeHeader`, `headerExtra`, `bodyClassName`,
    `sheetData`, `noValidate`, `minScreenWidth`, `testIds.title`, `cancelTouch`.
  - `ConfirmDialog`: `trigger` es `{ render, children }`; `isPending` arriba; `hidden` es array;
    se exportan `ConfirmDialogFrame`/`ConfirmDialogBody` (y `DeleteConfirmDialogBody`) para que el
    estado del cuerpo se reinicie en cada apertura; props `layout`, `aside`, `errorStyle`,
    `confirmAs`, `announceBusy`, `confirmDisabled`, `confirmDescribedBy`, `dismissDisabled`.
  - `SharedSelect`: las ampliaciones van en el nuevo `SharedSelectControl` del mismo archivo.
  - `DatePicker` usa `formatDateLocalISO` (lo que usaba el sitio), no `formatCivilDate` (UTC) como
    citaba el design.
  - `actionsColumn`: el id común `'actions'` y la etiqueta «Acciones» son privados del archivo.
- **R13 frente a los borrados con disparador propio** (producto, línea de catálogo, proveedor): hoy
  no tienen estado pendiente y la paridad lo congela; se conserva (R1 manda).
- **`FieldError` sin `role="alert"`** donde el sitio no lo tenía (`alert={false}`): choca con el
  texto literal de R18; se prioriza R1.
- **R5 y P2:** `editUnitLabel`/`deleteUnitLabel` y `editPresentationLabel`/`deletePresentationLabel`
  conservan el export pero ya no reciben el nombre (devuelven solo el verbo). `editCustomerLabel`,
  `deleteCustomerLabel`, `editWorkGroupLabel`, `deleteWorkGroupLabel` quedan exportados sin uso
  (deuda D48).
- **Testids y `data-*` nuevos** en los disparadores donde hoy no había contenedor: `product-row-actions`
  + `data-product-id`, `recipe-row-actions` + `data-recipe-id`, `catalog-line-row-actions` +
  `data-catalog-line-id`.
- **Verbo del item de edición de grupos:** «Abrir» (el del `aria-label` de hoy), no «Editar».
- **Tamaño táctil (decisión del implementer, según `design.md > 11`):** el disparador mide 44×44 y
  los items llevan `min-h-11` (sin `min-w-11`, el menú mide ≥200 px). Los tests de viewport que
  exigían `min-w-11` en cada acción pasan a medir el disparador (clientes, presentaciones, unidades,
  grupos, recetas, catálogo), como ya hacía usuarios.
- **R33 (enmienda del humano):** los diálogos de baja/confirmación quedan siempre montados una vez
  abiertos (estado `boolean | null`: `null` = nunca abierto, así el árbol inicial y las paridades
  no cambian). Base UI marca el cierre con `data-closed` (no `data-state="closed"`, que es de Radix);
  el test lo documenta. En inventario y proveedores/[id] el error del intento anterior reaparece al
  reabrir el borrado, como ya pasaba en `dev` (diálogo siempre montado con `useActionState`): se
  conserva y el caso queda `skipIf`.
- **step-document-view a deuda (P5):** cambiarlo rompe la lista cerrada R18 de
  `order-execution-screen.test.tsx`.
- **Fuera de la lista de Campos:** nombre del grupo (lleva `data-code`/`data-issue`), selects
  especializados (P4), vacío de packing (EmptyState pone `data-testid` en el envoltorio).

## Mapa R -> test

| R | Test |
|---|---|
| R1 | `formularios-paridad`, `confirmaciones-paridad`, `campos-paridad`, `acciones-por-fila`, `asignacion-listas-paridad` (sin regenerar desde la tanda 0) y las paridades de QC-231 sin regenerar en las tandas 1–2 |
| R2 | tests de cada panel y diálogo sin editar en la tanda 2 (`vitest related` 230 archivos / 3651 tests verdes); E2E en CI |
| R3 | capturas antes/después (leader, T0c/T5e) |
| R4 | `guard-formularios-y-acciones > caso por diff R4` (todo test existente editado está en `Archivos esperados`) + revisión del diff de snapshots de la tanda 3 (abajo) |
| R5 | `pnpm run typecheck` y las guardias `*-convenciones` (barrels) en verde |
| R6 | `form-sheet.test.tsx > compone cabecera, cuerpo con scroll y pie fijo con cancelar y guardar dentro del form` |
| R7 | `form-sheet.test.tsx > «Cancelar» cierra el panel sin enviar el formulario` |
| R8 | `form-sheet.test.tsx > mientras el form envía, guardar queda deshabilitado, con aria-busy y el texto de pendiente` |
| R9 | `form-sheet.test.tsx > con busy… / con canSave = false… / con disabled… / la envoltura del pie…` |
| R10 | `form-sheet.test.tsx > los data-testid del panel, form, título, cancelar y guardar… llegan por props` + `formularios-paridad` |
| R11 | `use-entity-sheet.test.tsx > al guardar con éxito: cerrar, toast de éxito del modo y refresh, en ese orden` |
| R12 | `confirm-dialog.test.tsx > con form: envía el id oculto por la Server Action… / con transición: sin form…` |
| R13 | `confirm-dialog.test.tsx > mientras envía: confirmar deshabilitado, aria-busy y «Eliminando…»` |
| R14 | `confirm-dialog.test.tsx > al confirmar cierra con onOpenChange(false) antes de llamar a onConfirm / si la operación responde con error, el diálogo sigue abierto` |
| R15 | `confirm-dialog.test.tsx > disparador propio: cerrado no pinta el diálogo / controlada: sin disparador` + `confirmaciones-paridad` |
| R16 | `campos.test.tsx` (TextField etiqueta/16 px/`min-h-11`; SelectField `aria-labelledby` y opción «ninguna»; DatePicker single y rango) |
| R17 | `campos.test.tsx` (OrderField, SupplierField, UnitSelect, ProductBatchDateField, DataTableFilterDate contra su pieza) + `campos-paridad` |
| R18 | `campos.test.tsx > FieldError… / aria-invalid y aria-describedby solo con error` |
| R19 | `campos.test.tsx > FormData…` + `formularios-paridad > R19` |
| R20, R22, R23 | `acciones-por-fila.test.tsx` (sin regenerar tras la tanda 3) |
| R21 | `row-actions-menu-href.test.tsx > el item con href se pinta como <a href> / al pulsarlo navega` + `acciones-por-fila` (href de recetas) |
| R24 | `actions-column.test.tsx` + paridades de QC-231 regeneradas solo en la celda |
| R25 | tests unit y E2E editados con `tests/helpers/row-actions-menu.ts` / `e2e/helpers/row-actions-menu.ts` |
| R26 | `guard-piezas-base > QC-232 (R26, R28)` (cada excepción retirada vuelve a morder) |
| R27 | `asignacion-paridad` (QC-231) y `asignacion-listas-paridad` sin regenerar tras T4a |
| R28 | `guard-formularios-y-acciones` (4 reglas con muestra que muerde; excepciones cerradas) |
| R29 | `progress/deudas.md` D37–D50 |
| R30, R31 | `guard-formularios-y-acciones > casos por diff R30 y R31` (solo en esta rama) + `guard-dependencias-aprobadas` |
| R32 | `node scripts/archivos-en-vuelo.mjs --candidata QC-232` (abajo, `## T5f`) |
| R33 | `tests/unit/shared-ui/confirm-dialog-montado.test.tsx` (pieza, usuarios, grupos, pedidos y las 6 tablas de la tanda 3 + panel de lotes) |

## Ediciones de test (R4)

| Archivo | Tipo | Qué |
|---|---|---|
| `tests/unit/shared/data-table.test.tsx` | (a)-equivalente | +1 línea `'actionsColumn'` en la lista cerrada de exports del barrel |
| `tests/unit/paridad/{campos,confirmaciones,formularios}-paridad.test.tsx`, `tests/unit/shared-ui/campos.test.tsx` | (a) | imports por barrel (fallaban las guardias `*-convenciones`); tests de esta rama |
| `tests/guards/guard-piezas-base.test.ts` | R28 | sale `order-field` de `CONSTANTES_QUE_NO_SON_EL_PAR`; T5b retira las excepciones resueltas |
| `tests/unit/clientes-ui/clientes-page.test.tsx` | (b) | abre el menú |
| `tests/unit/clientes-ui/clientes-viewport.test.tsx` | (b) + tamaño táctil | items en el menú; 44×44 al disparador, items `min-h-11` |
| `tests/unit/clientes-ui/delete-customer-dialog.test.tsx` | (b) + P2 | `clickRowAction`; `aria-label` con el nombre pasa al disparador; fila montada por el disparador |
| `tests/unit/configuracion-ui/presentation-columns.test.tsx` | (b) + P2 + táctil | `menuitem` + verbo; 44×44 al disparador |
| `tests/unit/configuracion-ui/presentation-page.test.tsx` | (b) | abre el menú |
| `tests/unit/configuracion-ui/configuracion-viewport.test.tsx` | (b) + táctil | items en el menú; diálogo con `clickRowAction`; 44×44 al disparador |
| `tests/unit/configuracion-ui/unit-columns.test.tsx` | (b) + P2 + táctil | ídem unidades |
| `tests/unit/configuracion-ui/delete-unit-dialog.test.tsx` | (b) + P2 | `clickRowAction`; nombre en el disparador; fila montada por el disparador |
| `tests/unit/configuracion-ui/unidades-viewport.test.tsx` | (b) + táctil | ídem |
| `tests/unit/configuracion-ui/grupos/work-group-table.test.tsx` | (b) | `clickRowAction` ×4 |
| `tests/unit/configuracion-ui/grupos/work-group-columns.test.tsx` | (b) + P2 | disparador «Acciones de X» y verbo; import por barrel |
| `tests/unit/configuracion-ui/grupos/work-group-a11y.test.tsx` | (b) + táctil | 44×44 y «siempre en el DOM» pasan al disparador |
| `tests/unit/inventario/product-page.test.tsx` | (b) | 16 clics + 2 visibilidades dentro del menú |
| `tests/unit/inventario/finished-stock-table.test.tsx` | (b) | 4 clics + 3 existencias dentro del menú + Escape |
| `tests/unit/inventario/product-batches-sheet.test.tsx` | (b) + P2 | `abrirPanel`; «Lotes de X» → «Acciones de X» |
| `tests/unit/proveedores-ui/catalog-line-form.test.tsx`, `catalog-line-sheet.test.tsx` | (b) | helper `abrirEdicion` |
| `tests/unit/proveedores-ui/delete-catalog-line-dialog.test.tsx` | (b) + táctil | `abrirBaja`; disparador en la fila; área táctil al disparador |
| `tests/unit/recetas-ui/recipe-page.test.tsx` | (b) + táctil | `clickRowAction`; 44×44 al disparador |
| `e2e/clientes.spec.ts` | (b) | pasos 10 y 12 |
| `e2e/grupos-de-trabajo.spec.ts` | (b) | 3 clics |
| `e2e/producto-terminado.spec.ts` | (b) | lotes y `setPresentationContent` |
| `e2e/ajuste-de-inventario.spec.ts`, `insumo-por-unidad.spec.ts`, `reserva-de-material.spec.ts` | (b) | lotes |
| `e2e/aislamiento-inventario.spec.ts` | (b) + | `toHaveCount(1)` cuenta disparadores en vez del botón de borrar |
| `e2e/recetas-pasos.spec.ts` | (b) | paso 6 |
| `e2e/versiones-en-la-receta.spec.ts` | (b) + P2 | cuenta el disparador; `aria-label` esperado «Editar X» → «Acciones de X» |
| `__snapshots__/clientes-paridad` | (c) | +2 −5, solo la celda |
| `__snapshots__/presentaciones-paridad` | (c) | +2 −5, solo la celda |
| `__snapshots__/unidades-paridad` | (c) | +2 −5, solo la celda de Gramo |
| `__snapshots__/grupos-paridad` | (c) | +4 −10, solo las 2 celdas |
| `__snapshots__/catalogo-paridad` | (c) | +2 −5, solo la celda |
| `__snapshots__/recetas-paridad` | (c) | +8 −14: celdas y, fuera de ellas, el nombre calculado de cada `tr` pierde «Editar X» (sale del texto de la celda) |
| `__snapshots__/inventario-paridad` | (c) | +4 −9: celda y el nombre calculado del `tr`/celda pierde « Lotes» |

No se editó: `usuarios-paridad`, `proveedores-paridad`, `asignacion-paridad`, ningún test de QC-223
ni QC-217, `order-execution-screen.test.tsx`, `delete-recipe-dialog.test.tsx`,
`recipe-version-list.test.tsx`, ni los de `customer-list-section`/`customer-table`.

**A revisar por el reviewer:** las ediciones marcadas «+ P2» y «+ táctil» van más allá del paso
de abrir el menú: cambian el objetivo de la aserción porque la etiqueta con nombre pasa al
disparador (P2) y los items del menú no llevan `min-w-11`.

## Salidas

### Tanda 0 (2026-10-09)
```
$ pnpm exec vitest run tests/unit/paridad/formularios-paridad.test.tsx \
    tests/unit/paridad/confirmaciones-paridad.test.tsx tests/unit/paridad/campos-paridad.test.tsx \
    tests/unit/paridad/acciones-por-fila.test.tsx tests/unit/paridad/asignacion-listas-paridad.test.tsx
# dos corridas seguidas, sin regenerar:
passed 187 failed 0 snap {"added":0,"matched":222,"unmatched":0,"updated":0}
passed 187 failed 0 snap {"added":0,"matched":222,"unmatched":0,"updated":0}
acciones-por-fila 16/16 · asignacion-listas-paridad 19/19 · campos-paridad 30/30 ·
confirmaciones-paridad 57/57 · formularios-paridad 65/65 · snapshots obsoletos: 0

$ pnpm exec prisma generate && pnpm exec next typegen   # lo mismo que hace scripts/gate-proyecto.sh
$ pnpm run typecheck
> tsc --noEmit            (exit 0)

$ pnpm run lint
✖ 7 problems (0 errors, 7 warnings)   (exit 0; los 7 avisos son de documentos/confirm-catalog-import
                                       y pedidos/order-service, previos)

$ pnpm exec vitest run guard
Test Files  62 passed (62)
     Tests  834 passed | 15 skipped (849)
```
Sin `prisma generate` y `next typegen` el typecheck del worktree da ~978 errores fantasma
(`@prisma/client` sin `Prisma`, `LayoutProps`), ninguno en estos archivos.

**Veredicto tanda 0:** T0a y T0b cerradas; cinco paridades congeladas y estables contra producción
sin tocar.

### Tanda 1 (cierre)
```
$ pnpm run typecheck                      -> exit 0
$ pnpm run lint                           -> ✖ 7 problems (0 errors, 7 warnings)  (previos, ajenos)
$ pnpm exec vitest run guard tests/unit/shared-ui tests/unit/paridad
 Test Files  102 passed (102)
      Tests  1457 passed | 15 skipped (1472)
```
Por pieza: form-sheet + use-entity-sheet 14/14; confirm-dialog 10/10; campos 23/23 (campos-paridad
30/30 sin regenerar; `vitest related shared-select` 22 archivos / 436 tests, product-form sin
editar); row-actions-menu-href + actions-column 13/13 (tests de usuarios y pedidos con
`RowActionsMenu`: 191 verdes sin editar).

### Tanda 2 (cierre)
```
$ pnpm run typecheck                      -> exit 0
$ pnpm run lint                           -> ✖ 7 problems (0 errors, 7 warnings)
$ pnpm exec vitest run guard convenciones tests/unit/paridad tests/unit/shared-ui
 Test Files  112 passed (112)
      Tests  1629 passed | 37 skipped (1666)
$ pnpm exec vitest related --run <producción cambiada en la tanda>
 Test Files  230 passed (230)
      Tests  3651 passed | 1 skipped (3652)
```
Ninguna paridad regenerada; ningún test de pantalla editado (`guard-identificador-de-request`
verde sin tocar).

### Tanda 3 y 4 (por tabla, informes de los subagentes)
- clientes: related 17/353 → tras la tanda 3, `clientes-ui` 16 archivos / 231 tests.
- presentaciones: related 13/301. unidades: related 14/335. grupos: related 40/759.
- productos: related 20/434. recetas: related 26/479. catálogo: related 18/377; `proveedores-ui` 24/260.
- T4a: asignación (paridades + `asignaciones-ui`) 37/450 sin regenerar ni editar.
- T4b: related 66/1176.
- R33 por tabla: `confirm-dialog-montado` 27 passed, 2 skipped (los `skipIf` de inventario y catálogo).
```
$ pnpm exec vitest run convenciones guard     (tras T3f)
 Test Files  71 passed (71)
      Tests  996 passed | 37 skipped (1033)
```

### Tanda 5
`pnpm exec vitest run guard`: 63 archivos, 858 passed, 15 skipped. Ver `## Tanda 5` y `## T5d`.

## E2E de los specs editados por QC-232 (chromium, 2026-10-09)

Archivo modificado: `e2e/producto-terminado.spec.ts` (`setPresentationContent`: abre
`presentation-action-edit` con `openRowActionsMenuItem` sobre el disparador
`presentation-row-actions` de la presentacion). Ningun otro uso de items de fila fuera del helper.

`.env` copiado de la raiz (ignorado por `.gitignore:41`); `DATABASE_URL` exportada al proceso de
Playwright. La base local (localhost:5433) tiene 4 migraciones sin aplicar
(`20261008150000..150200`, de QC-219): falta `inventory_movements.order_delivery_id`.

| Spec | Resultado | Causa |
|---|---|---|
| clientes | 2 passed | |
| recetas-pasos | 1 passed | |
| versiones-en-la-receta | 1 passed (2o intento) | 1o: 404 de primer compilado de `next dev` |
| aislamiento-inventario | 1 passed | |
| grupos-de-trabajo | 1 failed | `work-group-member-search` no existe en la UI desde 527a9902 (dev); ajeno a QC-232 |
| producto-terminado | 1 failed | entorno: columna `order_delivery_id` ausente (migracion) |
| reserva-de-material | 1 failed | entorno: misma columna |
| ajuste-de-inventario | 1 passed, 3 failed | entorno: misma columna (el servidor la rechaza al ajustar) |
| insumo-por-unidad | 1 failed | entorno: misma columna (alta de insumo con lote) |

**Veredicto:** paso del menu arreglado; los rojos restantes son entorno (base sin migrar) o un
spec ya roto en dev, ninguno por la UI de QC-232.

## Tanda 5: T5a, T5b, T5c (frontend_dev, 2026-10-09)

**Archivos:** `tests/guards/guard-formularios-y-acciones.test.ts` (nuevo),
`tests/guards/guard-piezas-base.test.ts`, `progress/deudas.md` (D37–D50).

**R → test:** R28 → `guard-formularios-y-acciones` (las 4 reglas, cada una con su muestra que
muerde; excepciones cerradas, sin muertas y todas muerden); R30, R31 y R4 → sus casos por diff (solo
en `feature/QC-232-…`, `skip` ruidoso fuera); R26 → `guard-piezas-base > QC-232 (R26, R28)`;
R29 → `progress/deudas.md` D37–D50.

**Comprobación de que la regla de acciones muerde el código de antes:** sobre el merge-base, la regla
`accion-de-fila-local` da hallazgos en las 8 tablas que la tanda 3 migró (clientes, presentaciones,
unidades, grupos, productos, producto terminado, recetas, catálogo).

**Salida:**
- `pnpm exec vitest run guard`: 63 archivos pasan; 858 tests pasan y 15 se saltan (los casos por
  diff de otras fichas).
- `eslint` de las dos guardias: sin problemas.
- `pnpm run typecheck`: sin errores.

**Veredicto:** T5a, T5b y T5c hechas, con las guardias en verde.

## T5d: `./init.sh` (modo rápido, 2026-10-09)

Primera corrida: rojo en `test:rapido` con dos rojos NUEVOS (no en el baseline):
`tests/unit/inventario/product-route-contract.test.ts` y `tests/unit/recetas-ui/recipe-route-contract.test.ts`
(«el barrel debe reexportar ./product-row-actions / ./recipe-row-actions»). Arreglo: los barrels de
inventario, fórmulas y proveedores/[id] entran en `Archivos esperados` y exportan sus menús de fila
(`6328954c`; resuelve D49). Segunda corrida:

```
$ ./init.sh
 Test Files  236 passed (236)
      Tests  3741 passed | 4 skipped (3745)
 Test Files  101 passed (101)
      Tests  1412 passed | 32 skipped (1444)
✓ test:rapido paso
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==   (exit 0)
```

## T5f: archivos en vuelo (R32)

```
$ node scripts/archivos-en-vuelo.mjs --candidata QC-232
AVISO: QC-96 (Christian Quevedo) esta en vuelo y su rama no esta publicada: no se puede comprobar el conflicto
AVISO: QC-131 (Christian Quevedo): su tasks.md no tiene `## Archivos esperados`: se leen las rutas de todo el archivo
QC-232: sin conflicto de archivos con 7 feature(s) en vuelo
```
Repetido tras añadir los barrels a `Archivos esperados`: mismo resultado.

## Pendiente para el leader
- **T0c y T5e (capturas antes/después):** no hechas por el implementer (son del leader).
- **E2E con base migrada:** producto-terminado, reserva-de-material, ajuste-de-inventario e
  insumo-por-unidad no se pudieron verificar en local: la base compartida (5433) no tiene 4
  migraciones de `dev`. No se migró una base compartida sin permiso. Corren en CI.
- **`e2e/grupos-de-trabajo.spec.ts:495`** ya está roto en `dev` (`work-group-member-search` no existe
  en la UI desde `527a9902`): ajeno a QC-232.
- **Ediciones de test «+ P2» y «+ táctil»** (ver `## Ediciones de test (R4)`): van más allá del
  tipo (b) literal; las fuerza el cambio de la tanda 3. Decide el reviewer.
