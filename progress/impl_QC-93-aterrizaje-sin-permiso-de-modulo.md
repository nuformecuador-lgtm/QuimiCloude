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
   **Resuelto el 2026-09-15** por la enmienda aprobada por el humano (commit `77c9016`): el Operador conserva
   `inventario.consultar` y el caso entra con un rol efimero de la suite sin permisos (R25-R28). Implementado en T14
   (`e40203b`); ver «Enmienda del 2026-09-15 — T14 a T17».

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

## T5, T6, T8 — Las catorce suites y el caso nuevo (R6-R8, R11-R18) · tres `frontend_dev` en paralelo

Commit `e006c4d`. Reparto sin solapar archivos: T5 (`inventario`, `pedidos`, `proveedores`, `recetas`); T6 primera tanda
+ T8 (`aislamiento-inventario`, `recetas-pasos`, `errores`, `establecer-contrasena`, `login`); T6 segunda tanda
(`usuarios`, `unidades`, `presentaciones`, `grupos-de-trabajo`, `pedidos-responsables`). Ningun subagente ejecuto
Playwright de verdad (puerto fijo 3117 compartido: dos corridas a la vez chocan); las corridas las hace el implementer.

- **Las catorce** entran con `loginAndLand` importado de `./helpers/landing`. Cero `function login(` en `e2e/*.spec.ts`,
  cero parametros de aterrizaje, ningun `DASHBOARD_ROUTE`/`INVENTORY_ROUTE` escrito como destino tras `login-submit`.
- **T5, los tres casos reescritos** con la plantilla de `design.md > 4` (premisa `expect(landing).not.toBe(RUTA)`,
  `status 404`, pathname sin cambiar, `private-not-found` visible, cuentas cero conservadas, `R<n>` de origen en el titulo):
  - `e2e/pedidos.spec.ts:440` — `un usuario sin pedidos.consultar recibe 404 dentro del layout privado y no ve ningun dato de pedidos (R49)`
  - `e2e/proveedores.spec.ts:455` — `un usuario sin proveedores.consultar recibe 404 dentro del layout privado y no ve ningun dato de proveedores (R52)`
  - `e2e/recetas.spec.ts:369` — `un usuario sin recetas.consultar recibe 404 dentro del layout privado y no ve ningun dato de recetas (R6)`
  - Revisado el diff por el implementer. En pedidos la peticion pasa de `ordersUrl()` (con query) a `ORDERS_ROUTE`: el
    404 se decide por ruta, no debilita el caso.
- **T5, el caso bloqueado** `e2e/inventario.spec.ts:564` (`... acaba fuera y no ve el catalogo (R4)`): solo su entrada
  pasa a `loginAndLand`; titulo, cuerpo y asserts intactos. Sigue la decision de §0.1.4. **T5 queda SIN marcar.**
- **T6:** `errores.spec.ts` solo migra la entrada (su `accountStatus` es la causa C de T1, fuera de alcance).
  `establecer-contrasena.spec.ts` conserva el `waitForURL(LOGIN_PATH, 120_000)` previo y luego `loginAndLand`; su espera
  de aterrizaje baja de 120 s a los 60 s del helper (riesgo anotado por el subagente; el caso tiene 180 s en total).
- **T8**, un solo caso nuevo: `e2e/login.spec.ts:386` — `sin ningun permiso de modulo entra al destino derivado, ve el 404
  dentro del layout privado sin un solo dato de modulo y puede cerrar sesion sin volver atras (QC-93 R14-R18)`. Premisa
  `permissionsForUsername(...) === []`; pathname === destino derivado; `private-not-found`, `private-nav`,
  `private-logout`; sonda R18 `MODULE_DATA_TESTIDS` (21 testids, cada uno tomado de la cuenta cero de su suite y
  confirmado en `app/`/`components/`); cierre por teclado (overlay de `next dev` en WebKit, `permisos.spec.ts:251-261`),
  espera del login y `goBack` que no vuelve.

Verificacion del implementer sobre el arbol ya migrado (antes del commit `e006c4d`):

```
pnpm run typecheck                       -> EXIT=0
pnpm run lint                            -> EXIT=0
pnpm exec playwright test --list         -> Total: 80 tests in 18 files   (78 + el caso nuevo en chromium y webkit)
grep 'function login(' e2e/*.spec.ts     -> 0
```

## T7 — `session.spec.ts` y `permisos.spec.ts` sin tocar (R10)

```
git diff --stat origin/dev...HEAD -- e2e/session.spec.ts e2e/permisos.spec.ts   -> (vacio)
git status --porcelain -- e2e/session.spec.ts e2e/permisos.spec.ts              -> (vacio)
```

- `session.spec.ts`: llega a la zona privada por destino de vuelta (`returnTo`, `:247-260`); ahi el destino lo fija la
  ruta pedida, no el menu.
- `permisos.spec.ts`: afirma el aterrizaje YA derivado de sus permisos (`:214`). Su rojo de T1 (D, `private-user-trigger`
  retirado el 2026-09-07) no es de aterrizaje, asi que R10 no se levanta: se nombra y va a su ficha.

## T9 — La guardia (R9) · `backend_dev`

