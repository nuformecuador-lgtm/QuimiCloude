# Review — Feature 7 · `pantalla-de-login`

> Reviewer. Rama `feature/7-pantalla-de-login`, worktree `.worktrees/7-pantalla-de-login/`.
> Fecha: 2026-08-06. No se edito codigo: esto es un veredicto.
>
> **Veredicto: APROBADO (OK).** Cero hallazgos bloqueantes. 6 menores, ninguno cierra el paso
> a `done`; dos de ellos son tareas del leader (T15) mas que del implementer.

## 1. Que se corrio (verificado por mi, no leido de la bitacora)

| Comando | Resultado |
| --- | --- |
| `pnpm test` (`vitest run`) | **29 passed / 3 files**, verde. Coincide con la bitacora |
| `pnpm run typecheck` | verde, sin salida |
| `pnpm run lint` | verde, sin salida |
| `pnpm run build` | verde. `/login` prerenderizada estatica |
| grep de `--font-sans` en el CSS compilado | `--font-sans:var(--font-geist-sans)`: la referencia circular esta **corregida de verdad**, no solo en el fuente |
| `git status --short` | limpio |

`./init.sh` completo no lo corro yo: queda a cargo del leader (T15), en paralelo. Los tres
pasos que ese script ejecuta sobre codigo (typecheck, lint, test) los he corrido y estan
verdes; el resto son guardias de repo que no dependen de esta feature.

## 2. Checklist de CHECKPOINTS.md

### Especificacion
- [x] `specs/7-pantalla-de-login/requirements.md` con EARS numerados R1-R23, sin saltos.
- [x] `design.md` con alternativas descartadas y su porque (A-I, nueve).
- [x] `tasks.md` con **todas** las tasks marcadas `[x]`: T1, T2, T3, T3b, T4, T5, T6, T7, T8,
      T9, T10, T11, T12, T13, T14. T15 (gate completo + PR) esta sin marcar y es correcto:
      es del leader, no del implementer.

### Trazabilidad
- [x] Cada `R<n>` mapea a al menos un test concreto. **Verificado abriendo los tests, uno a
      uno** (seccion 3), no confiando en la tabla de la bitacora.
- [x] `progress/impl_7-pantalla-de-login.md` contiene el mapa `R<n> -> test` y la salida real.

### Calidad de codigo
- [x] `pnpm run typecheck` verde (TS strict).
- [x] `pnpm run lint` verde.
- [x] `pnpm test` verde (29/29).
- [~] E2E de flujo critico (autenticacion): **no existe**, diferido a la feature 10 por T13
      opcion (b), declarado en `impl > 6` y registrado como deuda. El humano lo dio como
      **default aprobado con el spec** (pregunta abierta 3), asi que **no lo cuento como
      defecto**. Queda como condicion de la feature 10: aqui no hay autenticacion real que un
      E2E pueda ejercitar (`verifyCredentials` siempre `{ ok: false }`) y ni `/dashboard` ni
      `/recuperar-contrasena` existen.

### Datos y seguridad (Supabase) - NO APLICA, declarado, no omitido
Punto por punto, para que no quede como hueco:
- Validacion de permisos en el service: **no aplica**. No hay permisos: `/login` es publica
  (R1) y la guardia de sesion es la feature 10.
- RLS + FORCE ROW LEVEL SECURITY en tablas nuevas: **no aplica**. Cero tablas nuevas.
- Acceso a datos solo por repositorio Prisma: **no aplica**. Cero acceso a datos; no hay
  `lib/repositories/`, y es correcto que no lo haya.
- Migraciones versionadas con `down.sql`: **no aplica**. Cero migraciones; no existe
  `db/migrations/`.
- Secretos hardcodeados: **ninguno**. Revisado todo el diff. Lo unico "de entorno" son dos
  rutas (`/dashboard`, `/recuperar-contrasena`) y viven en constantes exportadas.
