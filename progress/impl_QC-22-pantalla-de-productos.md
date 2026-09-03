# QC-22 — pantalla-de-productos · bitácora de implementación

> Worktree: `.worktrees/QC-22-pantalla-de-productos/` · Rama `feature/QC-22-pantalla-de-productos`
> Spec aprobado por el humano el 2026-09-03 (F1.4). P2 **resuelta: no entra ninguna dependencia nueva.**

## T0 — Verificación de la base heredada (los ocho puntos)

| # | Punto | Evidencia comprobada en el worktree |
| --- | --- | --- |
| 1 | Layout privado con `SidebarProvider` + `SidebarInset`, y `SidebarInset` **es** el `<main>` | `app/(private)/layout.tsx` lo monta y su comentario lo dice explícitamente («`SidebarInset` **es** el `<main>` … aquí no se anida otro»). **No se crea otro layout ni otro `main`.** |
| 2 | `components/private/app-sidebar.tsx` y `lib/shared/navigation/private-nav.ts` con `PRIVATE_NAV_ITEMS`, `BRAND_LABEL` e `INVENTORY_ROUTE` | `private-nav.ts` declara `INVENTORY_ROUTE = '/inventario'`, `BRAND_LABEL`, `PRIVATE_NAV_ITEMS` (el ítem `nav-inventario` ya apunta a la constante). **El sidebar no se re-crea.** |
| 3 | Base de shadcn/ui | `components.json` y `lib/utils.ts` presentes. `components/ui/`: `avatar, badge, button, card, collapsible, dropdown-menu, input, label, separator, sheet, sidebar, skeleton, sonner, tooltip`. **`sheet` y `sonner` YA EXISTEN: no se vuelven a añadir.** Ausentes: `table`, `select`, `alert-dialog` (los añade T2). |
| 4 | Vitest configurado y helper de viewport | `vitest.config.mts` y `tests/helpers/viewport.ts` presentes. **No se monta Vitest.** |
| 5 | Playwright montado | `playwright.config.ts` y `e2e/` con 4 specs (`login`, `login-skin`, `session`, `theme`). **No se monta Playwright.** |
| 6 | Contrato público de `inventario` y las Server Actions | `lib/modules/inventario/index.ts` (solo reexporta de `./domain`); `adapters/driving/product-actions.ts` y `presentation-actions.ts` con `CreateProductFormState`, `ProductMutationFormState`, `ProductListResult`. **El backend no se toca ni se amplía.** |
| 7 | `pagination.ts`, `routes.ts`, `route-role-rules.ts` | `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25`, `toOffsetLimit` acota; `PRIVATE_ROUTE_PREFIXES = ['/dashboard']`; `ROUTE_ROLE_RULES = []` (vacío a propósito, con el encargo escrito de que la primera regla es esta pantalla). |
| 8 | **NO existe `app/(private)/inventario/`** | `ls app/(private)/` → `components`, `dashboard`, `layout.tsx`. Confirmado: la carpeta no existe. |

**Resultado: los ocho puntos verdes.** Nada que re-crear; solo la pantalla.

## T1 — Contrato consumido (anotado, no supuesto)

### (a) Firma exacta de las seis actions que se usan

```
// lib/modules/inventario/adapters/driving/product-actions.ts  ('use server')
createProductAction(prevState: CreateProductFormState, formData: FormData): Promise<CreateProductFormState>
updateProductAction(id: string, prevState: ProductMutationFormState, formData: FormData): Promise<ProductMutationFormState>
deleteProductAction(prevState: ProductMutationFormState, formData: FormData): Promise<ProductMutationFormState>   // `id` en campo oculto
listProductsAction(query: unknown): Promise<ProductListResult>

// lib/modules/inventario/adapters/driving/presentation-actions.ts  ('use server')
createPresentationAction(prevState: CreatePresentationFormState, formData: FormData): Promise<CreatePresentationFormState>
listPresentationsAction(query: unknown): Promise<PresentationListResult>
```

Estados: `{ status: 'idle' } | { status: 'success'; id } | { status: 'error'; code; message }` para las altas;
sin `id` en `success` para edición y borrado. `ProductListResult` = `{ status: 'success'; data: Page<ProductView> } | { status:'error'; code; message }`.

