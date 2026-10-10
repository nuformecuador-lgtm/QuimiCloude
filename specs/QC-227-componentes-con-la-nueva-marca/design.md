# QC-227 — componentes-con-la-nueva-marca · design.md

> Esta ficha cambia la piel de componentes que ya existen: no tiene **modelo de datos**. No hay
> tablas, RLS, migraciones, Server Actions ni route handlers nuevos, y no se toca `lib/modules/`
> ni `db/`. Los colores salen de los tokens de QC-226 (`app/globals.css`), que no cambian (D10).
> Las cifras de contraste que se citan son las de la tabla WCAG de la guía §06.

## Lo que ya existe

Términos buscados: `badge`, `StatusBadge`, `tabular-nums`, `font-mono`, `sidebar-muted-foreground`,
`ring-ring/50`, `border-input`, `--chart`, `gráfico`, `LCP`, `priority`. Se buscaron en
`feature_list.json` (todas las fichas, en todos sus estados), en `specs/` y en el código con
Grep/Glob. **El grafo no tiene proyecto para este worktree** (`list_projects` solo lista el de la
raíz y el de QC-226); se usó Grep/Read.

| Apareció | Qué se hace |
| --- | --- |
| **QC-226** (`specs/QC-226-tema-y-marca-base/`): tokens de estado, `--sidebar-muted-foreground`, `--chart-*`, Plex Mono cargada, ítem activo (R11), barra `::before` (D18) y test de contraste (`tests/unit/theme/color-tokens.test.ts`) | Se **reutilizan** los tokens y la conversión oklch → contraste WCAG del test. La regla del ítem activo y la barra `::before` **no se tocan** (P3). D18 se resuelve en P3 |
| **QC-228** (en vuelo, `.worktrees/QC-228-movimiento-de-la-interfaz/`): `btn-shine`/`btn-veil` en `button.tsx`, movimiento en `select`, `autocomplete`, `tabs`, `sidebar`; «secundario» = `outline` (respuesta del humano a su P1) | Se **reutiliza** la decisión del secundario (D9). Se **conservan** `btn-shine`, `btn-veil` y las clases de movimiento al cambiar colores. El código empieza con QC-228 ya en `dev` (P7, §10) |
| **QC-231** (`DateCell`, `EMPTY_MARK`), **QC-232** (`FormSheet`, `DeleteConfirmDialog` → `ConfirmDialog variant="destructive"`), **QC-233** (buscadores) | Se **reutilizan** tal cual: las piezas ya son únicas, así que el cambio de color se hace en un solo sitio. Lo que esas fichas dejaron «para QC-227» y la ficha no nombra queda fuera (P6) |
| `components/ui/badge.tsx` sin variantes de estado; 6 usos de `Badge` | Se **amplía** `badgeVariants` (§3). Ningún componente nuevo (D2) |
| `components/ui/table.tsx`: todas las tablas pasan por él (Grep de `<table`/`<thead`: solo `table.tsx` y `data-table-header-menu.tsx`) | La cabecera se cambia en un solo sitio (§4.1) |
| `DataTableColumn` (`data-table-types.ts`) sin forma de marcar una columna de datos | Se le añade una prop opcional (§4.2) |
| `progress/review_QC-226.md > m2` (LCP del logo del login) | P1: entra (§8) |
| Gráficos | **No hay**: ni librería ni componente (`_trabajo/marca/inventario-ui.md > Datos que cambian el plan`, confirmado con Grep). P4 |

## 1. Enfoque

Todo se hace **dentro de los componentes**, editando sus clases de Tailwind. `components/ui/` son
copias de shadcn que el repo ya edita (QC-228 lo hace), así que no hacen falta reglas sin capa que
les ganen desde fuera. La única excepción es la barra lateral (§5): el ítem activo ya se pinta con
una regla sin capa en `globals.css`, y el inactivo va al lado, por la misma razón (no editar
`components/ui/sidebar.tsx`, que vigila `ui-primitivas-intactas.test.ts` y toca QC-228).

> **Enmienda 2026-10-09 (§16).** El centrado del carril colapsado (R31–R37) sí edita
> `components/ui/sidebar.tsx`. Solo cambia las dos clases del modo icono del botón de menú. A un
> `!important` en capa no se le gana desde una regla sin capa (§16.1). El color del ítem inactivo
> sigue en `globals.css`, como dice este apartado.

## 2. Archivos

| Archivo | Cambio | R |
| --- | --- | --- |
| `components/ui/badge.tsx` | Variantes `success`, `warning`, `info`, `neutral`; `destructive` a `subtle`/`text`; contorno de foco | R1, R21 |
| `app/(private)/pedidos/components/order-status-badge.tsx` | Mapas de tono de estado, prioridad y cobertura | R3–R5, R9 |
| `app/(private)/configuracion/usuarios/components/user-columns.tsx` | Mapa de tono de `UserStatusBadge` | R6, R9 |
| `app/(private)/produccion/formulas/components/recipe-version-list.tsx`, `recipe-version-form.tsx` | «En revisión» con `variant="info"` | R8, R9 |
| `app/(private)/inventario/components/product-batches-panel.tsx` | «Sobre-reservado» pasa a `Badge variant="destructive"`; lote, cantidades y fechas en Mono | R7, R9, R12 |
| `components/ui/table.tsx` | Cabecera en `muted` | R10 |
| `components/shared/data-table/data-table-header-menu.tsx` | Columna fijada de la cabecera con `bg-muted` | R10 |
| `components/shared/data-table/data-table-types.ts`, `data-table.tsx` | Prop `tabular` y su clase en la celda | R11 |
| `app/(private)/asignacion/components/packing-orders-list-section.tsx` | Respeta `tabular` (pinta sus propias celdas) | R11 |
| Los 13 `*-columns.tsx` de §4.2 y `order-ingredients-table.tsx` | `tabular: true` en las columnas de la lista cerrada | R11, R13 |
| `app/globals.css` | Regla del ítem inactivo; `outline-ring/50` → `outline-ring` en `@layer base` | R15–R17, R22 |
| `components/ui/button.tsx` | Contorno de foco; variante `destructive` sólida | R18–R22, R25 |
| `components/ui/input.tsx`, `textarea.tsx`, `select.tsx`, `autocomplete.tsx` | Borde `--input` y foco de campo | R22–R25 |
| `components/ui/checkbox.tsx`, `tabs.tsx`, `calendar.tsx` | Contorno de foco | R21, R22 |
| `components/shared/shared-select.tsx`, `presentation-select.tsx`, `presentation-unit-select.tsx`, `date-picker.tsx`, `file-field.tsx`, `data-table/data-table-filters.tsx`, `responsible-avatars.tsx` | Foco opaco (campo o control, según §7) | R22–R24 |
| `app/(private)/inventario/components/product-field.tsx`, `app/(private)/dashboard/components/execution-trace-columns.tsx`, `app/(private)/dashboard/recorrido/[id]/components/execution-trace-detail.tsx` | Foco opaco | R22 |
| `components/shared/brand-logo.tsx`, `app/(public)/login/page.tsx` | Precarga del logo vertical (P1) | R26 |
| `components/ui/sidebar.tsx` (enmienda 2026-10-09) | Botón de menú en modo icono: `size-8!`/`p-2!` → `size-11!`/`p-3.5!` | R31, R32, R33, R34 |
| `components/private/app-sidebar.tsx` (enmienda 2026-10-09) | Enlace de marca: `group-data-[collapsible=icon]:p-1.5!` | R31, R35 |
| `components/private/nav-user.tsx` (enmienda 2026-10-09, P11) | Avatar centrado solo en modo icono | R32 |
| `components/private/app-sidebar.tsx`, `components/ui/sidebar.tsx`, `app/(private)/components/sidebar-toggle.tsx` (enmienda 2026-10-09, D12) | Icono de abrir o cerrar según el estado; colores de la pastilla fijados en todos los estados; `SidebarTrigger` admite `children` (§16.7) | R38, R39 |
| `app/globals.css` (enmienda 2026-10-09, P12) | Relleno del botón en modo icono a 14 px y comentario corregido | R31 |

