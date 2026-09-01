# QC-15 — arquitectura-hexagonal-y-modulos · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica
dependencias y **criterio de hecho** verificable. Un commit por task
(`docs/conventions.md > Commits`).

**Gate** (`docs/verification.md`): el implementer corre `pnpm run typecheck`, `pnpm run lint`
y `pnpm exec vitest related --run <sus archivos>`. **`./init.sh --rapido` lo corre el leader
al cerrar cada tanda; `./init.sh` completo al cerrar la feature y antes del PR, sin
excepcion.**

**Regla de orden.** Las tasks estan ordenadas para que **el repo quede compilando y la suite
en verde al terminar cada una**, no solo al final. T1 a T6 son movimientos mecanicos: cada
una mueve un grupo de archivos y reescribe **en la misma task** todos sus importadores. Si
una task deja typecheck en rojo, no esta hecha.

**Prohibido en toda la feature:** cambiar el cuerpo de una funcion de produccion, el valor
esperado de una asercion, o el esquema de base de datos. Si algo parece que lo necesita,
**parar y avisar al leader** (restriccion 1 del encargo, y pregunta abierta 4 de
`requirements.md`).

---

## Bloque 0 — Base

### T0 — [x] Integrar `dev` y registrar el verde de partida (BLOQUEA TODO)
- **Depende de**: nada.
- **Que**: `git merge origin/dev` en el worktree. El worktree esta por detras: le faltan
  `docs/architecture.md > Dependencias de terceros`, `docs/dependencias.md`,
  `scripts/validate-features.mjs`, `scripts/comparar-baseline-rojos.mjs` y
  `tests/baseline-rojos.json`. Despues, correr `./init.sh` **completo** y anotar en
  `progress/impl_QC-15-arquitectura-hexagonal-y-modulos.md`: la salida literal, el numero de
  tests, y **la lista de archivos de test en verde**. Esa lista es el contrato de R18.
- **Si `./init.sh` no sale verde antes de tocar nada: PARAR y avisar al leader.** Una
  reestructuracion sobre una base roja no se puede verificar.
- **Hecho cuando**: el merge esta hecho, `./init.sh` sale verde y la lista de archivos verdes
  esta anotada con su fecha.

## Bloque 1 — Nucleo compartido

### T1 — [x] Crear `lib/shared/` y mover lo que no pertenece a ningun modulo
- **Depende de**: T0.
- **Que** (`design.md > 3`, filas 1, 3, 4, 5, 8c):
  1. `git mv lib/prisma.ts lib/shared/db/prisma.ts`
  2. `git mv lib/utils/initials.ts lib/shared/ui/initials.ts`
  3. `git mv lib/utils/sidebar-state.ts lib/shared/ui/sidebar-state.ts`
  4. `git mv lib/navigation/private-nav.ts lib/shared/navigation/private-nav.ts`
  5. crear `lib/shared/routes.ts` con `DASHBOARD_ROUTE` y `FORGOT_PASSWORD_ROUTE` **copiados
     literalmente** de `lib/types/auth.ts` (con sus comentarios), y borrarlos de ahi.
  6. reescribir todos los importadores: `app/(private)/layout.tsx`,
     `app/(public)/login/page.tsx`, `components/private/{app-sidebar,nav-user}.tsx`,
     `tests/helpers/viewport.ts`, `tests/unit/{initials,private-layout,nav-user,app-sidebar,sidebar-desktop,sidebar-mobile}`,
     `tests/integration/identity-constraints.int.test.ts`, `lib/types/auth.ts` (ya no
     declara rutas), `lib/navigation/private-nav.ts` (ahora importa `../routes`).
  - **No se toca `lib/utils.ts`** (R6): lo fija `components.json`.
- **Hecho cuando**: `pnpm run typecheck`, `pnpm run lint` y `pnpm test` en verde; `lib/prisma.ts`
  y `lib/navigation/` ya no existen y en `lib/utils/` solo queda `password-hash.ts` (se va en T3).

## Bloque 2 — Modulo `identity`

