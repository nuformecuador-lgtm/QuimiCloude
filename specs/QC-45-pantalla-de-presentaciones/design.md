# QC-45 — pantalla-de-presentaciones · design.md

La capa visual del catálogo de presentaciones sobre un backend que ya está `done` (QC-20) y sobre
una tabla de datos que ya está mergeada (QC-55, estrenada por QC-35). Este documento fija **qué se
hereda**, **qué se añade**, **los archivos ajenos que se tocan y por qué**, y las alternativas
descartadas. Las decisiones de producto ya las cerró el humano el 2026-09-07
(`requirements.md > Decisiones cerradas`); aquí solo va su detalle técnico.

**Resumen de una línea:** es la hermana pequeña de QC-22 —una entidad con **un solo campo**—
montada sobre la tabla compartida, con búsqueda y orden que QC-57 ya dejó soportados.

## 0. Estado real del repo (verificado en el worktree, no supuesto)

Comprobado en `.worktrees/QC-45-pantalla-de-presentaciones/` el 2026-09-07, **antes** de escribir
este diseño:

| Hecho | Evidencia |
| --- | --- |
| El layout privado existe, **es** el `<main>` (vía `SidebarInset`) y **ya monta `<Toaster />`** | `app/(private)/layout.tsx:59-102` |
| El layout es el **único** punto que llama al proveedor de sesión y reparte por props | `app/(private)/layout.tsx:39-59` |
| Las cuatro Server Actions de presentación existen y devuelven estado serializable | `lib/modules/inventario/adapters/driving/presentation-actions.ts` |
| `listPresentationsAction(query: unknown)` acepta el contrato genérico de lista de QC-57 | mismo archivo, `:128-137` |
| `PRESENTATION_QUERYABLE = { sortable: ['name','createdAt','updatedAt'], filterable: { createdAt: 'dateRange' }, searchable: true }` | `lib/modules/inventario/domain/presentation-queryable.ts:12-16` |
| `PresentationView` = `{ id, name, nameNormalized, createdAt, updatedAt }`. **Un solo campo de negocio** | `lib/modules/inventario/domain/presentation-view.ts:11-17` |
| El borrado es **físico** y el `RESTRICT` de la FK lo bloquea → `PresentationInUseError`, código `'presentation_in_use'` | `domain/delete-presentation.ts:35`, `domain/errors.ts:50` |
| `createPresentationSchema` / `updatePresentationSchema` son client-safe y salen del barrel | `lib/modules/inventario/index.ts:35-40` |
| La tabla compartida existe, con barrel y contrato cerrado | `components/shared/data-table/index.ts` |
| **`DataTableColumn.cell` devuelve `ReactNode`** y `emptyAction` también | `data-table-types.ts:67`, `:147` |
| Ya hay un consumidor real con columna de acciones de fila, panel lateral y dos diálogos | `app/(private)/pedidos/components/*` |
| `PRIVATE_ROUTE_PREFIXES` y su guardia comparan lista contra árbol de `app/(private)/` | `lib/shared/routes.ts:82-93`, `tests/guards/guard-rutas-privadas-cubiertas.test.ts` |
| **`ROUTE_ROLE_RULES` ya no existe: QC-75 R16 borró `lib/composition/route-role-rules.ts`** y el middleware solo comprueba firma, caducidad y empresa | el archivo no está en el árbol; `lib/modules/identity/adapters/driving/route-guard-middleware.ts` |
| El corte por permiso de una pantalla lo hace `requirePagePermission(code)`: `redirect(LOGIN_ROUTE)` sin sesión, `notFound()` sin el permiso | `lib/modules/identity/adapters/driving/require-page-permission.ts:48-52` |
| El 404 de la zona privada se pinta **dentro** del layout privado | `app/(private)/not-found.tsx`, `app/(private)/layout.tsx:44-53` |
| `SessionUser` trae `roleName: string \| null` **y** `permissions: readonly string[]` (QC-74) | `lib/modules/identity/domain/session-user.ts:15-29` |
| `SEED_ROLE_PERMISSIONS`: el Administrador tiene `inventario.consultar` **e** `inventario.modificar`; el Operador tiene **solo** `inventario.consultar` | `lib/modules/identity/domain/permissions.ts:93-105` |
| `PRIVATE_NAV_ITEMS` es la única fuente de la navegación; `AppSidebar` solo recorre y dibuja | `lib/shared/navigation/private-nav.ts` |
| **`NavLink.permission` es OBLIGATORIO** (QC-75 R5) y una guardia rechaza un código fuera del catálogo | `private-nav.ts:133-176`, `tests/guards/guard-nav-permisos-declarados.test.ts` |
| El layout privado **ya filtra** el menú por los permisos de la sesión, sin consultas nuevas | `app/(private)/layout.tsx:70`, `private-nav.ts:334-355` (`filterNavItemsByPermissions`) |
| Los ítems de navegación tienen que ser **serializables** (cruzan servidor→cliente), con guardia | `private-nav.ts:94-105`, `tests/guards/guard-nav-serializable.test.ts` |
| Primitivas presentes: `table`, `sheet`, `alert-dialog`, `select`, `input`, `label`, `button`, `sonner`, `skeleton`… | `components/ui/` (23 archivos) |
| Playwright montado con 9 specs y sesión real utilizable | `e2e/` |
| Helper de viewport para tests | `tests/helpers/viewport.ts` |

