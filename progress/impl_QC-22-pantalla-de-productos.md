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

## T8 — Selector de presentacion con alta en linea

**Archivos:** `app/(private)/inventario/components/presentation-select.tsx` (nuevo) y el barrel.

- Carga la primera pagina con `pageSize: MAX_PAGE_SIZE` **importado** de `@/lib/shared/pagination`
  y ofrece «Cargar más» mientras `page < totalPages`, anexando (R24). Sin inventar busqueda: el
  backend no la tiene y QC-20 no se toca.
- **El alta en linea NO es un `<form>`**. El selector vive dentro del formulario de producto y
  anidar formularios es HTML invalido -el navegador desanida el interior y el envio de fuera se
  rompe-. El boton invoca `createPresentationAction` directamente desde el manejador: sigue
  siendo una Server Action, no un `fetch` a una ruta de API propia (R28). Tampoco se abre un
  segundo `sheet` anidado: apilar capas modales es lo que se rompe en iOS.
- Al recibir `{ status: 'success', id }` la presentacion **se anexa, queda seleccionada y el
  sub-formulario se cierra**, sin tocar ningun otro campo del producto (R24).
- `duplicate_name` **si identifica un campo**, asi que se pinta junto al campo del nombre con
  `aria-invalid`/`aria-describedby`, no en la region de error del formulario.
- **R25 verificado con `grep` sobre toda la ruta**: los nombres de la accion de renombrar y la de
  borrar presentaciones **no aparecen en ningun archivo**, ni siquiera dentro de un comentario
  (se reescribio el comentario que las nombraba para que una guardia de fuente no encuentre un
  falso positivo).
- El valor viaja al `FormData` por el `<input>` oculto que el primitivo `select` de Base UI
  monta cuando se le da `name` — sin un campo oculto escrito a mano.
- **R31**: disparador y campo con `min-h-11 min-w-11` y `text-base md:text-base`. Ese
  `md:text-base` es deliberado: el primitivo `input` baja a `text-sm` (14 px) desde `md`, y R31
  exige >= 16 px **sin distinguir por ancho**. Se corrige por clase, sin editar `components/ui/`
  (R29).
- La carga inicial toca el estado **despues** del `await`: `react-hooks/set-state-in-effect`
  prohibe `setState` sincrono dentro de un efecto, y de paso un desmontaje durante la peticion no
  intenta pintar nada.

**Salida real:** `pnpm typecheck` y `pnpm lint`, ambos sin hallazgos.

## T9 — Formulario y panel lateral de alta/edicion

**Archivos:** `product-form.tsx` (nuevo), `product-sheet.tsx` (nuevo), el barrel y
`product-table.tsx` (se le anade la columna de acciones con el disparador de edicion; era la
deuda que T6 dejo anotada).

- `<form action={formAction}>` con campos **no controlados** + `useActionState`, con el literal
  `{ status: 'idle' }`. **Ninguna dependencia nueva**: no se corrio `shadcn add form` ni se
  instalo nada (P2, resuelta el 2026-09-03).
- **Validacion previa con `createProductSchema` importado del barrel** `@/lib/modules/inventario`:
  los mensajes por campo salen de la misma regla que valida el servidor, que revalida igual. Los
  cuatro campos enteros se convierten antes de validar (`FormData` solo entrega cadenas) y una
  cadena no entera es error **de ese campo**, no el unico mensaje generico que devolveria la
  action para los cuatro.
- **R20 tiene dos mitades y las dos estan**: (a) los errores que identifican campo van junto al
  campo con `aria-invalid` + `aria-describedby`; los que no (`invalid_input`, `not_found`,
  `unauthorized` del servidor) van a una region `role="alert"` del formulario. (b) **no se pierde
  lo escrito**: React 19 resetea los campos no controlados de un `<form action>` al completarse la
  action, asi que el estado de fallo **devuelve los valores escritos** y cada campo los recupera
  por `defaultValue`, con la `key` de montaje del mismo patron que `login-form.tsx`. Sin esto, R20
  se cumpliria a medias y ningun typecheck lo habria dicho.
