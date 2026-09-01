# Feature 8 — layout-privado-con-sidebar · design.md

> **Revisión 2026-08-06.** Incorpora las respuestas humanas a las 10 preguntas abiertas. Los
> supuestos S2–S7 de la versión anterior son ahora decisiones cerradas **D1–D9**. Cambios de
> diseño: navegación con **submenús de un nivel** y 5 ítems de ejemplo (§4.3), pie como **menú
> desplegable** con nombre + rol + iniciales (§5.4), **doble mecanismo de colapso** —modo icono
> en escritorio y panel superpuesto en angosto— especificados por separado (§5.5 y §5.6), y
> **fuera el `<Toaster />`** de la zona privada (§6).
>
> **Revisión 2026-08-06 (b).** Cerradas las dos últimas preguntas: **D12** (el menú de usuario
> contiene sólo el cierre de sesión) y **D13** (el estado colapsado **se persiste**, ahora con
> requisito propio **R28** y su test; §5.5 explica por qué esa cookie es preferencia de UI y no
> sesión). **Renumeración**: los antiguos R28–R35 son ahora **R29–R36**. **No queda ninguna
> pregunta abierta** (§2).

## 0. Estado real del repo (verificado, no supuesto)

Comprobado en el worktree principal (`dev`) el 2026-08-06, antes de escribir este diseño:

| Hecho | Evidencia |
| --- | --- |
| `app/` es **la plantilla intacta de create-next-app**: sólo `favicon.ico`, `globals.css`, `layout.tsx`, `page.tsx` | glob `{app,components,lib,tests}/**/*` → 4 resultados, todos en `app/` |
| **No existe `components/`, ni `components/ui/`, ni `lib/`, ni `tests/`, ni `hooks/`** | mismo glob (cero resultados fuera de `app/`) |
| **shadcn/ui NO está inicializado**: no hay `components.json` ni `lib/utils.ts` | mismo glob |
| **No hay runner de tests**: `scripts` = `dev`, `build`, `start`, `lint`, `typecheck` | `package.json` |
| Next **16.3.0**, React **19.2.8**, App Router | `package.json > dependencies` |
| TypeScript `strict: true`, alias único `@/*` → `./*` | `tsconfig.json` |
| Tailwind **v4** sin `tailwind.config.ts`; tokens en `@theme inline` dentro de `app/globals.css` | `app/globals.css`, `package.json` (`@tailwindcss/postcss`, `tailwindcss@^4`) |
| Dark mode = `prefers-color-scheme`. **No hay clase `.dark` ni `next-themes`** | `app/globals.css` (bloque `@media (prefers-color-scheme: dark)`), `package.json` |
| El root layout ya pone `h-full antialiased` en `<html>` y `min-h-full flex flex-col` en `<body>` | `app/layout.tsx` |
| El root layout tipa sus props con el helper global `LayoutProps<"/">` | `app/layout.tsx:20` |
| Gestor de paquetes: pnpm 10.10.0 | `package.json > packageManager` |
| La feature 7 sigue `in_progress` y **no ha aterrizado en `dev`** | `feature_list.json` (id 7, `status: in_progress`), `progress/current.md > Features en curso` |

**Conclusión operativa.** Todo lo que esta feature da por hecho (shadcn/ui, Vitest,
`components/ui/button.tsx`, `lib/types/auth.ts` con `DASHBOARD_ROUTE`) **hoy no existe en
`dev`**: lo crea la feature 7 según `specs/7-pantalla-de-login/tasks.md` (T1, T2, T3, T5). Por
eso la fase 2 de esta feature está bloqueada hasta que la 7 esté `done`
(`progress/current.md > Feature 8`) y por eso `tasks.md` abre con **T0**, una verificación de
precondiciones que falla ruidosamente si la base no está. Este diseño **no** re-crea esa base
y **no** contiene ninguna task de `shadcn init` ni de montar Vitest.

## 1. Decisiones cerradas por el humano (2026-08-06)

Ya **no** son supuestos. Cada una responde a una de las 10 preguntas abiertas de la versión
anterior del spec.

- **D1 — Route group `app/(private)/`.** Decisión humana explícita («déjalo como está»).
  `docs/architecture.md > Estructura de carpetas` nombraba `(dashboard)`; **este diseño se
  aparta de esa nomenclatura a propósito y con aprobación humana fechada**, porque el grupo
  aloja toda pantalla privada del ERP y no sólo el dashboard, y porque empareja con el
  `(public)` de la feature 7 y con `components/private/`. **El reviewer no debe marcarlo como
  desviación.**
- **D2 — Navegación con dos formas de ítem y 5 ejemplos quemados.** La colección soporta
  **ítem simple** e **ítem con submenú de un solo nivel**. Se queman 5 ítems de ejemplo
  (§4.3): Dashboard, Inventario, Notificaciones (simples), Compras y Producción (con
  submenú). **Son datos de relleno (placeholder)**: salvo el dashboard (feature 9), **ninguna
  de esas rutas existe ni la crea esta feature**, y visitarlas da **404 — comportamiento
  esperado**, mismo patrón que el `FORGOT_PASSWORD_ROUTE` de la feature 7 (su supuesto S6). La
  feature que traiga cada módulo del ERP sustituye su ítem y su constante de ruta.
- **D3 — El pie muestra nombre + rol + iniciales.** Nada de imagen de avatar: la
  representación gráfica son las **iniciales derivadas del nombre visible** (R14, R15).
