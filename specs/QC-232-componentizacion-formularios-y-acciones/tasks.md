# QC-232 — componentizacion-formularios-y-acciones · tasks

**Verificación de cada tanda.** Al cerrar cada tanda se corren:
- `pnpm run typecheck`;
- `pnpm run lint`;
- `pnpm exec vitest related --run <archivos>`;
- `pnpm exec vitest run guard`.

Los E2E de un spec se corren con `pnpm exec playwright test <spec>`. **Nunca `pnpm test`.** Cada
tanda termina con `git push`, porque `archivos-en-vuelo` lee la rama publicada.

**Commits.** Uno por task, y uno por ruta en las tandas 2 y 3. Los snapshots congelados van en su
propio commit (T0). Los regenerados por R4 (c) van en uno por pantalla:
`test(QC-232): paridad de <pantalla> con el menú de fila`.

**Comentarios.** No se cita `QC-<n>`, `R<n>` ni `D<n>` en producción. Al tocar una línea se limpian
sus comentarios (`docs/conventions.md > Comentarios`). Si la limpieza abulta, va en un commit
`chore(QC-232): limpia comentarios de <archivo>` aparte.

**Archivos que no se tocan** (R30). Son los de `requirements.md > Lo que NO entra` y
`design.md > 7`. Si una task parece necesitar uno, **se para y se pregunta al leader**. Si hace
falta un archivo que no está en `## Archivos esperados`, se añade allí **antes** de tocarlo, se
hace push y el leader vuelve a correr `archivos-en-vuelo`.

## Antes de empezar (leader)

- [x] **TA. Comprobar los choques** (P1, R32).
  - **Qué se corre:**
    - `node scripts/archivos-en-vuelo.mjs --candidata QC-232`;
    - `git diff --name-only origin/dev...origin/<rama>` de `feature/QC-223-entregar-producto-terminado`,
      `feature/QC-217-pestana-por-acondicionar` y `feature/QC-234-cifrado-de-secretos-de-integraciones`.
  - **Hecho cuando:**
    - el resultado queda en `progress/features/QC-232.md`;
    - el humano ha respondido P1–P6;
    - si un archivo de pedidos aparece en el diff de QC-223, la fila «pedidos» sale de
      `design.md > 4` y de `## Archivos esperados` antes de la tanda 1.

## Tanda 0 — Congelar el «antes» (bloquea todo lo demás; depende de TA)

- [ ] **T0a. Cerrar la lista de campos** (R17; `design.md > 2.3`).
  - **Qué se escribe:** en `progress/impl_QC-232-…md > Campos`, cada sitio con su archivo y su pieza
    destino, y los que se quedan fuera con su motivo.
  - **Hecho cuando:** la lista está escrita y no queda ningún «por confirmar».
- [ ] **T0b. Paridades nuevas** (R1, R20–R23, D6; `design.md > 10.1`).
  - **Qué se escribe:**
    - `formularios-paridad.test.tsx`;
    - `confirmaciones-paridad.test.tsx`;
    - `campos-paridad.test.tsx`;
    - `acciones-por-fila.test.tsx`, con el helper que lee las dos formas, botones y menú.
  - **Hecho cuando:**
    - los snapshots se generan contra el código **sin tocar** y se commitean solos, en
      `test(QC-232): congela la paridad de formularios, confirmaciones, campos y acciones`;
    - la suite pasa en verde;
    - `asignacion-paridad.test.tsx` cubre los estados de lista de las 4 listas de `design.md > 5`.
      Si falta alguno, se añade aquí;
    - no ha cambiado ni un archivo de producción.
- [ ] **T0c [P]. Capturas «antes»** (R3). **Las hace el leader**, con el seed demo (QC-230), en
  claro, oscuro y móvil, en `_trabajo/marca/capturas-formularios-antes/`.
  - **Qué se fotografía:** cada formulario abierto en alta, cada diálogo de borrado abierto y cada
    tabla con acciones con una fila visible.
  - **Hecho cuando:** hay un índice de nombres en `progress/features/QC-232.md`.

