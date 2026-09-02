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