Commit `9b8c3ee`. `tests/guards/guard-e2e-landing.test.ts`: funcion pura que analiza el texto de cada `e2e/**/*.spec.ts`
+ recorrido del disco. Muerde ante (a) un `login` local y (b) una espera de ruta fija (constante `*_ROUTE` salvo las de
login, literal, o identificador `landing` no asignado desde el helper) en una ventana de **3 lineas de codigo** tras un
`login-submit` (sin contar blancos ni comentarios; corta en `goto(` o en un `test(` nuevo: medido sobre las 14 copias
reales, la espera iba siempre en la siguiente linea de codigo). Excepciones nombradas con motivo, solo de la regla (b):
`e2e/session.spec.ts` (`returnTo`) y `e2e/permisos.spec.ts` (aterrizaje ya derivado); una excepcion hacia un archivo
inexistente falla. Limite escrito en su cabecera: comprueba la forma del texto, no que el aterrizaje sea cierto.

Reportado por el subagente: aplicada al texto de `235ebbd` (antes de migrar) da **25 hallazgos que cubren las 14 copias**,
incluida `pedidos-responsables.spec.ts:257/262`; ningun falso positivo conocido.

Verificacion y prueba de que muerde, hecha por el implementer sobre el arbol real (restauracion con `cp` desde el
scratchpad, no con `git checkout`):

```
0. guardia sobre el arbol migrado                -> EXIT=0   Tests  16 passed (16)
1. mutacion: login() local + waitForURL(DASHBOARD_ROUTE) tras login-submit, al final de e2e/recetas-pasos.spec.ts
                                                 -> EXIT=1   Tests  1 failed | 15 passed (16)
   - e2e/recetas-pasos.spec.ts:454  define su propia funcion `login`: la entrada es `loginAndLand` de e2e/helpers/landing.ts
   - e2e/recetas-pasos.spec.ts:456  `waitForURL` espera la constante DASHBOARD_ROUTE como aterrizaje tras el `login-submit` de la linea 455
   (restaurado con cp)
2. mutacion: funcion con otro nombre + waitForURL('/inventario') tras login-submit, al final de e2e/unidades.spec.ts
                                                 -> EXIT=1   Tests  1 failed | 15 passed (16)
   - e2e/unidades.spec.ts:479  `waitForURL` espera el literal '/inventario' como aterrizaje tras el `login-submit` de la linea 478
   (restaurado con cp)
3. guardia tras restaurar                        -> EXIT=0   Tests  16 passed (16)
   git diff --stat -- e2e/                       -> (vacio)
```

Que entra en la seleccion del gate por patron (`vitest run guard`): reportado por el subagente, 40 archivos / 423 passed /
9 skipped con esta guardia dentro. El implementer no lo repitio para no cargar la maquina durante la corrida E2E de T12.

## T10 — Auditoria del diff prohibido (R19-R22)

```
git diff --stat origin/dev...HEAD -- app lib db scripts package.json pnpm-lock.yaml     -> (vacio)
git status --porcelain -- app lib db scripts package.json pnpm-lock.yaml               -> (vacio)
lib/modules/identity/domain/permissions.ts:            cambios=0
lib/modules/identity/adapters/driving/login-action.ts: cambios=0
lib/shared/navigation/private-nav.ts:                  cambios=0
app/(private)/not-found.tsx:                           cambios=0
package.json:                                          cambios=0
pnpm-lock.yaml:                                        cambios=0
permissions.ts:165   [ROLE_OPERADOR]: ['inventario.consultar', 'asignaciones.consultar'],
```

Lo que toca la feature (`git diff --stat origin/dev...HEAD`): `e2e/helpers/landing.ts` (nuevo), las 14 suites de `e2e/`,
`tests/guards/guard-e2e-landing.test.ts` (nuevo), `tests/unit/e2e-helpers/landing.test.ts` (nuevo), `specs/QC-93-*` y
`progress/` (esta bitacora y los logs de T1). Es exactamente la lista esperada de `tasks.md > T10`.

## T11 — Gate completo

**No lo corre el implementer**: por instruccion del leader y la regla del gate de `AGENTS.md`, `./init.sh` (y
`pnpm test` completo) lo corre el leader. Pendiente de leader.

## T12 — La corrida de despues (R23, R24)

### Intentos que NO cuentan como medicion, y lo que destaparon

1. **Intento 1** (`e006c4d`, workers por defecto, 10:22): **matado por el sistema por falta de memoria** con 42 tests
   hechos. El kill alcanzo al shell, no al runner: el arbol de Playwright (runner, workers, navegadores y el `next dev`
   del puerto 3117) siguio vivo huerfano con ~1 GB solo el servidor. Se identifico por linea de comandos (ruta de ESTE
   worktree; un `eslint` de QC-81 que tambien salia no se toco), se mato con `taskkill /T` y se comprobo puerto libre,
   cero procesos QC-93 y memoria libre de 4,5 GB a 8,5 GB. Base recreada desde la plantilla.
2. **Intento 2** (`e006c4d`, `--workers=3`, 10:28): **abortado a proposito por el implementer** a mitad, al detectar
   una regresion propia (abajo): un numero medido sobre ese codigo no iba a contar. Log parcial conservado:
   `progress/e2e_QC-93_despues_intento2.log`. Base recreada otra vez.

### Hallazgo 1 — REGRESION DE ESTA FEATURE: `login.spec.ts:408` rojo en 0 ms

- Sintoma (los dos intentos, chromium): `con credenciales incorrectas se queda en el login, avisa y no emite sesion`
  falla en 0 ms. En T1 pasaba.