**Conclusión operativa.** No falta nada por construir salvo la pantalla. Layout, sidebar,
`<Toaster />`, tabla compartida, primitivas, Vitest y Playwright **se heredan y no se re-crean**
(R33): por eso `tasks.md` abre con **T0**, el mismo mecanismo que QC-11 puso tras el choque entre
las features 4 y 10. **No hace falta correr `shadcn add`**: todas las primitivas ya están.

## 1. Archivos: qué se crea y qué se toca

```
lib/shared/routes.ts                              # EDITA: PRESENTATIONS_ROUTE + su prefijo privado
lib/shared/navigation/private-nav.ts              # EDITA: sección Configuración, su ítem y el `permission` que declara

app/(private)/configuracion/presentaciones/
  page.tsx                                        # NUEVO. Server Component: requirePagePermission + metadata + searchParams + Suspense
  components/
    index.ts                                      # NUEVO. Barrel de la ruta (R29)
    presentation-list-params.ts                   # NUEVO. Parser/serializador puros de la URL (R14)
    presentation-list-section.tsx                 # NUEVO. Server Component async: llama listPresentationsAction
    presentation-table.tsx                        # NUEVO. Cliente: monta <DataTable/> (R8)
    presentation-columns.tsx                      # NUEVO. Cliente: las DOS columnas (R9, R20)
    presentation-row-actions.tsx                  # NUEVO. Cliente: editar + borrar (R19)
    presentation-list-skeleton.tsx                # NUEVO. Estado cargando (R16)
    presentation-list-empty.tsx                   # NUEVO. Estado vacío + «crear la primera» (R15)
    presentation-list-error.tsx                   # NUEVO. Estado error + reintento (R17)
    presentation-sheet.tsx                        # NUEVO. Cliente: panel lateral de alta/edición (R21)
    presentation-form.tsx                         # NUEVO. Cliente: campo nombre + error en línea (R22-R24)
    delete-presentation-dialog.tsx                # NUEVO. Cliente: confirmación + error en uso (R27, R28)
```

**Los DOS archivos heredados que se editan son exactamente los que R33 autoriza.** Cualquier otro
archivo ajeno que una task pida abrir es señal de **parar y avisar al leader**. En particular:
`components/shared/data-table/**` **no se toca** (R20), `components/ui/**` tampoco (R31), y
**`app/(private)/layout.tsx` tampoco**: desde QC-75 ya filtra el menú por permisos, así que esta
ficha no tiene nada que añadirle. `lib/composition/route-role-rules.ts` **no aparece porque ya no
existe** (`§0`, `§4`).

**Conflicto de archivos con otras features en curso:** `lib/shared/routes.ts` y
`lib/shared/navigation/private-nav.ts` son los dos puntos calientes. Se declaran aquí para que el
leader pueda vigilarlos (`AGENTS.md > Paralelismo`).

## 2. La constante de ruta (R2)

```ts
// lib/shared/routes.ts
export const PRESENTATIONS_ROUTE = '/configuracion/presentaciones';
```

Nace en `lib/shared/routes.ts` —como `SUPPLIERS_ROUTE` y `ORDERS_ROUTE`, y a diferencia de
`INVENTORY_ROUTE`, que se mudó allí en QC-22—, así que **no necesita reexport de compatibilidad**:
nadie la importaba antes. Vive ahí y no en `private-nav.ts` porque el middleware la necesita —para
la lista de prefijos privados— y **no puede depender de la navegación**, que arrastra etiquetas,
iconos y agrupación de UI. (El otro consumidor histórico, la regla ruta→rol, desapareció con
QC-75; el criterio se sostiene igual por el middleware.)

**No se declara una constante `CONFIGURATION_ROUTE = '/configuracion'`.** No hay pantalla en esa
URL: visitarla daría 404, y una constante de ruta que no lleva a ninguna parte es exactamente la
deuda de los cinco ítems de QC-11 que la decisión del 2026-09-07 no quiere repetir. El segmento
`configuracion` aparece **una sola vez**, dentro de esta constante. Cuando llegue QC-39 declarará
su propia constante hermana (`/configuracion/unidades`), igual que `FORMULAS_ROUTE` convive hoy con
`/produccion` sin que exista una constante para el tramo intermedio.

El nombre de las carpetas (`app/(private)/configuracion/presentaciones/`) es el único punto donde
la URL aparece como texto por obligación del framework. Como en QC-22 y QC-44, **R2 se comprueba
derivando** la ruta esperada de la constante (`app/(private)${PRESENTATIONS_ROUTE}/page.tsx`) y
afirmando que el archivo está ahí, más una guardia de fuente de que ningún archivo de la feature
contiene el literal `'/configuracion/presentaciones'`.

## 3. La sección Configuración y el ocultado por permiso (R3, R4)

### 3.1 La sección

`private-nav.ts` gana una tercera sección y un ítem de **nivel superior**:

```ts
export const NAV_SECTION_CONFIGURATION = 'Configuración';
export const PRESENTATIONS_LABEL = 'Presentaciones';
// …dentro de PRIVATE_NAV_ITEMS, al final:
{ kind: 'link', href: PRESENTATIONS_ROUTE, label: PRESENTATIONS_LABEL,
  testId: 'nav-presentaciones', permission: 'inventario.modificar',
  icon: 'boxes', section: NAV_SECTION_CONFIGURATION }
```

