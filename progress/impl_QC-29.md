# QC-29 — tema-claro-oscuro · bitacora de implementacion

> La escribe el **implementer**. Cierra T19 de `specs/QC-29-tema-claro-oscuro/tasks.md`.
> Nota de nombre: `tasks.md > T19` la llamaba `progress/impl_QC-29-tema-claro-oscuro.md` —que es
> ademas la convencion del resto de `progress/`—; el leader pidio explicitamente
> `progress/impl_QC-29.md` al delegar. Se usa el nombre que pidio el leader y queda anotada la
> diferencia para que no se lea como archivo que falta.

## Estado

18 de 20 tareas cerradas (T0, T1b, T1–T11, T13–T17). **T12 esta escrita pero no ejecutada**, y
**T18 y T20 quedan para el leader**: el E2E levanta un servidor y la suite entera / `./init.sh`
los corre el leader por instruccion explicita suya (las corridas largas rompen el stream del
subagente).

| Tarea | Estado |
| --- | --- |
| T0, T1b, T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T13, T14, T15, T16, T17 | hechas y verdes |
| T12 (`e2e/theme.spec.ts`) | archivo escrito con sus 4 escenarios; **`pnpm e2e` NO ejecutado aqui** |
| T18 (suite completa) | pendiente del leader (`pnpm test`) |
| T20 (`./init.sh` completo) | pendiente del leader, antes del PR |

## Archivos creados

| Archivo | Que es |
| --- | --- |
| `lib/shared/ui/theme-state.ts` | modulo puro: `THEME_COOKIE`, `THEME_COOKIE_MAX_AGE`, `THEME_DARK_CLASS`, `ThemePreference`, `readThemePreference`, `buildThemeCookie` |
| `lib/shared/ui/theme-init-script.ts` | `THEME_INIT_SCRIPT`: el anti-parpadeo como constante de texto (por eso es ejecutable en un test) |
| `components/shared/theme-provider.tsx` | cliente: `ThemeProvider`, `useTheme()`, `useOptionalTheme()`, hook interno `useThemeState` y respaldo `useFallbackThemeState` |
| `app/(private)/components/theme-toggle.tsx` | el control: `DropdownMenu` + `DropdownMenuRadioGroup` y las 4 constantes de etiqueta |
| `tests/unit/theme/theme-state.test.ts` | T1b |
| `tests/unit/theme/color-tokens.test.ts` | T2 |
| `tests/unit/theme/theme-init-script.test.tsx` | T4 (extension `.tsx` a proposito: es la que enruta al proyecto `ui`/jsdom en `vitest.config.mts`) |
| `tests/unit/theme/theme-provider.test.tsx` | T7 |
| `tests/unit/theme/theme-toggle.test.tsx` | T10 |
| `tests/unit/theme/private-header.test.tsx` | T11 |
| `tests/unit/theme/sidebar-panel.test.tsx` | T15 |
| `tests/unit/theme/ui-primitivas-intactas.test.ts` | T16 |
| `tests/unit/theme/sin-dependencias-nuevas.test.ts` | T17 |
| `e2e/theme.spec.ts` | T12 (escrito, no ejecutado) |

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `app/globals.css` | 26 tokens de `:root` y `.dark` con los valores exactos del insumo; `--sidebar-panel-gradient` por modo (hex); reglas del panel **fuera de `@layer`**. `@theme inline`, `--radius` y `--chart-*` sin tocar |
| `app/layout.tsx` | pasa a `async`; lee la cookie con `cookies()` + `readThemePreference`; `<html suppressHydrationWarning>` con clase y `color-scheme` cuando la preferencia es explicita; `<script>` primer hijo de `<body>` sin `async` ni `defer`; `<ThemeProvider initialPreference>` envolviendo `{children}` |
| `app/(private)/layout.tsx` | `<ThemeToggle />` en el `<header>` y `style` con `--sidebar-width: 17rem` / `--sidebar-width-icon: 4.875rem` en `<SidebarProvider>`. **Sigue siendo Server Component** y sigue siendo el unico que llama al proveedor de sesion |
| `app/(private)/components/index.ts` | reexporta `ThemeToggle` y sus 4 constantes de etiqueta |
| `components/private/app-sidebar.tsx` | `variant="floating"` y `className="p-[18px]"` en `<Sidebar>`. Nada mas: mismos items, mismos `data-testid`, mismo `aria-current` |
| `specs/QC-29-tema-claro-oscuro/tasks.md` | marcas `[x]` de las tareas cerradas |

