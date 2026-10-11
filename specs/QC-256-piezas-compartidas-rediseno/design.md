# QC-256 — piezas-compartidas-rediseno · design.md

## Lo que ya existe

**Términos buscados.** En el board (`feature_list.json`, todos los estados): «StatusBadge»,
«PriorityMark», «PasswordField», «credential», «UrlTabs», «PageHeader», «pestañas», «avatar»,
«spinner», «tarjetas». En `specs/`: los mismos. En el código (Grep sobre el worktree; el grafo no
tiene índice de este worktree, ver nota al final): `StatusBadge`, `*_STATUS_LABELS`,
`*_PRIORITY_LABELS`, `CredentialField`, `CredentialInput`, `type="password"`, `aria-pressed`,
`TabsTrigger`, `<h1`, `ScreenEnter`, `animate-spin`, `Loader2Icon`, `RowActionsMenu`,
`actionsColumn`, `getInitials`.

| Qué apareció | Dónde | Qué se hace |
| --- | --- | --- |
| QC-227 (`done`) dejó el `StatusBadge` compartido y el `ORDER_STATUS_LABELS` único «para la ficha de P5» (A1 de su `design.md`, P5 de su `requirements.md`) | `specs/QC-227-componentes-con-la-nueva-marca/` | Es esta ficha. No hay duplicado: QC-227 lo apartó a propósito |
| QC-251 (`done`) nombra a QC-256 como dueña de PriorityMark, StatusBadge, Notice, PageShell, UrlTabs y PasswordField (fuera de su alcance) | `specs/QC-251-catalogo-de-componentes/requirements.md` | Se sigue: QC-251 solo dejó el formato del catálogo |
| QC-257 (`in_progress`, en paralelo) «Shell del rediseño» | `specs/QC-257-shell-rediseno/` | No edita `button.tsx` ni crea piezas compartidas; sí añade o cambia filas de `CATALOGO.md`. Ver § 11 |
| Cuatro copias del texto de estado de pedido y tres de prioridad | `pedidos/components/order-status-badge.tsx`, `asignacion/components/company-orders-columns.tsx`, `asignacion/components/assigned-orders-columns.tsx`, `dashboard/components/execution-trace-format.ts` | Pasan a leer de un solo mapa (R10, R11) |
| `OrderStatusBadge`, `OrderPriorityBadge`, `OrderCoverageBadge`, `UserStatusBadge` sobre `Badge` | rutas de pedidos y usuarios | Se **dejan** como están (D7): las cambian QC-262, QC-267 |
| `CredentialField` (QC-21): **ningún consumidor** en `app/` | `components/shared/credential-field.tsx` | Se absorbe en `PasswordField` y se borra (D5) |
| `CredentialInput` (QC-79): el ojo con `aria-pressed`, en la ruta | `app/(public)/establecer-contrasena/[token]/components/credential-input.tsx` | Es la referencia de comportamiento del ojo. Se queda en su ruta hasta QC-260 (D7) |
| Tres pestañas «a mano» que navegan por URL | `asignacion/components/assignment-view-tabs.tsx`, `configuracion/usuarios/components/usuarios-tabs-switch.tsx`, `inventario/components/product-type-tabs.tsx` | Son los consumidores identificados de `UrlTabs`; las cambian sus fichas (D7) |
| `ScreenEnter` ya anima la entrada de pantalla en todo el layout privado | `app/(private)/components/screen-enter.tsx` | `PageShell` **no** añade otra (R27) |
| Un `Spinner` compartido; el `Toaster` pinta su propio `Loader2Icon` | `components/shared/spinner.tsx`, `components/ui/sonner.tsx` | `Toaster` pasa a usar `Spinner` (R44) |
| Tokens de success, warning, info y destructive (fondo suave y texto) | `app/globals.css` | Se reutilizan; se añaden solo los que faltan (§ 5) |
| Barra de filtros de `DataTable` (QC-55): campo de búsqueda, un control suelto por filtro (menú de casillas, inputs, `DatePicker` de rango) y una X por filtro siempre visible | `components/shared/data-table/data-table-filters.tsx`, `data-table-filter-date.tsx` | Se **reescribe su aspecto** como chips (§ 7.5); la lógica de emisión (`withFilter`, `withSearch`) no cambia |
| Enlaces «Volver a…» hechos a mano en pantallas de operario y detalle | `asignacion/empaque/[id]/…/packing-order-screen.tsx`, `asignacion/acondicionamiento/[id]/…/conditioning-order-screen.tsx`, `dashboard/recorrido/[id]/…/execution-trace-detail.tsx`, `asignacion/[id]/…/order-execution-error.tsx`, `inventario/importar/…/import-texts.ts`, `proveedores/[id]/…/catalog-line-form.tsx` | Son los consumidores identificados de `ArrowLink`; los cambian sus fichas (D7). Los «Volver» de los diálogos y «Volver a la primera página» **no** son navegación con flecha y no se tocan |

**Filas de `components/shared/CATALOGO.md` consultadas y paso de la regla de decisión**
(`docs/perfil-agentes.md > Regla de decisión para componentes`):