- **D4 — El pie es un menú desplegable**, no un botón suelto: primitiva `dropdown-menu` de
  shadcn/ui añadida por CLI. Contiene el cierre de sesión. **Sin entrada de perfil**: no hay
  ruta de perfil en el backlog y no se inventa (**D12**).
- **D5 — Dos mecanismos de colapso, distintos y especificados por separado:** (A) modo icono
  en viewport ancho (R23–R28, §5.5); (B) panel superpuesto en viewport angosto (R29–R34,
  §5.6). No se mezclan: en angosto **no** hay modo icono (R34).
- **D6 — «Angosta» = viewport `< 768 px`**, el breakpoint `md` de Tailwind, que es el que usa
  el hook `use-mobile` que genera el propio CLI de shadcn. Se adopta ese valor para no tener
  dos definiciones de «móvil» en el repo. Si el CLI vigente generase otro, el implementer
  **para y avisa** (riesgo 2).
- **D7 — Marca: «QuimiCloude» (larga) y «QC» (corta).** La corta es la que usa el modo icono.
  La larga se hereda de la decisión del 2026-08-06 sobre la feature 7 (su R23).
- **D8 — `displayName` y rol llegan ya resueltos** como texto mostrable desde quien provee la
  sesión. La UI no compone nombre y apellidos ni resuelve el rol: eso es lógica de dominio y
  no vive en un componente (`docs/architecture.md > Anti-patrones`).
- **D9 — Sin `<Toaster />` en la zona privada** (R36). `sonner` **no** es dependencia de esta
  feature y no aparece en ninguna task. Nota, no deuda: **la zona privada no tiene toasts
  hasta que una feature los pida**; la que los pida monta el `<Toaster />` donde decida. El
  `<Toaster />` de la feature 7 en `app/(public)/layout.tsx` **no se toca**.
- **D10 — Sin E2E en esta feature.** Diferido por decisión humana: no hay zona privada
  navegable todavía (ver D11). Deuda anotada para el leader (`tasks.md > T16`).
- **D11 — Esta feature no crea ninguna página.** Un route group con layout y sin `page.tsx` es
  válido en Next y no produce ninguna URL: la primera pantalla privada es la feature 9.
  Consecuencia asumida: la verificación de esta feature es por **tests de componente**, no por
  `pnpm dev` visitando una URL (riesgo 5). Crear aquí un `page.tsx` de relleno invadiría el
  alcance de la feature 9 y provocaría conflicto de archivos.
- **D12 — El menú de usuario contiene sólo el cierre de sesión** (2026-08-06). **Sin entrada
  de perfil**: no existe ruta de perfil en `feature_list.json` y no se inventa. El día que
  haga falta, la añade la feature que cree esa ruta, no ésta.
- **D13 — El estado colapsado de la barra se persiste entre navegaciones y recargas**
  (2026-08-06, R28). Deja de ser «lo que hace el primitivo por defecto» para ser **requisito
  con test propio**: que hoy funcione gratis no basta, porque una refactorización podría
  apagarlo sin poner ningún test en rojo. Detalle técnico y la distinción cookie-de-UI vs
  cookie-de-sesión, en §5.5.

## 2. Lo que sigue abierto

**Nada.** Las 12 preguntas abiertas que tuvo este spec están todas respondidas y cerradas en
`requirements.md > Decisiones cerradas` con fecha 2026-08-06. Si durante la implementación
aparece una ambigüedad nueva, el `frontend_dev` **para y la reporta al leader**; no la rellena
con supuestos (regla 6 de `CLAUDE.md`).

## 3. La costura con la feature 10 (contrato congelado)

Mismo patrón que la feature 7 (`lib/actions/login.ts` + `lib/services/login-stub.ts`): la
restricción es que **la feature 10 conecte la sesión real sin tocar ni un archivo de UI**.

```
app/(private)/layout.tsx                 ← UI (RSC). Llama a getSessionUser() y pasa props.
app/(private)/sidebar-toggle.tsx         ← UI (client). Wrapper del trigger (aria-expanded/controls)
components/private/app-sidebar.tsx       ← UI (client). NUNCA fetchea; sólo props.
components/private/nav-user.tsx          ← UI (client). Menú desplegable + <form action={logoutAction}>
components/private/logout-menu-item.tsx  ← UI (client). useFormStatus()
        │ importan logoutAction y los tipos, y nada más
        ▼
lib/actions/logout.ts                    ← Controller (Server Action). CONTRATO CONGELADO.
        │ llama a endSession()
        ▼
lib/services/session-stub.ts             ← STUB. **Este es el archivo que borra/reescribe la feature 10.**
```

### Lo que queda congelado en la feature 8 (la 10 no lo cambia)

| Pieza | Contrato |
| --- | --- |
| Tipo del usuario | `SessionUser` en `lib/types/session.ts` (§4.1) |
| Lectura de sesión | `getSessionUser(): Promise<SessionUser>` en `lib/services/session-stub.ts` |
| Acción de logout | `logoutAction(): Promise<void>` en `lib/actions/logout.ts`, `'use server'` |
| Cierre de sesión | `endSession(): Promise<void>` en `lib/services/session-stub.ts` |
| Props de la UI | `<AppSidebar user={SessionUser} navItems={readonly NavItem[]} />` |
| Navegación | `NavLink`, `NavGroup`, `NavItem` y `PRIVATE_NAV_ITEMS` en `lib/navigation/private-nav.ts` |

