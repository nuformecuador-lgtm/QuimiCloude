# QC-22 — pantalla-de-productos · design.md

La capa visual del catálogo de productos sobre un backend que ya está `done`. Este documento fija
**qué se hereda**, **qué se añade**, **los dos archivos ajenos que se tocan y por qué**, y las
alternativas descartadas. Las decisiones de producto ya las cerró el humano el 2026-09-03
(`requirements.md > Decisiones cerradas`); aquí solo va su detalle técnico.

## 0. Estado real del repo (verificado, no supuesto)

Comprobado en el worktree `.worktrees/QC-22-pantalla-de-productos/` el 2026-09-03, antes de
escribir este diseño:

| Hecho | Evidencia |
| --- | --- |
| El layout privado existe y **es** el `<main>` (vía `SidebarInset`) | `app/(private)/layout.tsx:59` |
| El layout privado **NO monta `<Toaster />`**, y hay un test que lo exige | `tests/unit/private-layout.test.tsx:260-279` |
| `INVENTORY_ROUTE = '/inventario'` está declarada **en `private-nav.ts`**, no en `routes.ts` | `lib/shared/navigation/private-nav.ts:24` |
| El ítem «Inventario» del sidebar ya apunta a esa constante | `private-nav.ts:119-127` |
| `PRIVATE_ROUTE_PREFIXES = ['/dashboard']` y su guardia comparan lista contra árbol | `lib/shared/routes.ts:18`, `tests/guards/guard-rutas-privadas-cubiertas.test.ts` |
| `ROUTE_ROLE_RULES` está **vacío a propósito**, con el encargo escrito de que la primera regla es esta pantalla | `lib/modules/identity/domain/route-role-rules.ts:16-28` |
| `decideRouteAccess` ya evalúa las reglas y redirige al dashboard con motivo `forbidden` | `lib/modules/identity/domain/route-access.ts:112-122` |
| Las nueve Server Actions existen y devuelven estado serializable; **no exportan `INITIAL_STATE`** | `lib/modules/inventario/adapters/driving/product-actions.ts:69-74` |
| Ninguna action llama a `revalidatePath`/`revalidateTag` | lectura de los dos archivos de `adapters/driving/` |
| El contrato público de `inventario` es **importable desde cliente** (solo reexporta `./domain`; su único paquete es `zod`) | `lib/modules/inventario/index.ts:1-4` |
| `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25`, `toOffsetLimit` **acota** | `lib/shared/pagination.ts` |
| `pageQuerySchema` rechaza `page < 1` y no enteros; el orden es fijo `name ASC` | `lib/modules/inventario/domain/page.ts`, `list-products.ts` |
| El patrón de formulario del repo es `<form action>` no controlado + `useActionState` + toast `sonner` | `app/(public)/login/components/login-form.tsx` |
| Primitivas presentes: `sheet`, `sonner`, `button`, `input`, `label`, `card`, `skeleton`, `separator`, `tooltip`, `avatar`, `badge`, `dropdown-menu`, `collapsible`, `sidebar` | `components/ui/` |
| Primitivas ausentes: `table`, `select`, `alert-dialog`, `form` | `components/ui/` |
| Playwright montado con 4 specs y sesión real utilizable | `e2e/`, `e2e/session.spec.ts` |
| Helper de viewport para tests | `tests/helpers/viewport.ts` |

**Conclusión operativa.** No falta nada por construir salvo la pantalla. Layout, sidebar,
navegación, Vitest, Playwright y la base de shadcn/ui **se heredan y no se re-crean** (R32): por
eso `tasks.md` abre con **T0**, el mismo mecanismo que QC-11 puso tras el choque entre las
features 4 y 10.

## 1. Archivos: qué se crea y qué se toca

