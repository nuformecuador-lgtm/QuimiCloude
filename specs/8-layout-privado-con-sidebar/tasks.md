# Feature 8 — layout-privado-con-sidebar · tasks.md

> **Revisión 2026-08-06.** Incorpora las respuestas humanas: entran `collapsible` y
> `dropdown-menu` (T2), el módulo de navegación con submenús (T5), el helper de iniciales
> (T6), el pie como menú desplegable (T8) y dos bloques de tests separados para los dos
> mecanismos de colapso (T15, T16). **Sale `sonner`**: la zona privada no monta `<Toaster />`
> (D9). El E2E queda **cerrado como diferido** (T17), no como opción abierta.
>
> **Revisión 2026-08-06 (b).** Cerradas las dos últimas preguntas: **la persistencia del modo
> colapsado es requisito propio (R28, nuevo) con test propio** en T16, y el menú de usuario
> contiene **sólo** el cierre de sesión (D12). **Renumeración**: los antiguos R28–R35 son ahora
> **R29–R36**. Ya no queda ninguna pregunta abierta.

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica sus
dependencias y su **criterio de hecho** (verificable, no «parece bien»). Un commit por task,
formato `docs/conventions.md > Commits`.

**Recordatorio de gate** (`docs/verification.md` + `AGENTS.md > Regla del gate`): el
`frontend_dev` corre **sólo** `pnpm run typecheck`, `pnpm run lint` y
`pnpm exec vitest related --run <sus archivos>`. **No corre la suite completa.**
`./init.sh --rapido` lo corre el **leader** al cerrar cada tanda; `./init.sh` **completo**, al
cerrar la feature y **antes del PR, sin excepción**.

**Precondición de fase 2** (`progress/current.md > Feature 8`): la implementación **no
arranca** hasta que la feature 7 esté `done` y su base esté en `dev`. Esta feature **no
contiene** tasks de `shadcn init` ni de montar Vitest: los hereda.

---

## Bloque 0 — Precondiciones y primitivas

### [x] T0 — Verificar la base heredada de la feature 7 (BLOQUEA TODO)
- **Depende de**: que la feature 7 esté `done` y mergeada en `dev`.
- **Qué**: comprobar, uno por uno, que existen en el worktree de la 8 (tras
  `git merge origin/dev`):
  1. `components.json` (shadcn inicializado)
  2. `lib/utils.ts` exportando `cn`
  3. `components/ui/button.tsx`
  4. `vitest.config.mts` (**el nombre real en `dev` es `.mts`, no `.ts`**; corregido el
     2026-08-06 contra el repo) con sus dos `projects` (`ui` en jsdom para `tests/**/*.test.tsx`
     y `tests/ui/**`, `node` para el resto) y el script `test` en `package.json`, y que
     `pnpm test` arranca en verde
  5. `lib/types/auth.ts` exportando `DASHBOARD_ROUTE`
- **Si falta cualquiera de los cinco: PARAR y avisar al leader.** No se «arregla» corriendo
  `shadcn init` ni montando Vitest: eso duplicaría el trabajo de la feature 7 y garantizaría
  conflicto de merge en `components.json`, `lib/utils.ts`, `app/globals.css` y `package.json`
  (`design.md > 10.7`).
- **Hecho cuando**: los cinco puntos están verificados y anotados con su evidencia en
  `progress/impl_8-layout-privado-con-sidebar.md`.

