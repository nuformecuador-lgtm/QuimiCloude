# Bitacora de implementacion — Feature 7 · `pantalla-de-login`

> Rama: `feature/7-pantalla-de-login` · Worktree: `.worktrees/7-pantalla-de-login/`
> Spec aprobado por el humano el 2026-08-06. Implementado el 2026-08-06.
> Estado: **tasks T1–T14 cerradas**. T15 (gate completo + PR) queda para el leader.

## 1. Alcance ejecutado

Maquetacion de `/login` con el contrato de autenticacion **congelado** para que la feature 10
sustituya `lib/services/login-stub.ts` sin tocar un solo archivo de UI. Sin DB, sin hash, sin
cookie (R19).

Tasks cerradas: T1, T2, T3, T3b, T4 (infra) · T5, T6, T7 (contrato) · T8, T9, T10 (UI) ·
T11, T12 (tests) · T13 (decision E2E) · T14 (este documento).

## 2. Archivos creados / modificados

### Contrato (backend_dev) — lo que la feature 10 NO vuelve a tocar

| Archivo | Estado | Que es |
| --- | --- | --- |
| `lib/types/auth.ts` | nuevo | `loginInputSchema`, `LoginInput`, `LoginFormState` (union discriminada), `LOGIN_INITIAL_STATE`, `GENERIC_CREDENTIALS_ERROR`, `REQUIRED_FIELD_ERROR`, `DASHBOARD_ROUTE`, `FORGOT_PASSWORD_ROUTE` |
| `lib/services/login-stub.ts` | nuevo | **Punto de costura**: `verifyCredentials()` devuelve siempre `{ ok: false }` (R18). Este es el archivo que borra la feature 10 |
| `lib/actions/login.ts` | nuevo | Server Action `loginAction(prevState, formData)`. `attemptId` por invocacion, `redirect(DASHBOARD_ROUTE)` fuera de todo `try/catch` |

### UI (frontend_dev)

| Archivo | Estado | Que es |
| --- | --- | --- |
| `app/(public)/layout.tsx` | nuevo | Layout publico; monta el `<Toaster />` con `richColors` y `duration: 8000` (design.md > 5.3: **no** en el root layout) |
| `app/(public)/login/page.tsx` | nuevo | Server Component: `Card` + marca QuimiCloude como `CardTitle` (R23) + `<LoginForm />` + enlace de recuperacion fuera del `<form>` (R22). Export de `metadata`. Importa desde el barrel `./components` |
| `app/(public)/login/components/index.ts` | nuevo | Barrel de la ruta: reexporta `LoginForm` y `SubmitButton`. **Sin `'use client'`** (la frontera se declara en cada componente) |
| `app/(public)/login/components/login-form.tsx` | nuevo | Cliente: `useActionState` + `<form action={formAction}>`, campos no controlados, errores de campo inline, efecto de toast con guarda de `attemptId` |
| `app/(public)/login/components/submit-button.tsx` | nuevo | Cliente: `useFormStatus()` -> `disabled` + `aria-busy` (R6, R7, R8). Archivo separado por necesidad tecnica del hook |

Estructura segun `docs/architecture.md > Componentes > Regla: componentes de ruta en
components/ con barrel index.ts` (decision humana 2026-08-06): los componentes propios de la
ruta viven bajo `components/` y se importan por el barrel. El `<Toaster />` del layout
publico es una primitiva de `components/ui/sonner`, asi que no se mueve.

### Primitivas shadcn/ui (generadas por el CLI, no escritas a mano)

`components.json`, `lib/utils.ts`, `components/ui/button.tsx`, `input.tsx`, `label.tsx`,
`card.tsx`, `sonner.tsx`.

### Infraestructura de tests

`vitest.config.ts`, `tests/setup.ts`, `tests/globals.d.ts`, `tests/unit/smoke.test.ts`,
`scripts/test-rapido.mjs`.

### Modificados

| Archivo | Cambio |
| --- | --- |
| `package.json` | scripts `test`, `test:rapido`, `test:guardias`; deps de shadcn, `sonner`, `zod` (produccion), devDeps de Vitest / Testing Library |
| `app/globals.css` | **reescrito por `shadcn init`** (ver seccion 5.4) |
| `pnpm-lock.yaml` | consecuencia de lo anterior |