| Pieza | Filas consultadas | Paso | Por qué no bastaba el anterior |
| --- | --- | --- | --- |
| `Button` (tallas, `xl`, `touch="mobile"`) | `Button` | 2 · extiende | Reutilizar no basta: D7 cambia las tallas. Se extiende sin romper la firma (R5) |
| `Tabs` + `TabsIndicator` | `Tabs` | 2 · extiende | El primitivo no exporta el indicador de Base UI; se añade una parte |
| `Avatar` con `tone` | `Avatar`, `ResponsibleAvatars`, `getInitials` | 2 · extiende | Prop opcional; sin ella pinta igual que hoy |
| `Spinner` (`lg`, 0,9 s) | `Spinner`, `Toaster` | 2 · extiende | Talla nueva opcional |
| `RowActionsMenu` (presentación centrada) | `RowActionsMenu`, `Dialog`, `DropdownMenu` | 2 · extiende | Prop opcional; el menú desplegable sigue igual |
| `DataTable` (tarjetas) y `actionsColumn` (acciones como datos) | `DataTable` | 2 · extiende | Props opcionales; sin ellas, la tabla de siempre (R38) |
| `CredentialRequirements` (estilo de regla cumplida) | `CredentialRequirements` | 2 · extiende (visual) | Cambio de aspecto del tablero `Campos` |
| Barra de filtros en chips (`DataTable`) | `DataTable`, `DropdownMenu`, `Popover`, `DatePicker`, `Input` | 2 · extiende (visual) | La pieza ya existe; cambia su aspecto y gana «Limpiar filtros». Los controles internos se reutilizan |
| `ArrowLink` | `Button`, `buttonVariants` | 3 · compone | `Button` no navega; `buttonVariants` sobre `Link` ya es el patrón del repo (`EmptyState`, `ErrorState`), y esta pieza le añade la flecha y su movimiento |
| `Alert` | — (no está) | shadcn | Regla 1 de `frontend_dev`: existe en shadcn/ui; `pnpm exec shadcn add alert` |
| `StatusBadge` | `Badge` | 3 · compone | `Badge` no tiene tonos con punto ni pulso, y cambiar sus variantes cambiaría las pantallas de hoy (R47) |
| Mapa de pedido (`order-status.ts`) | `Badge`, `OrderDistributionLabel` | 4 · crea (sin UI) | No hay fuente compartida; tres rutas la copian |
| `PriorityMark` | `Badge` | 3 · compone | Es texto + SVG; `Badge` es justo lo que D1 descarta |
| `Notice` | `ErrorAlert`, `ErrorState`, `UnexpectedErrorNotice` | 3 · compone (`Alert`) | Esos tres son solo de error; `Notice` lleva cuatro tonos |
| `PasswordField` | `CredentialField`, `CredentialRequirements`, `TextField`, `Input`, `Label`, `FieldError` | 3 · compone | `TextField` no admite contraseña ni ojo; `CredentialField` no tiene ojo |
| `PageShell` | `Card` | 4 · crea | No hay contenedor de página |
| `PageHeader` | — | 4 · crea | Cada página pinta su `h1` a mano |
| `UrlTabs` | `Tabs` | 3 · compone | `Tabs` no sincroniza con la URL (lo dice su fila) |
| `avatarTone` | `getInitials` | 4 · crea (sin UI) | Función pura, en `lib/shared/ui/` |

**Excepción declarada a «sube a `shared` con la segunda ruta».** Las piezas nuevas nacen en
`components/shared/` sin esperar a la segunda ruta, porque esta ficha existe para que las usen las
fichas de módulo (D7) y cada una tiene ya sus consumidores:

| Pieza | Consumidores identificados (ficha que la adopta) |
| --- | --- |
| `StatusBadge`, mapa de pedido, `PriorityMark` | pedidos (QC-262), asignación y operario (QC-265), dashboard (QC-261) |
| `Notice` | asignación (QC-265), establecer contraseña (QC-260) |
| `PasswordField` | login y establecer contraseña (QC-260), integraciones (QC-237 / QC-267) |
| `PageShell`, `PageHeader` | todas las pantallas privadas (QC-261 a QC-267) |
| `UrlTabs` | asignación (QC-265), usuarios (QC-267), inventario (QC-263) |
| `ArrowLink` | operario: empaque y acondicionamiento (QC-265), recorrido (QC-261), importar inventario (QC-263), proveedores (QC-266) |

**Nota sobre el grafo.** `list_projects` no tiene índice de este worktree (solo del repo principal
en `dev` y de QC-226). La exploración se hizo con Grep/Read sobre el worktree.

## 1. Modelo de datos, rutas e integraciones

Nada. Ni tablas, ni RLS, ni migraciones, ni rutas, ni Server Actions, ni integraciones. Todo es
presentación en `components/`, `lib/shared/ui/` y `app/globals.css`.

## 2. Button (R1–R5) — `components/ui/button.tsx`

Cambia solo el mapa de `cva`:

| Talla | Hoy | Queda |
| --- | --- | --- |
| `default` | `h-8` (32) | `h-9 px-3.5` (36) |
| `sm` | `h-7` (28) | `h-8 px-3 text-[13px]` (32) |
| `icon` | `size-8` | `size-9` |
| `icon-sm` | `size-7` | `size-8` |
| `xl` (nueva) | — | `h-13 px-5 text-base font-semibold rounded-[10px]` (52) |
| `xs`, `lg`, `icon-xs`, `icon-lg` | sin uso en `app/` | sin tocar (D11) |

`touch` pasa de `{ true, false }` a `{ true, false, mobile }`: `true` sigue siendo `touchTarget`
(`min-h-11 min-w-11`); `mobile` es `max-md:min-h-11`. El tipo de la prop queda `boolean | 'mobile'`,
así que ningún consumidor cambia (R5).

