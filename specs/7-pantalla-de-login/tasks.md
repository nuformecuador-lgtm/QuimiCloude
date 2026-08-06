# Feature 7 — pantalla-de-login · tasks.md

> **Revisión 2026-08-06.** T0 cerrada por decisión humana (runner de tests aprobado, route
> group `(public)`, copy y marca aprobadas). Nuevas tasks: T3b (sonner + `<Toaster />`) y el
> enlace de recuperación dentro de T10. El error de credenciales ya no usa `Alert`.

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica
sus dependencias y su **criterio de hecho** (verificable, no «parece bien»). Un commit por
task, formato `docs/conventions.md > Commits`.

Recordatorio de gate (`docs/verification.md` + `AGENTS.md > Regla del gate`): el
`frontend_dev` corre sólo `pnpm run typecheck`, `pnpm run lint` y los tests de sus archivos.
`./init.sh --rapido` lo corre el leader al cerrar tanda; `./init.sh` completo, al cerrar la
feature y antes del PR.

---

## Bloque 0 — Infraestructura (bloquea todo lo demás)

### [x] T1 — Montar el runner de tests (Vitest + Testing Library) y el script `test`
- **Depende de**: nada. **Alcance aprobado por el humano el 2026-08-06.**
- **Qué**:
  - `pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom`
  - `vitest.config.ts` en la raíz: entorno `jsdom`, alias `@` → raíz (igual que
    `tsconfig.json > paths`), `setupFiles` con `@testing-library/jest-dom/vitest`,
    `globals: true`, `include: ['tests/**/*.test.{ts,tsx}']`.
  - `package.json > scripts`: `"test": "vitest run"`, `"test:rapido": "vitest related --run"`
    (o el envoltorio que `init.sh` espere — **leer `init.sh` antes de nombrarlos**, no
    inventar los nombres).
  - Un test trivial de humo para comprobar que el runner arranca.
- **Hecho cuando**: `pnpm test` corre y termina en verde, `pnpm run typecheck` y
  `pnpm run lint` siguen limpios, e `./init.sh` deja de avisar de que falta el script `test`.
- **Aviso de superficie** (`design.md > 9.2`): toca archivos raíz compartidos. Si hay otra
  feature `frontend` en curso, avisar al leader antes de empezar.

### [x] T2 — [P] Inicializar shadcn/ui
- **Depende de**: nada.
- **Qué**: `pnpm dlx shadcn@latest init` (Tailwind v4, alias `@/*`). Genera
  `components.json`, `lib/utils.ts` (`cn`) y las dependencias `clsx` / `tailwind-merge` /
  `class-variance-authority` / `lucide-react`.
- **Hecho cuando**: existe `components.json`, existe `lib/utils.ts` con `cn`,
  `pnpm run build` pasa, y se ha revisado el diff de `app/globals.css` (el init lo reescribe)
  confirmando que `app/page.tsx` sigue renderizando sin romperse.

### [x] T3 — Añadir las primitivas de formulario de shadcn/ui
- **Depende de**: T2.
- **Qué**: `pnpm dlx shadcn@latest add button input label card`
- **Hecho cuando**: existen `components/ui/button.tsx`, `input.tsx`, `label.tsx`,
  `card.tsx`; `pnpm run typecheck` limpio. **Ningún archivo de `components/ui/` se edita a
  mano en esta feature.** (Ya **no** se añade `alert`: el error genérico va por toast.)

### [x] T3b — Añadir el toast de shadcn/ui (`sonner`) y montar el `<Toaster />`
- **Depende de**: T2.
- **Qué**:
  - `pnpm dlx shadcn@latest add sonner` → genera `components/ui/sonner.tsx` e instala el
    paquete `sonner`.
  - Crear `app/(public)/layout.tsx` que renderice `{children}` + `<Toaster />`
    (`design.md > 5.3`: se monta en el layout público, **no** en el root layout).
  - **Verificación obligatoria antes de escribir código**: confirmar que `sonner` es el
    componente de toast **vigente** en shadcn/ui y que el `toast` legacy de Radix está
    deprecado. Si el CLI ofreciera otra cosa, **parar y avisar al leader**; no sustituir por
    un componente propio.
  - Si el wrapper generado importa `next-themes` (no instalado en este repo, ver
    `design.md > 9.5`), **no decidir solo**: reportar al leader antes de instalar nada.
