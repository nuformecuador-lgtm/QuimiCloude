# QC-231 — componentizacion-piezas-base · design

## Lo que ya existe

**Términos buscados:** `componentiz`, `TOUCH_TARGET`, `ErrorAlert`, `EmptyState`, `ErrorState`,
`TableSkeleton`, `Spinner`, `formatCivilDate`, `EMPTY_MARK`, `SubmitButton`, `EntityImage`,
`createUrlPageFetcher`. Busqué en el board (`feature_list.json`), en `specs/` y en el código.

**Grafo:** este worktree no está indexado. Consulté el del árbol principal (`dev`, la misma base) y
verifiqué con Grep sobre el worktree.

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| QC-232 y QC-233 | board | Se reparten el resto de la auditoría (D1). Nada de esta ficha se solapa con ellas, salvo lo excluido por D7 |
| `UnexpectedErrorNotice` (QC-71) | `components/shared/unexpected-error-notice.tsx` | **Se reutiliza tal cual** dentro de `ErrorAlert`. No se edita |
| Estados de la tabla compartida (QC-55) | `components/shared/data-table/data-table-states.tsx:33-139` | **Se conservan** como comportamiento por defecto (R19). Los estados nuevos se activan con una prop opcional |
| «Sin resultados» dentro de la tabla (QC-56 D15) | `data-table.tsx:240-262` | No cambia (D5) |
| QC-56 D12 y R30: estados fuera de la tabla y cada lista con los suyos | `specs/QC-56-…/requirements.md:190-192, 269` | **Se enmienda** (D4), ver §14 |
| `EntityImage` (QC-140 y QC-52) | `components/shared/entity-image.tsx` | **Se amplía** con `size`. Absorbe `OrderRecipeImage` |
| `formatDateLocalISO` / `parseDateLocalISO` | `lib/shared/ui/date-civil.ts` | **No sirven para las celdas**: son en hora local y las celdas usan UTC a propósito para evitar desajustes de hidratación (`customer-columns.tsx:50-51`). `formatCivilDate` es una función nueva en el mismo archivo |
| `lib/shared/ui/` | `theme-state.ts`, `decimal-display.ts`, `date-civil.ts`… | Es donde viven `touchTarget` y `EMPTY_MARK` |
| `Skeleton`, `Table`, `Button` | `components/ui/` (Base UI, estilo `base-nova`) | Los usan las piezas nuevas. `button.tsx` ya lleva una variante propia (`outline-dashed`) |
| 44 px del login (QC-30) | `app/globals.css:307-308` | No se toca. Por eso la talla táctil del `SubmitButton` no cambia nada en el login (D10) |
| `credential-field` / `credential-requirements` (QC-21) | `components/shared/` | **Fuera** (D3) |
| shadcn `Spinner`, `Empty`, `Alert` | no están en `components/ui/` | Ver alternativa A5 (§17) |

**Choque con otras features (D11).** Hay 14 archivos en vuelo en QC-217 y QC-223, que son de otra
persona. Esta rama no los toca, y la lista exacta está en `requirements.md > Archivos D11`. Tiene
tres consecuencias:

- **Las piezas se crean igual.** Ninguna de ellas necesita tocar un archivo D11.
- **Donde un barrel D11 exporta un componente que habría que borrar, el componente se queda.** Pasa
  a delegar en la pieza compartida y conserva su firma. Son cinco:
  - `order-list-empty`, `order-list-error` y `order-list-skeleton`;
  - `OrderRecipeImage`;
  - `AssignedOrdersError`.

  Los borra QC-232.
- **La guardia de anclas de pedidos de QC-102 no se enmienda,** porque el barrel de pedidos no
  cambia.

## 1. Principio

Es una refactorización **de cero cambio** (D2). Cada pieza compartida reproduce **el marcado exacto**
de las copias que sustituye. Las diferencias entre copias entran por props y no se resuelven aquí:
unificarlas es trabajo de QC-227 (D6).

El «antes» se congela **antes** de tocar producción (tanda 0, §12). Ningún snapshot de paridad se
regenera después.

No hay modelo de datos, migraciones, RLS, rutas, Server Actions ni integraciones nuevas. **Ninguna
dependencia nueva** (R30).

## 2. Talla táctil (R5-R8)

`lib/shared/ui/touch-target.ts`:

```ts
export const touchTarget = 'min-h-11 min-w-11';
```

`components/ui/button.tsx`: un eje de variante **independiente** de `size`.

```ts
const buttonVariants = cva(base, {
  variants: {
    variant: { … },
    size: { … },
    touch: { true: touchTarget, false: '' },
  },
  defaultVariants: { variant: 'default', size: 'default', touch: false },
});
// Button({ touch, … }) → buttonVariants({ variant, size, touch, className })
```

- **Sin `touch`** las clases no cambian (R5), y `touch: false` es el defecto.
- **En enlaces:** `cn(buttonVariants({ variant: 'outline', touch: true }), …)`.
- **En los controles que no son `Button`:** `className={cn(touchTarget, …)}`, o una plantilla
  `${touchTarget} …`.

**Riesgo de `tailwind-merge`.** Las clases del eje `touch` salen **antes** que las de `className`.