`logoutAction` no recibe parámetros y no devuelve valor: **no hay estado de formulario que la
feature 10 pueda romper**. Es deliberado — cualquier forma de retorno que la UI leyera hoy
(mensajes, `useActionState`) sería contrato de más que la 10 tendría que respetar para nada,
porque el logout real termina en `redirect`, y `redirect` no devuelve.

### Lo que la feature 10 cambia, y en qué archivo exacto

- **Reescribe `lib/services/session-stub.ts`** (o lo borra y apunta sus dos importadores a
  `lib/services/SessionService.ts`): `getSessionUser` pasa a leer la cookie de sesión con
  `cookies()` de `next/headers` y a redirigir a login si no hay sesión válida; `endSession`
  pasa a invalidar la cookie.
- **Añade dentro de `lib/actions/logout.ts`** el `redirect(LOGIN_ROUTE)` después de
  `endSession()`.
- **Añade la validación de permisos en servidor** (`cookies()`) en el layout o en el
  middleware, que es lo que `CHECKPOINTS.md > Permisos` exige y que **aquí no aplica** (§8).

**Cero archivos de UI tocados.** Ese es el criterio con el que el reviewer de la feature 10
juzgará esta costura.

**Por qué `getSessionUser` es un módulo aparte y no una lectura inline en el layout:** si el
valor de relleno estuviera escrito dentro de `app/(private)/layout.tsx`, la feature 10 tendría
que editar un archivo de UI para conectar la sesión — exactamente lo prohibido. Y en los
tests, el módulo aislado es el punto de mock natural.

## 4. Contratos de datos

### 4.1 `lib/types/session.ts`

```ts
export type SessionUser = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;      // ya compuesto por el proveedor de sesión (D8)
  readonly roleName: string | null;  // ya resuelto como texto mostrable (D8); null ⇒ no se pinta (R14)
};
```

Puntos que el reviewer debe poder verificar de un vistazo:

- **No hay ningún campo de credencial** (`password`, hash, token de sesión). La UI privada no
  debe verlos nunca y el tipo es la garantía, no una promesa en prosa.
- **No hay `avatarUrl`.** La decisión D3 es **iniciales**, no imagen; reservar un campo de
  imagen «por si acaso» sería sobre-ingeniería (`docs/architecture.md`) y el reviewer la
  rechaza. Si algún día hay imagen, se añade el campo entonces.
- `roleName` es nullable porque R14 exige comportamiento definido cuando no viene.
- Todos `readonly`: la UI no muta la identidad que recibe.

**Las iniciales se derivan en la UI**, no vienen en el contrato: es formateo de presentación
puro sobre un dato que ya está, no lógica de dominio. Vive en un helper puro
(`lib/utils/initials.ts`, `docs/architecture.md > lib/utils`) y por eso es testeable sin DOM.

### 4.2 `lib/services/session-stub.ts`

```ts
export async function getSessionUser(): Promise<SessionUser>  // valor de relleno fijo
export async function endSession(): Promise<void>             // no-op
```

Sin `cookies()`, sin Prisma, sin Supabase, sin red (R16, R22, R35). Cabecera del archivo con un
comentario que diga explícitamente que **la feature 10 lo reemplaza** y que ningún archivo de
UI lo importa salvo el layout de servidor.

Los tests **no** afirman sobre el valor de relleno: renderizan los componentes con su propio
`SessionUser` construido en el test.

### 4.3 `lib/navigation/private-nav.ts` — navegación con submenús

```ts
import { DASHBOARD_ROUTE } from '@/lib/types/auth';   // constante de la feature 7

// --- Rutas de ejemplo (placeholder, D2). NINGUNA existe todavía: hoy dan 404. ---
export const INVENTORY_ROUTE = '/inventario';
export const NOTIFICATIONS_ROUTE = '/notificaciones';
export const PURCHASE_ORDERS_ROUTE = '/compras/ordenes';
export const SUPPLIERS_ROUTE = '/compras/proveedores';
export const FORMULAS_ROUTE = '/produccion/formulas';
export const BATCHES_ROUTE = '/produccion/lotes';

export type NavLink = {
  readonly kind: 'link';
  readonly href: string;
  readonly label: string;
  readonly testId: string;
};

export type NavGroup = {
  readonly kind: 'group';
  readonly label: string;
  readonly testId: string;
  readonly items: readonly NavLink[];   // ← un solo nivel: hijos son NavLink, no NavItem
};

export type NavItem = NavLink | NavGroup;

export const PRIVATE_NAV_ITEMS: readonly NavItem[] = [ /* 5 ítems, ver abajo */ ];
```

**La profundidad de un nivel está garantizada por el tipo, no por convención**: `NavGroup.items`
es `readonly NavLink[]`, así que un submenú dentro de un submenú **no compila**. Si algún día
hace falta más profundidad, es un cambio de tipo consciente, no algo que se cuele.

Los 5 ítems de ejemplo (D2) — **placeholder declarado, no dominio**:

| # | Tipo | Etiqueta | Destino / hijos | Existe hoy |
| --- | --- | --- | --- | --- |
| 1 | link | Dashboard | `DASHBOARD_ROUTE` | la crea la feature 9 |
| 2 | link | Inventario | `INVENTORY_ROUTE` | **no** → 404 |
| 3 | link | Notificaciones | `NOTIFICATIONS_ROUTE` | **no** → 404 |
| 4 | group | Compras | Órdenes de compra (`PURCHASE_ORDERS_ROUTE`), Proveedores (`SUPPLIERS_ROUTE`) | **no** → 404 |
| 5 | group | Producción | Fórmulas (`FORMULAS_ROUTE`), Lotes (`BATCHES_ROUTE`) | **no** → 404 |

