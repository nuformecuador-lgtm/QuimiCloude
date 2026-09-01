# Feature 7 — pantalla-de-login · design.md

> **Revisión 2026-08-06.** Incorpora las respuestas humanas a las preguntas abiertas y dos
> cambios de diseño: el error de credenciales pasa a **toast** (§5.3) y se añade el enlace
> de recuperación de contraseña (§5.4).

## 0. Estado real del repo (verificado, no supuesto)

Comprobado en el worktree principal antes de escribir este diseño:

| Hecho | Evidencia |
| --- | --- |
| Next 16.3.0, React 19.2.8, App Router | `package.json` |
| TypeScript `strict: true`, alias `@/*` → `./*` | `tsconfig.json` |
| Tailwind CSS v4 (`@import "tailwindcss"` + `@tailwindcss/postcss`) | `app/globals.css`, `package.json` |
| **shadcn/ui NO está inicializado**: no existe `components.json`, ni `components/`, ni `lib/utils.ts` | glob del repo |
| **`sonner` NO está instalado. `next-themes` tampoco.** No hay ningún `<Toaster />` en el repo | glob de `node_modules`, grep de `toast\|sonner\|Toaster` (único hit: la tabla de zonas de `AGENTS.md`) |
| **No hay runner de tests**: `scripts` = `dev`, `build`, `start`, `lint`, `typecheck`. Sin Vitest, sin Playwright, sin `tests/` ni `e2e/` | `package.json`, glob |
| **No hay `lib/`, ni zod, ni Prisma instalados** | `package.json`, glob |
| La app sólo tiene `app/layout.tsx`, `app/page.tsx`, `app/globals.css` | glob |
| Gestor de paquetes: pnpm 10.10.0 | `package.json > packageManager` |

Todo lo que este diseño añade parte de ese suelo. Nada de lo de abajo asume piezas que no
estén listadas arriba o creadas por una task de `tasks.md`.

## 1. Decisiones cerradas por el humano (2026-08-06)

Ya **no** son supuestos:

- **D1 — El runner de tests entra en esta feature.** Vitest + Testing Library + script
  `test` en `package.json`. Alcance confirmado (task T1). Sigue siendo la task de mayor
  superficie de la feature (ver §9.2), pero no está pendiente de nadie.
- **D2 — Route group `app/(public)/login/`.** Confirmado. `docs/architecture.md` sólo
  nombraba `(marketing)` y `(dashboard)`; queda un grupo público más, para páginas públicas
  que no son marketing.
- **D3 — Copy provisional aprobada y la pantalla lleva la marca «QuimiCloude»** (R23). Los
  tests **siguen sin afirmar sobre literales**: roles ARIA, `data-testid` y constantes
  exportadas.
- **D4 — El error genérico de credenciales se muestra por toast de shadcn/ui**, no por
  `Alert` inline (§5.3). Los **errores de campo siguen inline** (R10).
- **D5 — Se maqueta el enlace «¿Olvidaste tu contraseña?»** (R22), sin crear la ruta
  destino (§5.4).

## 2. Supuestos abiertos que siguen vivos

- **S1 — `/dashboard` no existe.** Es la feature 9, en `pending`. Esta feature **no crea**
  la ruta. La redirección apunta a `DASHBOARD_ROUTE = '/dashboard'`; hoy, en ejecución
  manual, eso da 404, y es el comportamiento esperado hasta la feature 9.
- **S6 — La ruta de recuperación de contraseña no existe y ninguna feature del backlog la
  cubre.** Se maqueta el enlace apuntando a `FORGOT_PASSWORD_ROUTE = '/recuperar-contrasena'`
  y hoy devuelve **404**. Esta feature no crea la ruta ni la lógica. El slug definitivo está
  sin confirmar (pregunta abierta 1) y por eso vive en **una constante exportada**: cambiarlo
  después es editar una línea, y el test de R22 afirma contra la constante, no contra el
  literal.