- Si un sitio ponía el par **después** de una clase que entra en conflicto (`min-w-0`, `size-11`,
  `h-auto`…), pasarlo a `touch` cambiaría quién gana.
- En esos sitios se usa `touchTarget` en `className`, **en la misma posición** que tenía la
  constante local.
- La paridad de clases (R1) lo detecta.

**Constantes compuestas.** Valores como `'min-h-11 min-w-11 text-base'` o
`'h-auto min-h-11 min-w-11 px-4 text-base'` se reescriben como `` `${touchTarget} text-base` ``, en
el mismo orden relativo.

**Qué no se toca:**
- las constantes de valor distinto al par: `'min-h-11'` sola, `ITEM_TOUCH_TARGET`,
  `PRIMARY_TOUCH_TARGET_EJECUCION`, `OPTION_TOUCH_CLASSES`;
- los `min-h-11` sueltos de altura.

Ninguno de los dos es el par.

**Tests de contrato (R8).** Los helpers `constantesConLaClase` / `llevaLaClase` de los tres tests
pasan a aceptar, como «lleva la talla», cualquiera de estas formas:
- el atributo JSX `touch` en `<Button>`;
- `touch: true` en una llamada a `buttonVariants(…)`;
- el identificador `touchTarget` dentro del `className`.

Se conserva la muestra «muerde» de cada test, la que comprueba que un control sin talla falla, y se
añade otra para las formas nuevas. Los tres archivos son:
- `tests/unit/inventario/product-route-contract.test.ts:244-260, 890-921`;
- `tests/unit/recetas-ui/recipe-route-contract.test.ts:271-280, 1118-1144`;
- `tests/unit/inventario/importar/importar-route-contract.test.ts:253-268, 370-400`.

## 3. `ErrorAlert` (R9-R12)

Archivo: `components/shared/error-alert.tsx`, `'use client'` no hace falta.

```ts
import type { ErrorState as OperationError } from '@/lib/modules/errores';

type ErrorAlertProps = {
  readonly error: OperationError;
  readonly testId?: string;
  readonly id?: string;
  readonly className?: string;          // clases del contenedor, tal cual las tenía cada sitio
  readonly role?: 'alert' | null;       // defecto 'alert'; null = sin rol (p. ej. order-cost-quote)
  readonly withDataCode?: boolean;      // pinta data-code={error.code}
  readonly renderCatalogued?: (error: OperationError) => ReactNode;  // defecto: <p>{message}</p>
  readonly before?: ReactNode;          // título que va dentro del contenedor, antes de la rama
  readonly after?: ReactNode;           // p. ej. «Reintentar»
  readonly as?: 'div' | 'p';            // solo si algún sitio lo necesita; si no, se omite
};
```

**Qué pinta.** El contenedor, con las props que se le pasen. Dentro van `before`, la rama y `after`:
- si `error.code === UNEXPECTED_ERROR_CODE`, la rama es `<UnexpectedErrorNotice state={error} />`;
- si no, `renderCatalogued(error)`.

`UnexpectedErrorNotice` no lleva rol (`unexpected-error-notice.tsx:28-29`): el rol lo pone el
contenedor, como hoy.

**Sitios** (los 57 archivos de `<UnexpectedErrorNotice`, inventario en `tasks.md`). Cada sitio
pasa su testid, su clase, su `role` y su rama de catálogo actuales. Unos ejemplos de lo que
cambia de un sitio a otro:

| Sitio | `className` | Rama catalogada |
|---|---|---|
| `product-form.tsx:612-622` | `rounded-lg border border-destructive/40 p-3 text-sm text-destructive` | `<p data-testid="product-form-error-message">` |
| `work-group-form.tsx:406-417` | `flex flex-col gap-2 … p-3 …` | con `data-code` |
| `order-cost-quote.tsx:69-74` | `text-destructive` | **sin** `role`, y `<span>` con prefijo |

**Excepción (R12).** Un sitio que use la comparación para algo que **no** es pintar, como lógica o
telemetría, la conserva y la anota.

## 4. `EmptyState`, `ErrorState`, `TableSkeleton` (R13-R15)

Los tres archivos son nuevos, en `components/shared/`.

```ts
// empty-state.tsx (servidor o cliente: sin hooks)
type EmptyStateProps = {
  readonly testId: string;
  readonly message: ReactNode;
  readonly firstPage?: { readonly href: string; readonly label: string; readonly testId: string };
  readonly className?: string;   // defecto: 'flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center'
  readonly children?: ReactNode; // acciones: «Crear…», «Limpiar búsqueda»…
};

// error-state.tsx ('use client': router.refresh)
type ErrorStateProps = {
  readonly error: OperationError;
  readonly title: string;                       // «No se pudo cargar el catálogo.»
  readonly testId: string;                      // product-list-error
  readonly messageTestId?: string;              // product-list-error-message
  readonly codeTestId?: string;                 // product-list-error-code
  readonly retry: { readonly kind: 'refresh' } | { readonly kind: 'href'; readonly href: string };
  readonly retryTestId: string;                 // product-list-retry
  readonly retryLabel?: string;                 // defecto 'Reintentar'
  readonly className?: string;                  // defecto: 'flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4'
};
// Por dentro: <ErrorAlert role="alert" before={<p className="text-sm font-medium">{title}</p>}
//   renderCatalogued={mensaje + código con sus testids} after={<Button variant="outline" touch …>} />

// table-skeleton.tsx (servidor o cliente: sin hooks)
type TableSkeletonProps = {
  readonly columns: number;
  readonly rows: number;
  readonly label: string;                       // texto sr-only: «Cargando productos…»
  readonly testId: string;                      // product-table-skeleton
  readonly rowTestId: string;                   // product-row-skeleton
  readonly withImage?: boolean;                 // primera celda con el hueco de la miniatura
  readonly headCellClassName?: string;          // defecto 'h-4 w-24' (unidades usa 'h-4 w-full')
  readonly cellClassName?: string;              // defecto 'h-4 w-full'
};
```