- Webhooks con firma e idempotencia: **no aplica**. Cero route handlers, cero webhooks.

Y lo verifique, no lo asumi: el test `no accede a base de datos ni emite cookie` lee el
fuente de `lib/actions/login.ts` y `lib/services/login-stub.ts`, extrae los especificadores
de import y comprueba que ninguno es `next/headers`, Prisma ni Supabase, ademas de grepear
`cookies(`, `Set-Cookie` y `prisma`. Confirmado a mano: cero hashing, cero cookie, cero
Prisma, cero Supabase, cero red en toda la rama.

### Patron de capas
- [x] Controller sin queries ni logica de negocio: `lib/actions/login.ts` parsea, delega en
      `verifyCredentials` y decide estado/redirect. Nada mas.
- [x] Service sin HTTP: `lib/services/login-stub.ts` no importa nada de `next/*`.
- [~] Repository: **no hay, por diseno** (no hay datos). Declarado en tasks y bitacora.
- [~] `lib/interfaces/`: no existe. Con un unico stub sin doble implementacion, una interfaz
      ceremonial no aporta; la costura ya esta en el limite de modulo. No es defecto (ver M5).

### Permisos - NO APLICA
`/login` es publica por requisito (R1). Sin `middleware.ts` (es la feature 6), sin
`cookies()`, sin componentes `private/`. Correcto.
- [x] Mutaciones internas por Server Action, no fetch a API routes. Verificado por grep:
      **cero** ocurrencias de `fetch(` en `app/`.

### Configuracion
- [x] Nada que cambie entre entornos quedo hardcodeado. `DASHBOARD_ROUTE` y
      `FORGOT_PASSWORD_ROUTE` son constantes exportadas; el test de R22 afirma contra la
      constante, no contra el literal, asi que cambiar el slug es una linea.

### Verificacion final
- [x] typecheck / lint / test / build verdes (corridos por mi).
- [ ] `./init.sh` completo: pendiente del leader (T15).
- [x] `progress/review_7-pantalla-de-login.md`: este archivo, veredicto OK.
- [ ] Entrada en `progress/history.md` y desmontaje del worktree: cierre del leader.

## 3. Trazabilidad R1-R23, verificada test a test

No me fie del mapa de la bitacora: abri los 27 tests de la feature y comprobe que cada uno
afirma lo que su requisito dice. Ninguno esta vacio, ninguno se mockea a si mismo, ninguno
es de adorno.

