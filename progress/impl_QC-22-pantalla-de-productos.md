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

---

## T14 — Tests de proteccion de ruta y rol (R3, R4)

**Archivos:** `tests/unit/identity/route-access.test.ts` (ampliado),
`tests/unit/identity/route-role-rules.test.ts` (centinela de QC-9 INVERTIDO).

R4 era el unico requisito de la ficha sin ningun test que lo mordiera. Ahora lo muerden dos
archivos, y por caminos distintos: uno mira la LISTA declarada, el otro mira la DECISION que sale
de ella.

- **El centinela de QC-9 se invierte, no se borra** (`route-role-rules.test.ts`). Afirmaba que la
  lista estaba «vacia a proposito (D8)», con el encargo escrito de que «la primera regla sera la
  pantalla de productos, solo Administrador». Esa premisa dejo de ser cierta con esta ficha, asi
  que el bloque pasa a exigir que la unica fila sea exactamente la declarada —con la fecha
  (2026-09-03) y el motivo escritos dentro del test—. Sigue cazando lo mismo que cazaba: una
  segunda regla sin ficha que la respalde lo pone rojo.
- **Un bloque con las constantes REALES** (`route-access.test.ts`). Los bloques de QC-9 usan
  prefijos y reglas sinteticos a proposito, porque lo que ejercitan es la politica; con reglas
  sinteticas, sacar `/inventario` de `PRIVATE_ROUTE_PREFIXES` no pondria rojo ningun test. El
  bloque nuevo entra con `PRIVATE_ROUTE_PREFIXES` y `ROUTE_ROLE_RULES` de verdad.
- El middleware sigue probado con reglas sinteticas: lo suyo es la TRADUCCION
  `NextRequest` -> decision -> `NextResponse`, no el contenido de la lista.

### Mapa `R<n> -> test` de esta tanda

| Req | Test | Archivo |
| --- | --- | --- |
| R3 | `sin sesion redirige al login con la ruta pedida como destino de vuelta (R3)` + `sin sesion tampoco se sirve lo que cuelga de la ruta (R3)` | `tests/unit/identity/route-access.test.ts` |
| R4 | `deja pasar al Administrador (R4)`, `a un rol distinto de Administrador lo saca al dashboard, no al login (R4)`, `no corta al Operador en las rutas privadas que no tienen regla (R4)` | `tests/unit/identity/route-access.test.ts` |
| R4 | `declara exactamente una regla: la pantalla de inventario, solo Administrador (R4)` + `la regla se aplica a la ruta de inventario y a lo que cuelgue de ella (R4)` | `tests/unit/identity/route-role-rules.test.ts` |
| R2 (refuerzo) | `la fila se deriva de INVENTORY_ROUTE y de ADMIN_ROLE_NAME, no de literales propios` | `tests/unit/identity/route-role-rules.test.ts` |

### Que mordio cada test (comprobado rompiendo el codigo, no razonado)

Mutaciones reales, revertidas con `git checkout` / restauracion desde copia; arbol limpio
despues, comprobado con `git status`:

| Mutacion introducida | Tests que se pusieron ROJOS |
| --- | --- |
| `PRIVATE_ROUTE_PREFIXES` pierde `INVENTORY_ROUTE` | los dos de R3 + `a un rol distinto de Administrador lo saca al dashboard` |
| `ROUTE_ROLE_RULES` se queda sin su unica fila | `declara exactamente una regla`, `la regla se aplica a la ruta...`, `a un rol distinto de Administrador lo saca al dashboard` |
| La regla pasa a `roles: [ADMIN_ROLE_NAME, 'Operador']` | los mismos tres |
| La regla pasa a `roles: ['Operador']` | los tres anteriores **y** `deja pasar al Administrador` |
| La fila se escribe con los literales `'/inventario'` y `'Administrador'` | `la fila se deriva de INVENTORY_ROUTE y de ADMIN_ROLE_NAME` |

**Salida real (T14):**
```
pnpm typecheck  -> tsc --noEmit, sin errores
pnpm lint       -> eslint, sin hallazgos
pnpm exec vitest run tests/unit/identity/ tests/guards/guard-arquitectura-modulos.test.ts
  -> Test Files  27 passed (27)   ·   Tests  387 passed (387)
```

Los proyectos de **integracion** siguen fallando en este worktree por no haber `DATABASE_URL`:
es previo a esta tanda y ajeno a ella. `package.json` y `pnpm-lock.yaml`, sin cambios: ninguna
dependencia nueva.

**Sigue abierto y NO se toco:** `lib/modules/identity/domain/route-access.ts:37` dice en un
comentario que `ROUTE_ROLE_RULES` «esta vacio a proposito»; ya no lo esta, y ademas la constante
no vive ahi. Ese archivo no entra en los de esta tarea, asi que se reporta en vez de tocarlo.


---

## Correccion del comentario obsoleto de `route-access.ts` (autorizada por el leader)

`lib/modules/identity/domain/route-access.ts:37` decia que las reglas las aporta
`ROUTE_ROLE_RULES`, «que esta vacio a proposito (R12)». Esta ficha lo convirtio en mentira **por
dos motivos a la vez**: la lista ya tiene una fila -la de `/inventario`- y ademas ya no vive en
`domain/`, sino en `adapters/driving/route-role-rules.ts`, adonde la mudo la correccion de
arquitectura de esta misma feature.

- **Solo el comentario.** Ni una linea de codigo de ese archivo cambia: el tipo, la firma y el
  cuerpo de `decideRouteAccess` quedan como estaban. Lo unico que se reescribe es el JSDoc del
  campo `rules` de `RouteAccessInput`, que ahora dice donde vive la lista y cual es su primera
  regla, y **conserva** lo que si sigue siendo cierto: que las reglas entran como parametro (R12).
- Se hace en commit propio, separado del E2E, porque no es trabajo de T15: es deuda que esta
  ficha genero y que se arrastraba anotada desde la tanda de T3.

## T15 — E2E del camino completo y del rechazo por rol

**Archivo (nuevo):** `e2e/inventario.spec.ts`, sobre el patron de `e2e/session.spec.ts` (fixtures
propios con prefijo, `RUN_ID` por worker, limpieza de huerfanos **por edad**, borrado en
`afterAll` con `try`/`finally` anidados). Dos recorridos, los dos que pidio el humano:

1. **Camino completo del Administrador:** login real -> `/inventario` -> abrir el panel lateral ->
   escribir el producto -> crear su presentacion **desde el propio selector** -> guardar -> el
   panel se cierra, aparece un aviso emergente y **el producto esta en la lista**. Cierra con una
   comprobacion en base (`prisma.product.count`) de que lo guardo el backend de verdad y no solo
   lo pinto la pantalla.
2. **Rechazo del no-Administrador:** usuario con rol `Operador`, sesion valida, pide
   `/inventario` y **acaba en el dashboard** -no en el login: no autorizado no es no autenticado-
   sin ver ni el titulo, ni la tabla, ni el estado vacio.

**Decisiones del spec que no son obvias y se dejan escritas:**