## 3. Badges (R1–R9)

En `badgeVariants` (`components/ui/badge.tsx`):

| Variante | Clases de color | Tono |
| --- | --- | --- |
| `success` (nueva) | `bg-success-subtle text-success-text` | éxito |
| `warning` (nueva) | `bg-warning-subtle text-warning-text` | aviso |
| `info` (nueva) | `bg-info-subtle text-info-text` | información |
| `neutral` (nueva) | `bg-muted text-muted-foreground` | neutro |
| `destructive` (cambia) | `bg-destructive-subtle text-destructive-text`; se retiran `bg-destructive/10`, `dark:bg-destructive/20` y sus `focus-visible:ring-destructive/*` | error |

- Los tokens ya son colores de Tailwind (`@theme inline`, QC-226 R3), y como cada token tiene su
  valor en `:root` y en `.dark`, no hacen falta clases `dark:`.
- Las variantes `default`, `secondary`, `outline`, `ghost` y `link` no cambian: las usa el contador
  de la barra lateral y no son estados.
- Forma, alto (`h-5`) y radio no cambian. En el contorno de foco, `focus-visible:ring-[3px]
  focus-visible:ring-ring/50` pasa al de §7 (R21).
- **Mapas de tono.** `STATUS_VARIANTS`, `PRIORITY_VARIANTS`, `COVERAGE_VARIANTS`
  (`order-status-badge.tsx`) y el de `UserStatusBadge` (`user-columns.tsx`) cambian sus valores a
  los de R3–R6 y su tipo a la unión de las cinco variantes de tono. Siguen siendo `Record`
  exhaustivos: si aparece un estado nuevo, el archivo deja de compilar, como hoy.
- **Lote sobre-reservado (R7).** El `<span>` hecho a mano (`rounded-full border
  border-destructive/40 … text-destructive`) pasa a `<Badge variant="destructive">` con el mismo
  `data-testid` y el mismo texto.
- **En revisión (R8).** `variant="outline"` → `variant="info"` en los dos sitios.
- Las marcas de comparación de versión (`recipe-lines-field.tsx`: igual, cambiada, añadida,
  quitada) no son estados y no cambian de variante. «Quitado» usa `destructive`, así que hereda el
  tono de error nuevo sin tocar su archivo.

## 4. Tablas (R10–R13)

### 4.1 Cabecera

- `TableHeader`: añade `bg-muted`.
- `TableHead`: `text-foreground` → `text-muted-foreground`. Es el par «Cabecera de tabla» de la guía
  (6.70:1 en claro, 4.66:1 en oscuro).
- `DataTableHeaderCell`: la columna fijada pasa de `bg-background` a `bg-muted`. Si no, la celda
  fijada taparía el fondo de la cabecera. Las celdas fijadas del cuerpo siguen en `bg-background`.
- El icono de orden y el disparador del menú de columna heredan el color. Si alguno lo fija a mano,
  se cambia a `text-muted-foreground`; el E2E de R10 lo comprueba con el color calculado.

### 4.2 Plex Mono con cifras tabulares

`DataTableColumn` gana una prop opcional:

```ts
/** Celda de lote, cantidad o fecha: Plex Mono con cifras tabulares (guía §07). Solo el cuerpo. */
readonly tabular?: boolean;
```

`data-table.tsx` añade `column.tabular === true && 'font-mono tabular-nums'` al `cn(...)` del
`TableCell`; la cabecera no la recibe (R13). `packing-orders-list-section.tsx` pinta sus propias
celdas con las columnas de `packing-orders-columns.tsx`, así que hace lo mismo.

**Lista cerrada (R11).** Por etiqueta visible; el implementer pone `tabular: true` en la columna
con esa etiqueta.