Los nombres de los ítems 4 y 5 y de sus hijos los elige este spec como **ejemplo plausible de
un ERP químico**, no como definición del dominio: `docs/architecture.md > Dominio` dice que
todavía no hay ninguna feature de dominio implementada, y sus cuatro preguntas abiertas
(unidades, lotes, fichas de seguridad, contabilidad) siguen sin cerrar. **La feature que traiga
cada módulo sustituye su ítem y su constante.** Que las rutas den 404 hoy es esperado y no es
un fallo (mismo patrón que `FORGOT_PASSWORD_ROUTE` en la feature 7).

`DASHBOARD_ROUTE` se **reutiliza** de `lib/types/auth.ts` (feature 7) en vez de redeclararlo:
dos constantes con la misma ruta es cómo se acaba con un `/dashboard` y un `/panel`
conviviendo. Que una constante de ruta viva en un módulo de tipos de auth es un olor heredado;
consolidar todas las rutas en un `lib/routes.ts` tocaría archivos de la feature 7 y se registra
como **deuda**, no se hace aquí.

Los tests iteran `PRIVATE_NAV_ITEMS` y afirman «una entrada por ítem, con ese `href` y ese
nombre accesible». Así R6 sigue verde cuando la lista cambie, sin tocar el test — y sin
afirmar sobre copy literal: el `label` sale de la constante, no del test.

### 4.4 `lib/actions/logout.ts`

```ts
'use server';
export async function logoutAction(): Promise<void> {
  await endSession();
}
```

Nada más. Sin `try/catch` vacío (`docs/conventions.md`), sin `redirect` (R22), sin cookies.

## 5. UI, estados y accesibilidad

### 5.1 Ubicación de archivos y por qué

| Archivo | Tipo | Por qué ahí |
| --- | --- | --- |
| `app/(private)/layout.tsx` | RSC | Layout del route group de la zona autenticada (D1). Es el **único** punto que llama al proveedor de sesión y reparte props, como manda `docs/architecture.md > Permisos y autenticacion` («el padre Server Component … pasa datos por props»). |
| `app/(private)/sidebar-toggle.tsx` | client | Wrapper del trigger que añade `aria-expanded`/`aria-controls` (R23, R31). No porta datos y su único consumidor es el layout → vive junto a él (`docs/architecture.md > Sin sobre-ingeniería`). |
| `components/private/app-sidebar.tsx` | client | Porta datos de sesión (los recibe y los baja al pie) → `components/private/` por `docs/architecture.md > Componentes` y `CHECKPOINTS.md > Permisos`. Es client porque necesita la ruta activa (R8, R12) y cerrar el panel al navegar (R33). |
| `components/private/nav-user.tsx` | client | Pinta la identidad del usuario: **datos sensibles por props** → `components/private/`. Renderiza el menú desplegable (R17) y el `<form action={logoutAction}>` (R19). |
| `components/private/logout-menu-item.tsx` | client | No porta datos, pero es hoja exclusiva de `nav-user.tsx`; se coloca junto a su único consumidor. Ponerlo en `app/(private)/` obligaría a que `components/` importara de `app/`, invirtiendo la dirección de dependencia. |
| `lib/utils/initials.ts` | helper puro | Derivar iniciales es formateo sin efectos → `lib/utils/` (`docs/architecture.md`). Testeable sin DOM. |
| `components/ui/sidebar.tsx`, `sheet.tsx`, `separator.tsx`, `tooltip.tsx`, `skeleton.tsx`, `collapsible.tsx`, `avatar.tsx`, `dropdown-menu.tsx` | generados | Primitivas de shadcn/ui. Se añaden **sólo** vía `pnpm dlx shadcn@latest add`; **nunca se editan a mano**. |
| `hooks/use-mobile.ts` | generado | Lo genera el CLI junto al sidebar; `docs/architecture.md` ya prevé `hooks/`. |

No se crea nada en `components/shared/`: la regla de `docs/architecture.md > Sin
sobre-ingeniería` pide dos consumidores antes de promover, y aquí sólo hay uno.

### 5.2 Árbol de render

```tsx
// app/(private)/layout.tsx  (RSC)
const user = await getSessionUser();
<SidebarProvider>
  <AppSidebar user={user} navItems={PRIVATE_NAV_ITEMS} />
  <SidebarInset>
    <header><SidebarToggle /></header>       {/* R23, R29, R31 */}
    <main data-testid="private-content">{children}</main>   {/* R5 */}
  </SidebarInset>
</SidebarProvider>
```

Sin `<Toaster />` (D9, R36).

`AppSidebar` compone `SidebarHeader` (marca larga/corta, R4/R24) + `SidebarContent` con la
navegación dentro de un landmark de navegación con `aria-label` (R3) + `SidebarFooter` con
`<NavUser user={user} />` (R14). El `<Sidebar>` se declara con la variante de colapso a
**icono** (D5-A).

**Tipado de props del layout:** se declara explícitamente `{ children: React.ReactNode }` y
**no** se usa el helper global `LayoutProps<"/">` que el root layout emplea hoy: los route
groups no añaden segmento, así que `(public)` y `(private)` comparten la misma ruta `/` a ojos
del generador de tipos, y depender de ese helper en dos layouts hermanos es una fuente de
fricción gratuita (riesgo 4).

### 5.3 Navegación: ítems simples y submenús (R6–R13)

