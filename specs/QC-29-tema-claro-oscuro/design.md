# QC-29 — tema-claro-oscuro · design.md

> Decisiones técnicas antes de escribir código. Los colores salen de
> `design-input-tokens.md`; aquí no se recalculan.
>
> **Revisión del 2026-09-02.** La primera versión de este diseño proponía `next-themes` con
> estado `excepcion` en `docs/dependencias.md`. **El humano la rechazó** (D9): el mecanismo
> pasa a ser código propio, con el mismo patrón de cookie de UI que ya usa la barra lateral.
> Los §3, §4, §7, §8 y §10 están reescritos por ese motivo; los §2 y §6 (Tailwind v4 y las
> medidas del panel) no dependían de la librería y siguen igual.

## 1. Qué toca esta feature (y qué no)

| Archivo | Cambio |
| --- | --- |
| `app/globals.css` | Tokens de `:root` y `.dark`; variables del degradado; reglas del panel flotante y del alto de item |
| `lib/shared/ui/theme-state.ts` | **nuevo** — módulo puro: nombre de la cookie, tipo `ThemePreference`, lector tolerante y constructor de la cookie |
| `lib/shared/ui/theme-init-script.ts` | **nuevo** — el script anti-parpadeo como constante de texto |
| `components/shared/theme-provider.tsx` | **nuevo** — contexto `'use client'` con `useTheme()` |
| `app/layout.tsx` | Lee la cookie en servidor, marca `<html>`, inyecta el script y monta el proveedor |
| `app/(private)/components/theme-toggle.tsx` | **nuevo** — el control de tema |
| `app/(private)/components/index.ts` | reexporta el control y sus constantes de etiqueta |
| `app/(private)/layout.tsx` | añade `<ThemeToggle />` al `<header>` y las medidas del panel vía `style` del `SidebarProvider`. **Sigue siendo Server Component** (R27) |
| `components/private/app-sidebar.tsx` | `variant="floating"` y el margen exterior del panel |

**No se toca `components/ui/`** (R21), ni `DashboardContent` (R23), ni nada de sesión (R27),
ni `package.json` (R28), ni `docs/dependencias.md` — **no hay dependencia que aprobar**.

Modelo de datos: **ninguno**. Esta feature no crea tablas, ni migraciones, ni RLS, ni
endpoints, ni Server Actions. El único estado nuevo es una cookie de preferencia de UI y unas
variables CSS.

## 2. Por qué Tailwind v4 cambia dónde se escribe el tema

Este repo **no tiene `tailwind.config.*`** y no debe tenerlo: con Tailwind v4 el tema se
declara en `@theme inline` + variables CSS dentro de `app/globals.css`, que ya está montado así
(`--color-background: var(--background)`, etc.). Cambiar la paleta es, literalmente, cambiar los
valores de `:root` y `.dark`. El puente `@theme inline` **no se toca**: los nombres de token no
cambian, solo sus valores, así que ninguna clase utilitaria existente se rompe.

`globals.css` ya declara `@custom-variant dark (&:is(.dark *))`, o sea que el interruptor del
modo oscuro es **una clase `dark` en un ancestro**. Eso fija la estrategia del §3, no al revés.

## 3. El mecanismo: cookie de UI propia + script anti-parpadeo (D2)

### 3.1 El precedente que se copia

No se inventa un patrón nuevo. `lib/shared/ui/sidebar-state.ts` + `app/(private)/layout.tsx` ya
resuelven exactamente esta forma de problema, y su docblock explica por qué existe: el
`SidebarProvider` de `components/ui/sidebar.tsx` **escribe** la cookie desde el cliente
(`document.cookie = "sidebar_state=…; path=/; max-age=…"`, línea 86) pero **nunca la lee**, así
que la persistencia solo existe porque el layout servidor la lee con `cookies()` y se la pasa
como estado inicial. El tema replica ese reparto de responsabilidades:

| Pieza | Responsabilidad | Equivalente en la barra lateral |
| --- | --- | --- |
| `lib/shared/ui/theme-state.ts` | módulo puro: nombre de cookie, tipo, lector tolerante | `sidebar-state.ts` |
| `app/layout.tsx` (servidor) | lee la cookie y siembra el estado inicial | `app/(private)/layout.tsx` con `defaultOpen` |
| `components/shared/theme-provider.tsx` (cliente) | escribe la cookie al cambiar la preferencia | `SidebarProvider` |