- **Los roles NO se crean.** `Administrador` y `Operador` los siembra `pnpm run db:seed`
  (`lib/modules/identity/domain/roles.ts`). La regla ruta->rol compara por **nombre exacto**, asi
  que un rol efimero `qc22_e2e_rol_<RUN_ID>` -el patron de `session.spec.ts`- no probaria nada.
  Si el rol falta, el `beforeAll` falla diciendo que hay que sembrar, en vez de dar un rojo
  incomprensible a mitad del recorrido.
- **La fila se busca recorriendo paginas, no mirando la primera.** La pantalla no ofrece busqueda
  (R13, decision cerrada) y el orden es fijo `name ASC`: un producto recien creado cae en
  cualquier pagina. `findProductCell` avanza con el control real de paginacion -de paso ejercita
  R11 en un navegador- hasta que «siguiente» queda deshabilitado. El assert filtra por el nombre
  con `RUN_ID`; **nunca** por «la primera fila» ni por el total, que el otro proyecto puede estar
  moviendo en el mismo instante.
- **El borrado de la limpieza es FISICO** (`prisma.product.deleteMany`), no el de la pantalla, que
  es logico (`deletedAt`): un borrado logico dejaria la fila viva para el resto del repo. Orden
  impuesto por las FK: productos -> presentaciones -> usuarios.
- **El toast se afirma por estructura** (`[data-sonner-toast]`), no por su texto: los asserts de
  este repo no miran literales de copy.
- `product-create-open` aparece **dos veces** cuando el catalogo esta vacio (cabecera y estado
  vacio), asi que se toma `.first()`: sin eso, el modo estricto de Playwright rompe con un error
  que no es del codigo.

### NO SE PUDO EJECUTAR — y por tanto NO se declara verificado

En este worktree **no hay `DATABASE_URL`**. Sin base no hay migraciones, ni seed, ni roles, ni
`next dev` util: Playwright no se corrio y **este E2E no ha visto un solo navegador**. Se dice tal
cual, sin adornos: el spec esta escrito y pasa `typecheck` y `lint`, pero **su verde esta
pendiente**. Lo verifica el leader en el gate.

**Comando exacto y lo que necesita:**

```bash
# 1. Entorno: .env del worktree con DATABASE_URL (y DIRECT_URL si hay pooler) apuntando a
#    una Postgres accesible. SESSION_SECRET tambien, que es lo que firma la cookie.
# 2. Esquema al dia:
pnpm run db:migrate
# 3. Semilla: crea los roles `Administrador` y `Operador`. SIN ESTO el beforeAll falla a
#    proposito con el mensaje que lo explica.
pnpm run db:seed
# 4. El E2E (Chromium + WebKit, servidor propio en el puerto 3117, lo levanta Playwright):
pnpm run e2e
# o solo este spec:
pnpm exec playwright test e2e/inventario.spec.ts
```

- **Usuarios:** los crea el propio spec en `beforeAll`, con hash real de bcrypt, y los borra en
  `afterAll`. **No hay que crearlos a mano**: uno con rol `Administrador`
  (`qc22_e2e_admin_<RUN_ID>`) y otro con rol `Operador` (`qc22_e2e_oper_<RUN_ID>`).
- **Datos de catalogo:** tambien los crea y los borra el spec (`qc22_e2e_producto_<RUN_ID>` y
  `qc22_e2e_presentacion_<RUN_ID>`).
- **Criterio de limpieza que hay que comprobar tras la corrida:**
  `prisma.product.count({ where: { name: { startsWith: 'qc22_e2e_' } } })` = 0, y lo mismo para
  `presentation` y para `user` con ese prefijo.

**Salida real de lo que SI se pudo correr:**

```
pnpm typecheck  -> tsc --noEmit, sin errores
pnpm lint       -> eslint, sin hallazgos
pnpm exec vitest related --run --project node --project ui   lib/modules/identity/domain/route-access.ts e2e/inventario.spec.ts
  -> Test Files  26 passed (26)   ·   Tests  299 passed (299)
```

Los proyectos de **integracion** siguen rojos por la misma ausencia de `DATABASE_URL`
(`tests/integration/identity/*.int.test.ts`): es previo a esta tanda y ajeno a ella.
`package.json` y `pnpm-lock.yaml`, sin cambios: **ninguna dependencia nueva**.

---

## T17 — Mapa de trazabilidad `R<n> -> test` (consolidado, R1-R32)

Consolida lo que T3/T4, T5-T11, T12/T13 y T14 dejaron anotado, **con los nombres reales de los
tests que hay hoy en la rama**. La vara de esta ficha ha sido verificar por **mutacion** -romper
el codigo de verdad, ver el rojo y revertir-, no por razonamiento: la columna «Muerde» dice que
mutacion se probo y en que tanda quedo registrada. Lo que no se pudo observar, se dice.

Leyenda de la columna **Estado**:
- **verificado** — hay al menos un test nombrado que se puso ROJO al romper el codigo.
- **pendiente de ejecucion** — la evidencia adicional esta en `e2e/inventario.spec.ts`, que en
  este worktree **no se pudo correr** (sin `DATABASE_URL`). **Ningun requisito depende SOLO del
  E2E**: todos tienen ademas un test unitario que muerde.
- **parcial declarado** — parte del requisito no es observable en el nivel disponible; se explica
  debajo de la tabla en vez de darse por cubierta.