### Tests

`tests/unit/login-action.test.ts` (9 tests), `tests/unit/login-form.test.tsx` (18 tests).

## 3. Mapa de trazabilidad `R<n> -> test`

Los 23 requisitos, sin huecos. Nombres literales de los tests que existen y pasan.

| Req | Test | Archivo |
| --- | --- | --- |
| R1 | `la pantalla de login se renderiza sin sesion` | `tests/unit/login-form.test.tsx` |
| R2 | `muestra campo de usuario, campo de contrasena enmascarado y boton dentro de un form` | `tests/unit/login-form.test.tsx` |
| R3 | `en estado inicial no muestra errores, no emite toast y los campos estan vacios` | `tests/unit/login-form.test.tsx` |
| R4 | `activar la etiqueta enfoca su campo` | `tests/unit/login-form.test.tsx` |
| R5 | `envia usuario y contrasena a la action al hacer submit` | `tests/unit/login-action.test.ts` |
| R6 | `deshabilita el boton mientras el envio esta en curso` | `tests/unit/login-form.test.tsx` |
| R7 | `marca aria-busy mientras el envio esta en curso` | `tests/unit/login-form.test.tsx` |
| R8 | `rehabilita el boton cuando el envio termina con error` | `tests/unit/login-form.test.tsx` |
| R9 | `devuelve error de campo obligatorio y no verifica credenciales si un campo esta vacio` | `tests/unit/login-action.test.ts` |
| R10 | `muestra el error de campo inline, marca aria-invalid y lo vincula con aria-describedby` | `tests/unit/login-form.test.tsx` |
| R11 | `emite un toast de error cuando las credenciales no son aceptadas` | `tests/unit/login-form.test.tsx` |
| R12 | `usa el mismo mensaje para usuario inexistente y para contrasena incorrecta` | `tests/unit/login-action.test.ts` |
| R13 | `conserva el usuario escrito tras un intento rechazado` (uno en cada archivo) | `login-action.test.ts` + `login-form.test.tsx` |
| R14 | `deja el campo de contrasena vacio tras un intento rechazado` | `tests/unit/login-form.test.tsx` |
| R15 | `el estado devuelto nunca contiene la contrasena` | `tests/unit/login-action.test.ts` |
| R16 | `el toast de error se anuncia por region live sin mover el foco` | `tests/unit/login-form.test.tsx` |
| R17 | `redirige a /dashboard cuando las credenciales son aceptadas y no emite toast` | `tests/unit/login-action.test.ts` |
| R18 | `rechaza todo intento valido mientras no hay verificacion real` | `tests/unit/login-action.test.ts` |
| R19 | `no accede a base de datos ni emite cookie` | `tests/unit/login-action.test.ts` |
| R20 | `envia el formulario al pulsar Enter dentro de un campo` | `tests/unit/login-form.test.tsx` |
| R21 | `no emite toast al montar` + `no reemite el toast en un re-render del mismo intento` + `emite un toast nuevo por cada intento rechazado, aunque la entrada sea identica` + `genera un attemptId distinto por invocacion` | `login-form.test.tsx` (3) + `login-action.test.ts` (1) |
| R22 | `muestra el enlace de recuperacion apuntando a FORGOT_PASSWORD_ROUTE y accesible por teclado` | `tests/unit/login-form.test.tsx` |
| R23 | `muestra la marca del producto como titulo de la tarjeta` | `tests/unit/login-form.test.tsx` |

Como se verifica lo dificil, para que el reviewer no tenga que confiar:

- **R19** no se afirma en prosa: el test lee el fuente de `lib/actions/login.ts` y
  `lib/services/login-stub.ts`, extrae los specifiers de los imports y comprueba que ninguno
  es `next/headers`, Prisma ni Supabase; ademas hace grep de `cookies(`, `Set-Cookie` y
  `prisma`.
- **R18** es el unico test que **no** mockea el stub (`vi.importActual`): ejercita el stub real.
- **R6 / R7 / R8** mantienen la promesa de la action **pendiente** a proposito; es la unica
  forma de observar el estado enviando sin `useState`.
