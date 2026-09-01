# QC-15 — arquitectura-hexagonal-y-modulos · design.md

Feature bloqueante (`feature_list.json`: QC-6, QC-7, QC-8, QC-9, QC-12, QC-13 y QC-14
dependen de ella). Zona `fullstack`, `sdd: true`.

**Base de partida.** El worktree esta por detras de `dev`: le faltan, como minimo,
`docs/architecture.md > Dependencias de terceros`, `docs/dependencias.md`,
`scripts/validate-features.mjs`, `scripts/comparar-baseline-rojos.mjs` y
`tests/baseline-rojos.json`. **Todo este diseño se aplica sobre `dev` ya integrado**
(tarea T0). Las rutas y contenidos citados de `docs/architecture.md` son los de `dev`.

---

## 1. Las cuatro decisiones cerradas

### D1 — La raiz de los modulos es `lib/modules/<modulo>/`, no un `src/` nuevo

**Elegido:** `lib/modules/<modulo>/`. `app/`, `components/`, `hooks/`, `db/`, `tests/` y
`scripts/` se quedan donde estan.

**Por que.** Un `src/` no aporta ninguna frontera que `lib/modules/` no de, y su coste no es
teorico. Mover `app/` dentro de `src/` obliga a tocar, como minimo:

| Archivo | Que habria que cambiar | Riesgo |
| --- | --- | --- |
| `tsconfig.json` | `paths: { "@/*": ["./*"] }` -> `["./src/*"]` mas `include` | Alias roto en ~40 imports a la vez |
| `components.json` | los cinco alias (`components`, `utils`, `ui`, `lib`, `hooks`) | El siguiente `shadcn add` escribe en la ruta vieja si queda mal |
| `vitest.config.mts` | `rootDir` del alias y los `include` de los dos proyectos | La suite entera deja de resolver `@/` |
| `eslint.config.mjs` | ignores y raiz | — |
| `tests/guards/guard-password-never-plaintext.test.ts` | `SCANNED_DIRS = ['db','lib','app','scripts']` | **La guardia dejaria de barrer nada y saldria verde en falso** |
| `next.config.ts` / App Router | Next admite `src/app`, pero la deteccion cambia | Rutas 404 hasta acertar |

Esa ultima fila es la que decide: una guardia que sigue verde porque ya no mira donde hay
que mirar es peor que no tenerla. Con `lib/modules/`, `SCANNED_DIRS` sigue siendo correcta
sin tocarla, y el alias `@/` no se mueve.

**Que se rompe con la opcion elegida** (y como se paga): `lib/` queda con dos naturalezas
—modulos e infraestructura compartida—. Se acota por regla, no por buena voluntad: en la
raiz de `lib/` solo pueden existir `modules/`, `shared/`, `composition/` y `utils.ts`
(fijado por `components.json`). La guardia lo comprueba (R5, R6).

**Alternativa descartada:** `src/` con `src/modules/`, `src/app/`, `src/shared/`. Es la
disposicion mas comun del ecosistema y separa codigo de configuracion de un vistazo. Se
descarta porque paga seis archivos de configuracion y un falso verde en una guardia para
comprar una carpeta de nombre mas bonito: la frontera real la crea la regla de dependencias,
no el prefijo de la ruta.

### D2 — Un solo `db/schema.prisma`; la frontera de modulo llega a la persistencia por propiedad de modelo, no por archivo

**Elegido:** el esquema sigue siendo un unico `db/schema.prisma`, con `db/migrations/`
compartido. Cada modelo declara su modulo propietario con un comentario de documentacion
`/// @module <modulo>`, y **solo los adaptadores driven de ese modulo pueden consultarlo**
(R16). Los tres modelos de hoy (`DocumentType`, `Role`, `User`) quedan marcados
`/// @module identity`.

**Verificacion de la opcion multiarchivo (obligatoria antes de proponerla).** Prisma
instalado: `6.19.3` (`package.json` y `node_modules/.pnpm/prisma@6.19.3_typescript@5.9.3`).
El bundle del CLI (`prisma/build/index.js`) contiene el cargador `loadSchemaFiles`, y ya no
contiene la cadena `prismaSchemaFolder`, lo que es coherente con que el troceado de esquema
dejo de ser preview y esta disponible sin bandera. **Conclusion: la version del repo SI lo
soporta**, asi que se descarta por diseño, no por imposibilidad.

**Por que se descarta igualmente.**