- **R19**: la edicion precarga todos los valores actuales y envia el reemplazo completo
  (`updateProductSchema` **es** `createProductSchema`). El panel monta el formulario solo cuando
  se abre, asi que cada apertura parte de los valores del producto.
- **R21 vive en el panel**: con exito cierra, `toast.success` y `router.refresh()`. Las actions de
  QC-20 no revalidan nada y esta ficha no las abre (`design.md > 10.G`).
- **R23**: `unit` es un `Input` de texto libre, con el comentario escrito de que QC-32 lo
  convertira en selector — retrabajo aceptado a conciencia, no descuido.
- `cost` es `type="text"` con `inputMode="decimal"`, **nunca** `type="number"`: un `number` de
  HTML pasa por el binario de coma flotante y el importe viaja como cadena decimal a proposito.
- **R31**: campos y botones con `min-h-11 min-w-11` y `text-base md:text-base` (16 px en todos los
  anchos). El panel es `w-full` en angosto, con `overflow-y-auto` y
  `pb-[env(safe-area-inset-bottom)]` para que el ultimo control no quede bajo la barra de gestos
  de iOS. Las acciones de fila estan **siempre visibles**: nada de `:hover` como unica via.
- **`grep` sobre toda la ruta**: sin `fetch(`, sin `@/lib/composition`, sin `prisma` y sin el
  nombre de ninguna libreria de formularios (se reescribio el comentario que la nombraba).

**Salida real:** `pnpm typecheck` y `pnpm lint`, ambos sin hallazgos.

## T10 — Dialogo de borrado

**Archivos:** `delete-product-dialog.tsx` (nuevo), el barrel y `product-table.tsx` (la columna de
acciones estrena el disparador de borrado junto al de edicion).

- `alert-dialog` que **nombra el producto** y advierte que la accion no se puede deshacer (R26).
  En base el borrado es logico (`deletedAt`), pero el backend no expone ninguna restauracion: para
  quien lo usa es irreversible y se le dice asi, en vez de prometerle una vuelta atras inexistente.
- **Sin confirmar no se invoca nada**: la operacion sale del `submit` del `<form>` que vive dentro
  del contenido del dialogo, con el `id` en un campo oculto -la forma que `deleteProductAction`
  espera-. El disparador solo abre.
- Con exito: cierra, `toast.success` y `router.refresh()` (R21). Con error, **sigue abierto** con
  el mensaje a la vista: cerrarlo dejaria al usuario creyendo que se borro.
- **El dialogo abierto se DERIVA** de lo que pidio el usuario y del resultado de la operacion, en
  vez de cerrarse con un `setState` dentro de un efecto: `react-hooks/set-state-in-effect` lo
  prohibe (regla activa en el `eslint` del repo) y de paso se ahorra un render.

**Salida real:** `pnpm typecheck` y `pnpm lint`, ambos sin hallazgos.

## T11 — `page.tsx` y seccion de lista

**Archivos:** `app/(private)/inventario/page.tsx` (nuevo),
`app/(private)/inventario/components/product-list-section.tsx` (nuevo), el barrel.

- Server Component con `export const metadata` construida con `BRAND_LABEL` **importado**; lee
  `searchParams`, llama a `parseProductListParams` y monta
  `<Suspense key={`${page}-${pageSize}`} fallback={<ProductTableSkeleton rows={pageSize} />}>`.
  La `key` es lo que hace reaparecer el esqueleto en **cada** cambio de pagina o de tamano, no
  solo en la primera carga (R15).
- El contenedor exterior es un `<div>`: **no se declara `<main>`** (R1). `SidebarInset` del layout
  privado ya es el `<main>` y R5 de QC-11 exige que sea unico.
- La pagina importa **solo desde `./components`** (R27), nunca por ruta profunda. El barrel no
  declara `'use client'`, asi que la pagina sigue siendo Server Component.
- `ProductListSection` es `async`, llama a `listProductsAction` y despacha a los tres estados:
  error / vacio (con la accion de crear como `children`, y con enlace a la primera pagina cuando
  la pedida se quedo atras) / tabla + barra de herramientas.
