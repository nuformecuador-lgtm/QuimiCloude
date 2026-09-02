# QC-29 — tema-claro-oscuro · review

> Lo escribe el **reviewer**. Solo lectura sobre el codigo: aqui no se edita nada.
> Fuentes: `specs/QC-29-tema-claro-oscuro/{requirements,design,tasks,design-input-tokens}.md`,
> `progress/impl_QC-29.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`,
> `CHECKPOINTS.md` y el diff `origin/dev..HEAD` (commits `0b9fa14`, `eb6b064`, `c27ae84`).

## Que corri yo (no me fie de la bitacora)

Por instruccion del leader NO corri la suite completa ni `./init.sh`. Corri, acotado:

```
npx tsc --noEmit   -> limpio
npx eslint         -> limpio
npx vitest run tests/unit/theme tests/unit/private-layout.test.tsx \
  tests/unit/dashboard-page.test.tsx tests/unit/app-sidebar.test.tsx \
  tests/unit/sidebar-desktop.test.tsx tests/unit/sidebar-mobile.test.tsx --maxWorkers=2
  -> Test Files 14 passed (14) · Tests 79 passed (79)
```

Los tests protegidos de QC-11/QC-12 (`private-layout`, `dashboard-page`, `app-sidebar`,
`sidebar-desktop`, `sidebar-mobile`) pasan **sin estar modificados**: en el diff los unicos
archivos de test que aparecen son nuevos, bajo `tests/unit/theme/`.

**Sonda propia** (archivo temporal, creado y borrado; no queda en el repo). El riesgo mas caro de
esta feature es un falso verde de contrato: las reglas de `globals.css` se verifican leyendo TEXTO,
asi que un selector que no case con nada pasaria en verde igual. Renderice el `PrivateLayout` real
y consulte el DOM:

- `[data-slot="sidebar-inner"]` existe (>0 nodos): la regla de R18 apunta a un nodo real.
- `[data-slot="sidebar-menu-button"]` existe (>0 nodos): la de R20 tambien.
- clase final del disparador de tema: `... relative size-11`, **sin ninguna utilidad `h-*`**
  (tailwind-merge se comio el `h-8` del boton). R16 son 44x44 px de verdad, no solo de contrato.

## Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con EARS numerados (R1–R29).
- [x] `design.md` con alternativas descartadas y su porque (A1–A8).
- [ ] **`tasks.md` con TODAS las tasks `[x]`** — T12, T18 y T20 sin marcar. Ver M1.

### Trazabilidad
- [x] Cada `R<n>` mapea a al menos un test concreto: 29 de 29, y cada nombre de test del mapa
      existe de verdad en el archivo que dice el mapa (comprobado uno a uno).
- [x] `progress/impl_QC-29.md` contiene el mapa `R<n> -> test` completo.
- [ ] **Evidencia EJECUTADA para 28 de 29.** R11 cuelga entero de `e2e/theme.spec.ts`, sin correr.

### Calidad de codigo
- [x] `typecheck` limpio (corrido por mi).
- [x] `lint` limpio (corrido por mi).
- [~] `pnpm test`: corri el subconjunto relevante (14 archivos, 79 tests, verde). La suite entera
      y `./init.sh` los corre el leader (T18/T20).
- [x] Flujo critico: el tema no es uno de los que enumera `CHECKPOINTS.md` (auth, permisos,
      inventario, importes, webhooks), asi que el E2E no lo exige el checkpoint; lo exige el
      propio `design.md > 8` nivel 4 como unica evidencia de R11.
- [x] Multiplataforma (`docs/architecture.md > Componentes > Regla`): sin `100vh` nuevo, sin
      `:hover` como unica via de activacion (el disparador abre por clic/toque/teclado), targets
      de 44x44 (disparador `size-11` verificado en DOM; items de menu `min-height: 44px`), sin
      inputs nuevos (no aplica `font-size >= 16px`) y ninguna libreria de UI nueva que verificar
      en iOS. El E2E corre tambien en webkit — cuando se corra.
- [x] Dependencias: `package.json` **no aparece en el diff**. Nada que anadir a
      `docs/dependencias.md`. El mecanismo propio en vez de `next-themes` esta justificado en
      `design.md > 7 A1` y cerrado por el humano en D9, que es lo que pide
      `docs/architecture.md > Dependencias de terceros`.