- **Un ítem, no un grupo.** Un `NavGroup` con un solo hijo pinta un desplegable para llegar a una
  única pantalla. La sección ya agrupa; el grupo sobraría.
- **`icon: 'boxes'`** ya existe en `NavIconName` y en el mapa de iconos: **no se añade ningún
  icono**, y el ítem sigue siendo serializable (el icono es una cadena, `guard-nav-serializable`).
- **Un solo ítem** (decisión del 2026-09-07): nada de «Unidades» apuntando a 404 hasta QC-39.
- **`permission` es un campo obligatorio del tipo `NavLink`** desde QC-75 R5: olvidarlo no produce
  un ítem visible para todos, produce un error de compilación. Y `guard-nav-permisos-declarados`
  se pone roja si el código no está en el catálogo de QC-74.

### 3.2 El ocultado se hace POR PERMISO, y el permiso es `inventario.modificar`

**Esta sección se reescribió el 2026-09-08. Antes decía lo contrario y conviene saber por qué**
(ver el recuadro al final): el diseño original ocultaba el ítem por **rol**, con un campo
`adminOnly` y una función `visibleNavItems` propias de esta ficha, y **argumentaba en contra** de
usar `inventario.modificar`. Ese apaño nunca llegó a `dev`: **QC-75 aterrizó antes**, y con él el
menú se filtra por permiso en el servidor. El mecanismo de hoy es de QC-75; esta ficha **lo
consume**.

El filtrado ya existe y **no se escribe aquí**:

```tsx
// app/(private)/layout.tsx — QC-75, ya mergeado. Esta ficha NO toca este archivo.
const navItems = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, user.permissions);
…
<AppSidebar user={user} navItems={navItems} />
```

Lo único que aporta esta ficha es **el ítem y el código de permiso que declara**. Cuatro cosas que
esto implica, cada una con su porqué:

1. **`inventario.modificar` es el permiso correcto, no `inventario.consultar`.** Esta pantalla
   **administra el catálogo**: el alta, la edición y el borrado viven todos en ella (R21, R22, R23,
   R27). Entrar a una pantalla cuyo propósito entero es escribir con un permiso de solo lectura
   sería anunciar una capacidad que no se tiene. Y es comprobable, no una suposición:
   `SEED_ROLE_PERMISSIONS` da al Administrador `inventario.consultar` **e** `inventario.modificar`,
   y al Operador **solo** `inventario.consultar` (`permissions.ts:93-105`). Filtrar por
   `inventario.consultar` no ocultaría nada al Operador; filtrar por `inventario.modificar` cumple
   exactamente lo que pide la decisión cerrada «solo el Administrador» **por la vía del permiso**,
   que es la que el repo tiene desde QC-74/QC-75. **No se crea ningún permiso nuevo** ni se toca el
   catálogo de QC-74.
2. **El menú y la ruta usan LA MISMA fuente, y por eso no puede haber un enlace que rebote.** El
   ítem declara `inventario.modificar` y la página exige `inventario.modificar` con
   `requirePagePermission` (`§4`). Son el mismo código, contra el mismo conjunto
   (`user.permissions`), con la misma semántica de pertenencia exacta (`assertPermission`, QC-74
   R12). Quien ve el enlace puede entrar; quien no puede entrar no ve el enlace. El test de R4 y el
   de R6 afirman esa igualdad **derivándola**, no repitiendo el literal en dos sitios.
3. **La sección desaparece sola.** `groupNavItemsBySection` construye las secciones a partir de los
   ítems que le llegan, y se aplica **después** del filtrado: sin el ítem no hay sección, y el
   encabezado «Configuración» no queda huérfano. Es una propiedad del código que ya existe, y R4 la
   afirma como test.
4. **`AppSidebar` no se toca, y los ítems ocultos no viajan.** El filtrado ocurre en el Server
   Component antes de cruzar la frontera, así que un ítem sin permiso no aparece en el HTML servido
   —ni etiqueta, ni `href`, ni `data-testid`— en vez de ocultarse con CSS (QC-75 R2). El componente
   recorre lo que recibe y dibuja (R32).

**Excepción declarada a QC-75 R5 — léela antes de copiar este ítem.** QC-75 R5 (y su decisión
cerrada del 2026-09-07) dice que el permiso de un ítem de navegación tiene la forma
`<módulo>.consultar`. **Este ítem declara `inventario.modificar`, y es deliberado**: la regla de
QC-75 existe para que no haya enlaces visibles que devuelvan 404, y aquí `inventario.consultar` la
incumpliría —lo tienen Administrador **y** Operador, así que el Operador vería un enlace a una
pantalla que le responde 404 (`§4`)—. `inventario.modificar` es el único permiso del catálogo que
separa a los dos roles, y es el mismo que exige la página: el enlace y la puerta no pueden
divergir. La forma `<módulo>.consultar` sigue siendo el caso normal —**QC-39 (Unidades) debe usar
`unidades.consultar`** salvo que se encuentre en este mismo aprieto—; la excepción vale solo
mientras el módulo no tenga un permiso de consulta que distinga a quien puede entrar. Ninguna
guardia lo impide: `guard-nav-permisos-declarados` solo comprueba pertenencia al catálogo de QC-74.