| Req | Test(s) que lo muerden hoy | Archivo(s) | Mutacion que lo puso rojo | Estado |
| --- | --- | --- | --- | --- |
| R1 | `la pantalla de productos se renderiza dentro del armazon privado y no declara main propio` | product-page.test.tsx | la pagina declara su propio `main` (T12) | verificado |
| R2 | `la ubicacion de la ruta se deriva de INVENTORY_ROUTE y ningun archivo incrusta el literal` · `el item Inventario del sidebar y el prefijo privado apuntan a la misma constante` · `la fila se deriva de INVENTORY_ROUTE y de ADMIN_ROLE_NAME, no de literales propios` | product-route-contract.test.ts · route-role-rules.test.ts | la barra construye la URL con el literal de la ruta; la fila se escribe con literales (T13, T14) | verificado |
| R3 | `cada pantalla privada esta cubierta por un prefijo de PRIVATE_ROUTE_PREFIXES` · `sin sesion redirige al login con la ruta pedida como destino de vuelta (R3)` · `sin sesion tampoco se sirve lo que cuelga de la ruta (R3)` | guard-rutas-privadas-cubiertas.test.ts · route-access.test.ts | `PRIVATE_ROUTE_PREFIXES` pierde `INVENTORY_ROUTE` (T3, T14) | verificado |
| R4 | `declara exactamente una regla: la pantalla de inventario, solo Administrador (R4)` · `la regla se aplica a la ruta de inventario y a lo que cuelgue de ella (R4)` · `deja pasar al Administrador (R4)` · `a un rol distinto de Administrador lo saca al dashboard, no al login (R4)` · `no corta al Operador en las rutas privadas que no tienen regla (R4)` · **E2E** `un usuario que no es Administrador acaba fuera y no ve el catalogo (R4)` | route-role-rules.test.ts · route-access.test.ts · **inventario.spec.ts** | la regla se queda sin fila; la regla pasa a solo Operador (T14) | verificado (+ E2E pendiente de ejecucion) |
| R5 | `la pantalla no repite requireAdmin ni decide autorizacion` · `un error unauthorized se presenta como error y no se muestran datos del catalogo` | product-route-contract.test.ts · product-page.test.tsx | `page.tsx` importa `requireAdmin`; el estado de error deja de mostrar el `code` (T12, T13) | verificado |
| R6 | `la tabla presenta todas las columnas de negocio declaradas` | product-page.test.tsx | se cae la columna `qtyAlert` de `PRODUCT_COLUMNS` (T12); se cuela una columna con el `unitId` crudo (2026-09-03) | **verificado, con R6 MODIFICADO**: son nueve columnas, no diez. La unidad salio de la pantalla el 2026-09-03 tras el merge de QC-32 — ver la seccion final de esta bitacora. |
| R7 | `la tabla no muestra createdBy, updatedBy ni el id de la unidad` · `la tabla no puede pintar quien creo o modifico un producto` | product-page.test.tsx · product-route-contract.test.ts | la columna del nombre pinta ademas `createdBy` (T12, T13); `unitId` sale de `HiddenProductField` y se declara como columna (2026-09-03) | verificado (el centinela cubre ademas `unitId` desde el 2026-09-03) |
| R8 | `el costo se presenta tal cual lo entrega la operacion` · `el costo no se convierte a numero en ningun archivo de la ruta` | product-page.test.tsx · product-route-contract.test.ts | el costo pasa por una conversion numerica (T13) | verificado |
| R9 | `el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro` · `el desbordamiento horizontal no lo declara ningun archivo de la ruta` | product-page.test.tsx · product-route-contract.test.ts | el `overflow-x-auto` sube al contenedor de la pagina (T12, T13) | parcial declarado |
| R10 | `el selector de tamano de pagina ofrece 10 y 25 y usa 10 por defecto` · `las dos unicas opciones de tamano son el defecto y el tope del backend` | product-page.test.tsx · product-list-params.test.ts | el tamano por defecto pasa de 10 a 25 (T12) | verificado |
| R11 | `permite avanzar y retroceder de pagina e indica la pagina actual y el total` · `en los extremos no ofrece avanzar ni retroceder mas alla` | product-page.test.tsx | «Siguiente» no avanza; los extremos dejan de desactivarse (T12) | verificado |
| R12 | `los parametros invalidos o fuera de rango se acotan a valores validos` · `un tamano de pagina fuera de la lista cae al defecto, tambien si excede el tope` · `un parametro repetido toma el primer valor y sigue acotando` · `una pagina enorme no se corrompe: sigue siendo un entero seguro` | product-list-params.test.ts | el tamano por defecto pasa de 10 a 25 (los cuatro en rojo, T12) | verificado |
| R13 | `la pantalla no ofrece busqueda ni control de orden` (render) · `la pantalla no ofrece busqueda ni control de orden` (fuente) | product-page.test.tsx · product-route-contract.test.ts | se cuela un campo de busqueda en la barra (T12, T13) | verificado |
| R14 | `sin productos presenta el estado vacio con la accion de crear` · `una pagina que se quedo atras ofrece volver a la primera` | product-page.test.tsx | la lista vacia se pinta como tabla sin filas (T12) | verificado |
| R15 | `mientras carga presenta el esqueleto en lugar de la tabla` | product-page.test.tsx | el limite de suspense se queda sin `fallback` (T12) | verificado |
| R16 | `un error de la consulta presenta el estado de error con reintento y no una tabla vacia` | product-page.test.tsx | el estado de error deja de mostrar el `code` (T12) | verificado |
| R17 | `crear abre un panel lateral sobre la lista, sin navegar ni perder la pagina` · **E2E** paso 2 del camino completo | product-page.test.tsx · **inventario.spec.ts** | abrir el panel navega con `router.push` (T12) | verificado (+ E2E pendiente de ejecucion) |
| R18 | `el alta y la edicion salen por las Server Actions del catalogo` · **E2E** paso 5 | product-route-contract.test.ts · **inventario.spec.ts** | el formulario deja de importar las actions del catalogo (T13) | verificado (+ E2E pendiente de ejecucion) |
| R19 | `la edicion precarga los valores actuales y envia el reemplazo completo` | product-page.test.tsx | la edicion deja de precargar el costo (re-verificado el 2026-09-03; la mutacion original de T12 usaba la unidad, campo que ya no existe) | verificado |
| R20 | `un guardado rechazado por un campo muestra el error en linea y no cierra el panel` · `un guardado rechazado por la operacion muestra el error del formulario y conserva lo escrito` | product-page.test.tsx | el estado de fallo deja de devolver lo escrito (las dos mitades, T12) | verificado |
| R21 | `un guardado con exito cierra el panel, avisa por toast y refresca la lista` · `un borrado con exito cierra el dialogo, avisa por toast y refresca la lista` · **E2E** paso 6 | product-page.test.tsx · **inventario.spec.ts** | se quita `router.refresh()` tras el exito (T12) | verificado (+ E2E pendiente de ejecucion) |
| R22 | `el layout privado monta exactamente una region de avisos y ningun otro landmark nuevo` · `el layout privado monta la region de avisos y la pantalla no monta otra` | private-layout.test.tsx (invertido en T4) · product-route-contract.test.ts | la pagina monta su propia region de avisos (T13); el layout se queda sin ella (T4) | verificado |
| R23 | `el formulario no captura la unidad, y el alta viaja sin ella` (**relevo en negativo**, no el test original) | product-page.test.tsx | se revive el campo de unidad como texto libre (2026-09-03) | **SIN OBJETO desde el 2026-09-03** — su premisa (`unit` es columna de texto) cayo con el merge de QC-32. No se borro el test: se invirtio, y muerde. Motivo completo en la seccion final. |
| R24 | `el selector alcanza presentaciones mas alla de la primera pagina` · `permite crear una presentacion desde el formulario y la deja seleccionada sin perder lo escrito` · **E2E** paso 4 | product-page.test.tsx · **inventario.spec.ts** | la presentacion creada deja de quedar seleccionada (T12) | verificado (+ E2E pendiente de ejecucion) |
| R25 | `la pantalla no ofrece listar, editar ni borrar presentaciones` | product-route-contract.test.ts | el selector importa la accion de borrar presentaciones (T13) | verificado |
| R26 | `el borrado pide confirmacion nombrando el producto y sin confirmar no invoca la operacion` | product-page.test.tsx | el campo oculto del borrado pierde el identificador (T12) | verificado |
| R27 | `los componentes de ruta se exponen por el barrel y no se importan por ruta profunda` · `la pantalla existe donde la ubica INVENTORY_ROUTE y sus componentes viven en su barrel` | product-route-contract.test.ts | la pagina importa por ruta profunda en vez de por el barrel (T13) | verificado |
| R28 | `ningun archivo de la ruta usa fetch a rutas API propias` | product-route-contract.test.ts | el formulario llama a una ruta de API propia (T13) | verificado |
| R29 | `ninguna primitiva se escribe a mano y no entraron dependencias nuevas` | product-route-contract.test.ts | el esqueleto escribe una tabla a mano (T13) | verificado |
| R30 | `los componentes de cliente no importan composicion ni base de datos` · `la pantalla de productos se renderiza dentro del armazon privado…` (los datos llegan por props del Server Component) | product-route-contract.test.ts · product-page.test.tsx | un componente de cliente importa el punto de composicion (T13) | verificado |
| R31 | `presenta lista y acciones en viewport angosto y en ancho` · `no usa 100vh, ni hover como unica via, y respeta tamanos tactiles y de fuente` | product-page.test.tsx · product-route-contract.test.ts | las acciones de fila se esconden tras el puntero (T13) | parcial declarado |
| R32 | `la feature no duplica el armazon heredado: solo edita los cuatro archivos autorizados` | product-route-contract.test.ts | la pagina declara su propio landmark principal (T13) | verificado |