1. **Partir el archivo no parte la propiedad.** Sigue habiendo una sola base, un solo
   `datasource`, un solo historial de migraciones y un solo `migration_lock.toml`. Dos
   modulos que tocan la misma tabla siguen tocandola; lo unico que cambia es en que archivo
   esta escrita.
2. **Rompe herramienta existente.** `package.json > prisma.schema` pasaria a apuntar a un
   **directorio**, y todo lo que hoy lee el esquema como texto en una ruta fija —
   `tests/unit/schema/identity-schema.test.ts` (`join(repoRoot,'db','schema.prisma')`) y
   `tests/guards/guard-password-never-plaintext.test.ts`— habria que reescribirlo. Eso choca
   con la restriccion de no tocar aserciones (R18).
3. **En un ERP las FK cruzan modulos por definicion.** `inventario` referenciara `users`
   para auditoria (`docs/architecture.md > Dominio`, punto 3). Prisma exige que ambos
   modelos vivan en el mismo `datasource` de todos modos.
4. **La regla que si sirve es verificable sin partir nada:** "solo el propietario consulta
   sus modelos" se comprueba leyendo el `/// @module` del esquema y buscando
   `prisma.<modelo>` en los adaptadores driven. Es exactamente lo que hace la guardia.

**Alternativa descartada:** `db/schema/` multiarchivo (`identity.prisma`,
`inventario.prisma`, `datasource.prisma`), soportada por la version instalada. Descartada
por 1-3.

### D3 — La guardia la hace cumplir un test propio en `tests/guards/`, no una regla de ESLint

**Elegido:** `tests/guards/guard-arquitectura-modulos.test.ts`, en la linea de las tres
guardias que ya existen. **Cero dependencias nuevas.**

**Por que.**

1. **Cobertura.** De las quince reglas que exige `requirements.md`, `import/no-restricted-paths`
   solo expresa las de ruta a ruta (R7, R9, R13, R15). No expresa R10 (el contrato no puede
   arrastrar `next` o Prisma **transitivamente**), R14 (depende de la directiva `'use client'`
   del archivo), R16 (cruza `db/schema.prisma` con codigo TypeScript), R19 (revisa un `.md`)
   ni R2/R5 (existencia/ausencia de carpetas). Con ESLint harian falta **igualmente** una
   guardia para el resto; entonces habria dos mecanismos y dos sitios donde mirar.
2. **Cuando corre.** Da igual: `./init.sh --rapido` corre lint **y** todas las guardias
   siempre (`docs/verification.md`). No hay ventaja de ejecucion en ninguna de las dos.
3. **Dependencia.** `eslint-plugin-import` / `eslint-plugin-boundaries` no estan declarados
   en `package.json`. `eslint-plugin-import@2.32.0` aparece en el store de pnpm arrastrado
   por `eslint-config-next`, pero **apoyarse en una dependencia transitiva es exactamente lo
   que se rompe en silencio** al subir Next. Habria que declararla, y eso abre la puerta de
   `docs/architecture.md > Dependencias de terceros`: los cuatro checks de salud (no
   deprecated, release en 12 meses, >=10.000 descargas/semana, licencia permisiva) **no se
   pueden verificar desde aqui, porque el gate corre sin red**; segun esa misma seccion, no
   verificable no es un si, es un desconocido. Un desconocido no bloquea el spec si no hace
   falta la libreria — y no hace falta.
4. **Mensajes.** La guardia puede decir `lib/modules/identity/domain/x.ts importa
   @prisma/client (R7)`, con el numero de requisito. Es lo que el reviewer necesita.

**Propuesta de dependencia nueva: ninguna.** Esta feature no instala nada.

**Alternativa descartada:** `eslint-plugin-boundaries` con `boundaries/element-types`. Es la
herramienta canonica y da autofix en el editor. Descartada por 1 y 3: cubre dos tercios de
las reglas, obliga a una dependencia cuya salud no se puede acreditar sin red, y dejaria el
sistema con la regla partida entre `eslint.config.mjs` y una guardia.

### D4 — `components/` y `hooks/` se quedan fuera de la modularizacion

**Elegido:** `components/ui/`, `components/shared/`, `components/private/` y `hooks/` no se
mueven. La convencion vigente de componentes de ruta en `<ruta>/components/` con barrel
`index.ts` (`docs/architecture.md > Componentes`) **no se toca**.

**Por que.**