## Tanda 1 — Piezas compartidas (depende de T0; cada task [P] respecto de las demás)

- [ ] **T1a [P]. `FormSheet`, `SaveButton` y `useEntitySheet`** (R6–R11; `design.md > 3.1`).
  - **Test:** `tests/unit/shared-ui/form-sheet.test.tsx` y `tests/unit/shared-ui/use-entity-sheet.test.tsx`,
    con un caso por R.
  - **Hecho cuando:** los dos están en verde y cubren:
    - que cancelar no envía;
    - el envío en curso;
    - `busy`, `canSave = false` y `disabled`;
    - el orden cerrar, toast y refresh.
- [ ] **T1b [P]. `ConfirmDialog` y `DeleteConfirmDialog`** (R12–R15; `design.md > 3.2`).
  - **Test:** `tests/unit/shared-ui/confirm-dialog.test.tsx`.
  - **Hecho cuando:** está en verde y cubre:
    - con form y con transición;
    - sin form: cerrar antes de `onConfirm`;
    - el error que deja el diálogo abierto;
    - el pendiente;
    - el disparador propio frente al controlado.
- [ ] **T1c [P]. `FieldError`, `TextField`, `SelectField` (y la ampliación aditiva de `SharedSelect`) y
  `DatePicker`** (R16, R18, R19; `design.md > 3.3`).
  - **Test:** `tests/unit/shared-ui/campos.test.tsx`.
  - **Hecho cuando:**
    - está en verde;
    - los tests de `product-form`, el único consumidor de `SharedSelect`, pasan sin editar.
- [ ] **T1d [P]. `RowActionsMenu` con items enlace y `actionsColumn()`** (R21, R24; `design.md > 3.4`).
  - **Test:** `tests/unit/shared-ui/row-actions-menu-href.test.tsx` y
    `tests/unit/shared-ui/actions-column.test.tsx`.
  - **Hecho cuando:**
    - están en verde;
    - los tests de usuarios y de pedidos que usan `RowActionsMenu` pasan sin editar.

## Tanda 2 — Adopción sin cambio visible, por ruta (depende de la tanda 1; cada ruta [P])

**Qué se hace en cada ruta** (`design.md > 4`):
- los formularios pasan a `FormSheet`;
- los envoltorios, a `useEntitySheet`;
- los diálogos, a `ConfirmDialog` / `DeleteConfirmDialog`;
- los campos de la lista de T0a, a las piezas.

Se conservan los exports, los testids y los textos (R5, R10, R15, R17).

**Hecho cuando, en cada ruta:**
- las paridades de T0b y las de QC-231 de esa pantalla pasan **sin regenerar**;
- sus tests están en verde **sin editarlos**, salvo un repunte de import (R4 a), que se anota en el
  impl.

- [ ] **T2a [P]. `clientes`.**
- [ ] **T2b [P]. `configuracion/presentaciones`.**
- [ ] **T2c [P]. `configuracion/unidades`.**
- [ ] **T2d [P]. `configuracion/usuarios`:** usuario, grupo (con `disabled` y la envoltura del pie),
  borrar usuario y grupo, estado de usuario y cerrar sesiones.
- [ ] **T2e [P]. `inventario`:** producto, borrar producto (con su disparador propio), fecha de lote
  e `import-dialog-parts`.
- [ ] **T2f [P]. `produccion/formulas`:** borrar receta, con su transición y su disparador propio.
- [ ] **T2g [P]. `proveedores/[id]` y `components/shared/supplier`:** línea de catálogo, proveedor,
  sus dos borrados y `UnitSelect`.
- [ ] **T2h [P]. `pedidos`, solo si TA no lo saca:** pedido (con `canSave`/`busy`), `OrderField`,
  el select local, y borrar y cancelar pedido. La excepción de `order-form.tsx` en
  `guard-identificador-de-request` debe seguir en verde **sin tocar** esa guardia.