`updateProductAction` se consume con `.bind(null, id)` para encajar en `useActionState`.

### (b) No exportan `INITIAL_STATE`

Confirmado por lectura: `product-actions.ts` deja el comentario de por qué («un archivo con `'use server'` solo
puede exportar funciones async»). El consumidor construye el literal `{ status: 'idle' }` **tipado** con el tipo
exportado. Esta feature lo hace así; no añade ningún archivo al módulo.

### (c) Ninguna llama a `revalidatePath`/`revalidateTag`

Confirmado por lectura de los dos archivos de `adapters/driving/`. Por tanto el refresco tras mutar es de la
pantalla: `router.refresh()` (`design.md > 4.4`). QC-20 está `done` y **no se toca** (`design.md > 10.G`).

### (d) Campos de `ProductView` y cuáles quedan fuera de la tabla

`ProductView`: `id, name, presentationId, presentationName, stock, cost, minPurchase, deliveryTime, qtyAlert,
unit, createdAt, updatedAt, createdBy, updatedBy`.

**Fuera de la tabla (R7):** `id`, `presentationId`, `createdBy`, `updatedBy`. Las diez columnas de negocio son
`name, presentationName, stock, unit, cost, minPurchase, deliveryTime, qtyAlert, createdAt, updatedAt`.
`cost` es **cadena decimal** (`string | null`) y se pinta tal cual (R8): nada de `Number(...)` ni `parseFloat`.

**Nada difiere de `design.md > 0`.** No hay que parar.

## T2 — Primitivas por CLI (`table`, `select`, `alert-dialog`)

Comando exacto: `pnpm dlx shadcn@latest add table select alert-dialog --yes`.
Salida: creó `components/ui/table.tsx`, `components/ui/select.tsx`, `components/ui/alert-dialog.tsx`
y **omitió** `components/ui/button.tsx` («files might be identical») — no se sobrescribió nada existente.

**`sheet` NO se añadió** (ya existía desde QC-11). **`form` NO se añadió**: arrastra `react-hook-form` y
`@hookform/resolvers`, y P2 quedó resuelta el 2026-09-03 en que **no entra ninguna dependencia nueva**.

**Verificación obligatoria de `package.json` (regla 7):** se copió `package.json` antes de ejecutar el CLI y
se comparó después con `diff`. Resultado: **idéntico, cero entradas nuevas**. `pnpm-lock.yaml` tampoco aparece
en `git status`. Diff completo del CLI = los tres archivos nuevos de `components/ui/` y nada más.
Ningún archivo de `components/ui/` se ha editado a mano (R29).

**Preparación del worktree (no es cambio de código, se anota para el gate):** el worktree venía sin
`node_modules`. Se corrió `pnpm install` (respetando `pnpm-lock.yaml`, sin cambios), `pnpm exec prisma generate`
(el cliente Prisma no se genera solo: pnpm ignora los build scripts) y `pnpm exec next typegen` (sin él,
`app/layout.tsx` no encuentra el tipo global `LayoutProps` que genera Next 16). Los tres son artefactos
locales, ninguno versionado.

**Salida real:**
```
pnpm run typecheck   -> tsc --noEmit ... (sin errores)
pnpm run lint        -> eslint ... (sin hallazgos)
```

## T3 — Constante única, prefijo privado y primera regla ruta→rol

**Archivos:** `lib/shared/routes.ts`, `lib/shared/navigation/private-nav.ts`,
`lib/modules/identity/domain/route-role-rules.ts` (los tres, autorizados por R32).

- `INVENTORY_ROUTE` **se mudó** a `lib/shared/routes.ts` con el motivo escrito: el middleware y
  `route-role-rules.ts` la necesitan y no pueden depender de la navegación (`design.md > 2`).
- `private-nav.ts` la **importa** de `../routes` y la **reexporta** (`export { INVENTORY_ROUTE }`).
  La reexportación no es un adorno: `tests/unit/app-sidebar.test.tsx:10` (heredado de QC-11) la
  importa de `private-nav` y no está entre los archivos que esta ficha puede tocar. No hay dos
  constantes: hay una sola declaración y un alias.