**Lo que esto NO es.** Sigue sin ser la frontera de autorización de los datos: QC-9 R29 y QC-74 R18
dicen lo mismo desde dos lados —enseñar una pantalla no autoriza—. La autorización real la toman
los cuatro casos de uso de `inventario` con `requirePermission`, y esta pantalla no la repite (R7).
Lo que sí cambia respecto al diseño original es que ahora el menú y la puerta **coinciden**, en vez
de ser dos criterios distintos que había que mantener sincronizados a mano.

> **Rastro del razonamiento anterior — no se borra, se explica.** Hasta el 2026-09-08 esta sección
> decía: «se compara el ROL, no un permiso», y descartaba `inventario.modificar` con este argumento
> textual: *«usarlo porque hoy solo lo tiene el Administrador sería adivinar: el modelo de permisos
> existe justo para que esa correspondencia pueda cambiar sin avisar»*. El argumento **se apoyaba
> en una premisa que ya no se cumple**: en aquel momento la puerta de la ruta cortaba por **nombre
> de rol** (`ROUTE_ROLE_RULES`), así que ocultar el menú por permiso habría creado dos criterios
> distintos y, con ellos, el peor estado posible —un ítem visible que al pulsarlo rebota—. Al
> borrar QC-75 el mecanismo ruta→rol (QC-75 R16) y pasar la puerta a `requirePagePermission`, la
> premisa se invierte: **la ruta y el menú ya usan la misma fuente**, y usar `inventario.modificar`
> no es adivinar una correspondencia rol↔permiso, es declarar **el mismo permiso en los dos
> sitios**. Si algún día `SEED_ROLE_PERMISSIONS` cambiara y otro rol ganara `inventario.modificar`,
> ese rol ganaría a la vez el enlace y el acceso: siguen sin poder divergir. El apaño `adminOnly` /
> `visibleNavItems` que aquella versión describía **nunca llegó a `dev`** y no hay que buscarlo en
> el código.

## 4. Protección de la ruta (R5, R6)

Dos controles **distintos**, en dos capas distintas. Ninguno sustituye al otro y los dos entran en
esta ficha:

1. **Sesión, en el borde (R5): `PRIVATE_ROUTE_PREFIXES` gana `PRESENTATIONS_ROUTE`.** Sin esto,
   `guard-rutas-privadas-cubiertas` pone el gate en rojo nombrando `/configuracion/presentaciones`
   en cuanto exista la `page.tsx` — y con razón: `(private)` no aparece en la URL, así que la
   pantalla se serviría **sin sesión**. Esta lista **no distingue entre sesiones**: solo exige que
   haya una. No es autorización.

2. **Permiso, en la página (R6): `await requirePagePermission('inventario.modificar')`** como
   **primera** línea del componente, antes de resolver `searchParams` y antes de pintar nada:

   ```tsx
   // app/(private)/configuracion/presentaciones/page.tsx
   export default async function PresentacionesPage({ searchParams }: …) {
     await requirePagePermission('inventario.modificar');
     const params = parsePresentationListParams(await searchParams);
     …
   ```

   - Se importa de `@/lib/modules/identity/adapters/driving/require-page-permission`, que es lo que
     `docs/architecture.md` permite a `app/**`.
   - **Sin sesión → `redirect(LOGIN_ROUTE)`.** No es una duplicación del layout por adorno: layout
     y página se renderizan **en paralelo** en el App Router, así que la página no puede dar por
     hecho que el `redirect` del layout ya ocurrió.
   - **Con sesión y sin el permiso → `notFound()`**, es decir **404**, indistinguible de una ruta
     que no existe: no se nombra el módulo, ni el permiso, ni se confirma que la pantalla exista.
     Y ese 404 lo pinta `app/(private)/not-found.tsx`, que por vivir en este route group se
     renderiza **dentro del layout privado**: el usuario conserva el menú (ya filtrado) y la salida,
     en vez de quedar encerrado en una página pelada.
   - **No hay redirección a otra pantalla.** El diseño original mandaba rebotar al dashboard; ese
     mecanismo desapareció (ver el aviso de abajo) y hoy rebotar sería, además, filtrar que la ruta
     existe.
   - El código es un `PermissionCode` del catálogo de QC-74, no una cadena: escribirlo mal **no
     compila**. Y `tests/guards/guard-pantallas-exigen-permiso.test.ts` se pone roja si una pantalla
     de `app/(private)/` se queda sin esta línea — que es lo que la convierte en algo más que un
     comentario.

> **Cambio de mecanismo, 2026-09-08.** La versión anterior de esta sección decía que el corte lo
> hacía **`ROUTE_ROLE_RULES`** con una fila `{ prefix: PRESENTATIONS_ROUTE, roles:
> [ROLE_ADMINISTRADOR] }` en `lib/composition/route-role-rules.ts`, resuelta en el middleware y con
> **redirección** fuera de la pantalla. **QC-75 R16 borró ese archivo y el mecanismo entero**: el
> middleware ya solo comprueba firma, caducidad y empresa. La garantía no se relajó —quien no puede,
> no entra— pero cambian el lugar (página, no borde), la fuente (permiso, no nombre de rol) y la
> respuesta (404, no redirección). La discusión sobre `guard-middleware-edge` que había aquí ya no
> aplica: `require-page-permission.ts` **no entra en el cierre de imports del middleware** (QC-75
> R18), y vivir en la misma carpeta que el guard no mete nada en el bundle del borde.

## 5. Datos: contratos, parámetros y estados