- **Hecho cuando**: `pnpm run build` pasa, `/login` renderiza con el `<Toaster />` montado,
  y una llamada manual de prueba a `toast.error()` pinta la notificación.

### [x] T4 — [P] Añadir zod
- **Depende de**: nada.
- **Qué**: `pnpm add zod`.
- **Hecho cuando**: zod figura en `dependencies` (no en dev) y `pnpm run typecheck` pasa.

---

## Bloque 1 — Contrato (lo que la feature 10 no volverá a tocar)

### [x] T5 — `lib/types/auth.ts`: schema, tipos y constantes
- **Depende de**: T4.
- **Qué**: implementar exactamente lo de `design.md > 4`: `loginInputSchema`, `LoginInput`,
  `LoginFormState` (unión discriminada **con `attemptId` en los dos estados de fallo y no en
  `idle`**), `LOGIN_INITIAL_STATE`, `GENERIC_CREDENTIALS_ERROR`, `DASHBOARD_ROUTE`,
  `FORGOT_PASSWORD_ROUTE`.
- **Hecho cuando**: `pnpm run typecheck` pasa y **ningún miembro de `LoginFormState` tiene un
  campo `password`** (verificación visual explícita del reviewer; es la garantía de tipo de
  R15).

### [x] T6 — `lib/services/login-stub.ts`: el punto de costura
- **Depende de**: T5.
- **Qué**: exportar `verifyCredentials(input: LoginInput): Promise<{ ok: boolean }>` que
  devuelve siempre `{ ok: false }`. Sin DB, sin red, sin cookies. Comentario en cabecera
  señalando que **este archivo lo reemplaza la feature 10** y que ningún archivo de UI lo
  importa.
- **Hecho cuando**: el módulo no importa nada de `next/*`, Prisma ni Supabase, y
  `pnpm run typecheck` pasa.

### [x] T7 — `lib/actions/login.ts`: la Server Action
- **Depende de**: T5, T6.
- **Qué**: `'use server'`; `loginAction(prevState: LoginFormState, formData: FormData):
  Promise<LoginFormState>` siguiendo el flujo de `design.md > 4`. Genera un `attemptId` con
  `crypto.randomUUID()` por invocación. `redirect(DASHBOARD_ROUTE)` de `next/navigation`
  **fuera de cualquier `try/catch`**.
- **Hecho cuando**: `pnpm run typecheck` y `pnpm run lint` pasan; la firma coincide
  literalmente con la del contrato de `design.md > 3`.

---

## Bloque 2 — UI

### [x] T8 — `app/(public)/login/submit-button.tsx`
- **Depende de**: T3. `[P]` con T9 hasta que T9 lo importe.
- **Qué**: componente cliente que usa `useFormStatus()` de `react-dom` y renderiza el
  `Button` de shadcn con `disabled={pending}`, `aria-busy={pending}` y texto de estado. Sin
  props de pending: el hook es la única fuente.
- **Hecho cuando**: typecheck/lint limpios y el componente **no** declara ningún `useState`.

### [x] T9 — `app/(public)/login/login-form.tsx`
- **Depende de**: T3, T3b, T7, T8.
- **Qué**: componente cliente con `useActionState(loginAction, LOGIN_INITIAL_STATE)` y
  `<form action={formAction}>`. Campos `name="username"` / `name="password"` no controlados,
  `defaultValue={…username}` sólo en usuario. Errores de campo **inline** con
  `aria-invalid` + `aria-describedby` (R10). Efecto de toast con guarda de `attemptId` tal
  cual está en `design.md > 5.3` (R11, R21). `autoComplete` en ambos campos. `data-testid`
  estables.