Medidas y animaciones del tablero que **ya** cumple el botón (QC-227, QC-228): degradado del
primario, velo, pulsado a 98 %, foco de 2 px. No se tocan.

## 3. StatusBadge y mapa de pedido (R6–R11)

### 3.1 `components/shared/status-badge.tsx`

```ts
export type StatusTone = 'neutral' | 'progress' | 'waiting' | 'success' | 'danger' | 'info' | 'muted';
export const STATUS_TONES: readonly StatusTone[];
export type StatusBadgeProps = { readonly tone: StatusTone; readonly children: ReactNode }
  & Omit<ComponentProps<'span'>, 'children'>;   // data-testid y data-* pasan tal cual
export function StatusBadge(props: StatusBadgeProps): JSX.Element;
```

Compone `Badge` (para heredar `render` y el slot) con un `cva` propio de tonos. Medidas de
`qc.css > .sb`: alto 22 px, relleno `0 9px 0 8px`, radio completo, 12 px en peso 500,
`whitespace-nowrap` y `shrink-0` (R7). El punto es un `<span aria-hidden="true">` de 6 px. En
`progress` lleva una animación `status-pulse` de 1,6 s en bucle (anillo con `box-shadow` que crece y
se apaga, `@keyframes` en `globals.css`) (R8). `transition-[background-color,color]
duration-(--dur-base) ease-(--ease-standard)` (R9). Movimiento reducido: la regla global de
`globals.css` ya deja una sola iteración (QC-228).

Tonos → tokens (§ 5): `neutral` y `progress` usan tokens nuevos; `waiting`, `success`, `danger` e
`info` reutilizan `--warning-*`, `--success-*`, `--destructive-*`, `--info-*`; `muted` es fondo
transparente, texto `muted-foreground` y borde interior de 1 px en `--border`.

### 3.2 `components/shared/order-status.ts` (fuente única, sin UI)

```ts
import type { OrderPriority, OrderStatus } from '@/lib/modules/pedidos';
import type { OrderCoverage } from '@/lib/modules/inventario';
import type { StatusTone } from './status-badge';

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>>;
export const ORDER_STATUS_TONES: Readonly<Record<OrderStatus, StatusTone>>;
export const ORDER_PRIORITY_LABELS: Readonly<Record<OrderPriority, string>>;
export const ORDER_COVERAGE_LABELS: Readonly<Record<OrderCoverage, string>>;
export const ORDER_COVERAGE_TONES: Readonly<Record<OrderCoverage, StatusTone>>;
```

`components/**` puede importar el barrel de un módulo (`docs/architecture.md > La regla de
dependencias`); `lib/shared/` no, por eso el mapa no va allí (alternativa A3). Los textos son los de
hoy, sin cambiar ni uno. Los tonos, los de R10.

### 3.3 Las copias de las rutas (R11)

Cada constante conserva su nombre y su exportación (los tests y los barrels de ruta la siguen
importando), pero deja de declarar texto:

| Archivo | Queda |
| --- | --- |
| `pedidos/components/order-status-badge.tsx` | `export { ORDER_STATUS_LABELS, ORDER_PRIORITY_LABELS, ORDER_COVERAGE_LABELS } from '@/components/shared/order-status'` y los tres badges siguen leyendo de ahí. Sus mapas de **variante** de `Badge` no cambian (R47) |
| `asignacion/components/company-orders-columns.tsx` | `COMPANY_ORDER_STATUS_LABELS = ORDER_STATUS_LABELS`, `COMPANY_ORDER_PRIORITY_LABELS = ORDER_PRIORITY_LABELS` |
| `asignacion/components/assigned-orders-columns.tsx` | `ASSIGNED_ORDER_STATUS_LABELS` se deriva eligiendo sus tres claves de `ORDER_STATUS_LABELS`; prioridad = `ORDER_PRIORITY_LABELS` |
| `dashboard/components/execution-trace-format.ts` | `TRACE_ORDER_STATUS_LABELS = ORDER_STATUS_LABELS` (el tipo de la traza es el estado de pedido) |

El test de R11 recorre `app/**/*.{ts,tsx}` y falla si encuentra un literal de objeto tipado como
`Record<OrderStatus, string>`, `Record<OrderPriority, string>`, `Record<OrderCoverage, string>` o
`Record<AssignedOrderView['status'], string>`.

## 4. PriorityMark, Notice y PasswordField

### 4.1 `components/shared/priority-mark.tsx` (R12–R14)

```ts
export type PriorityMarkProps = { readonly priority: OrderPriority } & Omit<ComponentProps<'span'>, 'children'>;
```

`inline-flex items-center gap-2 text-[13px] whitespace-nowrap`. SVG de 14 px, `aria-hidden`: tres
`rect` de 3 px de ancho y alturas 5/9/13, las vacías con opacidad 0,2 (copiado de `Estados.dc.html`).
Crítica: triángulo con signo de exclamación, `text-destructive-text font-semibold`. La etiqueta sale
de `ORDER_PRIORITY_LABELS`.

### 4.2 `components/ui/alert.tsx` + `components/shared/notice.tsx` (R15–R18)

`Alert` entra con `pnpm exec shadcn add alert` (variantes `default` y `destructive`, sin tocar).
`Notice`:

```ts
export type NoticeTone = 'success' | 'warning' | 'info' | 'danger';
export type NoticeProps = { readonly tone: NoticeTone; readonly title?: ReactNode;
  readonly children?: ReactNode; readonly className?: string; readonly testId?: string };
```

