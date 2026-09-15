# QC-93 — aterrizaje-sin-permiso-de-modulo · bitacora de implementacion

> Implementer: F2.1. Worktree `.worktrees/QC-93-aterrizaje-sin-permiso-de-modulo`, rama
> `feature/QC-93-aterrizaje-sin-permiso-de-modulo`. Spec aprobado por el humano el 2026-09-15.

## 0. Preparacion del worktree

| Paso | Resultado |
|---|---|
| `git fetch origin dev` + `git merge origin/dev` (iba 35 commits por detras) | merge `0d8f05d`; 0 commits por detras despues |
| Conflicto del merge | uno solo, add/add en `specs/QC-93-.../requirements.md`: `dev` traia la semilla de `/afinar-feature` con la seccion EARS en `_Pendiente_`; la rama, la misma semilla con R1-R24 aprobados. Unica diferencia esa seccion: se conservo la version aprobada (`679f340`). No ambiguo |
| Lo que trajo el merge que toca esta ficha | la migracion `20260912103000_session_revocation` (QC-23) y una suite E2E nueva, `e2e/pedidos-responsables.spec.ts` (QC-102), con su propio `async function login()` que espera `DASHBOARD_ROUTE` (`:257-262`). Ver 0.1 |
| `pnpm install --frozen-lockfile` | ok (lockfile existente, ninguna dependencia nueva) |
| `.env` propio hacia la base `QuimiCloude_QC93` (misma credencial y host que el repo principal, solo cambia el nombre de base; `.env*` esta en `.gitignore`) | 2 URLs sustituidas (`DATABASE_URL`, `DIRECT_URL`) |
| `prisma generate` + `next typegen` | ok |

### 0.1 Discrepancias entre el disco y el spec (anotadas)