1. `components/ui/` y `hooks/use-mobile.ts` son **generados por shadcn** y sus rutas estan
   fijadas en `components.json` (`"ui": "@/components/ui"`, `"hooks": "@/hooks"`). Moverlos
   significa que el proximo `shadcn add` recrea la carpeta vieja.
2. La UI no pertenece a un modulo: `AppSidebar` pinta navegacion de `inventario`, `compras`
   y `produccion` a la vez. Meterla en uno de ellos seria mentir sobre su dueño.
3. Lo que si hacia falta —que un componente no meta la mano en las tripas de un modulo— se
   consigue con la regla de dependencias (R13, R14), no moviendo archivos.

**Lo que si cambia en `components/`:** solo las rutas de import (`@/lib/types/session` ->
`@/lib/modules/identity`, `@/lib/actions/logout` -> el adaptador driving, `@/lib/utils/initials`
-> `@/lib/shared/ui/initials`). Ningun archivo de `components/` se mueve ni cambia de
comportamiento.

**Alternativa descartada:** llevar `components/private/*` a
`lib/modules/<m>/adapters/driving/components/`. Descartada porque hoy **ningun** componente
privado pertenece a un solo modulo, y porque romperia el contrato de shadcn sin comprar
frontera alguna. Si algun dia aparece el caso, se decide entonces (pregunta abierta 3).

---

## 2. Arbol de carpetas destino (literal y completo)

```
app/                                          # SIN CAMBIOS de ubicacion (solo imports)
  layout.tsx
  page.tsx
  (public)/
    layout.tsx
    login/
      page.tsx
      components/{index.ts,login-form.tsx,submit-button.tsx}
  (private)/
    layout.tsx
    components/{index.ts,sidebar-toggle.tsx}

components/                                   # SIN CAMBIOS (D4)
  ui/**                                       # shadcn, ruta fijada por components.json
  private/{app-sidebar.tsx,nav-user.tsx,logout-menu-item.tsx}
hooks/use-mobile.ts                           # SIN CAMBIOS (D4)

lib/
  utils.ts                                    # `cn`. NO se mueve: components.json lo fija (R6)

  modules/
    identity/
      index.ts                                # CONTRATO: solo reexporta de ./domain/**
      domain/
        session-user.ts                       # tipo SessionUser
        document-type.ts                      # DOCUMENT_TYPE_CC, DOCUMENT_TYPE_CODES, DocumentTypeCode
        credentials.ts                        # CREDENTIAL_MAX_LENGTH, loginInputSchema, LoginInput
        verify-credentials.ts                 # caso de uso (hoy stub de QC-7)
      ports/
        password-hasher.ts                    # interface PasswordHasher
        session-provider.ts                   # interface SessionProvider
      adapters/
        driven/
          security/password-hash.ts           # bcryptjs; implementa PasswordHasher
          session/session-stub.ts             # implementa SessionProvider (stub de QC-8)
        driving/
          login-action.ts                     # 'use server'
          logout-action.ts                    # 'use server'
          login-form-state.ts                 # LoginFormState + copy de errores (sin 'use server')
    inventario/
      index.ts                                # `export {}` + comentario: slot de QC-14
      domain/.gitkeep
      ports/.gitkeep
      adapters/driven/.gitkeep
      adapters/driving/.gitkeep

  composition/
    index.ts                                  # PUNTO UNICO DE COMPOSICION

  shared/                                     # nucleo compartido: HOJA del grafo (R15)
    routes.ts                                 # DASHBOARD_ROUTE, FORGOT_PASSWORD_ROUTE
    db/prisma.ts                              # instancia unica de PrismaClient
    navigation/private-nav.ts                 # navegacion de la zona privada (placeholder)
    ui/initials.ts
    ui/sidebar-state.ts

db/                                           # SIN CAMBIOS de ubicacion
  schema.prisma                               # + `/// @module identity` en los 3 modelos
  migrations/20260806122638_users_and_roles/{migration.sql,down.sql}
  migrations/migration_lock.toml

tests/
  setup.ts  globals.d.ts  helpers/viewport.ts
  guards/
    guard-arquitectura-modulos.test.ts        # NUEVO
    guard-password-hash-module.test.ts        # ruta vigilada actualizada
    guard-password-never-plaintext.test.ts    # allowlist actualizada
    guard-rls-force.test.ts                   # sin cambios
  unit/
    identity/
      login-action.test.ts
      logout-action.test.ts
      password-max-length.test.ts
      password/{password-hash.test.ts,password-verify-fail-closed.test.ts}
      schema/{identity-schema.test.ts,identity-migration.test.ts}
    initials.test.ts  app-sidebar.test.tsx  nav-user.test.tsx
    private-layout.test.tsx  login-form.test.tsx
    sidebar-desktop.test.tsx  sidebar-mobile.test.tsx
  integration/identity/identity-constraints.int.test.ts
  ui/{smoke.test.ts,login-form-uncontrolled-warning.test.tsx}