Tono → fondo `--*-subtle`, texto `--*-text`, borde `--*-border` (nuevo, § 5). Icono de
`lucide-react`: `CircleCheck`, `TriangleAlert`, `Info`, `CircleAlert`, 18 px, `aria-hidden`.
`role`: `alert` en `danger`, `status` en los demás (R17). Entrada: `animate-in fade-in
slide-in-from-bottom-[10px] duration-(--dur-slow) ease-(--ease-enter)` de `tw-animate-css`, ya
instalado (R18). El test de R15 lee el fuente y falla ante `#`, `oklch(`, `rgb(` o `hsl(`.

### 4.3 `components/shared/password-field.tsx` (R19–R26)

```ts
export type PasswordFieldProps = {
  readonly name: string;
  readonly label: string;
  readonly id?: string;
  readonly autoComplete?: 'current-password' | 'new-password' | 'off';
  readonly variant?: 'password' | 'secret';          // secret: Plex Mono + tracking al ocultar (R24)
  readonly texts?: { readonly show?: string; readonly hide?: string };   // R21
  readonly error?: string;                           // R26, con FieldError
  readonly describedBy?: string;
  readonly testId?: string;
  readonly requirements?: {                          // presente = lista de reglas (R25)
    readonly breachedState?: CredentialRuleState;
    readonly labels?: Partial<Record<CredentialRule, string>>;
    readonly onOwnRulesMetChange?: (met: boolean) => void;
  };
};
export const PASSWORD_FIELD_SHOW_LABEL = 'Mostrar la contraseña';
export const PASSWORD_FIELD_HIDE_LABEL = 'Ocultar la contraseña';
```

- **Sin `requirements`**, el campo es no controlado, como `CredentialInput`: el valor no pasa por el
  estado de React. El único estado es si se ve.
- **Con `requirements`**, lleva la candidata en un `useState` interno, como `CredentialField`, porque
  la lista necesita el valor en vivo; el efecto que avisa depende del booleano derivado, no de la
  candidata (mismo motivo que en QC-21: avisar solo cuando cambia el veredicto).
- Medidas: campo `h-11 text-base md:text-base` y relleno derecho para el ojo; ojo `size-11`
  superpuesto a la derecha (no al lado, como hoy en `CredentialInput`), `type="button"`,
  `aria-pressed`, `aria-controls`, nombre accesible visible solo para lectores. Icono `Eye`/`EyeOff`
  de `lucide-react`; la raya del ojo se dibuja con el trazo en 200 ms (tablero `Campos`).
- `CredentialField` se borra; su test (`tests/unit/credential-field.test.tsx`) pasa a
  `password-field-requisitos.test.tsx` con los mismos casos (enmienda a QC-21, § 10).
- `CredentialRequirements`: regla cumplida con el texto en `foreground` y el icono en
  `--success-text`; pendiente en `muted-foreground` (`qc.css > .rule`), transición de color 200 ms.
- Desviación del tablero: 44 px y 16 px en vez de 40 px (D12), por la regla multiplataforma.

## 5. Tokens nuevos — `app/globals.css`

Valores copiados de `docs/diseno/canvas/qc.css` (claro / oscuro). Solo lo que falta:

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `--status-neutral-subtle` / `-text` / `-dot` | `0.94 0.008 215` / `0.35 0.013 215` / `0.6 0.013 215` | `0.27 0.013 215` / `0.85 0.01 215` / `0.65 0.013 215` | tono `neutral` |
| `--status-progress-subtle` / `-text` / `-dot` | `0.95 0.025 248` / `0.32 0.075 248` / `0.54 0.16 255` | `0.31 0.055 248` / `0.93 0.035 248` / `0.75 0.13 250` | tono `progress` |
| `--success-border`, `--warning-border`, `--destructive-border`, `--info-border` | `0.85 0.07 145`, `0.86 0.07 60`, `0.86 0.06 27`, `0.86 0.05 285` | `0.4 0.07 145`, `0.4 0.07 60`, `0.4 0.07 27`, `0.4 0.06 285` | borde de `Notice` |
| `--avatar-1` … `--avatar-6` y `--avatar-1-text` … `--avatar-6-text` | `--av1`…`--av5` y `.av.c6` de `qc.css` | sus valores `.dk` | `Avatar` |

Todos en `oklch(...)`, cada uno con su `--color-*` en `@theme inline` para usarlo como utilidad.
Los puntos de `waiting`, `success`, `danger` e `info` son `--warning`, `--success`,
`--destructive` e `--info`, que ya existen con el mismo valor. `@keyframes status-pulse` también
va aquí. El test de tokens lee `globals.css` y comprueba que cada token está en `:root` y en
`.dark`.

## 6. PageShell, PageHeader y UrlTabs (R27–R31)

```ts
// components/shared/page-shell.tsx
export function PageShell({ children, className }: { children: ReactNode; className?: string }): JSX.Element;
// <div class="@container flex flex-1 flex-col gap-5 px-4 pt-4 pb-6 md:px-7 md:pt-6 md:pb-8">

// components/shared/page-header.tsx
export type PageHeaderProps = {
  readonly title: ReactNode;
  readonly titleTestId?: string;
  readonly actions?: ReactNode;
  readonly breadcrumb?: { readonly label: string;
    readonly items: readonly { readonly label: string; readonly href?: string }[] };
};

// components/shared/url-tabs.tsx
export type UrlTabItem = { readonly value: string; readonly href: string; readonly label: string;
  readonly icon?: LucideIcon; readonly count?: number; readonly testId?: string };
export type UrlTabsProps = { readonly label: string; readonly current: string;
  readonly items: readonly UrlTabItem[]; readonly testId?: string };
```