- [ ] **T2i [P]. `asignacion` (fuera de los archivos de QC-217):**
  - `order-cancel-dialog` pasa a `ConfirmDialog`;
  - los 3 consumidores de `ConfirmActionDialog` pasan a `ConfirmDialog` sin form;
  - se borra `components/shared/confirm-action-dialog.tsx`.
- [ ] **T2j [P]. `DatePicker` del filtro de la tabla. Solo si P6 es sí.**

## Tanda 3 — Acciones por fila: el cambio visible (depende de la tanda 2; cada tabla [P])

**Qué se hace en cada tabla** (`design.md > 2.4` y `> 3.4`):
- la celda pasa a ser un `*-row-actions` con `RowActionsMenu`;
- la columna se declara con `actionsColumn()`, con su `id`, su etiqueta y su anclado de hoy;
- los paneles y diálogos con disparador propio ganan el modo controlado y conservan el otro.

**Hecho cuando, en cada tabla:**
- `acciones-por-fila.test.tsx` pasa **sin regenerar**: mismas acciones, orden, testids y destino;
- los tests y E2E de la lista pasan con el paso de abrir el menú (R25), con el helper
  `tests/helpers/row-actions-menu.ts` (nuevo) o `e2e/helpers/row-actions-menu.ts`;
- la paridad de QC-231 de esa pantalla se regenera **solo** en la celda de acciones (R4 c), en su
  propio commit;
- los nombres accesibles siguen P2.

- [ ] **T3a [P]. Clientes.**
- [ ] **T3b [P]. Presentaciones.**
- [ ] **T3c [P]. Unidades.**
- [ ] **T3d [P]. Grupos de trabajo:** `WorkGroupRowActions` con menú y sin su `TOUCH_TARGET` local.
  Usuarios solo adopta `actionsColumn()`.
- [ ] **T3e [P]. Productos y producto terminado:** `product-row-actions.tsx` (nuevo), y el modo
  controlado de `ProductSheet`, `ProductBatchesSheet` y `DeleteProductDialog`.
- [ ] **T3f [P]. Recetas:** `recipe-row-actions.tsx` (nuevo). La edición es un item enlace. Modo
  controlado de `DeleteRecipeDialog`.
- [ ] **T3g [P]. Catálogo de proveedor:** `catalog-line-row-actions.tsx` (nuevo), y el modo
  controlado de `CatalogLineSheet` y `DeleteCatalogLineDialog`.

## Tanda 4 — Listas de asignación y traspasos (depende de la tanda 2; primera en salir si no da el tiempo, P3)

- [ ] **T4a [P]. Listas de asignación** (R27; `design.md > 5`).
  - **Qué se hace:** `assignment-list-parts.tsx` (nuevo, interno), y que los conjuntos assigned,
    company, finished y packing deleguen en él. Sus archivos y sus exports se quedan.
  - **Hecho cuando:** `asignacion-paridad.test.tsx` y los tests de `asignaciones-ui` que no son de
    QC-217 pasan **sin regenerar ni editar**.
- [ ] **T4b [P]. Traspasos de QC-231** (R26; `design.md > 6`).
  - **Qué se hace:**
    - se borran los alias `EMPTY_CELL`, y `product-batches-panel.tsx` y `supplier-detail-header.tsx`
      pasan a `EMPTY_MARK`;
    - `step-document-view.tsx` adopta `touchTarget`, **solo si P5 lo deja entrar**.
  - **Hecho cuando:** `vitest related` está en verde y `order-execution-screen.test.tsx` no se ha
    editado.

## Tanda 5 — Guardias y cierre (depende de todo lo anterior)

- [ ] **T5a. `tests/guards/guard-formularios-y-acciones.test.ts`** (R4, R28, R30, R31; `design.md > 9`).
  - **Hecho cuando:**
    - está en verde;
    - tiene una muestra que muerde por regla;
    - sus excepciones son la lista cerrada, sin archivos muertos;
    - el caso de diff corre en esta rama y hace `skip` ruidoso fuera.
- [ ] **T5b. `guard-piezas-base` apretada** (R26, R28).
  - **Qué se hace:** se retiran las excepciones que esta rama resolvió (`design.md > 6`).
  - **Hecho cuando:** la guardia está en verde y ninguna excepción retirada vuelve a hacer falta.