1. **Hay una copia numero catorce del patron.** `e2e/pedidos-responsables.spec.ts` (QC-102, PR #68) nacio despues del
   censo de `design.md > 0.3` con `login()` propio y `DASHBOARD_ROUTE` escrito. Solo entra con el Administrador
   (`:539`), asi que no es uno de los rojos; pero R9 exige que la guardia muerda en cualquier `e2e/**/*.spec.ts`, y
   sin migrarla la guardia de T9 no puede salir verde. Se migra al helper con las otras nueve de T6. Es la
   demostracion practica de por que R9 existe.
2. **La receta de base limpia de `specs/QC-77-.../design.md > 3` esta desfasada.** Seguida al pie de la letra
   (`migrate deploy`, `db:seed`, `resolve --rolled-back`, `migrate deploy`) el `db:seed` falla con
   `The column ... does not exist`: el seed corre sobre el esquema a medias y el cliente Prisma ya conoce columnas de
   migraciones posteriores. La receta vigente la corrigio QC-23 en `tests/helpers/test-database.ts:485-573` (en el
   hueco de QC-49 solo se siembra la empresa con SQL crudo; el seed completo va al final). Registro del intento
   fallido: `progress/e2e_QC-93_db-setup.log`. Conviene corregir ese `design.md` (fuera de alcance aqui).
3. **Lineas**: las de `design.md > 0.1/0.3` siguen validas tras el merge (`inventario.spec.ts:571`,
   `pedidos.spec.ts:447`, `proveedores.spec.ts:467`, `recetas.spec.ts:376`), y las de produccion tambien
   (`private-nav.ts:418`/`:452`, `login-action.ts:122-126`).
4. **BLOQUEO — el caso R4 de `inventario.spec.ts:571` contradice R11+R12+R13 tal como estan escritos.** Los cuatro
   casos entran con `ROLE_OPERADOR` (`inventario.spec.ts:339`, `pedidos.spec.ts:272`, `proveedores.spec.ts:318`,
   `recetas.spec.ts:259`). En pedidos, proveedores y recetas el Operador NO tiene el permiso del modulo y el guion de
   `design.md > 4` encaja (T1 confirma el 404 de `/pedidos` para el Operador: `permisos.spec.ts` pasa su paso 4). Pero
   **el modulo de `inventario.spec.ts` es inventario, y el Operador SI tiene `inventario.consultar`**
   (`permissions.ts:165`, que R19 obliga a mantener). Para ese caso: su aterrizaje derivado ES `INVENTORY_ROUTE`
   (el `expect(landing).not.toBe(MODULE_ROUTE)` de `design.md > 4` es falso), `goto(INVENTORY_ROUTE)` responde 200 y
   pinta el catalogo (R12 y R13 falsos). **No es un agujero de permisos** —el permiso es deliberado, R19—: es la
   premisa del caso la que dejo de ser cierta cuando el Operador gano `inventario.consultar`. Arreglarlo exige elegir
   entre (a) un fixture cuyo rol NO tenga `inventario.consultar` (conserva la intencion del R4 de origen, pero no el
   «fixture Operador» de R11) o (b) reescribir el caso para otra afirmacion (cambia el significado del R4 de origen).
   Las dos reabren un requisito aprobado: **no se improvisa**. Ese caso se migra solo en su entrada al helper, conserva
   su cuerpo, y queda rojo con esta causa hasta que el humano decida.

### 0.2 La base limpia

`QuimiCloude_QC93` se construyo como copia de la plantilla de integracion `qct_tpl_5a5346ed8f4d`
(`pnpm run db:test template`: «plantilla reutilizada ... 28 migraciones», construida con la receta vigente), con
`DROP DATABASE IF EXISTS ... WITH (FORCE)` + `CREATE DATABASE "QuimiCloude_QC93" TEMPLATE "qct_tpl_5a5346ed8f4d"`.
Asi la base del E2E sale de la misma receta mantenida que usa el gate, no de una copiada a mano.

Estado recien creada (medido):

```
companies: 1
users: 1
roles: 2
role_permissions: 17
migraciones aplicadas: 28
Database schema is up to date!
```

## T1 — La corrida de referencia ANTES de tocar nada (R23)

- Commit medido: `0d8f05d` (dev de hoy + spec, cero cambios de la feature). Base: `QuimiCloude_QC93` recien copiada.
- Comando: `pnpm exec playwright test` (proyectos `chromium` y `webkit`), con el `.env` del worktree exportado.
- Log completo: `progress/e2e_QC-93_antes.log` (2026-09-15 09:54:58 a 10:02:27).
- `playwright test --list` antes del helper: `Total: 78 tests in 18 files` (referencia de T3).

**Resultado: `27 failed / 51 passed` (78), 7.5 min.** Ni 23 ni 8: 27. Rojos, con la causa medida de cada uno:

| # | Test (los dos motores salvo donde se dice) | Ejec. | Sintoma | Causa |
|---|---|---|---|---|
| A | `inventario.spec.ts:571` (R4), `pedidos.spec.ts:447` (R49), `proveedores.spec.ts:467` (R52), `recetas.spec.ts:376` (R6) | **8** | `waitForURL(DASHBOARD_ROUTE)` agota 60 s en el `login()` propio (`inventario:208`, `pedidos:173`, `proveedores:180`, `recetas:153`) | **LA DE ESTA FICHA**: el fixture no-Administrador aterriza en el primer item de su menu, no en el dashboard |
| B | `inventario.spec.ts:391`, `:459`, `:515`; `proveedores.spec.ts:372`; `presentaciones.spec.ts:298` | **10** | el alta de presentacion no cierra su bloque/panel: `presentation-create` / `SHEET_TESTID` con `toHaveCount(0)` recibe 1 durante 60 s | **QC-80 (R10, R17)**: la unidad de la presentacion es obligatoria y la rechaza el mismo esquema en cliente (`components/shared/presentation-select.tsx:296-309`; `presentation-form.tsx:64,126`); los E2E solo rellenan el nombre (`inventario.spec.ts:252-253,416-417`, `presentaciones.spec.ts:322-326`) y el envio no sale. No es aterrizaje |
| C | `errores.spec.ts:194` | **2** | `waitForURL(DASHBOARD_ROUTE)` agota 60 s (`:203`) | **QC-65**: `users.account_status` es `@default(pending)` (`db/schema.prisma:194`) y `errores.spec.ts:155-170` es la unica suite que crea su usuario sin `accountStatus: 'active'` (las demas lo fijan). Una cuenta `pending` no entra (`login.spec.ts:378` lo afirma y pasa). El usuario ES Administrador: la causa raiz de esta ficha no puede explicarlo; confirma la sospecha de `design.md > 0.4` y le pone nombre |
| D | `permisos.spec.ts:201` | **2** | `private-user-trigger` no existe (`:263`); el 404 dentro del layout privado SI se pinta, con «Cerrar sesión» visible en la cabecera (snapshot de Playwright) | **Enmienda humana del 2026-09-07**: se retiro el menu de usuario y `private-user-trigger`; cerrar sesion paso a ser el boton directo `private-logout` (`components/private/nav-user.tsx:18-23`, `app/(private)/components/logout-button.tsx:65`). `permisos.spec.ts` no se actualizo. Su aterrizaje pasa (paso 2, `/inventario`). No es aterrizaje |
| E | `session.spec.ts:241` | **2** | `PrismaClientKnownRequestError` en `afterAll`, `prisma.user.deleteMany` (`:197`), FK violada | **QC-23**: el cierre de sesion escribe `revoked_sessions`, con FK a `users` `onDelete: Restrict` (`schema.prisma:452`), y la limpieza no la borra. Medido en la base tras la corrida: los dos `qc9_e2e_*ciclo` siguen vivos con `revokedSessions: 1` |
| F | `usuarios.spec.ts:317` | **2** | `PrismaClientKnownRequestError` en `afterAll`, `prisma.company.deleteMany` (`:305`), FK violada | la limpieza no borra `credential_setup_tokens` (FK `onDelete: Restrict`, `schema.prisma:424`): el usuario creado por la pantalla nace `pending` con su token, `user.deleteMany` falla y el `finally` lo tapa con el error de la empresa. Medido: los dos `qc67_e2e_*_nuevo` vivos con `credentialSetupTokens: 1` |
| G | `session.spec.ts:289`, **solo chromium** | **1** | `inventario-title` no visible en 60 s (`:306`) tras aterrizar en `/inventario` | **sin causa confirmada**: pasa en WebKit en la misma corrida; justo despues el servidor imprime `Error: The destination stream closed early` (render abortado de `next dev`). Candidato a flake de carga; se re-mide en T12 |

Total: 8 + 10 + 2 + 2 + 2 + 2 + 1 = **27**.

**Lo que la causa raiz de esta ficha explica: 8 de 27.** Las otras 19 tienen causas distintas y ajenas (QC-80, QC-65,
enmienda 2026-09-07, QC-23, tokens de credencial y un probable flake). No se arreglan aqui (alcance aprobado); R24
exige nombrarlas y aqui estan nombradas. **Ningun rojo indica un agujero real de permisos** (R18): en todos los casos
con usuario sin permiso la proteccion estuvo en pie (404 en su sitio, sin datos); lo que falla es la prueba.

**Aviso para T12:** la corrida deja residuo en `QuimiCloude_QC93` (usuarios y empresas `qc9_e2e_*`, `qc67_e2e_*` que
sus limpiezas no pudieron borrar). La corrida de «despues» se hace sobre una copia nueva de la plantilla.

## T2-T4 — El helper unico, su no-recogida y su test (R1-R7) · `backend_dev`

Commit `235ebbd`. Archivos nuevos:

- `e2e/helpers/landing.ts` — `landingRouteForPermissions`, `permissionsForUsername`, `expectedLandingRoute`,
  `loginAndLand` y el tipo `Credentials`. Imports: `import type { Page }` de `@playwright/test`,
  `@/lib/shared/db/prisma`, `@/lib/shared/navigation/private-nav` (no hay barril en `lib/shared/navigation`) y
  `@/lib/shared/routes`. Nada mas.
- `tests/unit/e2e-helpers/landing.test.ts` — 8 casos, proyecto `node`; permisos tomados del contrato
  `@/lib/modules/identity` (`SEED_ROLE_PERMISSIONS`, `ROLE_ADMINISTRADOR`, `ROLE_OPERADOR`), no escritos a mano.

Revisado por el implementer antes del commit: la derivacion es literalmente `login-action.ts:122-126`; la consulta
filtra por `username` y `deletedAt: null`; sin usuario vivo lanza nombrando el username; `loginAndLand` no tiene
parametro de aterrizaje y calcula el destino ANTES de pulsar.

Verificacion re-ejecutada por el implementer sobre `235ebbd`^ (arbol con solo esos dos archivos nuevos):

```
pnpm run typecheck                                        -> EXIT=0 (tsc --noEmit, sin salida)
pnpm run lint                                             -> EXIT=0 (eslint, sin salida)
pnpm exec vitest run tests/unit/e2e-helpers/landing.test.ts
   Test Files  1 passed (1)
        Tests  8 passed (8)
pnpm exec playwright test --list                          -> Total: 78 tests in 18 files   (igual que antes: T3)
grep -c helpers <salida de --list>                        -> 0
```

Reportado por `backend_dev` y no repetido: `vitest related --run e2e/helpers/landing.ts tests/unit/e2e-helpers/landing.test.ts`
-> 1 archivo, 8 passed; `vitest run tests/guards/guard-arquitectura-modulos.test.ts` -> 61 passed.

Nota de alcance de T4: los casos de R4/R5 del test unitario mockean el cliente Prisma; comprueban la forma de la
consulta y el error, no lo sembrado. La comprobacion contra base real de R4/R5 es la corrida E2E de T12, donde cada
`loginAndLand` lee los permisos de `QuimiCloude_QC93`.