- **R15** afirma sobre el `JSON.stringify` del estado completo, no sobre una propiedad suelta.
- **R16** monta el `<Toaster />` real (no mockeado) y afirma sobre el contenedor `[aria-live]`
  y sobre que `document.activeElement` **no** cambio.
- Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas. La unica copy
  literal en un assert es QuimiCloude, porque R23 nombra la marca como requisito.

## 4. Salida real de los tests

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida, 0 errores)

$ pnpm run lint
> eslint
(sin salida, 0 errores)

$ pnpm run build
✓ Compiled successfully
Route (app):  ○ /   ○ /_not-found   ○ /login

$ pnpm test   (vitest run)
 Test Files  3 passed (3)
      Tests  29 passed (29)
   Duration  10.88s
```

Detalle por test (`vitest run --reporter=verbose`):

```
 ✓ tests/unit/smoke.test.ts > runner de tests > arranca y ejecuta un test trivial 4ms
 ✓ tests/unit/smoke.test.ts > runner de tests > tiene el DOM de jsdom disponible 3ms
 ✓ tests/unit/login-action.test.ts > loginAction > envia usuario y contrasena a la action al hacer submit 16ms
 ✓ tests/unit/login-action.test.ts > loginAction > devuelve error de campo obligatorio y no verifica credenciales si un campo esta vacio 5ms
 ✓ tests/unit/login-action.test.ts > loginAction > usa el mismo mensaje para usuario inexistente y para contrasena incorrecta 3ms
 ✓ tests/unit/login-action.test.ts > loginAction > conserva el usuario escrito tras un intento rechazado 3ms
 ✓ tests/unit/login-action.test.ts > loginAction > el estado devuelto nunca contiene la contrasena 4ms
 ✓ tests/unit/login-action.test.ts > loginAction > redirige a /dashboard cuando las credenciales son aceptadas y no emite toast 3ms
 ✓ tests/unit/login-action.test.ts > loginAction > rechaza todo intento valido mientras no hay verificacion real 8ms
 ✓ tests/unit/login-action.test.ts > loginAction > no accede a base de datos ni emite cookie 4ms
 ✓ tests/unit/login-action.test.ts > loginAction > genera un attemptId distinto por invocacion 5ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > la pantalla de login se renderiza sin sesion 52ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > muestra campo de usuario, campo de contrasena enmascarado y boton dentro de un form 129ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > en estado inicial no muestra errores, no emite toast y los campos estan vacios 15ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > activar la etiqueta enfoca su campo 126ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > deshabilita el boton mientras el envio esta en curso 480ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > marca aria-busy mientras el envio esta en curso 471ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > rehabilita el boton cuando el envio termina con error 437ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > muestra el error de campo inline, marca aria-invalid y lo vincula con aria-describedby 66ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > emite un toast de error cuando las credenciales no son aceptadas 434ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > conserva el usuario escrito tras un intento rechazado 429ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > deja el campo de contrasena vacio tras un intento rechazado 421ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > el toast de error se anuncia por region live sin mover el foco 498ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > envia el formulario al pulsar Enter dentro de un campo 384ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > no emite toast al montar 3ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > no reemite el toast en un re-render del mismo intento 562ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > emite un toast nuevo por cada intento rechazado, aunque la entrada sea identica 728ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > muestra el enlace de recuperacion apuntando a FORGOT_PASSWORD_ROUTE y accesible por teclado 30ms
 ✓ tests/unit/login-form.test.tsx > pantalla de login > muestra la marca del producto como titulo de la tarjeta 5ms

 Test Files  3 passed (3)
      Tests  29 passed (29)