### Recuento, sin maquillar

- **32 de 32 requisitos (R1-R32) tienen al menos un test nombrado que muerde**, comprobado por
  mutacion en las tandas T12, T13 y T14.
- **Al dia 2026-09-03**: R23 quedo **sin objeto** y R6 **modificado** (nueve columnas) por el merge
  de QC-32 y la decision humana de sacar la unidad de la pantalla. Ninguno de los dos se quedo sin
  test: R23 tiene su relevo en negativo y R6 su lista de claves actualizada, ambos re-verificados
  por mutacion ese mismo dia. Detalle en la ultima seccion de esta bitacora.
- **0 requisitos sin test que muerda.** No hay hueco que reportar.
- **6 requisitos tienen ademas evidencia en el E2E** (R4, R17, R18, R21, R24 y, de refilon, R22
  por el aviso emergente en navegador real): esa evidencia esta **pendiente de ejecucion**, porque
  `e2e/inventario.spec.ts` no se pudo correr en este worktree. **Ninguno de los seis depende solo
  de ella**: los seis estan verificados por mutacion en unit.
- **2 requisitos quedan como «parcial declarado»** (R9 y R31). Ver debajo: es un limite del nivel
  de test, no un descuido, y ninguno de los dos se da por entero verificado.

### Los dos «parcial declarado», con su motivo

- **R31 — la mitad de «nada de `:hover` como unica via» NO se puede observar en jsdom.** Se
  comprobo en T12: escondiendo las acciones de fila con `hidden hover:flex`, `toBeVisible()`
  **sigue pasando**, porque jsdom no aplica las hojas de estilo de Tailwind. Esa media exigencia
  **la muerde la guardia de fuente de T13** (`no usa 100vh, ni hover como unica via…`), que mira
  el codigo: ninguna linea combina `hover:`/`group-hover:` con una utilidad que oculte, `min-h-11`
  en todo archivo que renderice un control y `text-base` en todo archivo con campos. Lo que T12 si
  cubre de R31 es que la lista y sus acciones se presentan en viewport angosto **y** ancho. El
  tamano tactil real (44x44 px) y el de fuente (16 px) se afirman **sobre la fuente**, no sobre
  estilos computados: la comprobacion en un navegador de verdad es **T16**, que hace el humano.
- **R9 — el scroll anidado en WebKit es de T16.** Los tests afirman que el `overflow-x-auto` esta
  en el envoltorio de la tabla y que **ningun ancestro** de la pantalla lo declara, que es lo
  observable sin motor de render. Que el documento no se desplace en iOS **no lo puede afirmar
  jsdom**; lo comprueba T16 en Safari/WebKit, y la propia T16 dice que si falla ahi **no se
  declara excepcion de escritorio**: se arregla o se para.

**T16 esta pendiente y es del humano** (verificacion manual en navegador). Nada de lo que T16
cubre se declara aqui como verificado.

## T18 — Los «no aplica» de `CHECKPOINTS.md`, declarados (no omitidos)

Formato tomado del precedente `specs/QC-12-dashboard-en-blanco/requirements.md > Notas de
proceso`: lo que no aplica **se dice y se justifica**; omitirlo es lo que el reviewer rechaza.

- **`Datos y seguridad (Supabase)` — NO APLICA en bloque.** Cero tablas nuevas, cero migraciones,
  cero `down.sql`, cero RLS, cero secretos, cero webhooks: esta ficha no toca `db/`. El esquema de
  `products` y `presentations` y sus policies son de QC-20, ya mergeado. Lo unico que esta feature
  lee de la base lo lee **a traves de las Server Actions de QC-20**, nunca con Prisma propio.
- **«Cada permiso se valida en el SERVICE y tiene su test» — YA CUMPLIDO POR QC-20, no se
  re-implementa.** Los nueve casos de uso llaman a `requireAdmin` como primera linea y tienen
  `tests/unit/inventario/authorization.test.ts`. Lo que QC-22 anade es el **corte de ruta** (la
  regla ruta-rol, R4), que es **adicional y NO cuenta como autorizacion**
  (`docs/architecture.md > Permisos y autenticacion`, y R29 de QC-9 lo advierte expresamente):
  que una regla deje pasar no autoriza nada. Por eso R5 prohibe que la pantalla repita la
  decision.
- **`Modulos hexagonales` — APLICA SOLO DE REFILON.** Esta feature no crea ningun modulo. Lo unico
  que toca de uno es la lista de reglas ruta-rol de `identity`, y la correccion de esta misma
  feature la saco del dominio: `ROUTE_ROLE_RULES` vive ahora en
  `identity/adapters/driving/route-role-rules.ts`, que **si** puede importar `lib/shared` y el
  **barrel** de `inventario` (`ADMIN_ROLE_NAME`), nunca una ruta profunda.
  `tests/guards/guard-arquitectura-modulos.test.ts` lo vigila y esta verde.
- **«Componentes privados reciben datos por props» — APLICA, con un matiz que se declara.** Los
  componentes de esta pantalla **no viven en `components/private/`** sino en
  `app/(private)/inventario/components/`, que es la decision cerrada de estructura por ruta
  (heredada de QC-12). El fondo del checkpoint se cumple igual y con test: ninguno importa
  `@/lib/composition` ni el cliente de base de datos, y los datos del catalogo bajan por props
  desde el Server Component (`ProductListSection`) — R30.
- **«Migraciones reversibles» / `pnpm run db:rollback` — NO APLICA**: no hay migracion nueva que
  revertir.
- **`Configuracion` — NO APLICA**: esta feature no introduce ninguna URL, credencial ni limite que
  cambie entre entornos. La unica constante que declara es la ruta (`INVENTORY_ROUTE`), que es la
  misma en todos los entornos y esta en un solo sitio (R2).
- **`Dependencias` — NINGUNA ANADIDA**, asi que **no hay fila que anadir a `docs/dependencias.md`**
  y el archivo no cambia. `package.json` y `pnpm-lock.yaml` estan intactos desde T0, comprobado
  ademas por un test (`ninguna primitiva se escribe a mano y no entraron dependencias nuevas`). La
  propuesta P2 (`react-hook-form` + `@hookform/resolvers`) quedo **RESUELTA el 2026-09-03: no
  entra**, y el diseno usa la alternativa sin dependencias.

**Lo que SI aplica y no se declara como excepcion, para que no se lea al reves:**

- **«Mutaciones internas usan Server Actions»** — SI APLICA (R28, con guardia de fuente).
- **«Paginas protegidas validan permisos en el servidor»** — SI APLICA: el corte lo hace el
  middleware por cookie (QC-9) y la autorizacion sobre los datos, el service (QC-20).
- **«E2E de flujo critico»** — SI APLICA: `e2e/inventario.spec.ts` (T15). **Escrito y pendiente de
  ejecucion**, ver T15.