- `PRIVATE_ROUTE_PREFIXES = [DASHBOARD_ROUTE, INVENTORY_ROUTE]` — el literal `'/dashboard'` que
  quedaba suelto también pasa a la constante, así que ya no hay ninguno.
- `ROUTE_ROLE_RULES` estrena su primera fila `{ prefix: INVENTORY_ROUTE, roles: [ADMIN_ROLE_NAME] }`,
  con `ADMIN_ROLE_NAME` del **barrel** `@/lib/modules/inventario` (nunca ruta profunda, nunca el
  literal `'Administrador'`). El comentario de «está vacío a propósito» se reescribe: se conserva el
  encargo de QC-9 y se deja escrito que **esta ficha es la que lo cumple**.
- `grep` de `'/inventario'`: aparece **solo** en `lib/shared/routes.ts`.

**Dos tests rojos que T3 provoca y que NO puede cerrar por sí sola** (ninguno de los dos archivos
está autorizado por R32; se reportan al leader en vez de tocarlos):

1. `tests/guards/guard-rutas-privadas-cubiertas.test.ts` → «ningun prefijo declarado sobra».
   `INVENTORY_ROUTE` ya está en `PRIVATE_ROUTE_PREFIXES` pero `app/(private)/inventario/page.tsx`
   todavía no existe (es **T11**). `design.md > 12.3` previó esta guardia **en la otra dirección**
   (página sin prefijo) y por eso puso T3 antes que la página; la guardia es **bidireccional**, así
   que el orden del spec deja necesariamente una ventana roja entre T3 y T11. **Se cierra sola con
   T11**, sin tocar nada.
2. `tests/unit/identity/route-role-rules.test.ts:57` → «esta vacio a proposito: QC-9 construye el
   gancho, no declara reglas». Es el test-centinela que QC-9 dejó escrito para que nadie añadiera
   una fila «sin ficha que la respalde»: QC-22 **es** esa ficha. Invertirlo es trabajo de **T14**,
   que depende de T3, no de T3.

## T4 — Región de avisos en el layout privado, con el test de QC-11 invertido

**Archivos:** `app/(private)/layout.tsx`, `tests/unit/private-layout.test.tsx`.

- El layout monta `<Toaster richColors />` de `@/components/ui/sonner`, **dentro** de
  `SidebarProvider` y **hermano** de `SidebarInset`, para que ningún toast quede dentro del
  `<main>`. No se promueve al root layout (`design.md > 9`).
- **R36/D9 de QC-11 queda superada por R22 de QC-22, decisión humana del 2026-09-03.** La fecha y
  el motivo están escritos **en los dos sitios**: en el comentario del layout y dentro del propio
  test, para que nadie lo lea como una regresión.
- El test `el layout privado no monta ninguna region de notificaciones` **se invierte, no se borra**:
  pasa a afirmar que hay **exactamente una** región de avisos, que sigue habiendo **un solo**
  `<main>`, que la región **no** está dentro del `<main>` y que no aparece ningún otro landmark
  (`status`, `alert`, `log`). La guardia de código también se invierte: ahora exige que el layout
  importe `@/components/ui/sonner` y renderice `<Toaster`. Verde.

**Hallazgo que T4 provoca y que NO puede cerrar** (archivo no autorizado por R32; se reporta):

`tests/unit/sidebar-mobile.test.tsx:171` (R30 de QC-11) se pone **rojo**, y no es un fallo de
accesibilidad. `markOthers` de Base UI
(`@base-ui/react/floating-ui-react/utils/markOthers.mjs`) calcula dos conjuntos distintos: el
marcador `data-base-ui-inert` excluye solo el popup, mientras que el `aria-hidden` excluye además
**la rama que lleva a cualquier `[aria-live]`**, justo para que los toasts se sigan anunciando con
un modal abierto. Desde que existe la región de avisos, el `aria-hidden` deja de caer en el
contenedor exterior y cae en sus hijos —**el `<main>` incluido**, que es lo que R30 protege—,
mientras que el contenedor conserva solo el marcador. El test hace
`toggle.closest('[data-base-ui-inert]')` y exige que **ese mismo nodo** tenga `aria-hidden`: la
suposición que se rompe es la granularidad del marcado, no la inercia.