**No se toco**: `components/ui/` (R21), `package.json` (R28), `DashboardContent` (R23),
`lib/modules/`, `docs/dependencias.md` (no hay dependencia que aprobar) ni ningun test ajeno de
QC-11/QC-12.

## Mapa `R<n> -> test`

| R | Test que lo cubre | Archivo |
| --- | --- | --- |
| R1 | `define los 26 tokens del modo claro con los valores del diseno` | `tests/unit/theme/color-tokens.test.ts` |
| R2 | `define los 26 tokens del modo oscuro con los valores del diseno` | idem |
| R3 | `no deja ningun color acromatico heredado de shadcn init` | idem |
| R4 | `usa el mismo hue de acento en los dos modos y solo cambia la luminosidad` | idem |
| R5 | `mantiene --radius en 0.625rem` | idem |
| R6 | `no modifica los cinco tokens --chart-*` | idem |
| R7 | `devuelve sistema cuando no hay cookie`; `devuelve sistema ante un valor no reconocido y no lanza`; `sigue al sistema operativo cuando no hay cookie`; `resuelve el modo por prefers-color-scheme cuando no hay preferencia guardada`; `no pinta el modo claro antes de aplicar el oscuro del sistema` | `theme-state.test.ts`, `theme-init-script.test.tsx`, `theme-provider.test.tsx`, `e2e/theme.spec.ts` |
| R8 | `ofrece las tres opciones de modo con nombre accesible`; `escribe la preferencia elegida en la cookie de UI` | `theme-toggle.test.tsx` |
| R9 | `devuelve la preferencia guardada cuando la cookie es valida`; `arranca con la preferencia que le pasa el servidor`; `conserva la preferencia guardada tras recargar y en una sesion nueva del navegador` | `theme-state.test.ts`, `theme-toggle.test.tsx`, `e2e/theme.spec.ts` |
| R10 | `aplica el modo oscuro cuando la cookie dice dark`; `aplica el modo claro cuando la cookie dice light`; `fija color-scheme en el elemento raiz`; `no propaga el error si las cookies estan bloqueadas`; `emite el script de tema antes del marcado de la aplicacion y sin defer`; `sirve la clase oscura ya en el HTML cuando la cookie dice dark` | `theme-init-script.test.tsx`, `theme-provider.test.tsx`, `e2e/theme.spec.ts` |
| R11 | `mantiene el modo al navegar entre rutas` | `e2e/theme.spec.ts` (**no ejecutado aqui**) |
| R12 | `marca el html con suppressHydrationWarning` | `theme-provider.test.tsx` |
| R13 | `toma su nombre accesible de la constante exportada`; `muestra el control de tema junto al de la barra lateral` | `theme-toggle.test.tsx`, `private-header.test.tsx` |
| R14 | `ofrece las tres opciones de modo con nombre accesible`; `marca programaticamente la opcion seleccionada` | `theme-toggle.test.tsx` |
| R15 | `aplica el modo elegido sin recargar la pagina` | `theme-toggle.test.tsx` |
| R16 | `expone un area accionable de al menos 44x44 px y no depende de hover` | `theme-toggle.test.tsx` |
| R17 | `refleja un cambio del sistema operativo mientras la preferencia es sistema`; `deja de seguir al sistema operativo cuando la preferencia es explicita`; `sigue el cambio de prefers-color-scheme mientras la preferencia es sistema` | `theme-provider.test.tsx`, `e2e/theme.spec.ts` |
| R18 | `pinta el panel flotante con radio 22px y el degradado de 166 grados de cada modo`; `declara las reglas del panel fuera de toda capa de cascada` | `sidebar-panel.test.tsx` |
| R19 | `usa 272px de ancho expandido y 78px en modo icono` | `sidebar-panel.test.tsx` |
| R20 | `da al menos 44px de alto a cada item de menu` | `sidebar-panel.test.tsx` |
| R21 | `no mete las medidas nuevas dentro de components/ui/sidebar.tsx` | `ui-primitivas-intactas.test.ts` |
| R22 | `app-sidebar.test.tsx`, `sidebar-desktop.test.tsx`, `sidebar-mobile.test.tsx` verdes **sin editarlos** | tests de QC-11 |
| R23 | `dashboard-page.test.tsx` verde **sin editarlo** | test de QC-12 |
| R24 | `conserva un unico landmark main y el nombre accesible del SidebarToggle`, mas `private-layout.test.tsx` sin editar | `private-header.test.tsx`, test de QC-11 |
| R25 | `alcanza 4.5:1 de contraste en foreground/background y sidebar-foreground/sidebar` | `color-tokens.test.ts` |
| R26 | `aplica el tema tambien a las rutas publicas` | `theme-provider.test.tsx` |
| R27 | `no convierte el layout privado en Client Component` | `private-header.test.tsx` |
| R28 | `no incorpora next-themes ni ninguna libreria de tema a package.json` | `sin-dependencias-nuevas.test.ts` |
| R29 | `construye la cookie con path, max-age y samesite y sin httponly`; `no reutiliza el nombre de la cookie de sesion`; `escribe la preferencia elegida en la cookie de UI` | `theme-state.test.ts`, `theme-toggle.test.tsx` |