- **S4 — Copy provisional** (aprobada como provisional en D3): los literales pueden cambiar
  sin tocar tests.
- **S5 — zod** no está instalado; `tasks.md` lo añade como dependencia de producción, según
  exige `docs/architecture.md` para validar entrada externa en el borde.

## 3. Decisión estructural: el punto de costura con la feature 10

La restricción dura del humano: **la feature 10 debe poder sustituir el cuerpo de la
autenticación sin tocar ni un archivo de UI**. La frontera se corta en dos, no en una:

```
app/(public)/login/page.tsx          ← UI (server component, sólo maquetación)
app/(public)/login/login-form.tsx    ← UI (client, useActionState + efecto de toast)
app/(public)/login/submit-button.tsx ← UI (client, useFormStatus)
        │ importa loginAction y los tipos, y nada más
        ▼
lib/actions/login.ts                 ← Controller (Server Action). CONTRATO CONGELADO.
        │ llama a verifyCredentials(input)
        ▼
lib/services/login-stub.ts           ← STUB. **Este es el archivo que borra la feature 10.**
```

**Contrato congelado en la feature 7** (la feature 10 no lo cambia):

- Nombre y ruta de la action: `loginAction` en `lib/actions/login.ts`.
- Firma: `(prevState: LoginFormState, formData: FormData) => Promise<LoginFormState>`.
- Estado inicial exportado: `LOGIN_INITIAL_STATE`.
- Nombres de los campos del formulario: `username`, `password`.
- Forma del estado (`LoginFormState`, ver §4), **incluido el `attemptId`** del que depende
  la emisión del toast.
- El éxito **no devuelve estado**: llama a `redirect(DASHBOARD_ROUTE)`.

**Lo que la feature 10 cambia**: el cuerpo de `verifyCredentials` (o su reemplazo por el
`AuthService` real de la feature 4, inyectado en `lib/actions/login.ts`) y el añadido de la
emisión de cookie de sesión dentro de la action, antes del `redirect`. Cero archivos de UI
tocados. Ese es el criterio con el que el reviewer de la feature 10 juzgará esta costura.

Por qué el stub vive en un archivo aparte y no dentro de la action: si el «siempre falla»
estuviera embebido en `loginAction`, el camino de éxito (R17) sería código inalcanzable e
intesteable en esta feature. Con el stub aislado, el test mockea ese único módulo y
ejercita la rama de redirección de verdad.

## 4. Contrato de datos

### Entrada (zod, en el borde — `lib/types/auth.ts`)

```ts
export const loginInputSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),   // la contraseña NO se recorta
});
export type LoginInput = z.infer<typeof loginInputSchema>;
```

La contraseña no se recorta: un espacio inicial o final es parte de la credencial y
recortarlo cambiaría silenciosamente lo que el usuario escribió.

### Estado del formulario (`LoginFormState`)

Unión discriminada por `status`, para que `strict` obligue a cubrir cada caso en el render y
no existan combinaciones imposibles («éxito con mensaje de error»).

```ts
export type LoginFormState =
  | { status: 'idle' }
  | { status: 'invalid'; attemptId: string; username: string;
      fieldErrors: { username?: string; password?: string } }
  | { status: 'error'; attemptId: string; username: string; message: string };

export const LOGIN_INITIAL_STATE: LoginFormState = { status: 'idle' };
export const GENERIC_CREDENTIALS_ERROR = 'Usuario o contraseña incorrectos.'; // copy provisional (S4)
export const DASHBOARD_ROUTE = '/dashboard';
export const FORGOT_PASSWORD_ROUTE = '/recuperar-contrasena';                 // S6
```

Puntos que el reviewer debe poder verificar de un vistazo:

- **No hay campo `password` en ningún miembro de la unión** (R15). El tipo es la garantía,
  no una promesa en prosa.
