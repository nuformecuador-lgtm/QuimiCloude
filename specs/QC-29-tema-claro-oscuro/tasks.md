# QC-29 — tema-claro-oscuro · tasks.md

> Checklist de implementación. `[P]` = paralelizable con las tareas de su mismo bloque.
> Los nombres de test de la columna «Cubre» son el mapa de trazabilidad que exige
> `CHECKPOINTS.md > Trazabilidad`.
>
> **Revisión del 2026-09-02:** el bloque 0 ya no es «instalar `next-themes`». El humano
> rechazó la dependencia (D9) y el mecanismo pasa a ser código propio, así que el bloque 0 y
> el bloque 2 están reescritos. Los bloques 1 y 3 no cambian.

## Bloque 0 — el módulo puro del tema

### T0 [x] — `lib/shared/ui/theme-state.ts`
- Módulo puro con `THEME_COOKIE`, `THEME_COOKIE_MAX_AGE`, `THEME_DARK_CLASS`, el tipo
  `ThemePreference` y las funciones `readThemePreference` / `buildThemeCookie`
  (`design.md > 3.1`). Docblock que cite el precedente de `sidebar-state.ts` y diga por qué
  esta cookie **no** es cookie de sesión.
- `lib/shared/**` es hoja del grafo: no importa módulos ni composición.
- **Depende de:** aprobación humana del spec (F1.4).
- **Hecho cuando:** T1b pasa y `pnpm run typecheck` está verde.

### T1b [x] — [P] Tests del módulo de estado
- Nuevo `tests/unit/theme/theme-state.test.ts` (proyecto `node`):
  - `devuelve sistema cuando no hay cookie` → **R7**
  - `devuelve sistema ante un valor no reconocido y no lanza` → **R7**
  - `devuelve la preferencia guardada cuando la cookie es valida` → **R9**
  - `construye la cookie con path, max-age y samesite y sin httponly` → **R29**
  - `no reutiliza el nombre de la cookie de sesion` → **R29**
- **Depende de:** T0.

## Bloque 1 — esquema de color (independiente de los bloques 2 y 3)

### T1 [x] — Sustituir los tokens de `:root` y `.dark` en `app/globals.css`
- Valores exactos de `design-input-tokens.md > 3`, en `oklch`. `--radius` sin tocar.
  `--chart-*` sin tocar. No se toca el bloque `@theme inline`.
- **Depende de:** —
- **Hecho cuando:** T2 pasa en verde y `pnpm run lint` no reporta nada.

### T2 [x] — [P] Test de contrato de los tokens
- Nuevo `tests/unit/theme/color-tokens.test.ts` (proyecto `node`): parsea `app/globals.css`,
  extrae `:root` y `.dark` y compara contra la tabla esperada escrita en el test. Incluye la
  conversión `oklch → sRGB` y el cálculo de contraste WCAG para R25.
- Tests (nombres, en el estilo de `docs/conventions.md`):
  - `define los 26 tokens del modo claro con los valores del diseno` → **R1**
  - `define los 26 tokens del modo oscuro con los valores del diseno` → **R2**
  - `no deja ningun color acromatico heredado de shadcn init` → **R3**
  - `usa el mismo hue de acento en los dos modos y solo cambia la luminosidad` → **R4**
  - `mantiene --radius en 0.625rem` → **R5**
  - `no modifica los cinco tokens --chart-*` → **R6**
  - `alcanza 4.5:1 de contraste en foreground/background y sidebar-foreground/sidebar` → **R25**
- **No** se añade aserción sobre `--primary` / `--primary-foreground`: D10 cerró ese par en
  `3,75:1`. Dejarlo escrito como comentario en el test para que nadie lo lea como olvido.
- **Hecho cuando:** los 7 tests pasan y, borrando un token de `globals.css`, el test **muerde**
  (`docs/verification.md > Probar que muerde`).

## Bloque 2 — elección de modo (mecanismo propio)