- **`Multiplataforma`** — SI APLICA y **NO se declara ninguna excepcion de escritorio** (R31). La
  parte que ningun test automatico puede afirmar es T16, del humano.
- **`Trazabilidad`** — SI APLICA: el mapa `R<n> -> test` completo es T17, aqui arriba.

---

## Tanda de cierre del gate — 2026-09-03 (dos rojos)

Encargo acotado: apagar los **dos unicos rojos** que quedaban en el gate (1012/1014). Sin abrir
alcance, sin tareas nuevas, sin dependencias.

### Rojo 1 — `tests/unit/inventario/scope.test.ts` (T15 de QC-20)

El caso «no existe ninguna pantalla, pagina ni componente de productos, ni spec E2E nuevo»
afirmaba, por R34 de QC-20, que la pantalla del catalogo estaba **diferida a QC-22**. QC-22 es la
ficha que la construye, asi que la premisa cayo: listaba los 12 componentes de
`app/(private)/inventario/components/`.

**Se invirtio, con fecha (2026-09-03) y motivo dentro del test** — mismo trato que
`tests/unit/private-layout.test.tsx` (T4) y `tests/unit/sidebar-mobile.test.tsx`. No se borro, no
se vacio de sentido, no se marco `skip`. Lo que R34 protegia de verdad no era la ausencia, sino
que la pantalla no apareciese por goteo y sin ficha; eso sigue vigilado en cuatro clausulas:

1. la pantalla **existe** (`app/(private)/inventario/page.tsx`) — si alguien la borra, rojo;
2. vive **entera** bajo su carpeta de ruta: cualquier pieza de catalogo en otra ruta de `app/`, rojo;
3. `components/` sigue **sin una sola pieza** de catalogo (mitad de R34 intacta y en negativo);
4. la lista de specs E2E de catalogo es **cerrada**: solo `e2e/inventario.spec.ts`.

El patron se amplio a `inventario` porque es el nombre real de la ruta: sin el, ni la pagina ni el
spec E2E casaban y media guardia no miraba nada.

**Falsabilidad comprobada, no supuesta.** Con tres arboles sinteticos, uno por clausula:
`app/(private)/productos/page.tsx` -> rojo (clausula 2); `components/product-stray.tsx` -> rojo
(clausula 3); `e2e/productos.spec.ts` -> rojo (clausula 4). Los tres se borraron despues.

El primer caso del archivo (R29, sin route handlers bajo `app/api`) queda **intacto**.

### Rojo 2 — `ROUTE_ROLE_RULES` y el centinela del barrel de `inventario`

`tests/unit/inventario/schema/inventario-schema.test.ts` exige que **todo import del barrel
`@/lib/modules/inventario` hecho fuera de `lib/composition/` sea `import type`**. La correccion
anterior habia sacado la lista del dominio de `identity` (que no puede importar `lib/shared`) y la
habia puesto en `identity/adapters/driving/route-role-rules.ts`: eso apago
`guard-arquitectura-modulos` y encendio este otro centinela, porque `ADMIN_ROLE_NAME` es un
**valor** en ejecucion y `import type` no sirve.

**Decision humana del 2026-09-03, aplicada tal cual:** la lista se muda a
`lib/composition/route-role-rules.ts`. Es la capa de cableado del repo; la tabla de dependencias
le permite importar barriles de modulos **como valor** y `lib/shared/**`, asi que el centinela
queda satisfecho **por construccion** y no por una exencion escrita a mano. No se declaro
`/inventario` como literal ni constante propia dentro de `identity`, y `ADMIN_ROLE_NAME` no se
movio de sitio.

Las dos comprobaciones que el encargo pedia **no dar por hechas**:

- **El borde.** `middleware.ts` -> `identity/adapters/driving/route-guard-middleware.ts` ->
  `@/lib/composition/route-role-rules`. El archivo mudado no importa Prisma, ni `next/headers`, ni
  `lib/composition/index.ts` (que si cablea Prisma). **`pnpm exec vitest run
  tests/guards/guard-middleware-edge.test.ts` -> 7/7 en verde**, y la suite entera de
  `tests/guards/` tambien.
- **El doble del test de middleware sigue aplicando.**
  `tests/unit/identity/route-guard-middleware.test.ts` sustituye `ROUTE_ROLE_RULES` con un getter
  sobre una caja mutable; el `vi.mock` se reapunto al nuevo especificador. Verificado
  **empiricamente**, apuntando el `vi.mock` a `@/lib/composition/route-role-rules-NO-EXISTE`: caen
  **exactamente 2** casos, los dos de rol insuficiente, porque sus reglas sinteticas usan el
  prefijo `/dashboard/productos`, que la lista real (unica fila: `/inventario`) no cubre.
  Restaurado el especificador, 12/12 en verde. El motivo quedo escrito en la cabecera del test
  para que la proxima mudanza no lo pierda.

### Archivos tocados

Rojo 1: `tests/unit/inventario/scope.test.ts`.

Rojo 2: `lib/composition/route-role-rules.ts` (movido con `git mv`, antes en
`lib/modules/identity/adapters/driving/route-role-rules.ts`),
`lib/modules/identity/adapters/driving/route-guard-middleware.ts`,
`lib/modules/identity/index.ts`, `lib/modules/identity/domain/route-access.ts`,
`lib/modules/identity/domain/route-role-rules.ts` (los tres ultimos, **solo comentarios** que
apuntaban a la ubicacion vieja), `tests/unit/identity/route-role-rules.test.ts`,
`tests/unit/identity/route-access.test.ts`, `tests/unit/identity/route-guard-middleware.test.ts`.

`lib/modules/inventario/` **no se toco**. Ninguna dependencia nueva: `package.json` y
`pnpm-lock.yaml` intactos.

### Salida real

```
$ pnpm typecheck
> tsc --noEmit
(sin salida)

$ pnpm lint
> eslint
(sin salida)

$ pnpm exec vitest run tests/guards/ tests/unit/identity/
 Test Files  37 passed (37)
      Tests  442 passed (442)

$ pnpm exec vitest run tests/unit/inventario/scope.test.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)

$ pnpm exec vitest run tests/guards/guard-middleware-edge.test.ts
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

> Nota de entorno: **Vitest en este worktree no carga el `.env` por su cuenta** (en `dev` si). Hay
> que exportarlo antes (`set -a && . ./.env && set +a`) o los tests de integracion fallan con
> `Environment variable not found: DATABASE_URL`, que es un fantasma y no un fallo real.

### PARADA — un tercer ofensor, que estaba TAPADO por el rojo 2

`tests/unit/inventario/schema/inventario-schema.test.ts` **sigue rojo**, pero ya **no por
`ROUTE_ROLE_RULES`**. El barrido recorre `lib/modules` antes que `app`, asi que el primer
`expect` que fallaba era el de la lista de reglas y el test nunca llegaba a leer `app/`. Al
apagarlo aparecio el siguiente:

```
app/(private)/inventario/components/presentation-select.tsx:
  todo import del barrel de inventario fuera de lib/composition debe ser 'import type'
  (import { createPresentationSchema } from '@/lib/modules/inventario';)