### T2 — [x] Dominio y contrato de `identity`
- **Depende de**: T1.
- **Que** (`design.md > 3`, filas 6, 7, 8a, 9, 15):
  1. `git mv lib/types/session.ts lib/modules/identity/domain/session-user.ts`
  2. `git mv lib/types/identity.ts lib/modules/identity/domain/document-type.ts`
  3. `git mv lib/services/login-stub.ts lib/modules/identity/domain/verify-credentials.ts`
  4. crear `lib/modules/identity/domain/credentials.ts` con `CREDENTIAL_MAX_LENGTH`,
     `loginInputSchema` y `LoginInput` movidos **literalmente** desde `lib/types/auth.ts`.
  5. crear `lib/modules/identity/index.ts` exactamente como en `design.md > 4`.
  6. reescribir importadores (`lib/actions/login.ts`, `lib/services/session-stub.ts`,
     `components/private/*`, tests) para que usen **el barrel** `@/lib/modules/identity`,
     nunca una ruta profunda.
  7. mover los tests de dominio: `tests/unit/{login-action,logout-action,password-max-length}.test.ts`,
     `tests/unit/password/**`, `tests/unit/schema/**` -> `tests/unit/identity/...`; y
     `tests/integration/identity-constraints.int.test.ts` ->
     `tests/integration/identity/`.
- **Ojo**: `verify-credentials.ts` se mueve **tal cual**, devolviendo `{ ok: false }`. No es
  un olvido, es QC-7.
- **Hecho cuando**: typecheck, lint y `pnpm test` en verde; `lib/types/{session,identity}.ts`
  y `lib/services/login-stub.ts` ya no existen; ningun archivo importa
  `@/lib/modules/identity/domain/...` desde fuera del modulo.

### T3 — [x] Puertos y adaptadores driven
- **Depende de**: T2.
- **Que** (`design.md > 3` filas 10, 11 y `> 7`):
  1. `git mv lib/utils/password-hash.ts lib/modules/identity/adapters/driven/security/password-hash.ts`
     (si el directorio `lib/utils/` ya quedo vacio en T1, esta es la ultima pieza).
  2. `git mv lib/services/session-stub.ts lib/modules/identity/adapters/driven/session/session-stub.ts`
  3. crear `ports/password-hasher.ts` y `ports/session-provider.ts` con las interfaces de
     `design.md > 7`, **derivadas de las firmas existentes**, y anotar en cada adaptador que
     las cumple.
  4. **Actualizar `tests/guards/guard-password-hash-module.test.ts`**: la ruta vigilada pasa
     a `lib/modules/identity/adapters/driven/security/password-hash.ts`. No se toca ninguna
     de sus reglas ni de sus autocomprobaciones.
  5. **Actualizar `IN_TRANSIT_ALLOWLIST` de `tests/guards/guard-password-never-plaintext.test.ts`**:
     `lib/actions/login.ts` -> `lib/modules/identity/adapters/driving/login-action.ts` (ruta
     futura de T5) y `lib/types/auth.ts` -> `lib/modules/identity/domain/credentials.ts`. Los
     casos sinteticos (`lib/services/otro.ts`, `db/schema.prisma`, `scripts/seed.ts`) se
     conservan **sin tocar**.
  6. reescribir importadores (`app/(private)/layout.tsx` sigue llamando a `getSessionUser`
     por ahora; se corrige en T5).
- **Verificacion obligatoria, no asumible**: correr `pnpm run test:guardias` y comprobar que
  las dos guardias tocadas **siguen encontrando archivos** (no "0 tests" ni un barrido
  vacio). Un verde por no mirar nada es el riesgo 2 de `design.md > 12`.
- **Hecho cuando**: typecheck, lint, `pnpm test` y `pnpm run test:guardias` en verde, con la
  evidencia de las dos guardias anotada.

### T4 — [x] Punto unico de composicion
- **Depende de**: T3.
- **Que**: crear `lib/composition/index.ts` tal cual `design.md > 6.1`. Todavia no lo consume
  nadie: esta task solo introduce el archivo y su cableado.
- **Hecho cuando**: typecheck y lint en verde, y `lib/composition/index.ts` no importa nada
  de `adapters/driving/` (R12).