**Marcado de `TableSkeleton`.** Es el de `product-table-skeleton.tsx:33-58`: un `div` con
`role="status"`, `aria-busy="true"` y `data-testid`, un `span.sr-only`, la `Table` con cabecera de
`TableHead scope="col"` y las filas.

**Variantes.** Las tres variantes con imagen y las de cabecera `w-full` salen del inventario de
esqueletos (T3). Si alguna copia tiene una diferencia que estas props no cubren, se añade **una**
prop por diferencia y se anota. No se iguala.

**Nombre de `ErrorState`.** Coincide con el tipo `ErrorState` de `lib/modules/errores`. Dentro del
componente y en los consumidores que necesitan ambos, el tipo se importa con alias
(`type ErrorState as OperationError`).

**Testids.**
- Los `data-testid` locales pasan como props **con el mismo valor**.
- Las constantes `*_TESTID` exportadas por los archivos que se borran se trasladan al
  `*-table.tsx` o al `*-labels.ts` de la ruta, con el mismo nombre, y el barrel las sigue
  exportando. Ejemplo: `UNIT_LIST_SKELETON_TESTID` y `UNIT_ROW_SKELETON_TESTID`.
- Las constantes `*_SKELETON_COLUMN_COUNT` siguen en sus archivos (`*-columns-skeleton.ts`) o se
  trasladan de la misma manera.

## 5. La `DataTable` pinta sus estados (R16-R19, D4, D5)

### 5.1 Contrato

En `data-table-types.ts`, aditivo y opcional:

```ts
export type DataTableStates = {
  readonly loading?: TableSkeletonProps;
  readonly error?: Omit<ErrorStateProps, 'error'> & { readonly error: OperationError };
  readonly empty?: EmptyStateProps;   // la pantalla lo pasa SOLO si no hay búsqueda ni filtro activos
};
// DataTableProps<TRow> gana:  readonly states?: DataTableStates;
```

El barrel exporta además `type DataTableStates`. Es aditivo, y la guardia de anclas de QC-55 solo
prohíbe quitar.

### 5.2 Resolución en `data-table.tsx`

Todos los hooks se llaman antes del primer `return`.

```text
visible = resolveDataTableState(status, rows.length)        // sin cambios
si visible === 'loading' y states.loading → return <TableSkeleton {...states.loading} />
si visible === 'error'   y states.error   → return <ErrorState {...states.error} />
si visible === 'empty'   y states.empty   → return <EmptyState {...states.empty} />
en otro caso → lo de hoy (barras + DataTableLoading/DataTableError/DataTableEmpty/filas)
```

- El `return` temprano **no** pinta el `div[data-testid="data-table"]`, ni las barras, ni la
  paginación. Así el DOM es el de la pieza local que sustituye, que hoy se pinta fuera de la tabla
  (R16, R17 y R18, primera mitad).
- Sin `states`, la tabla es idéntica a la de hoy, y los tests de QC-55
  (`data-table.test.tsx`, `data-table-states.test.tsx`) no se tocan (R19).
- «Sin resultados» (D5): la pantalla **no** pasa `states.empty` cuando hay búsqueda o filtro. La
  tabla cae entonces en `DataTableEmpty`, con sus barras, como hoy.

### 5.3 Cómo lo usa cada lista

Patrón, con inventario como ejemplo.

- **El componente de tabla de la ruta** (`ProductTable`, de cliente) gana `status`, el `error`
  opcional y el hueco del vacío (`emptySlot` / `firstPageHref`). Construye `states` con sus textos y
  testids. En un estado que no sea `rows` devuelve **solo** `<DataTable … />`: nada de su `div`
  envoltorio, de `ProductTypeTabs` ni del rótulo de «en vuelo». Así no aparece ningún envoltorio
  que antes no existía.
- **La sección** (Server Component) deja de bifurcar a componentes locales y pinta siempre el
  componente de tabla de la ruta:
  - con `status="error"` y el `error` cuando la consulta falla;
  - con cero filas y el vacío cuando está vacía y no hay búsqueda.

  El envoltorio `div[data-testid="product-list"]` solo se pinta con filas, como hoy.