| Req | Test | Que afirma de verdad | Veredicto |
| --- | --- | --- | --- |
| R1 | `la pantalla de login se renderiza sin sesion` | Renderiza `LoginPage` sin proveedor de sesion y encuentra form y boton | OK (con matiz M1) |
| R2 | `muestra campo de usuario, campo de contrasena enmascarado y boton dentro de un form` | `tagName === 'FORM'`, ambos campos **dentro** del form via `within`, `name` correcto, `type="password"`, nombre accesible en los dos, rol button | OK |
| R3 | `en estado inicial no muestra errores, no emite toast y los campos estan vacios` | Ambos values vacios, cero mensajes de campo, **cero `aria-invalid`**, y `toast.error` no llamado | OK |
| R4 | `activar la etiqueta enfoca su campo` | Busca `label[for=<input.id>]` (asociacion programatica real), hace click y comprueba el foco en los dos campos | OK: verifica el htmlFor/id, no una promesa |
| R5 | `envia usuario y contrasena a la action al hacer submit` | `verifyCredentials` recibe exactamente lo escrito, con la contrasena **sin recortar** | OK (matiz M2) |
| R6 | `deshabilita el boton mientras el envio esta en curso` | Deja la promesa de la action **pendiente** y comprueba `toBeDisabled` en ese instante | OK: el estado enviando se observa de verdad |
| R7 | `marca aria-busy mientras el envio esta en curso` | `aria-busy` pasa de false a true con la action colgada | OK |
| R8 | `rehabilita el boton cuando el envio termina con error` | Resuelve la promesa y espera `toBeEnabled` mas `aria-busy=false` | OK |
| R9 | `devuelve error de campo obligatorio y no verifica credenciales si un campo esta vacio` | Tres casos (solo usuario en blanco con espacios, solo contrasena, ambos), errores por campo **correctos y no cruzados**, `verifyCredentials` NO llamado y `redirect` NO llamado | OK: cubre las tres ramas del SI de R9 |
| R10 | `muestra el error de campo inline, marca aria-invalid y lo vincula con aria-describedby` | `aria-invalid="true"` en ambos, `aria-describedby` igual al id real del parrafo, el mensaje **contenido en el form** (inline), y `toast.error` NO llamado | OK: verifica ademas la separacion inline vs toast |
| R11 | `emite un toast de error cuando las credenciales no son aceptadas` | `toast.error` llamado **1 vez** con `GENERIC_CREDENTIALS_ERROR`, y el generico **no** aparece inline | OK |
| R12 | `usa el mismo mensaje para usuario inexistente y para contrasena incorrecta` | Dos intentos distintos, mismo message, igual a la constante | OK (ver seccion 4) |
| R13 | `conserva el usuario escrito...` (x2, action y form) | Action: username presente en los estados error **e** invalid. Form: el input vuelve a tener el usuario tras el rechazo | OK: las dos mitades |
| R14 | `deja el campo de contrasena vacio tras un intento rechazado` | Tras el rechazo espera a que el usuario se rehidrate y **entonces** afirma password vacio (evita el falso verde de afirmar antes del re-render) | OK |
| R15 | `el estado devuelto nunca contiene la contrasena` | El `JSON.stringify` del estado completo no contiene el secreto ni la clave password, en los dos estados de fallo | OK: no una propiedad suelta |
| R16 | `el toast de error se anuncia por region live sin mover el foco` | Monta el `<Toaster />` **real**, busca el texto, sube al `closest('[aria-live]')` y comprueba que `document.activeElement` **no cambio** | OK: no mockea lo que dice verificar |
| R17 | `redirige a /dashboard cuando las credenciales son aceptadas y no emite toast` | `redirect` llamado 1 vez con `DASHBOARD_ROUTE` y retorno undefined (no hay estado del que derivar un toast) | OK |
| R18 | `rechaza todo intento valido mientras no hay verificacion real` | Unico test que usa `vi.importActual`: ejercita el **stub real**, no el mock | OK |
| R19 | `no accede a base de datos ni emite cookie` | Analisis de imports mas grep sobre el fuente de los dos modulos | OK: es la unica forma honesta de testear una ausencia |
| R20 | `envia el formulario al pulsar Enter dentro de un campo` | Enter dentro del campo de contrasena dispara la action y el FormData lleva username y password | OK: prueba que es un form HTML real, no un click handler |
| R21 | `no emite toast al montar` mas `no reemite el toast en un re-render del mismo intento` mas `emite un toast nuevo por cada intento rechazado, aunque la entrada sea identica` mas `genera un attemptId distinto por invocacion` | Ver seccion 5 | OK (con menor M3) |
| R22 | `muestra el enlace de recuperacion apuntando a FORGOT_PASSWORD_ROUTE y accesible por teclado` | Rol link, href igual a la constante, nombre accesible, **fuera** del form, y llega el foco tabulando desde el boton de envio | OK |
| R23 | `muestra la marca del producto como titulo de la tarjeta` | El `[data-slot="card-title"]` contiene QuimiCloude | OK: unica copy literal en un assert, y es legitima porque R23 nombra la marca |

**23 de 23 con test real. Cero huerfanos.**

## 4. Restricciones duras del humano