### [x] T1 — Añadir el bloque `sidebar` de shadcn/ui
- **Depende de**: T0.
- **Qué**: `pnpm dlx shadcn@latest add sidebar`. Genera `components/ui/sidebar.tsx`, arrastra
  `sheet` / `separator` / `tooltip` / `skeleton` y el hook `hooks/use-mobile.ts`, y añade los
  tokens `--sidebar-*` a `app/globals.css`.
  - **Verificación obligatoria, no asumible** (`design.md > 10.1`): leer el archivo generado y
    anotar (a) los nombres reales de los subcomponentes que se usarán (`SidebarProvider`,
    `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarMenu`,
    `SidebarMenuButton`, `SidebarMenuSub`, `SidebarInset`, `SidebarTrigger`, `useSidebar`),
    (b) **el breakpoint real del hook `use-mobile`** (D6 asume 768 px), (c) **si
    `SidebarTrigger` emite ya `aria-expanded`** (R31), (d) **cómo se declara el colapso a modo
    icono**, (e) **si la prop `tooltip` mantiene el nombre accesible en modo icono** (R25) y
    (f) **si el `SidebarProvider` persiste el estado colapsado por defecto** y con qué cookie
    (R28, `design.md > 5.5`). Si no persiste, R28 se implementa leyendo esa cookie de UI en el
    layout de servidor y **se reporta al leader**: cambia el alcance de T11.
    Si algo difiere, **parar y avisar al leader**; no sustituir por un componente propio ni
    editar `components/ui/` a mano.
- **Hecho cuando**: existen los archivos, `pnpm run typecheck` y `pnpm run lint` pasan, el diff
  de `app/globals.css` está revisado (riesgo 6) y los **seis** puntos de verificación están
  anotados en `progress/impl_8-layout-privado-con-sidebar.md`.

### [x] T2 — [P] Añadir `avatar`, `dropdown-menu` y `collapsible`
- **Depende de**: T0.
- **Qué**: `pnpm dlx shadcn@latest add avatar dropdown-menu collapsible`.
  - `avatar` → iniciales del pie (D3, R15).
  - `dropdown-menu` → menú de usuario (D4, R17) **y** submenú flotante en modo icono (R26).
  - `collapsible` → submenús inline en modo expandido (R9–R12). Puede venir ya arrastrado por
    T1; si es así, se anota y no se duplica.
- **Hecho cuando**: existen `components/ui/avatar.tsx`, `dropdown-menu.tsx` y
  `collapsible.tsx`, y `pnpm run typecheck` pasa. **Ningún archivo de `components/ui/` se
  edita a mano en esta feature.** **`sonner` NO se añade** (D9).

---

## Bloque 1 — Contrato congelado (lo que la feature 10 no volverá a tocar)

### [x] T3 — [P] `lib/types/session.ts`
- **Depende de**: T0.
- **Qué**: el tipo `SessionUser` exactamente como está en `design.md > 4.1`: `id`, `username`,
  `displayName`, `roleName: string | null`, todos `readonly`. **Sin `avatarUrl`** (D3, K de
  alternativas descartadas).
- **Hecho cuando**: `pnpm run typecheck` pasa y **ningún campo del tipo es una credencial**
  (`password`, hash, token) — verificación visual explícita del reviewer.

### [x] T4 — `lib/services/session-stub.ts`
- **Depende de**: T3.
- **Qué**: `getSessionUser(): Promise<SessionUser>` con valor de relleno fijo y
  `endSession(): Promise<void>` no-op. Comentario de cabecera diciendo que **la feature 10
  reemplaza este archivo** y que ningún archivo de UI lo importa.
- **Hecho cuando**: el módulo no importa `next/headers`, `next/navigation`, Prisma ni Supabase
  (grep explícito antes de commitear) y `pnpm run typecheck` pasa.

### [x] T5 — [P] `lib/navigation/private-nav.ts` (navegación con submenús)
- **Depende de**: T0.
- **Qué**: implementar `design.md > 4.3`: constantes de ruta exportadas, unión discriminada
  `NavLink | NavGroup` (**`NavGroup.items` es `readonly NavLink[]`**, un solo nivel garantizado
  por el tipo) y `PRIVATE_NAV_ITEMS` con los **5 ítems de ejemplo**: Dashboard, Inventario,
  Notificaciones, Compras (2 hijos), Producción (2 hijos). `DASHBOARD_ROUTE` **importado** de
  `lib/types/auth.ts`, no redeclarado.
  - **Comentario de cabecera obligatorio**: estos ítems y sus rutas son **placeholder (D2)**;
    salvo el dashboard, **ninguna ruta existe** y hoy dan **404, que es lo esperado**; la
    feature que traiga cada módulo los sustituye.
- **Hecho cuando**: `pnpm run typecheck` pasa, un submenú anidado dentro de otro **no compila**
  (verificación deliberada, se descarta después) y **no hay literales de ruta fuera de las
  constantes** (R13).

