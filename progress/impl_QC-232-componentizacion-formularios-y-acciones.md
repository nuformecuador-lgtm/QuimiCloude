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

## Mapa R -> test
_(completo en T5d; base: `design.md > 14`)_

| R | Test (tanda 0) |
|---|---|
| R1 | `formularios-paridad`, `confirmaciones-paridad`, `campos-paridad`, `acciones-por-fila`, `asignacion-listas-paridad` (sin regenerar desde la tanda 0) |
| R6–R11 | `formularios-paridad` (alta, edición, error general, error de campo, enviando, disparadores cerrados, pie deshabilitado del grupo y del pedido) |
| R12–R15 | `confirmaciones-paridad` (abierto, pendiente, error, disparador propio cerrado; receta con transición; los 3 de `ConfirmActionDialog`) |
| R16–R19 | `campos-paridad` (cada sitio de `## Campos`, con y sin error, selects abiertos, fechas abiertas) y `formularios-paridad > R19` (`FormData`) |
| R20–R23 | `acciones-por-fila` (con permiso y solo consulta) |
| R27 | `asignacion-listas-paridad` + `asignacion-paridad` (QC-231) |

## Ediciones de test (R4)
_(cada edición con su tipo (a), (b) o (c))_

Tanda 0: ninguna. Solo tests nuevos.

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