### 4.1 shadcn/ui para todo primitivo - CUMPLE
`Card`/`CardHeader`/`CardTitle`/`CardContent`, `Label`, `Input`, `Button`, `Toaster` salen
todos de `@/components/ui/*`, generados por el CLI. Ningun primitivo escrito a mano. Lo unico
propio son un parrafo de error de campo y un `Link` de `next/link`: ninguno de los dos es un
primitivo que shadcn ofrezca. El **unico** archivo de `components/ui/` editado a mano es
`sonner.tsx`, y solo para quitar `next-themes` (ver 4.5 y M4).

### 4.2 form action + Server Action, useActionState, useFormStatus - CUMPLE
Grep sobre `app/`: **cero** ocurrencias de `useState`, `onSubmit` y `fetch(`. Verificado por
mi, no leido de la bitacora.
- `login-form.tsx`: `useActionState(loginAction, LOGIN_INITIAL_STATE)` mas
  `<form action={formAction}>`.
- `submit-button.tsx`: archivo separado **por necesidad tecnica** (`useFormStatus` solo lee el
  form ancestro; en el mismo componente devolveria siempre false). El hook es la unica fuente
  del pending: sin props, sin estado.
- El unico `useRef` es `lastToastedId`, que no guarda pending ni resultado: memoriza que
  intento ya se notifico. No viola la restriccion.
- Campos **no controlados** con `defaultValue` solo en usuario: la rehidratacion sale del
  reset de form action de React 19, con cero estado local.

### 4.3 Toast para el generico, inline para los de campo - CUMPLE
El generico sale **solo** por `toast.error` en el efecto; no se pinta en ningun sitio del
marcado. Los de campo salen **solo** inline, en un parrafo bajo su input, y el test de R10
comprueba explicitamente que en ese caso `toast.error` **no** se llama. Los dos canales no se
solapan ni se duplican.

### 4.4 Mensaje generico que no revela que fallo - CUMPLE, y verificado en las tres capas
No solo en la copy:
- **Stub** (`lib/services/login-stub.ts`): la firma es `Promise<{ ok: boolean }>`. No hay
  campo reason, ni code, ni field. **El stub es incapaz de decir cual de los dos fallo**, asi
  que la fuga no puede ni originarse.
- **Tipos** (`lib/types/auth.ts`): el miembro error de la union es
  `{ status; attemptId; username; message }`. `message` es un unico string y no hay ningun
  campo que discrimine la causa. **Ningun miembro de la union tiene password** (R15: la
  garantia es el tipo, comprobada visualmente como pedia T5).
- **Action**: una sola rama de fallo de credenciales, con una sola constante
  `GENERIC_CREDENTIALS_ERROR`. No es que el mensaje coincida por copy: es que **solo existe uno**.

### 4.5 Es maquetacion - CUMPLE
Cero DB, cero hashing, cero cookie, cero Prisma, cero Supabase, cero red. Ver seccion 2
(Datos y seguridad) y el test de R19.

## 5. El attemptId, el punto que el spec marco como fragil

Lo mire con lupa porque es donde el spec avisaba.

**Diseno correcto y bien implementado.** Las tres guardas del efecto estan tal cual el
`design.md > 5.3`:
1. `state.status !== 'error'`: nunca dispara con idle (montaje) ni con invalid.
2. `lastToastedId.current === state.attemptId`: no reemite el mismo intento.
3. attemptId nuevo por invocacion (`crypto.randomUUID()` en la action): dos fallos
   consecutivos con la **misma** entrada si emiten dos toasts.

**No se dispara al montar, y esta garantizado por el tipo, no por una comprobacion en
runtime**: `LOGIN_INITIAL_STATE` es `{ status: 'idle' }` y el miembro idle **no tiene
attemptId**, asi que la primera guarda no puede fallar por descuido. El test
`no emite toast al montar` lo confirma, y ese test si distingue: sin la guarda de status, el
efecto llamaria a `toast.error(undefined)` y el spy lo pillaria. El test de la action remata
con `expect(LOGIN_INITIAL_STATE).not.toHaveProperty('attemptId')`.