### [x] T6 — [P] `lib/utils/initials.ts`
- **Depende de**: T0.
- **Qué**: helper puro que deriva las iniciales de un nombre visible (R15). Sin efectos, sin
  dependencias de React.
- **Hecho cuando**: typecheck limpio y tiene test propio en T11 (nombre vacío, un solo nombre,
  nombre con varias palabras).

### [x] T7 — `lib/actions/logout.ts`
- **Depende de**: T4.
- **Qué**: `'use server'` + `logoutAction(): Promise<void>` que llama a `endSession()`. Sin
  `redirect`, sin cookies, sin `try/catch` vacío.
- **Hecho cuando**: la firma coincide **literalmente** con el contrato de `design.md > 3`;
  typecheck y lint limpios.

---

## Bloque 2 — UI

### [x] T8 — `components/private/logout-menu-item.tsx`
- **Depende de**: T1, T2, T7.
- **Qué**: componente cliente que usa `useFormStatus()` de `react-dom` y renderiza el control
  de cierre de sesión con `disabled={pending}` y `aria-busy={pending}` (R21). **Componente
  separado del que renderiza el `<form>` por necesidad técnica**: `useFormStatus` sólo lee el
  `<form>` ancestro (lección documentada en `specs/7-pantalla-de-login/design.md > 5.2`).
- **Hecho cuando**: typecheck/lint limpios y el componente **no declara ningún `useState`**.

### [x] T9 — `components/private/nav-user.tsx`
- **Depende de**: T2, T3, T6, T7, T8.
- **Qué**: componente cliente que recibe `user: SessionUser` **por props** y renderiza en
  `SidebarFooter`:
  - disparador del menú con `Avatar`/`AvatarFallback` de iniciales (R15), `displayName` y
    `roleName` **sólo si viene informado** (R14);
  - `DropdownMenu` de shadcn como menú de usuario (R17), con cierre por `Escape` y retorno de
    foco (R18);
  - dentro del menú, `<form action={logoutAction}>` con `<LogoutMenuItem />` (R19). **Sin
    entrada de perfil** (D12): el menú contiene **sólo** el cierre de sesión;
  - en modo icono, el disparador se reduce al avatar conservando su nombre accesible (R27);
  - `data-testid` estables.
  - Ojo al detalle de `design.md > 10.10`: que el `DropdownMenuItem` no cancele el envío del
    formulario.
- **Hecho cuando**: typecheck/lint limpios y el archivo **no contiene** `fetch`, `cookies`,
  `onClick` de logout ni ninguna lectura de datos (grep explícito antes de commitear) — R16.

### [x] T10 — `components/private/app-sidebar.tsx`
- **Depende de**: T1, T2, T3, T5, T9.
- **Qué**: componente cliente `AppSidebar({ user, navItems })` que compone:
  - `SidebarHeader` con la marca como **enlace** a `DASHBOARD_ROUTE`, versión larga en modo
    expandido y **«QC»** en modo icono (R4, R24, D7);
  - `SidebarContent` con la navegación dentro de un landmark de navegación con `aria-label`
    (R3), renderizando **una entrada por ítem** en orden (R6) y tolerando lista vacía (R7);
  - ítem simple → `SidebarMenuButton asChild` + `<Link>`, con `aria-current="page"` si coincide
    con `usePathname()` (R8);
  - ítem con submenú → `Collapsible` con disparador `<button>` real (R9, R11), `aria-expanded`
    (R10), hijos en `SidebarMenuSub` con `aria-current` (R12), y `defaultOpen` calculado por la
    ruta activa (R12);
  - en modo icono (`useSidebar().state === 'collapsed'`), el ítem con submenú se presenta como
    `DropdownMenu` flotante (R26) y cada entrada conserva su nombre accesible vía `tooltip` o
    `aria-label` (R25);
  - `setOpenMobile(false)` en el `onClick` de **todo** enlace, incluidos los hijos (R33);
  - `SidebarFooter` con `<NavUser user={user} />` (R14).