```

**`./init.sh` completo NO se ha corrido**: por instruccion del leader queda a su cargo, junto
con el PR (T15).

## 5. Hallazgos que el leader y el reviewer deben conocer

### 5.1 shadcn hoy trae **Base UI** por defecto, no Radix (desviacion respecto al design)

El CLI vigente es `shadcn@4.16.2` y su `init` pregunta dos cosas que el `design.md` no preveia:
*component library* (**Base UI (recomendada)** / React Aria / Radix UI) y *preset*
(Nova / Vega / Maia / ...). Se tomaron **los defaults**: Base UI + preset Nova
(`components.json > style: base-nova`, `baseColor: neutral`).
`docs/architecture.md > Stack` describe shadcn/ui como "(Radix UI base)"; eso ya no es el
default del CLI. No se resolvio por cuenta propia mas alla de tomar el default, y queda aqui
como punto a confirmar por el humano.

### 5.2 Toast vigente: `sonner` (respuesta al reporte obligatorio 1)

El registro vigente ofrece **dos** componentes de toast, y la premisa del `design.md > 5.3`
esta desactualizada en un matiz:

- **`sonner`** — wrapper sobre el paquete `sonner`. **Es el que se instalo** (`sonner@2.0.7`,
  `components/ui/sonner.tsx`), que es ademas el que el humano nombro explicitamente.
- **`toast`** — **ya NO es el legacy de Radix deprecado**: hoy es un componente nuevo sobre
  `@base-ui/react/toast` (`useToastManager`), plenamente vigente y documentado.

Es decir: `sonner` sigue siendo una opcion vigente y se uso, pero **no es la unica**, y la
frase del design sobre que el legacy esta deprecado ya no describe la realidad. Informativo,
no bloqueante.

### 5.3 `next-themes`: SI lo arrastraba; se implemento sin el (respuesta al reporte obligatorio 2)

El wrapper generado por `shadcn add sonner` importaba `useTheme` de `next-themes`, y el `add`
**instalo el paquete por su cuenta** (`next-themes ^0.4.6` en `dependencies`). Segun lo
instruido, no se acepto la dependencia: se desinstalo (`pnpm remove next-themes`) y se
simplifico el wrapper. Cambios exactos en `components/ui/sonner.tsx` — **unico archivo de
`components/ui/` tocado a mano en toda la feature**:

- eliminado el import de `useTheme` desde `next-themes`
- eliminada la linea que leia `const { theme = "system" } = useTheme()`
- eliminado del JSX el prop `theme={theme as ToasterProps["theme"]}`
- anadido un comentario de 3 lineas justificandolo, con referencia a `design.md > 9.5`

Todo lo demas del wrapper (iconos lucide, variables `--normal-bg` / `--popover`,
`toastOptions.classNames`, spread de props) queda tal cual lo genero el CLI. Sonner usa su
tema por defecto. **La pregunta abierta 5 del spec (modo oscuro) sigue abierta**: se dejaron
los tokens por defecto de shadcn, que es el default que el spec ya prescribia.

### 5.4 `shadcn init` reescribio `app/globals.css` (riesgo 1 del design, materializado)

Diff de **+132 / -25**: anade `@import "tw-animate-css"` y `@import "shadcn/tailwind.css"`,
`@custom-variant dark`, unos 45 tokens en `@theme inline` (color, sidebar, chart, radios),
bloques `:root` y `.dark` completos en `oklch`, y un `@layer base`. Elimina el `:root` viejo
(`#ffffff` / `#171717`), el `@media (prefers-color-scheme: dark)` manual y la regla
`body { font-family: Arial... }`.

`app/layout.tsx` y `app/page.tsx` **no fueron tocados** por el CLI, siguen compilando y `/` se
sigue prerenderizando como estatica. El cambio de look es el esperado (paleta ahora en tokens
shadcn), pero **hubo un defecto real del generador que si rompia el render**, corregido a mano:

> El init dejo `--font-sans: var(--font-sans)` dentro de `@theme inline`, una **referencia
> circular**. Verificado en el CSS compilado (`.next/static/**/*.css` contenia literalmente
> `--font-sans:var(--font-sans)`), lo que invalidaba `html { @apply font-sans }` y tiraba el
> documento entero al serif por defecto del navegador. Se reengancho a la fuente que el root
> layout ya carga: `--font-sans: var(--font-geist-sans)` (idem `--font-heading`). Reverificado
> tras rebuild limpio.

Nada mas se rompio visualmente. Aun asi, conviene una **revision visual humana de `/` y de
`/login`** antes del merge: un cambio de paleta completo no se valida con tests.

### 5.5 Bug de Windows en `test:rapido`, encontrado y arreglado