### Datos y seguridad
La feature no crea tablas, migraciones, RLS, endpoints ni Server Actions, y no toca `lib/modules/`.
- [x] Ningun secreto hardcodeado; no hay webhooks; no hay acceso a datos.
- [x] La cookie `theme_preference` es preferencia de UI, no de sesion (R29): sin PII, sin
      `httpOnly` a proposito y documentado, `samesite=lax`, nombre distinto de `qc_session`, y
      ningun service la consume.

### Modulos hexagonales
- [x] `lib/shared/ui/theme-state.ts` y `theme-init-script.ts` son hoja del grafo (el segundo solo
      importa al primero); nada de `'use server'`, adaptadores, rutas profundas ni modelos nuevos.

### Configuracion
- [x] Nada que cambie entre entornos quedo hardcodeado.

## Las cuatro lineas rojas

- **R28** — `package.json` intacto (no figura en `git diff origin/dev..HEAD`).
- **R21** — `components/ui/` intacto: ningun archivo de esa carpeta esta en el diff, y
  `components/ui/sidebar.tsx` conserva `SIDEBAR_WIDTH = "16rem"`, `SIDEBAR_WIDTH_ICON = "3rem"` y
  `group-data-[variant=floating]:rounded-lg`.
- **R27** — `app/(private)/layout.tsx` sigue siendo Server Component: sin `'use client'`, sigue
  `async`, sigue llamando a `identity.getSessionUser`. Solo gana `<ThemeToggle />` y el `style`
  del `SidebarProvider`.
- **R23** — el dashboard sigue vacio: `DashboardContent` y `app/(private)/dashboard/` no aparecen
  en el diff, y `dashboard-page.test.tsx` pasa sin editarse.

Las cuatro, en verde.

## Las reglas de `globals.css` fuera de `@layer`

Comprobado por tres vias, no por lectura sola:

1. El test `declara las reglas del panel fuera de toda capa de cascada` hace balanceo de llaves
   sobre CADA `@layer` del archivo y afirma que ninguno contiene las dos reglas. No es un
   `indexOf` ingenuo: si alguien las metiera dentro de `@layer base`, muerde.
2. En el archivo, las reglas ocupan las lineas 148–156 y el unico `@layer base` empieza en la 158,
   es decir DESPUES.
3. Mi sonda confirma que los dos selectores casan con nodos reales del DOM, que era el otro camino
   al falso verde (una regla sin capa que no selecciona nada tambien deja el panel igual que antes).

Lo que no demuestra nadie es el estilo COMPUTADO: jsdom no compila Tailwind y el E2E no mide
estilos. Ver m5.

## El anti-parpadeo

Los cuatro niveles de `design.md > 8` estan escritos. Tres se ejecutan:

1. **Contrato de fuente.** Recorta `<body>` de `app/layout.tsx` y exige que el `<script>` sea el
   primer hijo, sin `async` ni `defer`, y que `<ThemeProvider>` vaya despues. Muerde si se quita
   el script (`startsWith('<script')` falla) y tambien si desaparece el proveedor.
2. **Ejecucion del script.** `new Function(THEME_INIT_SCRIPT)()` contra el `document` de jsdom, con
   los cinco escenarios (cookie dark, cookie light, sin cookie con el sistema en cada modo,
   `color-scheme`, y cookies bloqueadas sin propagar el error). Este SI ejercita el codigo que
   corre en produccion, no una parafrasis suya: la constante que se evalua es la misma que emite
   el layout. Es el nivel que de verdad detectaria un fallo de logica del script.
3. **Render en servidor.** Serializa el `RootLayout` real con `renderToStaticMarkup` y afirma la
   clase `dark` en `<html>` con cookie `dark` y su ausencia con `light`.
4. **E2E, sonda de `requestAnimationFrame`.** NO ejecutado.

Conclusion: el cableado y la logica de R10 estan bien cubiertos; la afirmacion literal del
requisito («antes del primer fotograma pintado») solo la responde el nivel 4, que sigue pendiente.
Ver tambien m2: ningun test ata el tag emitido al contenido de la constante.

## Las dos cosas que el implementer declaro

### 1. Degradacion con gracia (`useOptionalTheme` + `useFallbackThemeState`)

**Juicio: concesion legitima al arnes de tests, no un fallo escondido.** Y la consolidacion
posterior en un unico `useThemeState` fue la correccion correcta. Comprobado en el codigo:

- El `<ThemeProvider>` vive en `app/layout.tsx`, ancestro de TODA ruta, publica y privada (R26).
  No existe camino de produccion donde `ThemeToggle` se monte sin contexto.
- El respaldo no es una segunda fuente de verdad: `useFallbackThemeState` delega en el mismo
  `useThemeState`, y `resolvePreference` / `applyResolvedTheme` —esta ultima ya con
  `color-scheme`— son las unicas implementaciones del criterio. Lo unico que cambia es de donde
  sale la preferencia inicial. La divergencia que describe la bitacora ya no existe en el codigo.
- Con contexto real el respaldo queda inerte: `active: context === null` evita suscribir un
  segundo listener de `matchMedia`.
- El escenario peligroso —que alguien quite el proveedor del root layout y el control se quede
  auto-gestionandose en silencio— SI tiene guardia: el test
  `emite el script de tema antes del marcado de la aplicacion y sin defer` falla si
  `<ThemeProvider` desaparece de `app/layout.tsx`.
- El camino de produccion esta probado: `theme-toggle.test.tsx` monta el `ThemeProvider` real.

Queda el menor m3: el propio camino de respaldo no lo ejercita ningun test.

### 2. T12 — E2E escrito y no ejecutado

Confirmado. `e2e/theme.spec.ts` existe (167 lineas, cuatro escenarios, sonda de
`requestAnimationFrame` inyectada con `addInitScript` en `document_start`, cookie sembrada en el
contexto y contexto nuevo con `storageState` para «sesion nueva del navegador»). El diseno de la
sonda es correcto y responde exactamente la pregunta del requisito. **Pero no se ha corrido.** Un
test que no se ha ejecutado no es evidencia: no sabemos siquiera si resuelve el alias `@/` bajo el
runner de Playwright. **R11 no esta verificado**, por mucho que el archivo exista y este bien
escrito.

## Hallazgos

### Mayores (bloqueantes)

**M1 — R11 sin evidencia ejecutada; T12, T18 y T20 sin cerrar.** `tasks.md` deja tres tareas sin
`[x]` y `CHECKPOINTS.md > Especificacion` las exige todas marcadas. R11 («mantiene el modo al
navegar entre rutas, sin transicion al modo contrario») depende por completo de `e2e/theme.spec.ts`,
no ejecutado; y el nivel 4 de R10/R7/R9/R17 tampoco se ha corrido nunca en un navegador real.
*Que falta:* correr `pnpm e2e` en chromium y webkit con los cuatro escenarios en verde; la prueba
de mordida de T12 (quitar el `<script>` del root layout y ver fallar `no pinta el modo claro antes
de aplicar el oscuro del sistema`); `pnpm test` completo contra `tests/baseline-rojos.json` (hoy
vacio: cualquier rojo es bloqueante); y `./init.sh`. **No hay codigo que arreglar por este
hallazgo** — es ejecucion pendiente, reservada por el propio leader. Si esas corridas salen verdes
y se marcan las tres tasks, el hallazgo cae y el veredicto pasa a OK sin ningun cambio mas.

### Menores

**m1 — El test de R28 es mas debil que el requisito.** R28 dice «ninguna entrada nueva en
`dependencies` ni `devDependencies`»; `sin-dependencias-nuevas.test.ts` solo comprueba que ningun
paquete case con `/theme/i`. Una dependencia nueva llamada `dayjs` pasaria verde. `design.md > 9`
justifica explicitamente no congelar la lista (seria un peaje para toda feature futura) y delega el
caso general en `guard-dependencias-aprobadas`. En esta feature R28 se cumple **de hecho**:
`package.json` no aparece en el diff. Se anota para que nadie lea ese test como la guardia que no es.

**m2 — Ningun test ata el `<script>` emitido al contenido de `THEME_INIT_SCRIPT`.** El nivel 1
comprueba que hay un `<script` de primer hijo sin `async`/`defer`; el nivel 2 ejecuta la constante.
Nadie afirma que el tag emitido lleve DENTRO esa constante: un `<script />` vacio pasaria los dos.
El nivel 4 lo cerraria, y es justo el que no se ha corrido. Un `expect(html).toContain('classList
.toggle')` sobre el HTML serializado del nivel 3 cierra la costura en dos lineas.