- **Hecho cuando**: typecheck/lint limpios, no hay ningún literal de ruta en el archivo (R13) y
  el componente **no importa `session-stub`** (los datos entran sólo por props, R16).

### [x] T11 — `app/(private)/sidebar-toggle.tsx` + `app/(private)/layout.tsx`
- **Depende de**: T1, T4, T5, T10.
- **Qué**:
  - `sidebar-toggle.tsx` (client): envuelve `SidebarTrigger` añadiendo `aria-expanded` (estado
    real según viewport) y `aria-controls` con el `id` del panel (R23, R31). Si T1 confirmó que
    el primitivo ya emite `aria-expanded`, el wrapper sólo aporta `aria-controls` — y se anota.
  - `layout.tsx`: Server Component (sin `'use client'`) que hace `await getSessionUser()` y pasa
    el resultado por props a `<AppSidebar />` (R1, R14, R16); compone `SidebarProvider` →
    `AppSidebar` + `SidebarInset` con el `<SidebarToggle />` en la cabecera y el `<main>` que
    renderiza `{children}` (R5); declara el `<Sidebar>` con colapso **a modo icono** (R24) y
    **con la persistencia del modo activada** — por defecto del primitivo o, si T1(f) dijo que
    no persiste, pasando el estado inicial leído de la cookie de UI (R28, `design.md > 5.5`);
    tipa sus props explícitamente como `{ children: React.ReactNode }`, **no** con
    `LayoutProps<"/">` (`design.md > 5.2`, riesgo 4).
  - **NO monta `<Toaster />`** (D9, R36). **No crea ninguna `page.tsx`** (D11).
- **Hecho cuando**: `pnpm run build` pasa, typecheck/lint limpios, y queda anotado en
  `progress/impl_...md` que la zona privada **no expone URL todavía** (riesgo 5).

---

## Bloque 3 — Tests y trazabilidad

### [x] T12 — Stub de `matchMedia` para los tests (BLOQUEA T14–T17)
- **Depende de**: T1.
- **Qué**: jsdom **no implementa `window.matchMedia`** y el hook de viewport lo usa: sin stub,
  todo test que renderice el layout revienta (`design.md > 10.3`). Añadir un helper de test que
  permita **fijar el ancho de viewport por test**, para poder separar el mecanismo A (ancho) del
  B (angosto).
- **Hecho cuando**: un test de humo renderiza el layout en ancho y en angosto y ambos montan sin
  excepción.
- **Aviso de superficie**: si el helper toca el `setupFiles` de `vitest.config.mts` o
  `tests/setup.ts` (archivos de las features 1 y 7), avisar al leader antes.

### [x] T13 — [P] `tests/unit/initials.test.ts` y `tests/unit/logout-action.test.ts`
- **Depende de**: T6, T7. No necesita T12 (no renderiza DOM).
- **Qué**: helper de iniciales (casos borde) y tests de la Server Action mockeando
  `lib/services/session-stub`. Nombres que describen comportamiento
  (`docs/conventions.md > Tests`).
- **Hecho cuando**: cubre R22 y R35 y `pnpm exec vitest related --run lib/actions/logout.ts
  lib/utils/initials.ts` sale verde.

### [x] T14 — [P] `tests/unit/nav-user.test.tsx`
- **Depende de**: T9, T12.
- **Qué**: render con un `SessionUser` construido en el test; mock de `lib/actions/logout` para
  contar invocaciones (R20) y para mantener la promesa pendiente y observar el estado
  deshabilitado (R21). Caso `roleName: null` (R14).
- **Hecho cuando**: cubre R14, R15, R17, R18, R19, R20, R21 y pasa en verde.

### [x] T15 — [P] `tests/unit/app-sidebar.test.tsx`
- **Depende de**: T10, T12.
- **Qué**: render de `AppSidebar` con props del test; mock de `next/navigation`
  (`usePathname`) para R8 y R12; iteración de `PRIVATE_NAV_ITEMS` **importada** para R6/R13;
  caso de lista vacía para R7; submenús: expandir/colapsar, `aria-expanded`, teclado y apertura
  automática por ruta activa (R9–R12).