`scripts/test-rapido.mjs` invocaba vitest con `spawnSync(..., { shell: true })` y cmd.exe
partia la ruta `app/(public)/layout.tsx` por los parentesis (exit 255). Ahora invoca
`process.execPath` con el bin resuelto de vitest y **sin shell** (commit `9fdc370`). Habria
reventado el gate rapido en cuanto entrara la pagina de login.

### 5.6 Aviso cosmetico de Vite (no error)

Cada corrida de vitest imprime un aviso de sintaxis ESM en un archivo cargado como CommonJS
(`vitest.config.ts`). Se quita renombrando a `.mts` o poniendo `"type": "module"` en
`package.json`; no se hizo porque `tasks.md > T1` pide literalmente `vitest.config.ts` y ambas
salidas tienen mas alcance que esta feature. Queda como deuda menor.

### 5.7 Una constante de mas respecto al design (desviacion menor, deliberada)

`design.md > 4` no dice de donde sale el texto de `fieldErrors`. Los mensajes por defecto de
zod son ingles tecnico, y meter el literal espanol en la action habria obligado a los tests a
afirmar sobre copy. Se anadio **una constante exportada de mas** en `lib/types/auth.ts`:
`REQUIRED_FIELD_ERROR`. Es un **anadido** al contrato, no un cambio: la firma de `loginAction`,
la forma de `LoginFormState` y los nombres de campo son literalmente los del design. El test de
R9 no afirma sobre ella.

## 6. T13 — Decision sobre E2E: **opcion (b), diferir a la feature 10**

`tasks.md > T13` obligaba a elegir explicitamente. **Se elige (b): todo el E2E se difiere a la
feature 10 y se registra como deuda.** Razones:

1. El camino feliz no es ejercitable hoy: `/dashboard` no existe (S1, feature 9) y
   `/recuperar-contrasena` no existe ni la cubre ninguna feature del backlog (S6). Un E2E que
   siga cualquiera de los dos enlaces falla **por diseno**.
2. No hay autenticacion real: `verifyCredentials` devuelve siempre `{ ok: false }` (R18), asi
   que el unico flujo E2E posible seria el de fallo, que ya esta cubierto en unit con mas
   precision (incluido el `attemptId` de R21, que un E2E no puede observar de forma estable).
3. Montar Playwright es superficie de repo compartida (config, CI, scripts) que no estaba
   autorizada en esta tanda; hacerlo para cubrir lo que ya cubren 29 unit tests es coste sin
   informacion nueva.

**Consecuencia declarada, no silenciosa:** `docs/verification.md` pide E2E para features con
UI o flujo critico, y `CHECKPOINTS.md` lo pide para autenticacion. Aqui **no se cumple**, a
sabiendas, y la deuda se anota abajo. El reviewer debe leerlo como decision explicita y
justificada, no como omision.

## 7. Deudas registradas (para `progress/current.md > Deudas y cosas abiertas`)

1. **E2E de login diferido a la feature 10** (T13, opcion b). Al implementar la feature 10 hay
   que montar Playwright y cubrir el camino login -> dashboard.
2. **`/recuperar-contrasena` no existe** y **ninguna feature del backlog la cubre** (S6). El
   enlace de R22 da 404 hoy. Hay que dar de alta la feature que lo implemente y confirmar el
   slug definitivo (pregunta abierta 1). Vive en la constante `FORGOT_PASSWORD_ROUTE`:
   cambiarlo es editar una linea, y el test afirma contra la constante, no contra el literal.
3. **`/dashboard` no existe** hasta la feature 9 (S1). El `redirect` de R17 da 404 hoy.
4. **Riesgo de accesibilidad asumido**: el toast es transitorio y se autodescarta; quien no
   llegue a tiempo pierde el mensaje sin rastro, y no queda junto al formulario. Mitigado con
   `duration: 8000` y `richColors`, **no cerrado**. Es decision humana explicita del
   2026-08-06 (`design.md > 5.3`). La vuelta atras al `Alert` inline es barata: el estado ya
   lleva el mensaje, solo cambia el render.