Contenido de `theme-state.ts` (hoja del grafo: `lib/shared/**` no importa módulos ni
composición, y `components/**` y `app/**` sí pueden importarlo — `docs/architecture.md > La
regla de dependencias`):

```ts
export const THEME_COOKIE = 'theme_preference';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;   // un año
export const THEME_DARK_CLASS = 'dark';                    // el de @custom-variant
export type ThemePreference = 'light' | 'dark' | 'system';

export function readThemePreference(rawValue: string | undefined): ThemePreference;
export function buildThemeCookie(preference: ThemePreference): string;
```

`readThemePreference` devuelve `'system'` ante ausencia, cadena vacía o valor no reconocido, y
**no lanza**: es el mismo criterio que `readSidebarOpenState` («una preferencia de UI
desconocida no es motivo para lanzar; el modo por defecto es una respuesta válida») y coincide
con el valor por defecto que fijó D4. La cookie no es `httpOnly` —tiene que escribirla el
cliente— y va con `path=/; max-age=…; samesite=lax`. **No es cookie de sesión** (R29): sin PII,
sin identificar a nadie, ningún service la consume, y R35 de QC-11 ya dejó admitido este tipo de
cookie de UI de forma explícita.

### 3.2 Las dos piezas del anti-parpadeo, y por qué hacen falta las dos

**El servidor conoce la preferencia pero no puede resolver `system`.** `prefers-color-scheme`
es un dato del cliente; el único encabezado que lo transportaría,
`Sec-CH-Prefers-Color-Scheme`, no lo envía Safari, o sea que en el motor de iOS no existe.
Y `system` es el **valor por defecto** (D4): sin script, la primera visita de todo usuario
nuevo parpadearía. Por eso:

1. **Servidor — `app/layout.tsx`.** Lee la cookie con `cookies()`, y si la preferencia es
   explícita (`light` / `dark`) pone ya en el HTML la clase y el `color-scheme` del `<html>`.
   Con preferencia explícita **no hace falta JavaScript** para ver el modo correcto.
2. **Script inline — `THEME_INIT_SCRIPT`.** Se emite como **primer hijo de `<body>`**, sin
   `async` ni `defer`, así que se ejecuta síncronamente antes de que el navegador pinte el
   marcado que va detrás. Hace exactamente esto, en un `try/catch` que traga cualquier fallo
   (cookies bloqueadas, `matchMedia` ausente) dejando el modo que ya trae el HTML:

   ```
   pref = cookie 'theme_preference'
   oscuro = pref === 'dark' || (pref !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
   documentElement.classList.toggle('dark', oscuro)
   documentElement.style.colorScheme = oscuro ? 'dark' : 'light'
   ```

   Vive en `lib/shared/ui/theme-init-script.ts` como constante de texto y **no** como archivo
   `.js` suelto: así lo cubre `typecheck`, viaja en el bundle del servidor y —lo que más
   importa— **se puede ejecutar en un test** contra un DOM simulado (§8, nivel 2). Un script
   escrito directamente dentro del JSX no se puede probar sin un navegador.

**`suppressHydrationWarning` sigue siendo obligatorio** en `<html>` (R12): en el caso `system`
el script cambia la clase del elemento raíz antes de que React hidrate, y sin el atributo React
avisa de mismatch. Es de un solo nivel de profundidad: no silencia nada del árbol de la app.

### 3.3 Sincronización con el sistema operativo mientras la pestaña está abierta (R17)

Esto lo traía resuelto `next-themes` y ahora es nuestro. `components/shared/theme-provider.tsx`
mantiene `preference` (lo que eligió el usuario) y `resolved` (`light` | `dark`, el modo
efectivo), y registra un `useEffect` que:

- **solo mientras `preference === 'system'`**, suscribe
  `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', …)` y, en cada evento,
  recalcula `resolved` y reaplica clase y `color-scheme`;
- se da de baja al desmontar y al cambiar la preferencia a `light`/`dark`, para que un usuario
  con modo fijo no se vea arrastrado por el ajuste del sistema.

`addEventListener` sobre `MediaQueryList` está soportado en Safari desde la 14; el
`addListener` obsoleto no se usa. `setPreference(p)` hace tres cosas y en este orden: escribe
la cookie con `buildThemeCookie(p)`, aplica clase y `color-scheme` al `documentElement`, y
actualiza el estado de React (R15: el cambio se ve sin recargar).

### 3.4 Costes aceptados, escritos aquí y no descubiertos después