- **El `fallback` del `<Suspense>`** de la página pasa a ser
  `<ProductTable status="loading" products={[]} params={params} totalPages={0} />`.
  - Las props son serializables, y las columnas se construyen dentro, en el cliente.
  - Las filas del esqueleto salen de `params.pageSize` (R16).
  - Se conserva la `key` del `<Suspense>` en las páginas que la tienen.
- **Hueco del vacío.** Las acciones del vacío llegan desde la sección como `ReactNode`, por ejemplo
  `<ProductSheet …/>`. Pasar elementos de servidor como props a un componente de cliente es válido
  en RSC.
- **Excepción (D4, R21).** Si en una lista el componente de tabla no puede reproducir el DOM, la
  sección pinta `EmptyState`, `ErrorState` o `TableSkeleton` directamente y se anota en
  `progress/impl_QC-231-…md`. Puede pasar, por ejemplo, porque el error se produce antes de tener lo
  necesario para montar la tabla.

### 5.4 Listas con `DataTable` que migran

| Ruta | Locales que se borran | Pieza que entra |
|---|---|---|
| `inventario` (productos y producto terminado) | `product-list-empty`, `product-list-error`, `product-table-skeleton` | `states` en `ProductTable` / `FinishedStockTable` |
| `produccion/formulas` | `recipe-list-empty`, `recipe-list-error`, `recipe-table-skeleton` | `states` en `RecipeTable`. Las 4 páginas de formulario usan `ErrorState` (R20) |
| `pedidos` | **Ninguno (D11).** `order-table.tsx`, `order-list-section.tsx` y el barrel son archivos D11 | `order-list-empty`, `order-list-error` y `order-list-skeleton` se quedan, con la misma firma, y delegan en `EmptyState`, `ErrorState` y `TableSkeleton`. Adoptar `states` y borrarlos es de QC-232 |
| `clientes` | `customer-list-empty`, `customer-list-error`, `customer-list-skeleton` | `states` en `CustomerTable`, con reintento `href` (`retryHref`) |
| `proveedores/[id]` | `catalog-list-empty`, `catalog-list-error`, `catalog-table-skeleton` | `states` en `CatalogTable`. Los errores previos de página (`page.tsx:97, 109`) usan `ErrorState` |
| `configuracion/unidades` | `unit-list-empty`, `unit-list-error`, `unit-list-skeleton` | `states` en `UnitTable` |
| `configuracion/presentaciones` | `presentation-list-empty`, `presentation-list-error`, `presentation-list-skeleton` | `states` en `PresentationTable`. El error previo (`page.tsx:90`) usa `ErrorState` |
| `configuracion/usuarios` (usuarios y grupos) | `user-list-*`, `work-group-list-*` (vacío, error y esqueleto) | `states` en `UserTable` / `WorkGroupTable` |
| `dashboard` (recorridos) | `ExecutionTraceListError`, interno de `execution-trace-list-section.tsx` | `states.error` en `ExecutionTraceTable` |

### 5.5 Sin `DataTable` (R20)

| Sitio | Qué entra |
|---|---|
| Vitrina de proveedores (`supplier-list-empty`, `supplier-list-error`) | `EmptyState` / `ErrorState` directos. **`SupplierShowcaseSkeleton` se queda**: es distinto |
| `RecipeListError` en `formulas/[id]`, `nueva`, `versiones/nueva`, `versiones/[versionId]` | `ErrorState`, con los mismos testids `recipe-list-error*`, que vigila `e2e/errores.spec.ts:221-225` |
| `AssignedOrdersError` | **Se conserva** (D11), porque lo exporta `asignacion/components/index.ts`. Su cuerpo pasa a ser `<ErrorState …/>` con los testids `assigned-orders-error*` y `assigned-orders-retry`. Las 6 secciones **no se tocan**. Sustituirlo en las secciones y borrarlo es de QC-232. Los vacíos y esqueletos de asignación tampoco se tocan (D7) |

## 6. `Spinner` (R22)

`components/shared/spinner.tsx`:

```ts
type SpinnerProps = { readonly size?: 'sm' | 'inherit'; readonly className?: string };
// <Loader2Icon aria-hidden className={cn(size === 'inherit' ? undefined : 'size-4', 'animate-spin', className)} />
```

- `LoaderCircleIcon` y `Loader2Icon` son **el mismo icono**: lucide exporta
  `LoaderCircle as Loader2Icon` (`node_modules/lucide-react/dist/lucide-react.d.ts:26465`).
- `size="inherit"` es para `import-preview-summary.tsx:112`, que hoy no lleva `size-4` y toma el
  tamaño del `Button`. Así el conjunto de clases no cambia (R1).
- **Sitios (9):**
  - `presentation-select.tsx:577`;
  - `async-autocomplete.tsx:206`;
  - `inventory-import-screen.tsx:200`;
  - `import-preview-summary.tsx:112`;
  - `order-ingredients-table.tsx:290`;
  - `packaging-select.tsx:285`;
  - `recipe-picker.tsx:349`;
  - `product-name-picker.tsx:281`;
  - `product-picker.tsx:331`.

## 7. Fecha civil, `DateCell` y `EMPTY_MARK` (R23-R25)

**`formatCivilDate`.** Va en `lib/shared/ui/date-civil.ts`, junto a las dos funciones locales, con
un comentario corto que diga cuál usar en cada caso:

```ts
export function formatCivilDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}
```

Es **UTC**, como las 7 copias: servidor y navegador tienen husos distintos
(`customer-columns.tsx:50-51`).

**Sitios de `formatCivilDate` (6).** `order-columns.tsx:124` es un archivo D11 y lo adopta
QC-232.
- `customer-columns.tsx:52`;
- `catalog-columns.tsx:108`;
- `recipe-columns.tsx:39`;
- `user-labels.ts:110`;
- `finished-orders-columns.tsx:37`;
- `company-orders-columns.tsx:69`.

Quedan fuera `execution-trace-list-params.ts:65`, que valida y no formatea, y todo `lib/modules/**`.

**`DateCell`.** Va en `components/shared/date-cell.tsx`:

```tsx
export function DateCell({ value }: { readonly value: Date | null }) {
  return <>{value === null ? EMPTY_MARK : formatCivilDate(value)}</>;
}
```

Es un fragmento, así que no añade ningún elemento (R24). Las celdas que hoy envuelven la fecha en un
`<span data-testid>` conservan su `span` y llaman a `formatCivilDate`.

**`EMPTY_MARK`.** Va en `lib/shared/ui/empty-mark.ts` (`export const EMPTY_MARK = '—'`). Sustituye a
15 de las 18 constantes que hoy valen `—`:
- `MISSING_VALUE_MARK`, en 7 archivos;
- `EMPTY_CELL`, en 4;
- `MISSING_NAME_MARK`, en 1;
- `MISSING_RESPONSIBLES_MARK`, `MISSING_PERSON_MARK` y `NO_EQUIVALENCE_LABEL`, en 1 cada una.

Todas usan el mismo carácter U+2014, verificado con Grep. Las de `e2e/` no se tocan.

Tres están en archivos D11 y las adopta QC-232: `order-columns.tsx:101`,
`conditioning-orders-columns.tsx:17` y `order-distribution-full.tsx:25`. Mientras tanto,
`MISSING_VALUE_MARK` de `order-columns.tsx` sigue exportada, y los tests que la importan de ahí no
cambian.

## 8. `SubmitButton` (R26, R27)

`components/shared/submit-button.tsx`, `'use client'`:

```ts
type SubmitButtonProps = {
  readonly label: string;
  readonly pendingLabel: string;
  readonly testId: string;
  readonly className?: string;   // el login pasa 'w-full'
};
// const { pending } = useFormStatus();
// <Button type="submit" touch className={className} disabled={pending} aria-busy={pending} data-testid={testId}>
```

**El login.** Pasa a `<SubmitButton label="Entrar" pendingLabel="Entrando…" testId="login-submit" className="w-full" />`
y se borra `app/(public)/login/components/submit-button.tsx`. Hay que mirar dos cosas:

- **Medida.** El botón ya mide 44 px por `[data-login='screen'] [data-slot='button']`
  (`globals.css:307-308`). `min-h-11` no cambia la medida, y `min-w-11` no se nota en un botón
  `w-full`.
- **Clases.** El conjunto de clases sí gana `min-h-11 min-w-11`. Es la primera parte de la
  **única** excepción de clases de la feature (R1). Lo pide el issue: un `SubmitButton` único con
  talla táctil (D10). Se apunta como excepción declarada en el snapshot de paridad del login, y la
  captura demuestra que no se ve.

**`establecer-contrasena` (D12).** Solo cambia
`app/(public)/establecer-contrasena/[token]/components/submit-button.tsx`, y conserva su nombre, sus
props (`label`, `pendingLabel`) y su export:

```tsx
export function SubmitButton({ label, pendingLabel }: SubmitButtonProps) {
  return <SharedSubmitButton label={label} pendingLabel={pendingLabel} testId="set-credential-submit" className="w-full" />;
}
```

D12 autorizaba tocar también el import, pero no hace falta: `set-credential-form.tsx`, el barrel de
la ruta y `tests/unit/identity/credencial/scope.test.ts:137`, que cita la ruta del archivo, se quedan
como están.

- **Clases.** Hoy el botón lleva `min-h-11 w-full`. Con la talla táctil gana `min-w-11`, que no se
  ve en un botón `w-full`. Es la segunda parte de la excepción declarada de R1.
- **Test que lo cubre.** `tests/unit/identity-ui/set-credential-form.test.tsx` no se toca y sigue
  localizando `set-credential-submit`.

**Riesgo con QC-96.** QC-96 (recuperar contraseña) es de otra persona, tiene la rama **sin
publicar** y reutiliza esta página, así que puede tocar este archivo. `archivos-en-vuelo` no lo ve.
Antes de editar el archivo, el implementer le pide al leader que confirme el estado de QC-96 y su
diff, o que pregunte a su dueño. Si hay choque, el cambio de establecer contraseña pasa a QC-232 y se
anota.

## 9. `EntityImage` con `size` (R28, R29)

```ts
type EntityImageProps = {
  readonly path: string | null;
  readonly name: string;
  readonly testId?: string;
  readonly size?: 'thumbnail' | 'fill';   // defecto 'thumbnail' = lo de hoy
  readonly emptyAlt?: string;             // alt cuando name === '' (fill: 'Sin receta elegida')
};
```