**No hay doble emision.** El test de R11 afirma `toHaveBeenCalledTimes(1)`: exactamente uno
por intento, ni cero ni dos.

Ver menor M3 por el unico matiz de cobertura.

## 6. La costura con la feature 10

**Contrato congelado y respetado al pie de la letra**, contrastado contra `design.md > 3`:

| Elemento del contrato | En el codigo |
| --- | --- |
| Nombre y ruta | `loginAction` en `lib/actions/login.ts`: exacto |
| Firma | `(prevState: LoginFormState, formData: FormData) => Promise<LoginFormState>`: literal |
| Estado inicial | `LOGIN_INITIAL_STATE` exportado |
| Nombres de campo | `username` / `password`, en el schema, en el lector de FormData, en el marcado y en los tests |
| Forma del estado | Union discriminada por status con attemptId en los dos fallos y no en idle: exacta |
| Exito | Sale por `redirect(DASHBOARD_ROUTE)`, no por estado. No existe `status: 'success'` |

**Ninguna logica de autenticacion se filtro a la UI ni a la action.** Lo verifique por
imports: `login-form.tsx` importa `loginAction` y `LOGIN_INITIAL_STATE` y nada mas del
dominio; **ningun archivo de `app/` importa `lib/services/login-stub`**. La action no sabe
como se verifica una credencial: llama a `verifyCredentials(parsed.data)` y ramifica sobre
`ok`. Todo el "siempre falla" vive en las 4 lineas del stub.

`redirect(DASHBOARD_ROUTE)` esta **fuera de todo try/catch**, como exigia el diseno: la
excepcion de control NEXT_REDIRECT no se traga en silencio.

**Matiz honesto, y no es un incumplimiento de esta feature:** el propio `design.md > 3` ya
dice que la feature 10 tocara dos cosas, no una: el cuerpo de `verifyCredentials` **y** la
emision de la cookie de sesion dentro de la action, antes del redirect. Eso estaba escrito y
aprobado en el spec. Lo que si se cumple estrictamente es lo que el humano pidio: **cero
archivos de UI tocados por la feature 10**. Ver M5 por el detalle de la firma del stub.

## 7. Rehidratacion, accesibilidad e higiene

**Rehidratacion (R13/R14): correcta.** El input de usuario lleva `defaultValue={username}`
derivado del estado; el de contrasena **no lleva defaultValue**. El reset de form action de
React 19 limpia ambos y el re-render repone solo el usuario. Cero useState. Los dos tests lo
confirman en el DOM, no en el estado.

**Accesibilidad: bien, y el hueco esta documentado y acotado.**
- `Label htmlFor="username"` con `Input id="username"`, idem contrasena. Verificado en el
  codigo y por el test de R4, que hace click en el label y comprueba el foco.
- `aria-invalid` y `aria-describedby` **condicionales**: se ponen solo cuando hay error
  (undefined si no), que es lo correcto; un aria-invalid="false" permanente es ruido. El
  aria-describedby apunta al id real del parrafo, comprobado por el test.
- `autoComplete="username"` y `autoComplete="current-password"` presentes.
- Region live: el `<Toaster />` de sonner monta contenedor con `aria-live`, y el test de R16
  lo verifica **con el Toaster real**, incluido que el foco no se mueve.
- **El hueco esta registrado como decision, no como defecto**: `design.md > 5.3` lo dice con
  todas las letras (el toast se autodescarta y no queda junto al formulario), lo mitiga con
  `duration: 8000` (el diseno pedia 6 s o mas) y `richColors`, declara que **no lo cierra**,
  lo atribuye a la decision humana del 2026-08-06, anota la divergencia con el literal de
  `feature_list.json` ("junto al formulario") y deja escrito que la vuelta atras es barata.
  La bitacora lo repite como deuda 4. **Cumplido: documentado y acotado.** No lo trato como
  defecto nuevo.

