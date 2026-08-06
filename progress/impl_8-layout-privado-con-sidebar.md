# progress/impl_8-layout-privado-con-sidebar.md

> Feature 8 — `layout-privado-con-sidebar` · zona `frontend` · complejidad `medium`
> Rama: `feature/8-layout-privado-con-sidebar` · worktree: `.worktrees/8-layout-privado-con-sidebar/`
> Spec aprobado por el humano el 2026-08-06. Implementado el 2026-08-06.
> Tasks T0–T20 de `specs/8-layout-privado-con-sidebar/tasks.md`, todas marcadas `[x]`.

## Veredicto

**Las 20 tasks cerradas. `./init.sh` completo en verde: 16 archivos de test, 141 tests.
Los 36 requisitos (R1–R36) tienen test nombrado, sin huecos.** Cero archivos de otras
features modificados: el diff contra `dev` es **32 archivos, todos añadidos (`A`), ninguno
modificado**.

---

## T0 — Precondiciones heredadas de la feature 7 (evidencia)

| # | Qué pedía T0 | Evidencia real |
| --- | --- | --- |
| 1 | `components.json` | Existe. `"style": "base-nova"` — **dato clave, ver «Desviación 1»** |
| 2 | `lib/utils.ts` exportando `cn` | `lib/utils.ts:4` → `export function cn(...inputs: ClassValue[])` |
| 3 | `components/ui/button.tsx` | Existe (junto a `card`, `input`, `label`, `sonner`) |
| 4 | Config de Vitest + script `test` | **`vitest.config.mts`, NO `vitest.config.ts`** — ver abajo. Scripts `test`, `test:rapido`, `test:guardias` presentes. `pnpm test` arrancó en verde antes de tocar nada: 5 archivos / 56 tests |
| 5 | `lib/types/auth.ts` exportando `DASHBOARD_ROUTE` | `lib/types/auth.ts:43` → `export const DASHBOARD_ROUTE = '/dashboard';` |

**Corrección de hecho aplicada al spec.** T0 punto 4 citaba `vitest.config.ts`; el nombre real
en `dev` es **`vitest.config.mts`**, y además la config tiene **dos `projects`** (`ui` en jsdom
para `tests/**/*.test.tsx` y `tests/ui/**`; `node` para el resto), producto de la unificación
de las features 1 y 7. Corregida la cita en `specs/8-layout-privado-con-sidebar/tasks.md`
(T0.4 y el «aviso de superficie» de T12). Es un dato de hecho, no un cambio de alcance.

**Preparación del worktree** (no es una task; queda anotado porque sin ello no corre nada):
`pnpm install` (el worktree no hereda `node_modules`), `pnpm exec prisma generate --schema=db/schema.prisma`
(pnpm ignora los build scripts de Prisma) y un `pnpm run build` inicial para generar los tipos
de ruta de Next 16 (sin él, `app/layout.tsx:20` falla con `Cannot find name 'LayoutProps'`).
Ninguna de las tres cosas es un fallo del repo: es el coste de un worktree limpio.

---

## T1 — Los seis puntos de verificación obligatoria del bloque `sidebar`

Leídos sobre el archivo generado, **no asumidos**. Los tres primeros confirman el design; los
tres últimos lo **contradicen** y cambiaron la implementación.