### T3 [x] — Script anti-parpadeo
- Nuevo `lib/shared/ui/theme-init-script.ts` con `THEME_INIT_SCRIPT` como constante de texto:
  IIFE sin dependencias, envuelta en `try/catch`, que lee la cookie, resuelve `system` con
  `matchMedia` y aplica clase + `color-scheme` (`design.md > 3.2`).
- **Depende de:** T0.
- **Hecho cuando:** T4 pasa con sus cinco escenarios.

### T4 [x] — [P] Test que EJECUTA el script
- Nuevo `tests/unit/theme/theme-init-script.test.ts` (proyecto `ui`, jsdom): evalúa
  `THEME_INIT_SCRIPT` contra `document` y `matchMedia` simulados.
  - `aplica el modo oscuro cuando la cookie dice dark` → **R10**
  - `aplica el modo claro cuando la cookie dice light` → **R10**
  - `sigue al sistema operativo cuando no hay cookie` → **R7**, **R10**
  - `fija color-scheme en el elemento raiz` → **R10**
  - `no propaga el error si las cookies estan bloqueadas` → **R10**
- **Depende de:** T3.

### T5 [x] — Proveedor de tema
- Nuevo `components/shared/theme-provider.tsx` (`'use client'`): contexto con `preference`,
  `resolved` y `setPreference`, hook `useTheme()`, `initialPreference` por props, escritura de
  la cookie con `buildThemeCookie` y suscripción a `matchMedia` **solo mientras la preferencia
  sea `system`** (`design.md > 3.3`).
- **Depende de:** T0, T3.
- **Hecho cuando:** T7 pasa.

### T6 [x] — Root layout
- `app/layout.tsx`: lee la cookie con `cookies()` y `readThemePreference`; `<html>` con
  `suppressHydrationWarning`, la clase `dark` cuando la preferencia es explícitamente oscura y
  el `color-scheme` correspondiente; `<script>` con `THEME_INIT_SCRIPT` como **primer hijo de
  `<body>`**, sin `async` ni `defer`; `<ThemeProvider initialPreference={…}>` envolviendo
  `{children}`. Fuentes, clases y metadata: igual que hoy.
- **Depende de:** T5.
- **Hecho cuando:** T7 pasa.

### T7 [x] — [P] Tests del cableado
- Nuevo `tests/unit/theme/theme-provider.test.tsx` (proyecto `ui`):
  - `marca el html con suppressHydrationWarning` → **R12**
  - `emite el script de tema antes del marcado de la aplicacion y sin defer` → **R10**
    (nivel 1 de `design.md > 8`)
  - `sirve la clase oscura ya en el HTML cuando la cookie dice dark` → **R10** (nivel 3)
  - `aplica el tema tambien a las rutas publicas` → **R26**
  - `resuelve el modo por prefers-color-scheme cuando no hay preferencia guardada` → **R7**
  - `refleja un cambio del sistema operativo mientras la preferencia es sistema` → **R17**
  - `deja de seguir al sistema operativo cuando la preferencia es explicita` → **R17**
- **Depende de:** T6.

### T8 [x] — Control de tema
- Nuevo `app/(private)/components/theme-toggle.tsx` (`'use client'`) con `DropdownMenu` +
  `DropdownMenuRadioGroup`, `useTheme()` del proveedor propio y las cuatro constantes de
  etiqueta (`design.md > 5`). Reexportar componente y constantes en
  `app/(private)/components/index.ts`.
- Icono sol/luna con variante `dark:`, sin `mounted` ni render condicional en JS.
- **Depende de:** T5.
- **Hecho cuando:** T10 pasa.

### T9 [x] — Montar el control en el encabezado privado
- `app/(private)/layout.tsx`: `<ThemeToggle />` junto a `<SidebarToggle />` en el `<header>`.
  **El archivo sigue sin `'use client'`** y sigue siendo el único que llama al proveedor de
  sesión.
- **Depende de:** T8.
- **Hecho cuando:** T10 y T11 pasan y `tests/unit/private-layout.test.tsx` sigue verde **sin
  editarlo**.