### 5.1 Contratos de entrada/salida

| Contrato | Valor |
| --- | --- |
| Props de `page.tsx` | `searchParams: Promise<Record<string, string \| string[] \| undefined>>` |
| Consulta de lista | `listPresentationsAction(params)` → `PresentationListResult` = `{ status:'success'; data: Page<PresentationView> } \| { status:'error'; code; message }` |
| Alta | `createPresentationAction(prevState, FormData)` → `CreatePresentationFormState` (campo `name`) |
| Edición | `updatePresentationAction.bind(null, id)` → `PresentationMutationFormState` (campo `name`) |
| Borrado | `deletePresentationAction(prevState, FormData)` con `id` en campo oculto → `PresentationMutationFormState` |
| Estado inicial de cada formulario | **literal `{ status: 'idle' }`** tipado con el tipo exportado (un archivo `'use server'` solo puede exportar funciones async: no hay `INITIAL_STATE`) |
| Datos de sesión | La pantalla **no los pide ni los pasa por props** (R7, R32): `requirePagePermission` los lee para el corte y **devuelve `void`** a propósito. El layout los obtiene aparte, para el sidebar y para el filtrado de R4 |
| **Modelo de datos, tablas, RLS, migraciones** | **NO APLICA: cero cambios en `db/`.** El esquema de `presentations` es de QC-14/QC-20 y está mergeado. `presentations` **no lleva `deleted_at` a propósito**, para que la FK `ON DELETE RESTRICT` pueda impedir el borrado de una presentación en uso |
| Integraciones externas / variables de entorno | **Ninguna** |

### 5.2 Los parámetros de lista viven en la URL

`presentation-list-params.ts` es puro y testeable sin DOM, calcado en forma de
`order-list-params.ts` (QC-35) pero **mucho más corto**, porque esta lista no tiene filtros:

```
parsePresentationListParams(searchParams) -> DataTableParams
buildPresentationListQuery(params) -> string
presentationListHref(params) -> string        // SIEMPRE derivado de PRESENTATIONS_ROUTE (R2)
```

- Parámetros de URL: `page`, `pageSize`, `sort`, `q` (búsqueda).
- `page`: entero ≥ 1 sobre el **texto** (`/^\d+$/`), cualquier otra cosa → 1.
- `pageSize`: solo lo que declare `PAGE_SIZE_OPTIONS` de la tabla compartida (10 y 25); cualquier
  otra cosa → `DEFAULT_PAGE_SIZE` **importado**, nunca el número escrito a mano.
- `sort`: `campo:asc|desc`, y **el campo se valida contra `PRESENTATION_QUERYABLE.sortable`**
  importado del contrato, no contra una lista escrita aquí. Un campo desconocido no es un error: es
  «sin orden» y la lista cae al orden por defecto del adaptador.
- `search`: se lee y se emite, porque `PRESENTATION_QUERYABLE.searchable` es `true`. (Al revés que
  pedidos, que lo fuerza a `''` porque su lista blanca dice `false`.)
- `filters`: **siempre `{}`**. La única columna filtrable del contrato es `createdAt`, y esta
  pantalla no pinta esa columna (R9): ofrecer un filtro por un dato que no se ve sería ruido.

El resultado se pasa **entero y sin traducir** a `listPresentationsAction`: `DataTableParams` es
campo a campo la misma forma que `ListQuery`, y `createListQuerySchema()` es un `z.strictObject`,
así que inventar aquí una clave de más rompería el `parse`.

Acotar es de esta capa; **validar sigue siendo del dominio**, que además no falla ante un campo no
declarado (QC-57 R5). Se acota igual para no depender de esa cortesía y para que la URL que el
usuario ve sea la que la consulta usa. Esto cumple R14 **antes** de llamar a la action.

### 5.3 Los tres estados (R15, R16, R17)

```tsx
// page.tsx (Server Component)
<Suspense key={buildPresentationListQuery(params)} fallback={<PresentationListSkeleton rows={params.pageSize} />}>
  <PresentationListSection params={params} />
</Suspense>
```

La `key` es lo que hace que el esqueleto vuelva a aparecer en **cada** cambio de página, tamaño,
orden o búsqueda, no solo en la primera carga. `PresentationListSection` es un Server Component
`async` que llama a `listPresentationsAction` y despacha:

- `status: 'error'` → `<PresentationListError code message />` con reintento a la misma URL (R17,
  y también el camino de R7 cuando el código es `unauthorized`). **No** se pinta tabla vacía.
- `items.length === 0` → `<PresentationListEmpty>` con `<PresentationSheet />` como `children`
  («crear la primera») y, si la página pedida era mayor que el total, un enlace a la primera página
  derivado de `presentationListHref` (R15).
- resto → disparador de alta + `<PresentationTable />`.

Los tres estados se pintan **fuera** de `<DataTable>` y la tabla recibe siempre `status="idle"`,
igual que en pedidos: el vacío de esta pantalla lleva copy y acción propios, y el «cargando» lo
aporta el `<Suspense>` del servidor.

### 5.4 Refresco tras mutar (R25)

Las actions de QC-20 **no revalidan nada** y esta ficha **no las toca** (R30: el módulo está
`done`). Tras un estado `success` el componente cliente llama a `router.refresh()`, que vuelve a
ejecutar el Server Component de la lista **con la misma URL** y por tanto conserva página, orden y
búsqueda. Misma deuda menor ya anotada por QC-22 y QC-35: si más pantallas repiten el patrón,
`revalidatePath` en las actions es más barato, y eso es una ficha de backend.