```
lib/shared/routes.ts                       # EDITA: mueve aquí INVENTORY_ROUTE + añade el prefijo privado
lib/shared/navigation/private-nav.ts       # EDITA (1 línea): importa INVENTORY_ROUTE en vez de declararla
lib/modules/identity/domain/route-role-rules.ts  # EDITA: la primera regla ruta→rol del repo
app/(private)/layout.tsx                   # EDITA: monta <Toaster /> (R22)

app/(private)/inventario/
  page.tsx                                 # NUEVO. Server Component: metadata + params + Suspense
  components/
    index.ts                               # NUEVO. Barrel de la ruta
    product-list-params.ts                 # NUEVO. Parser puro de searchParams (R12)
    product-list-section.tsx               # NUEVO. Server Component async: llama listProductsAction
    product-table.tsx                      # NUEVO. Cliente: tabla + acciones por fila
    product-table-skeleton.tsx             # NUEVO. Estado cargando (R15)
    product-list-empty.tsx                 # NUEVO. Estado vacío (R14)
    product-list-error.tsx                 # NUEVO. Estado error + reintento (R16)
    product-list-toolbar.tsx               # NUEVO. Cliente: selector de tamaño + paginación (R10, R11)
    product-sheet.tsx                      # NUEVO. Cliente: panel lateral de alta/edición (R17)
    product-form.tsx                       # NUEVO. Cliente: campos + validación en línea (R18-R20, R23)
    presentation-select.tsx                # NUEVO. Cliente: selector + alta en línea (R24)
    delete-product-dialog.tsx              # NUEVO. Cliente: confirmación de borrado (R26)
    product-columns.ts                     # NUEVO. Declaración de columnas (R6, R7)
```

**Los cuatro archivos heredados que se editan son exactamente los que R32 autoriza.** Cualquier
otro archivo ajeno que una task pida abrir es señal de parar y avisar al leader.

## 2. La constante de ruta (R2)

`INVENTORY_ROUTE` **se mueve** de `lib/shared/navigation/private-nav.ts` a `lib/shared/routes.ts`,
y `private-nav.ts` pasa a importarla (`import { DASHBOARD_ROUTE, INVENTORY_ROUTE } from '../routes'`).
Es literalmente lo que el propio `private-nav.ts` dice que hay que hacer —«`DASHBOARD_ROUTE` se
reutiliza de `lib/shared/routes.ts` en vez de redeclararlo: dos constantes con la misma ruta es
como se acaba con `/dashboard` y `/panel` conviviendo»— y es lo que la decisión del 2026-09-03
fija como precedente.

Por qué `routes.ts` y no dejarla donde está: `middleware.ts` y `route-role-rules.ts` necesitan la
constante y **no pueden depender de la navegación** (que arrastra etiquetas, iconos y agrupación de
UI); `lib/shared/routes.ts` ya es la hoja que el middleware consume, y `private-nav.ts` ya importa
de ella, así que la flecha no se invierte y no aparece ningún ciclo.

El nombre de la carpeta (`app/(private)/inventario/`) es el único punto donde la URL aparece como
texto por obligación del framework. Como en QC-12, **R2 se comprueba derivando** la ruta esperada
de la constante (`app/(private)${INVENTORY_ROUTE}/page.tsx`) y afirmando que el archivo está ahí,
más una guardia de fuente de que ningún archivo de la feature contiene el literal `'/inventario'`.

**Consecuencia sin trabajo extra:** el ítem «Inventario» del sidebar deja de dar 404, porque ya
apunta a esa misma constante.

## 3. Protección: ruta y rol (R3, R4, R5)

Dos cosas distintas, las dos en esta ficha porque son encargo heredado y escrito:

1. **`PRIVATE_ROUTE_PREFIXES` gana `INVENTORY_ROUTE`.** Sin esto,
   `tests/guards/guard-rutas-privadas-cubiertas.test.ts` pone el gate en rojo nombrando
   `/inventario` en cuanto exista la `page.tsx` — y con razón: `(private)` no aparece en la URL,
   así que el middleware no puede deducirlo del camino y la pantalla se serviría **sin sesión**.
2. **`ROUTE_ROLE_RULES` gana su primera fila**: `{ prefix: INVENTORY_ROUTE, roles: [ADMIN_ROLE_NAME] }`.