### T5 — [x] Adaptadores driving y reconexion de la UI
- **Depende de**: T4. **Es la task de mas riesgo de la feature** (riesgo 1 de `design.md > 12`).
- **Que** (`design.md > 3` filas 8b, 12, 13 y `> 6.2`):
  1. `git mv lib/actions/login.ts lib/modules/identity/adapters/driving/login-action.ts`
  2. `git mv lib/actions/logout.ts lib/modules/identity/adapters/driving/logout-action.ts`
  3. crear `adapters/driving/login-form-state.ts` con `LoginFormState`, `LOGIN_INITIAL_STATE`,
     `GENERIC_CREDENTIALS_ERROR`, `REQUIRED_FIELD_ERROR` y `PASSWORD_TOO_LONG_ERROR` movidos
     **literalmente** de `lib/types/auth.ts`; borrar `lib/types/auth.ts`.
  4. las dos acciones pasan a consumir `identity` desde `@/lib/composition` (llamada
     `identity.verifyCredentials(...)` / `identity.endSession()`); **el resto del cuerpo no se
     toca**, incluido el `redirect()` fuera de todo `try/catch`.
  5. `app/(private)/layout.tsx` pasa a `import { identity } from '@/lib/composition'` y
     `identity.getSessionUser()`.
  6. reescribir imports de UI: `app/(public)/login/components/login-form.tsx`,
     `components/private/nav-user.tsx`.
  7. **actualizar los 11 `vi.mock` uno a uno** segun la tabla de `design.md > 6.2`.
- **Verificacion obligatoria, no asumible**: para `tests/unit/identity/logout-action.test.ts`
  —que no afirma sobre un valor de retorno— comprobar **a mano** que el spy del mock recibe la
  llamada (un `vi.mock` a un modulo que ya no existe **no falla en Vitest**, simplemente no
  mockea). Anotar la evidencia.
- **Hecho cuando**: typecheck, lint y `pnpm test` en verde con **el mismo conjunto de
  archivos verdes que T0**; `lib/actions/` y `lib/types/` ya no existen.

### T6 — [x] [P] Cerrar las carpetas horizontales
- **Depende de**: T5.
- **Que**: comprobar y dejar constancia de que no existen `lib/actions/`, `lib/services/`,
  `lib/repositories/`, `lib/interfaces/`, `lib/types/`, `lib/navigation/` ni el **directorio**
  `lib/utils/`, y que en la raiz de `lib/` solo quedan `modules/`, `shared/`, `composition/`
  y `utils.ts` (R5, R6). Borrar restos vacios.
- **Hecho cuando**: `ls lib` devuelve exactamente esos cuatro nombres y el gate sigue verde.

### T7 — [x] [P] Slot del modulo `inventario`
- **Depende de**: T5.
- **Que**: crear `lib/modules/inventario/index.ts` (`export {}` mas un comentario que diga
  que es el slot de QC-14 y remita a `docs/architecture.md`) y los `.gitkeep` de
  `domain/`, `ports/`, `adapters/driven/`, `adapters/driving/`.
- **Hecho cuando**: typecheck y lint en verde y el arbol coincide con `design.md > 2`.

### T8 — [x] [P] Propiedad de modelos en el esquema
- **Depende de**: T5.
- **Que**: añadir `/// @module identity` sobre `DocumentType`, `Role` y `User` en
  `db/schema.prisma`. **Nada mas**: ni campo, ni indice, ni migracion.
- **Hecho cuando**: `tests/unit/identity/schema/*` siguen en verde sin tocarlos (prueba de que
  el comentario no altera el contrato del esquema) y `git diff db/` son solo tres lineas.

## Bloque 3 — Lo que hace cumplir la regla

### T9 — [x] La guardia ejecutable de arquitectura
- **Depende de**: T6, T7, T8.
- **Que**: `tests/guards/guard-arquitectura-modulos.test.ts` con los doce bloques de
  `design.md > 11`, siguiendo el patron del repo: `findRepoRoot`, funciones puras exportadas,
  barrido del arbol. Incluye el resolvedor transitivo de imports que necesita el bloque 6.
- **Requisito de la propia guardia (R21)**: cada bloque incluye, ademas de la asercion sobre
  el repo, **al menos un caso sintetico que la viola** y demuestra que la regla dispara
  (p. ej. `domain/x.ts` con `import { prisma } from '@/lib/shared/db/prisma'`, un
  `index.ts` que reexporta de `./adapters/driving/login-action`, un `app/page.tsx` que
  importa `@/lib/modules/identity/domain/credentials`, un modelo Prisma sin `/// @module`).
  Un `expect(hallazgos).toEqual([])` sobre un repo que ya cumple **no demuestra nada**.