- El literal `'/inventario'` **no aparece** en ningun archivo de la ruta: el enlace a la primera
  pagina se construye con `INVENTORY_ROUTE` y la barra con `usePathname()`.

**Verificacion de T11 — que se pudo correr aqui y que no:**

- `pnpm exec next typegen` regenerado, para que `tsc` valide de verdad la firma de la nueva
  pagina contra los tipos de ruta de Next 16 (sin esto, el validador seguia sin conocerla).
- `pnpm typecheck` y `pnpm lint`: sin hallazgos.
- **`pnpm exec next build`: verde.** La ruta aparece en la tabla de salida como `ƒ /inventario`
  (dinamica, servida en cada peticion), que es lo correcto: el layout privado lee `cookies()`.
- **`pnpm run build` NO se pudo correr**, y no por el codigo: ese script es
  `prisma migrate deploy && tsx scripts/seed.ts && next build`, y **este worktree no tiene base de
  datos**. Por la misma razon **no se pudo comprobar `/inventario` con sesion de Administrador en
  `pnpm dev`**: sin base no hay usuario con el que iniciar sesion. Queda **pendiente de evidencia
  para el leader**, que si tiene base; T16 (verificacion manual, incluida iOS) cubre esa
  comprobacion y no es de esta tanda.
- **`pnpm run test:guardias`**: `guard-rutas-privadas-cubiertas.test.ts` **ya esta VERDE** — era la
  ventana roja que el propio orden del spec abrio en T3 y que T11 cierra, tal como estaba previsto.

**HALLAZGO BLOQUEANTE que NO es de esta tanda y que se reporta sin tocar nada** (regla 6 y
`design.md > 12.5`, que ordena parar y avisar si la guardia de arquitectura objeta):

`tests/guards/guard-arquitectura-modulos.test.ts` falla con

```
lib/modules/identity/domain/route-role-rules.ts importa '@/lib/shared/routes' de lib/shared (R7)
```

- **Lo introdujo T3** (commit `28ac546`), no esta tanda: el archivo no se ha tocado en T5-T11 y el
  hallazgo depende solo de el. El `design.md > 3` previo la objecion de la guardia sobre el import
  del **barrel de `inventario`** —que la guardia acepta sin problema— pero el que objeta es el otro:
  `domain/**` **no puede importar `lib/shared/**` en absoluto** (R7, pureza del dominio).
- **No se arregla aqui a proposito.** Las salidas posibles —declarar la ruta en `identity`,
  inyectar el prefijo desde fuera del dominio, o mover la lista de reglas fuera de `domain/`— son
  todas **cambio de alcance o de diseño**, y `design.md > 3` dice literalmente que en ese caso
  «se para y se avisa: no se arregla con un literal ni tocando la guardia». **Decision del leader.**
- **No bloquea T5-T11**: ningun archivo de esta tanda participa en el hallazgo.

## T5-T11 — estado de la trazabilidad al cerrar esta tanda (sin adornos)

**Los tests de la pantalla NO son de esta tanda**: los traen T12 (render), T13 (guardias de
fuente y contrato de ruta) y T14 (ruta y rol). Por tanto, y se dice en vez de darlo por cubierto:

| Requisito | Test que lo muerde HOY | Estado |
| --- | --- | --- |
| R3 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` | **Verde y muerde**: borrar `INVENTORY_ROUTE` de `PRIVATE_ROUTE_PREFIXES` -o la `page.tsx`- lo pone rojo nombrando la ruta. Es el que T11 cerraba. |
| R22 | `tests/unit/private-layout.test.tsx` | Verde desde T4 (invertido, no borrado). |
| R1, R5-R21, R23-R27, R31 | **ninguno todavia** | Implementados en T5-T11; **sin test que los muerda hasta T12/T13**. `pnpm exec vitest related --run <archivos de la ruta>` devuelve literalmente «No test files found». |
| R4 | `tests/unit/identity/route-role-rules.test.ts` sigue **rojo** | Es el centinela de QC-9 que **invierte T14**, no esta tanda. |

Quien haga T12/T13 tiene el mapa de `tasks.md` con los nombres previstos; el criterio de que el
test muerda -borrar lo que el requisito exige y ver el rojo- vale especialmente para **R7, R13 y
R25**, que son los tres tests en negativo.

**Comandos corridos en esta tanda (los tres que el gate asigna al `frontend_dev`, y nada mas):**

```
pnpm typecheck                      -> tsc --noEmit, sin errores
pnpm lint                           -> eslint, sin hallazgos
pnpm exec vitest related --run <los 13 archivos de app/(private)/inventario/>
                                    -> No test files found (T12/T13 aun no existen)