**De dónde sale el nombre del rol.** `route-role-rules.ts` es dominio de `identity` y **no puede
importar `inventario`** por ruta profunda; sí puede importar su **contrato público**
(`@/lib/modules/inventario`), que exporta `ADMIN_ROLE_NAME` — la tabla de `docs/architecture.md >
La regla de dependencias` lo permite explícitamente (`domain/**` → `@/lib/modules/N` barrel). Se
usa esa constante y **no** un literal `'Administrador'`: un tercer literal del mismo rol es
exactamente la deuda que `actor.ts` ya declaró como consciente y de una línea. Si al implementar
la guardia de arquitectura objetara ese import, **se para y se avisa**; la alternativa (declarar
el nombre del rol en `identity`) es un cambio de alcance, no una decisión del `frontend_dev`.

**R5, y está escrito aquí porque un rol en una cookie invita al error contrario:** la regla
ruta→rol **no autoriza nada**. Los nueve casos de uso llaman a `requireAdmin` como primera línea
(`lib/modules/inventario/domain/actor.ts`) y ese es el corte real. La pantalla **no repite**
`requireAdmin`, no lee la sesión para decidir qué renderiza y no oculta columnas por rol: si una
action responde `code: 'unauthorized'`, se pinta el estado de error de R16. Consecuencia
deliberada: si alguien borrase la regla ruta→rol, la pantalla se vería pero **no mostraría ni un
dato**, porque el backend seguiría negando.

## 4. Datos: cómo entran y cómo se refrescan

### 4.1 Contratos de entrada/salida

| Contrato | Valor |
| --- | --- |
| Props de `page.tsx` | `searchParams: Promise<{ page?: string \| string[]; pageSize?: string \| string[] }>` |
| Consulta de lista | `listProductsAction({ page, pageSize })` → `ProductListResult` |
| Alta | `createProductAction(prevState, FormData)` → `CreateProductFormState` |
| Edición | `updateProductAction.bind(null, id)` → `ProductMutationFormState` |
| Borrado | `deleteProductAction(prevState, FormData)` con `id` en campo oculto → `ProductMutationFormState` |
| Presentaciones | `listPresentationsAction({ page, pageSize })`, `createPresentationAction(prevState, FormData)` |
| Estado inicial de cada formulario | **literal `{ status: 'idle' }`** tipado con el tipo exportado. QC-20 explica por qué no hay `INITIAL_STATE`: un archivo `'use server'` solo puede exportar funciones async |
| Datos de sesión | Ninguno los pide la pantalla (R5). El layout ya los obtiene para el sidebar |
| Modelo de datos, tablas, RLS, migraciones | **NO APLICA**: cero cambios en `db/`. El esquema es de QC-20 y está mergeado |
| Integraciones externas / variables de entorno | **Ninguna** |

### 4.2 Paginación por URL (R10, R11, R12, R17)

El estado de lista (`page`, `pageSize`) vive en la **cadena de consulta**, no en estado de React.
Tres razones concretas: (a) el `page.tsx` es Server Component y puede pedir los datos en el
servidor sin exponer nada al cliente; (b) recargar, compartir el enlace o volver con el botón
«atrás» conserva la página, que es justo lo que R17 exige al cerrar el panel; (c) el cambio de
página se convierte en una navegación, y Next puede pintar el estado de carga solo.

`product-list-params.ts` es una función **pura y testeable sin DOM**:

```
parseProductListParams(searchParams) -> { page: number; pageSize: 10 | 25 }
```

- `page`: entero ≥ 1; cualquier otra cosa (`'abc'`, `'0'`, `'-3'`, `1.5`, array) → `1`.
- `pageSize`: solo `10` o `25`; cualquier otra cosa → `DEFAULT_PAGE_SIZE` (10) **importado**, nunca
  el número escrito a mano.

Esto cumple R12 **antes** de llamar a la action: `pageQuerySchema` rechazaría `page: 0` con
`ValidationError` y la pantalla mostraría un error donde el usuario solo esperaba la primera
página. Acotar es de esta capa; validar sigue siendo del dominio, y no se duplica ninguna regla de
negocio (el tope de 25 lo sigue aplicando `toOffsetLimit`; aquí solo se ofrecen 10 y 25 porque son
las dos opciones que la decisión fijó).

### 4.3 Los tres estados (R14, R15, R16)