- **Ítem simple** → `SidebarMenuItem` + `SidebarMenuButton asChild` con un `<Link>` de
  `next/link` al `href` de la constante (R6, R13). `aria-current="page"` cuando
  `usePathname()` coincide (R8) — no basta con una clase de color: un estado que sólo existe
  como color no es accesible ni testeable con sentido.
- **Ítem con submenú** → `Collapsible` de shadcn envolviendo el `SidebarMenuItem`: el
  disparador es un **`<button>` real** (`SidebarMenuButton` sin `asChild`), no un enlace, así
  que es alcanzable por Tab y activable con Enter y Espacio sin código extra (R9, R11). El
  primitivo `Collapsible` (Radix) aporta `aria-expanded` en el disparador, `aria-controls`
  hacia el panel y el desmontaje del contenido colapsado, que es lo que hace verificable R10.
  Los hijos van en `SidebarMenuSub` / `SidebarMenuSubButton asChild` con `<Link>`.
- **Submenú abierto por ruta activa** (R12): el estado inicial del `Collapsible` se calcula
  con `defaultOpen={group.items.some(i => i.href === pathname)}`. Se usa `defaultOpen` y no un
  `open` controlado para que el usuario pueda colapsarlo después sin que el componente se lo
  vuelva a abrir en cada render.
- **Un solo nivel** (D2): garantizado por el tipo (§4.3).

### 5.4 Pie de usuario (R14–R21)

`NavUser` recibe `user: SessionUser` por props (R16) y renderiza, dentro de `SidebarFooter`:

- Disparador del menú: `SidebarMenuButton` dentro de `DropdownMenuTrigger asChild`, con
  `Avatar` + `AvatarFallback` mostrando las iniciales (R15), el `displayName` y, debajo, el
  `roleName` **si viene informado** (R14). Radix aporta `aria-haspopup="menu"` y
  `aria-expanded` en el disparador (R17) y el cierre con `Escape` con retorno de foco (R18).
- Contenido del menú: un `DropdownMenuItem` que **no** es un botón suelto sino un
  `<form action={logoutAction}>` con `<LogoutMenuItem />` dentro (R19). **Sin entrada de
  perfil** (D12).
- `LogoutMenuItem` es un **componente separado por necesidad técnica**: `useFormStatus()` sólo
  lee el `<form>` **ancestro**, así que si el hook viviera en el mismo componente que renderiza
  el `<form>` devolvería siempre `pending: false`. Es el error clásico del hook, ya documentado
  en `specs/7-pantalla-de-login/design.md > 5.2`. Aquí: `disabled={pending}` +
  `aria-busy={pending}` (R21). Al terminar la action React pone `pending` a `false` solo: sin
  `useState`.

Nota de implementación: el `<form>` va **dentro** del `DropdownMenuItem` (o el item con
`asChild` sobre el botón de submit); lo que no vale es un `onClick` que llame a la action —
eso rompe el envío real y el progressive enhancement.

### 5.5 Mecanismo A — colapso a modo icono en viewport ancho (R23–R28)

- El `<Sidebar>` se declara con colapso **a icono**: en modo colapsado el panel se estrecha a
  la anchura de un icono en vez de desaparecer. Es la variante que provee el primitivo; no se
  reimplementa.
- **Marca** (R24): `SidebarHeader` renderiza «QuimiCloude» en modo expandido y «QC» en modo
  icono (D7). Ambas versiones salen de constantes del módulo de marca del componente, y el
  enlace a `DASHBOARD_ROUTE` se conserva en los dos modos (R4). El test afirma sobre
  `data-testid` y sobre la constante, no sobre el literal.
- **Nombre accesible en modo icono** (R25): cada `SidebarMenuButton` recibe la prop `tooltip`
  del primitivo, que renderiza el `Tooltip` **sólo en modo icono** y mantiene el texto en el
  árbol accesible; además la etiqueta oculta visualmente conserva el nombre accesible del
  control. Verificación en tiempo de implementación (T1): si el primitivo generado no aporta
  el nombre accesible en ese modo, se añade `aria-label={item.label}` en el propio componente
  de la feature — **nunca editando `components/ui/`**.
- **Submenús en modo icono** (R26): un `Collapsible` que se expande hacia abajo no cabe en una
  columna de iconos. Solución: en modo icono el ítem con submenú se presenta como
  **`DropdownMenu` flotante** anclado al icono, con un item por hijo; en modo expandido sigue
  siendo el `Collapsible` inline. Es el patrón del propio bloque de shadcn y reutiliza la
  primitiva `dropdown-menu` que ya entra por D4. El estado de modo se lee con
  `useSidebar()` (`state === 'collapsed'`).
- **Pie en modo icono** (R27): el disparador del menú de usuario queda reducido al `Avatar`
  con las iniciales, conservando su nombre accesible; el menú desplegable y su cierre de sesión
  siguen alcanzables sin cambios.
- **Persistencia del modo (R28, D13).** Se persiste entre navegaciones y recargas. El
  `SidebarProvider` de shadcn ya lo hace escribiendo el estado de escritorio en una cookie
  propia (`sidebar_state`) que él mismo lee al montar; el layout **no la escribe ni la lee a
  mano**. Dos precisiones que el reviewer necesita por escrito:
  1. **Esa cookie es preferencia de UI, no sesión ni datos de negocio.** No lleva PII, no
     identifica a nadie, no la lee ningún service y la feature 10 no la toca. Por eso **no
     contradice R35** («el layout no valida sesión ni lee/emite cookie de sesión»): R35 la
     admite de forma explícita, en vez de dejar al reviewer descubriendo una cookie en una
     feature que dice no tener ninguna.
  2. **Tiene requisito y test propios** aunque hoy funcione gratis. Que un comportamiento
     venga de serie en una dependencia no lo hace verificado: si mañana alguien pasa una prop
     al proveedor, o el CLI cambia el defecto, la persistencia se apaga y **ningún test se
     pondría rojo**. R28 es esa red.
  - Verificación en tiempo de implementación (T1): si el primitivo generado **no** persiste
    por defecto, R28 se cumple pasando el estado inicial al proveedor desde la cookie leída en
    el layout de servidor (`cookies()` de `next/headers` para una cookie de UI, no de sesión).
    El implementer lo anota; lo que no vale es dar R28 por cumplido sin comprobarlo.