**No depende de dónde se ponga el `<Toaster />`**: se comprobó dentro y fuera de `SidebarProvider`
y falla igual; sin `<Toaster />` pasa. Cualquier región `aria-live` en el layout privado produce el
mismo efecto, así que no hay colocación que lo evite. Arreglarlo es cambiar la aserción (afirmar la
inercia sobre el `<main>` o sobre el ancestro que sí lleva `aria-hidden`), y ese archivo **no está
entre los que R32 autoriza**: decisión del leader.

**Salida real (T3 + T4):**
```
pnpm typecheck  -> tsc --noEmit ... sin errores
pnpm lint       -> eslint ... sin hallazgos
pnpm exec vitest related --run lib/shared/routes.ts lib/shared/navigation/private-nav.ts \
  lib/modules/identity/domain/route-role-rules.ts "app/(private)/layout.tsx" \
  tests/unit/private-layout.test.tsx   (proyectos ui + node)
  -> Test Files  3 failed | 25 passed (28)
     Tests       3 failed | 285 passed (288)
```
Los tres rojos son los tres descritos arriba, todos en archivos ajenos a los que R32 autoriza:
`guard-rutas-privadas-cubiertas.test.ts` (lo cierra T11), `route-role-rules.test.ts` (lo cierra
T14) y `sidebar-mobile.test.tsx` (**decisión pendiente del leader**). Los proyectos de integración
quedan fuera de esta medición: fallan por no haber base de datos en el worktree, y ya fallaban
antes de tocar nada (se comprobó con `git stash`).

## T5 — Parser de parametros de lista

**Archivos:** `app/(private)/inventario/components/product-list-params.ts` (nuevo),
`app/(private)/inventario/components/index.ts` (nuevo, barrel de la ruta).

- `parseProductListParams` es **puro**: sus unicos imports son `DEFAULT_PAGE_SIZE` y
  `MAX_PAGE_SIZE` de `@/lib/shared/pagination`. No importa `react` ni `next/*` (comprobado con
  `grep`), asi que R12 se puede probar sin montar la pantalla.
- `PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE] as const` — las dos opciones (10 y 25)
  salen de las constantes del backend, **no escritas a mano**; el tipo `ProductPageSize` es
  `10 | 25` derivado de esa tupla, asi que un tamano fuera de la lista no compila.
- `page`: se valida el **texto** con `/^\d+$/` antes de convertir. `Number('1.5')`, `' 2 '`,
  `'1e3'` y `'0x2'` convierten a numero sin ser lo que el usuario escribio en una URL; con la
  comprobacion sobre el texto, todos caen al defecto 1.
- Se anaden dos utilidades que consumen T6/T7/T11 y que evitan literales repetidos:
  `PAGE_PARAM`/`PAGE_SIZE_PARAM` y `buildProductListQuery` (la cadena de consulta canonica, la
  misma forma que el parser sabe leer).

**Salida real:** `pnpm typecheck` y `pnpm lint`, ambos sin hallazgos.

## T6 — Columnas, tabla, esqueleto, vacio y error

**Archivos (todos nuevos, bajo `app/(private)/inventario/components/`):** `product-columns.ts`,
`product-table.tsx`, `product-table-skeleton.tsx`, `product-list-empty.tsx`,
`product-list-error.tsx`, y el barrel `index.ts`.

- **Columnas como datos** (`PRODUCT_COLUMNS`): `key`, `label`, `testId`, `align` y `value`, una
  funcion pura que devuelve la cadena de la celda. La tabla **no formatea nada**; el test de
  R6/R7 puede iterar la declaracion en vez de listar diez literales.
- **R7 gana una defensa de tipos**: `ProductColumnKey = Exclude<keyof ProductView, 'id' |
  'presentationId' | 'createdBy' | 'updatedBy'>`. Escribir `key: 'createdBy'` **no compila**. El
  test en negativo sigue haciendo falta y no se sustituye por esto.
- **R8**: `cost` se pinta con `product.cost ?? EMPTY_CELL`. Ni `Number(`, ni `parseFloat(`, ni
  aritmetica. (`grep` encuentra un unico `Number(` en toda la ruta, en
  `product-list-params.ts:64`, y es sobre el **numero de pagina** de la URL, nunca sobre `cost`.)