**Higiene del cambio: limpia.**
- `app/globals.css`: la referencia circular **esta corregida de verdad**. No me quede en el
  fuente: compile y el CSS emitido dice `--font-sans:var(--font-geist-sans)`, que es la
  variable que `app/layout.tsx` carga con next/font. Sin restos autorreferenciales.
  `--font-mono` y `--font-heading` enganchados igual.
- **next-themes no dejo rastro**: grep en todo el repo (sin node_modules) devuelve **solo
  comentarios y documentacion** (`components/ui/sonner.tsx`, la bitacora y el spec). **No
  esta en `package.json`**, ni en dependencies ni en devDependencies, **ni en
  `pnpm-lock.yaml`**, y **no hay ningun import**. El `pnpm remove` limpio bien.
- **Nada fuera de alcance**: el diff son 28 archivos, todos justificables por una task
  (`app/(public)/**`, `lib/**`, `components/**` generados, infra de tests, spec y bitacora,
  `package.json` mas lock, `globals.css`). `app/layout.tsx` y `app/page.tsx` **no fueron
  tocados**. Arbol de trabajo limpio, sin archivos sueltos.
- Commits: 15, uno por task logica, con el formato de `docs/conventions.md`.

## 8. Hallazgos

### Mayores (bloqueantes)

**Ninguno.**

### Menores

**M1 - El test de R1 no prueba la ruta, solo el componente.**
`la pantalla de login se renderiza sin sesion` renderiza `LoginPage` directamente; que la URL
sea `/login` lo garantiza la ubicacion del archivo (`app/(public)/login/page.tsx`), no un
assert. Lo compense corriendo `pnpm run build`, que lista `/login` como ruta prerenderizada,
asi que R1 **esta verificado**, pero por el build y no por el test. Y "sin requerir sesion
previa" no es testeable hoy porque no existe el concepto de sesion. Se cerrara cuando el E2E
de la feature 10 visite la URL.

**M2 - El test de R5 vive en la capa de la action, no en la del submit.**
Su nombre dice "al hacer submit" pero lo que ejercita es `loginAction` invocada directamente.
El tramo submit -> FormData con los dos campos si esta cubierto, pero por el test de **R20**.
Entre los dos, R5 queda cubierto de punta a punta; es un problema de nombre, no de cobertura.
Sugerencia: renombrarlo a algo como "pasa usuario y contrasena tal cual a la verificacion de
credenciales".

**M3 - Uno de los tres tests de R21 no aisla la guarda del attemptId.**
`no reemite el toast en un re-render del mismo intento` pasaria **igual sin el useRef**,
porque el efecto ya depende de `[state]` y `useActionState` devuelve el **mismo objeto** entre
re-renders: React no reejecutaria el efecto de todas formas. El test verifica el
comportamiento observable que R21 exige (por eso **no es bloqueante** y R21 queda cubierto),
pero no distingue la implementacion con guarda de la implementacion sin ella. Los escenarios
donde el useRef si es la unica defensa (doble ejecucion de efectos en StrictMode, o un estado
recreado con el mismo contenido) no tienen test. Un test que cerraria el hueco: devolver **dos
veces el mismo attemptId** desde la action mockeada y afirmar `toHaveBeenCalledTimes(1)`.
Barato de anadir; queda como sugerencia, no como condicion.

**M4 - components/ui/sonner.tsx se edito a mano, contra lo que decia T3.**
T3 dice "ningun archivo de components/ui/ se edita a mano en esta feature". Se edito uno para
quitar next-themes. Y sin embargo **la edicion es la correcta**: la alternativa era aceptar
una dependencia que el CLI instalo por su cuenta y que ni el spec ni el humano aprobaron, y
`tasks.md > T3b` mandaba explicitamente no decidirlo solo. El implementer lo reporto (bitacora
5.3) con el diff exacto: tres lineas fuera y un comentario dentro, el resto intacto. Lo
registro por trazabilidad, no como reproche: es una desviacion **declarada y bien resuelta**.
Consecuencia viva: el Toaster usa el tema por defecto de sonner, que es justo el default que
la pregunta abierta 5 dejaba aprobado.