### 5.6 Mecanismo B — panel superpuesto en viewport angosto (R29–R34)

Mecanismo **distinto** del anterior y con requisitos y tests propios. En angosto el primitivo
monta la barra dentro de un `Sheet` (Radix Dialog).

| Requisito | Quién lo cumple | Qué hay que verificar/añadir |
| --- | --- | --- |
| R29 oculta por defecto + control de apertura | `SidebarProvider` (`openMobile` arranca en `false`) | Estado inicial `false`. **Ojo: el estado del panel móvil NO se persiste** — la persistencia de R28 es la del modo icono de escritorio, y son cosas distintas |
| R30 panel modal + foco dentro | `Sheet` (Radix Dialog): `role="dialog"`, `aria-modal`, focus trap | Sale de la primitiva; se testea igual, porque es requisito |
| R31 `aria-expanded` + `aria-controls` | **NO lo da `SidebarTrigger` por defecto** | El wrapper `app/(private)/sidebar-toggle.tsx` añade `aria-expanded={openMobile}` y `aria-controls` con el `id` del panel. **No se edita `components/ui/`** |
| R32 `Escape` cierra y devuelve foco | `Sheet` (Radix) | Sale de la primitiva |
| R33 cerrar al navegar | **Nadie lo da** | `AppSidebar` llama a `setOpenMobile(false)` de `useSidebar()` en el `onClick` de cada enlace (también en los hijos de submenú) |
| R34 sin modo icono en angosto | El primitivo conmuta a `Sheet` e ignora el estado de colapso de escritorio | Se testea explícitamente para que nadie lo rompa mezclando los dos mecanismos |

Sobre R23/R31: **un solo control** en la cabecera del contenido sirve a los dos mecanismos —
en ancho alterna expandido/icono, en angosto abre/cierra el panel—, porque el primitivo ya
decide según el viewport. Lo que **no** es un solo requisito es el comportamiento: por eso
R23/R24 y R29/R30 se prueban por separado, con el viewport fijado en cada test.

Si al implementar resulta que el `SidebarTrigger` generado **ya** emite `aria-expanded`, el
wrapper se reduce a pasar `aria-controls`. Lo que no vale es dar por hecho que lo trae: se
comprueba leyendo el archivo generado (T1) y se registra en
`progress/impl_8-layout-privado-con-sidebar.md`.

### 5.7 `data-testid` y regla de asserts

- `data-testid` estables en: barra lateral, marca, contenedor de navegación, cada entrada
  (`item.testId`), cada hijo de submenú, control de submenú, pie de usuario, nombre visible,
  rol, iniciales, disparador del menú de usuario, control de logout, toggle de la barra y área
  de contenido.
- Los tests afirman sobre **roles ARIA** (`navigation`, `main`, `dialog`, `menu`, `menuitem`,
  `link`, `button`), `data-testid` y **constantes exportadas**. **Nunca sobre el literal del
  copy** (misma regla que la feature 7).

## 6. Notificaciones: por qué la zona privada no monta `<Toaster />` (D9)

La feature 7 montó el suyo en `app/(public)/layout.tsx` y dejó por escrito que la zona privada
elegía la suya (`specs/7-pantalla-de-login/design.md > 5.3`). **Decisión humana del
2026-08-06: no se agrega por ahora.** Consecuencias, dichas para que nadie las descubra tarde:

- `sonner` **no** es dependencia de esta feature y no aparece en ninguna task.
- **La zona privada no puede emitir toasts** hasta que una feature lo pida; la que lo pida
  monta el `<Toaster />` donde decida (layout privado o root). Es una **nota de estado**, no
  una deuda inventada por este spec.
- El `<Toaster />` del layout público **no se toca**. Esta feature no modifica ningún archivo
  de la feature 7.
- Efecto sobre la costura con la feature 10: si el logout real quisiera reportar un fallo por
  toast, esa feature tendrá que montar el `<Toaster />` — lo que **sí** tocaría
  `app/(private)/layout.tsx`. Queda dicho aquí para que no se lea como incumplimiento de «la
  10 no toca UI»: la promesa cubre la sustitución del stub y de la action, no una capacidad de
  UI que hoy el humano decidió no construir.

## 7. Ruteo

| Ruta | Archivo | Tipo | Notas |
| --- | --- | --- | --- |
| — (grupo, sin segmento) | `app/(private)/layout.tsx` | layout (RSC) | Armazón de la zona privada (R1) |
| `/dashboard` | **no existe** | — | Lo crea la **feature 9** dentro de este grupo. Destino de la marca (R4) y del ítem 1. Hoy 404 |
| `/inventario`, `/notificaciones`, `/compras/*`, `/produccion/*` | **no existen** | — | Rutas de ejemplo (D2). **404 esperado.** Ninguna feature del backlog las cubre todavía |
| — | **sin `page.tsx` en esta feature** | — | D11: la 8 no crea pantallas |