- `PageShell` no anima: la entrada la pone `ScreenEnter` del layout. Declara `@container` para que
  `PageHeader` y `DataTable` respondan a su ancho.
- `PageHeader`: `flex flex-wrap items-end justify-between gap-4`; título `text-[30px] font-semibold
  tracking-tight` (24 px en contenedor ≤ 760 px); miga `text-[13px] text-muted-foreground` con
  `ChevronRight` de 14 px `aria-hidden`. Acciones `@max-[760px]:w-full` y sus botones `flex-1`
  (R30). El nombre accesible de la miga lo pasa el consumidor: el tablero lo deja como `[Ruta]`.
- `UrlTabs` compone `Tabs` + `TabsList` + `TabsTrigger` con `render={<Link href />}` y
  `nativeButton={false}`, el patrón que ya usa `AssignmentViewTabs`, y la parte nueva
  `TabsIndicator` (`Tabs.Indicator` de Base UI) en `components/ui/tabs.tsx`. Forma de
  `qc.css > .tabs`: lista con fondo `muted` y 4 px de relleno; el indicador es la pastilla con fondo
  `card` y sombra que se desplaza (`transition-[translate,width] duration-(--dur-base)`). Disparador
  `min-h-11`. Contador: `qc.css > .count`. Por debajo del ancho: `flex-nowrap overflow-x-auto`.
  **A verificar al implementar:** el nombre de las variables CSS que publica `Tabs.Indicator` en la
  versión instalada de `@base-ui/react`.

## 7. DataTable y menú de fila (R32–R39)

### 7.1 Acciones como datos

```ts
// components/shared/row-actions-menu.tsx
export type RowActionsMenuProps = {
  readonly items: readonly RowActionMenuItem[];
  readonly triggerLabel: string;
  readonly triggerTestId?: string;
  readonly triggerDataAttributes?: Readonly<Record<`data-${string}`, string>>;
  readonly presentation?: 'dropdown' | 'centered';   // nuevo; ausente = 'dropdown'
  readonly title?: ReactNode;                          // título del menú centrado; ausente = triggerLabel
  readonly texts?: { readonly actions?: string; readonly close?: string }; // «Acciones», «Cerrar»
};

// components/shared/data-table/actions-column.tsx
export type RowActionsSpec = Pick<RowActionsMenuProps, 'items' | 'triggerLabel' | 'triggerTestId' | 'title'>;
export type ActionsColumnOptions<T> = { id?; label?; align?; defaultPinned? } &
  ({ readonly cell: (row: T) => ReactNode } | { readonly menu: (row: T) => RowActionsSpec });
```

Con `menu`, la celda pinta `RowActionsMenu` y la tarjeta tiene de dónde sacar los ítems para su
«Acciones» (R32, R35). Con `cell`, todo sigue como hoy (R38), pero esa fila no tendrá «Acciones» en
tarjeta.

### 7.2 Menú que no se corta (R33)

`DropdownMenuContent` del menú de fila con `side="bottom"`, `align="end"` y la evitación de
colisiones de Base UI con volteo vertical. **A verificar al implementar:** el nombre exacto de la
prop (`collisionAvoidance` en el `Positioner`) y su valor por defecto en la versión instalada. El
menú ya va en un portal, así que ningún `overflow` de la tabla lo recorta. Se prueba con E2E (jsdom
no tiene layout).

### 7.3 Tarjetas (R34, R35, R39)

```ts
// data-table-types.ts
export type DataTableCardLayout = {
  readonly primary: string;               // id de columna: arriba a la izquierda, Plex Mono
  readonly status?: string;               // arriba a la derecha
  readonly title?: string;                // segunda línea, peso 600
  readonly meta?: readonly string[];      // fila de datos secundarios, 13 px
  readonly footer?: string;               // abajo a la izquierda, junto a «Acciones»
};
// DataTableProps gana: readonly card?: DataTableCardLayout;
// DataTableTexts gana (opcionales): cardActions?, closeMenu?
```

- El envoltorio de la tabla declara `@container`. Con `card`, se pintan **los dos** cuerpos: la tabla
  con `@max-[760px]:hidden` y la lista de tarjetas (`data-table-cards.tsx`, interno, no sale del
  barrel) con `hidden @max-[760px]:flex`. `display: none` saca del árbol de accesibilidad el que no
  se ve. Barra de filtros, paginación y estados son los mismos, fuera de los dos cuerpos (R39).
- La tarjeta (`qc.css > .rm`): fila superior `primary` + `status`, `title`, `meta`, y fila inferior
  `footer` + `RowActionsMenu presentation="centered"` (botón `outline` de 44 px con `Ellipsis` y el
  texto «Acciones»).
- Las columnas que la disposición no nombra no salen en la tarjeta: lo decide el consumidor.
- **Aviso a las fichas de módulo:** con `card`, cada celda se pinta dos veces en el DOM, así que un
  `data-testid` de celda aparece dos veces. Sus tests buscan dentro de la tabla o de la tarjeta.

### 7.4 Menú centrado (R36, R37)

`presentation="centered"` pinta el botón «Acciones» y un `Dialog` (`components/ui/dialog.tsx`) con
`showCloseButton={false}` (su X dice «Close» en inglés) y un botón propio «Cerrar». `DialogContent`
ya va fijo y centrado en la ventana visible, sobre velo. Ítems con `min-h-12`, mismos iconos,
variantes y enlaces que en el desplegable. Elegir un ítem llama a `onSelect` (o navega con `Link`) y
cierra. Base UI devuelve el foco al disparador al cerrar. Animación de la ficha del tablero: zoom de
0,96 a 1 en 300 ms sobre velo; la trae `DialogContent`.

