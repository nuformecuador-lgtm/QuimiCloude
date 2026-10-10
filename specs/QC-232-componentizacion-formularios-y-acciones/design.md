# QC-232 — componentizacion-formularios-y-acciones · design

## Lo que ya existe

**Términos buscados:** `FormActions`, `SaveButton`, `useFormStatus`, `FormSheet`, `delete-*-dialog`,
`ConfirmActionDialog`, `AlertDialogAction`, `RowActionsMenu`, `rowActions`, `ACTIONS_COLUMN`,
`SharedSelect`, `*TextField`, `calendar`, `OrderDistributionFull`, `EMPTY_CELL` y `TOUCH_TARGET`.
Busqué en el board (`feature_list.json`), en `specs/` y en el código.

**Grafo.** El worktree no está indexado. Consulté el proyecto del árbol principal, que es `dev` con
QC-231, QC-233 y QC-223 ya mergeadas, y lo verifiqué con Grep y Read sobre el worktree.

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| QC-231 (piezas base, cerrada) | `specs/QC-231-…` | Se reutilizan sus piezas: la talla `touch` / `touchTarget`, `ErrorAlert`, `EmptyState`, `ErrorState`, `TableSkeleton`, `Spinner`, `EMPTY_MARK`, `SubmitButton` y el helper de paridad. Le traspasó a esta ficha D8 y D9 |
| QC-233 (buscadores, cerrada) | `specs/QC-233-…` | No se toca nada suyo (R30). Su P5 manda aquí los selects no asíncronos (D10) |
| QC-227 (marca, pendiente) | board | Depende de esta ficha. Se queda con toda unificación visual (D2) |
| `SheetContent` con `isForm`, `formProps` y `footer` | `components/ui/sheet.tsx` | **Base de `FormSheet`**. La auditoría (§2.d) dice que solo falta la capa encima |
| `RowActionsMenu` (QC-66, usuarios; también pedidos) | `components/shared/row-actions-menu.tsx` | **Se reutiliza y se amplía** con items que son enlaces (§3.4). Su API actual no cambia |
| `ConfirmActionDialog` (3 consumidores, todos de asignación) | `components/shared/confirm-action-dialog.tsx` | **Lo absorbe `ConfirmDialog`** en su forma sin form (R12). Se borra |
| `SharedSelect` (un solo consumidor, `product-form`) | `components/shared/shared-select.tsx` | **Base de `SelectField`** (R16). Se amplía de forma aditiva |
| `e2e/helpers/row-actions-menu.ts` y `e2e/helpers/confirm-dialog.ts` | `e2e/helpers/` | **Se reutilizan** en los E2E que pasan a abrir el menú (R25) |
| Paridad del árbol accesible y snapshots de QC-231 y QC-233 | `tests/unit/paridad/` | Se reutiliza `arbolAccesible()`. Los snapshots congelados no se regeneran, salvo la excepción R4 (c) |
| `guard-piezas-base` y sus excepciones que citan QC-232 | `tests/guards/guard-piezas-base.test.ts` | Se retiran las que esta rama resuelve (R28). Las demás pasan a `progress/deudas.md` (R29) |
| QC-223 (entrega, mergeada en `dev` #190 y aún `in_progress`), QC-217 (`in_progress`) y QC-234 (mergeada #191, `in_progress`) | sus `tasks.md > Archivos esperados` | **No se tocan sus archivos** (D4). Ver §7 y P1 |

No hay ninguna otra ficha ni spec que cree `FormSheet`, `DeleteConfirmDialog`, `TextField`,
`SelectField`, `DatePicker` ni `actionsColumn`.

## 1. Principio

Es igual que QC-231 y QC-233: **cero cambio** (D2, D6).

- **Cada pieza compartida reproduce el marcado exacto de cada sitio.** Las diferencias de hoy, como
  las clases del pie, el `<div>` que envuelve el pie del grupo, `touch` frente a `touchTarget` o
  los textos, entran por props.
- **El «antes» se congela en la tanda 0, antes de tocar producción, y no se regenera.**
- **El cambio visible de las acciones por fila va en su propia tanda, la 3,** después de que todo
  lo demás haya pasado la paridad sin regenerar. Así el único diff de snapshots es la celda de
  acciones (R4 c).

**Modelo de datos, RLS y migraciones:** ninguno. **Rutas, Server Actions e integraciones:** ninguna
nueva ni cambiada; los formularios y diálogos siguen llamando a las mismas actions con el mismo
`FormData`. **Dependencias:** ninguna nueva (R31).

## 2. Inventario

### 2.1 Formularios en panel (R6–R11)

| Formulario | Archivo del form | Envoltorio | Diferencias que pasan a props |
|---|---|---|---|
| Cliente | `clientes/components/customer-form.tsx` | `customer-sheet.tsx` | — |
| Presentación | `configuracion/presentaciones/components/presentation-form.tsx` | `presentation-sheet.tsx` | — |
| Unidad | `configuracion/unidades/components/unit-form.tsx` | `unit-sheet.tsx` | — |
| Usuario | `configuracion/usuarios/components/user-form.tsx` | `user-sheet.tsx` | — |
| Grupo de trabajo | `configuracion/usuarios/components/work-group-form.tsx` | `work-group-sheet.tsx` | `disabled`; pie envuelto en `div.flex…justify-end`; `touch` en guardar |
| Producto | `inventario/components/product-form.tsx` | `product-sheet.tsx` | — |
| Pedido | `pedidos/components/order-form.tsx` | `order-sheet.tsx` | `canSave`, `busy`; `touchTarget` en guardar. **Pendiente de P1** |
| Línea de catálogo | `proveedores/[id]/components/catalog-line-form.tsx` | `catalog-line-sheet.tsx` | — |
| Proveedor | `components/shared/supplier/supplier-form.tsx` | `supplier-sheet.tsx` | — |

Las clases, testids y textos exactos de cada celda los fija la paridad de T0. Esta tabla es el mapa,
no la fuente de verdad.

### 2.2 Diálogos de confirmación (R12–R15)

| Diálogo | Archivo | Forma | Apertura |
|---|---|---|---|
| Borrar cliente, presentación, unidad, usuario y grupo | `delete-{customer,presentation,unit,user,work-group}-dialog.tsx` | form + `useActionState` | controlada |
| Borrar producto | `inventario/components/delete-product-dialog.tsx` | form | disparador propio (`product-delete-open`) |
| Borrar receta | `produccion/formulas/components/delete-recipe-dialog.tsx` | **transición** | disparador propio (`recipe-delete-open`) |
| Borrar línea de catálogo | `proveedores/[id]/components/delete-catalog-line-dialog.tsx` | form | disparador propio (`catalog-line-delete-open`) |
| Borrar proveedor | `proveedores/[id]/components/delete-supplier-dialog.tsx` | form | disparador propio (`supplier-delete-open`, en la cabecera) |
| Borrar pedido | `pedidos/components/delete-order-dialog.tsx` | form | controlada. **Pendiente de P1** |
| Cancelar pedido | `pedidos/components/cancel-order-dialog.tsx` | form | controlada. **Pendiente de P1** |
| Cancelar pedido (asignación) | `asignacion/[id]/components/order-cancel-dialog.tsx` | form | disparador propio (`order-cancel-trigger`) |
| Estado de usuario | `configuracion/usuarios/components/user-status-dialog.tsx` | form con select | controlada |
| Cerrar sesiones | `configuracion/usuarios/components/end-user-sessions-dialog.tsx` | form | controlada |
| Los 3 de `ConfirmActionDialog` | `assigned-order-start-trigger.tsx`, `asignacion/[id]/components/order-execution-screen.tsx`, `asignacion/empaque/[id]/components/packing-order-screen.tsx` | sin form (`onConfirm`) | controlada |

### 2.3 Campos (R16–R19): lista que se cierra en T0

**Texto.** Lo que encontré:
- `CustomerTextField` (`customer-form.tsx`);
- `UnitTextField` (`unit-form.tsx`);
- `UserTextField` (`user-form.tsx`);
- `ProductField` (`inventario/components/product-field.tsx`);
- `OrderField` (`pedidos/components/order-field.tsx`, **pendiente de P1**);
- `CatalogField` (`catalog-line-form.tsx`);
- `SupplierField` (`components/shared/supplier/supplier-field.tsx`);
- `DialogTextField` (`inventario/importar/components/import-dialog-parts.tsx`);
- los campos en línea de `presentation-form.tsx` y de `work-group-form.tsx`.

**Select.** Lo que encontré:
- `UserSelectField` (`user-form.tsx`);
- el `SelectField` local de `order-form.tsx` (**pendiente de P1**). Choca de nombre con el
  compartido, así que se importa con alias o el local desaparece;
- el select de «deriva de» de `unit-form.tsx`;
- `UnitSelect` (`proveedores/[id]/components/unit-select.tsx`);
- el `SharedSelect` de `product-form.tsx`.

**Fecha.**
- `inventario/components/product-batch-date-field.tsx`;
- `components/shared/data-table/data-table-filter-date.tsx`, **pendiente de P6**.

**Cómo se cierra la lista.** En T0 el implementer confirma cada sitio y escribe la lista cerrada en
`progress/impl_QC-232-…md > Campos`. Un sitio que no se pueda migrar sin cambiar el árbol accesible
**se queda fuera** y se anota con su motivo; no se fuerza.

### 2.4 Tablas con acciones (R20–R24)

| Tabla | Hoy | Archivos | Acciones (orden de hoy) |
|---|---|---|---|
| Clientes | botones de icono | `customer-row-actions.tsx`, `customer-columns.tsx` | editar, eliminar |
| Presentaciones | botones de icono | `presentation-row-actions.tsx`, `presentation-columns.tsx` | editar, eliminar |
| Unidades | botones de icono | `unit-row-actions.tsx`, `unit-columns.tsx` | editar, eliminar |
| Grupos de trabajo | botones de icono (`WorkGroupRowActions`, con su `TOUCH_TARGET` local) | `work-group-columns.tsx` | editar, eliminar |
| Usuarios | menú | `user-columns.tsx` (solo `actionsColumn()`) | sin cambio |
| Productos | render prop | `product-table.tsx`, `product-columns.tsx`, nuevo `product-row-actions.tsx` | lotes, editar, eliminar |
| Producto terminado | render prop | `finished-stock-table.tsx`, `finished-stock-columns.tsx` (reutiliza `product-row-actions.tsx`) | las de hoy, que fija T0 |
| Recetas | render prop | `recipe-table.tsx`, `recipe-columns.tsx`, nuevo `recipe-row-actions.tsx` | editar (**enlace**), eliminar |
| Catálogo de proveedor | render prop | `catalog-table.tsx`, `catalog-columns.tsx`, nuevo `catalog-line-row-actions.tsx` | editar, eliminar |
| Pedidos | menú | archivos de QC-223 | **fuera** (D4) |

En las tablas con render prop, el panel y el diálogo traen hoy **su propio disparador**. Para que el
item del menú los abra, `ProductSheet`, `ProductBatchesSheet`, `DeleteProductDialog`,
`CatalogLineSheet`, `DeleteCatalogLineDialog` y `DeleteRecipeDialog` ganan el **modo controlado**
(`open`/`onOpenChange`). Es el patrón que ya usan `UnitSheet` y `CustomerSheet`: sin `open` traen su
disparador y con `open` no lo montan.

El modo con disparador propio **se conserva**:
- lo sigue usando el alta (`product-create-open`, `catalog-line-create-open`);
- lo usan la cabecera del proveedor y la lista de versiones de la receta;
- lo usan los tests de cada diálogo, que así no cambian (R4, R15).

## 3. Contratos de las piezas

Todo es aditivo. Los nombres de props son orientativos: el implementer puede reorganizarlos siempre
que la paridad pase sin regenerarse.

### 3.1 `FormSheet`, `SaveButton` y `useEntitySheet`

```ts
// components/shared/form-sheet.tsx  ('use client')
type FormSheetProps = {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly formAction: (formData: FormData) => void;
  readonly children: ReactNode;               // cuerpo con scroll
  readonly side?: 'right' | 'bottom';          // el de hoy por sitio
  readonly className?: string;                 // ancho y safe-area de hoy, por sitio
  readonly testIds: { sheet: string; form: string; cancel: string; submit: string };
  readonly cancelLabel?: string;               // defecto «Cancelar»
  readonly saveLabel?: string;                 // defecto «Guardar»
  readonly pendingLabel?: string;              // defecto «Guardando…»
  readonly canSave?: boolean;                  // R9, pedido; defecto true
  readonly busy?: boolean;                     // R9, pedido; defecto false
  readonly disabled?: boolean;                 // R9, grupo; defecto false
  readonly footerWrapperClassName?: string;    // R9, el <div> del pie del grupo
  readonly cancelClassName?: string; readonly saveTouch?: 'prop' | 'class';
  readonly beforeBody?: ReactNode;             // error general (ErrorAlert) donde va hoy
};
export function FormSheet(props: FormSheetProps): JSX.Element;
export function SaveButton(props: { … }): JSX.Element;
```

- **Composición.** `SheetContent isForm formProps={{ action, 'data-testid' }} footer={…}` con
  `SheetHeader` / `SheetTitle` / `SheetDescription`. No crea un `<form>` nuevo: lo crea el
  primitivo, como hoy.
- **`SaveButton` es un componente aparte dentro del pie.** `useFormStatus()` solo lee el `<form>`
  ancestro (R8). La lógica:
  - `pending = useFormStatus().pending || busy`;
  - `disabled = pending || !canSave || disabled`;
  - `aria-busy = pending`.

  Reproduce la del pedido y la del grupo (R9).
- **Cancelar** es `SheetClose` con `render={<Button type="button" …/>}` (R7).

```ts
// hooks/use-entity-sheet.ts  ('use client')
function useEntitySheet(opts: {
  open?: boolean; onOpenChange?: (open: boolean) => void;
  successMessage: string;                       // el del modo (alta o edición)
}): { isOpen: boolean; isControlled: boolean; changeOpen: (next: boolean) => void; handleSaved: () => void };
```

- `handleSaved` hace, en este orden: `changeOpen(false)`, `toast.success(successMessage)` y
  `router.refresh()` (R11).
- Los envoltorios conservan su disparador propio, su `Sheet` y sus testids. Solo cambia de dónde sale
  el estado.

### 3.2 `ConfirmDialog` y `DeleteConfirmDialog`

```ts
// components/shared/confirm-dialog.tsx  ('use client')
type ConfirmDialogProps = {
  readonly open?: boolean; readonly onOpenChange?: (open: boolean) => void;
  readonly trigger?: ReactElement;              // disparador propio (R15); sin él, controlado
  readonly texts: { title: string; description: ReactNode; dismiss: string; confirm: string; pending?: string };
  readonly variant?: 'default' | 'destructive';
  readonly testIds: { dialog: string; message?: string; dismiss: string; confirm: string; form?: string; id?: string; error?: string; errorMessage?: string };
  // Forma con form (R12):
  readonly submit?:
    | { kind: 'action'; action: (fd: FormData) => void; isPending: boolean; hidden?: Record<string, string> }
    | { kind: 'transition'; onConfirm: () => void; isPending: boolean };   // receta
  // Forma sin form (la de ConfirmActionDialog):
  readonly onConfirm?: () => void;
  readonly error?: ErrorState;                  // se pinta con ErrorAlert y las props de marcado de hoy
  readonly errorAlertProps?: Partial<ErrorAlertProps>;
  readonly children?: ReactNode;                // contenido extra: el aviso de versiones de la receta o el select del estado de usuario
};
```

- **El estado de la action se queda en cada diálogo:** el `useActionState`, la transición y el
  efecto de éxito con su toast. La base solo pinta. Así:
  - cada diálogo conserva su Server Action, su `code` estable y su texto de toast (R14);
  - las guardias que leen la action por archivo no cambian.
- **`DeleteConfirmDialog`** es `ConfirmDialog` con `variant="destructive"` y los textos por defecto
  «Eliminar» / «Eliminando…». Va en `components/shared/delete-confirm-dialog.tsx`.
- **Sin form,** al confirmar hace `onOpenChange(false)` y después `onConfirm()`, como
  `ConfirmActionDialog` (R14).
- **Los testids derivados** de `ConfirmActionDialog` (`${testId}-cancel`) se pasan explícitos.

### 3.3 Campos

```ts
// components/shared/field-error.tsx — <p id role="alert" className="text-sm text-destructive" data-testid>
// components/shared/text-field.tsx
type TextFieldProps = { id: string; name: string; label: ReactNode; defaultValue?: string;
  required?: boolean; inputMode?: …; type?: …; autoComplete?: string; error?: string;
  testId?: string; errorTestId?: string; hint?: ReactNode; className?: string; inputClassName?: string;
  remountOnDefault?: boolean /* key={defaultValue} de hoy */ };
// components/shared/select-field.tsx — etiqueta + SharedSelect + FieldError
// components/shared/date-picker.tsx — Popover + Calendar + input oculto, con el formato de hoy (formatCivilDate)
```

- **`aria-describedby` solo con error**, como hoy (R18). Si un sitio lo pone también con ayuda, va
  por prop.
- **`SharedSelect` gana, de forma aditiva:** testids por opción, una opción «ninguna» explícita (la
  de unidades), `aria-labelledby` y las clases del disparador. Su único consumidor de hoy,
  `product-form`, no cambia.
- **El 16 px y el `min-h-11`** de los inputs se conservan donde ya estaban.

### 3.4 `RowActionsMenu` ampliado y `actionsColumn()`

- **`RowActionMenuItem` gana `href?: string`.**
  - Con `href`, el item se pinta como enlace (`DropdownMenuItem` con `render={<Link href …/>}`), así
    que conserva su semántica de enlace (R21).
  - Sin `href`, se pinta como hoy.
  - La API actual no cambia y usuarios y pedidos siguen igual.
- **`components/shared/data-table/actions-column.tsx`:**

```ts
export function actionsColumn<T>(opts: {
  id?: string;             // defecto: el ACTIONS_COLUMN_ID común; cada tabla pasa el suyo si difiere (R24)
  label?: string;          // defecto: la etiqueta común de hoy
  align?: 'end'; defaultPinned?: 'right';
  cell: (row: T) => ReactNode;
}): DataTableColumn<T>;
```

  Se exporta desde `components/shared/data-table/index.ts`.
- **Cada `*-row-actions`** monta **una** instancia de sus paneles y diálogos por fila, como ya hace
  `CustomerRowActions`. Pasa los items a `RowActionsMenu`:
  - **testid del item:** el del control de hoy (R23);
  - **`triggerTestId`:** el del contenedor de hoy (`customer-row-actions`, `unit-row-actions`…);
  - **`triggerDataAttributes`:** el `data-*-id` de hoy;
  - **`triggerLabel`:** según P2.
- **Con el permiso ausente devuelve `null`,** igual que hoy (R22).

## 4. Cómo se adopta, por ruta

Cada ruta conserva sus exports (R5). Sus barrels solo cambian si exportaban algo que desaparece. Hoy
no hay ningún caso: `ConfirmActionDialog` vive en `components/shared/` y se importa por ruta.

| Ruta | Formularios (§2.1) | Confirmaciones (§2.2) | Campos (§2.3) | Acciones (§2.4, tanda 3) |
|---|---|---|---|---|
| `clientes` | cliente | borrar cliente | `CustomerTextField` | sí |
| `configuracion/presentaciones` | presentación | borrar presentación | en línea | sí |
| `configuracion/unidades` | unidad | borrar unidad | `UnitTextField`, select base | sí |
| `configuracion/usuarios` | usuario, grupo | borrar usuario y grupo, estado, cerrar sesiones | `UserTextField`, `UserSelectField`, en línea del grupo | grupos sí; usuarios solo `actionsColumn()` |
| `inventario` | producto | borrar producto | `ProductField`, `SharedSelect`, fecha de lote, `DialogTextField` | productos y producto terminado |
| `produccion/formulas` | — | borrar receta | — | recetas |
| `proveedores/[id]` + `components/shared/supplier` | línea, proveedor | borrar línea y proveedor | `CatalogField`, `UnitSelect`, `SupplierField` | catálogo |
| `pedidos` (**P1**) | pedido | borrar y cancelar pedido | `OrderField`, select local | **no** (D4) |
| `asignacion` (fuera de los archivos de QC-217) | — | `order-cancel-dialog` y los 3 de `ConfirmActionDialog` | — | — |

## 5. Listas de asignación (R27, D8)

**Qué entra.** Los conjuntos que **no** son de QC-217:
- `assigned-orders-*`;
- `company-orders-*`;
- `finished-orders-*`;
- `packing-orders-*` (no tiene `table` ni `empty` propios).

**Qué se hace.** Un archivo interno nuevo, `asignacion/components/assignment-list-parts.tsx`, sin
exportar desde el barrel. Contiene las piezas parametrizadas:
- **la sección:** estado de lista a `DataTable` `states`, o la pieza compartida directa donde
  QC-231 lo declaró así;
- **el vacío:** sobre `EmptyState`, con el texto, el enlace a la primera página y los testids;
- **el esqueleto:** sobre `TableSkeleton`, con el número de columnas;
- **los constructores de columna repetidos:** número, receta, presentación, cantidad y
  responsables. Cada `*-columns` los compone y conserva sus `*_COLUMN_ID` y sus etiquetas.

**Qué no cambia.**
- **Los archivos de cada conjunto se quedan,** con sus exports. El barrel `asignacion/components/index.ts`
  es de QC-217 y los exporta todos (R5, D4). Por dentro pasan a delegar.
- **`AssignedOrdersError` se conserva** porque el barrel lo exporta. Las 4 secciones dejan de usarlo
  y pasan a `ErrorState`, con los mismos testids. Lo siguen usando las 2 secciones de QC-217.

**Cómo se prueba.** La paridad de asignación de QC-231 (`asignacion-paridad.test.tsx`) cubre estos
estados y debe pasar **sin regenerar**. Si algún estado no estuviera cubierto, T0 lo añade a la
paridad nueva antes de tocar producción.

## 6. Traspasos de QC-231 (R26, D9)

| Archivo | Qué | Consumidores que cambian |
|---|---|---|
| `components/shared/step-reader/step-document-view.tsx` | `TOUCH_TARGET` local por `touchTarget` | — **Pendiente de P5** (lista cerrada R18 de `order-execution-screen.test.tsx`) |
| `app/(private)/inventario/components/product-columns.tsx` | se borra el alias `EMPTY_CELL` | `inventario/components/product-batches-panel.tsx` importa `EMPTY_MARK` |
| `app/(private)/proveedores/[id]/components/catalog-columns.tsx` | se borra el alias `EMPTY_CELL` | `proveedores/[id]/components/supplier-detail-header.tsx` importa `EMPTY_MARK` |
| `app/(private)/configuracion/usuarios/components/work-group-columns.tsx` | `WorkGroupRowActions` con `RowActionsMenu`, sin `TOUCH_TARGET` local | — |

Con esto, `guard-piezas-base` retira estas excepciones:
- las 4 de los vacíos y esqueletos de asignación que esta rama resuelve, de `VACIOS_Y_ESQUELETOS_D7`;
- el literal de `packing-orders-first-page`;
- `step-document-view` (si P5 lo deja entrar);
- `WorkGroupRowActions`;
- los dos alias `EMPTY_CELL` de `ALIAS_DE_EMPTY_MARK`, además de su excepción.

## 7. Lo que no se toca: choques con features en vuelo (D4, R30, R32)

**Fuente.** Las rutas salen de `specs/QC-223-…/tasks.md > Archivos esperados`,
`specs/QC-217-…/tasks.md > Archivos esperados`, `specs/QC-234-…/tasks.md > Archivos esperados` y la
lista D11 de QC-231. **No he podido leer sus diffs remotos** (P1).

| Ficha | Archivos de UI o test que esta ficha necesitaría y no toca | Qué queda pendiente (deuda) |
|---|---|---|
| QC-223 | `pedidos/components/order-row-actions.tsx`, `order-columns.tsx`, `order-table.tsx` | `actionsColumn()` en pedidos (la tabla ya usa el menú: no hay cambio visible pendiente) |
| QC-223 | `pedidos/components/order-list-section.tsx`, `pedidos/components/index.ts` | borrar `order-list-empty/error/skeleton` y `OrderRecipeImage`; `ORDER_CUSTOMER_DIALOG_TOUCH_TARGET`; enmienda de la guardia de anclas de QC-102 |
| QC-223 | `pedidos/components/order-delivery-sheet.tsx` | adoptar `FormSheet` en el panel de entrega |
| QC-223 | `inventario/components/batch-history.tsx` | su constante táctil (deuda de QC-231 D11) |
| QC-223 | `tests/unit/pedidos-ui/order-row-actions.test.tsx`, `tests/guards/guard-identificador-de-request.test.ts`, `e2e/entregar-producto-terminado.spec.ts` | no se editan |
| QC-217 | `asignacion/components/order-distribution-full.tsx`, `asignacion/components/index.ts` | **mover `OrderDistributionFull` a shared** (ficha, último punto) |
| QC-217 | `conditioning-orders-*`, `conditioned-orders-*`, `assignment-view-tabs.tsx`, `acondicionamiento/[id]/**` | parametrizar el quinto conjunto de asignación |
| QC-217 | `tests/unit/pedidos-ui/order-route-contract.test.ts`, `e2e/acondicionamiento.spec.ts`, `tests/unit/asignaciones-ui/*` declarados | no se editan |
| QC-217 / QC-223 / QC-234 | `lib/composition/index.ts` | esta ficha no lo necesita |

**Lo que necesita el leader (P1).** `order-form.tsx`, `order-sheet.tsx`, `order-field.tsx`,
`delete-order-dialog.tsx` y `cancel-order-dialog.tsx` **no** están en la lista declarada de QC-223,
pero `order-sheet.tsx` estaba en su diff del 2026-10-08.
- **Antes de la tanda 2:** el leader corre los tres `git diff --name-only origin/dev...origin/<rama>`
  y `node scripts/archivos-en-vuelo.mjs --candidata QC-232`.
- **Si aparecen:** la fila «pedidos» de §4 sale entera, se quitan de `tasks.md > Archivos esperados`
  y se anotan como deuda.

## 8. Guardias y tests que ya leen estos archivos

| Guardia o test | Qué pasa |
|---|---|
| `guard-piezas-base` | **Se edita (R28):** se retiran las excepciones resueltas (§6). Las que quedan siguen citando QC-232 y pasan a `progress/deudas.md` (R29) |
| `guard-identificador-de-request` (QC-223) | **No se edita.** Su excepción de `order-form.tsx` (`setIngredientsError`) no se mueve, porque ese estado se queda en el formulario |
| `guard-buscadores` (QC-233) | No se edita. Sus casos de diff solo corren en la rama de QC-233 |
| `guard-pantalla-pedidos-se-amplia` | Lee el barrel de pedidos, que no se toca |
| Paridades de QC-231 y QC-233 | Pasan sin regenerar en las tandas 1 y 2. En la tanda 3 se regeneran **solo** las de las pantallas con tabla con acciones (R4 c): `clientes`, `presentaciones`, `unidades`, `grupos`, `inventario`, `recetas`, `catalogo` y, si pinta filas del catálogo, `proveedores`. Va en un commit por pantalla, y el reviewer comprueba con `git diff` que solo cambian los nodos de la celda de acciones |
| Tests unit y E2E que pulsan acciones de fila | Solo ganan el paso de abrir el menú (R25). Lista en `tasks.md > Archivos esperados` |

## 9. Guardia nueva (R28)

Se llama `tests/guards/guard-formularios-y-acciones.test.ts`. Es estática y usa el compilador de
TypeScript, como `guard-piezas-base` y `guard-buscadores`. Recorre `app/` y `components/`.

| Regla | Qué detecta | Excepciones con nombre (cerradas, con motivo) |
|---|---|---|
| `envio-local` | `useFormStatus` importado | `components/shared/form-sheet.tsx`, `components/shared/submit-button.tsx`, `components/ui/sheet.tsx` (si lo usa); los archivos de QC-223 (`order-delivery-sheet.tsx`); el login y establecer contraseña (`app/(public)/**`, `SubmitButton` propio); y, si P1 lo saca, `order-form.tsx` |
| `confirmacion-local` | un `AlertDialogAction` | `components/shared/confirm-dialog.tsx`, `components/ui/alert-dialog.tsx`; `blocked-order-dialog`, `propagate-versions-dialog`, `finish-conditioning-dialog` (QC-217), `logout-button` y los que §2.2 deje fuera por P1 |
| `accion-de-fila-local` | en un `*-columns`, `*-row-actions` o `*-table`, un `Button size="icon"` dentro de la celda de acciones, o una prop `rowActions`/`lineActions` que devuelve controles en vez de un `RowActionsMenu` | los archivos de QC-223 (`order-row-actions.tsx`, `order-columns.tsx` y `order-table.tsx`) |
| `confirm-action-dialog` | un import de `@/components/shared/confirm-action-dialog` | ninguna |

**Más casos de la guardia:**
- Una excepción que apunta a un archivo que no existe es un hallazgo.
- Cada regla tiene una muestra sintética que muerde.
- **Por diff contra el merge-base con `origin/dev`, y solo en la rama de QC-232** (fuera hace `skip`
  ruidoso, como `guard-buscadores`), comprueba tres cosas:
  - el diff no toca los archivos de §7, los buscadores de QC-233 ni `app/(public)/**` (R30);
  - `package.json` no gana dependencias (R31);
  - todo test o snapshot existente que el diff edita está en `tasks.md > Archivos esperados` (R4).

**Por qué la regla de acciones mira la forma y no el texto.** Así no salta con los botones de las
cabeceras ni con los de los paneles.

## 10. Cómo se demuestra el «cero cambio» (R1–R4, D6)

1. **Paridad nueva, en la tanda 0 y antes de tocar producción.** Usa `arbolAccesible()` y
   serializa `document.body` para que entren los portales. Abre con `userEvent`. Son cuatro tests:
   - **`tests/unit/paridad/formularios-paridad.test.tsx`:** un `describe` por formulario y cada
     estado de formulario. «Enviando» se simula con una action que no resuelve (`nuncaResuelve()`).
   - **`tests/unit/paridad/confirmaciones-paridad.test.tsx`:** un `describe` por diálogo y cada
     estado de diálogo, incluido el disparador propio cerrado.
   - **`tests/unit/paridad/campos-paridad.test.tsx`:** los campos de la lista de T0 sueltos, con y
     sin error, y el selector de fecha abierto.
   - **`tests/unit/paridad/acciones-por-fila.test.tsx`:** por tabla con acciones, el **inventario**
     de acciones de una fila con permiso y otra sin él. Por cada acción: el testid, el orden, si está
     deshabilitada y el testid de lo que abre, o el `href`.
     - Se escribe con un helper que funciona con las dos formas: si hay disparador de menú, lo abre
       y lee los items; si no, lee los botones.
     - Así este snapshot **no se regenera** en la tanda 3, y demuestra R20–R23 salvo los nombres
       accesibles, que dependen de P2.

   Cada snapshot se commitea solo, en `test(QC-232): congela la paridad de <grupo>`, y no se
   regenera.
2. **Tests existentes** sin editar, salvo R4 (a)–(c), con cada edición anotada en el impl.
3. **E2E en CI.** Los specs que tocan estas pantallas, sin editar salvo R25.
4. **Capturas** (R3). Las hace el leader con el seed demo, en claro, oscuro y móvil:
   - **antes:** en la tanda 0, en `_trabajo/marca/capturas-formularios-antes/`;
   - **después:** en `_trabajo/marca/capturas-formularios-despues/`, con el menú abierto en cada
     tabla con acciones;
   - las dos carpetas quedan sin versionar.

## 11. Multiplataforma

- **No hay cambios de estilo:** las clases pasan tal cual. Se conservan el `safe-area` del pie, el
  `min-h-11`, el texto de 16 px de los inputs y `100dvh` donde lo hubiera.
- **El menú de fila ya cumple la regla:**
  - el disparador mide 44×44 px y está siempre en el DOM;
  - los items llevan `min-h-11`;
  - no depende de `:hover`;
  - el `DropdownMenu` de Base UI ya se usa en usuarios y pedidos en móvil (E2E de WebKit en CI).

No hay nada que solo funcione en escritorio.

## 12. Riesgos

- **El orden de efectos al guardar** (R11, R14): cerrar, toast y `refresh`. Si cambiara, los tests
  de cada panel y diálogo lo detectan, y no se editan.
- **`useFormStatus` fuera del `<form>`.** `SaveButton` tiene que seguir renderizándose **dentro**
  del `footer` del `SheetContent`, que el primitivo mete en el `<form>`. Lo detecta la paridad del
  estado «enviando».
- **Los diálogos con disparador propio que pasan a controlados.** Montar un panel por fila multiplica
  instancias, aunque solo se monta el contenido abierto (portal). Es el patrón de `CustomerRowActions`.
- **Los items enlace dentro del menú (receta).** Si el `render` de Base UI no conserva el `href`,
  la edición de receta deja de ser un enlace. Lo cubren el inventario de acciones (con su `href`) y
  el E2E de recetas.
- **El volumen.** Son unos 70 archivos de producción y unos 35 de test, con capturas y un menú nuevo
  en 8 tablas. «Cerrar hoy» depende de P3: la tanda 4 (asignación y traspasos) es la primera que
  puede pasar a deuda sin dejar nada a medias.
- **QC-223 y QC-217 (P1).** Si una de ellas mergea después tocando una pantalla con paridad de esta
  ficha, se sincroniza con `dev`. Se regenera solo esa paridad, sobre el `dev` nuevo y antes de la
  tanda siguiente, y se anota.

## 13. Alternativas descartadas

**A1. Mantener los botones de icono en las tablas que ya los tienen, y el menú solo donde hay más de
dos acciones.**
- **A favor:** no hay cambio visible y no hay que editar tests.
- **Por qué no:** contradice D3 («menú de tres puntos en todas las tablas»), que es una decisión del
  humano, y deja los tres estilos que la auditoría (§2.n) quiere quitar.

**A2. Un `FormSheet` que también lleva el estado (`useActionState`) y el mapeo de errores de campo.**
- **A favor:** cada formulario se queda en muy pocas líneas.
- **Por qué no:** cada formulario tiene su propio contrato de estado (`FieldErrors`, `CODE_TO_FIELD`,
  la cotización del pedido, los miembros del grupo). Unificarlo es lógica de dominio en un compuesto
  de UI, y rompería las guardias que leen esos contratos en el archivo de cada formulario. Se
  comparte el marco, no el estado.

**A3. Dejar `ConfirmActionDialog` y crear `DeleteConfirmDialog` aparte.**
- **Por qué no:** quedarían dos bases de confirmación, cuando la ficha dice que la nueva «absorbe
  `ConfirmActionDialog`».

**A4. Mover los formularios de pedido y la tabla de pedidos igualmente, coordinando con Christian.**
- **Por qué no:** viola la regla 1 (choque de archivos con una ficha en vuelo de otra persona) y el
  encargo del leader. QC-231 ya lo descartó por lo mismo (su A7).

**A5. Parametrizar las listas de asignación con un componente genérico que sustituya a los archivos
de cada conjunto y los borre.**
- **Por qué no:** el barrel que los exporta es de QC-217 (D4). Borrarlos rompería su compilación.
  Se parametriza por dentro y el borrado queda como deuda.

## 14. Mapa R → test previsto

| R | Test |
|---|---|
| R1 | Las 4 paridades nuevas de §10 y las de QC-231 sin regenerar (tandas 1-2) |
| R2 | Tests de cada panel y diálogo sin editar, más los E2E en CI |
| R3 | Revisión: `progress/review_QC-232-….md > Capturas` |
| R4 | Suite en CI (`gate-completo`), el caso de diff de `guard-formularios-y-acciones` (que limita las ediciones de test a la lista declarada) y la revisión del diff de snapshots de la tanda 3 |
| R5 | `pnpm run typecheck` sin tocar los barrels de «Lo que NO entra» |
| R6, R7, R8, R9, R10 | `tests/unit/shared-ui/form-sheet.test.tsx`, un caso por R, más `formularios-paridad` |
| R11 | `tests/unit/shared-ui/use-entity-sheet.test.tsx` (orden cerrar, toast y refresh) |
| R12, R13, R14, R15 | `tests/unit/shared-ui/confirm-dialog.test.tsx` más `confirmaciones-paridad` |
| R16, R17, R18, R19 | `tests/unit/shared-ui/campos.test.tsx` más `campos-paridad` |
| R20, R21, R22, R23 | `tests/unit/paridad/acciones-por-fila.test.tsx` sin regenerar, `tests/unit/shared-ui/row-actions-menu-href.test.tsx` y los E2E de R25 |
| R24 | `tests/unit/shared-ui/actions-column.test.tsx` más las paridades de QC-231 regeneradas solo en la celda |
| R25 | Los E2E y unit de la lista, en verde con el helper |
| R26 | `guard-piezas-base` con las excepciones retiradas |
| R27 | `asignacion-paridad.test.tsx` (QC-231) sin regenerar |
| R28 | `tests/guards/guard-formularios-y-acciones.test.ts` |
| R29 | Revisión de `progress/deudas.md` |
| R30, R31 | El caso de diff de `guard-formularios-y-acciones`, solo en esta rama y con `skip` ruidoso fuera, y `guard-dependencias-aprobadas` |
| R32 | Salida de `node scripts/archivos-en-vuelo.mjs --candidata QC-232`, anotada en `progress/features/QC-232.md` al aprobar y al pedir el merge |