**m3 — El camino de respaldo del control no lo ejercita ningun test.** `useFallbackThemeState` solo
se ejecuta de refilon en `private-header.test.tsx` y en los dos tests protegidos, que no afirman
nada sobre el tema. Es codigo vivo sin cobertura propia; existiendo solo por el arnes, es
aceptable, pero conviene decirlo.

**m4 — `resolved` del contexto es hidratacion-insegura y no esta advertido.** En servidor,
`resolvePreference('system')` devuelve `'light'` (no hay `matchMedia`); en cliente devuelve lo que
diga el sistema. Hoy no rompe nada porque ningun consumidor lo pinta —el icono usa la variante
`dark:`, que es la decision correcta de `design.md > 5`—, pero el primer componente futuro que
renderice `resolved` reintroduce el mismatch que R12 prohibe, y el docblock no avisa.

**m5 — La cascada real (fuera de `@layer`) solo esta probada como texto.** Ningun test afirma el
estilo computado del panel (22 px de radio, 44 px de alto): jsdom no compila Tailwind y el E2E no
mide estilos. La verificacion textual mas mi sonda de selectores cubren los dos falsos verdes
conocidos, pero «el panel se ve como el diseno» sigue siendo, en rigor, inspeccion humana.

**m6 — El escenario de R11 en el E2E usa `page.goto`, o sea recarga completa.** El requisito habla
de «navegar entre rutas», que en App Router suele ser navegacion de cliente con `<Link>` (donde
`<html>` ni se remonta). La recarga completa es el caso mas dificil, asi que el test no es laxo,
pero no ejercita la navegacion de cliente. Al correrlo conviene confirmar que `/` responde 200 sin
sesion (hoy es la pagina de `create-next-app`, publica: correcto).

**m7 — El test de R13 es parcialmente tautologico.** Busca el boton POR la constante, asi que
pasaria igual si el JSX llevara el literal `'Cambiar tema'`. Lo que si prueba es que la constante
esta exportada y que el nombre accesible coincide; el precedente `SIDEBAR_TOGGLE_LABEL` se sigue de
todos modos, verificado leyendo la fuente y el barrel.

**m8 — La rama esta 3 commits por detras de `origin/dev`.** Por eso `git diff origin/dev..HEAD`
muestra como «borrados» `specs/QC-30-rediseno-login/design-input-login.md` y parte de
`progress/history.md`: no los borro esta feature, los anadio `dev` despues del punto de corte. Hay
que integrar `origin/dev` antes del PR; se esperan conflictos en `feature_list.json` y
`progress/current.md`.

**m9 — Nombre de la bitacora.** T19 pedia `progress/impl_QC-29-tema-claro-oscuro.md` (la convencion
del resto de `progress/`) y el archivo es `progress/impl_QC-29.md` porque el leader lo pidio asi al
delegar. Esta anotado en la propia bitacora: no es un archivo que falte.

## Requisitos, uno a uno