- **Verificacion obligatoria, no asumible**: romper el repo a proposito (por ejemplo, añadir
  temporalmente `import { prisma } from '@/lib/shared/db/prisma'` en
  `lib/modules/identity/domain/credentials.ts`), comprobar que la guardia se pone **roja** y
  con que mensaje, y deshacerlo. Pegar la salida roja en `progress/impl_*.md`. Sin esa
  evidencia la task no esta hecha.
- **Hecho cuando**: `pnpm run test:guardias` en verde, la evidencia del rojo provocado esta
  pegada, y el mensaje de cada hallazgo cita el `R<n>` que incumple.

### T10 — [x] `docs/architecture.md` describe la estructura nueva
- **Depende de**: T9 (la doc describe lo que la guardia ya hace cumplir).
- **Que**: reescribir sobre la version de `dev`:
  1. `## Principios` punto 1: "Controller, Service, Repository" -> arquitectura hexagonal por
     modulos, dependencia hacia adentro.
  2. `## Patron de capas: Controller -> Service -> Repository` -> **`## Modulos y arquitectura
     hexagonal`**: las tres piezas (dominio, puertos, adaptadores), el contrato `index.ts`,
     el punto unico de composicion y la excepcion del barrel sobre `'use server'`.
  3. `## Estructura de carpetas`: el arbol literal de `design.md > 2`.
  4. **Nueva `### La regla de dependencias`**: copiar la tabla de `design.md > 5.1` y decir
     que la hace cumplir `tests/guards/guard-arquitectura-modulos.test.ts`.
  5. `## Stack`: la linea de integraciones externas ya no apunta a `lib/interfaces/external/`
     sino a `lib/modules/<m>/adapters/driven/`.
  6. `## Server Actions vs Route Handlers`: la tabla ya no dice `lib/actions/`.
  7. `## Migraciones up/down`: añadir la regla `/// @module` y que un modelo sin dueño es
     hallazgo.
  8. `## Anti-patrones que el reviewer rechaza`: añadir (a) import desde el dominio hacia
     afuera, (b) import a las tripas de otro modulo saltandose su `index.ts`, (c) cableado de
     adaptadores fuera de `lib/composition/`, (d) acceso con Prisma a un modelo de otro
     modulo, (e) codigo de negocio nuevo colgando de `lib/` en vez de un modulo.
  - `## Componentes` **no se toca** (D4): la convencion de componentes de ruta con barrel
    sigue vigente tal cual.
- **Hecho cuando**: el bloque 12 de la guardia (R19) pasa, y una lectura del documento no
  deja ninguna mencion a `lib/services/`, `lib/repositories/`, `lib/interfaces/` o
  `lib/actions/` como ruta vigente.

## Bloque 4 — Cierre

### T11 — [x] Gate completo, build y trazabilidad
- **Depende de**: T10.
- **Que**:
  1. `./init.sh` completo. El conjunto de archivos verdes debe ser **el mismo de T0** (R18);
     `tests/baseline-rojos.json` sigue vacio.
  2. `pnpm run build` — no lo cubre la suite y es lo unico que caza que el contrato de un
     modulo arrastre servidor al cliente (riesgo 5).
  3. Completar el mapa `R<n> -> test` en
     `progress/impl_QC-15-arquitectura-hexagonal-y-modulos.md`.
- **Hecho cuando**: las tres cosas estan hechas y pegadas como evidencia. Solo entonces se
  abre el PR.

---

## Trazabilidad `R<n> -> test`