- **Hecho cuando**: typecheck/lint limpios y el archivo **no contiene** `onSubmit`, `fetch`,
  ni `useState` (grep explícito antes de commitear). El único `useRef` admitido es el de
  `lastToastedId`.

### [x] T10 — `app/(public)/login/page.tsx`
- **Depende de**: T3, T9.
- **Qué**: Server Component (sin `'use client'`) que compone `Card` + marca «QuimiCloude»
  como `CardTitle` (R23) + `<LoginForm />` + el enlace `<Link href={FORGOT_PASSWORD_ROUTE}>`
  en el pie de la Card, **fuera del `<form>`** (R22, `design.md > 5.4`). Export de
  `metadata` con el título de la pantalla. **No se crea la ruta destino del enlace** (S6).
- **Hecho cuando**: `pnpm run build` pasa, `pnpm dev` sirve `/login`, la pantalla se ve en
  estado vacío sin errores en consola, y el enlace es alcanzable con Tab (que su destino dé
  404 hoy es lo esperado, S6).

---

## Bloque 3 — Tests y trazabilidad

### [x] T11 — `tests/unit/login-action.test.ts`
- **Depende de**: T1, T7.
- **Qué**: tests de la Server Action, mockeando `lib/services/login-stub` y
  `next/navigation`. Nombres de test que describen comportamiento
  (`docs/conventions.md > Tests`).
- **Hecho cuando**: cubre R5, R9, R12, R13, R15, R17, R18, R19 y el `attemptId` de R21, y
  `pnpm exec vitest related --run lib/actions/login.ts` sale verde.

### [x] T12 — `tests/unit/login-form.test.tsx`
- **Depende de**: T1, T3, T3b, T9, T10.
- **Qué**: tests de render e interacción con Testing Library + `user-event`, mockeando
  `lib/actions/login.ts` para controlar el estado devuelto (y poder mantener la promesa
  pendiente, así se observa el estado «enviando» de R6/R7) y mockeando `sonner` para afirmar
  sobre `toast.error`.
- **Hecho cuando**: cubre R1–R4, R6–R8, R10, R11, R13, R14, R16, R20, R21, R22, R23 y pasa
  en verde.
- **Nota**: los asserts van sobre roles ARIA, `data-testid` y constantes exportadas,
  **nunca** sobre el literal de copy (S4/D3).

### [x] T13 — Decisión sobre E2E (Playwright)
- **Depende de**: T10.
- **Qué**: `CHECKPOINTS.md` pide E2E para flujos críticos como autenticación. Aquí no hay
  autenticación real y ni `/dashboard` ni la ruta de recuperación existen (S1, S6), así que
  el camino feliz completo no es ejercitable. Dos salidas admisibles, y hay que elegir una
  explícitamente:
  - **(a)** montar Playwright y cubrir sólo lo ejercitable en `/login` (estado vacío, campos
    obligatorios inline, toast de error con usuario conservado y contraseña limpia,
    presencia del enlace de recuperación), dejando el tramo login→dashboard para la
    feature 10; o
  - **(b)** diferir todo el E2E a la feature 10, **registrándolo como deuda** en
    `progress/current.md > Deudas y cosas abiertas`.
- **Hecho cuando**: la opción elegida está ejecutada y escrita en
  `progress/impl_7-pantalla-de-login.md`. Lo que no vale es dejarlo sin decidir.

### [x] T14 — Mapa de trazabilidad `R<n> → test`
- **Depende de**: T11, T12, T13.
- **Qué**: volcar la tabla de abajo, ya con los nombres reales de los tests, en
  `progress/impl_7-pantalla-de-login.md`, junto con los archivos tocados y la salida real de
  los tests.
- **Hecho cuando**: **los 23 requisitos (R1–R23)** tienen al menos un test nombrado. Un
  hueco es hallazgo bloqueante del reviewer (`docs/verification.md > Regla del reviewer`).

---

## Mapa de trazabilidad previsto (`R<n> → test`)