### T10 [x] — [P] Tests del control
- Nuevo `tests/unit/theme/theme-toggle.test.tsx` (proyecto `ui`):
  - `ofrece las tres opciones de modo con nombre accesible` → **R8**, **R14**
  - `marca programaticamente la opcion seleccionada` → **R14**
  - `escribe la preferencia elegida en la cookie de UI` → **R8**, **R29**
  - `aplica el modo elegido sin recargar la pagina` → **R15**
  - `arranca con la preferencia que le pasa el servidor` → **R9**
  - `expone un area accionable de al menos 44x44 px y no depende de hover` → **R16**
  - `toma su nombre accesible de la constante exportada` → **R13**
- **Depende de:** T8.

### T11 [x] — [P] Test del encabezado privado
- Nuevo `tests/unit/theme/private-header.test.tsx` (proyecto `ui`):
  - `muestra el control de tema junto al de la barra lateral` → **R13**
  - `conserva un unico landmark main y el nombre accesible del SidebarToggle` → **R24**
  - `no convierte el layout privado en Client Component` → **R27** (contrato de fuente: el
    archivo no declara `'use client'` y sigue llamando al proveedor de sesión)
- **Depende de:** T9.

### T12 [x] — E2E del anti-parpadeo
- Nuevo `e2e/theme.spec.ts`, sobre `/login` (ruta pública, sin sesión), en chromium y webkit.
  Sonda de `requestAnimationFrame` inyectada con `addInitScript` (`design.md > 8`, nivel 4).
  - `no pinta el modo claro antes de aplicar el oscuro del sistema` → **R10**, **R7**
  - `conserva la preferencia guardada tras recargar y en una sesion nueva del navegador` →
    **R9**
  - `mantiene el modo al navegar entre rutas` → **R11**
  - `sigue el cambio de prefers-color-scheme mientras la preferencia es sistema` → **R17**
- **Depende de:** T6.
- **Hecho cuando:** `pnpm run e2e` pasa en los dos proyectos y, quitando el `<script>` del
  layout, el test de parpadeo **falla** (prueba de mordida).

## Bloque 3 — panel flotante (independiente del bloque 2)

### T13 [x] — Reglas CSS del panel en `app/globals.css`
- Variables `--sidebar-panel-gradient` por modo (hex del insumo, con el porqué comentado) y
  reglas **sin `@layer`** para `[data-slot="sidebar-inner"]`,
  `[data-slot="sidebar"][data-mobile="true"]` (radio 22 px + degradado) y
  `[data-slot="sidebar-menu-button"]` (`min-height: 44px`). Comentario explicando la cascada
  (`design.md > 6`).
- **Depende de:** T1 (mismo archivo — no paralelizar con T1).
- **Hecho cuando:** T15 pasa.

### T14 [x] — Medidas por props públicas
- `app/(private)/layout.tsx`: `style={{ '--sidebar-width': '17rem', '--sidebar-width-icon':
  '4.875rem' }}` en `<SidebarProvider>`.
- `components/private/app-sidebar.tsx`: `variant="floating"` y `className="p-[18px]"` en
  `<Sidebar>`. **Nada más cambia**: mismos items, mismos `data-testid`, mismo `aria-current`.
- **Depende de:** —
- **Hecho cuando:** T15 y T16 pasan y `tests/unit/app-sidebar.test.tsx`,
  `sidebar-desktop.test.tsx` y `sidebar-mobile.test.tsx` siguen verdes **sin editarlos**.

### T15 [x] — [P] Test de contrato del panel
- Nuevo `tests/unit/theme/sidebar-panel.test.tsx`:
  - `pinta el panel flotante con radio 22px y el degradado de 166 grados de cada modo` → **R18**
  - `usa 272px de ancho expandido y 78px en modo icono` → **R19**
  - `da al menos 44px de alto a cada item de menu` → **R20**
  - `declara las reglas del panel fuera de toda capa de cascada` → **R18** (evita el falso verde
    del `@layer`)
- **Depende de:** T13, T14.

### T16 [x] — [P] Guardia de `components/ui/` intacto
- Nuevo `tests/unit/theme/ui-primitivas-intactas.test.ts`:
  - `no mete las medidas nuevas dentro de components/ui/sidebar.tsx` → **R21** (afirma que
    siguen presentes `SIDEBAR_WIDTH = "16rem"`, `SIDEBAR_WIDTH_ICON = "3rem"` y
    `group-data-[variant=floating]:rounded-lg`)