Sin `middleware.ts` (es la feature 6/10). Sin route handlers: el logout es una mutación interna
desde un componente propio → **Server Action**, por `docs/architecture.md > Server Actions vs
Route Handlers`.

## 8. Datos, migraciones, RLS, permisos

**No aplica, y se declara explícitamente en vez de omitirse** (así debe leerlo el reviewer,
`tasks.md > Checklist de CHECKPOINTS.md`):

- **Tablas, migraciones, `down.sql`, RLS/`FORCE ROW LEVEL SECURITY`, repositorios Prisma:** no
  aplica. Esta feature no crea ni toca ninguna tabla ni consulta datos (R35).
- **Validación de permisos en servidor vía `cookies()`:** **no aplica en esta feature, y no
  porque se haya olvidado**: es exactamente el alcance de la **feature 10**
  (`feature_list.json` id 10). El layout de la 8 asume que quien llega ya pasó la guardia.
  Hasta entonces, la zona privada **no está protegida**, y eso es un hecho conocido y aceptado,
  no un hallazgo.
- **Autorización en el service:** no aplica; no hay service de negocio, sólo el stub de sesión.
- **Secretos y configuración por entorno:** no aplica; no hay ninguna variable nueva.
- **Cookies:** la única cookie de esta feature es la de **preferencia de UI** que exige R28
  (`sidebar_state`, §5.5). **No es cookie de sesión**: no lleva PII, no identifica a nadie, no
  la consume ningún service y la feature 10 no la toca. R35 la admite de forma explícita
  precisamente para que nadie lea «hay una cookie» como contradicción con «esta feature no
  toca sesión».

## 9. Alternativas descartadas

### A. Escribir la barra lateral a mano con Tailwind + `useState` (DESCARTADA)

Es lo primero que sale. Se descarta por tres razones: (1) `docs/architecture.md > Componentes`
lo prohíbe cuando el componente existe en shadcn/ui, y existe; (2) el humano fijó shadcn/ui
como directiva; (3) el coste real no es el CSS, es la accesibilidad del panel móvil y del
submenú — foco atrapado, restauración de foco al cerrar, `Escape`, `aria-modal`,
`aria-expanded`/`aria-controls`, bloqueo de scroll, desmontaje del contenido colapsado.
Reimplementar eso a mano es cómo se producen R30/R32 «verdes» en un test y rotos con un lector
de pantalla.

### B. Panel móvil propio con `hidden md:block` + un `<div>` deslizante (DESCARTADA)

La variante «a mano pero barata». Da la animación y no da nada de lo de arriba: sin diálogo
modal, el contenido de fondo sigue siendo tabulable y el foco se escapa detrás del panel. R30 y
R32 se volverían inverificables de verdad.

### C. Dos barras laterales en el DOM (una `md:block`, otra dentro de un `Sheet`) (DESCARTADA)

Funciona, y duplica el árbol: los tests encontrarían **dos** enlaces «Dashboard» y todos los
`getByRole` necesitarían desambiguar por contenedor; peor, los `data-testid` se repetirían. El
primitivo ya conmuta una sola instancia según el hook de viewport.

### D. Que `AppSidebar` lea la sesión por su cuenta con `cookies()` (DESCARTADA)

Ahorraría el paso de props y viola dos reglas duras: `CHECKPOINTS.md > Permisos`
(«Componentes `private/` reciben datos por props; no fetchean datos sensibles») y la
restricción explícita del humano. Además rompe la costura: la feature 10 tendría que editar un
archivo de UI para cambiar de dónde sale la sesión. Descartada sin matices.

### E. Un solo mecanismo de colapso para ambos viewports (DESCARTADA)

Tentador después de ver que un único control sirve a los dos. Es un error: en angosto el modo
icono deja una columna de iconos comiéndose la pantalla y el usuario no puede leer nada
(R34); en ancho, un panel modal encima del contenido rompe el flujo de trabajo. El humano pidió
explícitamente los dos mecanismos y este diseño los mantiene separados en requisitos y en
tests, aunque compartan control.

### F. Submenú inline también en modo icono (DESCARTADA)

Expandir un `Collapsible` dentro de una columna de 48 px produce hijos ilegibles o un
desbordamiento horizontal. En modo icono el submenú se presenta como menú flotante (§5.5, R26),
que es el patrón del propio bloque de shadcn y no cuesta una primitiva más (el `dropdown-menu`
ya entra por el pie).

### G. Submenús de profundidad arbitraria (`NavGroup.items: NavItem[]`) (DESCARTADA)

Un cambio de dos caracteres en el tipo que abre la puerta a árboles de tres o cuatro niveles
que nadie ha pedido, que no caben en 256 px y que multiplican los casos de teclado a probar. El
humano fijó **un nivel**; el tipo lo hace cumplir (§4.3). Cuando haga falta más, será una
decisión consciente con su spec.

### H. `logoutAction` con `useActionState` y estado de retorno (DESCARTADA)

Simetría aparente con el login de la feature 7. Aquí sobra: el logout real termina en
`redirect`, que no devuelve, así que el estado de retorno sería un contrato muerto que la
feature 10 heredaría sin poder usar. `logoutAction(): Promise<void>` + `useFormStatus` para el
pending (R21) es todo lo que hace falta.

### I. `onClick` + `fetch('/api/logout')` para cerrar sesión (DESCARTADA)