- [ ] **T5c. Deudas** (R29).
  - **Qué se escribe:** en `progress/deudas.md`, cada excepción que sigue citando QC-232 en las dos
    guardias y cada punto de `design.md > 7`, con su archivo, su motivo y la ficha que lo resuelve
    (QC-223, QC-217 o QC-227).
  - **Hecho cuando:** no queda ninguna excepción sin su fila.
- [ ] **T5d. `./init.sh` en verde**, y `progress/impl_QC-232-componentizacion-formularios-y-acciones.md`
  completo:
  - el mapa R → test (`design.md > 14`);
  - el resultado de TA;
  - la lista de campos de T0a;
  - cada edición de test de R4, con su tipo (a), (b) o (c).
- [ ] **T5e. Capturas «después»** (R3). **Las hace el leader**, en
  `_trabajo/marca/capturas-formularios-despues/`, con lo mismo que T0c y, además, el menú abierto en
  cada tabla con acciones.
  - **Hecho cuando:** cada captura «antes» tiene su pareja y la tabla de parejas queda lista para el
    reviewer.
- [ ] **T5f. `archivos-en-vuelo` antes del merge** (R32).
  - **Hecho cuando:** `node scripts/archivos-en-vuelo.mjs --candidata QC-232` no da `CHOCA`, y la
    salida queda anotada en `progress/features/QC-232.md`.

## Archivos esperados

Lo que esta rama **no** toca está en `requirements.md > Lo que NO entra` y en `design.md > 7`. No se
lista aquí, para que `archivos-en-vuelo` no lo lea como ruta de esta feature. Las rutas marcadas
«P1» salen si TA las encuentra en el diff de QC-223.

### Piezas compartidas
- `components/shared/form-sheet.tsx`
- `hooks/use-entity-sheet.ts`
- `components/shared/confirm-dialog.tsx`
- `components/shared/delete-confirm-dialog.tsx`
- `components/shared/confirm-action-dialog.tsx` (se borra)
- `components/shared/field-error.tsx`
- `components/shared/text-field.tsx`
- `components/shared/select-field.tsx`
- `components/shared/date-picker.tsx`
- `components/shared/shared-select.tsx`
- `components/shared/row-actions-menu.tsx`
- `components/shared/data-table/actions-column.tsx`
- `components/shared/data-table/index.ts`
- `components/shared/data-table/data-table-filter-date.tsx` (P6)
- `components/shared/step-reader/step-document-view.tsx` (P5)
- `components/shared/supplier/supplier-form.tsx`
- `components/shared/supplier/supplier-sheet.tsx`
- `components/shared/supplier/supplier-field.tsx`

### clientes
- `app/(private)/clientes/components/customer-form.tsx`
- `app/(private)/clientes/components/customer-sheet.tsx`
- `app/(private)/clientes/components/delete-customer-dialog.tsx`
- `app/(private)/clientes/components/customer-row-actions.tsx`
- `app/(private)/clientes/components/customer-columns.tsx`

### configuracion
- `app/(private)/configuracion/presentaciones/components/presentation-form.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-sheet.tsx`
- `app/(private)/configuracion/presentaciones/components/delete-presentation-dialog.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-row-actions.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-columns.tsx`
- `app/(private)/configuracion/unidades/components/unit-form.tsx`
- `app/(private)/configuracion/unidades/components/unit-sheet.tsx`
- `app/(private)/configuracion/unidades/components/delete-unit-dialog.tsx`
- `app/(private)/configuracion/unidades/components/unit-row-actions.tsx`
- `app/(private)/configuracion/unidades/components/unit-columns.tsx`
- `app/(private)/configuracion/usuarios/components/user-form.tsx`
- `app/(private)/configuracion/usuarios/components/user-sheet.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-form.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-sheet.tsx`
- `app/(private)/configuracion/usuarios/components/delete-user-dialog.tsx`
- `app/(private)/configuracion/usuarios/components/delete-work-group-dialog.tsx`
- `app/(private)/configuracion/usuarios/components/user-status-dialog.tsx`
- `app/(private)/configuracion/usuarios/components/end-user-sessions-dialog.tsx`
- `app/(private)/configuracion/usuarios/components/user-columns.tsx`
- `app/(private)/configuracion/usuarios/components/work-group-columns.tsx`