- Error real (`test-results/login-login-en-navegador-r-7c22e-.../error-context.md`): `Unique constraint failed on the
  fields: (name)` en `prisma.role.create()` del `beforeAll` (`login.spec.ts:273`).
- Mecanismo: el caso nuevo de T8 (`:386` tras el arreglo; `:363` cuando fallo) cierra sesion, y eso escribe `revoked_sessions` (FK a `users`
  `onDelete: Restrict`, `schema.prisma:452`). El `afterAll` (`:307-335`) no borra esa fila: su `user.deleteMany` falla,
  el `catch` vacio lo traga (`:316`), y el rol tampoco se puede borrar porque el usuario lo referencia (`:320`). Con
  `fullyParallel`, el mismo worker vuelve a ejecutar los hooks del archivo con el mismo `RUN_ID` de modulo, y el segundo
  `beforeAll` choca al crear el rol con el mismo nombre: todos los tests de ese worker caen en 0 ms. Medido en la base
  durante el intento 2: `qc7_e2e_...sinperm` vivo con `revokedSessions: 1`.
- Consecuencia fuera de la corrida: ese residuo, pasada una hora (`ORPHAN_MIN_AGE_MS`), haria reventar tambien el
  barrido de huerfanos del `beforeAll` (`:259-268`, sin `try`) en cualquier corrida futura sobre esa base.
- Arreglo (dentro de R21, `e2e/**`): borrar las `RevokedSession` de los usuarios del prefijo antes de borrar los
  usuarios, en el `afterAll` y en el barrido del `beforeAll`. Delegado a `frontend_dev`, **commit `c0182c7`**:
  - barrido del `beforeAll`: `prisma.revokedSession.deleteMany` con el MISMO `where` que el `user.deleteMany` que le
    sigue (prefijo propio + `OR` de edad/rol/empresa, via la relacion `user`), sin `try`, como el resto del barrido;
  - `afterAll`: `prisma.revokedSession.deleteMany` por `${USERNAME_PREFIX}${RUN_ID}`, en su propio `try`, antes del de
    usuarios.
  - El subagente comprobo que la unica otra FK hacia `users` es `credential_setup_tokens`, en la que este spec no
    escribe. No se toco el caso nuevo ni la politica de `catch` del hook.
  - Verificacion re-ejecutada por el implementer antes del commit:

    ```
    pnpm run typecheck                                            -> EXIT=0
    pnpm exec eslint e2e/login.spec.ts                            -> EXIT=0
    pnpm exec vitest run tests/guards/guard-e2e-landing.test.ts   -> EXIT=0   Tests  16 passed (16)
    pnpm exec playwright test --list                              -> Total: 80 tests in 18 files
    ```
  - La confirmacion con navegador de que `:408` vuelve a verde es la corrida definitiva de T12.

### Hallazgo 2 — causa AJENA: `pedidos.spec.ts:440` (R49) con la sesion muerta al nacer

- Sintoma (intento 2, chromium): `loginAndLand` agota 60 s; la navegacion fue `/dashboard` y despues
  `/login?sesion=fin`. No es aterrizaje ni permisos: la sesion era invalida desde el primer instante.
- Causa, leida en codigo: `iat` viaja en SEGUNDOS (`session-token.ts:229`), y `isStampedOut` invalida si
  `issuedAt <= sessionsValidFrom` (`lib/modules/identity/domain/session-revocation.ts:61-66`; el `<=` es decision
  aprobada de QC-23). QC-23 escribe el sello truncado al segundo (`floorToSecond`) cuando CAMBIA la cuenta
  (`user-admin-prisma.ts:602-612`), pero un usuario recien creado nace con `sessions_valid_from @default(now())`, con
  milisegundos (`schema.prisma:213-221`), y ningun E2E lo fija (0 apariciones de `sessionsValidFrom` en `e2e/`). Si el
  fixture crea el usuario a las hh:mm:05.400 y el login emite el token a las hh:mm:05.900, `iat` = 05 <= 05.400: la
  sesion nace revocada, `getSessionUser()` devuelve null tras emitirla, `login-action.ts:122-126` cae en
  `DASHBOARD_ROUTE` y `/dashboard` expulsa a `/login?sesion=fin`.
- **Misma firma en `recetas.spec.ts:317`** (Administrador, alta de receta; chromium, intento 2; en T1 pasaba):
  `loginAndLand` llega a `/dashboard` —que para el Administrador es a la vez su aterrizaje derivado y el respaldo al que
  cae un login con sesion nula, asi que la carrera no se nota ahi— y al ir a `FORMULAS_ROUTE` el snapshot de Playwright
  muestra **el formulario de login** donde tenia que estar `recipes-title`. Ese `error-context.md` no trae el log de
  URLs, asi que la evidencia es el snapshot mas el mecanismo leido en codigo, no una traza de `sesion=fin`.
- Es una carrera de temporizacion entre los fixtures y QC-23, **intermitente**, y ajena a esta ficha: el helper hace
  una consulta ANTES del `goto`, asi que retrasa el login, no lo adelanta. No se arregla aqui. Destino propio: ficha para
  QC-23 (o que los fixtures E2E nazcan con el sello truncado / en el pasado).

### La corrida definitiva (la que cuenta)

- Commit medido: `c0182c7` (todo lo de la feature + el arreglo de `login.spec.ts`). Base: `QuimiCloude_QC93` recien
  copiada de `qct_tpl_5a5346ed8f4d`, sin ninguna corrida encima.