- No hay `status: 'success'`: el éxito sale por `redirect`, no por estado (R17).
- `username` viaja en los dos estados de fallo para rehidratar el campo (R13).
- `message` es un único string en el caso `error` (R11, R12).
- **`attemptId` está en los dos estados de fallo, y NO en `idle`.** Es la pieza que hace
  cumplible R21; su razón de ser está en §5.3.

### `attemptId`: por qué existe y quién lo genera

Lo genera **la action**, una vez por invocación, con `crypto.randomUUID()` (disponible como
global en el runtime de Node de Next 16; no requiere import). No es un dato de dominio: es
un **identificador de resultado** que permite al cliente distinguir «resultado nuevo» de
«mismo resultado re-renderizado».

Sin él, R21 no se puede cumplir de forma fiable: dos intentos fallidos consecutivos con la
misma entrada producen estados **estructuralmente idénticos**, así que ni comparar por
referencia ni por valor sirve — con referencia, un re-render por cualquier otra causa
volvería a disparar el toast; con valor, el segundo fallo idéntico **no** lo dispararía, y
el usuario vería que «no pasa nada» al reintentar. El `attemptId` rompe el empate en las dos
direcciones. Que `idle` no lo tenga es lo que garantiza que no salta un toast al montar.

### Flujo de la action

```
FormData → loginInputSchema.safeParse
  ├─ !success → { status: 'invalid', attemptId, username: <lo escrito>, fieldErrors }  (R9, R10)
  └─ success  → verifyCredentials(input)
        ├─ { ok: false } → { status: 'error', attemptId, username, message: GENERIC_… }  (R11–R14)
        └─ { ok: true }  → redirect(DASHBOARD_ROUTE)                                      (R17)
```

`verifyCredentials` en esta feature devuelve **siempre** `{ ok: false }` (R18) y no toca
red, DB ni cookies (R19).

Nota de implementación importante: `redirect()` de `next/navigation` lanza una excepción de
control (`NEXT_REDIRECT`). **No debe quedar dentro de un `try/catch`** que la trague, y el
test de R17 afirma sobre la llamada a `redirect` mockeada, no sobre el valor de retorno.

## 5. UI y estados

### 5.1 Composición

- **Todo primitivo viene de shadcn/ui** (restricción del humano y
  `docs/architecture.md > Componentes`): `Card`/`CardHeader`/`CardTitle`/`CardContent` para
  el contenedor y la marca (R23), `Label` + `Input` para los campos, `Button` para el envío,
  `Sonner`/`Toaster` para el toast. Ninguno se escribe a mano. **Ya no se usa `Alert`**: con
  el error genérico movido a toast, el único texto de error inline es el de campo, que es un
  `<p>` con `id`, no un primitivo de shadcn.
- **`page.tsx` es Server Component** y no lleva `'use client'`: compone Card + marca +
  `<LoginForm />` + enlace de recuperación.

### 5.2 Formulario y estado «enviando»

- **`login-form.tsx`** (`'use client'`):
  `const [state, formAction] = useActionState(loginAction, LOGIN_INITIAL_STATE)` y
  `<form action={formAction}>`. Nada de `onSubmit`, nada de `fetch`, nada de `useState`
  (R20 y restricción 2 del humano).
- **`submit-button.tsx`** (`'use client'`) es un componente **separado** por necesidad
  técnica, no por gusto: `useFormStatus()` sólo lee el estado del `<form>` **ancestro**, así
  que si el hook viviera en `login-form.tsx` (el mismo componente que renderiza el `<form>`)
  devolvería siempre `pending: false`. Es el error clásico de este hook. Aquí:
  `const { pending } = useFormStatus()` → `disabled={pending}` + texto/`aria-busy` (R6, R7).
  Al terminar la action, React pone `pending` a `false` solo: R8 sale gratis y sin estado
  propio.
- **Rehidratación de campos** (R13, R14): React 19 resetea los campos no controlados de un
  `<form action>` tras completarse la Server Action. Por eso los inputs son **no
  controlados** con `defaultValue={state.username}` en el de usuario y **sin**
  `defaultValue` en el de contraseña: el reset limpia ambos y el re-render con el nuevo
  estado vuelve a poner el usuario, dejando la contraseña vacía. Es exactamente el
  comportamiento pedido, sin una línea de `useState`.