- **`fill`** pinta exactamente lo de `order-recipe-image.tsx:53-70`:
  - el envoltorio `div` con `flex w-full items-center justify-center overflow-hidden rounded-xl border bg-muted aspect-square`;
  - el `img` con `key={path ?? ''}` y `className="h-full w-full object-contain"`, sin `width`,
    `height` ni `style`.
- **`thumbnail`** no cambia.
- **`OrderRecipeImage` se conserva (D11).** El barrel de pedidos, que es un archivo D11, lo exporta.
  Su cuerpo pasa a ser
  `<EntityImage size="fill" path={imageUrl} name={name} testId={ORDER_RECIPE_IMAGE_TESTID} emptyAlt="Sin receta elegida" />`,
  con la misma firma y los mismos exports.
- `order-form.tsx` no cambia por esto.
- Borrar el componente es de QC-232, que también enmendará entonces la guardia de anclas de QC-102.

## 10. Limpieza (R31)

- **`createUrlPageFetcher`** (`hooks/use-async-paginated-options.ts:283`): se borra. No tiene
  consumidores ni tests.
- **`export { formatDateLocalISO }`** en `data-table-filter-date.tsx:16` y
  `product-batch-date-field.tsx:36`: se borran. Se repuntan a `@/lib/shared/ui/date-civil`:
  - `product-form.tsx:38`;
  - `data-table-viewport.test.tsx:10`;
  - `data-table-filter-date.test.tsx:10`;
  - `product-page.test.tsx:9`.
- **`MISSING_VALUE_MARK` y `EMPTY_CELL`:** desaparecen (§7), salvo en `order-columns.tsx`, que es un
  archivo D11. Los tests que los importaban de los archivos migrados pasan a importar `EMPTY_MARK`.
- **`IMAGE_COLUMN_LABEL` y `ACTIONS_COLUMN_LABEL`:** se quitan del barrel
  `inventario/components/index.ts:31, 34`. Siguen exportadas desde `product-columns.tsx` porque las
  usa `finished-stock-columns.tsx`. La reexportación de `recipe-columns.tsx:18-19` sigue si algo
  la importa; si no, se quita el `export`.
- **`UserStatusBadge` y `WorkGroupRowActions`:** **fuera** (D13). Se rehacen en QC-227 y QC-232.

## 11. Multiplataforma

No hay cambios de estilo. La talla táctil se conserva en cada control y la paridad de clases (R1) lo
demuestra. El `SubmitButton` del login la gana, ya cubierta por CSS. No hay `100vh`, ni `:hover`, ni
librerías nuevas.

## 12. Cómo se demuestra el «cero cambio» (R1-R4, D9)

1. **Paridad del árbol accesible.** Va en `tests/unit/paridad/`, en la **tanda 0** y antes de tocar
   producción.
   - Un helper, `tests/unit/paridad/arbol-accesible.ts`, serializa el DOM renderizado. Por elemento
     guarda el rol (explícito o implícito), el nombre accesible, los `aria-*`, el `data-testid` y el
     conjunto **ordenado** de clases. Descarta los ids generados por `useId`.
   - Hay un test por lista de §5.4 y §5.5. Cada uno renderiza filas, cargando, vacío, sin resultados
     y error (este último con un error de catálogo y con el inesperado) y guarda `toMatchSnapshot()`.
     Usa los mismos mocks que los tests de sección que ya existen.
   - Además: el login (inactivo y enviando), el formulario de pedido (con y sin imagen) y una
     muestra de `ErrorAlert` por forma de §3.
   - Los snapshots se commitean en T0 y **no se regeneran**. El reviewer comprueba con
     `git log --follow` que no cambian después del commit de T0.
   - **Única excepción declarada:** las clases de la talla táctil de los dos `SubmitButton`
     públicos, el del login y el de establecer contraseña (§8). Se aplica como un cambio a mano del
     snapshot, en su propio commit, citando D10 y D12.
   - **Pantallas con archivos D11.** Las paridades de pedidos y de asignación renderizan esos
     archivos **sin modificarlos**. Su snapshot vale igual, porque los locales que se conservan
     delegan en las piezas compartidas y tienen que dar el mismo árbol. Ningún test depende de editar
     un archivo D11.
2. **Tests existentes.** Pasan sin cambiar lo que afirman (R4). La lista de los que se tocan, y por
   qué, está en §13.
3. **E2E en CI.** Corren los specs de `e2e/` que visitan las pantallas tocadas y **no se editan**,
   porque los testids se conservan. Los nombrados en specs anteriores son `errores.spec.ts`,
   `recetas-pasos.spec.ts`, `login-skin.spec.ts`, `pedido-bloqueado.spec.ts` y los de cada pantalla.
4. **Capturas** (R3).
   - Se hacen las mismas pantallas y estados que `_trabajo/marca/capturas-antes/`, con el seed demo
     de QC-230, en `_trabajo/marca/capturas-despues/`. Esa carpeta no se versiona.
   - El reviewer compara las parejas y lo deja escrito en `progress/review_QC-231-….md`.
   - Depende de QC-230, que es `depends_on` (D14) y se mergea antes del cierre.