- Comando: `pnpm exec playwright test --workers=3` (chromium + webkit), `.env` del worktree exportado.
- Log completo: `progress/e2e_QC-93_despues.log` (2026-09-15 10:38:32 a 10:49:07).
- **Diferencias de condiciones con T1, dichas:** `--workers=3` en vez de los workers por defecto (el intento 1 lo mato el
  sistema por memoria; durante esta corrida la maquina tenia entre 1,7 y 3,9 GB libres, con procesos ajenos grandes
  abiertos), y 80 tests en vez de 78 (el caso nuevo en los dos motores). Menos workers da mas holgura de tiempo, no
  cambia ninguna afirmacion.

**Resultado: `20 failed / 60 passed` (80), 10.4 min.**

| | T1 (antes, `0d8f05d`) | T12 (despues, `c0182c7`) |
|---|---|---|
| tests | 78 | 80 |
| passed | 51 | **60** |
| failed | 27 | **20** |
| rojos cuya causa es el aterrizaje (A) | **8** | **0** |

**Lo que cambio, caso por caso** (los dos motores salvo donde se dice):

- **Curados por esta ficha (A, 6 ejecuciones):** `pedidos.spec.ts:440` (R49), `proveedores.spec.ts:455` (R52) y
  `recetas.spec.ts:369` (R6) pasan con 404 en su sitio, sin redireccion y sin datos.
- **El caso R4 de inventario (A en T1, 2 ejecuciones):** sigue rojo, ahora por su **premisa bloqueada** (§0.1.4), no por
  el aterrizaje. El helper espera y consigue el destino derivado; el log lo confirma: `navigated to
  "http://localhost:3117/inventario"`. Luego el cuerpo intacto espera la redireccion al dashboard (`:573`), que no
  existe desde QC-75, y el Operador SI puede ver inventario.
- **Nuevo y verde:** `login.spec.ts:386` (QC-93 R14-R18) pasa en chromium y webkit. **La sonda R18 no encontro ni un
  dato de modulo para un usuario sin permisos: no hay agujero de permisos.**
- **La regresion propia, corregida:** `login.spec.ts:431` (credenciales incorrectas, el `:408` de antes del arreglo)
  pasa en los dos motores, y los 5 casos de `login.spec.ts` pasan en los dos.
- **Intermitentes que esta vez no aparecieron:** `session.spec.ts:289` (G de T1) pasa en los dos; `recetas.spec.ts:317`
  y `pedidos.spec.ts:440`, que en el intento 2 cayeron por la carrera de QC-23 (hallazgo 2), pasan en los dos. Que no
  salgan en una corrida no prueba que no existan: la carrera es de temporizacion.
- **Migradas y verdes:** `aislamiento-inventario`, `establecer-contrasena` (con la espera de aterrizaje en 60 s),
  `grupos-de-trabajo`, `pedidos-responsables`, `recetas-pasos`, `unidades` (incluido `:445`, Operador con 404),
  `usuarios:416` (Operador con 404) y `presentaciones:338` (Operador con 404).

**Los 20 rojos que sobreviven, cada uno con causa nombrada, distinta del aterrizaje derivado, y destino (R24):**

| Ejec. | Tests | Causa | Destino propuesto |
|---|---|---|---|
| 10 | `inventario.spec.ts:384`, `:452`, `:508`; `proveedores.spec.ts:360`; `presentaciones.spec.ts:280` | **B · QC-80**: la unidad de la presentacion es obligatoria y los E2E solo rellenan el nombre; el bloque/panel de alta no se cierra | ficha nueva: actualizar esos E2E a QC-80 (elegir unidad) |
| 2 | `errores.spec.ts:197` | **C · QC-65**: su usuario nace `pending` (unica suite sin `accountStatus: 'active'`); el login lo rechaza y `loginAndLand` agota la espera (`landing.ts:79`). Es Administrador: no es aterrizaje | ficha nueva: fixture de `errores.spec.ts` con `accountStatus: 'active'` |
| 2 | `permisos.spec.ts:201` | **D · enmienda 2026-09-07**: `private-user-trigger` ya no existe; cerrar sesion es el boton directo `private-logout`. Su aterrizaje pasa. R10 lo deja fuera | ficha nueva: actualizar `permisos.spec.ts` al boton directo |
| 2 | `session.spec.ts:241` | **E · QC-23**: su `afterAll` no borra `revoked_sessions` (FK `Restrict`) y el borrado de usuarios falla. R10 lo deja fuera | ficha nueva: limpieza de `session.spec.ts` (el mismo arreglo que `c0182c7` hizo en `login.spec.ts`) |
| 2 | `usuarios.spec.ts:305` | **F**: su `afterAll` no borra `credential_setup_tokens` del usuario creado por la pantalla (FK `Restrict`); el `finally` lo tapa con el error de la empresa | ficha nueva: limpieza de `usuarios.spec.ts` |
| 2 | `inventario.spec.ts:564` (R4) | **premisa del caso bloqueada** (§0.1.4): el Operador tiene `inventario.consultar`; el caso afirma una redireccion retirada por QC-75 | **decision humana dentro de QC-93**: (a) otro fixture sin `inventario.consultar` o (b) reescribir el caso |