- **Depende de:** —

## Bloque 4 — regresión y cierre

### T17 [x] — [P] Test de «ninguna dependencia nueva»
- Nuevo `tests/unit/theme/sin-dependencias-nuevas.test.ts`:
  - `no incorpora next-themes ni ninguna libreria de tema a package.json` → **R28**
- No congela la lista entera de dependencias (`design.md > 9`): eso sería un peaje para toda
  feature futura, y la guardia `guard-dependencias-aprobadas` ya cubre el caso general.
- **Depende de:** —

### T18 — Verificar regresión sin editar los tests ajenos
- `pnpm test` completo. Los tests de QC-11 y QC-12 deben pasar **tal cual están**:
  `app-sidebar`, `sidebar-desktop`, `sidebar-mobile`, `private-layout`, `nav-user`,
  `dashboard-page`, `dashboard-route-contract`.
- **Cubre:** **R22** (`tests/unit/app-sidebar.test.tsx`, `sidebar-desktop.test.tsx`,
  `sidebar-mobile.test.tsx` siguen verdes), **R23** (`tests/unit/dashboard-page.test.tsx` sigue
  verde), **R24** (`tests/unit/private-layout.test.tsx` sigue verde).
- **Hecho cuando:** cero rojos nuevos respecto de `tests/baseline-rojos.json`, y **ningún
  archivo de test ajeno modificado** (verificable en el diff del PR).

### T19 [x] — Mapa de trazabilidad y evidencia
- Escribir `progress/impl_QC-29-tema-claro-oscuro.md` con la salida real de los tests y el mapa
  `R<n> → test` completo (R1…R29).
- **Depende de:** T1b, T2, T4, T7, T10, T11, T12, T15, T16, T17, T18.

### T20 — Gate completo
- `./init.sh` completo antes del PR, sin excepción (`docs/verification.md`).
- **Depende de:** T19.

## Mapa `R<n> → test` (resumen)

| R | Test | Task |
| --- | --- | --- |
| R1, R2, R3, R4, R5, R6, R25 | `color-tokens.test.ts` | T2 |
| R7 | `theme-state.test.ts` + `theme-init-script.test.ts` + `theme-provider.test.tsx` + `e2e/theme.spec.ts` | T1b, T4, T7, T12 |
| R8 | `theme-toggle.test.tsx` | T10 |
| R9 | `theme-state.test.ts` + `theme-toggle.test.tsx` + `e2e/theme.spec.ts` | T1b, T10, T12 |
| R10 | `theme-init-script.test.ts` + `theme-provider.test.tsx` + `e2e/theme.spec.ts` | T4, T7, T12 |
| R11 | `e2e/theme.spec.ts` | T12 |
| R12 | `theme-provider.test.tsx` | T7 |
| R13 | `theme-toggle.test.tsx` + `private-header.test.tsx` | T10, T11 |
| R14 | `theme-toggle.test.tsx` | T10 |
| R15 | `theme-toggle.test.tsx` | T10 |
| R16 | `theme-toggle.test.tsx` | T10 |
| R17 | `theme-provider.test.tsx` + `e2e/theme.spec.ts` | T7, T12 |
| R18, R19, R20 | `sidebar-panel.test.tsx` | T15 |
| R21 | `ui-primitivas-intactas.test.ts` | T16 |
| R22 | `app-sidebar` / `sidebar-desktop` / `sidebar-mobile` sin editar | T18 |
| R23 | `dashboard-page.test.tsx` sin editar | T18 |
| R24 | `private-header.test.tsx` + `private-layout.test.tsx` | T11, T18 |
| R26 | `theme-provider.test.tsx` (`aplica el tema tambien a las rutas publicas`) | T7 |
| R27 | `private-header.test.tsx` | T11 |
| R28 | `sin-dependencias-nuevas.test.ts` | T17 |
| R29 | `theme-state.test.ts` + `theme-toggle.test.tsx` | T1b, T10 |