- **Errores de campo, inline** (R10): `<p id="username-error">` bajo el input,
  `aria-invalid="true"` + `aria-describedby="username-error"` en el input. Idem contraseña.

### 5.3 El toast del error de credenciales (cambio de diseño, D4)

**Qué componente.** shadcn/ui ha mantenido dos: el `toast` legacy basado en
`@radix-ui/react-toast` (con `useToast`) y `sonner`. El legacy está marcado como
**deprecado** en la documentación de shadcn y `sonner` es el vigente y el que el humano
nombró explícitamente. Se elige **`sonner`**:
`pnpm dlx shadcn@latest add sonner`, que genera `components/ui/sonner.tsx` (el wrapper
`<Toaster />`) e instala el paquete `sonner`.

> **Verificación pendiente en tiempo de implementación, no asumible:** en este repo no hay
> nada instalado (§0), así que la vigencia se confirma al correr el CLI (T3b). Si el CLI
> vigente en la fecha de implementación ofreciera otra cosa, el implementer **para y avisa**
> antes de improvisar; no se sustituye por un componente propio.

**Dónde se monta el `<Toaster />`.** En `app/(public)/layout.tsx`, no en el root layout.
Razón: el root layout lo comparten todas las zonas y las features 8/9 traerán su propio
armazón privado; montar aquí un toaster global sería tomar por ellas una decisión que no me
corresponde. Cuando una segunda zona lo necesite, se promueve al root en esa feature.

**Cómo se dispara, sin dobles emisiones (R21).** Efecto en `login-form.tsx`:

```ts
const lastToastedId = useRef<string | null>(null);
useEffect(() => {
  if (state.status !== 'error') return;
  if (lastToastedId.current === state.attemptId) return;
  lastToastedId.current = state.attemptId;
  toast.error(state.message);
}, [state]);
```

Tres guardas, cada una tapa un agujero real:
1. `status !== 'error'` → nunca salta con `idle` (montaje, R3) ni con `invalid` (los errores
   de campo son inline, no toast).
2. comparación con `lastToastedId` → un re-render que no traiga un intento nuevo no vuelve a
   emitir.
3. `attemptId` distinto por invocación → dos fallos consecutivos idénticos **sí** emiten dos
   toasts, que es lo que el usuario espera al reintentar.

Un `useRef` no es «estado del formulario» y no viola la restricción 2 del humano: no
almacena el pending ni el resultado, sólo memoriza qué se notificó ya. El pending sigue
saliendo de `useFormStatus` y el resultado de `useActionState`.

**Accesibilidad — el hueco, dicho con todas las letras.** `sonner` monta su contenedor con
`aria-live` (`polite` por defecto, `assertive` para errores) y `role="status"`, así que el
mensaje **sí** se anuncia a un lector de pantalla sin mover el foco (R16). Pero un toast es
transitorio y eso deja dos huecos reales frente al `Alert` inline que había antes:

1. **Se autodescarta.** Quien tarde en llegar al anuncio, o quien no mire esa esquina de la
   pantalla, pierde el mensaje sin rastro. El `Alert` inline persistía hasta el siguiente
   intento.
2. **No queda junto al formulario.** Un usuario con lupa o zoom alto enfocado en los campos
   puede no ver nunca la notificación.

Mitigación aplicada: duración larga para el toast de error (≥ 6 s) y `richColors`. **No se
cierra el hueco 1**, y no se maquilla: es un **riesgo asumido por decisión humana explícita
del 2026-08-06**. Si en revisión de accesibilidad se decide recuperar la persistencia, la
vuelta atrás es barata (el estado ya lleva el mensaje; sólo cambia el render).