| # | Qué había que verificar | Resultado real |
| --- | --- | --- |
| (a) | Nombres de los subcomponentes | **Todos los que asume el design existen**: `Sidebar`, `SidebarProvider`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton`, `SidebarInset`, `SidebarTrigger`, `SidebarGroup*`, `SidebarRail`, `useSidebar`… |
| (b) | Breakpoint de `hooks/use-mobile.ts` | **768 px**, exactamente lo que fija D6. `MOBILE_BREAKPOINT = 768`, consulta `(max-width: 767px)`. **Sin desviación** |
| (c) | ¿`SidebarTrigger` emite `aria-expanded`? | **NO**, ni `aria-expanded` ni `aria-controls`. Es un `<Button>` con `onClick` a `toggleSidebar()` y un `sr-only` en inglés. **El wrapper de T11 es imprescindible para R23 y R31**, tal como preveía `design.md > 5.6` |
| (d) | Cómo se declara el colapso a icono | `Sidebar` acepta `collapsible` con valores `offcanvas` / `icon` / `none`, **por defecto `offcanvas`** → hay que poner `collapsible="icon"` explícito. `useSidebar()` devuelve `state`, `open`, `setOpen`, `openMobile`, `setOpenMobile`, `isMobile`, `toggleSidebar`. Extra no documentado: el provider registra un atajo global **Ctrl/Cmd+B** |
| (e) | ¿La prop `tooltip` mantiene el nombre accesible en modo icono? | **NO.** El `TooltipContent` vive en un `Portal` y **sólo se monta al hover/focus**; Base UI lo enlaza como *descripción*, no como nombre. En reposo el texto **no está en el árbol accesible**. → **R25 se cumple por la vía B** que `design.md > 5.5` ya autorizaba: `aria-label={item.label}` explícito en el componente de la feature, **sin editar `components/ui/`** |
| (f) | ¿El `SidebarProvider` persiste el estado colapsado? | **Escribe la cookie pero NUNCA la lee.** Asigna `document.cookie` en `setOpen`, y el estado inicial es `React.useState(defaultOpen)` con `defaultOpen = true`. **`design.md > 5.5` se equivoca al decir «que él mismo lee al montar».** → **R28 se implementa por la vía B**, también pre-autorizada: el layout de servidor lee la cookie de UI con `cookies()` y pasa `defaultOpen`. **Amplió el alcance de T11 y de T16**, como el propio design advertía en su riesgo 11 |

**Extra verificado (necesario para R23/R31):** el panel **no lleva ningún `id`**, y un `id`
pasado a `<Sidebar>` **se pierde en móvil** (en escritorio los props caen en
`div[data-slot="sidebar-container"]`; en móvil caen en `<Sheet>`, que es `Dialog.Root` y no un
elemento DOM). Solución adoptada: `AppSidebar` envuelve las tres regiones en un
`<div id={SIDEBAR_PANEL_ID} data-testid="private-sidebar">`, presente en **ambas** ramas.

**Riesgo 6 (`app/globals.css`) descartado:** `git diff app/globals.css` → **vacío**. Los tokens
`--sidebar-*` ya venían del `shadcn init` de la feature 7. `/login` y `app/page.tsx` intactos.

**T2:** `collapsible` **no** vino arrastrado por T1; lo añadió T2 junto a `avatar` y
`dropdown-menu`. **`sonner` no se añadió** (D9). `package.json` y `pnpm-lock.yaml` **no
cambiaron**: Base UI ya era dependencia de la feature 7.

---

## Desviaciones respecto al `design.md` (las tres, declaradas)

### 1. Es **Base UI**, no Radix → `render` en vez de `asChild`

`components.json` usa `"style": "base-nova"` y **todas** las primitivas generadas están sobre
`@base-ui/react`, no sobre Radix. El design (§5.3, §5.4, T10, riesgo 10) habla de `asChild` y
de Radix porque se escribió antes de que existiera `components.json` en `dev`.

**Es una traducción de API, no un cambio de alcance**: `<SidebarMenuButton render={<Link .../>}>`
donde el design decía `asChild`. Ningún requisito cambia, ninguna primitiva se sustituyó por un
componente propio y **nada de `components/ui/` se editó a mano**. `CollapsibleContent` mapea a
`Collapsible.Panel`.

Todo lo que el design daba por hecho de Radix se **verificó por ejecución** antes de confiar en
ello (arnés temporal de 10 tests, borrado después):

- `Menu.Item` tiene **`closeOnClick`, por defecto `true`** → puesto a `false` en el item de
  logout, o el menú se cerraría desmontando el `<form>` antes de que la action terminara y
  **R20/R21 se romperían en el navegador aunque el test unitario saliera verde**
  (era exactamente el riesgo 10 del design).
- `DropdownMenuTrigger` **sí** emite `aria-haspopup` y `aria-expanded` (R17).
- `Escape` cierra el menú y **devuelve el foco al disparador** (R18).
- `Collapsible.Panel` tiene `keepMounted`, por defecto `false` → **desmonta** el contenido al
  colapsar. Eso es lo que hace **verificable R10** de verdad (los hijos no están en el DOM, no
  es un `display:none` que jsdom no evaluaría).
- **No hace falta `TooltipProvider` ancestro.**
- **Base UI no emite `aria-modal`** en el diálogo móvil: la modalidad la impone marcando el
  resto del documento con `aria-hidden="true"` y `data-base-ui-inert`. Consecuencia comprobada:
  con el panel abierto **`queryByRole('main')` es `null`**. R30 afirma sobre eso, que es lo
  real, y no sobre un atributo que la primitiva no pone.

### 2. R25 y R28 se cumplen por la «vía B», la que el propio design dejaba abierta

Ver T1 (e) y (f). No es improvisación: `design.md > 5.5` prescribe ambas vías alternativas
palabra por palabra y pide que se anote. Queda anotado.

### 3. El toggle vive en `app/(private)/components/` con barrel, no suelto

El design pone `app/(private)/sidebar-toggle.tsx` junto al layout. Se escribió **antes** de que
el repo adoptara la regla `docs/architecture.md > Regla: componentes de ruta en components/ con
barrel index.ts` (commits `c666481` y `b8be46a`, posteriores al spec), que además lista
«componentes de ruta sueltos junto a `page.tsx`» como **anti-patrón que el reviewer rechaza**.
Se sigue la convención vigente del repo y el precedente de la feature 7
(`app/(public)/login/components/`): `app/(private)/components/sidebar-toggle.tsx` más
`app/(private)/components/index.ts`.

---

## Archivos creados

Diff contra `dev`: **32 archivos, todos `A` (añadidos). Ningún archivo existente modificado.**

### Generados por el CLI de shadcn/ui — nunca editados a mano
`components/ui/sidebar.tsx` · `sheet.tsx` · `separator.tsx` · `tooltip.tsx` · `skeleton.tsx`
(T1) · `avatar.tsx` · `dropdown-menu.tsx` · `collapsible.tsx` (T2) · `hooks/use-mobile.ts` (T1)

> Única intervención sobre código generado: un `// eslint-disable-next-line
> react-hooks/set-state-in-effect` con su porqué en `hooks/use-mobile.ts`. La regla del React
> Compiler que trae `eslint-config-next@16` la incumple el propio hook de shadcn, y ese
> `setState` en efecto es la forma SSR-safe de resolver un media query en el primer montaje.
> Se eligió el disable local en vez de un `override` en `eslint.config.mjs` para **no tocar un
> archivo compartido con features en vuelo**. No se reescribió el hook a mano.

### Contrato congelado — lo que la feature 10 hereda sin cambiarlo (T3–T7)
- `lib/types/session.ts` — `SessionUser` (`id`, `username`, `displayName`, `roleName: string | null`,
  todos `readonly`). **Sin `avatarUrl`** (D3/K) y **sin ningún campo de credencial**.
- `lib/services/session-stub.ts` — `getSessionUser()` y `endSession()`. **Este es el único
  archivo que la feature 10 reescribe.** Grep de `next/headers|next/navigation|cookies|prisma|supabase|fetch`:
  una sola coincidencia, la línea 11, que es **el comentario que declara que no los usa**.
- `lib/navigation/private-nav.ts` — constantes de ruta, `NavLink | NavGroup | NavItem`,
  `PRIVATE_NAV_ITEMS` (5 ítems), `PRIVATE_NAV_LABEL`, `BRAND_LABEL`, `BRAND_SHORT_LABEL`.
  `DASHBOARD_ROUTE` **importado** de `lib/types/auth.ts`, no redeclarado.
- `lib/utils/initials.ts` — `getInitials(displayName)`, puro.
- `lib/actions/logout.ts` — `'use server'` y `logoutAction(): Promise<void>`. Sin `redirect`,
  sin cookies, sin valor de retorno.

**Verificación deliberada de la profundidad de un nivel (T5):** metiendo un hijo con
`kind: 'group'` dentro de `items`, `tsc` falla con
`error TS2322: Type '"group"' is not assignable to type '"link"'`. La profundidad la garantiza
**el tipo, no una convención**. Cambio descartado, no está commiteado.

### UI (T8–T11)
- `components/private/logout-menu-item.tsx` — `useFormStatus`, `disabled` y `aria-busy`, **sin `useState`**.
- `components/private/nav-user.tsx` — pie con menú desplegable. Grep de
  `fetch|cookies|next/headers|session-stub|onClick`: **sólo comentarios**, cero código.
- `components/private/app-sidebar.tsx` — marca, navegación con submenús, pie. Exporta
  `SIDEBAR_PANEL_ID`. Grep de literales de ruta: **sin coincidencias** (R13).
- `app/(private)/layout.tsx` — RSC. **Único punto que llama a `getSessionUser()`**; reparte por
  props. Lee la cookie de UI para `defaultOpen`. **Sin `<Toaster />`** (R36). **Sin `page.tsx`** (D11).
- `app/(private)/components/sidebar-toggle.tsx` y su `index.ts` — wrapper con `aria-expanded`
  (real por viewport: `openMobile` en angosto, `open` en ancho), `aria-controls={SIDEBAR_PANEL_ID}`
  y `aria-label` propio en español.
- `lib/utils/sidebar-state.ts` — `SIDEBAR_STATE_COOKIE` y `readSidebarOpenState()`, helper puro
  que hace **testeable** la persistencia de R28 en vez de dejarla como «funciona en prod».

### Tests (T12–T17)
`tests/helpers/viewport.ts` · `tests/unit/initials.test.ts` · `logout-action.test.ts` ·
`nav-user.test.tsx` · `app-sidebar.test.tsx` · `sidebar-desktop.test.tsx` ·
`sidebar-mobile.test.tsx` · `private-layout.test.tsx`

> **`tests/setup.ts`, `vitest.config.mts` y `eslint.config.mjs` no se tocaron**, a propósito:
> son archivos compartidos con features en vuelo. El stub de `matchMedia` (riesgo 3, el fallo
> más probable de esta feature) vive en un helper independiente que cada test importa, con
> `setViewportWidth` / `resetViewport` / `clearSidebarStateCookie` / `readSidebarStateCookie`.
> El humo de T12 (layout montando en ancho y en angosto sin excepción, 2/2 verde) era
> desechable por diseño y se borró: lo cubren de sobra `sidebar-desktop` y `sidebar-mobile`.

---

## Mapa de trazabilidad `R<n> → test` (T19)

**Los 36 requisitos, sin huecos.** Nombres reales, copiados de la corrida.

| Req | Test (nombre real del `it`) | Archivo |
| --- | --- | --- |
| R1 | `renderiza el contenido de la pantalla dentro del armazon privado` | `private-layout.test.tsx` |
| R2 | `la barra lateral expone sus tres regiones: marca, navegacion y pie de usuario` | `app-sidebar.test.tsx` |
| R3 | `la navegacion es un landmark de navegacion con nombre accesible` | `app-sidebar.test.tsx` |
| R4 | `la marca es un enlace a DASHBOARD_ROUTE con nombre accesible` | `app-sidebar.test.tsx` |
| R5 | `el contenido de la pantalla se renderiza dentro de un unico main` | `private-layout.test.tsx` |
| R6 | `renderiza una entrada por cada item de PRIVATE_NAV_ITEMS y en su orden` | `app-sidebar.test.tsx` |
| R7 | `con una coleccion de navegacion vacia no renderiza entradas y el layout sigue en pie` | `app-sidebar.test.tsx` |
| R8 | `marca con aria-current solo el enlace simple cuya ruta coincide con la activa` | `app-sidebar.test.tsx` |
| R9 | `un item con hijos se renderiza como control de expansion, no como enlace, y es activable por teclado` | `app-sidebar.test.tsx` |
| R10 | `el submenu colapsado expone aria-expanded=false y no expone sus hijos; expandido los expone` | `app-sidebar.test.tsx` |
| R11 | `activar el control del submenu alterna entre expandido y colapsado` | `app-sidebar.test.tsx` |
| R12 | `si la ruta activa es la de un hijo, su submenu arranca expandido y el hijo queda marcado como actual` | `app-sidebar.test.tsx` |
| R13 | `los destinos de la marca y de todas las entradas salen de las constantes exportadas` | `app-sidebar.test.tsx` |
| R14 | `muestra nombre y rol recibidos por props` y `omite la linea de rol cuando no viene informado` | `nav-user.test.tsx` |
| R15 | `muestra las iniciales derivadas del nombre visible` y los 8 casos borde de `getInitials` | `nav-user.test.tsx` y `initials.test.ts` |
| R16 | `el layout obtiene el usuario del proveedor de sesion y lo pasa por props` y `el sidebar no importa el proveedor de sesion` | `private-layout.test.tsx` |
| R17 | `el pie ofrece un menu desplegable con disparador accesible por teclado que declara que abre un menu` | `nav-user.test.tsx` |
| R18 | `Escape cierra el menu de usuario y devuelve el foco a su disparador` | `nav-user.test.tsx` |
| R19 | `el cierre de sesion vive dentro de un form real cuya accion es logoutAction` | `nav-user.test.tsx` |
| R20 | `invoca la accion de cierre de sesion exactamente una vez por activacion` (UI) y `invoca el cierre de sesion del proveedor exactamente una vez y no devuelve valor` (contrato) | `nav-user.test.tsx` y `logout-action.test.ts` |
| R21 | `deshabilita el control mientras el cierre de sesion esta en curso` | `nav-user.test.tsx` |
| R22 | `la accion de cierre de sesion no navega, no toca cookies y no accede a datos` | `logout-action.test.ts` |
| R23 | `en viewport ancho la barra es persistente y el control declara aria-expanded y aria-controls` | `sidebar-desktop.test.tsx` |
| R24 | `activar el control alterna a modo icono y muestra la marca corta` | `sidebar-desktop.test.tsx` |
| R25 | `en modo icono cada entrada conserva su nombre accesible` | `sidebar-desktop.test.tsx` |
| R26 | `en modo icono los hijos de un submenu siguen siendo alcanzables desde su control` | `sidebar-desktop.test.tsx` |
| R27 | `en modo icono el pie sigue ofreciendo el menu de usuario y el cierre de sesion` | `sidebar-desktop.test.tsx` |
| R28 | `el modo colapsado se conserva al volver a montar el layout` y `el modo expandido se conserva al volver a montar el layout` | `sidebar-desktop.test.tsx` |
| R29 | `en viewport angosto la barra arranca oculta y ofrece el control de apertura` | `sidebar-mobile.test.tsx` |
| R30 | `al abrir en viewport angosto muestra un dialogo modal y mueve el foco dentro` | `sidebar-mobile.test.tsx` |
| R31 | `el control refleja el estado con aria-expanded y referencia el panel con aria-controls` | `sidebar-mobile.test.tsx` |
| R32 | `Escape cierra el panel superpuesto y devuelve el foco al control de apertura` | `sidebar-mobile.test.tsx` |
| R33 | `activar un enlace, simple o de submenu, cierra el panel superpuesto` | `sidebar-mobile.test.tsx` |
| R34 | `en viewport angosto no se aplica el modo icono` | `sidebar-mobile.test.tsx` |
| R35 | `el layout no valida sesion, no accede a base de datos y no emite cookie de sesion` y `la accion de cierre de sesion no navega, no toca cookies y no accede a datos` | `private-layout.test.tsx` y `logout-action.test.ts` |
| R36 | `el layout privado no monta ninguna region de notificaciones` | `private-layout.test.tsx` |

### Notas sobre cómo se prueban los requisitos negativos y el de persistencia

- **R16, R22, R35 y R36 son negativos**: «no fetchea», «no navega», «no monta toasts». Un test
  de runtime no puede probar una ausencia futura, así que además del assert de comportamiento
  llevan **guardia sobre el código fuente** (`readFileSync` y búsqueda de `redirect`,
  `next/headers`, `cookies`, `prisma`, `supabase`, `fetch(`, `sonner`, `<Toaster`), filtrando
  líneas de comentario porque los propios módulos **mencionan** esas palabras a propósito en sus
  cabeceras. Sin la guardia, R22 seguiría verde el día que alguien añada un `redirect`.
- **R35 «única cookie»**: la guardia extrae todas las operaciones sobre el `cookieStore` de
  `app/(private)/layout.tsx` y exige que el método sea `get` y el argumento sea
  `SIDEBAR_STATE_COOKIE`, más un assert de runtime sobre el spy de `cookies().get`. Es lo que
  distingue «cookie de preferencia de UI» (admitida) de «cookie de sesión» (prohibida).
- **R28 prueba el viaje redondo completo**, no que se escriba una cookie: montar → colapsar →
  `readSidebarStateCookie()` → `cleanup()` → **remontar el layout con el mock de `cookies()`
  sirviendo lo que quedó en `document.cookie`** → afirmar `data-state="collapsed"` y
  `aria-expanded="false"` iniciales. El puente es obligatorio **porque el primitivo escribe la
  cookie pero no la lee**: un test que sólo mirara `document.cookie` probaría al primitivo, no a
  R28. Cookie limpiada en `beforeEach` **y** `afterEach` (riesgo 11), o un caso contamina al siguiente.
- **R34 se prueba incluso partiendo de `sidebar_state=false`** (modo icono persistido de
  escritorio): en angosto ese estado se ignora. Es lo que impide que alguien rompa R34 mezclando
  los dos mecanismos.
- **Regla de asserts respetada en todos los archivos**: roles ARIA, `data-testid` y **constantes
  exportadas**. Ni un assert sobre el literal del copy. Los tests **iteran `PRIVATE_NAV_ITEMS`
  importada**, así que sustituir los 5 ítems de ejemplo (D2) no romperá ningún test.

---

## Salida real de los tests

### init.sh completo (gate de PR, F2.4)

```
== Arnes SDD :: init (modo: completo) ==
OK node v22.13.1
OK dependencias presentes
OK worktrees bajo control (3 ademas del principal)
-> pnpm run typecheck
OK typecheck paso
-> pnpm run lint
OK lint paso
-> pnpm run test

 RUN  v4.1.10 C:/Users/Cristian/Documents/trabajo/arc/labs/.worktrees/8-layout-privado-con-sidebar

Not implemented: navigation to another Document
Not implemented: navigation to another Document

 Test Files  16 passed (16)
      Tests  141 passed (141)
   Duration  14.99s

OK test paso
OK todas las migraciones tienen down.sql
OK .env presente
== init OK ==
```

Los dos `Not implemented: navigation` son de jsdom al clicar un enlace real en R33: no fallan
nada y son la prueba de que el enlace es un enlace de verdad.

### Los 7 archivos de esta feature, uno a uno (`--reporter=verbose`)

```
 PASS |node| initials.test.ts > getInitials > devuelve cadena vacia cuando el nombre visible esta vacio
 PASS |node| initials.test.ts > getInitials > devuelve cadena vacia cuando el nombre visible es solo espacios
 PASS |node| initials.test.ts > getInitials > devuelve una sola inicial cuando el nombre tiene una sola palabra
 PASS |node| initials.test.ts > getInitials > devuelve la inicial de cada palabra cuando el nombre tiene dos
 PASS |node| initials.test.ts > getInitials > con tres o mas palabras usa la primera y la ultima
 PASS |node| initials.test.ts > getInitials > tolera espacios multiples, iniciales y finales
 PASS |node| initials.test.ts > getInitials > devuelve las iniciales siempre en mayusculas
 PASS |node| initials.test.ts > getInitials > nunca devuelve mas de dos caracteres
 PASS |node| logout-action.test.ts > logoutAction > invoca el cierre de sesion del proveedor exactamente una vez y no devuelve valor
 PASS |node| logout-action.test.ts > logoutAction > la accion de cierre de sesion no navega, no toca cookies y no accede a datos
 PASS |ui| nav-user.test.tsx > pie de usuario > muestra nombre y rol recibidos por props
 PASS |ui| nav-user.test.tsx > pie de usuario > omite la linea de rol cuando no viene informado
 PASS |ui| nav-user.test.tsx > pie de usuario > muestra las iniciales derivadas del nombre visible
 PASS |ui| nav-user.test.tsx > pie de usuario > el pie ofrece un menu desplegable con disparador accesible por teclado que declara que abre un menu
 PASS |ui| nav-user.test.tsx > pie de usuario > Escape cierra el menu de usuario y devuelve el foco a su disparador
 PASS |ui| nav-user.test.tsx > pie de usuario > el cierre de sesion vive dentro de un form real cuya accion es logoutAction
 PASS |ui| nav-user.test.tsx > pie de usuario > invoca la accion de cierre de sesion exactamente una vez por activacion
 PASS |ui| nav-user.test.tsx > pie de usuario > deshabilita el control mientras el cierre de sesion esta en curso
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > la barra lateral expone sus tres regiones: marca, navegacion y pie de usuario
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > la navegacion es un landmark de navegacion con nombre accesible
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > la marca es un enlace a DASHBOARD_ROUTE con nombre accesible
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > renderiza una entrada por cada item de PRIVATE_NAV_ITEMS y en su orden
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > con una coleccion de navegacion vacia no renderiza entradas y el layout sigue en pie
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > marca con aria-current solo el enlace simple cuya ruta coincide con la activa
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > un item con hijos se renderiza como control de expansion, no como enlace, y es activable por teclado
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > el submenu colapsado expone aria-expanded=false y no expone sus hijos; expandido los expone
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > activar el control del submenu alterna entre expandido y colapsado
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > si la ruta activa es la de un hijo, su submenu arranca expandido y el hijo queda marcado como actual
 PASS |ui| app-sidebar.test.tsx > barra lateral privada > los destinos de la marca y de todas las entradas salen de las constantes exportadas
 PASS |ui| sidebar-desktop.test.tsx > en viewport ancho la barra es persistente y el control declara aria-expanded y aria-controls
 PASS |ui| sidebar-desktop.test.tsx > activar el control alterna a modo icono y muestra la marca corta
 PASS |ui| sidebar-desktop.test.tsx > en modo icono cada entrada conserva su nombre accesible
 PASS |ui| sidebar-desktop.test.tsx > en modo icono los hijos de un submenu siguen siendo alcanzables desde su control
 PASS |ui| sidebar-desktop.test.tsx > en modo icono el pie sigue ofreciendo el menu de usuario y el cierre de sesion
 PASS |ui| sidebar-desktop.test.tsx > el modo colapsado se conserva al volver a montar el layout
 PASS |ui| sidebar-desktop.test.tsx > el modo expandido se conserva al volver a montar el layout
 PASS |ui| sidebar-mobile.test.tsx > en viewport angosto la barra arranca oculta y ofrece el control de apertura
 PASS |ui| sidebar-mobile.test.tsx > al abrir en viewport angosto muestra un dialogo modal y mueve el foco dentro
 PASS |ui| sidebar-mobile.test.tsx > el control refleja el estado con aria-expanded y referencia el panel con aria-controls
 PASS |ui| sidebar-mobile.test.tsx > Escape cierra el panel superpuesto y devuelve el foco al control de apertura
 PASS |ui| sidebar-mobile.test.tsx > activar un enlace, simple o de submenu, cierra el panel superpuesto
 PASS |ui| sidebar-mobile.test.tsx > en viewport angosto no se aplica el modo icono
 PASS |ui| private-layout.test.tsx > layout privado > renderiza el contenido de la pantalla dentro del armazon privado
 PASS |ui| private-layout.test.tsx > layout privado > el contenido de la pantalla se renderiza dentro de un unico main
 PASS |ui| private-layout.test.tsx > layout privado > el layout obtiene el usuario del proveedor de sesion y lo pasa por props
 PASS |ui| private-layout.test.tsx > layout privado > el sidebar no importa el proveedor de sesion
 PASS |ui| private-layout.test.tsx > layout privado > el layout no valida sesion, no accede a base de datos y no emite cookie de sesion
 PASS |ui| private-layout.test.tsx > layout privado > el layout privado no monta ninguna region de notificaciones
```

**47 tests propios de la feature 8**, sobre un total de 141 en la suite. Los 94 restantes son de
las features 1 y 7 y **siguen en verde**: esta feature no rompió nada ajeno.

---

## Checklist de `CHECKPOINTS.md` — qué aplica y qué no (declarado, no omitido)

- **Datos y seguridad (Supabase)** — tablas, RLS con `FORCE ROW LEVEL SECURITY`, migraciones con
  `down.sql`, `db:rollback`, repositorios Prisma, secretos, webhooks: **NO APLICA**. Esta
  feature no crea ni consulta ninguna tabla y no añade ninguna variable de entorno (R35).
- **Única cookie de la feature**: `sidebar_state`, **preferencia de UI, no sesión**. No lleva
  PII, no identifica a nadie, no la consume ningún service y la feature 10 no la toca. R35 la
  admite explícitamente y R28 la exige. Se declara aquí para que nadie lea «hay una cookie» como
  contradicción con «esta feature no toca sesión».
- **«Páginas protegidas validan permisos en servidor vía `cookies()`»**: **NO APLICA en esta
  feature, y no por olvido**: es literalmente el alcance de la **feature 10**. Hasta que
  aterrice, **la zona privada no está protegida**. Hecho conocido y aceptado, no un hallazgo.
- **«Componentes `private/` reciben datos por props; no fetchean datos sensibles»**: **SÍ
  APLICA**, es requisito duro (R16) y tiene test **y guardia de código**.
- **«Mutaciones internas usan Server Actions, no fetch a API routes»**: **SÍ APLICA** (R19–R22).
  El logout es un formulario real con `action={logoutAction}`, sin `onClick` y sin route handler.
- **Capas Controller/Service/Repository**: aplica **parcialmente** — hay controller (Server
  Action) y un stub de servicio; **no hay repositorio, por diseño**.
- **Autorización validada en el service con test**: **NO APLICA**; no hay service de negocio ni
  permiso que validar.
- **E2E de flujo crítico**: **NO APLICA — diferido** (T18, decisión humana del 2026-08-06).

---

## T18 — E2E: diferido (decisión cerrada, no una opción abierta)

`CHECKPOINTS.md` pide E2E para flujos críticos. **Se difiere por decisión humana del
2026-08-06**: la zona privada **no expone ninguna URL** (D11) y no hay sesión real (R35), así
que **no hay ningún camino que un E2E pueda ejercitar**. Lo aporta la feature 9 (primera
pantalla privada) o la 10 (sesión real).

**Confirmado por el build**, no asumido: `pnpm run build` lista `/`, `/_not-found` y `/login`, y
nada más. Un route group con layout y sin `page.tsx` no produce URL. **No hay verificación
manual por navegador en esta feature**; la evidencia son los 47 tests de componente (riesgo 5).

**Para el leader:** anotar en `progress/current.md > Deudas y cosas abiertas`.

---

## Deudas y notas que esta feature deja registradas (no silenciosas)

1. **E2E de la zona privada, diferido** (T18): lo aporta la feature 9 o la 10.
2. **Los 5 ítems de navegación son placeholder** (D2): salvo el dashboard, sus rutas **no
   existen y dan 404 — es lo esperado**. Ninguna feature del backlog cubre inventario,
   notificaciones, compras ni producción. Cada módulo futuro sustituye su ítem y su constante;
   los tests iteran la constante, así que no se romperán al hacerlo.
3. **Sin toasts en la zona privada** (D9): nota de estado, no deuda inventada. La feature que
   necesite un toast privado monta su región de notificaciones donde decida. Ojo: si el logout
   real de la feature 10 quisiera reportar fallos por toast, **tendría que tocar
   `app/(private)/layout.tsx`** — dicho aquí para que no se lea como incumplimiento de «la 10 no
   toca UI».
4. **Constantes de ruta dispersas**: `DASHBOARD_ROUTE` en `lib/types/auth.ts` (feature 7), las
   demás en `lib/navigation/private-nav.ts`. Consolidarlas en un `lib/routes.ts` tocaría
   archivos de la 7 y no se hace aquí.
5. **`lib/utils.ts` (el `cn`) y el directorio `lib/utils/` conviven.** TypeScript resuelve
   `@/lib/utils` al archivo y `@/lib/utils/initials` al directorio, y typecheck está verde, pero
   es una ambigüedad que puede confundir. El design pide explícitamente `lib/utils/initials.ts`
   y `docs/architecture.md` documenta `lib/utils/` como carpeta, así que se deja como está y se
   anota.
6. **El `SidebarProvider` registra un atajo global Ctrl/Cmd+B** que alterna la barra. Viene del
   primitivo, no lo pide ningún requisito y no tiene test. Anotado para que nadie lo descubra
   tarde como comportamiento fantasma.
7. **`hooks/use-mobile.ts` lleva un `eslint-disable` de una línea** sobre código generado. Si
   algún día se regenera el hook, el disable se pierde y el lint vuelve a rojo.
8. **La feature 10 sólo debe reescribir `lib/services/session-stub.ts`** y añadir el
   `redirect(LOGIN_ROUTE)` dentro de `lib/actions/logout.ts`. **Cero archivos de UI.** Ese es el
   criterio con el que se juzgará aquella costura.

---

## Cómo quedó la costura con la feature 10 (contrato congelado)

```
app/(private)/layout.tsx                      <- RSC. Llama a getSessionUser() y reparte props
app/(private)/components/sidebar-toggle.tsx   <- client. aria-expanded / aria-controls
components/private/app-sidebar.tsx            <- client. NUNCA fetchea; solo props
components/private/nav-user.tsx               <- client. Menu desplegable + formulario de logout
components/private/logout-menu-item.tsx       <- client. useFormStatus()
        |  importan logoutAction y los tipos, y nada mas
        v
lib/actions/logout.ts                         <- Server Action. CONTRATO CONGELADO
        |  llama a endSession()
        v
lib/services/session-stub.ts    <- EL UNICO ARCHIVO QUE LA FEATURE 10 REESCRIBE
```

`logoutAction()` no recibe parámetros y no devuelve valor: **no hay estado de formulario que la
feature 10 pueda romper**. Es deliberado — el logout real termina en `redirect`, y `redirect` no
devuelve.