- **Todo el árbol pasa a render dinámico.** `cookies()` en el root layout marca como dinámicas
  también las rutas públicas; hoy solo la zona privada lo era, porque
  `app/(private)/layout.tsx` ya llama a `cookies()`. Se acepta: esto es un ERP íntegramente
  autenticado y `/login` es un formulario con Server Action que no gana nada de un HTML
  prerenderizado. D2 fija el patrón.
- **Sin sincronización entre pestañas.** `next-themes` la daba gratis por el evento `storage`
  de `localStorage`; las cookies no emiten ningún evento. Si el usuario cambia el tema en la
  pestaña A, la pestaña B ya abierta no se entera hasta que recargue o navegue. Se acepta —no
  es un dato crítico— y queda escrito para que nadie lo lea luego como bug.
- **Script inline y CSP.** Hoy el repo **no declara ninguna CSP**: `next.config.ts` está vacío
  de cabeceras y no hay ninguna `Content-Security-Policy` en el repositorio (comprobado). El
  día que se añada una CSP estricta, este script necesitará `nonce`; queda anotado aquí para
  que esa feature futura sepa que existe.
- **Superficie propia que mantener:** tres archivos nuevos y ~40 líneas. Es el precio que el
  humano decidió pagar en D9 a cambio de no meter una librería sin publicar desde hace 18
  meses.

## 4. Dónde cuelga el proveedor (y por qué ahí)

```
app/layout.tsx                       Server Component  ← lee la cookie con cookies()
└── <html className={… dark?} style={{colorScheme}} suppressHydrationWarning>
    └── <body>
        ├── <script>THEME_INIT_SCRIPT</script>   ← primer hijo, síncrono
        └── <ThemeProvider initialPreference={…}>   'use client'
            └── {children}                        (públicas y privadas, ambas)
```

- **Va en el root layout, no en el privado.** El modo es una propiedad del documento entero:
  `/login` también tiene que salir en el modo correcto (R26), y el script tiene que emitirse en
  la primera respuesta HTML de cualquier URL (R10).
- **`app/(private)/layout.tsx` no se convierte en cliente** (R27). Es el único que llama al
  proveedor de sesión (QC-11 R16) y sigue igual: solo gana un `<ThemeToggle />` en su
  `<header>` y un `style` en el `SidebarProvider`. Un Server Component puede renderizar un hijo
  `'use client'` sin contagiarse; es lo que ya pasa con `SidebarToggle`.
- **`initialPreference` entra por props desde el servidor**, exactamente como `defaultOpen`
  entra hoy en `SidebarProvider`. Así el primer render de React ya coincide con lo que hay en
  el DOM y el proveedor no tiene que leer la cookie en un `useEffect` (que es como se vuelve a
  introducir el parpadeo por la puerta de atrás).

## 5. El control de tema

`app/(private)/components/theme-toggle.tsx`, `'use client'`, exportado por el barrel de la ruta
junto a sus constantes de etiqueta — mismo patrón que `SidebarToggle` / `SIDEBAR_TOGGLE_LABEL`
(R13, `docs/architecture.md > Componentes`).

- **Forma:** `DropdownMenu` + `DropdownMenuRadioGroup` con tres `DropdownMenuRadioItem`
  (`claro`, `oscuro`, `sistema`), alimentados por `useTheme()` **de nuestro proveedor**. Las
  tres primitivas ya existen en `components/ui/` y son Base UI, así que la composición se hace
  con `render`, no con `asChild` (mismo detalle que documenta `app-sidebar.tsx`).
- **Por qué radio y no un botón que cicla:** tres opciones no se descubren pulsando un botón, y
  el grupo de radio da gratis el «cuál está seleccionada» programático que pide R14.
- **Nombres accesibles desde constantes**: `THEME_TOGGLE_LABEL`, `THEME_OPTION_LIGHT_LABEL`,
  `THEME_OPTION_DARK_LABEL`, `THEME_OPTION_SYSTEM_LABEL`. Los tests citan las constantes, nunca
  el copy.
- **Área táctil ≥ 44 × 44 px** en el disparador (R16); activable con clic, toque y teclado, sin
  depender de `hover`.
- **Sin `mounted` ni doble render.** El icono del disparador **no** se elige en JS: se pintan
  los dos (sol y luna) y se alterna su visibilidad con la variante `dark:` de Tailwind. Así el
  HTML del servidor y el del cliente son idénticos y no hay ni mismatch (R12) ni parpadeo del
  icono. El estado marcado del radio solo se pinta al abrir el menú, que es siempre
  post-hidratación, así que tampoco introduce mismatch.