pnpm exec vitest run tests/guards/guard-rutas-privadas-cubiertas.test.ts
                                    -> 1 archivo, 7 tests, VERDE (el rojo previsto queda cerrado)
pnpm run test:guardias              -> 11 de 12 verdes; el rojo es el de T3 descrito en T11
pnpm exec next build                -> verde, `/inventario` sale como ruta dinamica
```

**`package.json` y `pnpm-lock.yaml` sin cambios** (`git status` limpio para los dos): ninguna
dependencia entro en esta tanda, ni por CLI ni a mano.

## Ajuste autorizado en `tests/unit/sidebar-mobile.test.tsx` (2026-09-03)

**Archivo:** `tests/unit/sidebar-mobile.test.tsx` (heredado de QC-11, R30). **Autorizado
expresamente por el humano el 2026-09-03**, y **solo** para esto; va en su propio commit para que
se pueda leer solo, porque supera una decision de otra feature.

- **Que fallaba:** la asercion exigia que el **mismo nodo** llevase `data-base-ui-inert` **y**
  `aria-hidden="true"`. Desde que T4 monto la region de avisos, `markOthers` de Base UI calcula
  dos conjuntos distintos: el marcador de inercia excluye solo el popup, mientras que el
  `aria-hidden` excluye ademas **la rama que lleva a cualquier `[aria-live]`**, a proposito, para
  que los toasts se sigan anunciando con un modal abierto. El `aria-hidden` cae entonces en los
  hijos —el `<main>` incluido— y ya no en el contenedor exterior. **Cambio la granularidad del
  marcado, no el resultado**: no es una regresion de accesibilidad.
- **Que se cambio:** la asercion pasa a afirmar el **resultado** —el contenido de detras esta
  marcado como inerte **y** esta oculto al arbol de accesibilidad— en vez de exigir que ambos
  marcadores caigan en el mismo nodo. La fecha y el motivo quedan escritos **dentro del test**,
  igual que se hizo al invertir el test de `private-layout`. La linea 172 original
  (`queryByRole('main')` nulo), que es la que de verdad protege R30, se conserva intacta.
- **Comprobado que sigue mordiendo:** con `modal={false}` en el `<Sheet>` de
  `components/ui/sidebar.tsx` (cambio temporal, revertido con `git checkout` en el acto) el test
  se pone **rojo** en la asercion de inercia. Si el contenido dejara de ocultarse, enrojece.
- **Salida:** `pnpm exec vitest run --project ui tests/unit/sidebar-mobile.test.tsx` -> 7 tests,
  **verde**.

## T12 — Tests de la pantalla (render)

**Archivos (nuevos):** `tests/unit/inventario/product-page.test.tsx` (25 tests, proyecto `ui`),
`tests/unit/inventario/product-list-params.test.ts` (8 tests, proyecto `node`).

- **La pantalla se monta DENTRO del layout privado**, igual que en produccion, reutilizando el
  patron de mocks de `tests/unit/private-layout.test.tsx` (`next/headers`, `next/navigation`,
  `@/lib/composition`) y el helper `tests/helpers/viewport.ts`.
- **Las seis Server Actions estan sustituidas por dobles.** Son el borde del modulo `inventario`
  (QC-20, `done`, que esta ficha no abre) y es lo unico que permite ejercitar los tres estados de
  la lista y un guardado rechazado sin base de datos.
- **Hallazgo del entorno, anotado porque condiciona el diseno del test:** `react-dom` en jsdom
  **no sabe ejecutar un componente `async`** —queda suspendido para siempre—, asi que
  `ProductListSection` se resuelve antes de entregar el arbol al renderer (`resolverServerComponents`).
  El arbol que se renderiza sigue siendo el REAL de `page.tsx`: la `<Suspense>`, su `key` y su
  `fallback` son los que declara la pagina. **El test de R15 se apoya en lo contrario**: renderiza
  el arbol SIN resolver, la seccion queda suspendida y `<Suspense>` pinta su `fallback`. Es la
  unica forma honesta de observar el estado de carga sin escribirlo a mano.
- Interacciones con `@testing-library/user-event`, nunca `fireEvent`. Asserts sobre roles ARIA,
  `data-testid` y constantes exportadas; el unico texto que aparece es **dato del fixture** (el
  nombre de un producto, el mensaje que devuelve una action), nunca copy de la pantalla.
- El parser se prueba **sin DOM** (proyecto `node`): R12 no depende de que nada se renderice.

### Que muerde cada test (comprobado rompiendo el codigo, no razonado)

Se aplicaron mutaciones reales sobre `app/(private)/inventario/**`, se corrio la suite y se
revirtieron con `git checkout` (arbol limpio despues, comprobado con `git status`):

| Mutacion introducida | Test que se puso ROJO |
| --- | --- |
| La pagina declara su propio `main` | R1 |
| Se cae la columna `qtyAlert` de `PRODUCT_COLUMNS` | R6 |
| La columna `name` pinta ademas `createdBy` | R7 |
| `overflow-x-auto` sube al contenedor de la pagina | R9 |
| `pageSize` por defecto pasa de 10 a 25 | R10 y los cuatro de R12 |
| «Siguiente» no avanza; los extremos dejan de desactivarse | los dos de R11 |
| Se cuela un `input[type=search]` en la barra | R13 |
| La lista vacia se pinta como tabla sin filas | R14 (y el de «pagina que se quedo atras») |
| El `<Suspense>` se queda sin `fallback` | R15 |
| El estado de error deja de mostrar el `code` | R16 y R5 |
| Abrir el panel navega (`router.push`) | R17 |
| La edicion deja de precargar `unit` | R19 |
| El estado de fallo deja de devolver lo escrito | las dos mitades de R20 |
| Se quita `router.refresh()` tras el exito | R21 |
| `unit` pasa a campo numerico | R23 |
| La presentacion creada deja de quedar seleccionada | R24 |
| El campo oculto del borrado pierde el `id` | R26 |

**Un hueco que NO se tapa con adorno y se declara:** la mitad de R31 que dice «nada de `:hover`
como unica via» **no se puede observar en jsdom**. Se comprobo: escondiendo las acciones de fila
con `hidden hover:flex`, `toBeVisible()` sigue pasando, porque jsdom no aplica las hojas de estilo
de Tailwind. Ese medio requisito lo muerde la guardia de fuente de **T13**, no este archivo. Lo que
T12 si cubre de R31 es que la lista y sus acciones se presentan en viewport angosto **y** ancho.

**Salida real:**
```
pnpm typecheck  -> tsc --noEmit, sin errores
pnpm lint       -> eslint, sin hallazgos
pnpm exec vitest related --run tests/unit/inventario/product-page.test.tsx   tests/unit/inventario/product-list-params.test.ts
  -> Test Files  2 passed (2)   ·   Tests  33 passed (33)
```

## T13 — Guardias de fuente y contrato de ruta

**Archivo (nuevo):** `tests/unit/inventario/product-route-contract.test.ts` (17 tests, proyecto
`node`). Mismo patron que `tests/unit/dashboard-route-contract.test.ts`: **guardias de codigo, sin
DOM**.

- Todo lo que la ficha promete **no hacer** —incrustar la ruta, repetir la autorizacion, llamar a
  una ruta de API propia, ofrecer la gestion de presentaciones, esconder una accion tras el
  puntero, duplicar el armazon heredado— es **invisible renderizando**. Sin este archivo, esas
  promesas no tienen quien las vigile.
- La carpeta de la ruta se **deriva de `INVENTORY_ROUTE`**, no se escribe: `app/(private)` +
  la constante. Y el barrido del literal `'/inventario'` recorre `app/`, `components/`, `lib/` y
  `hooks/` enteros, con `lib/shared/routes.ts` como unica excepcion.
- **Dos matices que se dejan escritos porque una guardia ciega habria muerto al primer cambio:**
  1. **R7** prohibe *leer o declarar como columna* `createdBy`/`updatedBy` (`.createdBy`,
     `key: 'createdBy'`, …), no *nombrarlos*: `product-columns.ts` los nombra justamente para
     **excluirlos** del tipo `ProductColumnKey`, y esa exclusion es una defensa, no una fuga. El
     test ademas afirma que la exclusion sigue en pie.
  2. **R25** se comprueba sobre la fuente **cruda, comentarios incluidos**: los nombres de las dos
     acciones de presentacion prohibidas no aparecen ni en un comentario.
- **R31 aterriza aqui la mitad que jsdom no puede observar** (ver T12): sin hojas de estilo, un
  control escondido con `hidden hover:flex` sigue pasando un `toBeVisible()`. La guardia mira la
  fuente: nada de `100vh`, ninguna linea que combine `hover:`/`group-hover:` con una utilidad que
  oculte, `min-h-11` obligatorio en todo archivo que renderice un control y `text-base` en todo
  archivo con campos.
- **R29** se comprueba en tres frentes: existen las cuatro primitivas usadas, la ruta **no
  reescribe a mano** ninguna (`<table`, `<dialog`, `role="dialog"`, `createPortal` prohibidos) y
  `package.json` **no** trae las dos dependencias descartadas el 2026-09-03.
- **R32** no se vigila como «no tocar nada» sino como **no re-crear**: la ruta no declara `main`,
  ni `SidebarProvider`/`SidebarInset`/`AppSidebar`, ni su propio layout; y sigue habiendo **un
  solo** layout privado y **un solo** declarante de `PRIVATE_NAV_ITEMS`.

### Que muerde cada guardia (comprobado rompiendo el codigo, no razonado)

Mutaciones reales sobre la ruta (y una sobre `lib/shared/routes.ts`), revertidas con
`git checkout`; arbol limpio despues, comprobado con `git status`:

| Mutacion introducida | Guardia que se puso ROJA |
| --- | --- |
| La barra construye la URL con el literal `'/inventario'` | R2 (literal) |
| `PRIVATE_ROUTE_PREFIXES` pierde `INVENTORY_ROUTE` | R2/R3 (sidebar y prefijo) |
| `page.tsx` importa `requireAdmin` | R5 |
| La tabla pinta `product.createdBy` | R7 |
| El costo pasa por `Number(...)` | R8 |
| La seccion de lista declara `overflow-x-scroll` | R9 |
| Se cuela un `input[type=search]` | R13 |
| El formulario deja de importar las actions del catalogo | R18 |
| El formulario hace `fetch('/api/productos')` | R28 |
| La pagina monta su propio `<Toaster />` | R22 |
| El selector importa la accion de borrar presentaciones | R25 |
| La pagina importa por ruta profunda (`./components/index`) | R27 |
| El esqueleto escribe un `<table` a mano | R29 |
| Un componente de cliente importa `@/lib/composition` | R30 |
| Las acciones de fila se esconden con `hidden hover:flex` | R31 |
| La pagina declara su propio `<main>` | R32 |

**Salida real (T13):**
```
pnpm typecheck  -> tsc --noEmit, sin errores
pnpm lint       -> eslint, sin hallazgos
pnpm exec vitest run --project node tests/unit/inventario/product-route-contract.test.ts
  -> Test Files  1 passed (1)   ·   Tests  17 passed (17)
```

## Cierre de la tanda T12 + T13

```
pnpm exec vitest related --run tests/unit/inventario/product-page.test.tsx   tests/unit/inventario/product-list-params.test.ts   tests/unit/inventario/product-route-contract.test.ts   tests/unit/sidebar-mobile.test.tsx
  -> Test Files  4 passed (4)   ·   Tests  57 passed (57)
```

**Estado de la trazabilidad tras esta tanda** (lo que queda abierto se dice, no se da por cubierto):

| Requisito | Test que lo muerde HOY |
| --- | --- |
| R1, R6-R17, R19-R21, R23, R24, R26 | `tests/unit/inventario/product-page.test.tsx` (+ `product-list-params.test.ts` para R10/R12) |
| R2, R5, R7, R8, R9, R13, R18, R22, R25, R27, R28, R29, R30, R31, R32 | `tests/unit/inventario/product-route-contract.test.ts` |
| R3 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` (verde desde T11) |
| R22 | tambien `tests/unit/private-layout.test.tsx` (invertido en T4) |
| **R4** | **sigue sin test: lo trae T14**, que ademas invierte el centinela de QC-9 |

**No se toco nada fuera de alcance.** Sigue en pie el hallazgo bloqueante de T3
(`guard-arquitectura-modulos.test.ts`: `route-role-rules.ts` importa `@/lib/shared/routes` desde
`domain/`), que es **decision del leader** y no se ha tocado. `package.json` y `pnpm-lock.yaml`,
sin cambios.

---

## Correccion de T3 — la lista de reglas ruta→rol sale del dominio (2026-09-03)

`tests/guards/guard-arquitectura-modulos.test.ts` estaba en ROJO por lo que introdujo T3:

```
lib/modules/identity/domain/route-role-rules.ts importa '@/lib/shared/routes' de lib/shared (R7)
```

**Salida elegida por el humano** (no se reabrio ni se propuso otra): la LISTA concreta de reglas
es configuracion, no dominio, y se muda al adaptador driving. El tipo `RouteRoleRule` y la
funcion `findRouteRule` se quedan en `domain/`, que es donde se decide QUE regla gana.

| Archivo | Que le paso |
| --- | --- |
| `lib/modules/identity/adapters/driving/route-role-rules.ts` | **nuevo**: aqui vive `ROUTE_ROLE_RULES`, con `INVENTORY_ROUTE` de `lib/shared/routes` y `ADMIN_ROLE_NAME` del barrel de `inventario`. La fila driving de la tabla permite ambos. |
| `lib/modules/identity/domain/route-role-rules.ts` | pierde los dos imports y la constante; conserva el tipo, `matchesPrefix` y `findRouteRule`, y deja escrito por que la lista ya no esta ahi. |
| `lib/modules/identity/index.ts` | el barrel deja de reexportar `ROUTE_ROLE_RULES` (ya no sale de `./domain`) y sigue exportando `findRouteRule` y `RouteRoleRule`. |
| `lib/modules/identity/adapters/driving/route-guard-middleware.ts` | toma `ROUTE_ROLE_RULES` de su propia carpeta (`./route-role-rules`); el resto del archivo, intacto. |
| `tests/unit/identity/route-guard-middleware.test.ts` | la caja mutable con getter **sigue viva**: el doble se pone ahora sobre `.../adapters/driving/route-role-rules` en vez de sobre el barrel. |

Por que fue barato, y esta comprobado en el codigo antes de tocarlo: `findRouteRule(rules, ...)`
ya recibia las reglas por parametro, `decideRouteAccess` ya las recibia en su input y el UNICO
consumidor de la constante era el middleware. La arquitectura de QC-9 ya estaba preparada; la
constante estaba en el sitio equivocado.

**Nada declara `/inventario` como literal ni como constante propia dentro de `identity`**: sigue
habiendo una sola constante por ruta (`lib/shared/routes.ts`), y un test nuevo lo muerde.

```
pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts
  antes -> Tests  1 failed | 55 passed (56)
  ahora -> Test Files  1 passed (1)   ·   Tests  56 passed (56)
```

**Deuda menor que NO se toco por estar fuera de los archivos de esta tarea:**
`lib/modules/identity/domain/route-access.ts:37` sigue diciendo en un comentario que
`ROUTE_ROLE_RULES` «esta vacio a proposito (R12)». Ya no es cierto ni por el contenido ni por la
ubicacion. Se reporta al leader en vez de corregirlo por cuenta propia.