5. **Divergencia con `feature_list.json` (id 7)**, que dice que el error se muestra junto al
   formulario. Con toast **no** queda junto al formulario. La decision humana del 2026-08-06
   prevalece; anotado para que no se lea como incumplimiento.
6. **shadcn con Base UI en vez de Radix** (5.1) y `--font-sans` circular del init (5.4).
7. `vitest.config.ts` con aviso cosmetico de CommonJS / ESM (5.6).
8. **Preguntas abiertas del spec sin cerrar por el humano**: se siguio el default escrito en el
   spec en las cinco (slug `/recuperar-contrasena`, errores de campo inline, E2E diferido, sin
   recordarme ni registrarme, modo oscuro con los tokens por defecto de shadcn). Ninguna se
   invento; ninguna bloqueo la implementacion.

## 8. Checklist de `CHECKPOINTS.md`: lo que aplica "no aplica" (declarado, no omitido)

- **Datos y seguridad** (RLS, migraciones, `down.sql`, repositorios Prisma): **no aplica**.
  Esta feature no toca datos (R19, `design.md > 7`). Verificado por el test de R19, no
  afirmado en prosa.
- **Patron Controller / Service / Repository**: aplica **parcialmente**. Hay controller (la
  Server Action `lib/actions/login.ts`) y un stub de servicio (`lib/services/login-stub.ts`);
  **no hay repositorio, por diseno**, porque no hay acceso a datos.
- **Permisos**: **no aplica**. `/login` es publica (R1); la guardia de sesion es la feature 10
  y la proteccion de rutas la feature 6.
- **E2E**: **no cumplido a sabiendas** (seccion 6), registrado como deuda 1.

## 9. Restricciones duras del humano — verificacion punto por punto

| Restriccion | Como se verifico |
| --- | --- |
| 1. Todo primitivo de UI viene de shadcn/ui | `Card` / `CardHeader` / `CardTitle` / `CardContent`, `Label`, `Input`, `Button`, `Toaster` importados de `@/components/ui/*`. Ningun primitivo escrito a mano |
| 2. `<form action>` + Server Action, `useActionState`, `useFormStatus`; prohibido `onSubmit` / `fetch` / `useState` | grep de esos tres tokens sobre `app/(public)/login/` -> **0 coincidencias**. Unico `useRef`: `lastToastedId` |
| 3. Error de credenciales por toast; errores de campo inline; `attemptId` para no duplicar el toast | Efecto de `login-form.tsx` copiado tal cual de `design.md > 5.3` con las tres guardas. Cubierto por los 3 tests de R21 y el de R11; los de campo, por R10 |
| 4. Maquetacion: sin DB, sin hash, sin cookie | Test de R19 (analisis de imports + grep de `cookies(` / `Set-Cookie` / `prisma`) y `verifyCredentials` aislado en su propio modulo |
| Contrato congelado para la feature 10 | `loginAction(prevState: LoginFormState, formData: FormData): Promise<LoginFormState>` literal; el exito sale por `redirect`, no por estado; la feature 10 solo sustituye `lib/services/login-stub.ts` |

## 10. Commits de la rama (15, uno por task logica)

```
ce0673f test(7-pantalla-de-login): tests de UI del login (T12)
9c75cc1 feat(7-pantalla-de-login): pagina /login con Card, marca y enlace de recuperacion (T10)
46d569e feat(7-pantalla-de-login): formulario de login con useActionState y toast por attemptId (T9)
9aae70f feat(7-pantalla-de-login): boton de envio con useFormStatus (T8)
81f5a32 test(7-pantalla-de-login): tests unitarios de loginAction (R5, R9, R12, R13, R15, R17, R18, R19, R21)
5c66bb3 feat(7-pantalla-de-login): Server Action loginAction con contrato congelado
253337a feat(7-pantalla-de-login): stub de verificacion de credenciales (punto de costura de la feature 10)
b507dcf feat(7-pantalla-de-login): contrato de datos del login (schema zod, LoginFormState y constantes)
9fdc370 fix(7-pantalla-de-login): invocar vitest sin shell en test:rapido (rutas con parentesis en Windows)
c9a0fe5 chore(7-pantalla-de-login): anadir zod como dependencia de produccion
47bb863 chore(7-pantalla-de-login): anadir sonner y montar el Toaster en el layout publico
32e15bf chore(7-pantalla-de-login): anadir primitivas button, input, label y card de shadcn/ui
7cd29a1 chore(7-pantalla-de-login): inicializar shadcn/ui (components.json, lib/utils, tokens de globals.css)
7743b2f chore(7-pantalla-de-login): montar Vitest + Testing Library y los scripts test/test:rapido
3f5f64c chore(7-pantalla-de-login): copiar spec aprobado al worktree
```