## 13. Tests que se tocan

| Test | Por qué | Tipo |
|---|---|---|
| `tests/unit/inventario/product-route-contract.test.ts`, `tests/unit/recetas-ui/recipe-route-contract.test.ts`, `tests/unit/inventario/importar/importar-route-contract.test.ts` | Aceptan `touch` y `touchTarget` | Enmienda (R8) |
| `tests/unit/shared/migracion-listas-alcance.test.ts:228` | R30 de QC-56 enmendado: la lista ya no conserva sus estados | Enmienda (R32) |
| Los que importan vacíos, errores o esqueletos locales que se borran: `customer-list-{empty,error,skeleton,section}`, `work-group-list-{empty,error,skeleton}`, `user-list-{empty,section}`, `unit-page`, `unit-columns`, `presentation-page`, `presentation-columns`, `work-group-columns`, `product-page`, `recipe-page`, `recipe-version-pages`, `recipe-form`, `supplier-detail-page`, `supplier-showcase-page`, `supplier-route-contract`, `unidades-convenciones` y `usuarios-convenciones` | Cambia el import o se renderiza por la sección o la tabla. Mismas aserciones y testids | Repunte (R4) |
| `assigned-orders-columns`, `customer-columns`, `catalog-columns`, `finished-stock-table`, `responsible-avatars` y, **solo si** importan la marca de un archivo migrado, `order-form-quote` y `use-order-cost-quote` | `MISSING_VALUE_MARK` / `EMPTY_CELL` pasan a `EMPTY_MARK` | Repunte (R4) |
| `data-table-viewport`, `data-table-filter-date`, `product-page` | `formatDateLocalISO` desde `lib/shared/ui/date-civil` | Repunte (R4) |
| **No se tocan (D11):** `order-list-skeleton`, `order-list-section`, `order-table`, `order-columns`, `assigned-orders-states`, `asignaciones-ui/a11y-tactil`, las `*-orders-list-section` de asignación y `guard-pantalla-pedidos-se-amplia` | Los locales de pedidos y `AssignedOrdersError` conservan su firma y sus testids, así que estos tests siguen en verde sin cambios | — |
| `tests/unit/identity-ui/set-credential-form.test.tsx` y `tests/unit/identity/credencial/scope.test.ts` | **No se tocan** (D3, D12) | — |

Los tests de convenciones por ruta que enumeran archivos (`*-convenciones.test.ts`,
`*-route-contract.test.ts`) se ajustan **solo** para quitar de sus listas los archivos borrados.

**Enmienda del 2026-10-08 (decisión del humano, `progress/features/QC-231.md > Decisiones`).** Hay
dos tests de alcance basados en diff: `tests/unit/configuracion-ui/grupos/alcance.test.ts` (QC-85) y
`tests/unit/shared/data-table-alcance.test.ts` (QC-56). Ambos creían estar en la rama de su feature
porque el diff de QC-231 traía archivos compartidos. Se endurecen sus anclas: cada uno se activa
solo en la rama de su feature, y el diff usa `--diff-filter=d`. Ningún caso se debilita.

## 14. Enmiendas a specs cerrados

| Spec | Qué | Dónde se anota |
|---|---|---|
| QC-56 | D12 y R30 quedan **sin efecto** para el vacío, el error y el esqueleto: los pinta la `DataTable` (QC-231 D4). D15 sigue igual | Una línea fechada (2026-10-08) en `specs/QC-56-migrar-listas-a-tabla-compartida/requirements.md`, bajo D12 y R30 |
| QC-102 R41 (guardia de anclas de pedidos) | **Sin enmienda en QC-231** (D11): el barrel de pedidos no cambia. La enmienda pasa a QC-232 | — |
| QC-55 | **Sin enmienda.** Su contrato no cambia; `states` es aditivo | — |
| QC-21, QC-79 y QC-30 | **Sin enmienda** (D3 y D10) | — |

## 15. Rutas, endpoints, datos

Ninguno nuevo. No cambia ningún Server Action ni ningún caso de uso.

## 16. Riesgos

- **Volumen.** Son unos 200 archivos. Se mitiga con la paridad congelada en T0 y con commits por
  ruta.
- **Rama larga frente a otras ramas.** Bloquea a QC-232 y QC-233, así que no deberían correr en
  paralelo. El leader lo valida con `archivos-en-vuelo`.
- **`tailwind-merge`.** Ver §2.
- **QC-96 con la rama sin publicar.** Puede tocar `app/(public)/establecer-contrasena/**`.
  `archivos-en-vuelo` no lo ve, porque solo lee ramas publicadas. Antes de tocar
  `establecer-contrasena/[token]/components/submit-button.tsx` (T9l), el implementer pide al leader
  que compruebe el choque, y si lo hay ese cambio pasa a QC-232 (§8).
- **Choque con QC-217 y QC-223 (D11).** Los 14 archivos D11 no se tocan, y la guardia
  `guard-piezas-base` lo comprueba por diff (R33). Si QC-217 o QC-223 se mergean antes del cierre,
  el leader sincroniza con `dev` y la paridad de pedidos y de asignación se vuelve a comprobar
  **sin** regenerar los snapshots. Si sus cambios alteran esas pantallas, se regenera solo la
  paridad de esas pantallas, sobre el `dev` nuevo y antes de la tanda 3, y se anota.