## 6. Panel flotante: cómo se aplican las medidas sin tocar `components/ui/`

Esta es la parte que hay que justificar archivo por archivo, porque el primitivo expone unas
cosas y otras no. Lectura real de `components/ui/sidebar.tsx`:

| Medida | Hoy | Cómo se cambia desde fuera |
| --- | --- | --- |
| Ancho expandido 272 px | `SIDEBAR_WIDTH = "16rem"` en `style` del wrapper | `style={{ '--sidebar-width': '17rem' }}` en `<SidebarProvider>`: el primitivo hace `{...defaults, ...style}`, así que el valor de fuera **gana** |
| Ancho icono 78 px | `SIDEBAR_WIDTH_ICON = "3rem"` | igual: `'--sidebar-width-icon': '4.875rem'` |
| Panel flotante | `variant="sidebar"` por defecto | `<Sidebar variant="floating">` en `components/private/app-sidebar.tsx` (prop pública) |
| Margen exterior 18 px | `p-2` (8 px) en `sidebar-container` | `className="p-[18px]"` en `<Sidebar>`: el primitivo pasa `className` por `cn()` y `tailwind-merge` resuelve el conflicto de padding |
| Radio 22 px | `rounded-lg` en `sidebar-inner`, **hardcodeado, sin `className`** | regla CSS en `globals.css` sobre `[data-slot="sidebar-inner"]` |
| Degradado del panel | `bg-sidebar` plano | misma regla CSS, `background-image` |
| Alto de item 44 px | `h-8` en `sidebarMenuButtonVariants` | regla CSS sobre `[data-slot="sidebar-menu-button"]` (`min-height`) |

**Detalle de cascada que no es opcional:** las tres reglas CSS de `globals.css` van
**sin envolver en `@layer`**. Las utilidades de Tailwind v4 viven en capas, y en el modelo de
cascade layers una regla sin capa gana a cualquier regla en capa, independientemente de la
especificidad. Metidas en `@layer base` perderían contra `rounded-lg` y `h-8` y el panel saldría
igual que hoy — con el gate en verde. Va anotado como comentario en el propio CSS.

El degradado se declara como dos variables por modo y se consume en una sola regla:

```css
:root { --sidebar-panel-gradient: linear-gradient(166deg, #ffffff 0%, #f6fcfb 34%, #ecf7f5 68%, #dfefed 100%); }
.dark { --sidebar-panel-gradient: linear-gradient(166deg, #1b3b39 0%, #133032 34%, #0f2426 68%, #091a1c 100%); }
```

**Por qué hex aquí y oklch en los tokens:** el insumo da las paradas del degradado en hex y solo
cuatro de las ocho tienen equivalente oklch publicado en su tabla de tokens. Convertir las otras
cuatro por mi cuenta sería inventar números (regla 6). Los **tokens** (R1, R2) sí van en oklch,
porque el insumo los da en oklch.

La regla cubre los dos renders del panel: `[data-slot="sidebar-inner"]` (escritorio) y
`[data-slot="sidebar"][data-mobile="true"]` (el `Sheet` en viewport angosto).

**Límite conocido:** el ancho del panel en viewport angosto (`SIDEBAR_WIDTH_MOBILE`, 18rem) va
en un `style` **inline** del `SheetContent` y no se puede sobrescribir sin editar
`components/ui/sidebar.tsx`. Queda en 288 px y está anotado como pregunta abierta 3.

## 7. Alternativas descartadas

**A1 — `next-themes` (descartada por el humano el 2026-09-02, D9).** Era la propuesta de la
primera versión de este diseño, con estado `excepcion` en el registro. Lo que nos habría
ahorrado, dicho para que el coste quede escrito y no se pierda: el script anti-parpadeo, la
escucha de `matchMedia`, la sincronización entre pestañas y el `color-scheme` nativo — o sea,
casi todo el §3. Se descarta porque falla el check 2 de `docs/architecture.md > Dependencias de
terceros` (última publicación 2025-03-11, ~18 meses) y **el humano decidió que una librería sin
release en año y medio no cuenta como "mantenida"** a efectos de la regla 7 de `CLAUDE.md`, en
una superficie que este repo ya sabe resolver con el patrón de `sidebar-state.ts`. Con la
librería fuera, la feature deja de arrastrar una puerta de aprobación de dependencias.