### inventario
- `app/(private)/inventario/components/product-form.tsx`
- `app/(private)/inventario/components/product-sheet.tsx`
- `app/(private)/inventario/components/product-field.tsx`
- `app/(private)/inventario/components/product-batch-date-field.tsx`
- `app/(private)/inventario/components/delete-product-dialog.tsx`
- `app/(private)/inventario/components/product-batches-sheet.tsx`
- `app/(private)/inventario/components/product-batches-panel.tsx`
- `app/(private)/inventario/components/product-table.tsx`
- `app/(private)/inventario/components/product-columns.tsx`
- `app/(private)/inventario/components/product-row-actions.tsx` (nuevo)
- `app/(private)/inventario/components/finished-stock-table.tsx`
- `app/(private)/inventario/components/finished-stock-columns.tsx`
- `app/(private)/inventario/importar/components/import-dialog-parts.tsx`

### produccion/formulas
- `app/(private)/produccion/formulas/components/delete-recipe-dialog.tsx`
- `app/(private)/produccion/formulas/components/recipe-table.tsx`
- `app/(private)/produccion/formulas/components/recipe-columns.tsx`
- `app/(private)/produccion/formulas/components/recipe-row-actions.tsx` (nuevo)

### proveedores
- `app/(private)/proveedores/[id]/components/catalog-line-form.tsx`
- `app/(private)/proveedores/[id]/components/catalog-line-sheet.tsx`
- `app/(private)/proveedores/[id]/components/delete-catalog-line-dialog.tsx`
- `app/(private)/proveedores/[id]/components/delete-supplier-dialog.tsx`
- `app/(private)/proveedores/[id]/components/unit-select.tsx`
- `app/(private)/proveedores/[id]/components/catalog-table.tsx`
- `app/(private)/proveedores/[id]/components/catalog-columns.tsx`
- `app/(private)/proveedores/[id]/components/catalog-line-row-actions.tsx` (nuevo)
- `app/(private)/proveedores/[id]/components/supplier-detail-header.tsx`

### pedidos (P1)
- `app/(private)/pedidos/components/order-form.tsx`
- `app/(private)/pedidos/components/order-sheet.tsx`
- `app/(private)/pedidos/components/order-field.tsx`
- `app/(private)/pedidos/components/delete-order-dialog.tsx`
- `app/(private)/pedidos/components/cancel-order-dialog.tsx`

### asignacion (sin los archivos de QC-217)
- `app/(private)/asignacion/[id]/components/order-cancel-dialog.tsx`
- `app/(private)/asignacion/[id]/components/order-execution-screen.tsx`
- `app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx`
- `app/(private)/asignacion/components/assigned-order-start-trigger.tsx`
- `app/(private)/asignacion/components/assignment-list-parts.tsx` (nuevo)
- `app/(private)/asignacion/components/assigned-orders-columns.tsx`
- `app/(private)/asignacion/components/assigned-orders-empty.tsx`
- `app/(private)/asignacion/components/assigned-orders-list-section.tsx`
- `app/(private)/asignacion/components/assigned-orders-skeleton.tsx`
- `app/(private)/asignacion/components/assigned-orders-table.tsx`
- `app/(private)/asignacion/components/company-orders-columns.tsx`
- `app/(private)/asignacion/components/company-orders-empty.tsx`
- `app/(private)/asignacion/components/company-orders-list-section.tsx`
- `app/(private)/asignacion/components/company-orders-skeleton.tsx`
- `app/(private)/asignacion/components/company-orders-table.tsx`
- `app/(private)/asignacion/components/finished-orders-columns.tsx`
- `app/(private)/asignacion/components/finished-orders-empty.tsx`
- `app/(private)/asignacion/components/finished-orders-list-section.tsx`
- `app/(private)/asignacion/components/finished-orders-skeleton.tsx`
- `app/(private)/asignacion/components/finished-orders-table.tsx`
- `app/(private)/asignacion/components/packing-orders-columns.tsx`
- `app/(private)/asignacion/components/packing-orders-list-section.tsx`
- `app/(private)/asignacion/components/packing-orders-skeleton.tsx`