```tsx
// page.tsx (Server Component)
<Suspense key={`${page}-${pageSize}`} fallback={<ProductTableSkeleton rows={pageSize} />}>
  <ProductListSection page={page} pageSize={pageSize} />
</Suspense>
```

La `key` es lo que hace que el esqueleto vuelva a aparecer **en cada cambio de página o de
tamaño**, no solo en la primera carga. `ProductListSection` es un Server Component `async` que
llama a `listProductsAction` y decide:

- `status: 'error'` → `<ProductListError message code />` (R16), con un enlace que reintenta la
  misma URL. **No** se pinta tabla vacía: confundir «falló» con «no hay nada» es el fallo que R16
  existe para impedir.
- `status: 'success'` y `total === 0` **y** `page === 1` → `<ProductListEmpty />` con la acción de
  crear (R14).
- `status: 'success'` y `items` vacío con `page > 1` → estado vacío con enlace a la primera página
  (caso «la página se quedó atrás tras un borrado»; R12 lo acota, esto lo explica).
- resto → `<ProductTable />` + `<ProductListToolbar />`.

### 4.4 Refresco tras mutar (R21)

Las actions de QC-20 **no revalidan nada** (verificado en `§0`) y esta ficha **no las toca**: QC-20
está `done`. El refresco lo dispara la pantalla: tras un estado `success`, el componente cliente
llama a `router.refresh()` de `next/navigation`, que vuelve a ejecutar el Server Component de la
lista con la misma URL. Es la vía que no requiere abrir el módulo ni duplicar la consulta en
cliente. Queda anotado como deuda menor: si más pantallas repiten el patrón, `revalidatePath` en
las actions es más barato, y eso sería una ficha de backend.

## 5. Formularios sin dependencias nuevas (R18-R20, R23, R24)

Se reutiliza **tal cual** el patrón que el login ya tiene mergeado, y que el propio comentario de
`product-actions.ts` anticipa («create/update son mutaciones que salen de un formulario (QC-22):
reciben `FormData`»):

- `<form action={formAction}>` con campos **no controlados** y `useActionState(action, { status: 'idle' })`.
- **Validación en cliente antes de enviar** con `createProductSchema`, importado del **contrato
  público** de `inventario` (`@/lib/modules/inventario`), que es client-safe. Así los mensajes por
  campo salen de la **misma regla** que valida el servidor, sin reescribir ninguna: `safeParse` →
  `error.issues[].path[0]` → mensaje bajo ese campo, con `aria-invalid` + `aria-describedby` como
  en `login-form.tsx`. El servidor revalida igual: el cliente nunca es la frontera.
- Los errores que **sí** identifican campo se pintan junto a él: `duplicate_name` → nombre de la
  presentación en el alta en línea. `invalid_input`, `not_found` y `unauthorized` no identifican
  campo y van a la **región de error del formulario** (`role="alert"`), que es lo que R20 pide.
- El panel **no se cierra** con error; con éxito se cierra, se lanza `toast.success(...)` y se
  llama a `router.refresh()`.

**Campos numéricos.** La action rechaza cadenas no numéricas antes de llamar al caso de uso
(`INVALID_NUMBER`), así que los inputs son `type="number"` con `inputMode="numeric"` y el mensaje
por campo lo produce la validación previa. `cost` es `type="text"` con el patrón decimal del
esquema: **nunca** `type="number"`, porque un `number` de HTML pasa por el binario de coma flotante
y `cost` viaja como cadena a propósito (`product-input.ts`).

**Unidad (R23):** `<Input name="unit">` de texto libre. Es retrabajo aceptado a conciencia: cuando
aterrice QC-32 este input pasa a ser un selector. Queda escrito en el componente para que el
siguiente no lo lea como descuido.

**Selector de presentación (R24).** El backend no ofrece búsqueda y tope 25 por página. El selector
carga la primera página con `listPresentationsAction({ page: 1, pageSize: MAX_PAGE_SIZE })` y, si
`page < totalPages`, muestra una opción **«Cargar más»** que anexa la página siguiente. Así se
alcanza cualquier presentación existente sin inventar búsqueda ni tocar QC-20. El alta en línea es
un pequeño formulario dentro del propio panel (no un segundo `sheet` anidado: apilar capas
modales es justo lo que se rompe en iOS): al recibir `{ status: 'success', id }` se anexa la
presentación a la lista local, se selecciona y se cierra el sub-formulario, **sin tocar el resto de
los campos ya escritos**.