- **Hecho cuando**: cubre R2, R3, R4, R6, R7, R8, R9, R10, R11, R12, R13 y pasa en verde.
- **Nota**: los asserts van sobre roles ARIA, `data-testid` y constantes exportadas, **nunca**
  sobre literales de copy.

### [x] T16 — `tests/unit/sidebar-desktop.test.tsx` (mecanismo A) y
`tests/unit/sidebar-mobile.test.tsx` (mecanismo B)
- **Depende de**: T11, T12.
- **Qué**: **dos archivos separados**, porque son dos mecanismos distintos (D5) y mezclarlos en
  un archivo es cómo se acaba probando uno y creyendo que se probó el otro.
  - **desktop** (viewport ancho fijado en el test): barra visible y persistente + control con
    `aria-expanded`/`aria-controls` (R23); alternar a modo icono y marca corta «QC» (R24);
    nombre accesible conservado en modo icono (R25); hijos de submenú alcanzables en modo icono
    (R26); menú de usuario y logout alcanzables en modo icono (R27); **persistencia del modo
    entre montajes** (R28): colapsar, desmontar y volver a montar el layout en el mismo entorno
    debe reabrirlo en modo icono, y expandido tras expandir. Limpiar la cookie de UI entre
    casos o un test contamina al siguiente (`design.md > 10.11`).
  - **mobile** (viewport angosto): oculta por defecto + control de apertura (R29); abrir →
    diálogo modal y foco dentro (R30); `aria-expanded`/`aria-controls` en ambos estados (R31);
    `Escape` cierra y devuelve el foco (R32); clic en un enlace (simple y de submenú) cierra el
    panel (R33); **no se aplica modo icono** (R34).
  - Interacciones con `@testing-library/user-event`, no con `fireEvent`.
- **Hecho cuando**: cubre R23–R34 y ambos archivos pasan en verde.

### [x] T17 — `tests/unit/private-layout.test.tsx`
- **Depende de**: T11, T12.
- **Qué**: render del layout con un `children` de prueba; mock de `lib/services/session-stub`
  (R16). Incluye el test **negativo** de R36: el layout **no** monta ninguna región de
  notificaciones.
- **Hecho cuando**: cubre R1, R5, R16, R35, R36 y pasa en verde.

### [x] T18 — E2E: **diferido** (decisión cerrada, no opción)
- **Depende de**: T11.
- **Qué**: `CHECKPOINTS.md` pide E2E para flujos críticos. **Decisión humana del 2026-08-06:
  se difiere** — la zona privada no expone ninguna URL (D11) y no hay sesión real (R35), así
  que no hay camino que ejercitar. El E2E de la zona privada lo aporta la feature 9 (primera
  pantalla) o la 10 (sesión real).
- **Hecho cuando**: la decisión está escrita en
  `progress/impl_8-layout-privado-con-sidebar.md` y la deuda anotada por el leader en
  `progress/current.md > Deudas y cosas abiertas`. **No hay nada que implementar en esta task**;
  existe para que la ausencia de E2E quede registrada y no se lea como olvido.

### T19 — Mapa de trazabilidad `R<n> → test`
- **Depende de**: T13, T14, T15, T16, T17, T18.
- **Qué**: volcar la tabla de abajo, ya con los nombres reales de los tests, en
  `progress/impl_8-layout-privado-con-sidebar.md`, junto con los archivos tocados y la salida
  real de los tests.
- **Hecho cuando**: **los 36 requisitos (R1–R36)** tienen al menos un test nombrado. Un hueco es
  hallazgo bloqueante del reviewer (`docs/verification.md > Regla del reviewer`).

---

## Mapa de trazabilidad previsto (`R<n> → test`)