**29 de 29 requisitos trazados.** R11 es el unico cuya evidencia depende enteramente del E2E,
todavia sin ejecutar (ver «Lo que falta»). R25 **no** cubre el par `--primary` /
`--primary-foreground`: D10 lo cerro en 3,75:1 (umbral de componente de UI, no de texto), y esta
escrito asi a proposito, con comentario en el propio test.

## Salida real de los tests

`pnpm typecheck` (2026-09-02, worktree QC-29):

```
> quimicloude@0.1.0 typecheck
> tsc --noEmit
```

(sin salida: limpio)

`pnpm lint`:

```
> quimicloude@0.1.0 lint
> eslint
```

(sin salida: limpio)

`pnpm exec vitest run tests/unit tests/ui tests/guards` — **no es la suite completa**: quedan
fuera `tests/integration/` (necesita base) y el E2E.

```
 Test Files  36 passed (36)
      Tests  352 passed (352)
     Errors  14 errors
   Duration  137.85s
```

Los 14 «errors» **no son tests rojos**: todos son `[vitest-pool]: Failed to start forks worker` /
`Timeout waiting for worker to respond`, es decir contencion de recursos al lanzar los tres
proyectos a la vez en esta maquina. Se reejecuto el subconjunto afectado con el paralelismo
acotado y salio limpio, sin ningun error de pool:

```
pnpm exec vitest run tests/unit/theme tests/ui --maxWorkers=2

 Test Files  11 passed (11)
      Tests  46 passed (46)
   Duration  99.44s
```

Queda anotado para el leader: si `./init.sh` completo vuelve a mostrar esos errores de pool, es
el mismo sintoma de entorno, no la feature.

### Pruebas de mordida (`docs/verification.md > Probar que muerde`)

| Que se rompio a proposito | Que test mordio |
| --- | --- |
| se borro `--foreground` de `:root` en `globals.css` | `color-tokens.test.ts` (3 de 7 rojos: «Token --foreground no encontrado en el bloque») |
| se quito el `<script>` de `app/layout.tsx` | `emite el script de tema antes del marcado de la aplicacion y sin defer` |
| se quito el `style` del `SidebarProvider` | `usa 272px de ancho expandido y 78px en modo icono` (`expected '16rem' to be '17rem'`) |
| se quito el `aria-label` del disparador | los 7 tests de `theme-toggle.test.tsx` |

Todos los archivos se restauraron y se reconfirmo el verde despues de cada mordida.

## Desviaciones del design y por que