### 7.5 Barra de filtros en chips (R52–R58, D14)

Cambia el **aspecto** de `DataTableFilters`; su contrato (`DataTableFiltersProps`) y lo que emite no
cambian. Estructura, con `qc.css > .toolbar` y `.chip`:

```
<div data-testid="data-table-filters" class="flex flex-wrap items-center gap-2">
  [búsqueda]  [toolbarActions]
  <div class="flex flex-wrap items-center gap-2">          ← @max-[760px]: basis-full (R58)
    [chip col 1] [X col 1 si activo] [chip col 2] … [Limpiar filtros si hay alguno]
  </div>
</div>
```

- **Chip** (`data-table-filter-chip.tsx`, interno): `button` de `min-h-11`, `px-3`, `rounded-lg`,
  `text-[13px] font-medium`, `whitespace-nowrap`.
  - Inactivo: `border border-dashed border-input`, icono `Plus` de 16 px `aria-hidden` + etiqueta.
  - Activo: `border-solid border-primary text-primary bg-[color-mix(in_oklch,var(--primary)_6%,var(--card))]`,
    sin `Plus`, y el valor en `<span class="border-l border-border pl-2 font-semibold text-foreground">`.
  - `btn-veil` (la utilidad de `globals.css`, que ya aplica el velo solo con `@media (hover: hover)`)
    y `active:scale-[0.98]`. Transiciones las de `btn-veil`.
  - Nombre accesible = texto visible: «Estado» o «Estado En curso» (R54).
- **Qué abre cada chip** (R53), reutilizando los controles de hoy:

  | `filter.kind` | El chip es el disparador de | `data-testid` del chip | Controles dentro (testids de hoy) |
  | --- | --- | --- | --- |
  | `select` | `DropdownMenu` con `DropdownMenuCheckboxItem` | `data-table-filter-<id>` (el de hoy) | `data-table-filter-option-<id>-<valor>` |
  | `dateRange` | `DatePicker mode="range"` (su `triggerContent` pasa a ser el chip) | `data-table-filter-date-<id>` (el de hoy) | atajos `data-table-date-last-*` |
  | `text` | `Popover` con un `Input` | `data-table-filter-chip-<id>` (nuevo) | `data-table-filter-<id>` |
  | `numberRange` | `Popover` con dos `Input` | `data-table-filter-chip-<id>` (nuevo) | `data-table-filter-min-<id>`, `-max-<id>` |

  Para `text` y `numberRange` el `Input` ya no está en la barra: hay que abrir el chip. Es el único
  cambio de uso, y obliga a ajustar los tests que escriben directamente en esos campos (§ 10).
- **Valor del chip** (R55): función pura `formatFilterChipValue(spec, value)` en
  `data-table-filter-chip.tsx`, con «+N» para varias opciones, «≥»/«≤» para rangos abiertos y fechas
  `AAAA-MM-DD` tal como viajan en `DataTableFilterValue` (no hay conversión).
- **Quitar un filtro** (R57): la `DataTableFilterClearButton` de hoy (mismo testid y
  `texts.clearFilter`), pintada solo si ese filtro está activo.
- **«Limpiar filtros»** (R56): `Button variant="ghost" size="sm" touch`, testid
  `data-table-clear-filters`, texto `texts.clearFilters` (opcional en `DataTableTexts`; por defecto
  «Limpiar filtros»). Emite `withoutFilters(params)`, helper nuevo en `data-table-params.ts` que deja
  `filters: {}` y no toca búsqueda, orden, página ni tamaño (igual que `withFilter`, que no toca la
  página).
- **Tarjetas:** la barra está fuera de los dos cuerpos de § 7.3, así que tabla y tarjetas comparten
  los mismos chips (R39).

## 7b. ArrowLink (R49–R51, D13) — `components/shared/arrow-link.tsx`

```ts
export type ArrowLinkProps = {
  readonly href: string;
  readonly direction: 'back' | 'forward';
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;   // ausente: back -> 'outline', forward -> 'default'
  readonly size?: ButtonSize;
  readonly touch?: boolean | 'mobile';
  readonly testId?: string;
  readonly className?: string;
};
```

`next/link` con `className={buttonVariants({ variant, size, touch })}`: navega y nunca es `submit`.
Icono `ArrowLeft` delante (back) o `ArrowRight` detrás (forward) de `lucide-react`, `aria-hidden`.
Movimiento (`qc.css > .b-back`, `.b-go`): `transition-[translate] duration-(--dur-base)
ease-(--ease-standard)` en el icono y, dentro de `@media (hover: hover)`, `group-hover:-translate-x-[3px]`
(back) o `group-hover:translate-x-[3px]` (forward). En back, relleno izquierdo de 10 px. Movimiento
reducido: la regla global.

## 8. Avatar y Spinner (R40–R44)

```ts
// lib/shared/ui/avatar-tone.ts
export type AvatarTone = 1 | 2 | 3 | 4 | 5 | 6;
export function avatarTone(key: string): AvatarTone;   // hash FNV-1a de 32 bits % 6 + 1; '' -> 1
// components/ui/avatar.tsx: Avatar gana `tone?: AvatarTone` -> data-tone; AvatarFallback lo lee
// con group-data-[tone=N]/avatar:bg-avatar-N y text-avatar-N-text. Sin tone: igual que hoy.
// components/shared/responsible-avatars.tsx: <Avatar tone={avatarTone(responsible.userId)}>
```