## 6. La columna de acciones de fila — pregunta abierta 1, **heredada resuelta**

La decisión cerrada dice: «si al construir no está resuelta, la resuelve esta ficha». **Ya está
resuelta**, y la respuesta se hereda tal cual (evidencia en `§0`):

- `DataTableColumn.cell` devuelve **`ReactNode`**, no `string`
  (`data-table-types.ts:67`). La pregunta 4 de QC-55 nació porque la propuesta original devolvía
  cadena; QC-35 la cambió al construir el primer consumidor.
- `DataTableProps.emptyAction?: ReactNode` cubre el «crear la primera» **desde dentro** de la tabla
  — aunque esta pantalla, como pedidos, pinta su vacío **fuera** de `<DataTable>` por tener copy y
  acción propios.
- El precedente de uso está escrito en `order-columns.tsx:178-185`: la columna de acciones es una
  **columna normal**, con `id: 'actions'`, `align: 'end'`, `pinnable: false`, sin `sortable` y sin
  `filter`. Ese mismo archivo deja anotado «Esto es lo que QC-56 adopta».

**Consecuencia para esta ficha (R20):** se declara igual y **no se añade ninguna prop
`renderRowActions`** ni ningún otro mecanismo al componente compartido, que sería una segunda
manera de hacer lo que `cell` ya hace. `components/shared/data-table/` no se abre.

**Consecuencia de diseño colateral:** `presentation-columns.tsx` es un **módulo de cliente** y
lleva extensión `.tsx`, porque una configuración con funciones de celda que devuelven elementos no
cruza la frontera servidor→cliente. Por eso `PresentationListSection` (servidor) baja solo datos
serializables y es `presentation-table.tsx` quien monta `<DataTable>`.

Las dos columnas, en concreto:

| id | label | align | sortable | filter | pinnable | celda |
| --- | --- | --- | --- | --- | --- | --- |
| `name` | Nombre | `start` | **sí** (está en `PRESENTATION_QUERYABLE.sortable`) | — | por defecto | `presentation.name` tal cual |
| `actions` | Acciones | `end` | — | — | `false` | `<PresentationRowActions />` |

El test de R9 **recorre esta declaración** en vez de listar literales: añadir una columna de
`createdAt` o de `id` obligaría a tocarla, que es justo lo que el test en negativo vigila.

`searchable` se deja **ausente** (= `true`) en `<DataTable>`, al revés que pedidos: aquí la lista
blanca del contrato dice `searchable: true`, así que la caja de búsqueda **no miente** (R10).

## 7. Formulario, panel y borrado (R21-R28)

Se reutiliza **tal cual** el patrón ya mergeado en login, productos, proveedores y pedidos:
`<form action={formAction}>` con campos **no controlados** + `useActionState(action, { status:
'idle' })`. Ninguna dependencia nueva (`§9`).

- **Validación en cliente antes de enviar** con `createPresentationSchema` / 
  `updatePresentationSchema`, importados del **contrato público** de `inventario`, que es
  client-safe. Los mensajes por campo salen de la **misma regla** que valida el servidor —incluido
  el `refine` que rechaza un nombre que normaliza a vacío, como `"---"`—. El servidor revalida
  igual: el cliente nunca es la frontera.
- **Un solo campo** (R22): `<Input name="name">`, `text-base` (16 px) para que iOS no haga zoom.
- **Errores por código estable, nunca por texto** (R24): `duplicate_name` → junto al campo;
  `invalid_input`, `not_found` y `unauthorized` → región de error del formulario (`role="alert"`).
  Con error el panel **no se cierra** y lo escrito no se pierde.
- **Un solo componente de panel** para alta y edición (`presentation-sheet.tsx`), con dos
  disparadores: el de la barra («Crear presentación», también usado como `children` del estado
  vacío) y el de la fila (`PresentationRowSheetActions`), que precarga el nombre actual y liga el id
  con `updatePresentationAction.bind(null, id)` (R23). Es el patrón de `order-sheet.tsx`.
- **Borrado** (`delete-presentation-dialog.tsx`): `alert-dialog` que **nombra la presentación** y
  advierte que no se puede deshacer. Sin confirmar no se invoca nada: la operación sale del
  `submit` de un `<form>` que vive **dentro** del contenido del diálogo, con el `id` en un `input`
  oculto, que es la forma que la action espera (R27).
- **Presentación en uso** (R28): la action devuelve `code: 'presentation_in_use'`, y ese código se
  pinta **en la región de error del propio diálogo**, que **sigue abierto**. Cerrarlo dejaría al
  usuario creyendo que se borró. Aquí, a diferencia de productos y pedidos, el borrado es **físico**
  y el rechazo lo produce la FK real, no una regla de estado: es el caso normal, no el raro.
- **Éxito** (R25): cerrar, `toast.success(...)` sobre el `<Toaster />` que el layout **ya monta**
  —no se monta otro (R26)— y `router.refresh()` con la misma URL.