## 17. Alternativas descartadas

**A1. Las secciones pintan las piezas compartidas directamente, sin pasar por la `DataTable`.**
- **A favor:** daría cero cambio de DOM casi gratis.
- **Por qué no:** contradice D4, que decidió que la tabla pinta sus estados.
- **Qué queda:** solo como **excepción por lista**, anotada (R21).

**A2. Sustituir los estados por defecto de la `DataTable` (`DataTableLoading`/`Error`/`Empty`) por
las piezas nuevas.**
- **Por qué no:** cambiaría el contrato de QC-55 (R19-R22), con sus tests y su estado de carga de 5
  filas, sin que ninguna pantalla lo necesite. La prop `states` opcional consigue lo mismo sin
  enmendar QC-55.

**A3. Talla táctil como un valor más de `size` (`size="touch"`).**
- **Por qué no:** no se combina con `size="icon"` ni con `sm`, que hoy llevan la talla encima.
  Cambiaría las clases efectivas, porque el `h-8` de `default` desaparecería. Un eje `touch`
  independiente reproduce exactamente `buttonVariants(...) + 'min-h-11 min-w-11'`.

**A4. `formatCivilDate` sobre `formatDateLocalISO`, en hora local.**
- **Por qué no:** cerca de medianoche cambiaría el día que se muestra frente al `toISOString()`
  actual (UTC), y reintroduciría el desajuste de hidratación servidor/navegador que las copias
  evitan.

**A5. Los componentes de shadcn `Spinner`, `Empty` y `Alert`** (regla 1 de `frontend_dev`: si shadcn
lo tiene, se usa).
- **Por qué no:** no están en `components/ui/`, y no he podido verificar sin red si el registro
  `base-nova` los trae. Aunque los trajera, su marcado es otro. Por ejemplo, el `Spinner` de shadcn
  lleva `role="status"` y una etiqueta en inglés, donde aquí el icono es decorativo
  (`aria-hidden`). Eso rompería R1.
- **Qué queda:** queda anotado para QC-227, que sí puede cambiar el marcado.

**A6. Borrar `UserStatusBadge` y `WorkGroupRowActions` ya.**
- **Por qué no:** obliga a reescribir 4 tests que los renderizan sueltos, para que QC-227 y QC-232
  los vuelvan a rehacer (D13).

**A7. Ante el choque de D11, coordinar con QC-217 y QC-223 y tocar igual sus archivos.**
- **Por qué no:** la regla 1 de `CLAUDE.md` prohíbe tomar una feature que choca en archivos con otra
  en vuelo.
- **Qué se hace en su lugar:** los locales que exportan esos barrels se quedan con su firma y delegan
  en las piezas, y QC-232 completa la adopción.

## 18. Mapa R → test previsto

| R | Test |
|---|---|
| R1, R2, R16-R18 | `tests/unit/paridad/*-paridad.test.tsx`, uno por lista, más `login-paridad` y `order-form-image-paridad` |
| R3 | Revisión: `progress/review_QC-231-….md > Capturas` |
| R4 | Suite en CI (`gate-completo`) y diff de aserciones revisado |
| R5 | `tests/unit/shared-ui/button-touch.test.tsx` |
| R6, R7, R12, R21, R25, R29, R31, R33 | `tests/guards/guard-piezas-base.test.ts`. Es estática: lee `app/`, `components/` y `hooks/` y el diff contra `origin/dev`, con muestras que muerden |
| R8 | Los tres `*-route-contract.test.ts` enmendados, con una muestra nueva que muerde |
| R9-R11 | `tests/unit/shared-ui/error-alert.test.tsx` |
| R13, R14 | `tests/unit/shared-ui/error-state.test.tsx`, `tests/unit/shared-ui/empty-state.test.tsx` |
| R15 | `tests/unit/shared-ui/table-skeleton.test.tsx` |
| R16-R19 | `tests/unit/shared/data-table-states-sustituyen.test.tsx`. Los de QC-55 siguen sin tocar para R19 |
| R20 | Paridad de la vitrina, de las páginas de formulario de recetas, de pedidos (los locales delegan) y de asignación (`AssignedOrdersError` delega) |
| R22 | `tests/unit/shared-ui/spinner.test.tsx` y la paridad |
| R23, R24 | `tests/unit/shared-ui/date-cell.test.tsx`: `formatCivilDate` frente a `toISOString` en instantes cerca de medianoche UTC |
| R26, R27 | `tests/unit/shared-ui/submit-button.test.tsx`, `login-paridad`, `tests/unit/identity-ui/set-credential-form.test.tsx` (sin editar) y `e2e/login-skin.spec.ts:78` (sin editar) |
| R28, R29 | `tests/unit/shared-ui/entity-image-size.test.tsx` y `order-form-image-paridad` |
| R30 | `tests/guards/guard-dependencias-aprobadas.test.ts` (sin cambios) y `guard-piezas-base` |
| R32 | `migracion-listas-alcance.test.ts`, enmendado |