| R | Estado | Nota |
| --- | --- | --- |
| R1, R2 | verificado | los 26 tokens de `:root` y `.dark` cotejados por mi contra `design-input-tokens.md > 3.1/3.2`, valor a valor: coinciden. La tabla esperada del test tambien coincide con el insumo, o sea que no esta copiada del CSS |
| R3 | verificado | acromatico = `c === 0 && l !== 1`, recorriendo los 26 en los dos modos; `oklch(1 0 0)` permitido a proposito |
| R4 | verificado | hue 50.5 en los cuatro tokens; L 0.623 claro / 0.750 oscuro |
| R5, R6 | verificado | `--radius` y los cinco `--chart-*` intactos |
| R7 | verificado | tres niveles ejecutados (modulo puro, script, proveedor); el cuarto es E2E |
| R8 | verificado | escribe la cookie con el valor elegido |
| R9 | verificado (unit) | el nivel «sesion nueva del navegador» es E2E, pendiente |
| R10 | verificado en 3 de 4 niveles | el «antes del primer fotograma» literal es E2E. Ver m2 |
| **R11** | **NO verificado** | evidencia unica en `e2e/theme.spec.ts`, sin ejecutar. Ver M1 |
| R12 | verificado | `suppressHydrationWarning` presente; sin `mounted` ni render condicional. Ver m4 |
| R13 | verificado | constantes exportadas y reexportadas por el barrel; control en el `<header>`. Ver m7 |
| R14 | verificado | tres `menuitemradio` con nombre propio y `checked` correcto |
| R15 | verificado | el DOM cambia sin desmontar el control |
| R16 | verificado + sonda | clase final `size-11` sin `h-*`; abre por clic, no por hover |
| R17 | verificado | reacciona con `system` y NO con preferencia explicita (se comprueba el `removeEventListener`) |
| R18, R19, R20 | verificado | contrato de texto + render real; mi sonda confirma que los selectores casan con nodos reales. Ver m5 |
| R21 | verificado | linea roja: `components/ui/` no esta en el diff; guardia de literales verde |
| R22 | verificado | `app-sidebar`, `sidebar-desktop`, `sidebar-mobile` verdes sin editar (corridos por mi) |
| R23 | verificado | linea roja: dashboard fuera del diff; `dashboard-page` verde sin editar |
| R24 | verificado | un unico landmark `main`; `SidebarToggle` conserva su nombre accesible |
| R25 | verificado | la conversion oklch -> sRGB lineal y la luminancia WCAG estan bien planteadas (WCAG usa valores lineales, que es lo que calcula el test); los cuatro pares por encima de 4.5:1. El par `--primary`/`--primary-foreground` queda fuera por D10, a proposito |
| R26 | verificado | el proveedor cuelga del root layout y nada ramifica por ruta |
| R27 | verificado | linea roja, comprobada en la fuente |
| R28 | verificado de hecho | linea roja: `package.json` intacto en el diff. Ver m1 sobre el test |
| R29 | verificado | cookie de UI, no de sesion: nombre, atributos y ausencia de `httponly` |

**28 de 29 con evidencia ejecutada. R11 sin ella.**

## Veredicto

**RECHAZADO** — condicional, y por una sola causa: T12 no se ha ejecutado, asi que R11 no esta
demostrado, y T18/T20 siguen abiertas (`CHECKPOINTS.md` exige todas las tasks `[x]`).

Para pasar a OK, sin tocar codigo de produccion:

1. `pnpm e2e` en chromium y webkit: los cuatro escenarios de `e2e/theme.spec.ts` en verde.
2. La mordida de T12: quitar el `<script>` del root layout, ver fallar `no pinta el modo claro
   antes de aplicar el oscuro del sistema`, restaurar y reconfirmar.
3. `pnpm test` completo sin rojos nuevos (baseline vacio) y `./init.sh` en verde.
4. Marcar `[x]` T12, T18 y T20 en `tasks.md`.

**No hay ningun defecto de implementacion que devolver al implementer.** El codigo revisado cumple
los otros 28 requisitos, respeta las cuatro lineas rojas y no introduce bloqueantes de
arquitectura, seguridad, multiplataforma ni dependencias. Los nueve hallazgos menores son mejoras
de cobertura e higiene, no condiciones de merge.

---

# Segunda ronda — commit `ccffe10`

> La primera ronda queda arriba tal cual, sin reescribir. Esta seccion revisa el arreglo del
> hallazgo M1: el leader corrio el E2E (3 de 8 en rojo), lo devolvio al implementer, y el arreglo
> **toco codigo de produccion** (`components/shared/theme-provider.tsx`) ademas del propio E2E.
> Alcance del diff `c27ae84..ccffe10`: `theme-provider.tsx`, `e2e/theme.spec.ts`,
> `progress/impl_QC-29.md`, `progress/review_QC-29.md` y una marca `[x]` en T12. Nada mas.

## Que corri yo en esta ronda

No repeti los datos que el leader ya dio por verificados (8 passed con `.next` borrado, gate
rapido verde). Corri lo que decide las preguntas que me planteo, y las **tres mordidas** — el
unico caso en que se me autorizo ejecutar el E2E:

```
npx vitest run tests/unit/theme tests/unit/private-layout.test.tsx \
  tests/unit/dashboard-page.test.tsx --maxWorkers=2   -> 11 archivos, 53 tests, verde
npx tsc --noEmit -> limpio        npx eslint -> limpio
```

**Mordida 1 — quitar el `<script>` de `app/layout.tsx`** (¿sigue mordiendo R10 tras el cambio de
sonda?):

```
npx playwright test e2e/theme.spec.ts -g "no pinta el modo claro"   -> EXIT=1
  2 failed: [chromium] y [webkit]
  falla en `expect(isDarkClassName(frame.className)).toBe(true)` (linea 188), NO en
  `expect(paintedFrames.length).toBeGreaterThan(0)`
```