Total: 10 + 2 + 2 + 2 + 2 + 2 = **20**. Ninguno tiene como causa el aterrizaje derivado del menu (R24), con la salvedad
explicita del caso R4 de inventario: su aterrizaje SI es el derivado y lo alcanza; lo que falla es la afirmacion que
viene despues, y esa no se puede arreglar sin reabrir R11-R13.

**Aparte, y fuera de la tabla porque no es un rojo de esta corrida:** la carrera de QC-23 del hallazgo 2 (fixtures con
`sessions_valid_from` sin truncar contra `iat <= sello`) necesita su propia ficha: tumbo `pedidos.spec.ts:440` y
`recetas.spec.ts:317` en el intento 2 y puede tumbar cualquier suite que entre en el mismo segundo en que crea su usuario.

## Enmienda del 2026-09-15 — T14 a T17

El humano aprobo la enmienda del spec (commit `77c9016`): **el Operador CONSERVA `inventario.consultar`** (R19
intacto) y el caso R4 de `e2e/inventario.spec.ts` entra con un **rol efimero de la suite sin permisos** (R25-R28, R11
enmendado, `design.md > 9`). Resuelve el bloqueo de §0.1.4.

### T14 — El caso R4 con un rol efimero sin permisos (R11-R13, R25-R28) · `frontend_dev`

Commit `e40203b`. Solo `e2e/inventario.spec.ts`:

- **Rol (R27):** `prisma.role.create` con nombre `qc22_e2e_rol_<RUN_ID>` (constante `noPermissionsRoleName`, prefijo
  `ROLE_NAME_PREFIX` colgado de `FIXTURE_PREFIX`) y **sin `permissions`**, justo despues de la empresa efimera.
- **Usuario (R25):** `noInventoryUser` (`qc22_e2e_noinv_<RUN_ID>`), creado con el `createUserWithRole` existente en la
  **misma empresa** que el Administrador que da de alta el catalogo. Sustituye a `operatorUser`; fuera los imports
  `ROLE_OPERADOR` y `DASHBOARD_ROUTE`.
- **El caso** (`:606`) — `un usuario sin inventario.consultar recibe 404 dentro del layout privado y no ve el catalogo (R4)`:
  premisa de R26 leida de la base (`permissionsForUsername(...)` no contiene `inventario.consultar`, con mensaje propio),
  `landing !== INVENTORY_ROUTE`, `status 404`, pathname sin redireccion, `private-not-found` visible y cuenta cero de
  `inventario-title`, `data-table` y `product-list-empty`. Titulo con `(R4)`.
- **`afterAll` (R27):** el borrado de usuarios incluye a `noInventoryUser`; despues, el rol por su **nombre exacto**, y
  despues la empresa. No toca `revoked_sessions`: este caso no cierra sesion.
- **Barrido de huerfanos (R28):** primero los roles `qc22_e2e_rol_*` con mas de una hora; luego los usuarios del prefijo
  viejos **o** cuyo rol este entre esos (aunque sean recientes); luego esos roles; al final las empresas. El prefijo
  propio es condicion en todas las ramas.
- **Cabecera** (`:14-15`, `:41-45`) corregida: ya no dice que el spec no crea roles ni habla de la regla ruta->rol.
- Revisado el diff por el implementer. Queda un resto que el subagente vio y no toco por estar fuera de los seis pasos:
  el mensaje de error de `createUserWithRole` (~`:185`) sigue citando «la regla ruta-rol»; solo se veria si faltara un
  rol, y no cambia ninguna afirmacion.

**(a)-(c) — verificacion del implementer antes del commit:**

```
pnpm run typecheck                                            -> EXIT=0
pnpm run lint                                                 -> EXIT=0
pnpm exec vitest run tests/guards/guard-e2e-landing.test.ts   -> EXIT=0   Tests  16 passed (16)
grep -n "ROLE_OPERADOR\|operatorUser" e2e/inventario.spec.ts  -> (nada; exit 1)
pnpm exec playwright test --list                              -> Total: 80 tests in 18 files
```

**(d) — `e2e/inventario.spec.ts` solo, chromium + webkit** (`e40203b`, base recien copiada de la plantilla,
`--workers=3`; log `progress/e2e_QC-93_T14_inventario.log`): `6 failed / 2 passed (2.5m)`.

```
✓ [chromium] › e2e\inventario.spec.ts:606:7 › ... un usuario sin inventario.consultar recibe 404 dentro del layout privado y no ve el catalogo (R4)
✓ [webkit]   › e2e\inventario.spec.ts:606:7 › ... un usuario sin inventario.consultar recibe 404 dentro del layout privado y no ve el catalogo (R4)
✘ :426, :494, :550 en los dos motores -> expect(getByTestId('presentation-create')).toHaveCount(0): Received 1   (causa B, QC-80)
```

El caso R4 queda **verde en los dos motores**. Los 6 rojos del archivo son la causa B de T1/T12 (la unidad de la
presentacion es obligatoria desde QC-80 y el alta no la elige), que `tasks.md > T14 (d)` permite que sigan.

**(e) — residuo tras esa corrida** (sonda de solo lectura por prefijo `qc22_e2e_`):

```
roles qc22_e2e_rol_*: 0
usuarios qc22_e2e_*: 0
empresas qc22_e2e_*: 0
roles del seed: Administrador, Operador
role_permissions totales: 17
```

Cero residuo de la suite, los roles del seed intactos y `role_permissions` en las 17 filas de la plantilla: la suite no
escribio ni un permiso (R27).