| Archivo | Columnas |
| --- | --- |
| `app/(private)/pedidos/components/order-columns.tsx` | Cantidad, Fecha de solicitud |
| `app/(private)/clientes/components/customer-columns.tsx` | Fecha de alta, Última modificación |
| `app/(private)/produccion/formulas/components/recipe-columns.tsx` | Creado, Actualizado |
| `app/(private)/proveedores/[id]/components/catalog-columns.tsx` | Mínimo de compra, Creado, Actualizado |
| `app/(private)/inventario/components/product-columns.tsx` | Existencia, Alerta de cantidad, Reservado, Disponible |
| `app/(private)/inventario/components/finished-stock-columns.tsx` | Existencia, Alerta de cantidad |
| `app/(private)/configuracion/presentaciones/components/presentation-columns.tsx` | Contenido |
| `app/(private)/asignacion/components/company-orders-columns.tsx` | Fecha de terminado |
| `app/(private)/asignacion/components/finished-orders-columns.tsx` | Fecha de terminado |
| `app/(private)/asignacion/components/conditioning-orders-columns.tsx` | Envases |
| `app/(private)/asignacion/components/packing-orders-columns.tsx` | Envases |
| `app/(private)/dashboard/components/execution-trace-columns.tsx` | Primera anotación, Última anotación |
| `app/(private)/pedidos/components/order-ingredients-table.tsx` (tabla sin `DataTable`) | Porcentaje, Stock, Cantidad requerida, Restante: `font-mono tabular-nums` en sus `TableCell` |

Las columnas de P9 se quedan fuera. `assigned-orders-columns`, `user-columns`, `work-group-columns`
y `unit-columns` no tienen columnas de la lista.

**Panel de lotes (R12, P8).** En `product-batches-panel.tsx`, los `<dd>` de lote, cantidad,
fecha de compra, vencimiento, apartado y disponible ganan `font-mono tabular-nums`. Los `<dt>` no.

Plex Mono ya se carga con los pesos 400 y 500 (QC-226 R7). `tabular-nums` no cambia nada en Mono,
que ya es de ancho fijo, pero la guía §07 lo pide y deja la intención escrita si algún día la
fuente cambia.

## 5. Barra lateral (R14–R17)

El fondo (R14) ya es el de QC-226 y no se toca. En `app/globals.css`, justo después del bloque del
ítem activo y también sin capa:

```css
[data-slot='sidebar-content']
  :is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-sub-button'])
  :not([data-active]):not(:hover):not(:focus-visible) {
  color: var(--sidebar-muted-foreground);
}
```

- **Por qué `sidebar-content`.** La marca (`sidebar-header`) y el menú de usuario (`sidebar-footer`)
  también son `sidebar-menu-button`, y la ficha solo habla de los ítems de navegación (R17).
- **Por qué excluye `:hover` y `:focus-visible`.** Una regla sin capa gana a las utilidades del
  primitivo (`hover:text-sidebar-accent-foreground`). Si no los excluyera, el hover dejaría de
  aclarar el texto (R16).
- El icono es un SVG de lucide con `currentColor`, así que hereda el color sin regla propia.
- **Contraste (R15).** La guía da 7.97:1 (claro) y 7.63:1 (oscuro) contra `--sidebar`. El panel
  pinta un degradado, así que el test mide también contra cada parada de `--sidebar-panel-gradient`.
  La más clara es `#0A4A47` en modo claro.
- Con QC-228 ya mergeada, su indicador del ítem activo solo cambia fondo y anillo del activo; esta
  regla no lo toca.

## 6. Botones (R18–R20, R25)

En `components/ui/button.tsx`, sobre lo que deje QC-228:

- **Base.** `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` se sustituye
  por el contorno de §7. Las clases de `aria-invalid` no cambian (R25).
- **`default` (R18).** No cambia: `bg-primary text-primary-foreground` más el `btn-shine` de QC-228.
  QC-228 ya comprueba el contraste del texto sobre las tres paradas de su degradado; aquí se
  comprueba el par `--primary-foreground`/`--primary` (7.43:1 y 9.98:1 según la guía).
- **`outline` (R19, D9).** No cambian sus colores: el `btn-veil` de QC-228 pone el hover. Solo
  cambia el foco.
- **`secondary` (R19).** No cambia (11.48:1 y 11.14:1 según la guía).
- **`destructive` (R20).** `bg-destructive/10 text-destructive hover:bg-destructive/20 …
  dark:…` pasa a
  `bg-destructive text-destructive-foreground hover:bg-[color-mix(in_oklch,var(--destructive),var(--foreground)_10%)]`.
  Es el mismo patrón que ya usa `secondary` para el hover. Mezclar con `--foreground` oscurece en
  claro y aclara en oscuro, así que el contraste del texto sube en los dos casos. Se retiran sus
  `focus-visible:*-destructive/*`: el foco es el común (R21). Solo la usan los diálogos de
  confirmación (`ConfirmDialog` y `DeleteConfirmDialog`) y tres diálogos de cancelar o cerrar
  sesiones.

## 7. Foco y campos (R21–R24)

**Controles (R21): contorno con separación.** Se aplica a botones, casillas, pestañas, días del
calendario, badges enlazables y los enlaces que hoy usan `ring-ring/50`. Se dibuja con `outline` y
no con `ring` por dos motivos. Uno: el hueco del `outline-offset` es transparente, mientras que el
de `ring-offset` es un color (blanco por defecto), que en oscuro se vería como un filo blanco. Dos:
es lo que dibuja el lienzo (`outline: 2px solid #02605A; outline-offset: 2px`). Clases de partida:
`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`. En Tailwind v4,
`outline-none` pone `--tw-outline-style: none`, y eso puede dejar sin estilo al `outline-2`. El
implementer lo comprueba en el CSS compilado y, si pasa, añade `focus-visible:outline-solid`. El
E2E mide `outline-style`, `outline-width`, `outline-offset` y `outline-color` calculados.

**Campos (R23, R24): borde y anillo pegado.** Se aplica a `input`, `textarea`, el disparador de
`select`, el input de `autocomplete` y los compuestos que copian sus clases (`shared-select`,
`presentation-select`, `presentation-unit-select`, `date-picker`, `file-field`, los filtros de
`data-table` y `product-field`). Quedan `border border-input` (ya está) y
`focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring`. El borde y el anillo
suman 2 px de `--ring` opaco, sin separación: así el campo no «salta» y el anillo no se monta sobre
la etiqueta de al lado. El fondo no cambia: `bg-transparent` en claro y `dark:bg-input/30` en
oscuro. El par que mide la guía es borde contra superficie (`--input`/`--card`: 3.22:1 y 3.66:1).

**Global.** En `@layer base`, `* { @apply border-border outline-ring/50 }` pasa a `outline-ring`
(R22). `focus-visible:ring-2 focus-visible:ring-ring`, que ya usan algunos enlaces, ya es opaco y
se queda.