**Multiplataforma (R18, R34):** botones de acción con `min-h-11 min-w-11` (≥ 44×44 px) y **siempre
visibles**, nada detrás de `:hover`; el desbordamiento horizontal lo absorbe el primitivo
`components/ui/table.tsx`, que ya envuelve la tabla en un contenedor con `overflow-x-auto`, así que
el documento no se desplaza; sin `100vh` y sin `position: fixed`. Con dos columnas el
desbordamiento es improbable, pero se comprueba igual con `tests/helpers/viewport.ts` en angosto y
ancho. **No se declara ninguna excepción de escritorio.**

## 8. Modelo de datos, RLS y migraciones

**No aplica, y se dice explícitamente porque `docs/specs.md` lo pide:** esta feature **no crea ni
modifica ninguna tabla**, no añade migraciones, no toca políticas de RLS y no cambia el esquema
Prisma. La tabla `presentations` y su `ON DELETE RESTRICT` son de QC-14/QC-20, mergeados. El
`design.md` de QC-20 es la referencia para el modelo.

## 9. Dependencias y primitivas (R31)

**Ninguna librería nueva, y ningún `shadcn add`.** Las primitivas que la pantalla necesita —`table`,
`sheet`, `alert-dialog`, `input`, `label`, `button`, `sonner`, `skeleton`, `select`— **ya están
todas** en `components/ui/` (verificado en `§0`). Nada que instalar, nada que aprobar, ninguna fila
nueva en `docs/dependencias.md`, y `guard-dependencias-aprobadas` no tiene por qué mirar nada
distinto.

Si al implementar apareciera la necesidad de una librería, el `frontend_dev` **para y la propone**
con los cuatro checks de `docs/architecture.md > Dependencias de terceros`; **no la instala**
(regla 7 de `CLAUDE.md`).

## 10. E2E (decisión cerrada: sí, ligera)

`e2e/presentaciones.spec.ts`, sobre el patrón de `e2e/pedidos.spec.ts` e `e2e/inventario.spec.ts`
(fixtures propios con prefijo `qc45_e2e_`, `RUN_ID` por worker, limpieza en `afterAll`). Dos
recorridos:

1. **Camino del Administrador:** login → la pantalla → crear una presentación → verla en la lista.
2. **Rechazo de quien no tiene el permiso:** sesión válida **sin `inventario.modificar`** (el
   Operador del seed) → pide la URL → la respuesta es **404** y se ve el 404 de la zona privada, sin
   la tabla (R6). Se afirma sobre el `status()` de la respuesta y sobre el marcador del 404 privado,
   **no** sobre un `waitForURL` a otra pantalla: ya no hay redirección. Este es el que
   `CHECKPOINTS.md` exige por tocar permisos.

   Detalle que se paga si se olvida: desde QC-75 R11 el login **no lleva a todo el mundo al
   dashboard**, aterriza en el primer ítem visible del menú. El Operador aterriza en `/inventario`,
   así que el helper de login tiene que recibir el aterrizaje esperado en vez de darlo por hecho.

   La navegación de los dos recorridos se hace **por URL**, no pulsando el ítem del menú: lo que
   este spec afirma es el camino de la pantalla, y el filtrado del menú por permiso ya lo cubre
   `e2e/permisos.spec.ts` con sus propios fixtures (además de los tests de R4).

**Cuidado con los datos:** `presentations` es una tabla real y compartida, y **el borrado es
físico**. Los nombres van prefijados por `RUN_ID`, los asserts filtran por ese nombre —nunca «la
primera fila» ni el total, porque Chromium y WebKit corren a la vez— y la limpieza tiene que
tolerar que una presentación quede enganchada por un producto de otro spec (`presentation_in_use`):
si el borrado falla, el `afterAll` **no** tumba la suite.

## 11. Alternativas descartadas (y por qué)

**A — Copiar el esqueleto de la pantalla de productos (tabla propia + `*-list-toolbar`).** Es lo
más rápido: `app/(private)/inventario/` tiene ya todas las piezas y basta con quitar columnas.
**Descartada por decisión humana del 2026-09-07**, y el motivo técnico se sostiene solo: sería una
**tercera copia** del esqueleto —parser, sección, tabla, paginación, vacío, error y carga—, es decir,
justo el código que **QC-56** existe para borrar. Se usa la tabla compartida.

**B — Añadir a la tabla compartida una prop `renderRowActions` (o una columna especial de tipo
`actions`).** Era la salida «limpia» mientras `cell` devolvía `string`. **Descartada**: `cell` ya
devuelve `ReactNode` desde QC-35, así que la prop sería una segunda manera de hacer lo mismo, y
además obligaría a abrir `components/shared/data-table/`, que R20 prohíbe.

**C — Ocultar el ítem por `inventario.consultar` en vez de por `inventario.modificar`.** Es el
permiso de lectura del mismo módulo y suena al mínimo razonable para «ver una pantalla».
**Descartada** (`§3.2`): lo tiene **también el Operador** en `SEED_ROLE_PERMISSIONS`, así que no
ocultaría nada, y llevaría a alguien que solo puede leer a una pantalla cuyo propósito entero es
escribir. Se usa `inventario.modificar`, que es el mismo código que exige la página.

> **Esta alternativa decía antes lo contrario.** Hasta el 2026-09-08, C era «ocultar por permiso en
> vez de por rol», y estaba **descartada**: la razón era que la puerta de la ruta cortaba por
> `ROUTE_ROLE_RULES` —por **nombre de rol**—, así que ocultar por permiso habría dejado un ítem
> visible que rebota al pulsarlo. QC-75 borró ese mecanismo y hoy la ruta corta por el **mismo**
> permiso, con lo que el motivo del descarte desapareció y la alternativa se convirtió en la
> decisión. Lo que sigue descartado, con motivo propio, es el permiso concreto `inventario.consultar`.