- **Fechas deterministas**: `toISOString().slice(0, 10)` y **no** `toLocaleDateString`. El Server
  Component y el navegador tienen huso y local distintos; formatear con el del entorno produce
  una discrepancia de hidratacion que nadie relaciona con la tabla.
- **R9 lo cumple el primitivo**: `components/ui/table.tsx` ya envuelve el `<table>` en un
  `div[data-slot=table-container]` con `overflow-x-auto`. No se anade otro envoltorio ni se
  edita el primitivo (R29). Ningun archivo de la ruta declara `100vh` ni scroll horizontal en un
  ancestro. Sin columna pegajosa (`position: sticky` horizontal se comporta distinto en WebKit).
- **La tabla y el esqueleto NO son componentes de cliente**: no tienen estado ni manejadores y
  reciben los datos por props (R30). Cada accion de fila sera un componente de cliente
  independiente con su propio disparador (T9, T10), asi que la tabla no coordina nada.
- **El estado vacio recibe la accion de crear como `children`** en vez de importar el panel
  lateral: asi no conoce a T9 y sigue sin frontera de cliente. Cuando la pagina pedida se quedo
  atras (`page > 1` sin elementos) muestra ademas el enlace a la primera pagina.
- **El estado de error** es `role="alert"`, muestra mensaje **y** `code`, y reintenta con
  `router.refresh()` -no con un enlace a la misma URL, que no vuelve a pedir nada-. Es tambien
  donde aterriza R5: un `unauthorized` se presenta como error y no se muestra ni un dato.

**Desviacion anotada (menor, de orden):** la columna de acciones de fila **no** entra en T6:
la anaden T9 (editar) y T10 (borrar), que son quienes crean esos componentes. T6 deja la tabla
compilando y probada sin ellos en vez de crear un archivo muerto.

**Salida real:** `pnpm typecheck` y `pnpm lint`, ambos sin hallazgos.
`grep -rn "100vh\|parseFloat(\|hover:"` sobre `app/(private)/inventario/`: solo aparece dentro de
un comentario que explica por que no se usan.

## T7 — Barra de herramientas: tamano de pagina y paginacion

**Archivos:** `app/(private)/inventario/components/product-list-toolbar.tsx` (nuevo) y el barrel.

- Selector con **exactamente dos opciones** (R10), recorriendo `PAGE_SIZE_OPTIONS` -que sale de
  `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE`-, y controles anterior/siguiente con el indicador
  «Página X de Y» (R11), desactivados en los extremos.
- **Ningun control guarda estado local**: los dos NAVEGAN reescribiendo la cadena de consulta
  (`router.push`), y el Server Component vuelve a pedir los datos. Recargar o volver con «atras»
  conserva la pagina (lo que R17 necesita al cerrar el panel).
- **La URL no se escribe a mano**: el camino sale de `usePathname()` y la consulta de
  `buildProductListQuery`. El literal `'/inventario'` no aparece en el archivo (R2).
- **Desviacion anotada frente a T7 (menor, deliberada):** el componente **no** usa
  `useSearchParams()`. Los dos unicos parametros llegan ya parseados por props desde el servidor,
  y el hook obligaria a envolver la barra en un `<Suspense>` propio solo para releer lo que ya
  tiene. El efecto -navegar cambiando la cadena de consulta, nunca estado local- es el que T7
  pide.
- Cambiar el tamano vuelve a la **primera** pagina: con 25 por pagina, la «pagina 7» que se veia
  con 10 puede no existir, y el usuario acabaria en un vacio que no ha provocado.
- **R31**: disparador del selector y los dos botones con `min-h-11 min-w-11` (los primitivos
  miden 32 px de alto). Los botones tienen `aria-label` y el indicador es `role="status"`.
- El primitivo `select` de Base UI admite deseleccionar (`value: null`); este selector no ofrece
  esa opcion, asi que un `null` se ignora en vez de navegar a un tamano invalido.

**Salida real:** `pnpm typecheck` y `pnpm lint`, ambos sin hallazgos.