**M5 - La firma del stub probablemente se quede corta para la feature 10.**
`verifyCredentials(input): Promise<{ ok: boolean }>` no devuelve identidad. La feature 10
necesitara al menos un id de usuario para emitir la cookie de sesion, asi que tendra que
**ensanchar** el tipo de retorno (por ejemplo `{ ok: true; userId }`). Es una ampliacion, no
una ruptura, y no afecta a la UI (ningun archivo de `app/` importa el stub), pero conviene
saberlo ahora y no descubrirlo como sorpresa. No es defecto de esta feature: aqui devolver
identidad seria inventar.

**M6 - Deudas anotadas en la bitacora pero aun no volcadas a progress/current.md.**
T13 opcion (b) pedia registrar el E2E diferido en `progress/current.md > Deudas y cosas
abiertas`; en el worktree esa seccion sigue vacia. Las ocho deudas estan completas y bien
escritas en `impl_7-pantalla-de-login.md > 7`, listas para copiar. **Es tarea del leader**
(mantiene current.md), asi que no la cargo contra el implementer. Ojo tambien a la deuda 2,
que pide dar de alta una feature para `/recuperar-contrasena`: hoy ese enlace da 404 y
**ninguna feature del backlog lo cubre**.

### Puntos que NO reporto como defecto (defaults aprobados con el spec)
Verificados uno a uno: la implementacion **no se desvio** de ninguno.
- Slug `/recuperar-contrasena` (404 hoy): implementado como `FORGOT_PASSWORD_ROUTE`, tal cual S6.
- Errores de campo inline: implementados inline (R10), no movidos a toast.
- E2E del camino feliz diferido a la feature 10: elegido explicitamente (T13 opcion b) y justificado.
- Sin "recordarme" ni "registrarme": no aparecen. Correcto.
- Modo oscuro con tokens por defecto: bloque `.dark` de shadcn en `globals.css`, sin
  next-themes, sin cambiador de tema. Correcto.
- Error por toast en vez de "junto al formulario" (`feature_list.json` id 7): decision humana
  del 2026-08-06, anotada en el diseno y en la bitacora.

### Punto informativo que el leader debe decidir (no es hallazgo)
`shadcn@4.16.2` trae **Base UI** como default en vez de Radix, y `docs/architecture.md > Stack`
todavia dice "shadcn/ui (Radix UI base)". El implementer tomo el default y lo reporto
(bitacora 5.1). La restriccion del humano, todo primitivo de shadcn/ui, se cumple igual. Hay
que decidir si se acepta Base UI y se actualiza `docs/architecture.md`, o se rehace con Radix.
Tambien queda pendiente la **revision visual humana de `/` y `/login`**: un cambio de paleta
completo no lo valida ningun test.

## 9. Veredicto

**OK - APROBADO.**

Los 23 requisitos tienen test y los tests verifican lo que dicen verificar. Las cuatro
restricciones duras del humano se cumplen, incluida la del mensaje generico comprobada en
stub, tipos y action. El attemptId hace su trabajo y no dispara al montar. La costura con la
feature 10 esta congelada y limpia. Es maquetacion de verdad: cero datos, cero cookie, cero
hashing. La higiene del cambio esta bien: la variable de fuente arreglada y verificada en el
CSS compilado, y next-themes sin rastro en package.json, lockfile ni imports.

Nada de lo anterior vuelve al implementer. Los seis menores son sugerencias (M1, M2, M3, M5),
una desviacion ya declarada y bien resuelta (M4) y una tarea del leader (M6).

Pendiente para cerrar a done, todo del leader: `./init.sh` completo en verde, volcar las
deudas a `progress/current.md`, entrada en `progress/history.md`, decidir sobre Base UI vs
Radix, revision visual de `/` y `/login`, y el PR contra dev.