`Spinner` gana la talla `lg` (`size-5`) y cambia `animate-spin` (1 s) por
`animate-[spin_0.9s_linear_infinite]`. `Toaster` pinta `<Spinner />` en su icono de carga. El test
de R44 recorre `app/` y `components/` y falla si encuentra `animate-spin` o `Loader2Icon` fuera de
`components/shared/spinner.tsx`.

## 9. Multiplataforma y movimiento

- Nada es solo de escritorio. Sin `:hover` como única vía: el ojo, «Acciones», las pestañas y el
  menú se activan con clic, toque y teclado.
- Objetivos de 44 px: `touch`, pestañas, ojo, «Acciones», disparador ⋯ (ya lo tenía), paginación,
  chips de filtro (el tablero los dibuja a 40 px; suben a 44 por la misma regla que D12) y
  «Limpiar filtros». El velo del chip y la flecha de `ArrowLink` solo se mueven con `hover: hover`.
  Ítems del menú centrado a 48 px. Campos a 16 px de letra.
- Tarjetas por **contenedor**, no por ventana, como pide la ficha del tablero `Tabla`.
  `touch="mobile"` y el relleno de `PageShell` van por ventana (D16).
- El menú centrado usa `Dialog` de Base UI (fijo, con scroll del cuerpo bloqueado), el mismo que ya
  se usa en iOS en el resto del repo. Comprobación en iOS: en el E2E a 390 px.
- Movimiento reducido: la regla global de `globals.css` (QC-228) corta pulso, giro, indicador,
  entrada de `Notice` y zoom del diálogo. Nada nuevo que añadir.

## 10. Enmiendas a specs cerrados

| Spec | Qué cambia | Por qué |
| --- | --- | --- |
| QC-21 (`ayuda-visual-de-contrasena`) | `CredentialField` desaparece; sus requisitos pasan a `PasswordField` con `requirements`. R17 de QC-21 («sin mostrar/ocultar») queda superado | D5 (D12 del humano) |
| QC-30 (`rediseno-login`) | `tests/unit/login-skin.test.tsx` fija que `button.tsx` contiene `h-8`; pasa a la talla nueva | D4 (D7 del humano) |
| QC-231, QC-232, QC-233 (snapshots de `tests/unit/paridad/`) | Los 17 `__snapshots__/*-paridad.test.tsx.snap` que pintan un `Button` se regeneran con `vitest -u` en un commit propio. Un script sobre `git diff` comprueba que cada línea cambiada difiere solo en las clases de talla de § 2 (`default`, `sm`, `icon`, `icon-sm`): 721 líneas, 0 fuera de ese mapa. Cumple la regla de `login-paridad` («el cambio de talla se aplica sobre el snapshot en su propio commit») | D4 (D7 del humano); decisión del leader del 2026-10-10 |
| QC-232 (`componentizacion-formularios-y-acciones`) | `RowActionsMenu` y `actionsColumn` ganan props opcionales; su contrato se amplía, no cambia | D2 |
| QC-55 (`tabla-de-datos-compartida`) | La barra de filtros pasa a chips: los filtros `text` y `numberRange` se abren desde su chip, la X de cada filtro solo aparece con el filtro activo y nace «Limpiar filtros». Los tests que escribían directamente en esos campos o daban por hecha la X abren antes el chip | D14 |

## 11. Cruce con QC-257

`components/shared/CATALOGO.md` lo tocan las dos fichas (filas distintas: QC-257 la de
`SidebarProvider`; esta, las de § «Lo que ya existe»). `scripts/archivos-en-vuelo.mjs` lo marcará.
No se puede evitar: la guardia exige la fila en el mismo commit que la pieza. Quien mergee segunda
resuelve el conflicto conservando las filas de las dos. `components/ui/tooltip.tsx`, que la
evaluación marcaba como posible cruce, **no** lo toca esta ficha.

## 12. Alternativas descartadas

- **A1. Tarjetas midiendo el ancho con `ResizeObserver`** y pintando solo un cuerpo. Evita el DOM
  doble, pero el servidor no conoce el ancho: el primer pintado sería la tabla y en el teléfono
  saltaría a tarjetas tras hidratar. La ficha del tablero pide `container-type`, no ancho de
  ventana. Se paga con el DOM doble (aviso en § 7.3) y solo en las tablas que lo piden.
- **A2. Los siete tonos como variantes nuevas de `Badge`.** `Badge` ya tiene `success`, `warning`,
  `info` y `neutral` y las usan las pantallas de hoy: redefinirlas cambiaría su aspecto antes de
  tiempo (R47, D7), y meter el punto y el pulso en el primitivo mezcla dos piezas.
- **A3. El mapa de pedido en `lib/shared/ui/`.** `lib/shared` es hoja del grafo y no puede importar
  `OrderStatus` de `@/lib/modules/pedidos`; habría que copiar las claves a mano y se perdería que
  falte una y no compile.
- **A4. `UrlTabs` como `nav` con enlaces y un indicador medido a mano.** Es la semántica del
  tablero, pero reimplementa lo que ya da `Tabs.Indicator` de Base UI y rompe con el patrón de
  pestañas-enlace que ya usa el repo (`AssignmentViewTabs`).
- **A5. `Notice` desde cero, sin `Alert`.** La regla 1 de `frontend_dev` lo prohíbe: shadcn/ui lo
  tiene.