**Guardia (R22).** `tests/guards/guard-anillo-de-foco.test.ts` recorre `app/**/*.{ts,tsx,css}` y
`components/**/*.{ts,tsx}` y falla si encuentra `/(ring|outline)-ring\/\d+/`. Lleva un caso
negativo con una cadena que lo contiene, para demostrar que muerde.

## 8. Logo del login (R26, P1)

`BrandLogo` gana `readonly preload?: boolean` y lo pasa a `next/image`. Next 16 marcó `priority`
como obsoleta y la sustituyó por `preload`. El implementer lo confirma en
`node_modules/next/dist/docs/` (la referencia de `<Image>`) antes de escribirlo. Si la versión
instalada solo admite `priority`, usa esa prop con el mismo nombre público `preload` en
`BrandLogo`. Solo `app/(public)/login/page.tsx` lo pasa; la barra y el encabezado no, porque no
son el LCP de su página. El test afirma que el `<img>` del login no lleva `loading="lazy"` y lleva
`fetchpriority="high"`, y que los demás usos siguen con `loading="lazy"`.

## 9. Tests que se enmiendan, snapshots de paridad y evidencia visual

**Snapshots de paridad** (`tests/unit/paridad/__snapshots__/*.snap`, de QC-231, QC-232 y QC-233).
Congelan el árbol accesible **con las clases**, así que esta ficha los cambia a propósito. Se
regeneran con `-u`, en un commit propio por tanda, `test(QC-227): paridad con las clases de marca
(<tanda>)`. Antes, el implementer comprueba que **quitando los `class="…"`** el `.snap` viejo y el
nuevo son idénticos: mismos roles, nombres, `data-testid` y `data-*`. Así sabe que solo cambiaron
clases, y anota la comprobación en `progress/impl_QC-227.md`. Si sale cualquier otra diferencia, es
un cambio de comportamiento (R29): se para y se reporta.

**Evidencia visual.** El diff de clases no dice cómo se ve. Las capturas las saca **el leader** con
Playwright y el seed demo (QC-230), como en QC-232 T0c/T5e. Las «antes» salen sobre `dev` con
QC-228 ya mergeada (T0) y las «después» al cerrar (T10). Van en
`_trabajo/marca/capturas-componentes-antes/` y `-despues/`, en claro, en oscuro y en móvil:
`/pedidos`, `/configuracion/usuarios`, `/inventario` con el panel de lotes abierto, `/dashboard`,
`/clientes`, `/asignacion`, un formulario en `Sheet` con un campo enfocado por teclado, un diálogo
de borrado abierto, y la barra lateral expandida y en modo icono. El índice de parejas va en
`progress/features/QC-227.md`.

**Lista cerrada de enmiendas a tests (R29).** Solo si fallan, y solo la aserción de clase, con una
nota `ENMIENDA QC-227` en el caso:

| Test | Por qué |
| --- | --- |
| `tests/unit/shared-ui/button-touch.test.tsx` | Si afirma sobre la cadena de clases del botón |
| `tests/guards/guard-piezas-base.test.ts`, `guard-formularios-y-acciones.test.ts`, `guard-buscadores.test.ts` | Si alguno fija una clase de foco, de borde o de badge que esta ficha cambia |
| `tests/unit/theme/color-tokens.test.ts` | Solo si hay que exportar su conversión de contraste (ver §11); su lógica no cambia |
| `tests/guards/guard-identificador-de-request.test.ts` | Alta de `marca-componentes.spec.ts` en `E2E_ESPERADOS` (es su punto de extensión) |
| `tests/unit/sidebar-ajuste.test.tsx` (enmienda 2026-10-09, P12) | Solo la aserción `padding: 10px !important` del caso «en modo icono el boton se fuerza a 44px con !important» pasa a `14px`, y se corrige su comentario (§16.1) |

Si falla otro test, no se enmienda: se para y se reporta.

## 10. Choque con QC-228 (P7)

| Archivo | QC-228 | QC-227 |
| --- | --- | --- |
| `app/globals.css` | `@utility btn-*`, tokens de botón, toasts, entrada de pantalla, indicador, regla global de movimiento reducido | Regla del ítem inactivo y `outline-ring` en `@layer base` |
| `components/ui/button.tsx` | `btn-shine`, `btn-veil`, escala al pulsar | Foco y `destructive` |
| `components/ui/select.tsx`, `autocomplete.tsx`, `tabs.tsx` | Duraciones y curvas | Foco y borde |
| `tests/unit/paridad/__snapshots__/*.snap` | 13 archivos | 21 archivos (todos) |
| `tests/unit/shared-ui/button-touch.test.tsx`, `tests/unit/theme/color-tokens.test.ts`, `tests/guards/guard-identificador-de-request.test.ts` | Enmiendas y alta de E2E | Ídem (§9) |

**Actualizado por la enmienda del 2026-10-09.** La versión aprobada decía que las dos fichas no
compartían `components/ui/sidebar.tsx` ni `components/private/app-sidebar.tsx`: la regla del ítem
inactivo iba en `globals.css` justo para no tocarlos. Con R31–R37, QC-227 **sí los toca** (§16),
y también `components/private/nav-user.tsx` (P11), que QC-228 no toca. No hay choque en vuelo: el
código de QC-227 empieza cuando QC-228 está mergeada en `dev` (T0) y parte de sus clases finales,
incluido `components/private/sidebar-active-indicator.tsx`, que esta ficha **no** edita.

| Archivo | QC-228 | QC-227 (enmienda) |
| --- | --- | --- |
| `components/ui/sidebar.tsx` | Duraciones y curvas (`duration-(--dur-base)`, `ease-(--ease-standard)`) | Las dos clases del modo icono del botón de menú |
| `components/private/app-sidebar.tsx` | `SidebarActiveIndicator` alrededor de cada lista, rotación del chevron | Una clase del enlace de marca en modo icono |

Los cambios son de líneas distintas, pero en los mismos archivos, y los snapshots no se pueden
fusionar a mano. Por eso F2 empieza con QC-228 en `dev` (T0), y QC-227 parte de sus clases y no al
revés.

## 11. Verificación (R → test)