```

`.gitkeep` en `inventario/**` porque git no versiona carpetas vacias; QC-14 los borra al
poner el primer archivo.

## 3. Tabla `de -> a`, archivo por archivo

Toda fila es un `git mv` + reescritura de imports. **Ninguna cambia logica.**

| # | De | A | Nota |
| --- | --- | --- | --- |
| 1 | `lib/prisma.ts` | `lib/shared/db/prisma.ts` | idem contenido |
| 2 | `lib/utils.ts` | *(no se mueve)* | fijado por `components.json` (R6) |
| 3 | `lib/utils/initials.ts` | `lib/shared/ui/initials.ts` | |
| 4 | `lib/utils/sidebar-state.ts` | `lib/shared/ui/sidebar-state.ts` | |
| 5 | `lib/navigation/private-nav.ts` | `lib/shared/navigation/private-nav.ts` | importa `../routes` |
| 6 | `lib/types/identity.ts` | `lib/modules/identity/domain/document-type.ts` | |
| 7 | `lib/types/session.ts` | `lib/modules/identity/domain/session-user.ts` | |
| 8a | `lib/types/auth.ts` (`CREDENTIAL_MAX_LENGTH`, `loginInputSchema`, `LoginInput`) | `lib/modules/identity/domain/credentials.ts` | unico import externo: `zod` |
| 8b | `lib/types/auth.ts` (`LoginFormState`, `LOGIN_INITIAL_STATE`, `GENERIC_CREDENTIALS_ERROR`, `REQUIRED_FIELD_ERROR`, `PASSWORD_TOO_LONG_ERROR`) | `lib/modules/identity/adapters/driving/login-form-state.ts` | DTO del adaptador web |
| 8c | `lib/types/auth.ts` (`DASHBOARD_ROUTE`, `FORGOT_PASSWORD_ROUTE`) | `lib/shared/routes.ts` | no son de identity |
| 9 | `lib/services/login-stub.ts` | `lib/modules/identity/domain/verify-credentials.ts` | hoy es puro; QC-7 le inyecta puertos |
| 10 | `lib/services/session-stub.ts` | `lib/modules/identity/adapters/driven/session/session-stub.ts` | + puerto `ports/session-provider.ts` |
| 11 | `lib/utils/password-hash.ts` | `lib/modules/identity/adapters/driven/security/password-hash.ts` | + puerto `ports/password-hasher.ts` |
| 12 | `lib/actions/login.ts` | `lib/modules/identity/adapters/driving/login-action.ts` | pasa a consumir la composicion |
| 13 | `lib/actions/logout.ts` | `lib/modules/identity/adapters/driving/logout-action.ts` | idem |
| 14 | *(nuevo)* | `lib/composition/index.ts` | |
| 15 | *(nuevo)* | `lib/modules/identity/index.ts` | |
| 16 | *(nuevo)* | `lib/modules/inventario/**` | slot de QC-14 |
| 17 | `tests/unit/login-action.test.ts` | `tests/unit/identity/login-action.test.ts` | |
| 18 | `tests/unit/logout-action.test.ts` | `tests/unit/identity/logout-action.test.ts` | |
| 19 | `tests/unit/password-max-length.test.ts` | `tests/unit/identity/password-max-length.test.ts` | |
| 20 | `tests/unit/password/*.test.ts` | `tests/unit/identity/password/*.test.ts` | |
| 21 | `tests/unit/schema/*.test.ts` | `tests/unit/identity/schema/*.test.ts` | siguen leyendo `db/schema.prisma` |
| 22 | `tests/integration/identity-constraints.int.test.ts` | `tests/integration/identity/identity-constraints.int.test.ts` | |
| 23 | `tests/unit/initials.test.ts`, `*.test.tsx`, `tests/ui/**` | *(no se mueven)* | son de UI, no de un modulo |
| 24 | `tests/guards/*` | *(no se mueven)* | dos actualizan rutas vigiladas |
| 25 | `db/**`, `app/**`, `components/**`, `hooks/**`, `scripts/**` | *(no se mueven)* | solo imports (y `/// @module` en el schema) |

**Carpetas que desaparecen** (R5): `lib/actions/`, `lib/services/`, `lib/types/`,
`lib/navigation/`, `lib/utils/` (el directorio; `lib/utils.ts` se queda).

### 3.1 Archivos que codifican una ruta y hay que tocar aunque no se muevan

Son el punto ciego de esta feature: no fallan al compilar, fallan en ejecucion.

| Archivo | Que codifica | Cambio |
| --- | --- | --- |
| `tests/guards/guard-password-hash-module.test.ts` | `join(repoRoot,'lib','utils','password-hash.ts')` | -> `lib/modules/identity/adapters/driven/security/password-hash.ts` |
| `tests/guards/guard-password-never-plaintext.test.ts` | `IN_TRANSIT_ALLOWLIST` con `lib/actions/login.ts` y `lib/types/auth.ts` | -> las rutas nuevas del adaptador driving y de `domain/credentials.ts` |
| `tests/unit/*.test.ts(x)` | `vi.mock('@/lib/actions/...')`, `vi.mock('@/lib/services/...')` | -> ver 6.2 |
| `tests/helpers/viewport.ts` | `@/lib/utils/sidebar-state` | -> `@/lib/shared/ui/sidebar-state` |

En los tres primeros cambia **la ruta que la asercion vigila**, nunca la propiedad afirmada:
`guard-password-never-plaintext` sigue exigiendo que fuera de la allowlist ningun
identificador de contrasena en claro exista, y sus casos sinteticos
(`'lib/services/otro.ts'`, `'db/schema.prisma'`, `'scripts/seed.ts'`) se conservan tal cual.

## 4. Que publica un modulo hacia afuera

**El contrato es `lib/modules/<modulo>/index.ts`, y solo reexporta simbolos de `./domain/`.**

```ts
// lib/modules/identity/index.ts — CONTRATO PUBLICO del modulo identity.
// Regla: solo reexporta de ./domain. Nada de 'use server', nada de Prisma, nada de next/*.
// Debe poder importarse desde un componente de cliente sin arrastrar servidor (R10).
export type { SessionUser } from './domain/session-user';
export { DOCUMENT_TYPE_CC, DOCUMENT_TYPE_CODES, type DocumentTypeCode } from './domain/document-type';
export { CREDENTIAL_MAX_LENGTH, loginInputSchema, type LoginInput } from './domain/credentials';
export { verifyCredentials } from './domain/verify-credentials';
```

Quien consume `identity` desde fuera ve **esto y nada mas**. No ve `PrismaClient`, ni el
modelo `User`, ni `session-stub`, ni el coste de bcrypt.

**Dos superficies mas, deliberadamente fuera del barrel:**

- **Adaptadores driving** (`adapters/driving/*`): la UI los importa por su ruta exacta
  (`@/lib/modules/identity/adapters/driving/login-action`). **No hay barrel sobre archivos
  `'use server'`**: un barrel mezclaria el DTO puro con dos modulos de servidor y arrastraria
  al cliente lo que no debe. Es una excepcion consciente a la regla de barriles de
  `docs/architecture.md > Componentes`, que habla de componentes de ruta, no de acciones.
- **Puertos** (`ports/*`): son la superficie hacia **adentro**. Los importa el adaptador que
  los implementa y el punto de composicion. Nadie mas.

## 5. La regla de dependencias, escrita como se va a verificar

### 5.1 Tabla origen -> destino

`M` y `N` son modulos distintos. Cada fila es una comprobacion de la guardia.

| Origen | PUEDE importar | NO PUEDE importar | Req |
| --- | --- | --- | --- |
| `lib/modules/M/domain/**` | `lib/modules/M/domain/**`, `lib/modules/M/ports/**`, `@/lib/modules/N` (barrel), paquetes puros (5.2) | `next/*`, `react*`, `@prisma/client`, `@/lib/shared/**`, `@/lib/composition`, `../adapters/**`, `@/app/**`, `@/components/**`, `@/hooks/**`, `@/lib/modules/N/**` (profundo) | R7, R8, R9 |
| `lib/modules/M/ports/**` | igual que `domain` | igual que `domain` | R7, R8 |
| `lib/modules/M/adapters/driven/**` | `../../domain/**`, `../../ports/**`, `@/lib/shared/**`, `@prisma/client`, `@/lib/shared/db/prisma`, SDK externos, `@/lib/modules/N` (barrel) | `@/lib/composition`, `../driving/**`, `@/app/**`, `@/components/**`, `@/lib/modules/N/**` (profundo) | R9, R11, R17 |
| `lib/modules/M/adapters/driving/**` | `@/lib/composition`, `@/lib/modules/M` (barrel), `./` (su propia carpeta), `next/*`, `react*`, `@/lib/shared/**` | `@prisma/client`, `@/lib/shared/db/prisma`, `../driven/**`, `../../domain/**` y `../../ports/**` por ruta profunda (usa el barrel), `@/lib/modules/N/**` (profundo) | R9, R11, R17 |
| `lib/composition/**` | `@/lib/modules/*` (barrel), `@/lib/modules/*/ports/**`, `@/lib/modules/*/adapters/driven/**`, `@/lib/shared/**` | `@/lib/modules/*/adapters/driving/**`, `@/app/**`, `@/components/**` | R12 |
| `lib/shared/**` | paquetes npm, otros `@/lib/shared/**` | `@/lib/modules/**`, `@/lib/composition` | R15 |
| `app/**` (servidor) | `@/lib/composition`, `@/lib/modules/M` (barrel), `@/lib/modules/M/adapters/driving/**`, `@/lib/shared/**`, `@/components/**`, `@/hooks/**` | `@/lib/modules/M/domain/**`, `.../ports/**`, `.../adapters/driven/**` | R13 |
| `components/**`, `hooks/**`, y cualquier archivo con `'use client'` | `@/lib/modules/M` (barrel), `@/lib/modules/M/adapters/driving/**`, `@/lib/shared/ui/**`, `@/lib/shared/routes`, `@/lib/utils` | ademas de lo anterior: `@/lib/composition` y `@/lib/shared/db/**` | R13, R14 |
| `tests/**`, `scripts/**` | todo | — | exentos |

**Direccion, en una frase:** hacia adentro. `app/components -> composition -> adapters
driven -> ports -> domain`, y `domain` no mira a nadie.

### 5.2 Lista de paquetes puros admitidos en `domain/` y `ports/`

Hoy: **`zod`** y nada mas. Se admite porque no es framework ni acceso a datos, es una
funcion pura de validacion, y `docs/architecture.md > Principios` ya lo exige en el borde;
mantener dos vocabularios de tipos (zod fuera, a mano dentro) duplicaria el modelo. La lista
vive en una constante exportada de la guardia; ampliarla es un cambio visible en el diff.

### 5.3 Propiedad de modelos Prisma (R16)

En `db/schema.prisma`, encima de cada modelo:

```prisma
/// @module identity
model User { ... }
```

La guardia: extrae los pares `(modelo, modulo)` del esquema; extrae el nombre del cliente
Prisma en cada archivo de `lib/modules/*/adapters/driven/**` buscando `prisma.<modelo>` (con
la primera letra en minuscula, como genera Prisma); y falla si el modulo del archivo no es
el propietario. Hoy no hay ni un solo acceso a Prisma en codigo de modulo, asi que la regla
nace verde y se prueba con fuentes sinteticos (R21). Un modelo sin `/// @module` tambien es
hallazgo: es lo que evita que QC-14 añada tablas sin dueño.

## 6. Punto unico de composicion

### 6.1 Donde vive y que hace

`lib/composition/index.ts`. Es el **unico** archivo (fuera de `tests/` y `scripts/`) que
importa adaptadores driven y los ata al dominio.

```ts
// lib/composition/index.ts — PUNTO UNICO DE COMPOSICION.
// Aqui, y solo aqui, se elige QUE implementacion concreta cumple cada puerto.
// Prohibido importar adaptadores driving desde aqui: la flecha va driving -> composicion (R12).
import { verifyCredentials } from '@/lib/modules/identity';
import {
  createPasswordHash,
  verifyPasswordHash,
} from '@/lib/modules/identity/adapters/driven/security/password-hash';
import {
  endSession,
  getSessionUser,
} from '@/lib/modules/identity/adapters/driven/session/session-stub';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';
import type { SessionProvider } from '@/lib/modules/identity/ports/session-provider';

const passwordHasher: PasswordHasher = { hash: createPasswordHash, verify: verifyPasswordHash };
const sessionProvider: SessionProvider = { getSessionUser, endSession };

/** Fachada del modulo `identity` ya cableada. Es lo que consumen acciones, rutas y layouts. */
export const identity = {
  verifyCredentials,
  passwordHasher,
  ...sessionProvider,
} as const;
```

Cuando QC-7 conecte la verificacion real, `verifyCredentials` pasara a ser una fabrica
(`createVerifyCredentials({ users, passwordHasher })`) y **el unico archivo que cambia es
este**: ni la Server Action ni el layout se enteran. Esa es la prueba de que el punto de
composicion esta bien puesto.

### 6.2 Como lo consume una Server Action, una ruta o un layout

```ts
// lib/modules/identity/adapters/driving/login-action.ts
'use server';
import { redirect } from 'next/navigation';
import { identity } from '@/lib/composition';
import { loginInputSchema } from '@/lib/modules/identity';
import { DASHBOARD_ROUTE } from '@/lib/shared/routes';
import { GENERIC_CREDENTIALS_ERROR, /* ... */ type LoginFormState } from './login-form-state';