**(f) — la premisa de R26 muerde** (log `progress/e2e_QC-93_T14_mutacion_R26.log`, 2026-09-15 11:21:50).
Copia de `e2e/inventario.spec.ts` con `cp` al scratchpad; mutacion aplicada por reemplazo exacto (1 coincidencia) en el
`role.create` del rol efimero; solo el caso R4 (`-g "sin inventario.consultar"`), chromium + webkit; restauracion con `cp`:

```
mutacion aplicada: 1
+      name: noPermissionsRoleName, permissions: { create: [{ permissionCode: 'inventario.consultar' }] },
  2 failed                                   (chromium y webkit, los dos en el mismo punto)
  Error: la premisa del caso: si el usuario tuviera inventario.consultar, este caso no comprobaria su titulo
  expect(received).not.toContain(expected) // indexOf
  Expected value: not "inventario.consultar"
  Received array:     ["inventario.consultar"]
  > 614 |     ).not.toContain('inventario.consultar');
restaurado con cp
git diff --stat -- e2e/inventario.spec.ts (debe estar vacio): []
```

Sale rojo **en la premisa** (`:614`), antes de `loginAndLand` (`:617`): con un rol que SI tuviera el permiso, el caso no
llega a un verde que ya no comprobaria su titulo. HEAD siguio en `e40203b`.

Residuo que dejo la corrida mutada, medido y esperado: `roles qc22_e2e_rol_*: 2`, cada uno con `permissions: 1` y
`users: 0`; `usuarios` y `empresas` del prefijo: 0; `role_permissions` 19 (17 + las dos filas de la mutacion). El
`afterAll` no puede borrar un rol con permisos (`role.deleteMany`, `:400`, FK de `role_permissions -> roles`
`Restrict`). **Limite anotado, no defecto:** el barrido de huerfanos de R28 chocaria con esa misma FK ante un rol del
prefijo CON permisos; R27 prohibe que exista fuera de esta mutacion, y la base se recrea desde la plantilla antes de T16.

Con (a)-(f), **T14 queda hecha y cierra la parte pendiente de T5**: los cuatro casos de «acaba fuera» estan migrados.

### T15 — Revision de T10: auditoria del diff prohibido (R19-R22)

Revision del 2026-09-15 11:18:42 sobre `e40203b` (arbol con T14):

```
git diff --stat origin/dev...HEAD -- app lib db scripts package.json pnpm-lock.yaml   -> (vacio)
git status --porcelain -- app lib db scripts package.json pnpm-lock.yaml             -> (vacio)
lib/modules/identity/domain/permissions.ts:            cambios=0
lib/modules/identity/adapters/driving/login-action.ts: cambios=0
lib/shared/navigation/private-nav.ts:                  cambios=0
app/(private)/not-found.tsx:                           cambios=0
package.json:                                          cambios=0
pnpm-lock.yaml:                                        cambios=0
permissions.ts:165   [ROLE_OPERADOR]: ['inventario.consultar', 'asignaciones.consultar'],
```

La feature sigue tocando solo `e2e/**` (helper + 14 suites), `tests/guards/guard-e2e-landing.test.ts`,
`tests/unit/e2e-helpers/landing.test.ts`, `specs/QC-93-*` y `progress/`.

### T16 — Revision de T12: la corrida de despues, otra vez (R23, R24)

- Commit medido: `e40203b` (T14 incluida; `d2c0aff` y `4c986c0`, posteriores, solo tocan `progress/` y `tasks.md`).
- Base: `QuimiCloude_QC93` **nueva**, recreada desde `qct_tpl_5a5346ed8f4d` en el mismo comando que la corrida (medido al
  crearla: `companies=1 users=1 roles=2 role_permissions=17 revoked_sessions=0`; borra el residuo de la mutacion de T14).
- Comando: `pnpm exec playwright test --workers=3`, chromium + webkit, suite completa. 8,0 GB libres al empezar, puerto
  3117 libre.
- Log completo: `progress/e2e_QC-93_despues_T16.log` (2026-09-15 11:23:02 a 11:32:17).

**Resultado: `21 failed / 59 passed` (80), 9.2 min.**

| | T1 (`0d8f05d`) | T12 (`c0182c7`) | **T16 (`e40203b`)** |
|---|---|---|---|
| tests | 78 | 80 | 80 |
| passed | 51 | 60 | **59** |
| failed | 27 | 20 | **21** |
| rojos cuya causa es el aterrizaje | 8 | 0 (+2 de premisa bloqueada) | **0** |

**Lo que cierra la enmienda:** `e2e/inventario.spec.ts:606` (R4) pasa en **chromium y webkit**. La fila «premisa del caso
bloqueada» de la tabla de T12 **desaparece**. Tambien verdes en los dos motores: `pedidos.spec.ts:440` (R49),
`recetas.spec.ts:369` (R6), `login.spec.ts:386` (QC-93 R14-R18, la sonda R18 sigue sin ver ni un dato) y
`login.spec.ts:431` (el test de la regresion arreglada en `c0182c7`). `proveedores.spec.ts:455` (R52) pasa en webkit y
cae en chromium por la carrera de QC-23 (abajo).

**Los 21 rojos, cada uno con causa nombrada, distinta del aterrizaje derivado, y destino (R24):**