**Mordida 2 — quitar solo `syncResolved()` del montaje, dejando el listener**:

```
npx playwright test e2e/theme.spec.ts -g "sigue el cambio de prefers-color-scheme" -> EXIT=1
  ✓ chromium  ·  ✘ webkit
```

**Mordida 3 — quitar solo `addEventListener('change', …)`, dejando la re-sincronizacion**:

```
npx playwright test e2e/theme.spec.ts -g "sigue el cambio de prefers-color-scheme" -> EXIT=1
  ✓ webkit  ·  ✘ chromium
```

Los tres archivos se restauraron con `git checkout` y el arbol quedo limpio (`git status`
vacio). **La asimetria que declara la bitacora es cierta, medida por mi, no aceptada de palabra.**

## ¿Se ablando el test? (la pregunta central)

### R10: de «el primer frame» a «ningun frame con contenido»

**Veredicto: no se ablando; en conjunto mide MAS que antes.** Razonamiento y prueba:

- La version vieja miraba **un** frame (el primer `requestAnimationFrame`). La nueva registra
  **todos** los frames hasta `load` mas uno posterior, y exige el modo correcto en **cada uno**
  de los que tienen contenido. Donde antes habia una foto ahora hay una pelicula: un parpadeo en
  el frame 3 lo detecta la nueva y no lo detectaba la vieja.
- Lo unico que se exime son los frames con `readyState === 'loading'`. Y el test conserva
  `expect(paintedFrames.length).toBeGreaterThan(0)`, o sea que no puede pasar por vacio: si el
  filtro se comiera todo, el test falla.
- La prueba que zanja la discusion es la mordida, y la corri yo: **sin el `<script>`, R10 falla en
  chromium y en webkit**, y falla en la asercion del modo, no en la del recuento. Un test que se
  hubiera recortado «hasta que pasara» no mordería. Este muerde, y en los dos motores.
- Efecto colateral util: esa mordida cierra tambien el menor **m2** de la primera ronda (nadie
  ataba el `<script>` emitido al contenido de `THEME_INIT_SCRIPT`). Ahora esta atado de extremo a
  extremo por el E2E.

Queda un reparo real, menor, sobre el **predicado**: `hasContent` se define como
`readyState !== 'loading'`, que significa «el parser termino», no «habia algo pintado». Un
navegador puede pintar contenido en streaming con `readyState === 'loading'`, asi que el filtro es
mas ancho que su propia justificacion. En esta app no abre un agujero —el `<script>` es lo primero
del `<body>` y React 19 ademas lo iza al `<head>`, asi que no hay marcado de la app que se pinte
antes de que corra—, y la mordida demuestra que no neutraliza la asercion. Pero el predicado
correcto seria mirar si hay algo que ver (`document.body?.childElementCount > 0`, o la presencia
de un elemento conocido de `/login`), no el estado del parser. Ver n2.

### R17: esperar a la hidratacion antes de emular el cambio

**Veredicto: no se ablando.** R17 dice «MIENTRAS la preferencia sea sistema, CUANDO cambie
`prefers-color-scheme`… sin recargar la pagina», y `design.md > 3.3` lo describe como
sincronizacion **mientras la pestaña esta abierta**. Una pestaña que todavia no ha montado la app
no es ese escenario; esperar a la hidratacion es hacer determinista el escenario del requisito, no
recortarlo.

Y lo importante: **el caso que la version vieja tocaba por accidente —el cambio que ocurre ANTES
de que exista el listener— no se perdio, se promovio a codigo de produccion**. Antes ese caso
fallaba (bug real, el usuario se quedaba en el modo viejo hasta recargar); ahora lo cubre la
re-sincronizacion de montaje. Mis mordidas 2 y 3 lo demuestran de forma tajante: cada mecanismo
tiene un motor que lo muerde, y quitar cualquiera de los dos deja el E2E en rojo. Ninguna de las
dos piezas es decorativa, y ninguna se puede quitar «porque el test sigue verde» mirando un solo
navegador.

## ¿La re-sincronizacion de montaje es idempotente de verdad?