| Req | Test previsto | Archivo |
| --- | --- | --- |
| R1 | `renderiza el contenido de la pantalla dentro del armazon privado` | private-layout.test.tsx |
| R2 | `la barra lateral expone sus tres regiones: marca, navegacion y pie de usuario` | app-sidebar.test.tsx |
| R3 | `la navegacion es un landmark de navegacion con nombre accesible` | app-sidebar.test.tsx |
| R4 | `la marca es un enlace a DASHBOARD_ROUTE con nombre accesible` | app-sidebar.test.tsx |
| R5 | `el contenido de la pantalla se renderiza dentro de un unico main` | private-layout.test.tsx |
| R6 | `renderiza una entrada por cada item de PRIVATE_NAV_ITEMS y en su orden` | app-sidebar.test.tsx |
| R7 | `con una coleccion de navegacion vacia no renderiza entradas y el layout sigue en pie` | app-sidebar.test.tsx |
| R8 | `marca con aria-current solo el enlace simple cuya ruta coincide con la activa` | app-sidebar.test.tsx |
| R9 | `un item con hijos se renderiza como control de expansion, no como enlace, y es activable por teclado` | app-sidebar.test.tsx |
| R10 | `el submenu colapsado expone aria-expanded=false y no expone sus hijos; expandido los expone` | app-sidebar.test.tsx |
| R11 | `activar el control del submenu alterna entre expandido y colapsado` | app-sidebar.test.tsx |
| R12 | `si la ruta activa es la de un hijo, su submenu arranca expandido y el hijo queda marcado como actual` | app-sidebar.test.tsx |
| R13 | `los destinos de la marca y de todas las entradas salen de las constantes exportadas` | app-sidebar.test.tsx |
| R14 | `muestra nombre y rol recibidos por props` + `omite la linea de rol cuando no viene informado` | nav-user.test.tsx |
| R15 | `muestra las iniciales derivadas del nombre visible` (+ casos borde del helper) | nav-user.test.tsx + initials.test.ts |
| R16 | `el layout obtiene el usuario del proveedor de sesion y lo pasa por props` + `el sidebar no importa el proveedor de sesion` | private-layout.test.tsx |
| R17 | `el pie ofrece un menu desplegable con disparador accesible por teclado que declara que abre un menu` | nav-user.test.tsx |
| R18 | `Escape cierra el menu de usuario y devuelve el foco a su disparador` | nav-user.test.tsx |
| R19 | `el cierre de sesion vive dentro de un form real cuya accion es logoutAction` | nav-user.test.tsx |
| R20 | `invoca la accion de cierre de sesion exactamente una vez por activacion` | nav-user.test.tsx |
| R21 | `deshabilita el control mientras el cierre de sesion esta en curso` | nav-user.test.tsx |
| R22 | `la accion de cierre de sesion no navega, no toca cookies y no accede a datos` | logout-action.test.ts |
| R23 | `en viewport ancho la barra es persistente y el control declara aria-expanded y aria-controls` | sidebar-desktop.test.tsx |
| R24 | `activar el control alterna a modo icono y muestra la marca corta` | sidebar-desktop.test.tsx |
| R25 | `en modo icono cada entrada conserva su nombre accesible` | sidebar-desktop.test.tsx |
| R26 | `en modo icono los hijos de un submenu siguen siendo alcanzables desde su control` | sidebar-desktop.test.tsx |
| R27 | `en modo icono el pie sigue ofreciendo el menu de usuario y el cierre de sesion` | sidebar-desktop.test.tsx |
| R28 | `el modo colapsado se conserva al volver a montar el layout` + `el modo expandido se conserva al volver a montar el layout` | sidebar-desktop.test.tsx |
| R29 | `en viewport angosto la barra arranca oculta y ofrece el control de apertura` | sidebar-mobile.test.tsx |
| R30 | `al abrir en viewport angosto muestra un dialogo modal y mueve el foco dentro` | sidebar-mobile.test.tsx |
| R31 | `el control refleja el estado con aria-expanded y referencia el panel con aria-controls` | sidebar-mobile.test.tsx |
| R32 | `Escape cierra el panel superpuesto y devuelve el foco al control de apertura` | sidebar-mobile.test.tsx |
| R33 | `activar un enlace, simple o de submenu, cierra el panel superpuesto` | sidebar-mobile.test.tsx |
| R34 | `en viewport angosto no se aplica el modo icono` | sidebar-mobile.test.tsx |
| R35 | `el layout no valida sesion, no accede a base de datos y no emite cookie de sesion` | private-layout.test.tsx + logout-action.test.ts |
| R36 | `el layout privado no monta ninguna region de notificaciones` | private-layout.test.tsx |