- **A6. Añadir el ojo a `CredentialField` y dejar `CredentialInput`.** Deja dos campos de contraseña;
  D12 pide uno.
- **A7. Cambiar ya `OrderStatusBadge` por dentro para que pinte `StatusBadge`.** Un archivo, pero
  cambia de golpe pedidos, asignación y dashboard sin sus fichas (D7).
- **A8. Chips solo para `select` y `dateRange`, dejando los `Input` de `text` y `numberRange` en la
  barra.** No rompería ningún test, pero la barra quedaría con dos formas y el tablero dibuja todos
  los filtros como chips. Se acepta ajustar los tests (§ 10).
- **A9. `ArrowLink` como prop `arrow` de `Button`.** `Button` de Base UI pinta un `<button>`; para
  navegar habría que pasarle `render={<Link />}` en cada uso y la flecha seguiría dependiendo del
  orden de los hijos. Una pieza que ya es enlace deja claro que navega y no envía (R49).

## 12b. Filas de `CATALOGO.md` de D13 y D14 (borrador para el implementer)

| Pieza | Archivo | Para qué | Alcance | Puntos de extensión | Base de | Diseño |
|---|---|---|---|---|---|---|
| `ArrowLink` | `components/shared/arrow-link.tsx` | Enlace con forma de botón y flecha para «Volver…» e «Ir a…». | Cubre: dirección `back` (flecha delante, `outline` por defecto) y `forward` (flecha detrás, `default` por defecto), flecha que se adelanta 3 px al pasar el puntero (solo con `hover: hover`), variantes, tallas y `touch` de `Button`. No cubre: enviar formularios ni acciones sin navegación (ver `Button`), ni volver en el historial del navegador (necesita `href`). | `variant`, `size`, `touch`, `testId`, `className`. | `buttonVariants` | `docs/diseno/canvas/Botones.dc.html` |

En la fila de `DataTable`, `Alcance` pasa a decir «barra de filtros en chips (punteado sin filtro,
sólido con el valor dentro), X por filtro activo y «Limpiar filtros»» y `Puntos de extensión` gana
`texts.clearFilters` opcional, `card`, `texts.cardActions`, `texts.closeMenu` y `actionsColumn({ menu })`;
`Base de` gana `Popover`; `Diseño` pasa a `docs/diseno/canvas/Tabla.dc.html`.

## 13. Dependencias

Ninguna. `@base-ui/react`, `class-variance-authority`, `lucide-react` y `tw-animate-css` ya están
en `docs/dependencias.md`. `pnpm exec shadcn add alert` solo copia `components/ui/alert.tsx`; si
intentara añadir un paquete, se para y se pregunta (R48).

## 14. Trazabilidad (R → test)

| R | Test |
| --- | --- |
| R1–R5 | `tests/unit/shared-ui/button-tallas.test.tsx` (+ `button-touch.test.tsx` existente, R3) |
| R6–R9 | `tests/unit/shared-ui/status-badge.test.tsx` |
| R10, R11 | `tests/unit/shared-ui/order-status.test.ts` |
| R12–R14 | `tests/unit/shared-ui/priority-mark.test.tsx` |
| R15–R18 | `tests/unit/shared-ui/notice.test.tsx` |
| R19–R24, R26 | `tests/unit/shared-ui/password-field.test.tsx` |
| R25 | `tests/unit/shared-ui/password-field-requisitos.test.tsx` (migrado de `credential-field.test.tsx`) |
| R27–R30 | `tests/unit/shared-ui/page-header.test.tsx` |
| R31 | `tests/unit/shared-ui/url-tabs.test.tsx` |
| R32, R38 | `tests/unit/shared-ui/data-table-acciones.test.tsx` |
| R33 | `e2e/piezas-compartidas.spec.ts` (menú ⋯ de la última fila de una lista existente, ventana baja) |
| R34, R35, R39 | `tests/unit/shared-ui/data-table-tarjetas.test.tsx` |
| R36, R37 | `tests/unit/shared-ui/row-actions-menu-centrado.test.tsx` |
| R40 | `tests/unit/shared-ui/avatar-tone.test.ts` |
| R41 | `tests/unit/shared-ui/avatar-tone.test.ts` (render) y `tests/unit/shared-ui/tokens-rediseno.test.ts` |
| R42 | `tests/unit/shared-ui/responsible-avatars.test.tsx` (ampliado) |
| R43, R44 | `tests/unit/shared-ui/spinner.test.tsx` (ampliado) |
| R6, R15, R41 (tokens) | `tests/unit/shared-ui/tokens-rediseno.test.ts` |
| R45, R46 | `tests/guards/guard-catalogo-de-componentes.test.ts` (existente) y `tests/unit/shared-ui/catalogo-qc256.test.ts` |
| R47 | `tests/unit/marca/badges-estado.test.tsx` (existente, sin cambios) |
| R48 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) |
| R49–R51 | `tests/unit/shared-ui/arrow-link.test.tsx` |
| R52–R55, R57 | `tests/unit/shared/data-table-filters.test.tsx` (reescrito para los chips) y `tests/unit/shared-ui/data-table-filter-chip.test.ts` (`formatFilterChipValue`, R55) |
| R56 | `tests/unit/shared/data-table-filters.test.tsx` y `tests/unit/shared/data-table-params.test.ts` (`withoutFilters`) |
| R58 | `tests/unit/shared/data-table-filters.test.tsx` (clases de contenedor estrecho y del velo) |