| R | Test |
| --- | --- |
| R1, R7, R8, R9 | `tests/unit/marca/badges-estado.test.tsx`: clases de cada variante, panel de lotes con `product-batch-over-reserved` como badge `destructive`, «en revisión» con `info`, y testid, texto y `data-*` intactos |
| R3–R6 | El mismo archivo: cada valor de cada `Record` pinta su variante (una tabla por mapa, recorriendo los valores del contrato) |
| R2, R10, R15, R18, R19, R20, R21, R23 (contraste) | `tests/unit/marca/contraste-componentes.test.ts`: lee `globals.css` y calcula los pares de cada R en claro y en oscuro (y R15 contra cada parada del degradado). Reutiliza la conversión oklch → luminancia de `color-tokens.test.ts`; si no está exportada, se mueve a `tests/unit/theme/contraste.ts` sin cambiar su lógica |
| R10, R11, R13 | `tests/unit/marca/tablas-marca.test.tsx`: `DataTable` con una columna `tabular` y otra sin ella (clases en `td`, no en `th`), clases de `TableHeader`/`TableHead`, columna fijada de la cabecera con `bg-muted`, y para cada archivo de §4.2 que sus columnas con `tabular: true` son exactamente las de la lista |
| R12 | `tests/unit/marca/tablas-marca.test.tsx`: los `<dd>` del panel de lotes |
| R14, R15, R16, R17 | `tests/unit/marca/sidebar-inactivo.test.ts` (texto de `globals.css`: la regla nueva con su selector y que la del activo y su `::before` siguen iguales), más el E2E |
| R18–R20, R24, R25 | `tests/unit/marca/botones-y-campos.test.tsx`: clases de cada variante y de cada campo; `aria-invalid` sigue con `border-destructive` |
| R22 | `tests/guards/guard-anillo-de-foco.test.ts` |
| R10, R11, R15, R16, R21, R23, R24 (calculado) | `e2e/marca-componentes.spec.ts`, en Chromium y WebKit, en claro y en oscuro: color de fondo y de texto de la cabecera de `/pedidos`; `font-family` y `font-variant-numeric` de una celda de fecha y de una de nombre; color de un ítem inactivo y de ese mismo ítem con hover; contorno de un botón y de un campo enfocados con `Tab`. Alta en `E2E_ESPERADOS` |
| R26 | `tests/unit/brand/brand-logo.test.tsx` (caso nuevo) y el aviso de LCP ausente en `next dev` (lo anota el implementer) |
| R27 | `tests/unit/theme/color-tokens.test.ts`, sin editar sus tablas esperadas |
| R28 | `tests/unit/theme/sin-dependencias-nuevas.test.ts` y `guard-dependencias-aprobadas` |
| R29 | La suite existente (CI) y la comprobación de snapshots sin clases de §9 |
| R30 | `tests/guards/guard-movimiento.test.ts` (llega con QC-228), en verde y sin editar |
| R31–R36 (medido) | `e2e/marca-componentes.spec.ts`, bloque «carril colapsado» (§16.4), en Chromium y WebKit |
| R31, R35, R36, R37 (clases) | `tests/unit/marca/sidebar-carril.test.ts` (§16.4) |
| R38, R39 | `e2e/marca-componentes.spec.ts`, bloque «control de colapso», y `tests/unit/marca/sidebar-carril.test.ts` (§16.7) |
| R36 | Además: `tests/unit/sidebar-ajuste.test.tsx`, `tests/unit/sidebar-desktop.test.tsx`, `tests/unit/app-sidebar.test.tsx` y `tests/unit/theme/ui-primitivas-intactas.test.ts` en verde, sin editar aserciones, salvo la de P12 |

## 12. Alternativas descartadas

**A1. Un `StatusBadge` compartido con un mapa de tono único para todos los estados.** Es lo que
propone la auditoría (`_trabajo/marca/auditoria-componentes.md > 3`). Arreglaría también los
estados en texto plano y las etiquetas copiadas cuatro veces. Se descarta por D2: es un componente
nuevo, y además mueve marcado en seis pantallas que hoy no tienen badge. Queda para la ficha de P5.

**A2. Pintar la marca desde `globals.css` con reglas sin capa, sin tocar `components/ui/`.** Es lo
que hizo QC-226 para la barra. Se descarta para badges, botones, campos y tablas. Serían decenas de
selectores por `data-slot` peleando en especificidad con las utilidades, y cada variante quedaría
repartida entre el componente y el CSS. Las primitivas son copias de shadcn que el repo ya edita.
Solo se mantiene para el ítem inactivo (§5), al lado de la regla del activo.

**A3. Detectar las celdas de cifra por su contenido** (una expresión regular sobre el texto, o
`typeof value === 'number'`). Se descarta. Las celdas pintan `ReactNode` y no valores, y una regex
pondría en Mono nombres con dígitos («Envase 500 ml») o dejaría fuera fechas con texto. La lista
cerrada se revisa y se prueba.

**A4. Arreglar el anillo translúcido oscureciendo el token.** Si `--ring` fuera más oscuro, el
`/50` llegaría a 3:1. Se descarta por D10: la paleta está cerrada, y `--ring` ya cumple de sobra
cuando es opaco (7.43:1 y 8.96:1).

**A5. Ítem inactivo con `text-sidebar-muted-foreground` en `sidebarMenuButtonVariants`.** Sería lo
más directo, pero toca `components/ui/sidebar.tsx`. Ese archivo lo vigila
`ui-primitivas-intactas.test.ts`, lo edita QC-228, y la variante también la usan la marca y el pie,
que no deben cambiar (R17).

## 13. Multiplataforma

No hay excepción que declarar. El foco usa `:focus-visible`: en táctil no aparece al tocar, y con
teclado (incluido el externo en iPad) sí. El hover del ítem inactivo y el del destructivo son
refuerzo: nada se descubre solo con hover. Los targets táctiles (`touch`), los `min-h-11` y el
`text-base` de los campos no cambian, así que iOS sigue sin hacer zoom al enfocar. `outline-offset`
y `color-mix(in oklch)` funcionan en Safari/WebKit 16.2+ y en Chrome Android, y `color-mix` ya se usa
en `globals.css` y en `button.tsx`. El E2E corre en WebKit.