**Divergencia con la descripción de la feature.** `feature_list.json` (id 7) dice que el
error «se muestra junto al formulario»; con el toast **no** queda junto al formulario. La
decisión humana del 2026-08-06 prevalece sobre ese literal, y queda anotado aquí para que
el reviewer no lo lea como incumplimiento.

### 5.4 Enlace de recuperación de contraseña (cambio de diseño, D5)

`<Link href={FORGOT_PASSWORD_ROUTE}>` de `next/link`, renderizado en el pie de la Card,
fuera del `<form>` (no es un control del formulario y dentro estorbaría al orden de
tabulación entre contraseña y botón de envío). Sólo maquetación: **la ruta no se crea** y
hoy da 404 (S6). No se usa `href="#"`, que rompería el nombre accesible y dejaría un enlace
que no navega a ninguna parte.

### 5.5 Accesibilidad y testids

- `Label htmlFor` ↔ `Input id` (R4); `aria-invalid` + `aria-describedby` en los campos con
  error (R10); región live del toaster para el error genérico (R16).
- `autoComplete="username"` y `autoComplete="current-password"`.
- **`data-testid`** estables en: formulario, input de usuario, input de contraseña, botón,
  cada mensaje de campo y el enlace de recuperación. El toast **no** se testea por testid:
  se testea mockeando `sonner` y afirmando sobre la llamada a `toast.error` (más estable que
  esperar a que el portal pinte, y es lo que R11/R21 realmente afirman).
- Los tests afirman sobre roles ARIA, testids y constantes exportadas, **nunca** sobre
  literales de copy (S4/D3).

## 6. Ruteo

| Ruta | Archivo | Tipo | Público |
| --- | --- | --- | --- |
| `/login` | `app/(public)/login/page.tsx` | página (RSC) | sí (R1) |
| — | `app/(public)/layout.tsx` | layout | monta `<Toaster />` |
| `/recuperar-contrasena` | **no existe** (S6) | — | destino del enlace R22, 404 hoy |
| `/dashboard` | **no existe** (S1) | — | destino del `redirect` R17, 404 hoy |

Sin `middleware.ts` en esta feature: la protección de rutas es la feature 6 y la guardia de
sesión la 10. Sin route handlers: `docs/architecture.md > Server Actions vs Route Handlers`
manda Server Action para una mutación desde un componente propio.

## 7. Datos, migraciones, RLS

**Ninguno.** Esta feature no crea tablas, ni migraciones, ni policies, ni toca Prisma o
Supabase (R19). Los apartados de datos de `CHECKPOINTS.md` aplican como «no aplica», y así
debe declararlo el reviewer: no como omisión.

## 8. Alternativas descartadas

### A. `onSubmit` + `fetch` a `app/api/login` + `useState` para pending (DESCARTADA)

Es el reflejo de React 18. Se descarta por tres razones, y la del humano es sólo la
primera: (1) el humano lo prohibió explícitamente; (2)
`docs/architecture.md > Server Actions vs Route Handlers` manda Server Action para
mutaciones internas y prohíbe `fetch` a rutas API internas; (3) rompe el progressive
enhancement (R20): sin JS el formulario deja de existir. Además duplica el estado de
«enviando» en un `useState` que se desincroniza en cuanto hay un `await` con early-return.

### B. Inputs controlados con `useState` para rehidratar el usuario (DESCARTADA)

Es la forma «obvia» de cumplir R13, y es peor: convierte cada tecla en un render, exige
sincronizar el estado local con el que devuelve la action (dos fuentes de verdad para el
mismo dato) y deja el valor del usuario viviendo también en el cliente sin necesidad. El
comportamiento de reset de `<form action>` de React 19 más `defaultValue` lo resuelve con
cero estado. Se descarta.

### C. Meter el stub «siempre falla» dentro de `loginAction` (DESCARTADA)

Ahorra un archivo y cuesta un requisito: R17 (redirección al dashboard) quedaría como código
inalcanzable, no testeable, y la feature 10 tendría que reescribir la action entera en vez
de sustituir un módulo. El archivo separado es la costura barata.