**Respaldo del control sin `ThemeProvider` ancestro.** `design.md > 5` dice que `ThemeToggle`
consume `useTheme()` del proveedor, y el proveedor vive en el root layout (R27). Al montar el
control en el `<header>` privado, los tests **protegidos** `tests/unit/private-layout.test.tsx`
y `tests/unit/dashboard-page.test.tsx` —que renderizan `PrivateLayout` aislado, sin
`app/layout.tsx` por encima— se ponian rojos con «useTheme debe usarse dentro de ThemeProvider».
T9 y T11 exigen que sigan verdes **sin editarlos**, asi que el control se degrada con gracia:
`useOptionalTheme()` y, cuando no hay contexto, `useFallbackThemeState()`.

La primera version de ese respaldo **duplicaba** el criterio del proveedor dentro del control
(lectura de cookie, escritura de cookie y `classList.toggle` propios) y ya habia divergido: no
aplicaba `style.colorScheme`. Se consolido en una sola implementacion: el hook interno
`useThemeState` de `components/shared/theme-provider.tsx` lo usan **los dos** caminos, y
`resolvePreference` / `applyResolvedTheme` siguen siendo las unicas fuentes del criterio. En
produccion el respaldo nunca se ejerce, y esta dicho en el docblock para que no se lea como una
segunda fuente de verdad. Los tests de `theme-toggle.test.tsx` montan el `ThemeProvider` **real**,
o sea que ejercitan el camino de produccion, no el respaldo.

**`theme-init-script.test` con extension `.tsx`.** No es un test de componente: es la extension
que `vitest.config.mts` usa para enrutar al proyecto `ui`/jsdom, que es donde el script necesita
un `document`. Queda comentado en el propio archivo.

**R29, comparacion con la cookie de sesion.** El test lee `session-cookie.ts` como texto en vez
de importarlo: `theme-state.ts` es hoja de `lib/shared/**` y no debe quedar acoplada, ni siquiera
desde un test, al arbol de `lib/modules/`. Documentado en el test.

## Lo que falta (para el leader)

1. **T12** — `pnpm e2e` en chromium y webkit, y la prueba de mordida del E2E: quitando el
   `<script>` del layout, `no pinta el modo claro antes de aplicar el oscuro del sistema` debe
   fallar. Sin eso, R11 esta escrito pero no demostrado.
2. **T18** — `pnpm test` completo, contrastando con `tests/baseline-rojos.json` y confirmando en
   el diff del PR que ningun test ajeno fue modificado.
3. **T20** — `./init.sh` completo antes del PR, sin excepcion.

## Preguntas abiertas que siguen abiertas

Las cinco de `requirements.md` siguen sin resolver y ninguna bloqueaba la implementacion: los
`--chart-*`, el ancho del panel en viewport angosto —queda en 288 px, porque
`SIDEBAR_WIDTH_MOBILE` va en un `style` inline del primitivo y R21 prohibe editarlo—, la
persistencia por usuario en base de datos y el control de tema en la zona publica. Ninguna se
resolvio por la via de los hechos.

---

## Addendum 2026-09-02 — T12 ejecutado y en verde (hallazgo mayor F2.2 del leader)

El leader corrio el E2E que esta bitacora habia dejado escrito y **sin ejecutar**, y volvio en
rojo: 5 pasan, 3 fallan (`no pinta el modo claro…` en chromium; `sigue el cambio de
prefers-color-scheme…` en chromium y webkit). Dejar T12 sin correr fue un error de esta
bitacora: un test escrito y no ejecutado no es evidencia de nada, y aqui tapaba un agujero real
de producto.

### Que era cada fallo

**No era una rotura estable, era una carrera.** Reejecutado con `.next` caliente salian 7 de 8
(fallaba solo R17 en webkit); en frio fallaban tres. Instrumentando la pagina con una sonda
temporal (`MutationObserver` sobre `<html>`, deteccion de `__reactFiber$`, registro de frames)
salieron las dos causas:

1. **R17 — `sigue el cambio de prefers-color-scheme mientras la preferencia es sistema`.** Dos
   fallos, uno en el test y **uno de producto**:
   - *Test*: `page.emulateMedia({ colorScheme: 'dark' })` llegaba **antes de que React hidratara**
     (normal con `next dev` compilando `/login` por primera vez), asi que el evento `change` se
     disparaba cuando el listener del proveedor todavia no existia.
   - *Producto*: `useThemeState` **solo reaccionaba al evento `change` y nunca re-sincronizaba el
     DOM al montar**. Un cambio del sistema operativo ocurrido entre que corre
     `THEME_INIT_SCRIPT` y que React hidrata se perdia **para siempre**: el usuario real se
     quedaba en el modo viejo hasta recargar. Ese agujero existia en el codigo, no solo en el
     test.
2. **R10 — `no pinta el modo claro antes de aplicar el oscuro del sistema`.** La sonda miraba el
   className del **primerisimo** `requestAnimationFrame`. Con el HTML en streaming de `next dev`,
   en compilacion fria puede ocurrir un frame antes de que llegue el trozo con el `<script>`
   inline, sobre un documento **sin contenido pintado** (`readyState === 'loading'`). Eso no es
   parpadeo visible, pero la sonda no sabia distinguirlo. Fallo del test, no del codigo.

Dato colateral medido, util para quien lea el codigo: **React 19 iza el `<script>` inline de
`<body>` al `<head>`** en el DOM final. El contrato (correr antes del marcado) se sigue
cumpliendo y el test unitario que lo afirma sobre el HTML serializado sigue siendo valido, pero
`document.body.firstElementChild` **no** es el script.

### Que se toco

| Archivo | Cambio |
| --- | --- |
| `components/shared/theme-provider.tsx` | el efecto de `preference === 'system'` ejecuta `syncResolved()` tambien **al engancharse**, no solo en el evento `change`. Compara contra la clase que hay en el DOM y solo aplica si difiere: idempotente en el caso normal, no reintroduce parpadeo. Respeta `options.active`. El proveedor **sigue sin leer la cookie** en ningun efecto |
| `e2e/theme.spec.ts` | R10: la sonda registra **todos** los frames hasta `load` con su `hasContent`, y afirma que ningun frame **con contenido** llevaba el modo equivocado (mide lo que dice el requisito, no «el primer rAF absoluto»). R17: `waitForHydration` antes de cambiar la emulacion — R17 habla de la pestaña abierta, y una pestaña que aun no termino de cargar no es ese escenario |

### Salida real

```
pnpm exec playwright test e2e/theme.spec.ts --reporter=list   (con .next borrado, en frio)

  8 passed (22.9s)      chromium y webkit, 0 failed
```

Segunda corrida en caliente: 8 passed / 0 failed. `pnpm typecheck` y `pnpm lint` limpios.
`pnpm exec vitest run tests/unit/theme --maxWorkers=2` → 9 archivos, 40 tests, verde.

### Mordidas (las tres, restaurando despues)

| Que se rompio | Que paso |
| --- | --- |
| se quito el `<script>` de `app/layout.tsx` | R10 **falla en los dos motores** |
| se quito el `addEventListener('change', …)` del proveedor | R17 **falla en chromium**; en **webkit no falla** |
| se quito solo la re-sincronizacion de montaje (dejando el listener) | R17 **falla en webkit**; en chromium sigue verde |

La asimetria esta medida, no supuesta: en webkit el efecto pasivo se ejecuta ~15 ms despues de
que la fibra de React aparece en el DOM, asi que el listener llega a registrarse **despues** de
que `matches` ya cambio y el evento `change` nunca vuelve. Ahi quien rescata el caso es la
re-sincronizacion de montaje; en chromium, el listener. **Las dos piezas hacen falta y cada una
tiene un motor que la muerde** — ninguna es decorativa, y por eso ninguna se puede quitar
«porque el test sigue verde» mirando un solo navegador.

### Estado tras el addendum

19 de 20 tareas cerradas (T0–T17, T19). **T18** (`pnpm test` completo contra
`tests/baseline-rojos.json`) y **T20** (`./init.sh` antes del PR) siguen siendo del leader.
R10, R11 y R17 pasan de «escrito» a **demostrado en chromium y webkit**.