| Req | Test previsto | Archivo |
| --- | --- | --- |
| R1 | `la pantalla de login se renderiza sin sesion` | login-form.test.tsx (+ E2E si T13=a) |
| R2 | `muestra campo de usuario, campo de contrasena enmascarado y boton dentro de un form` | login-form.test.tsx |
| R3 | `en estado inicial no muestra errores, no emite toast y los campos estan vacios` | login-form.test.tsx |
| R4 | `activar la etiqueta enfoca su campo` | login-form.test.tsx |
| R5 | `envia usuario y contrasena a la action al hacer submit` | login-action.test.ts |
| R6 | `deshabilita el boton mientras el envio esta en curso` | login-form.test.tsx |
| R7 | `marca aria-busy mientras el envio esta en curso` | login-form.test.tsx |
| R8 | `rehabilita el boton cuando el envio termina con error` | login-form.test.tsx |
| R9 | `devuelve error de campo obligatorio y no verifica credenciales si un campo esta vacio` | login-action.test.ts |
| R10 | `muestra el error de campo inline, marca aria-invalid y lo vincula con aria-describedby` | login-form.test.tsx |
| R11 | `emite un toast de error cuando las credenciales no son aceptadas` | login-form.test.tsx |
| R12 | `usa el mismo mensaje para usuario inexistente y para contrasena incorrecta` | login-action.test.ts |
| R13 | `conserva el usuario escrito tras un intento rechazado` | login-action.test.ts + login-form.test.tsx |
| R14 | `deja el campo de contrasena vacio tras un intento rechazado` | login-form.test.tsx |
| R15 | `el estado devuelto nunca contiene la contrasena` | login-action.test.ts |
| R16 | `el toast de error se anuncia por region live sin mover el foco` | login-form.test.tsx |
| R17 | `redirige a /dashboard cuando las credenciales son aceptadas y no emite toast` | login-action.test.ts |
| R18 | `rechaza todo intento valido mientras no hay verificacion real` | login-action.test.ts |
| R19 | `no accede a base de datos ni emite cookie` | login-action.test.ts |
| R20 | `envia el formulario al pulsar Enter dentro de un campo` | login-form.test.tsx |
| R21 | `no emite toast al montar` + `no reemite el toast en un re-render del mismo intento` + `emite un toast nuevo por cada intento rechazado, aunque la entrada sea identica` | login-form.test.tsx (+ `genera un attemptId distinto por invocacion` en login-action.test.ts) |
| R22 | `muestra el enlace de recuperacion apuntando a FORGOT_PASSWORD_ROUTE y accesible por teclado` | login-form.test.tsx |
| R23 | `muestra la marca del producto como titulo de la tarjeta` | login-form.test.tsx |

Ningún requisito queda huérfano: R1–R23, sin saltos.

---

## Cierre

### T15 — Gate completo y PR
- **Depende de**: T14.
- **Hecho cuando**: `./init.sh` (completo, sin flags) termina en verde,
  `progress/impl_7-pantalla-de-login.md` tiene el mapa y la salida real de los tests, y el PR
  está abierto contra `dev` con título `feat(7-pantalla-de-login): …`.

### Deudas que esta feature deja registradas (no silenciosas)
- `/recuperar-contrasena` no existe y ninguna feature del backlog la cubre (S6). Anotar en
  `progress/current.md > Deudas y cosas abiertas` y proponer alta de feature.
- `/dashboard` no existe hasta la feature 9 (S1).
- Riesgo de accesibilidad asumido por el toast transitorio (`design.md > 5.3`).

### Checklist de `CHECKPOINTS.md` que aplica «no aplica» (declararlo, no omitirlo)
- Datos y seguridad (RLS, migraciones, `down.sql`, repositorios Prisma): **no aplica**, esta
  feature no toca datos (R19, `design.md > 7`).
- Patrón de capas Controller/Service/Repository: aplica parcialmente — hay controller
  (Server Action) y un stub de servicio; **no hay repositorio** por diseño.
- Permisos: **no aplica**; `/login` es pública y la guardia de sesión es la feature 10.