## 14. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `outline-none` anula el estilo de `focus-visible:outline-2` en Tailwind v4 | §7: se comprueba en el CSS compilado y en el E2E (`outline-style: solid`) |
| Un snapshot de paridad cambia algo más que clases | §9: comparación sin `class="…"`; si difiere, se para |
| El texto del ítem inactivo no llega a 4.5:1 contra la parada más clara del degradado | El test lo mide (R15). Si falla, se para y se reporta: no se ajusta el token (D10) |
| QC-228 cambia de clases al cerrar su T6 | F2 empieza con QC-228 en `dev` (T0), sobre sus clases finales |
| `dark:bg-input/30` rebaja el contraste del borde contra el fondo propio del campo | La guía mide el borde contra `--card` (R23), y así se prueba. Se anota en las capturas de T10 para que lo mire el humano |
| Un guard de QC-231/232/233 fija una clase que esta ficha cambia | Lista cerrada de §9; si es otro, se para |

## 15. Dependencias de terceros

**Ninguna** (R28). Tailwind v4, `class-variance-authority`, `next/image` y Playwright ya están. No
hay fila nueva en `docs/dependencias.md`.

## 16. ENMIENDA 2026-10-09 — Carril colapsado (R31–R37, D11)

Pedida por el humano con el spec ya aprobado. El código se leyó en el worktree de QC-228 (PR #197),
que es la base de la que parte F2 (T0). El diagnóstico sale de **leer el código y la cascada de
CSS**: no se ha medido en un navegador. El primer paso de T12 lo confirma midiendo (§16.5).

### 16.1 Lo que ya existe y por qué falla

**Geometría real en modo icono.** El diagnóstico preliminar suponía un carril de 3rem (unos 28 px
útiles). **No se sostiene:** `app/(private)/layout.tsx:89` pisa la variable con
`'--sidebar-width-icon': '4.875rem'` (78 px, QC-29 R19). Además, el `p-[18px]` de
`app-sidebar.tsx:108` no viene de QC-226: es el «margen exterior de 18 px» de QC-29 R18, que
QC-226 R10 solo conservó. Las medidas, en px:

| Caja | Ancho | De dónde sale |
| --- | --- | --- |
| `sidebar-container` (flotante) | 96 | `calc(var(--sidebar-width-icon) + --spacing(4) + 2px)` = 78 + 16 + 2 (`sidebar.tsx:247`) |
| `sidebar-inner` (el carril visible) | 60 | 96 − 2 × 18 de `p-[18px]` |
| Caja de contenido de `SidebarHeader` y de `SidebarGroup` | 44 | 60 − 2 × 8 de `p-2` |

Con un botón de 44 px, el carril queda centrado con 0 px de holgura. El ancho no es el problema
(P10).

**La causa: una regla con `!important` sin capa pierde contra otra con `!important` en capa.**
- `sidebarMenuButtonVariants` (`sidebar.tsx:489`) fuerza en modo icono
  `group-data-[collapsible=icon]:size-8!` y `group-data-[collapsible=icon]:p-2!`. Son utilidades
  con `!important` **dentro de `@layer utilities`**.
- `globals.css:323-337` intenta ganarles con reglas **sin capa** y `!important`
  (`width/height: 44px`, `padding: 10px`, y `padding: 6px` en el enlace de marca).
- En la cascada con capas, el orden se invierte para las declaraciones `!important`: una
  declaración importante **en capa** gana a una importante **sin capa**. El comentario de
  `globals.css:321` («es la única forma de ganarle a un `!important` de una utilidad») es falso.
  `tests/unit/sidebar-ajuste.test.tsx:302` solo comprueba el texto del CSS con una regex, así que
  sigue en verde aunque la regla no gane.

**Lo que se ve, según ese cálculo:**
- **Botones de navegación.** Miden 32 × 44: el ancho sale de `size-8!` y el alto, del
  `min-height: 44px` sin capa. Arrancan en el borde izquierdo de la caja de 44 px, así que su
  centro queda en x = 24 y el eje del carril está en x = 30: **6 px a la izquierda**. El icono
  está centrado en su botón, pero el botón no lo está en el carril.
- **Indicador del ítem activo** (`sidebar-active-indicator.tsx`). Copia la caja del botón activo
  (`offsetWidth`, `offsetLeft`): sale como un rectángulo de 32 × 44, **6 px a la izquierda**. El
  fondo de hover también es el del botón, así que tiene el mismo desvío.
- **Isotipo.** El enlace de marca queda con `p-2!`, así que su caja de contenido mide 16 px de
  ancho. La regla `img { max-width: 100% }` del preflight de Tailwind lo reduce a **16 px de
  ancho**, la mitad de lo que pide QC-226 R13, y además va desplazado. Es el «extremadamente
  pequeño y descentrado» que ve el humano.
- **Avatar del pie** (`nav-user.tsx`). Mide 24 px y va alineado a la izquierda en una fila de
  44 px con `p-2`: su centro queda en x = 28, **2 px a la izquierda** del eje (P11).

### 16.2 Cambio

**`components/ui/sidebar.tsx`** — en la base de `sidebarMenuButtonVariants`, y en ningún otro
sitio:

```
group-data-[collapsible=icon]:size-8!  →  group-data-[collapsible=icon]:size-11!
group-data-[collapsible=icon]:p-2!     →  group-data-[collapsible=icon]:p-3.5!
```

- Quedan 44 × 44 con 14 px de relleno, así que la caja de contenido mide 16 px, lo mismo que el
  icono (`[&_svg]:size-4`). Es el mismo patrón del shadcn original (32 − 2 × 8 = 16). El icono
  queda centrado aunque la etiqueta `<span>` siga en el flujo: el icono ocupa toda la caja de
  contenido, y la etiqueta y el `gap` desbordan hacia la derecha, donde `overflow-hidden` los
  recorta.
- La variante `lg` (`group-data-[collapsible=icon]:p-0!`) no la usa la barra privada y no cambia.
- No se tocan `SIDEBAR_WIDTH`, `SIDEBAR_WIDTH_ICON` ni `rounded-lg`, que son los literales que
  vigila `ui-primitivas-intactas.test.ts`.

**`components/private/app-sidebar.tsx`** — el `className` del enlace de marca gana
`group-data-[collapsible=icon]:p-1.5!`. `tailwind-merge` lo resuelve contra el `p-3.5!` de la
variante, porque comparten modificador e importancia. Quedan 44 − 2 × 6 = 32 px de contenido: el
isotipo cabe entero a 32 px, el preflight ya no lo encoge y queda centrado. `BrandLogo` y su
`height={32}` no cambian.

**`components/private/nav-user.tsx`** (P11) — la fila de identidad gana
`group-data-[collapsible=icon]:justify-center`. En modo icono la fila solo contiene el avatar,
porque el nombre ya no se renderiza.

**`app/globals.css`** (P12) — la regla `[data-collapsible='icon'] [data-slot='sidebar-menu-button']`
pasa de `padding: 10px !important` a `14px !important`, y se reescribe su comentario. El nuevo
dice que las medidas del modo icono las fija el primitivo y que esta regla las repite como
contrato. Las reglas de la marca (`padding: 6px`, `img` a 32 px) se quedan. Ninguna cambia
nada en pantalla.

**Lo que no se toca:**
- `sidebar-active-indicator.tsx`: al medir un botón de 44 × 44 centrado, el indicador sale
  centrado solo. Al colapsar, su `ResizeObserver` ya lo recoloca.
- La barra de acento `::before` (R17, QC-228 R15): sigue pegada al borde izquierdo del botón,
  así que no es una caja centrada y R33 no la mide.
- La vista expandida (R36): todos los cambios llevan el prefijo `group-data-[collapsible=icon]:`
  o viven bajo `[data-collapsible='icon']`.

### 16.3 Contratos de prueba

- **Eje del carril:** `x + width / 2` del `boundingBox()` de `[data-slot="sidebar-inner"]`.
  Tolerancia ±1 px en todas las comparaciones.
- **Modo icono en el E2E:**
  - se entra con la cookie de preferencia (`SIDEBAR_STATE_COOKIE` con el valor de
    `lib/shared/ui/sidebar-state.ts`) antes de cargar la página, sin pulsar el control;
  - se emula `reducedMotion: 'reduce'`;
  - antes de medir se espera a que el ancho del contenedor sea estable, por la transición de
    ancho y el `ResizeObserver` del indicador.
- **Ruta activa:** una cuyo ítem sea un enlace de primer nivel. La elige el implementer a partir de
  `private-nav.ts`, nunca con un literal.

### 16.4 Verificación (R → test)

| R | Test | Qué afirma |
| --- | --- | --- |
| R31 | E2E | Caja de `private-brand-link` y de cada `[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"]`: 44 × 44 y centro en el eje |
| R32 | E2E | Centro del `svg` de cada botón de primer nivel y del avatar (`[data-testid="private-user-initials"]`, o su avatar contenedor) en el eje |
| R33 | E2E | `[data-slot="sidebar-active-indicator"][data-variant="menu"]` con opacidad 1: caja igual a la del botón `[data-active]` y centro en el eje |
| R34 | E2E | Tras `hover()` sobre un botón inactivo, el `background-color` calculado no es transparente y la caja del botón está centrada en el eje |
| R35 | E2E | `img` de `private-brand-link`: 32 × 32, centro en el eje y caja dentro de la del enlace |
| R36 | E2E | Expandida: `img` del logo de 28 px de alto, cada botón de primer nivel tan ancho como su `sidebar-menu` y de al menos 44 px de alto, indicador con la caja del activo |
| R31, R35 | `tests/unit/marca/sidebar-carril.test.ts` | `sidebarMenuButtonVariants()` contiene `size-11!` y `p-3.5!` con prefijo de modo icono y ya no `size-8!` ni `p-2!`; el enlace de marca renderizado lleva `group-data-[collapsible=icon]:p-1.5!` |
| R36 | `tests/unit/marca/sidebar-carril.test.ts` | Las clases de `sidebarMenuButtonVariants()` **sin** el prefijo `group-data-[collapsible=icon]:` son exactamente una lista congelada, copiada del `dev` de T0 |
| R37 | `tests/unit/marca/sidebar-carril.test.ts` | `app/(private)/layout.tsx` sigue con `'--sidebar-width': '17rem'` y `'--sidebar-width-icon': '4.875rem'`, y `app-sidebar.tsx` sigue con `p-[18px]` |

El E2E es el que vale para R31–R35. jsdom no calcula cajas ni resuelve la cascada, y la cascada es
justo lo que falló: una regex sobre el CSS daba verde con la regla perdiendo. El test unitario fija
las clases, para que un cambio en el primitivo dé rojo sin tener que levantar un navegador.

### 16.5 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El diagnóstico de §16.1 es de lectura y no está medido | T12 empieza midiendo con el E2E sobre el `dev` de T0, antes de cambiar nada, y anota las cajas en `progress/impl_QC-227.md`. Si no sale el desvío de 6 px y el isotipo de 16 px, se para y se reporta |
| QC-228 cambia las clases del modo icono antes de mergear | T0 parte de su versión final; la lista congelada de R36 se copia de ese `dev` |
| Un tooltip o el menú flotante del grupo (`NavGroupFloating`) se ancla a otra caja | Se anclan al botón, que ahora mide 44 × 44: el ancla se mueve 6 px a la derecha. Se revisa en las capturas de T10 |

### 16.6 Alternativas descartadas

**A6. Ganar a los `!important` del primitivo con reglas `!important` dentro de `@layer base`.**
Funcionaría: para las declaraciones importantes, una capa anterior gana a una posterior. Se
descarta porque depende de una regla de la cascada poco conocida, y por desconocerla falla hoy la
regla sin capa. La medida quedaría lejos del componente que la necesita. Cambiar dos clases en el
primitivo deja la medida en un solo sitio, a la vista.

**A7. Cambiar el ancho del carril o quitar el `p-[18px]`.** No arregla nada: el botón sigue
forzado a 32 px y alineado a la izquierda, sea cual sea el ancho. Además rompería QC-29 R18 y R19
(P10, R37).

**A8. `justify-center` en modo icono y ocultar la etiqueta, conservando 10 px de relleno.** Haría
falta ocultar el `<span>` de cada ítem (`group-data-[collapsible=icon]:[&>span]:hidden`) para que
el `gap` no empuje el icono 4 px a la izquierda. Son dos reglas en vez de una, y el resultado
depende de la estructura del contenido de cada botón. Igualar la caja de contenido al tamaño del
icono, como hace shadcn, no depende de eso.

**Dependencias:** ninguna (R28).

### 16.7 Control de colapso sin icono visible (R38, R39, D12)

**Lo que hay.** Los dos controles tienen icono:
- la pastilla del borde (`app-sidebar.tsx:194-206`) es un `Button variant="ghost" size="icon-sm"`
  con `PanelLeftIcon className="size-3.5"`;
- el control del encabezado (`sidebar-toggle.tsx`) es `SidebarTrigger`, que pinta
  `PanelLeftIcon` a 16 px.

**Causas probables, por lectura** (sin medir; T12 las confirma primero):

1. **Pastilla con el puntero encima, en modo claro: el icono desaparece.**
   - La variante `ghost` trae la utilidad `btn-veil` (QC-228). Su regla `:hover` pone
     `color: var(--primary)` y `border-color: var(--primary)`.
   - Su selector (`.btn-veil:hover:not(:disabled)`) es más específico que el
     `hover:text-sidebar-accent-foreground` de la pastilla, y los dos están en la misma capa, así
     que gana el de `btn-veil`.
   - El icono queda en `--primary` (oklch L 0.44) sobre `hover:bg-sidebar-accent` (L 0.34): un
     contraste de alrededor de 1.3:1, prácticamente invisible.
   - Justo cuando el usuario apunta al control para buscarlo, el icono se borra. En oscuro
     (L 0.77 sobre L 0.28) sí se ve.
2. **Pastilla expandida: pierde los colores del panel.** `ghost` trae
   `aria-expanded:bg-muted aria-expanded:text-foreground`, más específicos que `bg-sidebar` y
   `text-sidebar-foreground`. Con el panel expandido (`aria-expanded="true"`), la pastilla sale
   gris claro con el icono oscuro en modo claro. El icono se ve, pero la pastilla deja de leerse
   como parte del panel y, con el puntero encima, cae en la causa 1.
3. **Control del encabezado en escritorio.** Va `md:hidden` por decisión humana del 2026-09-02.
   En escritorio no hay icono en el encabezado porque el control no se muestra (P14).

**Descartado leyendo el código:**
- **Recorte.** Ningún ancestro de la pastilla tiene `overflow` distinto de `visible`
  (`sidebar-container`, `sidebar-inner` y el envoltorio `relative`). La pastilla sobresale 8 px
  del contenedor fijo (`z-10`), por encima del `<main>` (`relative`, `z-index: auto`), así que no
  queda tapada.
- **Tamaño.** `size-3.5` es explícito y la regla `[&_svg:not([class*='size-'])]` del botón no
  la pisa.

**Cambio:**
- **Pastilla** (`app-sidebar.tsx`):
  - el icono pasa a `open ? PanelLeftCloseIcon : PanelLeftOpenIcon`, con el mismo `size-3.5`;
  - en todos los estados, sus colores son los del panel y ganan a `btn-veil` y a los
    `aria-expanded:*` de `ghost` con el modificador `!` de Tailwind. Una declaración importante
    gana a una normal de la misma capa;
  - las clases son `bg-sidebar! text-sidebar-foreground! hover:bg-sidebar-accent!
    hover:text-sidebar-accent-foreground! hover:border-sidebar-ring!`, más
    `aria-expanded:bg-sidebar! aria-expanded:text-sidebar-foreground!`, para que valgan aunque
    `tailwind-merge` deje las dos variantes.
  - El implementer comprueba en el E2E el color calculado en reposo y con el puntero encima.
  - El `scale` al pulsar de QC-228 no se toca.
- **Encabezado** (P13):
  - `components/ui/sidebar.tsx`: `SidebarTrigger` pinta `children ?? <PanelLeftIcon />`;
  - `app/(private)/components/sidebar-toggle.tsx` le pasa
    `isExpanded ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />`. Usa el mismo `isExpanded` que
    ya calcula para `aria-expanded`, así que el icono y el estado anunciado no se pueden separar.
  - En el encabezado el `ghost` hereda `--foreground` sobre `--background`, que ya cumple
    (QC-226 R5). La causa 1 no aplica aquí: `btn-veil` solo actúa con `@media (hover: hover)`, y
    este control solo se ve en viewport angosto, que en la práctica es táctil.
- Lucide ya es dependencia aprobada; `PanelLeftOpen` y `PanelLeftClose` son de su set estándar.
  El implementer confirma los nombres de exportación en `node_modules/lucide-react` antes de
  escribirlos.

**Pruebas:**

| R | Test | Qué afirma |
| --- | --- | --- |
| R38 | E2E, bloque «control de colapso» de `e2e/marca-componentes.spec.ts` | Se mide en claro y oscuro, en Chromium y WebKit: pastilla en viewport ancho (expandido y colapsado, en reposo y con `hover()`), y control del encabezado en viewport angosto (panel cerrado). En cada caso: `svg` visible (`toBeVisible()`), caja de al menos 14 × 14 dentro de la del botón y de la ventana, `document.elementFromPoint` en el centro del icono devuelve el botón o un descendiente, y el contraste entre el `color` calculado del botón y el color de fondo efectivo es de al menos 4.5:1 |
| R39 | E2E, mismo bloque | Clase `lucide-panel-left-open` con el panel colapsado o cerrado y `lucide-panel-left-close` con el panel expandido; tras pulsar el control, cambia |
| R39 | `tests/unit/marca/sidebar-carril.test.ts` | `AppSidebar` con `defaultOpen` `true`/`false` pinta en la pastilla el icono correspondiente; `SidebarToggle` igual; `SidebarTrigger` sin `children` sigue pintando `PanelLeftIcon` |

Para el color de fondo efectivo se usa el `background-color` calculado del botón. Si es
transparente, se sube al primer ancestro que tenga uno. El contraste se calcula en el navegador
con la misma fórmula WCAG de `tests/unit/theme/contraste.ts`, copiada al E2E porque Playwright no
importa código de Vitest. La salida se anota.

**A9 (descartada). Quitar `btn-veil` de la pastilla con otra variante.** Ninguna variante de
`Button` está libre de `btn-veil` salvo `default`, `destructive` y `link`, y las tres traen
colores propios que habría que pisar igual. Crear una variante `sidebar` sería tocar `button.tsx`
para un solo uso.