**D — Filtrar el menú entero por permisos, en el servidor, en esta ficha.** Es la solución buena.
**Descartada por alcance en su día**: la ficha del board lo sacaba expresamente («Lo que NO entra»)
y lo asignaba a **QC-75**. **Y así fue: QC-75 ya la construyó y está mergeada**, con
`NavLink.permission` obligatorio y `filterNavItemsByPermissions` aplicado en el layout privado. Esta
ficha **la consume** en vez de reimplementarla, y no toca `PRIVATE_NAV_ITEMS` más allá de añadir su
propio ítem, ni `AppSidebar`, ni el layout.

**E — Colgar presentaciones de `/inventario/presentaciones` (submenú de Inventario).** Es la opción
que QC-22 dejó escrita como pregunta abierta P1. **Descartada por decisión humana del 2026-09-07**:
presentaciones y unidades son catálogos cortos de apoyo, y agruparlos en Configuración deja
Inventario para lo que se opera de verdad. Coste asumido: el usuario que busca presentaciones no
las encuentra bajo Inventario. Mitigación ya existente: el selector de presentación del formulario
de producto permite **crear** una sin salir de allí (QC-22 R24).

**F — Declarar `/configuracion` como prefijo privado, para que QC-39 herede la protección.** Ahorra
una línea a la ficha siguiente. **Descartada**: hoy no existe ninguna pantalla en `/configuracion`,
y proteger por adelantado un tramo vacío hace creer que hay algo donde no lo hay. Cada ficha declara
su prefijo **con su test**, que es el patrón de `FORMULAS_ROUTE` (`/produccion/formulas`, sin nada
declarado para `/produccion`). El permiso, además, ya no se declararía por prefijo aunque se
quisiera: desde QC-75 lo exige cada `page.tsx` (`§4`), y por tanto **no es heredable por tramo de
URL** en absoluto.

**G — Añadir a la lista las columnas `createdAt` / `updatedAt`, «que ya vienen en la vista».**
Están en `PresentationView` y son ordenables según la lista blanca. **Descartada por decisión
humana**: `Presentation` tiene un solo campo de negocio, y llenar la tabla con marcas de tiempo que
nadie pidió es la misma decisión que QC-22 tomó al no pintar autoría. Si algún día hacen falta, es
una línea en `presentation-columns.tsx`.

**H — Página aparte para el alta y la edición (`…/nueva`, `…/[id]`).** Más simple de testear y
mejor en móvil estrecho. **Descartada por decisión humana**: panel lateral, heredado de QC-22. Se
anota para que el reviewer vea que se consideró; el coste —el formulario no es enlazable— se mitiga
porque la lista sí conserva su estado en la URL.

**I — Estado de lista en `useState` + `useEffect` con la action.** **Descartada** por lo mismo que
en QC-22 y QC-35: perdería página, orden y búsqueda al recargar o al volver con «atrás», que es
justo lo que R21 exige al cerrar el panel, y obligaría a gestionar a mano carreras entre peticiones
que `Suspense` resuelve solo.

## 12. Riesgos y cómo se mitigan

1. **Duplicar layout, sidebar o tabla compartida** (el choque features 4↔10). Mitiga **T0**.
2. **Dos guardias ponen el gate en rojo** en cuanto exista `page.tsx` mal cableada:
   `guard-rutas-privadas-cubiertas` si falta el prefijo privado, y `guard-pantallas-exigen-permiso`
   si falta la línea de `requirePagePermission`. Por eso **T1** (constante + prefijo) va **antes**
   que la página, y el corte por permiso es la primera línea que se escribe dentro de ella.
3. **Tocar `components/shared/data-table/`** «para que la columna de acciones quepa mejor». Lo
   prohíbe R20 y lo vigila un test de T4 que afirma que esos archivos no cambian respecto a `dev`.
4. **Que el ítem declare un permiso distinto del que exige la página**, dejando un enlace que
   devuelve 404. Es el riesgo real ahora que el ocultado y la puerta son dos declaraciones separadas
   en dos archivos. Mitiga el test de R4/R6, que afirma la **igualdad** de los dos códigos
   derivándola en vez de repetir el literal; y `guard-nav-permisos-declarados`, que rechaza un
   código fuera del catálogo de QC-74 (un `'inventario.modificarr'` ocultaría el ítem en silencio).
   El caso simétrico también se cubre: con los permisos del Administrador la lista filtrada sale
   **idéntica** a `PRIVATE_NAV_ITEMS`, así que esta ficha no oculta ítems de otras pantallas.
5. **Dos archivos ajenos calientes** (`routes.ts`, `private-nav.ts`). Declarados en `§1` para que el
   leader vigile el paralelismo. `layout.tsx` **ya no lo es**: esta ficha no lo toca.
6. **El E2E ensucia una tabla compartida y el borrado es físico**: la limpieza tolera
   `presentation_in_use` (`§10`).
7. **QC-56 (migración de productos y recetas) toca la tabla compartida en paralelo.** Esta ficha
   solo la **consume** por su barrel; si el contrato cambiara bajo los pies, se para y se avisa: no
   se «arregla» editando el componente compartido.