### Tests nuevos
- `tests/unit/paridad/formularios-paridad.test.tsx`
- `tests/unit/paridad/confirmaciones-paridad.test.tsx`
- `tests/unit/paridad/campos-paridad.test.tsx`
- `tests/unit/paridad/acciones-por-fila.test.tsx`
- `tests/unit/paridad/__snapshots__/formularios-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/confirmaciones-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/campos-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/acciones-por-fila.test.tsx.snap`
- `tests/unit/shared-ui/form-sheet.test.tsx`
- `tests/unit/shared-ui/use-entity-sheet.test.tsx`
- `tests/unit/shared-ui/confirm-dialog.test.tsx`
- `tests/unit/shared-ui/campos.test.tsx`
- `tests/unit/shared-ui/row-actions-menu-href.test.tsx`
- `tests/unit/shared-ui/actions-column.test.tsx`
- `tests/helpers/row-actions-menu.ts`
- `tests/guards/guard-formularios-y-acciones.test.ts`

### Tests y guardias que se editan (R4, R25, R28)
- `tests/guards/guard-piezas-base.test.ts`
- `tests/unit/paridad/__snapshots__/clientes-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/presentaciones-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/unidades-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/grupos-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/inventario-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/recetas-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/catalogo-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/proveedores-paridad.test.tsx.snap`
- `tests/unit/clientes-ui/clientes-page.test.tsx`
- `tests/unit/clientes-ui/clientes-viewport.test.tsx`
- `tests/unit/clientes-ui/customer-list-section.test.tsx`
- `tests/unit/clientes-ui/customer-table.test.tsx`
- `tests/unit/clientes-ui/delete-customer-dialog.test.tsx`
- `tests/unit/configuracion-ui/configuracion-viewport.test.tsx`
- `tests/unit/configuracion-ui/delete-unit-dialog.test.tsx`
- `tests/unit/configuracion-ui/grupos/work-group-a11y.test.tsx`
- `tests/unit/configuracion-ui/grupos/work-group-columns.test.tsx`
- `tests/unit/configuracion-ui/grupos/work-group-table.test.tsx`
- `tests/unit/configuracion-ui/presentation-columns.test.tsx`
- `tests/unit/configuracion-ui/presentation-page.test.tsx`
- `tests/unit/configuracion-ui/unidades-convenciones.test.ts`
- `tests/unit/configuracion-ui/unidades-viewport.test.tsx`
- `tests/unit/configuracion-ui/unit-columns.test.tsx`
- `tests/unit/inventario/product-page.test.tsx`
- `tests/unit/inventario/finished-stock-table.test.tsx`
- `tests/unit/inventario/product-batches-sheet.test.tsx`
- `tests/unit/proveedores-ui/catalog-line-form.test.tsx`
- `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`
- `tests/unit/proveedores-ui/delete-catalog-line-dialog.test.tsx`
- `tests/unit/recetas-ui/recipe-page.test.tsx`
- `tests/unit/recetas-ui/delete-recipe-dialog.test.tsx`
- `tests/unit/recetas-ui/recipe-version-list.test.tsx`
- `e2e/clientes.spec.ts`
- `e2e/grupos-de-trabajo.spec.ts`
- `e2e/producto-terminado.spec.ts`
- `e2e/recetas-pasos.spec.ts`
- `e2e/versiones-en-la-receta.spec.ts`
- `e2e/ajuste-de-inventario.spec.ts`
- `e2e/insumo-por-unidad.spec.ts`
- `e2e/aislamiento-inventario.spec.ts`
- `e2e/reserva-de-material.spec.ts`