Ningún requisito queda huérfano: R1–R36, sin saltos. **R28 tiene test propio a propósito**: hoy
la persistencia la da el primitivo por defecto, y sin test una refactorización podría apagarla
sin poner nada en rojo (`design.md > 5.5`).

---

## Cierre

### T20 — Gate completo y PR
- **Depende de**: T19.
- **Hecho cuando**: `./init.sh` (completo, sin flags) termina en verde — **lo corre el
  leader**, no el `frontend_dev` —, `progress/impl_8-layout-privado-con-sidebar.md` tiene el
  mapa `R<n> → test` y la salida real de los tests, y el PR está abierto contra `dev` con
  título `feat(8-layout-privado-con-sidebar): …`.

### Checklist de `CHECKPOINTS.md`: qué aplica «no aplica» (declararlo, no omitirlo)

- **Datos y seguridad (Supabase)** — tablas nuevas, RLS + `FORCE ROW LEVEL SECURITY`,
  migraciones con `down.sql`, `pnpm run db:rollback`, acceso sólo por repositorio Prisma,
  secretos por entorno, webhooks: **NO APLICA**. Esta feature no crea ni consulta ninguna tabla
  y no añade ninguna variable de entorno (R35, `design.md > 8`). **Única cookie de la feature**:
  la de preferencia de UI que exige R28 — **no es cookie de sesión** y R35 la admite de forma
  explícita (`design.md > 5.5` y `> 8`).
- **«Paginas protegidas validan permisos en el servidor via `cookies()`»**: **NO APLICA en esta
  feature**, y no por olvido — es literalmente el alcance de la **feature 10**
  (`feature_list.json` id 10). Hasta que aterrice, la zona privada **no está protegida**: es un
  hecho conocido y aceptado, no un hallazgo del reviewer.
- **«Componentes `private/` reciben datos por props; no fetchean datos sensibles»**: **SÍ
  APLICA** y es requisito duro (R16), con test.
- **«Mutaciones internas usan Server Actions, no fetch a API routes»**: **SÍ APLICA**
  (R19–R22).
- **Patrón de capas Controller/Service/Repository**: aplica **parcialmente** — hay controller
  (Server Action) y un stub de servicio; **no hay repositorio** por diseño.
- **Autorización validada en el service con su test**: **NO APLICA**; no hay service de negocio
  ni permiso que validar en esta feature.
- **E2E de flujo crítico**: **NO APLICA en esta feature**, diferido por decisión humana del
  2026-08-06 (T18). La deuda queda anotada, no silenciada.

### Deudas y notas que esta feature deja registradas (no silenciosas)

- **E2E de la zona privada diferido** (T18): lo aporta la feature 9 o la 10. Que lo registre el
  leader en `progress/current.md > Deudas y cosas abiertas`.
- **Los 5 ítems de navegación son placeholder** (D2): salvo el dashboard, sus rutas **no
  existen y dan 404**. Ninguna feature del backlog cubre inventario, notificaciones, compras ni
  producción todavía. Cada módulo futuro sustituye su ítem y su constante.
- **Sin toasts en la zona privada** (D9): nota de estado, no deuda inventada. La feature que
  necesite un toast privado monta el `<Toaster />` donde decida (`design.md > 6`).
- **Constantes de ruta dispersas**: `DASHBOARD_ROUTE` vive en `lib/types/auth.ts` (feature 7);
  las demás, en `lib/navigation/private-nav.ts`. Consolidarlas en un `lib/routes.ts` tocaría
  archivos de la 7 y no se hace aquí (`design.md > 4.3`).
- **La zona privada no expone ninguna URL** hasta la feature 9 (D11): no hay verificación
  manual por navegador en esta feature.
- **No quedan preguntas abiertas** (2026-08-06): las 12 que tuvo el spec están cerradas en
  `requirements.md > Decisiones cerradas`. Si aparece una ambigüedad nueva al implementar, el
  `frontend_dev` **para y la reporta al leader**; no la rellena con supuestos.