| Ejec. | Tests | Causa | Destino propuesto |
|---|---|---|---|
| 10 | `inventario.spec.ts:426`, `:494`, `:550`; `proveedores.spec.ts:360`; `presentaciones.spec.ts:280` (los dos motores) | **B · QC-80**: la unidad de la presentacion es obligatoria y el alta no la elige; `presentation-create` / `SHEET_TESTID` no se cierra | ficha: actualizar esos E2E a QC-80 |
| 2 | `errores.spec.ts:197` (los dos) | **C · QC-65**: su usuario nace `pending`; el login lo rechaza y `loginAndLand` agota la espera (`landing.ts:79`). Es Administrador | ficha: fixture con `accountStatus: 'active'` |
| 2 | `permisos.spec.ts:201` (los dos) | **D · enmienda 2026-09-07**: `private-user-trigger` ya no existe (`:263`). R10 deja el archivo fuera | ficha: actualizar al boton directo `private-logout` |
| 2 | `usuarios.spec.ts:305` (los dos) | **F**: la limpieza no borra `credential_setup_tokens`; el `finally` lo tapa con el error de la empresa (`:293`) | ficha: limpieza de `usuarios.spec.ts` |
| 1 | `session.spec.ts:241` (webkit) | **E · QC-23**: la limpieza no borra `revoked_sessions` (`:197`, FK violada). R10 deja el archivo fuera | ficha: limpieza de `session.spec.ts` (el arreglo de `c0182c7`) |
| 4 | **chromium**: `presentaciones.spec.ts:338`, `proveedores.spec.ts:455` (R52), `session.spec.ts:241`, `session.spec.ts:289` | **Carrera de QC-23** (hallazgo 2 de T12): la sesion nace revocada si el login cae en el mismo segundo en que el fixture crea el usuario (`sessions_valid_from @default(now())` con milisegundos contra `iat` en segundos, `isStampedOut` con `<=`). Evidencia: en `:338` y `:455`, traza de URLs `/dashboard` -> `/login?sesion=fin` dentro de `loginAndLand`; en los dos de `session.spec.ts`, el snapshot de Playwright muestra el **formulario de login** (`textbox "Usuario"`) donde tenia que estar `inventario-title` (`:261`, `:306`), justo despues de aterrizar | ficha para QC-23 (o fixtures E2E con el sello truncado / en el pasado) |

Total: 10 + 2 + 2 + 2 + 1 + 4 = **21**.

**Diferencia con T12, explicada:** 20 -> 21 no es una regresion. Los rojos estables son los mismos (B, C, D, F y E); el
de premisa bloqueada (2) se va; y la carrera de QC-23, que en T12 no aparecio, tira esta vez **4 ejecuciones, todas en
chromium**. Tres de ellas estan en archivos cuyo codigo esta feature no cambia salvo la entrada (`presentaciones:338`) o no
toca (`session.spec.ts`, R10). La que cae sobre un caso de esta ficha (`proveedores:455`, R52) pasa en webkit en la misma
corrida y en los dos motores en T12, y su traza muestra la sesion anulada, no un aterrizaje distinto. Ningun rojo nuevo sin
causa. **Ninguno tiene como causa el aterrizaje derivado del menu.**

**Riesgo que la enmienda ya preveia** (`design.md > 9.6`): la carrera no toco el caso de inventario `:606` en esta
corrida; si lo tocara, falla en `expect(status).toBe(404)` porque `/inventario` redirige al login, nunca da un verde falso.

## Mapa R -> test (T13, revisado en T17: R1-R28)