**A2 — Solo script inline, sin leer la cookie en el servidor.** Es lo que hace `next-themes` y
es menos código. Descartada: contradice el patrón que fija D2, obliga a que el HTML salga
siempre en un modo y lo corrija JavaScript, y deja al usuario con preferencia explícita a
merced de que el script llegue y no falle. Con la lectura en servidor, la preferencia explícita
viaja ya en el HTML.

**A3 — Solo lectura en servidor, sin script.** Más limpio y sin JS. Descartada: **no puede
resolver `system`**, que es el valor por defecto (D4). `Sec-CH-Prefers-Color-Scheme` no existe
en Safari, así que el servidor no tiene forma de saber el ajuste del sistema operativo en el
motor de iOS. Sin script, todo usuario nuevo parpadearía en su primera visita.

**A4 — `localStorage` en vez de cookie.** Lo natural si el estado fuera solo del cliente.
Descartada: el servidor no puede leer `localStorage`, así que arrastraría a A2; y el repo ya
tiene precedente y vocabulario para la cookie de preferencia de UI.

**A5 — `data-theme` en vez de clase.** Descartada: `globals.css` ya declara
`@custom-variant dark (&:is(.dark *))` y el bloque `.dark`; cambiar de atributo obligaría a
reescribir la variante y a revisar cualquier uso de `dark:` ya escrito, sin ganar nada.

**A6 — Editar `components/ui/sidebar.tsx` para meter las medidas.** Es lo directo: cambiar tres
constantes y dos clases. Descartada porque `components/ui/` es código generado por el CLI de
shadcn y este repo lo trata como no editable —está escrito en los docblocks de
`lib/shared/ui/sidebar-state.ts` y `app/(private)/components/sidebar-toggle.tsx`, que ya
pagaron el coste de rodearlo—. Editarlo convierte cada `npx shadcn add` futuro en un conflicto
silencioso. El §6 demuestra que no hace falta.

**A7 — Dejar las medidas del panel fuera de la ficha.** Tentador: la ficha ya trae dos cosas.
Descartada porque la descripción del board dice literalmente «la barra lateral pasa a panel
flotante con degradado tenue»: sacarlo dejaría la feature incompleta contra su propio enunciado,
y volver a entrar más tarde a los mismos archivos duplica el riesgo de conflicto.

**A8 — Re-colorear los `--chart-*` de paso.** Descartada: no hay ninguna gráfica en el repo, así
que no hay forma de verificar que el color elegido sirva. Es inventar (regla 6). Queda como
pregunta abierta 1 y como R6 en negativo, para que el implementer no los toque «ya que está».

## 8. Cómo se verifica «sin parpadeo» (R10, R11)

Es el requisito más fácil de dar por bueno sin prueba, y ahora el código que hay debajo es
**nuestro**, así que vale el doble. Cuatro niveles, y ninguno sustituye al siguiente:

1. **Contrato de fuente (unit).** `app/layout.tsx` tiene `suppressHydrationWarning` en `<html>`,
   el `<script>` es el primer hijo de `<body>` y **no** lleva `async` ni `defer`, y el proveedor
   envuelve a `{children}`. Barato, pero solo prueba que el cableado está puesto.
2. **Ejecución del script (unit, jsdom) — el nivel que la librería no nos dejaba tener.**
   `THEME_INIT_SCRIPT` se evalúa contra un `document` y un `matchMedia` simulados, con cuatro
   escenarios: cookie `dark`; cookie `light`; sin cookie con el sistema en oscuro; sin cookie
   con el sistema en claro. Se afirma clase y `color-scheme` resultantes. Un quinto escenario
   comprueba que con `document.cookie` lanzando, el script **no** propaga el error.
3. **Render en servidor (unit).** El HTML serializado del root layout trae la clase `dark`
   cuando la cookie dice `dark`, y no la trae cuando dice `light`. Prueba que la preferencia
   explícita no depende de JavaScript.
4. **La prueba que convence (E2E, Playwright, chromium + webkit).** `page.addInitScript`
   registra en `document_start` un `requestAnimationFrame` que guarda en `window` el
   `className` de `document.documentElement` **en el primer fotograma**. Después de navegar, el
   test lee ese valor y afirma que ya contenía la marca del modo esperado. Si hubiera parpadeo,
   el primer fotograma no la tendría y el test fallaría. Se ejercita en `/login` (ruta pública,
   sin sesión) con dos escenarios: `emulateMedia({ colorScheme: 'dark' })` sin cookie (R7) y
   cookie `theme_preference=light` sembrada en el contexto (R9). R11 se cubre en el mismo spec
   navegando y repitiendo la sonda.