```

Es un **componente de cliente** que importa el esquema zod del contrato publico como **valor**,
para prevalidar el nombre con la misma regla que valida el servidor (linea 141,
`createPresentationSchema.safeParse`).

**No se toca y se devuelve al humano**, porque las tres salidas posibles chocan con una regla del
encargo o del rol:

1. cambiar el componente -> es **UI**, fuera del alcance de este rol y ademas es una decision de
   diseno (que hace la pantalla si deja de prevalidar);
2. importar por ruta profunda (`.../domain/presentation-input`) -> lo **prohibe R13** de
   `guard-arquitectura-modulos`: `app/` no puede importar `domain` de un modulo;
3. reexportar el esquema desde `adapters/driving/presentation-actions` (subruta **exenta** del
   centinela) -> exige **abrir `lib/modules/inventario/`**, expresamente vetado en el encargo.

Hay una cuarta lectura, que es la que probablemente toque decidir: si el centinela **debe** dejar
pasar un esquema zod del contrato hacia un componente de cliente —es tipo y validacion, no una
factoria de caso de uso ni el runtime de persistencia que QC-24 queria contener—, entonces lo que
cambia es el centinela, no el componente. Eso es una conversacion sobre la regla y no la abre este
rol.

### Veredicto

Rojo 1 apagado y con falsabilidad demostrada; rojo 2 apagado en su causa declarada (guardias y
`identity` enteras en verde, borde incluido), pero el mismo archivo de test destapo un tercer
ofensor en UI que este rol no puede tocar y queda **en manos del humano**.

---

## Continuacion — el tercer ofensor, RESUELTO (2026-09-03)

**La PARADA de la seccion anterior queda cerrada.** Decision humana del 2026-09-03: **se acota el
guard, no el componente**. La cuarta lectura que se habia propuesto era la correcta.

### Que cambia

Solo `tests/unit/inventario/schema/inventario-schema.test.ts`. **No** `presentation-select.tsx`,
**no** ningun archivo de UI, **no** `lib/modules/inventario/`.

La regla acotaba por la **forma** del import («todo import del barrel fuera de `lib/composition`
debe ser `import type`»). Pasa a acotar por **lo que se importa**: lo que enrojece es traerse una
**factoria de caso de uso** fuera de `lib/composition`. Tipos, esquemas zod y constantes del
contrato pasan.

Es exactamente lo que el propio comentario del guard decia defender —«un Server Component podria
importar una FACTORIA de `inventario` del barrel y saltarse `lib/composition`, que es el punto
UNICO de cableado»—. Un esquema zod no es eso: no cablea nada, no arrastra persistencia, y no se
puede importar como tipo porque se evalua.

Dos apoyos citados dentro del test, que no son opinion de esta ficha:

1. la cabecera del **propio barrel de QC-20** dice literalmente que «debe poder importarse desde un
   componente de cliente sin arrastrar servidor (R31, `design.md > 3`) **—QC-22 lo hara—**». QC-20
   previo este import y a la vez escribio un guard que lo prohibia: contradiccion interna suya,
   resuelta a favor de lo que el barrel **promete**;
2. `docs/architecture.md > La regla de dependencias` ya permite a `components/**`, `hooks/**` y a
   los archivos `'use client'` importar `@/lib/modules/M`, sin exigir que sea solo tipo.

Fecha (2026-09-03) y motivo quedan **dentro del test**, igual que en el centinela de alcance.

### Como quedo la condicion

- La lista de las nueve factorias **no se escribe a mano**: se **deriva del propio barrel** por el
  tipo `...Deps` hermano de cada sentencia de reexport
  (`export { createListProducts, type ListProductsDeps } from './domain/list-products'`). Esa es la
  firma estructural que separa `createListProducts` de `createProductSchema`, que tambien empieza
  por «create» y no es factoria. Una decima factoria queda vigilada el dia que se publique.
- **Centinela sobre el derivador**: si el parseo dejase de encontrar nada, la guardia no miraria
  nada y pasaria en verde. Una asercion sobre las nueve por nombre lo impide.
- El barrido pasa a leer **sentencias** de import y no lineas sueltas: un import multilinea
  escondia el binding.
- **Hueco cerrado de paso**: `import * as inventario from '@/lib/modules/inventario'` se trae el
  modulo entero, factorias incluidas, y no da ningun nombre que comparar. Ahora se marca por si
  mismo.
- Las **dos exenciones previas se conservan tal cual**: subrutas del modulo (Server Actions, que la
  UI importa en runtime a proposito) y `lib/composition/**`, que no esta entre las raices barridas.

### Prueba de que sigue mordiendo

Cuatro archivos sinteticos, creados y borrados:

| Caso | Archivo | Resultado |
| --- | --- | --- |
| Factoria desde `app/` | `app/(private)/inventario/mal-factoria.ts` (`createListProducts`) | **rojo** |
| Factoria en import MULTILINEA junto a un esquema legitimo, desde `components/` | `components/mal-multilinea.ts` (`createProductSchema` + `createCreateProduct`) | **rojo**, y senala **solo** `createCreateProduct` |
| Espacio de nombres desde `hooks/` | `hooks/mal-namespace.ts` (`import * as`) | **rojo** |
| **Legitimo**: esquema zod, como el de `presentation-select` | `components/legitimo-esquema.ts` (`createPresentationSchema`) | **verde** |

El segundo caso es el que importa: demuestra que la guardia distingue **dentro del mismo import**
lo que pasa de lo que no.

### Ningun otro ofensor tapado

`tests/unit/inventario/schema/inventario-schema.test.ts` pasa **entero (20/20)**, no se detiene en
un primer `expect`: el barrido recorre las cuatro raices completas. Y las tres suites que podian
desestabilizarse pasan enteras. **No queda nada tapado detras.**

### Salida real

```
$ pnpm typecheck
> tsc --noEmit
(sin salida)

$ pnpm lint
> eslint
(sin salida)

$ pnpm exec vitest run tests/unit/inventario/ tests/guards/ tests/unit/identity/
 Test Files  53 passed (53)
      Tests  641 passed (641)
```

### Veredicto

Los dos rojos del encargo y el tercer ofensor que destaparon quedan apagados; `typecheck`, `lint`
y las tres suites relacionadas (641 tests) en verde, sin tocar UI ni `lib/modules/inventario/` ni
anadir dependencias. Falta el gate completo, que corre el leader.

## Ejecución del E2E — verificada por el leader (2026-09-03)

T15 quedó escrito pero **sin ejecutar**, porque el worktree no tenía base de datos: así se
declaró, y así estaba en el mapa de T17. Eso ya no aplica. Tras crear la base propia
`QuimiCloude_QC22` (migrada y con seed: roles `Administrador` y `Operador` + usuario inicial),
el leader corrió:

```
set -a && . ./.env && set +a
pnpm exec playwright test e2e/inventario.spec.ts
```

**Resultado: 4 passed (38.5s)** — los dos casos en **Chromium y en WebKit**:

- `el Administrador entra, da de alta un producto con una presentacion nueva y lo ve en la lista
  (R4, R17, R18, R21, R24)` — chromium 13.8s, webkit 16.8s
- `un usuario que no es Administrador acaba fuera y no ve el catalogo (R4)` — chromium 9.6s,
  webkit 11.1s

Lo que esto cierra de verdad, y no es poco: el camino **login → `/inventario` → alta con
presentación nueva creada desde el selector → el producto aparece en la lista** funciona contra
la aplicación real, con Server Actions, sesión real y base real; y la primera regla ruta→rol del
repo **corta de verdad** a un rol que no es Administrador. Los seis requisitos que el mapa de T17
marcaba como «pendientes de ejecución» pasan a verificados.

**Lo que NO cierra**: T16 sigue pendiente y es del humano. El E2E corre WebKit de escritorio, que
no es Safari de iOS: el scroll horizontal anidado de la tabla (R9) y los targets táctiles de R31
se comprueban en un dispositivo o simulador real, no aquí. Sigue declarado como pendiente, no
como verificado.

Aviso ajeno recogido al levantar el servidor, **anterior a esta feature y no suyo**: Next avisa
de que `middleware.ts` está deprecado en favor de `proxy`. No se toca aquí — es QC-9 y merece su
propia ficha.

---

## Se quita el campo «unidad» de la pantalla (2026-09-03)

**No es una tarea del `tasks.md` ni un recorte de alcance por comodidad: es una premisa caida.**

### Que se cayo, y por que no fue un olvido

Al acotar esta feature el humano cerro una decision explicita: *«Campo unidad: texto libre por
ahora, que es lo que la columna guarda hoy. Retrabajo aceptado a conciencia: QC-32 convierte la
unidad en catalogo propio, y cuando llegue este campo pasa a ser un selector»*. Sobre esa premisa
se escribieron **R23**, el `<Input name="unit">` del formulario y la columna `unit` de la tabla.

**QC-32 (`modelo-unidades`) se mergeo a `dev` mientras QC-22 seguia en vuelo.** Al sincronizar la
rama, la premisa dejo de ser cierta: `ProductView.unit: string | null` **ya no existe**, ahora es
`ProductView.unitId: UnitId | null`, una clave foranea al catalogo de unidades. El typecheck lo
dijo en seis sitios. No es que el campo estuviera mal hecho: es que el dato que capturaba dejo de
existir bajo los pies de la feature.

### Por que no se sustituye por un selector, que era el plan

Porque **hoy no se puede construir**. El contrato publico de `lib/modules/unidades` publica
`normalizeUnitName` y los tipos `UnitCatalog`, `UnitId` y `UnitRef`, y **ninguna operacion para
listar el catalogo**. Un selector necesitaria un caso de uso y un adaptador de listado, y eso es
alcance de **QC-38 (`crud-de-unidades`)**, expresamente descartado aqui.

Las dos salidas que quedaban se descartaron a conciencia:

- **Un campo de texto que escriba un UUID a mano**: seria peor que no tener campo. Nadie conoce el
  id de una unidad, y lo que no valide zod lo rechaza la base con `products_unit_id_fkey`.
- **Pintar el `unitId` crudo en la tabla**: mostrar `a3f1…` en una columna titulada «Unidad» es
  ruido con aspecto de dato.

**Decision humana del 2026-09-03: el campo sale de la pantalla.** El producto se da de alta **sin
unidad** —`unitId` es nulable en el esquema, la base lo admite— y el selector lo montara la ficha
que corresponda cuando QC-38 exponga como listar el catalogo.

### Requisitos que quedan sin objeto o modificados

**No se ha borrado ni reescrito nada en `requirements.md`**: el spec es del humano. Se anota aqui
lo que ha dejado de ser verdad, para que nadie lo lea como cubierto.

| Requisito | Estado | Por que |
| --- | --- | --- |
| **R23** — «capturar la unidad como texto libre opcional, sin conjunto cerrado» | **SIN OBJETO** | Su premisa (`unit` es una columna de texto) desaparecio con el merge de QC-32. Ya no hay nada que capturar como texto libre: el dato es una FK. Su reemplazo natural es un selector, y lo trae QC-38. |
| **R6** — «tabla con todas las columnas de negocio: nombre, presentacion, existencia, **unidad**, costo, compra minima, tiempo de entrega, alerta de cantidad, creacion y actualizacion» | **MODIFICADO** | Sigue vigente en todo menos en la unidad. Son **nueve** columnas, no diez. Vuelve a diez cuando QC-38 permita resolver `unitId` a un nombre. |
| **R7** — «la lista no muestra el identificador ni quien creo/modifico» | **AMPLIADO de hecho** | No cambia su texto, pero `unitId` se suma a lo que la tabla no puede pintar. Se vigila igual: esta excluido del tipo `ProductColumnKey` y hay centinela en negativo. |
| R19, R20 | intactos | La precarga en edicion y la conservacion de lo escrito se siguen comprobando; simplemente ya no incluyen la unidad (R20 se observa ahora sobre `cost`). |

### Que se toco

- **`app/(private)/inventario/components/product-columns.ts`** — fuera la columna `'unit'`.
  `unitId` se anade a `HiddenProductField`, asi que **`key: 'unitId'` ni siquiera compila**: la
  omision no queda a merced de que alguien "arregle" el hueco pintando el UUID.
- **`app/(private)/inventario/components/product-form.tsx`** — fuera el `TextField` de `unit`, su
  entrada en `TEXT_FIELDS`, su mensaje de error, su etiqueta y su linea en el candidato que se
  valida. **En su lugar queda un comentario en el JSX explicando la ausencia**: un campo que
  simplemente desaparece se vuelve a anadir por descuido, uno cuya ausencia esta escrita no.
- **`tests/unit/inventario/product-page.test.tsx`** — el fixture pasa a
  `unitId: UNIDAD_QUE_NO_DEBE_VERSE`; el mapa de claves de R6 pierde `'unit'`; el test en negativo
  de R7 cubre tambien `unitId` (por clave de columna y por texto en el documento); la precarga de
  edicion (R19) y la conservacion de lo escrito (R20) dejan de mirar la unidad.

**El test de R23 no se borro: se invirtio.** `«la unidad se captura como texto libre»` pasa a ser
`«el formulario no captura la unidad, y el alta viaja sin ella»`, que comprueba que no hay
`product-field-unit` ni `product-field-unitId`, que el formulario no dice «Unidad», que el unico
combobox sigue siendo el de presentacion (R24) y que el `FormData` que recibe la Server Action no
lleva `unit` ni `unitId`. Un test borrado no avisa de nada; este se pone rojo si la premisa caida
vuelve por la puerta de atras.

### Lo que NO se hizo, a proposito

No se implemento el listado de unidades, ni un caso de uso, ni un adaptador. No se abrio
`lib/modules/inventario/` ni `lib/modules/unidades/`. No se puso ningun `unitId` a mano.

### Verificacion por mutacion (rota, se ve el rojo, se revierte)

Los tres tests que cambian no se dan por buenos por razonamiento:

| Mutacion | Test que se puso ROJO |
| --- | --- |
| Se revive el campo de unidad como texto libre en el formulario | `el formulario no captura la unidad, y el alta viaja sin ella` |
| `unitId` sale de `HiddenProductField` y se declara como columna que pinta el UUID | `la tabla presenta todas las columnas de negocio declaradas` **y** `la tabla no muestra createdBy, updatedBy ni el id de la unidad` |
| La edicion deja de precargar el costo (releva a la mutacion de T12, que usaba la unidad) | `la edicion precarga los valores actuales y envia el reemplazo completo` |

### Verificacion

```
pnpm typecheck   -> limpio (los seis errores que dispararon esto, cerrados)
pnpm lint        -> limpio
set -a && . ./.env && set +a
pnpm exec vitest run tests/unit/inventario/ tests/guards/
  -> Test Files  1 failed | 26 passed (27)   ·   Tests  1 failed | 312 passed (313)
```

El unico rojo es **ajeno a este cambio y anterior a el**:
`tests/guards/guard-dependencias-aprobadas.test.ts` senala que `docs/dependencias.md` lista
`@supabase/storage-js` (fila de QC-25) y el paquete no esta instalado en este worktree. No se toca
aqui: ni `package.json` ni `docs/dependencias.md` entran en este ajuste.

**`e2e/inventario.spec.ts` no se toco**: revisado, no afirma nada sobre el campo unidad (sus
unicas apariciones de «unit» son la palabra «unit» hablando de tests unitarios). Tampoco hizo
falta tocar `product-table.tsx` ni `product-table-skeleton.tsx`: ambos **iteran**
`PRODUCT_COLUMNS` en vez de contar columnas a mano, que es justo para lo que se declararon asi.

---

## Ronda de revision — la guardia de R31 medía por archivo (2026-09-03)

### El hallazgo

`tests/unit/inventario/product-route-contract.test.ts`, prueba `no usa 100vh, ni hover como unica
via, y respeta tamanos tactiles y de fuente`. Las dos mitades de tamaños se afirmaban **sobre el
archivo entero**:

- si el archivo renderizaba algún control, bastaba con que `min-h-11` apareciese **una vez en
  cualquier parte**;
- si el archivo tenía un `<Input`, bastaba con un `text-base` suelto.

Un archivo con cinco controles donde cuatro llevan el área táctil y uno no pasaba en verde. El
reviewer lo demostró: quitando `TOUCH_TARGET` y `FIELD_TEXT` de **un campo entero** de
`product-form.tsx`, la suite seguía verde. Un test que no falla al romper lo que afirma no cuenta
— es la misma clase de agujero por la que se rechazó QC-30 en su primera ronda.

### Lo que se hizo

La aserción pasa a ser **por control**: cada etiqueta de apertura `<Button`, `<SelectTrigger`,
`<Input` y `<AlertDialogAction` de las fuentes de la ruta debe llevar el área táctil en **su
propio** `className`, y cada `<Input>` además el tamaño de fuente. El conjunto de controles
vigilados es el mismo de antes; lo que cambia es la granularidad.

Dos detalles que lo hacían no trivial, ambos resueltos con lectura de fuente y expresiones
regulares —**ninguna dependencia nueva**, nada de un parser de JSX del ecosistema—:

1. **Los componentes no escriben las clases literales**, las agrupan en constantes locales
   (`const TOUCH_TARGET = 'min-h-11 min-w-11'`, `const FIELD_TEXT = 'text-base md:text-base'`), y
   las usan como `className={\`${TOUCH_TARGET} ${FIELD_TEXT}\`}`. Buscar `min-h-11` a ojo sobre el
   `className` daría rojos falsos. La guardia **resuelve las constantes del archivo**: una `const`
   cuyo valor de cadena contenga `min-h-11` cuenta como área táctil, y una que contenga
   `text-base`, como tamaño de fuente; se acepta tanto la clase literal como la referencia a esa
   constante (con límites de palabra, para que `TOUCH_TARGET_SM` no cuele por `TOUCH_TARGET`).
2. **Las etiquetas de apertura ocupan varias líneas.** Se opera sobre la **etiqueta completa**:
   un lector que avanza desde `<Nombre` contando llaves e ignorando lo que cae dentro de una
   cadena, hasta el `>` a profundidad cero. El mismo lector extrae el valor del atributo, sea
   `attr="..."` o `attr={...}` con plantillas anidadas. Mirar línea a línea es el error que ya
   apareció antes en esta feature con los imports multilínea.

Añadidos que evitan que la guardia se quede **muda** en vez de roja:

- **Autocomprobación por archivo**: si la fuente escribe `<Nombre` y el lector no devuelve ninguna
  etiqueta, el test falla. Un lector roto no puede parecer un archivo limpio.
- **Contador global**: `expect(controlesVigilados).toBeGreaterThan(0)`.
- **Mensajes con archivo, línea real y control**: las líneas se mapean de la fuente sin
  comentarios de vuelta al archivo original (`lineasOriginales`), y el control se nombra por su
  `data-testid`, `aria-label` o `id`. Antes el fallo solo decía el archivo.

Las otras dos mitades de la prueba —`100vh` y `hover:` como única vía de revelar— **se quedan
igual**: ya mordían.

### Alcance vigilado y excepciones

**17 controles en 7 archivos** (`delete-product-dialog` 2, `presentation-select` 6, `product-form`
3, `product-list-empty` 1, `product-list-error` 1, `product-list-toolbar` 3, `product-sheet` 1),
de los cuales **3 son `<Input>`** y llevan además el tamaño de fuente.

**Ningún control incumplía**: al acotar la guardia, los 17 pasaron sin tocar un solo componente.
Así que **no se declaró ninguna excepción** ni se ablandó nada, y **no se modificó ningún archivo
de producción** en esta ronda. Solo cambia el test.

### Verificacion por mutacion (rota, se ve el rojo, se revierte)

| Mutacion | Resultado |
| --- | --- |
| `product-form.tsx`: `className={\`w-full ${TOUCH_TARGET}\`}` -> `className="w-full"` en **un solo** botón | ROJO — `product-form.tsx:415 <Button> ("product-form-submit") debe forzar el area tactil en SU className` |
| `product-form.tsx`: `className={\`${TOUCH_TARGET} ${FIELD_TEXT}\`}` -> `className={TOUCH_TARGET}` en **un solo** `<Input>` | ROJO — `product-form.tsx:353 <Input> ({\`product-field-${field}\`}) debe fijar 16px en SU className` |
| `product-list-toolbar.tsx`: se borra la línea `className` de **un solo** `SelectTrigger` | ROJO — `product-list-toolbar.tsx:81 <SelectTrigger> ("product-page-size") debe forzar el area tactil` |
| `product-sheet.tsx`: `const TOUCH_TARGET = 'min-h-9 min-w-9'` (la constante deja de valer) | ROJO — la resolución de constantes no es un pase en blanco |
| `product-sheet.tsx`: se añade `min-h-[100vh]` | ROJO — `no debe usar 100vh` (la mitad que ya funcionaba, sigue) |
| `product-sheet.tsx`: `className={\`${TOUCH_TARGET} hidden hover:flex\`}` | ROJO — `«hover» no puede ser la unica via de revelar «hidden»` |
| Codigo correcto, sin tocar | VERDE — 202/202 |

Las tres primeras son la prueba de que la medida es **por control**: en cada una, los demás
controles del mismo archivo siguen bien y la guardia se pone roja igual. Con la guardia anterior,
las tres pasaban en verde.

### Verificacion

```
set -a && . ./.env && set +a
pnpm typecheck                            -> limpio
pnpm lint                                 -> limpio
pnpm exec vitest run tests/unit/inventario/
  -> Test Files  16 passed (16)   ·   Tests  202 passed (202)
```

Suite completa y `./init.sh` no se corren aqui: el gate lo pasa el leader.