| R | Test / evidencia |
|---|---|
| R1 | `e2e/helpers/landing.ts` (unico, ingles) · no recogido por Playwright: `playwright test --list` = 78 antes y despues de crearlo, 0 menciones de `helpers` (T3) · `tests/guards/guard-e2e-landing.test.ts:539` `el recorrido de e2e/ encuentra specs, no recoge el helper y el helper existe` |
| R2 | `tests/unit/e2e-helpers/landing.test.ts:31` `lleva al dashboard a quien tiene los permisos sembrados del Administrador (R2)`; `:35` `lleva a inventario a quien tiene los permisos sembrados del Operador (R2)`; `:47` `coincide con la composicion de produccion para cada rol del catalogo, sin regla propia (R2)` |
| R3 | `tests/unit/e2e-helpers/landing.test.ts:39` `cae en el dashboard de respaldo cuando no hay ningun permiso (R3)`; `:43` `... cuando el unico permiso no abre ningun item del menu (R3)` · contra base real: `e2e/login.spec.ts:386` (usuario sin permisos, destino derivado) |
| R4 | `tests/unit/e2e-helpers/landing.test.ts:66` `devuelve los codigos de permiso del rol y consulta solo usuarios vivos con ese username (R4)`; `:93` `deriva el destino esperado de los permisos que devuelve la base (R4)` · contra base real: cada `loginAndLand` de la corrida T12 (y `e2e/login.spec.ts:386`, premisa `permissionsForUsername === []`) |
| R5 | `tests/unit/e2e-helpers/landing.test.ts:86` `rechaza nombrando el username cuando no hay usuario vivo, sin devolver ninguna ruta (R5)` |
| R6 | las 14 suites entran por `loginAndLand` y pasan en T12 (ver §T12); p. ej. `e2e/login.spec.ts:365` `entra con credenciales correctas y recibe la cookie de sesion httpOnly` |
| R7 | firma de `loginAndLand(page, credentials)` sin parametro de aterrizaje (`e2e/helpers/landing.ts:72`) · `tests/guards/guard-e2e-landing.test.ts:394` `(b) muerde ante un parametro landing, se llame como se llame la funcion` y `:569` sobre el arbol real |
| R8 | `tests/guards/guard-e2e-landing.test.ts:569` `ningun spec define su propio login ni espera una ruta fija tras login-submit` (verde sobre el arbol; 25 hallazgos sobre el texto previo) |
| R9 | `tests/guards/guard-e2e-landing.test.ts` entero (autoprueba `:335-536` + arbol real `:538-`), probado que muerde con dos mutaciones reales (§T9) |
| R10 | `tests/guards/guard-e2e-landing.test.ts:555` `cada excepcion nombra un spec que existe y dice por que` · diff vacio de `session.spec.ts` y `permisos.spec.ts` (§T7) |
| R11 | los **cuatro** casos, premisa `expect(landing).not.toBe(RUTA_DEL_MODULO)` con el destino derivado por `loginAndLand`: `e2e/pedidos.spec.ts:440` `un usuario sin pedidos.consultar recibe 404 dentro del layout privado y no ve ningun dato de pedidos (R49)`; `e2e/proveedores.spec.ts:455` `... ningun dato de proveedores (R52)`; `e2e/recetas.spec.ts:369` `... ningun dato de recetas (R6)` (los tres con el Operador); y `e2e/inventario.spec.ts:606` `un usuario sin inventario.consultar recibe 404 dentro del layout privado y no ve el catalogo (R4)` con el usuario de R25 · verdes en chromium y webkit: T12 (los tres) y T14 (d) / §T16 (los cuatro) |
| R12 | los mismos cuatro casos: `status 404`, pathname sin redireccion y `private-not-found` visible · inventario `:606` con `INVENTORY_ROUTE` |
| R13 | los mismos cuatro casos: cuentas cero conservadas y `R49`/`R52`/`R6`/`R4` en el titulo · inventario `:606`: cuenta cero de `inventario-title`, `data-table` y `product-list-empty`, su usuario en la misma empresa del catalogo |
| R14 | `e2e/login.spec.ts:386` (unico caso nuevo) |
| R15 | `e2e/login.spec.ts:386` paso 1: `pathname === landing` derivado |
| R16 | `e2e/login.spec.ts:386` paso 2: `private-not-found`, `private-nav`, `private-logout` |
| R17 | `e2e/login.spec.ts:386` paso 4: cerrar sesion -> `LOGIN_PATH`, `goBack` -> `LOGIN_PATH`, cero armazon privado |
| R18 | `e2e/login.spec.ts:386` paso 3: cuenta cero de `MODULE_DATA_TESTIDS` · resultado en §T12 |
| R19 | §T10 y su revision §T15 (2026-09-15 11:18:42, `e40203b`, arbol con T14): `permissions.ts` cambios=0; Operador = `['inventario.consultar', 'asignaciones.consultar']` (`permissions.ts:165`) |
| R20 | §T10 y §T15: `login-action.ts`, `private-nav.ts`, `app/(private)/not-found.tsx` cambios=0 |
| R21 | §T10 y §T15: diff vacio en `app lib db scripts package.json pnpm-lock.yaml` |
| R22 | §T10 y §T15: `package.json` y `pnpm-lock.yaml` cambios=0 (la guardia `guard-dependencias-aprobadas` la corre el gate del leader) |
| R23 | §T1 (antes), §T12 (despues) y su revision §T16 (despues de la enmienda): suite completa, chromium + webkit, base limpia copiada de la plantilla |
| R24 | §T12 y §T16: cada rojo superviviente con causa nombrada, distinta del aterrizaje y con destino propuesto |
| R25 | `e2e/inventario.spec.ts:606` `un usuario sin inventario.consultar recibe 404 dentro del layout privado y no ve el catalogo (R4)`: entra `noInventoryUser`, del rol efimero `qc22_e2e_rol_<RUN_ID>`, no el Operador ni un rol del seed · verde en chromium y webkit (§T14 (d)) |
| R26 | `e2e/inventario.spec.ts:611-614`: `expect(await permissionsForUsername(noInventoryUser.username), 'la premisa del caso: ...').not.toContain('inventario.consultar')` antes de `loginAndLand` · **muerde**: con el rol mutado para tener `inventario.consultar`, rojo en la premisa (`:614`) en chromium y webkit, restaurado con `cp` y diff vacio (§T14 (f), `progress/e2e_QC-93_T14_mutacion_R26.log`) |
| R27 | `e2e/inventario.spec.ts`: `role.create` sin `permissions` tras la empresa (`:360`), usuario en la misma empresa (`:371`), `afterAll` borra el rol por nombre exacto despues de los usuarios y antes de la empresa (`:400`) · tras la corrida: `roles qc22_e2e_rol_*: 0`, `usuarios qc22_e2e_*: 0`, `empresas qc22_e2e_*: 0`, roles del seed intactos y `role_permissions` en 17 (§T14 (e)) |
| R28 | `e2e/inventario.spec.ts`, barrido de huerfanos del `beforeAll` (`:326-345`): roles viejos del prefijo primero, sus usuarios aunque sean recientes, luego los roles, luego las empresas · comprobacion de residuo de §T14 (e). Limite anotado en §T14 (f): el barrido no puede borrar un rol del prefijo CON permisos, que R27 prohibe crear |