Un screenshot comparado sería flaky y no distingue «tardó un frame» de «no parpadeó»: la sonda
de `requestAnimationFrame` responde exactamente la pregunta del requisito.

## 9. Cómo se verifica el resto

- **Tokens (R1–R6, R25).** Test de contrato que **parsea `app/globals.css` como texto**, extrae
  los bloques `:root` y `.dark` y compara contra una tabla de valores esperados escrita en el
  propio test. Es el patrón que ya usan los tests de `schema.prisma` y de las migraciones. Para
  R25 el test convierte `oklch → sRGB` y calcula el contraste WCAG; la conversión va en el test,
  no en producción. **R25 no cubre el par `--primary` / `--primary-foreground`**: D10 lo dejó
  cerrado en `3,75:1` (umbral de componente de UI), y está escrito así a propósito.
- **Medidas (R18–R20).** Mismo test de contrato para las reglas CSS, más una aserción sobre las
  props del `SidebarProvider` y del `Sidebar` renderizados en jsdom (`--sidebar-width`,
  `variant="floating"`).
- **`components/ui/` intacto (R21).** Test que afirma que `components/ui/sidebar.tsx` **sigue
  conteniendo** `SIDEBAR_WIDTH = "16rem"`, `SIDEBAR_WIDTH_ICON = "3rem"` y
  `group-data-[variant=floating]:rounded-lg`. Si alguien mete las medidas nuevas ahí dentro, esos
  literales desaparecen y el test muerde. Se prefiere a un diff contra `origin/dev` porque el
  gate tiene que correr sin depender del estado de las refs remotas.
- **Sin dependencias nuevas (R28).** Test que afirma que ni `dependencies` ni `devDependencies`
  de `package.json` contienen `next-themes` ni ningún paquete de tema. No se congela la lista
  entera de dependencias: eso convertiría este test en un peaje para toda feature futura, y la
  guardia `guard-dependencias-aprobadas` ya cubre el caso general contra
  `docs/dependencias.md`. Lo que este test protege es la decisión concreta D9.
- **Cookie de UI, no de sesión (R29).** Test del módulo `theme-state.ts`: el lector devuelve
  `'system'` ante ausencia y ante basura sin lanzar, la cookie se construye con `path=/`,
  `max-age` y `samesite=lax` y **sin** `httponly`, y el nombre no colisiona con el de la cookie
  de sesión de QC-8.
- **Regresión (R22, R23, R24).** No se escriben tests nuevos desde cero: los de QC-11 y QC-12
  (`tests/unit/app-sidebar.test.tsx`, `sidebar-desktop`, `sidebar-mobile`, `private-layout`,
  `dashboard-page`) ya afirman estructura, `aria-current`, landmark `main` único y dashboard
  vacío. La feature exige que **sigan verdes sin editarlos**; se añade solo la aserción de que
  el header contiene ahora dos controles y que `SidebarToggle` conserva su nombre accesible.

## 10. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El script inline se emite con `defer` o fuera de sitio y deja de correr antes de pintar | §8 nivel 1 lo afirma en el HTML serializado; el E2E lo prueba de verdad |
| La escucha de `matchMedia` queda suscrita con preferencia `light`/`dark` y arrastra al usuario | Test de R17 con dos preferencias: con `system` reacciona, con `dark` no |
| El proveedor lee la cookie en un `useEffect` y reintroduce el parpadeo | `initialPreference` entra por props desde el servidor (§4); el test del nivel 3 lo fija |
| La regla CSS queda dentro de `@layer` y pierde contra las utilidades | §6: sin capa, con comentario en el CSS y test de contrato que mira el texto |
| El proveedor en el root layout obliga a `'use client'` hacia abajo | No: `'use client'` marca una frontera, no contagia hacia arriba. `app/(private)/layout.tsx` se verifica explícitamente en R27 |
| `cookies()` en el root layout vuelve dinámicas las rutas públicas | Coste aceptado y escrito en §3.4, no descubierto después |
| Cambiar el alto de item a 44 px descoloca la barra en modo icono (78 px) | Test de render en los dos modos; el ancho de icono se sube en la misma tanda |