## 6. Borrado (R26)

`alert-dialog` con el nombre del producto en el cuerpo del mensaje y un texto que dice que no se
puede deshacer. En base el borrado es lógico (`deletedAt`), pero **el backend no expone ninguna
restauración**: para el usuario es irreversible y se le dice así. Confirmar envía un `<form>` con
el `id` en campo oculto a `deleteProductAction`, que es la forma que la action espera.

## 7. Tabla, columnas y multiplataforma (R6-R9, R31)

`product-columns.ts` declara las columnas como datos (`{ key, label, testId, align }`) y la tabla
las recorre. Ventaja concreta: el test de R6/R7 itera la declaración en vez de listar diez
literales, y **añadir `createdBy` obligaría a añadir una columna a esa declaración**, que es lo que
el test en negativo de R7 vigila.

- **Desbordamiento (R9):** el envoltorio de la tabla lleva `overflow-x-auto` **contenido en la
  tabla**, nunca en `body`. La regla de multiplataforma no prohíbe el scroll anidado, pero **exige
  comprobarlo en iOS** antes de darlo por bueno: es una comprobación manual obligatoria de
  `tasks.md` (T13), no una casilla que se marca sola. Las acciones de fila van en la última
  columna y se alcanzan con el scroll de la propia tabla: **no se usa columna pegajosa**
  (`position: sticky` horizontal), que es de las cosas que se comportan distinto en WebKit y no
  hace falta aquí. El test afirma que el contenedor con `overflow-x-auto` es el envoltorio de la
  tabla y que ningún ancestro de la pantalla lo declara. Sin `position: fixed` en toda la pantalla.
- **Táctil (R31):** botones de acción con tamaño mínimo 44×44 px (`size="icon"` de shadcn no
  alcanza por sí solo: se fuerza con clases), `text-base` (16 px) en los inputs para que iOS no
  haga zoom, y ninguna acción escondida detrás de `:hover` — los botones de fila están siempre
  visibles.
- **Alto:** `flex-1` dentro del `<main>` del layout. Nada de `100vh`.
- **No se declara ninguna excepción de escritorio.**

## 8. Dependencias y primitivas (R29) — hay una propuesta que aprueba el humano

**Ninguna librería nueva se instala en esta feature.** Lo que se añade por CLI:

| Primitiva | Estado | Qué arrastra |
| --- | --- | --- |
| `sheet` | **ya existe** (`components/ui/sheet.tsx`, llegó con `sidebar` en QC-11) | nada |
| `table` | se añade | markup + `cn`; ningún paquete |
| `select` | se añade | monta sobre `@base-ui/react`, ya instalado |
| `alert-dialog` | se añade | monta sobre `@base-ui/react`, ya instalado |
| `form` | **NO se añade** — ver abajo | `react-hook-form` + `@hookform/resolvers` |