### D. Devolver `{ status: 'success' }` y redirigir desde el cliente con `useRouter`
(DESCARTADA)

Añade un `useEffect` de navegación en la UI y, sobre todo, **rompe la costura**: la feature
10 tendría que emitir la cookie de sesión en el servidor y redirigir en el cliente, lo que
obliga a tocar `login-form.tsx` — justo lo que la restricción del humano prohíbe. Con
`redirect()` en la action, cookie y navegación quedan del mismo lado.

### E. `app/(marketing)/login/` (DESCARTADA por decisión humana D2)

Era el único grupo público que nombraba `docs/architecture.md`, pero login no es marketing y
mezclarlos ensucia el layout público el día que haya landing. Cerrado: `(public)`.

### F. Escribir Button/Input a mano con Tailwind (DESCARTADA)

Prohibido por la restricción 1 del humano y por
`docs/architecture.md > Componentes` («Nunca crees un componente si ya existe en
shadcn/ui»). Se paga el coste de inicializar shadcn en esta feature; lo amortizan las
features 8 y 9.

### G. Disparar el toast **dentro de la Server Action** (DESCARTADA)

Sería lo más corto de escribir, y es imposible: `toast()` de sonner es API de cliente y la
action corre en el servidor. Aunque se pudiera, ataría la capa de presentación al contrato
de la action y rompería la costura con la feature 10 (§3). El toast se dispara donde vive el
DOM: en el componente cliente, a partir del estado.

### H. Detectar «resultado nuevo» comparando el objeto de estado, sin `attemptId` (DESCARTADA)

La opción sin campo extra. Falla en las dos variantes: comparando por **referencia**,
cualquier re-render con estado nuevo pero mismo contenido reemitiría el toast; comparando
por **valor**, dos fallos consecutivos con la misma entrada producen estados idénticos y el
segundo **no** emitiría nada — el usuario reintenta y la pantalla parece no responder. El
`attemptId` cuesta un campo en el tipo y elimina la clase de bug entera. Ver §4.

### I. `Alert role="alert"` inline junto al formulario (DESCARTADA por decisión humana D4)

Era el diseño de la primera versión de este spec, y accesiblemente es **superior**
(persistente, contiguo al formulario, sin riesgo de perderse). Se descarta porque el humano
pidió toast el 2026-08-06. El coste está documentado en §5.3 como riesgo asumido, no
disimulado.

## 9. Riesgos

1. **`shadcn init` sobre Tailwind v4 + Next 16** reescribe `app/globals.css` (tokens
   `@theme`, variables de color) y puede alterar el look actual de `app/page.tsx`. Es
   esperado, pero debe revisarse en la task correspondiente antes de commitear.
2. **Introducir Vitest toca el repo entero** (D1): `tsconfig` de tests, script `test`, y el
   comportamiento de `./init.sh`. Es la task con más superficie de conflicto de toda la
   feature; si otra feature `frontend` corre en paralelo, aquí es donde chocarán.
3. **React 19 y el reset de formularios**: si una versión futura cambia ese comportamiento,
   R13/R14 se rompen en silencio. Por eso ambos tienen test propio y no se dan por hechos.
4. **Transitoriedad del toast** (§5.3): riesgo de accesibilidad asumido por decisión humana.
5. **Tema del `<Toaster />`**: el wrapper que genera shadcn para sonner suele leer el tema
   con `useTheme()` de `next-themes`, paquete que **no está instalado** aquí. Si el CLI
   genera esa dependencia, hay que decidir si se instala `next-themes` o se simplifica el
   wrapper — decisión que toca a la pregunta abierta 5 (modo oscuro) y que el implementer
   **no resuelve solo**: la reporta.
6. **Dos rutas destino que hoy dan 404** (S1 `/dashboard`, S6 `/recuperar-contrasena`).
   Cualquier E2E que las siga fallará por diseño; por eso T13 acota el alcance del E2E.