export async function loginAction(prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  /* cuerpo IDENTICO al actual; solo cambia `verifyCredentials(...)` por
     `identity.verifyCredentials(...)` y las rutas de import */
}
```

```tsx
// app/(private)/layout.tsx  (Server Component)
import { identity } from '@/lib/composition';
const user = await identity.getSessionUser();
```

Una **route handler** de `app/api/**` lo consumiria igual: `import { identity } from
'@/lib/composition'`. Un componente de cliente **nunca** importa la composicion (R14): recibe
datos por props y llama a la Server Action por su ruta.

**Efecto en los mocks de tests** (cambia el objetivo del `vi.mock`, no la asercion):

| Test | Antes | Despues |
| --- | --- | --- |
| `unit/identity/login-action.test.ts` | `vi.mock('@/lib/services/login-stub')` | `vi.mock('@/lib/composition', () => ({ identity: { verifyCredentials: ... } }))` |
| `unit/identity/password-max-length.test.ts` | idem | idem |
| `unit/identity/logout-action.test.ts` | `vi.mock('@/lib/services/session-stub')` | `vi.mock('@/lib/composition', () => ({ identity: { endSession: ... } }))` |
| `unit/private-layout.test.tsx` | `vi.mock('@/lib/services/session-stub')` + `vi.mock('@/lib/actions/logout')` | `vi.mock('@/lib/composition')` + `vi.mock('@/lib/modules/identity/adapters/driving/logout-action')` |
| `unit/nav-user.test.tsx`, `app-sidebar`, `sidebar-*` | `vi.mock('@/lib/actions/logout')` | `vi.mock('@/lib/modules/identity/adapters/driving/logout-action')` |
| `ui/login-form-uncontrolled-warning.tsx`, `unit/login-form.test.tsx` | `vi.mock('@/lib/actions/login')` | `vi.mock('@/lib/modules/identity/adapters/driving/login-action')` |

## 7. Puertos declarados en esta feature

```ts
// lib/modules/identity/ports/password-hasher.ts
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, storedHash: string): Promise<boolean>;
}
```

```ts
// lib/modules/identity/ports/session-provider.ts
import type { SessionUser } from '../domain/session-user';
export interface SessionProvider {
  getSessionUser(): Promise<SessionUser>;
  endSession(): Promise<void>;
}
```

Ambos describen exactamente las firmas que ya existen: los puertos se escriben **a partir**
del codigo actual, no al reves. Si al escribirlos hiciera falta cambiar una firma, es señal
de alcance nuevo y se para (restriccion 1 del encargo).

## 8. Modelo de datos, RLS y migraciones

**No hay cambios de modelo de datos en esta feature.** Ni tabla nueva, ni columna, ni
indice, ni migracion, ni policy. El unico cambio en `db/` son los comentarios
`/// @module identity` sobre los tres modelos. `///` es comentario de documentacion de
Prisma: no altera el SQL generado, y los tests que leen el esquema como texto ya quitan los
comentarios de linea antes de juzgarlo (`identity-schema.test.ts > stripComments`), asi que
no pueden verse afectados. `guard-rls-force` no se toca porque `db/migrations/**` no se toca.

## 9. Rutas, endpoints y contratos de I/O

Ninguno nuevo. Las rutas de Next (`/`, `/login`, y el layout privado) no cambian ni de path
ni de render. Los contratos de I/O existentes se conservan **byte a byte** en su forma:
`loginAction(prevState, formData) => LoginFormState`, `logoutAction() => void`,
`getSessionUser() => SessionUser`, `verifyCredentials(LoginInput) => { ok: boolean }`,
`createPasswordHash`, `verifyPasswordHash`. Cambia donde viven, no que hacen.

## 10. Integraciones externas

Ninguna. Unica dependencia externa tocada: `bcryptjs`, que pasa de `lib/utils/` a ser un
detalle encapsulado en un adaptador driven detras del puerto `PasswordHasher`. Ese es,
literalmente, el ejemplo de lo que la feature persigue: el dominio dejara de saber que existe
bcrypt.

## 11. La guardia: que comprueba y como

`tests/guards/guard-arquitectura-modulos.test.ts`. Sigue el patron de las guardias que ya
hay: `findRepoRoot`, barrido del arbol, funciones puras exportadas, y **cada regla probada
sobre un fuente sintetico que la viola** (R21).

| # | Bloque | Que hace | Req |
| --- | --- | --- | --- |
| 1 | Forma del modulo | todo `lib/modules/<m>/` tiene `index.ts` y solo carpetas `domain`/`ports`/`adapters`; existen `identity` e `inventario` | R1, R2, R4 |
| 2 | Carpetas horizontales | no existen `lib/{actions,services,repositories,interfaces,types,navigation}` ni el dir `lib/utils` | R5 |
| 3 | Alias de shadcn | `lib/utils.ts` existe y exporta `cn` | R6 |
| 4 | Pureza del dominio | ningun import prohibido en `domain/**` ni `ports/**`; allowlist de paquetes puros | R7, R8 |
| 5 | Frontera entre modulos | ningun import a `@/lib/modules/<otro>/<algo>` | R9 |
| 6 | Contrato limpio | `index.ts` solo reexporta de `./domain`; cierre **transitivo** de sus imports sin `next/*`, `@prisma/client` ni `'use server'` | R10 |
| 7 | Composicion unica | solo `lib/composition/**` importa `adapters/driven/**`; `lib/composition/**` no importa `adapters/driving/**` | R11, R12 |
| 8 | Consumo desde UI | `app/`, `components/`, `hooks/` no importan `domain`/`ports`/`driven`; archivos `'use client'` no importan composicion ni driven | R13, R14 |
| 9 | Nucleo compartido | `lib/shared/**` no importa modulos ni composicion | R15 |
| 10 | Propiedad de modelos | todo modelo del schema tiene `/// @module`; `prisma.<modelo>` solo en el driven del propietario | R16 |
| 11 | Cliente Prisma | `@/lib/shared/db/prisma` solo importado desde `adapters/driven/**`, `scripts/`, `tests/` | R17 |
| 12 | Documentacion | `docs/architecture.md` no presenta como vigentes `lib/services/`, `lib/repositories/`, `lib/interfaces/`, `lib/actions/`, y menciona `lib/modules/` | R19 |

El bloque 6 necesita resolucion **transitiva** de imports (seguir `./x` y `@/...` hasta el
cierre). Se implementa con una funcion propia de ~30 lineas sobre `readFileSync` +
resolucion de alias `@/ -> repoRoot`, sin dependencias: solo hay que seguir imports
relativos y con alias dentro del repo, y cualquier import de paquete npm es una hoja.

## 12. Riesgos

| # | Riesgo | Mitigacion |
| --- | --- | --- |
| 1 | Un `vi.mock` que sigue apuntando a un modulo inexistente: Vitest **no falla**, simplemente no mockea | T7 exige releer los 11 `vi.mock` uno a uno; los tests de accion afirman sobre el resultado, asi que un mock muerto los pone en rojo — salvo `logout`, que no afirma retorno: ahi se comprueba a mano que el spy recibe la llamada |
| 2 | Falso verde de una guardia que ya no mira donde debe (D1) | La guardia nueva se autocomprueba (R21); las dos guardias con rutas codificadas se verifican mirando su salida en T3/T5 |
| 3 | Import circular `composicion -> driving -> composicion` | R12 lo prohibe y el bloque 7 lo comprueba |
| 4 | `lib/utils.ts` y `lib/utils/` conviven hoy; al borrar el directorio puede resolverse mal algun import residual | `pnpm run typecheck` lo caza al instante; ademas el bloque 3 de la guardia |
| 5 | El barrel del contrato arrastra servidor al cliente y rompe el build de Next (no la suite) | Bloque 6 (transitivo) + `pnpm run build` en T10 |
| 6 | Conflicto de merge gigante con features en vuelo | Feature bloqueante: por eso se hace **ahora**, con QC-4/5/10/11 ya en `dev` y el resto en `pending` |