Verificado en el codigo y con una sonda propia en jsdom (creada, ejecutada y borrada; el arbol
quedo limpio). El efecto quedo asi: `if (!active) return; if (preference !== 'system') return;`
y despues `syncResolved()` una vez al enganchar, ademas del `addEventListener('change', …)`.
`syncResolved` compara `media.matches` contra **la clase que hay en el DOM** y solo llama a
`applyResolvedTheme` si difieren; el estado de React se actualiza con
`setResolved(prev => prev === next ? prev : next)`.

Mi sonda (3 casos, los tres en verde):

| Caso | Resultado observado |
| --- | --- |
| sistema oscuro y el DOM **sin** la clase (la carrera real) | al montar aplica: clase `dark` y `color-scheme: dark` |
| sistema oscuro y el DOM **ya** con la clase, `colorScheme` vacio | **no escribe nada**: `colorScheme` sigue vacio. Prueba directa de que `applyResolvedTheme` NO se llamo, o sea idempotencia real, no declarada |
| preferencia explicita `light` con el sistema en oscuro | no sincroniza: el efecto sale antes |

- **No reintroduce parpadeo**: en el caso normal (el script ya dejo el DOM bien) no hay ni una
  escritura al DOM ni un re-render; el `setResolved` funcional corta el ciclo.
- **Respeta el respaldo inerte**: el `if (!active) return` sigue siendo la primera linea del
  efecto, asi que el `ThemeToggle` con proveedor real no sincroniza por su cuenta.
- **Idempotente ante doble montaje** (StrictMode / re-suscripcion al volver a `system`): la
  segunda pasada no encuentra divergencia y no escribe.
- Reparo menor: compara **solo la clase**, no `style.colorScheme`. Si alguna vez los dos se
  desincronizaran entre si, el montaje no lo corregiria. Hoy no puede pasar (los escribe siempre
  la misma funcion), pero es la clase de detalle que envejece mal. Ver n3.

## ¿Sigue sin leer la cookie en ningun efecto?

**Si.** El diff no toca `readCookiePreference` ni anade ninguna lectura: la unica lectura de
`document.cookie` sigue estando en el inicializador de `useState` de `useFallbackThemeState`
—no en un `useEffect`— y `ThemeProvider` sigue recibiendo `initialPreference` por props desde el
servidor. La condicion de `design.md > 4` («el proveedor no lee la cookie en un `useEffect`, que
es como se reintroduce el parpadeo por la puerta de atras») se mantiene intacta.

## Las cuatro lineas rojas, otra vez

`git diff --stat c27ae84..ccffe10 -- components/ui package.json "app/(private)"` devuelve **vacio**.

- **R28** — `package.json` sin tocar (tampoco en esta ronda).
- **R21** — `components/ui/` sin tocar; la guardia de literales sigue verde.
- **R27** — `app/(private)/layout.tsx` no esta en el diff: sigue siendo Server Component.
- **R23** — el dashboard no esta en el diff; `dashboard-page.test.tsx` verde sin editar (corrido
  por mi en esta ronda).

## Estado de M1

**M1 queda CERRADO.** T12 esta ejecutada y en verde en los dos motores, `tasks.md` la marca `[x]`,
y R10, R11 y R17 pasan de «escritos» a **demostrados**, con mordidas que yo mismo reproduje. La
trazabilidad queda en **29 de 29 con evidencia ejecutada**. Siguen abiertas T18 y T20, que son del
leader y no de esta revision.

Ademas, el arreglo cerro un **fallo real de producto** que mi primera ronda no detecto y que solo
salio al ejecutar el E2E: un cambio de `prefers-color-scheme` entre el script inline y la
hidratacion se perdia para siempre. Vale la pena dejarlo escrito: mi primera ronda dio R17 por
«verificado» apoyandose en el test de jsdom, que dispara el evento `change` **despues** de que el
listener existe y por tanto nunca podia ver esa carrera. Es el mejor argumento posible a favor de
la regla 5 de `CLAUDE.md`: el nivel 4 no es ceremonia.

## Hallazgos nuevos de la segunda ronda

### Mayores

**Ninguno.** Ni el cambio del E2E ni el del proveedor introducen un bloqueante, y las dos
sospechas planteadas (test ablandado, re-sincronizacion no idempotente) quedan descartadas con
prueba propia, no con lectura.

### Menores