Prohibido por la directiva del humano y por `docs/architecture.md > Server Actions vs Route
Handlers` (mutación interna desde componente propio → Server Action). Además rompería el
progressive enhancement del control y obligaría a crear un route handler que la feature 10
tendría que borrar.

### J. Hardcodear la lista de enlaces dentro de `app-sidebar.tsx` (DESCARTADA)

Con los ítems dentro del componente, cada módulo nuevo del ERP editaría un componente de
`components/private/`, y los tests afirmarían contra copy literal — justo lo prohibido. El slot
con `NavItem[]` deja el contenido en una constante y los tests iterándola, que es lo que hace
que sustituir los ítems de ejemplo (D2) no rompa ningún test.

### K. Un campo `avatarUrl` reservado en `SessionUser` «por si acaso» (DESCARTADA)

Estaba en la versión anterior de este diseño y cae con D3: la decisión es **iniciales**. Un
campo que nadie usa hoy y que obligaría a la feature 10 a rellenarlo con `null` es
sobre-ingeniería, que `docs/architecture.md` rechaza explícitamente.

### L. Montar el `<Toaster />` en la zona privada «ya que estamos» (DESCARTADA por D9)

Decisión humana del 2026-08-06: no se agrega por ahora. Coste y consecuencias en §6.

### M. Route group `app/(dashboard)/` (DESCARTADA por D1)

Es el nombre que aparece en `docs/architecture.md > Estructura de carpetas`, y bautiza toda la
zona autenticada con el nombre de su primera pantalla. El humano decidió mantener `(private)`.

## 10. Riesgos

1. **Versión y API del bloque `sidebar` de shadcn/ui.** Este repo no tiene shadcn instalado
   (§0), así que los nombres de subcomponentes (`SidebarProvider`, `SidebarInset`,
   `SidebarTrigger`, `SidebarMenuSub`, `useSidebar`…), la prop de colapso a icono, la prop
   `tooltip` y las dependencias que arrastra el CLI **se confirman al correrlo** (T1), no se
   dan por ciertos desde este documento. Si el CLI vigente ofreciera otra cosa, el implementer
   **para y avisa al leader**; no sustituye por un componente propio.
2. **El breakpoint del hook generado.** D6 fija «angosta» en `< 768 px` porque es el valor del
   `use-mobile` que genera el CLI. Si el generado difiere, hay que reportarlo y decidir: el
   requisito manda sobre el valor por defecto, pero `components/ui/` no se edita a mano.
3. **`matchMedia` no existe en jsdom.** El hook de viewport usa `window.matchMedia`, que jsdom
   **no implementa**: sin un stub en el setup de los tests, todo test que renderice el layout
   revienta con `TypeError`. Es el fallo más probable de esta feature y por eso tiene task
   propia (T10). El stub debe permitir **cambiar** el resultado por test, o los mecanismos A y B
   no se pueden distinguir.
4. **Tipado del layout del route group.** `app/layout.tsx` usa hoy el helper global
   `LayoutProps<"/">`; dos route groups hermanos comparten la misma ruta a ojos del generador de
   tipos de Next 16. Se tipa explícitamente (§5.2). Si aun así `pnpm typecheck` protesta, es un
   hallazgo a reportar, no a silenciar con `any` (`docs/conventions.md`).
5. **La zona privada no tiene ninguna URL hasta la feature 9** (D11). No hay «abre `pnpm dev` y
   míralo»: la evidencia de esta feature son los tests de componente. Es la razón por la que el
   E2E se difiere (D10).
6. **`shadcn add sidebar` reescribe `app/globals.css`** para añadir los tokens `--sidebar-*`.
   Archivo compartido: hay que revisar el diff antes de commitear y confirmar que `/login` (de
   la feature 7) y `app/page.tsx` siguen renderizando.
7. **Dependencia de que la feature 7 haya aterrizado.** Si la 8 arranca antes, T0 falla y debe
   fallar ruidosamente. Un implementer que «arregle» T0 corriendo `shadcn init` estaría
   duplicando el trabajo de la 7 y garantizando un conflicto de merge en `components.json`,
   `lib/utils.ts`, `app/globals.css` y `package.json`.
8. **`aria-expanded` en el trigger** (§5.6): el primitivo puede no traerlo. R31 depende de un
   wrapper propio; si alguien «simplifica» quitando el wrapper, R31 se rompe en silencio salvo
   por su test.
9. **Los 5 ítems de ejemplo enlazan a rutas que dan 404** (D2). Es esperado y está declarado;
   el riesgo real es que alguien los lea como definición del dominio del ERP. Por eso están
   marcados como placeholder en el propio módulo, en comentario, además de aquí.
10. **Radix `DropdownMenu` + `<form>` de Server Action**: al enviar desde dentro de un
    `DropdownMenuItem`, el menú puede cerrarse antes de que el envío se complete si el item
    intercepta el evento. Se resuelve con el patrón de `asChild` sobre el botón de submit y, si
    hiciera falta, `onSelect={e => e.preventDefault()}`. Está anotado porque es exactamente el
    tipo de detalle que produce un R20 verde en test unitario y roto en el navegador.
11. **Persistencia del modo colapsado (R28) en jsdom.** El primitivo persiste vía
    `document.cookie`, que jsdom **sí** soporta, pero el test tiene que limpiarla entre casos o
    un test contaminará al siguiente con el modo del anterior. Y si el primitivo generado no
    persistiera por defecto (§5.5), R28 exige implementarlo leyendo la cookie de UI en el
    layout de servidor: eso cambia T11 y hay que reportarlo, no absorberlo en silencio.