**Verificación obligatoria, no asumible (T2):** tras cada `pnpm dlx shadcn@latest add`, comparar
`package.json` contra el estado anterior. **Si el CLI añadió una entrada, se para y se avisa al
leader** — no se instala nada por cuenta propia (regla 7 de `CLAUDE.md`) y
`tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría rojo de todas formas.

**Propuesta pendiente de aprobación humana — `react-hook-form` + `@hookform/resolvers`**
(`docs/architecture.md > Dependencias de terceros`; pregunta abierta **P2**):

- *Qué código nos ahorra:* el registro de campos, el estado de «sucio/tocado», el mapeo de errores
  de zod a mensajes por campo y el `aria-invalid`/`aria-describedby`. En esta pantalla serían unas
  60-80 líneas repartidas entre `product-form.tsx` y `presentation-select.tsx`.
- *Los cuatro checks:* **no verificados** — el gate corre sin red y este agente no tiene acceso al
  registro de npm. Según regla 6 de `CLAUDE.md` eso **no es un sí**: es un desconocido, y se dice.
  Si el humano quiere la librería, los cuatro checks se verifican y se anota la fila en
  `docs/dependencias.md` **antes** de instalar.
- *Recomendación de este diseño:* **no instalarlas**. El repo ya tiene un patrón de formulario
  mergeado y probado (`login-form.tsx`), los esquemas zod ya viven en el contrato público del
  módulo y `useActionState` cubre exactamente el ciclo de una Server Action. Meter un segundo
  paradigma de formulario para la segunda pantalla del producto es la clase de divergencia que
  después nadie unifica. `§5` describe el diseño sin ellas y R29 se cumple igual.

## 9. Los dos archivos ajenos que se tocan, y el test de QC-11 que hay que invertir

**`app/(private)/layout.tsx` monta `<Toaster />` (R22).** Es decisión humana del 2026-09-03 y
**sustituye expresamente a R36/D9 de QC-11**, que lo dejó fuera. Consecuencia que hay que mirar de
frente: `tests/unit/private-layout.test.tsx:260-279` («el layout privado no monta ninguna region
de notificaciones») **se pondrá rojo**, y no por accidente — ese test existe justo para que montar
un `<Toaster />` «ya que estamos» no pasara en silencio. Aquí no es «ya que estamos»: es un
requisito con dueño y fecha.

Lo que hace esta feature con ese test: **lo invierte, no lo borra** (T4). Pasa a afirmar que el
layout privado **sí** monta exactamente **una** región de avisos, que sigue habiendo **un solo**
`<main>` y que no aparece ningún otro landmark nuevo. Borrar el test dejaría sin cubrir la mitad
que sigue siendo válida. En el archivo queda escrito que R36 de QC-11 está superada por R22 de
QC-22, con la fecha, para que nadie lo lea como una regresión.

`<Toaster />` se monta con las mismas opciones que el público (`richColors`), y **no** se promueve
al root layout: hoy son dos zonas con armazones distintos y promoverlo obligaría a tocar un tercer
archivo ajeno sin necesidad.

## 10. Alternativas descartadas (y por qué)

**A — Lista en cliente con `useEffect` + `listProductsAction`, estado de página en `useState`.**
Es lo que sale «natural» cuando ya hay Server Actions: un componente cliente que pide datos y
guarda `page` en estado. **Descartada.** (1) Obligaría a un estado de carga hecho a mano y a
gestionar carreras entre peticiones que `Suspense` resuelve solo; (2) perdería la página al
recargar o al volver con «atrás», y R17 exige justo lo contrario; (3) `docs/architecture.md`
reserva el fetch desde cliente para **datos públicos con SWR** — el catálogo es privado, y la regla
dice pre-fetch en Server Component. La versión servidor + `searchParams` cumple las tres cosas sin
una línea de sincronización.

**B — Añadir `form` de shadcn/ui con `react-hook-form`.** Es lo que la plantilla oficial usa y
haría el formulario más corto. **Descartada hoy**, con la propuesta escrita en `§8` para que la
decida el humano: son dos dependencias nuevas (regla 7), el repo ya tiene su patrón de formulario
y los esquemas de validación ya se pueden importar del contrato del módulo. Si el humano la
aprueba al aprobar el spec, `§5` se reescribe sobre `react-hook-form` y **el resto del diseño no
cambia**.

**C — Página aparte para el alta y la edición (`/inventario/nuevo`, `/inventario/[id]`).** Es el
patrón más simple de testear y el que mejor se comporta en móvil estrecho. **Descartada por
decisión humana del 2026-09-03**: panel lateral. No es olvido; se anota aquí para que el reviewer
vea que la opción se consideró. El coste que asume la decisión —el formulario no es enlazable— se
mitiga en parte porque la lista sí conserva su estado en la URL.

**D — Filtrar y ordenar en el cliente sobre la página visible.** «Es una tabla, la gente espera
buscar.» **Descartada por decisión humana**, y el motivo técnico está escrito en la ficha: el
backend solo acepta `page`/`pageSize` y ordena fijo por `name asc`, así que un buscador de cliente
solo miraría dentro de los 10 o 25 elementos cargados. Sería una función que **miente**, peor que
su ausencia. Es una ficha de backend nueva.

**E — Dejar `INVENTORY_ROUTE` en `private-nav.ts` e importarla desde ahí.** Ahorra tocar dos
archivos. **Descartada:** `route-role-rules.ts` y `middleware.ts` acabarían dependiendo del módulo
de navegación —etiquetas, iconos, secciones— para saber una URL, cuando `lib/shared/routes.ts` ya
existe para eso y `private-nav.ts` ya importa de ella. La decisión del 2026-09-03 pide además el
precedente de `DASHBOARD_ROUTE`, que vive en `routes.ts`.

**F — Traer la pantalla de presentaciones «ya que estamos», reutilizando la tabla.** El módulo
expone las cuatro operaciones y el componente de tabla serviría casi igual. **Descartada por
decisión humana del 2026-09-03**: sale a **QC-45**, creada ese mismo día y bloqueada por esta. Lo
único de presentaciones que entra aquí es el **alta desde el selector** (R24), porque sin ella una
base con `presentations` vacía dejaría el alta de producto muerta.

**G — `revalidatePath` en las Server Actions en vez de `router.refresh()`.** Es más limpio y
evitaría un `'use client'`. **Descartada:** obligaría a abrir
`lib/modules/inventario/adapters/driving/`, que es de QC-20, `done` y mergeado, y esta ficha tiene
escrito que no abre el módulo salvo para consumir su contrato. `router.refresh()` consigue lo
mismo desde el lado que sí nos toca.

## 11. E2E (decisión cerrada: SÍ)

`e2e/inventario.spec.ts`, sobre el patrón de `e2e/session.spec.ts` (fixtures propios con prefijo
`qc22_e2e_`, limpieza de huérfanos por edad, `RUN_ID` por worker, borrado en `afterAll`). Dos
recorridos:

1. **Camino completo del Administrador:** login → `/inventario` → abrir el panel → crear producto
   (creando su presentación desde el selector si hace falta) → el producto aparece en la lista.
2. **Rechazo del no-Administrador:** usuario con rol distinto, sesión válida, pide `/inventario` y
   acaba en el dashboard sin ver la tabla (R4).

Cierra el diferimiento que QC-20 dejó apuntando aquí. Los motivos por los que QC-11 y QC-12 lo
difirieron ya no aplican: hay sesión real y Playwright montado.

**Cuidado con los datos:** el catálogo es una tabla real y compartida. El spec crea productos con
nombre prefijado por `RUN_ID` y los borra en `afterAll`; los asserts de lista filtran por ese
nombre, nunca por «la primera fila» ni por el total, porque Chromium y WebKit corren a la vez.

## 12. Riesgos y cómo se mitigan

1. **Duplicar layout o sidebar** (el choque features 4↔10). Mitiga **T0**.
2. **El test de notificaciones de QC-11 se pone rojo** al montar el `<Toaster />`. Previsto y
   planificado: **T4** lo invierte con su motivo escrito (`§9`). Si aparece rojo sin que T4 esté
   hecha, es orden de tareas, no una regresión.
3. **La guardia de rutas privadas pone el gate en rojo** en cuanto exista `page.tsx` sin el
   prefijo. Por eso T3 (constante + prefijo + regla de rol) va **antes** que la página.
4. **El CLI de shadcn instala un paquete sin avisar.** Mitiga la comparación obligatoria de
   `package.json` en T2 y la guardia de dependencias.
5. **Import de `@/lib/modules/inventario` desde `identity/domain`** — permitido por la tabla de
   dependencias (barrel de otro módulo), pero si la guardia de arquitectura objetara, **parar y
   avisar**: no se «arregla» con un literal ni tocando la guardia.
6. **El E2E ensucia la base y pone rojo un test de integración ajeno** (le pasó a QC-9 con
   `user.count() === 0`). Mitiga el patrón de prefijos y limpieza de `e2e/session.spec.ts`.
7. **Conflicto de archivos con otra feature de `frontend`** que toque `app/(private)/layout.tsx` o
   `lib/shared/routes.ts`. Lo vigila el leader (`AGENTS.md > Paralelismo`); esta ficha declara sus
   cuatro archivos ajenos en `§1` justamente para que se pueda vigilar.