## 11. Pendiente (T15, a cargo del leader)

- `./init.sh` completo, sin flags, en el worktree.
- Revision visual humana de `/` y `/login` tras la reescritura de `app/globals.css` (5.4).
- Abrir el PR contra `dev` con titulo `feat(7-pantalla-de-login): ...`.
- Decidir sobre 5.1 (Base UI vs Radix) y sobre las deudas 1, 2 y 6.

## 12. Bugfix posterior: aviso de `FieldControl` no controlado (2026-08-06)

**Warning.** En el navegador, al usar `/login`:
`Base UI: A component is changing the default value state of an uncontrolled FieldControl
after being initialized. To suppress this warning opt to use a controlled FieldControl.`

**Causa.** `components/ui/input.tsx` envuelve el `Input` de Base UI, que resuelve a
`Field.Control` y usa `useControlled` de `@base-ui/utils`. Ese hook guarda el `defaultValue`
del primer render en un `useRef` y avisa por `console.error` si el `defaultValue` recibido
despues difiere. En `login-form.tsx` el campo de usuario es no controlado con
`defaultValue={username}`, y `username` vale `''` en `idle` y pasa a lo escrito tras un
intento fallido: el `defaultValue` cambia despues del montaje. No era un descuido, es la
solucion de `design.md > 5.3` para R13/R14.

**Arreglo.** `key` en el `<Input>` de usuario, derivada del propio `username`
(`const usernameFieldKey = username`). Al cambiar el valor, React remonta el input, asi que
cada instancia ve un unico `defaultValue` durante toda su vida: es un valor inicial, no una
mutacion. El campo sigue **no controlado**, sin `useState` (la alternativa B de
`design.md > 8` sigue descartada) y R13/R14 no cambian de comportamiento.

Se descarto derivar la clave del `attemptId` (que tambien silencia el aviso) porque cambia en
**cada** intento fallido y remontaria tambien cuando el usuario reintenta con el mismo nombre,
que es el caso comun. Cuantos menos remontajes, menos foco perdido. El campo de contrasena no
lleva clave: sin `defaultValue` no dispara el aviso, y remontarlo robaria el foco al enviar
con Enter desde ese campo.

**Efecto sobre el foco** (medido, no supuesto):

| Como se envia | Antes | Despues |
| --- | --- | --- |
| Clic en el boton | boton de envio | boton de envio |
| Enter desde contrasena | campo contrasena | campo contrasena |
| Enter desde usuario, **primer** fallo | campo usuario | `<body>` |
| Enter desde usuario, reintento con el mismo usuario | campo usuario | campo usuario |

Queda **una** regresion de foco: el primer fallo enviado con Enter desde el campo de usuario
pierde el foco al `<body>`, porque es justo la transicion en la que el `defaultValue` cambia
y el remontaje es inevitable. Los reintentos posteriores con el mismo usuario ya no remontan y
conservan el foco. No se anade restauracion imperativa de foco: exigiria envolver la action o
un `onSubmit` propio, que `design.md > 5.2` prohibe. **Queda abierto para decision humana.**

**Test de regresion.** `tests/ui/login-form-uncontrolled-warning.test.tsx` (archivo propio a
proposito: el helper `error()` de `@base-ui/utils` deduplica los avisos en un `Set` de modulo,
asi que dentro de un mismo archivo solo el primer test que lo dispare puede observarlo; Vitest
aisla el registro de modulos por archivo). Verificado que el test falla quitando la `key` y
pasa con ella. Ningun test existente cambio.

**Archivos tocados.** `app/(public)/login/components/login-form.tsx`,
`tests/ui/login-form-uncontrolled-warning.test.tsx`, este archivo.