**n1 — La re-sincronizacion de montaje no tiene test unitario.** Es la parte del arreglo que era
codigo de produccion y que tapaba un bug real, y su unica red hoy es el E2E de webkit (mordida 2:
en chromium sigue verde sin ella). Eso ata un guardia de regresion a un detalle de temporizacion
de motor: el dia que WebKit programe los efectos pasivos un poco antes, o que React cambie ese
ritmo, la mordida deja de morder y nadie se entera. Es trivial de cubrir en jsdom —mi sonda son
tres `it` y corre en 5 segundos— y ahi si es determinista. Recomendado para `theme-provider.test
.tsx`: montar con `matchMedia` en oscuro y el DOM sin la clase (aplica), con el DOM ya correcto
(no escribe: `colorScheme` sigue vacio) y con preferencia explicita (no sincroniza).

**n2 — `hasContent` mide el parser, no lo pintado.** `readyState !== 'loading'` exime tambien
frames en los que el navegador ya pinto contenido en streaming. En esta app no abre agujero (el
script precede a todo el marcado, y React 19 lo iza al `<head>`) y la mordida demuestra que la
asercion sigue viva, pero el predicado correcto es «¿habia algo que ver?»
(`document.body?.childElementCount > 0` o un elemento conocido de `/login`), no el estado del
parser. Un renglon de cambio que devolveria al test el significado que su propio comentario dice
tener.

**n3 — `syncResolved` compara solo la clase, no `color-scheme`.** Si la clase y `style
.colorScheme` llegaran a divergir, el montaje no lo corregiria. Hoy es imposible porque siempre
los escribe `applyResolvedTheme` junta, pero el comentario del codigo dice «comparar contra la
clase actual del DOM» sin advertir que `color-scheme` queda fuera de la comparacion.

**n4 — Que mecanismo verifica R17 depende del motor, y eso no esta escrito en el test.**
`waitForHydration` espera la **fibra**, no que el efecto se haya suscrito. Consecuencia medida:
en chromium el escenario ejercita el listener y en webkit la re-sincronizacion de montaje. Es una
buena noticia por cobertura (entre los dos motores se prueban las dos piezas) pero es un reparto
accidental: nadie eligio que webkit probara una cosa y chromium otra, y puede voltearse con
cualquier actualizacion. Con n1 resuelto deja de importar; sin n1, es la unica red de una de las
dos piezas.

**n5 — El `<script>` ya no es el primer hijo de `<body>` en el DOM final.** React 19 lo iza al
`<head>` (dato medido por el implementer, anotado en la bitacora). El contrato sustantivo —correr
antes del marcado de la app— se sigue cumpliendo, e incluso mejor, y el test de nivel 1 sigue
siendo valido porque afirma sobre la **fuente**. Pero `design.md > 3.2` y `> 4` describen una
colocacion que ya no es la del documento servido, y quien lea el diseno mañana buscara el script
donde no esta. Corregir el diseno (una nota) es mas barato que el malentendido.

**n6 (actualiza el m8 de la primera ronda) — la rama esta ahora 24 commits por detras de
`origin/dev`,** no 3: entre medias se mergeo QC-24 (modulo `recetas`, migraciones nuevas,
`db/schema.prisma`, cambios en `docs/architecture.md`) y se acotaron tres aserciones de censo de
QC-19 en `tests/unit/identity/credential-policy-contract.test.ts`. Esto no es un defecto de QC-29,
pero **condiciona el gate**: T18 y T20 corridos sobre esta rama tal cual verifican una base que ya
no existe. Hay que integrar `origin/dev` **antes** de `./init.sh`, no despues, y esperar
conflictos en `feature_list.json` y `progress/current.md`.

**Los menores de la primera ronda:** m2 queda **cerrado** por la mordida 1 (el `<script>` emitido
esta ahora atado a su efecto de extremo a extremo). m1, m3, m5, m6, m7 y m9 siguen tal cual. m4
(el `resolved` hidratacion-insegura) sigue vigente y ahora importa un poco menos, porque el
montaje re-sincroniza el DOM; el valor de contexto, en cambio, sigue pudiendo diferir entre
servidor y cliente en el primer render.

## Veredicto de la segunda ronda

**OK — aprobado.** M1 cerrado; ningun bloqueante nuevo; el arreglo no ablando los tests (lo
demuestran las tres mordidas que reproduje) y corrigio un fallo real de producto. Los seis
menores nuevos son mejoras, no condiciones de merge, con una salvedad operativa que no es de la
feature sino del gate: **integrar `origin/dev` antes de correr T18 y T20** (n6).