| Req | Test que lo cierra |
| --- | --- |
| R1 | `tests/guards/guard-arquitectura-modulos.test.ts` — bloque 1 ("todo modulo tiene contrato y las tres carpetas") |
| R2 | idem — bloque 1 ("una carpeta ajena a domain/ports/adapters es hallazgo") |
| R3 | `tests/unit/identity/**` + `tests/integration/identity/**` completos en verde desde sus rutas nuevas |
| R4 | guardia — bloque 1 ("existen los modulos identity e inventario") |
| R5 | guardia — bloque 2 ("no hay carpetas horizontales en lib/") |
| R6 | guardia — bloque 3 ("lib/utils.ts existe y exporta cn") |
| R7 | guardia — bloque 4 ("el dominio no importa framework, DB, adaptadores ni composicion") |
| R8 | guardia — bloque 4 ("el dominio solo importa su modulo y la allowlist de paquetes puros") |
| R9 | guardia — bloque 5 ("nadie importa las tripas de otro modulo") |
| R10 | guardia — bloque 6 ("el contrato solo reexporta dominio y no arrastra servidor") + `pnpm run build` en T11 |
| R11 | guardia — bloque 7 ("solo la composicion importa adaptadores driven") |
| R12 | guardia — bloque 7 ("la composicion no importa adaptadores driving") |
| R13 | guardia — bloque 8 ("app/components solo consumen contrato, driving o composicion") |
| R14 | guardia — bloque 8 ("un archivo 'use client' no importa composicion ni driven") |
| R15 | guardia — bloque 9 ("lib/shared no importa modulos ni composicion") |
| R16 | guardia — bloque 10 ("todo modelo declara `@module` y solo su dueño lo consulta") |
| R17 | guardia — bloque 11 ("el cliente Prisma solo se importa desde adaptadores driven") |
| R18 | `./init.sh` completo en T11 comparado contra la lista de archivos verdes de T0 + `tests/baseline-rojos.json` vacio |
| R19 | guardia — bloque 12 ("docs/architecture.md describe la estructura vigente") |
| R20 | `pnpm run test:guardias` selecciona `guard-arquitectura-modulos` (patron `guard`) — evidencia en T9 |
| R21 | Los casos sinteticos de cada bloque de la guardia + el rojo provocado y pegado en T9 |

---

## Archivos esperados

Para la validacion de conflictos del leader (`AGENTS.md > Paralelismo`). Esta feature es
**bloqueante y toca casi todo el arbol**: no debe correr en paralelo con ninguna otra.

**Creados**
```
lib/modules/identity/index.ts
lib/modules/identity/domain/{session-user,document-type,credentials,verify-credentials}.ts
lib/modules/identity/ports/{password-hasher,session-provider}.ts
lib/modules/identity/adapters/driven/security/password-hash.ts
lib/modules/identity/adapters/driven/session/session-stub.ts
lib/modules/identity/adapters/driving/{login-action,logout-action,login-form-state}.ts
lib/modules/inventario/index.ts
lib/modules/inventario/{domain,ports,adapters/driven,adapters/driving}/.gitkeep
lib/composition/index.ts
lib/shared/routes.ts
lib/shared/db/prisma.ts
lib/shared/navigation/private-nav.ts
lib/shared/ui/{initials,sidebar-state}.ts
tests/guards/guard-arquitectura-modulos.test.ts
progress/impl_QC-15-arquitectura-hexagonal-y-modulos.md
```

**Borrados** (movidos)
```
lib/prisma.ts  lib/utils/{initials,sidebar-state,password-hash}.ts
lib/navigation/private-nav.ts  lib/types/{auth,session,identity}.ts
lib/services/{login-stub,session-stub}.ts  lib/actions/{login,logout}.ts
tests/unit/{login-action,logout-action,password-max-length}.test.ts
tests/unit/password/*  tests/unit/schema/*
tests/integration/identity-constraints.int.test.ts
```

**Modificados**
```
app/(private)/layout.tsx
app/(public)/login/page.tsx
app/(public)/login/components/login-form.tsx
components/private/{app-sidebar,nav-user}.tsx
db/schema.prisma                       (solo 3 lineas de comentario)
docs/architecture.md
tests/guards/{guard-password-hash-module,guard-password-never-plaintext}.test.ts
tests/helpers/viewport.ts
tests/unit/{initials.test.ts,app-sidebar,nav-user,private-layout,login-form,sidebar-desktop,sidebar-mobile}.test.tsx
tests/ui/login-form-uncontrolled-warning.test.tsx
```

**Intocables en esta feature**: `lib/utils.ts`, `components/ui/**`, `hooks/**`,
`components.json`, `tsconfig.json`, `vitest.config.mts`, `eslint.config.mjs`,
`package.json`, `db/migrations/**`, `app/(private)/components/**`,
`app/(public)/login/components/submit-button.tsx`.
