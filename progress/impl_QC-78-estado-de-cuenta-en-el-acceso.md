# QC-78 — estado-de-cuenta-en-el-acceso · bitacora del implementer

> Zona `backend` · complejidad `medium` · depends_on `QC-65` ·
> Rama `feature/QC-78-estado-de-cuenta-en-el-acceso`, nacida de `origin/dev` en `c870825`.
> Worktree: `.worktrees/QC-78-estado-de-cuenta-en-el-acceso/`, con `.env` propio contra
> **`QuimiCloude_QC78`** (creada, migrada y sembrada antes de empezar; las pruebas de
> integracion de esta bitacora corrieron contra ella).
> Requisitos R1..R28 en `specs/QC-78-estado-de-cuenta-en-el-acceso/requirements.md`.
> Fase **F2.1**: no se abrio PR, no se sincronizo con `dev` y no se corrio `./init.sh`.

## T1 — lo que dejo QC-65, leido del archivo real (no del diseno)

`design.md > 0` referencia los simbolos de `account-status.ts` «por su papel» a proposito y manda
leer los identificadores de verdad en la rama. Leidos:

| Simbolo exportado | Valor / forma |
|---|---|
| `USER_ACCOUNT_STATUSES` | `['active', 'pending', 'inactive', 'blocked'] as const` |
| `UserAccountStatus` | `(typeof USER_ACCOUNT_STATUSES)[number]` |
| `INITIAL_USER_ACCOUNT_STATUS` | `'pending'` |
| `SEED_ADMIN_ACCOUNT_STATUS` | `'active'` |

**No existe ninguna constante `ACCOUNT_STATUS_ACTIVE`**, que es como la nombra el pseudocodigo de
`design.md > 5`. No se creo un alias (lo prohibe el propio diseno): cada lector declara su
constante local tipada como `UserAccountStatus`.

Las tres columnas de QC-65 existen en `db/schema.prisma` (solo lectura, lineas 124, 194, 199, 210):
`accountStatus` (enum `UserAccountStatus`, `@default(pending)`), `accountStatusChangedAt`
(`@default(now())`, **sin** `@updatedAt`) y `accountStatusChangedBy` (nullable, FK a `users`).
Y las de QC-19: `failedLoginAttempts`, `lockLevel`, `lockedUntil` (lineas 181-183).

## Archivos tocados — 19, exactamente los que declara `tasks.md`

Comprobado contra el rango real (`git merge-base origin/dev HEAD` = `c870825`) mas el arbol: la
lista de archivos tocados **coincide exactamente** con la lista declarada por el spec, sin
sobrantes y sin faltantes.

**Produccion (8, todos dentro de `lib/modules/identity/`)**

| Archivo | Que cambia |
|---|---|
| `domain/effective-account-status.ts` **(NUEVO)** | `effectiveAccountStatus`, `accountStatusAfterAttempt`, `clearedLockState`. Dominio puro: `now` por parametro, sin Prisma, sin `next/*`, sin `lib/shared/**`. Reutiliza `isLocked` de `account-lock.ts` — la comparacion de plazos sigue teniendo **una sola** implementacion. |
| `domain/verify-credentials.ts` | El `if (isLocked(...))` de QC-19 se sustituye por el corte de estado efectivo. `registrarFallo` lleva ahora el estado de cuenta a lo largo del bucle. |
| `domain/resolve-session.ts` | Sexto corte de la cadena, `if` propio detras del de empresa no viva. |
| `ports/user-credentials-reader.ts` | `AuthenticatableUser` gana `accountStatus` **crudo**. |
| `ports/login-attempt-recorder.ts` | `compareAndSet(userId, esperado, siguiente, now, estadoCuentaEsperado, estadoCuenta)` y `set(userId, estado, estadoCuenta)`. `null` = no tocar la columna ni su rastro. |
| `ports/session-user-reader.ts` | `SessionUserRecord` gana `accountStatus` y `lockedUntil`, crudos. |
| `adapters/driven/persistence/user-credentials-prisma.ts` | `u.account_status` en el `SELECT`; estado esperado en el `where` del CAS; trio de columnas de rastro en el `data` solo si hay estado que escribir. |
| `adapters/driven/persistence/session-user-prisma.ts` | `accountStatus: true` y `lockedUntil: true` en el **mismo** `findFirst`. |

**Tests y E2E (9)**

`tests/unit/identity/effective-account-status.test.ts` **(NUEVO, 26 casos)**,
`tests/unit/identity/qc78-alcance.test.ts` **(NUEVO, 16 casos)**,
`tests/unit/identity/verify-credentials.test.ts`, `tests/unit/identity/resolve-session.test.ts`,
`tests/unit/identity/resolve-session-user.test.ts` (fixtures),
`tests/unit/composition/identity-facade.test.ts` (fixtures),
`tests/unit/identity/account-status-scope.test.ts` (T9, ver abajo),
`tests/integration/identity/login.int.test.ts`,
`tests/integration/identity/session-user.int.test.ts`,
`e2e/login.spec.ts`, `e2e/session.spec.ts`.

**Sin tocar, y verificado sobre el diff:** `db/schema.prisma`, `db/migrations/**`, `package.json`,
`pnpm-lock.yaml`, `lib/composition/**`, `lib/modules/identity/index.ts`,
`lib/modules/identity/domain/account-lock.ts`, `lib/modules/identity/domain/account-status.ts`,
`app/**`, `components/**`, `hooks/**`, `middleware.ts`, `docs/dependencias.md`.

## Las seis decisiones que esta ficha no podia equivocar

1. **El corte va DESPUES del hash** (R2). La verificacion se calcula siempre, aunque el camino de
   rechazo por estado no la mire. Lo prueba un test que **congela la promesa del hasher** y
   comprueba que el caso de uso todavia **no ha respondido**: si el corte se adelantara,
   responderia antes de que el hash terminara.
2. **Misma instancia** (R3). `toBe` entre el rechazo por estado, el de contrasena mala y el de
   usuario inexistente, mas `Object.keys(...)` igual a `['ok']` para que nadie le cuelgue un
   `reason`.
3. **`pending` e `inactive` no escriben NADA** (R5, R6). El corte va **antes** del `!correcta`, o
   sea antes de `registrarFallo`. La **asimetria deliberada** con el corte por empresa de QC-48
   —que va **despues**— queda escrita en el comentario del propio archivo, con su motivo y con la
   contrapartida asumida a conciencia (quien pruebe contrasenas contra una cuenta no activa no se
   topa con un bloqueo). Sin ese comentario, la proxima refactorizacion los «uniforma».
4. **Una sola traduccion** (R7). Los dos lectores —el login y la resolucion de sesion— pasan por
   `effectiveAccountStatus`. `resolve-session.ts` **no** compara `record.accountStatus` a pelo:
   una mutacion temporal a esa forma pone en rojo exactamente 2 casos, los de `active` con plazo
   futuro y `blocked` con plazo vencido (R11, R8 vistos desde la sesion). Medido y revertido.
5. **Nunca `blocked` + plazo vacio** (R15). `accountStatusAfterAttempt` devuelve `'active'` cuando
   el estado de bloqueo se queda sin plazo sobre una fila `blocked`. Hay un test que recorre los
   cuatro estados almacenados y afirma que **con un estado de bloqueo limpio jamas devuelve
   `'blocked'`**.
6. **El estado leido entra en el predicado del CAS** (R18, R19). El `where` gana
   `accountStatus: estadoCuentaEsperado`. Si cambio entre lectura y escritura no aplica, se relee
   y se recalcula; y si el fresco ya no es efectivamente `active`, se abandona sin escribir.
   Probado con puertos falsos **y** contra Postgres real.

**El predicado por rango que evita el ABA quedo intacto.** `git diff | grep` sobre la linea
`OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }]` sale **vacio**: la barrera de QC-19
no aparece en el diff ni como linea modificada.

## T9 — la guardia de alcance de QC-65 mordio, y se amplio sin relajarla

`tests/unit/identity/account-status-scope.test.ts` rechazaba a los lectores nuevos. Su caso de R19
compara con **igualdad** contra `SITIOS_PERMITIDOS` y **no** esta gateado por la precondicion de
rama (solo lo estan los tres que miran el diff), asi que mordia sobre el arbol. Se hizo lo que
manda `tasks.md`: **ampliar la lista, jamas relajar el criterio**.

- `SITIOS_PERMITIDOS` pasa de 5 a **13**, uno por linea y con el requisito de QC-78 que lo
  autoriza en el comentario. La comparacion **sigue siendo `toEqual`**, no `toContain`.
- `PIEZAS_DE_QC19` se reduce a **solo** `account-lock.ts`. Sale `verify-credentials.ts` porque
  QC-78 lo contradice **por diseno**: el propio `account-status.ts` de QC-65 dice literalmente
  «Es LA MISMA COSA que el bloqueo por intentos fallidos de QC-19, pero QC-65 no los unifica: eso
  es QC-78». La politica de escalada —lo que R14 declara intocable— **sigue vigilada**, con su
  ancla positiva sobre `failed...attempts`.
- El caso de caminos sensibles pierde `verify-credentials.ts` (citando R1); los otros cuatro
  —`resolve-session-user.ts`, `session-user.ts`, `route-access.ts`, `middleware.ts`— **se quedan y
  siguen mordiendo**.

**Prueba de que sigue mordiendo.** Con un `lib/modules/identity/domain/tmp-mordida.ts` temporal que
nombra el estado: `expected [ ...(14) ] to deeply equal [ ...(13) ]`, `1 failed`. Borrado el
archivo: `6 passed | 3 skipped`.

## T13 — la guardia de alcance de la ficha, y la bomba de relojeria que NO se repite

`tests/unit/identity/qc78-alcance.test.ts` afirma sobre el diff: cero cambios en `db/schema.prisma`
y `db/migrations/` (R26), cero en `package.json` y `pnpm-lock.yaml` (R27), y ningun proceso de
fondo ni route handler nuevo bajo `app/api/` (R23).

`progress/history.md` registra que las guardias de QC-45 y QC-65 quedaron mergeadas y empezaron a
poner en rojo el gate de todas las ramas siguientes. Esta distingue **tres** situaciones:

- «**no puedo mirar**» (el `merge-base` no resuelve) da **ROJO**, lanza;
- «**esto no es lo mio**» da `ctx.skip()` con mensaje que dice que **NO HA COMPROBADO NADA**, via
  precondicion **conjuntiva** (`effective-account-status.ts` **y** algo bajo
  `specs/QC-78-.../`). No usa este propio archivo de test como senal;
- «**no hay nada que mirar**» (rango vacio) da `ctx.skip()` igual de ruidoso.

Mas cuatro anclas independientes del rango, para que un helper roto no deje todo en verde.

**Las tres mordidas exigidas, demostradas y revertidas:**

| Mutacion temporal | Resultado | Revertida |
|---|---|---|
| comentario al final de `db/schema.prisma` | ROJO por R26: `expected [ 'db/schema.prisma' ] to deeply equal []` | `git checkout --`, status vacio |
| espacio en `package.json` (sigue parseando) | ROJO por R27 | `git checkout --`, status vacio |
| `app/api/tmp-qc78/route.ts` con `setInterval` | ROJO por R23, **dos** casos | `rm -rf`, carpeta inexistente |

**Un bug real que destapo la demostracion, y que vale mas que la guardia misma:** la mutacion 3
salio **verde** en la primera corrida. `git status --porcelain` colapsa una carpeta sin seguimiento
en una sola linea y **nunca lista el archivo de dentro**. Corregido con `--untracked-files=all`.
**`tests/unit/identity/account-status-scope.test.ts` (de QC-65) tiene el mismo punto ciego
latente**: no se toco, queda anotado para el leader.

## Mapa `R1..R28` a test

Cada fila se verifico **abriendo el caso**, no fiandose del nombre (la leccion de QC-45 y QC-65).
Abreviaturas: `EAS` = `tests/unit/identity/effective-account-status.test.ts`,
`VC` = `tests/unit/identity/verify-credentials.test.ts`,
`RS` = `tests/unit/identity/resolve-session.test.ts`,
`ALC` = `tests/unit/identity/qc78-alcance.test.ts`,
`LOGIN.INT` = `tests/integration/identity/login.int.test.ts`,
`SU.INT` = `tests/integration/identity/session-user.int.test.ts`.

| R | Archivo | Caso |
|---|---|---|
| R1 | `VC` | `una cuenta pending / inactive / blocked con plazo vigente no entra ni con la contrasena correcta, y no se emite sesion` (`it.each`, 3) |
| R1 | `LOGIN.INT` | `una cuenta pending o inactive no entra contra la base ni con la contrasena correcta` |
| R2 | `VC` | `el camino pending / inactive / blocked con plazo vigente / active verifica el hash exactamente una vez` (`it.each`, 4) |
| R2 | `VC` | `el corte por estado ocurre DESPUES de la verificacion de hash, no antes` (congela la promesa del hasher) |
| R3 | `VC` | `el rechazo por estado es la MISMA INSTANCIA que el de contrasena mala y el de usuario inexistente` |
| R3 | `VC` | `los tres estados no activos devuelven exactamente el mismo objeto` |
| R4 | `VC` | `una cuenta ... no entra ni con la contrasena correcta, y no se emite sesion` (afirma `startSession` no invocado) |
| R5 | `VC` | `una cuenta pending / inactive no escribe ninguna columna, ni con contrasena correcta ni con incorrecta` (`it.each`, 2) |
| R6 | `VC` | el mismo caso: `compareAndSet` y `set` con `toHaveBeenCalledTimes(0)` |
| R6 | `e2e/login.spec.ts` | `una cuenta que no esta activa ve el MISMO mensaje ..., no recibe sesion y no deja rastro` (relee las 4 columnas antes y despues) |
| R7 | `EAS` | `la misma ficha da bloqueada antes del plazo y activa despues, solo por el instante recibido` |
| R7 | `EAS` | `devuelve un estado del catalogo para cualquier combinacion de estado almacenado y plazo` (itera `USER_ACCOUNT_STATUSES`) |
| R7 | `EAS` | `no devuelve nunca un estado distinto del almacenado sin que medie el plazo o el bloqueo` |
| R8 | `EAS` | `una cuenta bloqueada con el plazo ya vencido esta activa` y `sigue activa cuanto mas lejos queda el plazo vencido` |
| R8 | `RS` | `una cuenta blocked con el plazo ya vencido conserva la sesion y la proyeccion completa` |
| R9 | `EAS` | `una cuenta bloqueada sin plazo sigue bloqueada en el instante evaluado` y `sigue bloqueada en un instante muy lejano y en uno anterior` |
| R10 | `EAS` | `una cuenta bloqueada con el plazo todavia futuro esta bloqueada` y `sigue bloqueada en el ultimo milisegundo del plazo` |
| R10 | `RS` | `una cuenta blocked con el plazo todavia futuro deja de tener sesion` |
| R11 | `EAS` | `una cuenta activa con plazo futuro esta bloqueada` y `esa misma cuenta vuelve a estar activa en cuanto el plazo se cumple` |
| R11 | `RS` | `una cuenta active con lockedUntil futuro deja de tener sesion` |
| R12 | `EAS` | `una cuenta pendiente sigue pendiente con plazo futuro, vencido o vacio` y `una cuenta inactiva sigue inactiva con plazo futuro, vencido o vacio` |
| R13 | `EAS` | `un estado de bloqueo con plazo sobre una cuenta activa manda escribir bloqueada` |
| R13 | `VC` | `el quinto fallo escribe blocked junto con el plazo, y sin autor` |
| R13 | `LOGIN.INT` | `el quinto fallo deja la fila en blocked, con plazo y sin autor` (`account_status_changed_by` a `null` contra Postgres) |
| R14 | `EAS` | `los cuatro primeros fallos no mandan escribir nada y el quinto manda bloquear` (encadena `nextLockState` real), `los plazos siguen siendo los de la politica, 1, 5, 15 y 60 minutos` y `no existe bloqueo automatico sin plazo: todo estado que manda bloquear trae plazo` |
| R14 | `VC` | `el bloqueo desde el nivel 0/1/2/3 conserva el plazo que declara LOCK_DURATIONS_MS` (`it.each`, 4) |
| R15 | `EAS` | `un fallo suelto sobre una cuenta bloqueada con el plazo caducado la devuelve a activa`, `un ingreso correcto sobre una cuenta bloqueada la devuelve a activa` y `nunca manda escribir bloqueada cuando el estado de bloqueo se queda sin plazo` |
| R15 | `VC` | `un fallo suelto sobre una fila blocked con el plazo ya vencido la devuelve a active` |
| R16 | `VC` | `un login correcto sobre una cuenta blocked vencida reinicia contador y nivel y la deja active` |
| R17 | `EAS` | `una cuenta ya bloqueada que sigue bloqueada no manda tocar la columna` y `una cuenta activa que sigue activa no manda tocar la columna` |
| R17 | `VC` | `no se escribe el estado cuando no cambia: ni en el exito ni en un fallo suelto` |
| R18 | `VC` | `el CAS que pierde la carrera se recalcula sobre el estado de cuenta fresco` |
| R18 | `LOGIN.INT` | `el CAS no aplica si el estado de cuenta cambio entre la lectura y la escritura` |
| R19 | `VC` | `si al releer la fila fresca esta inactive / blocked con plazo futuro, se abandona sin escribir` (`it.each`, 2) |
| R20 | `RS` | `una cuenta que pasa a pending deja de tener sesion en la siguiente resolucion`, `... inactive ...`, `una cuenta blocked con el plazo todavia futuro deja de tener sesion`, `con la empresa muerta y ademas el estado inactive sigue resolviendo null` y `con la empresa muerta el estado de cuenta ni se lee: el corte 6 va detras del 5` |
| R20 | `e2e/session.spec.ts` | `una sesion abierta cuya cuenta deja de estar activa no llega a la siguiente pantalla privada y acaba en el login` |
| R21 | `RS` | `el camino cortado por estado consulta al lector exactamente una vez` y `sus dependencias son dos lectores y ningun puerto de escritura` |
| R21 | `SU.INT` | `trae accountStatus y lockedUntil de la fila real en la misma unica consulta` |
| R22 | `RS` | `no depende de ningun sello ni registro de invalidacion de sesiones` |
| R23 | `ALC` | `ningun archivo de produccion del diff arranca un proceso de fondo` y `el diff no anade ningun route handler bajo app/api/` |
| R24 | `EAS` | `devuelve contador a cero, nivel a cero y plazo vacio` y `limpia tambien partiendo de un bloqueo escalado y vigente` |
| R25 | `EAS` | `un fallo sobre el estado limpio no rebloquea y arranca una serie nueva` y `hacen falta otros cinco fallos para volver a bloquear` |
| R25 | `VC` | `tras clearedLockState el siguiente fallo cuenta como el primero y no rebloquea` |
| R26 | `ALC` | `el diff de la rama no toca db/schema.prisma ni db/migrations/` |
| R27 | `ALC` | `el diff de la rama no toca package.json ni pnpm-lock.yaml` |
| R28 (a) | `e2e/login.spec.ts` | `una cuenta que no esta activa ve el MISMO mensaje que una contrasena mala, no recibe sesion y no deja rastro` |
| R28 (b) | `e2e/session.spec.ts` | `una sesion abierta cuya cuenta deja de estar activa no llega a la siguiente pantalla privada y acaba en el login` |

**Ningun `R<n>` queda sin test.** Los 28 estan cubiertos.

Sobre R28 (a): el criterio de «el mismo mensaje» **no** se compara contra un literal copiado. El
test captura el texto que muestra la pantalla en el caso de **contrasena incorrecta** y afirma la
igualdad con el del caso de estado no activo; `GENERIC_CREDENTIALS_ERROR` solo hace de ancla. El
toast se localiza por `[data-sonner-toast]` (atributo estructural), no por su texto: localizarlo
por texto habria vuelto la comparacion una tautologia.

Sobre R21 y R22: se afirman ademas sobre el fuente de `resolve-session.ts` leido con `readFileSync`
y **con los comentarios eliminados**, porque los propios comentarios del archivo mencionan QC-23 y
la palabra «invalidacion»; sobre el texto crudo la asercion habria sido falsa. R21 anade un
`Record<keyof ResolveSessionDeps, true>` exhaustivo: una clave nueva en las dependencias deja de
tipar en compilacion y el `Object.keys` muerde al ejecutar.

## Salida real de los tests

Reparto del implementer segun `docs/verification.md`. **El gate (`./init.sh` y `--rapido`) lo corre
el leader**, no esta bitacora.

```
$ pnpm typecheck
app/layout.tsx                                   1 error
tests/unit/recetas/recipe-lines-catalog.test.ts  2 errores
tests/unit/recetas/recipe-service.test.ts        1 error
```

**Los cuatro son PREEXISTENTES y ajenos**, medidos sobre el arbol limpio de la rama antes de
escribir una linea (`git stash -u` mas `pnpm typecheck` sobre `c870825`). **Cero errores nuevos.**

```
$ pnpm lint
(sin salida, exit 0)

$ pnpm exec vitest run  <8 archivos: EAS, VC, RS, resolve-session-user, account-lock,
                         account-status-scope, qc78-alcance, identity-facade>
 Test Files  8 passed (8)
      Tests  142 passed | 3 skipped (145)
   Duration  8.46s

$ pnpm exec vitest run tests/integration/identity/login.int.test.ts \
                       tests/integration/identity/session-user.int.test.ts
 Test Files  2 passed (2)
      Tests  29 passed (29)
   Duration  12.05s          (contra QuimiCloude_QC78, base real)

$ pnpm exec vitest run guard
 Test Files  25 passed (25)
      Tests  232 passed | 4 skipped (236)
   Duration  7.29s

$ pnpm exec playwright test --list e2e/login.spec.ts e2e/session.spec.ts
 Total: 12 tests in 2 files      (4 de login + 2 de session, por Chromium y WebKit)
```

Los 3 `skipped` de los unitarios son los tres casos de `account-status-scope.test.ts` que miran el
diff y se declaran mudos fuera de la rama de QC-65: su comportamiento correcto y documentado.

**Los E2E NO se ejecutaron**, solo se listaron: levantar `next dev` y dos navegadores esta fuera
del reparto del implementer. La ejecucion la decide el leader.

**No se corrio la suite completa** a proposito (`docs/verification.md > El gate tiene DOS niveles`).
Una corrida accidental de `vitest related` sobre archivos de `lib/` arrastro 170 ficheros y termino
`3 failed | 2307 passed`; los tres fallos son ajenos a esta ficha:
`tests/unit/recetas/recipe-lines-catalog.test.ts` y `tests/unit/recetas/recipe-service.test.ts`
(los mismos del typecheck preexistente, por `ProductRef.stock`) y
`tests/unit/unidades/modulo-intacto.test.ts`, que **ya esta en `tests/baseline-rojos.json`**.
Ninguno es de `identity`.

## Limites conocidos y cosas que decide el leader

1. **La rama viene con typecheck en rojo desde `origin/dev`.** Cuatro errores en `app/layout.tsx` y
   `tests/unit/recetas/*`, medidos sobre el arbol limpio. **No estan en `tests/baseline-rojos.json`**
   y `./init.sh` va a caer por ellos. No son de QC-78 y no se tocaron: el spec no declara esos
   archivos. Decide el leader si se arreglan aparte o entran al baseline.
2. **Los otros ocho specs de `e2e/` dejan de pasar con esta ficha, y no estan en el alcance.**
   `inventario`, `pedidos`, `permisos`, `presentaciones`, `proveedores`, `recetas`, `recetas-pasos`
   y `unidades` crean su usuario efimero con `prisma.user.create` **sin** `accountStatus`, o sea
   `pending` por el `@default` de la columna, y entran por el formulario real. Desde R1, `pending`
   no entra. Es **un** sitio de creacion por archivo, dentro de un unico helper: **una linea por
   archivo** (`accountStatus: 'active'`). No se tocaron porque `tasks.md` dice que si aparece un
   archivo no listado **se para y se actualiza el spec antes de editarlo**. `./init.sh` no corre
   Playwright, asi que el gate no lo cazara: hace falta decision explicita.
3. **`account-status-scope.test.ts` (de QC-65) tiene un punto ciego latente:** su
   `archivosTocados()` usa `git status --porcelain` sin `--untracked-files=all`, que colapsa una
   carpeta nueva en una sola linea y no lista lo de dentro. Se descubrio al demostrar la mordida de
   la guardia de esta ficha, que si lo corrige. No se arreglo alli: es un archivo de QC-65 y el
   cambio no lo pide ningun `R<n>` de QC-78.
4. **R13 pide «el instante del intento» y `setLoginAttempt` toma `new Date()`**, porque el puerto
   `set` no recibe reloj del dominio (el camino de exito no tiene predicado que evaluar contra un
   plazo). La diferencia es de microsegundos y no es observable; queda comentada en el adaptador en
   vez de anadir un parametro mas al puerto.
5. **Firma de `compareAndSet`:** los cuatro parametros originales quedan **en su sitio** y los dos
   nuevos van al final. Es lo que permite que `lib/composition/index.ts` siga casando
   estructuralmente **sin tocarlo** (condicion para no cruzarse con QC-83) y que las
   desestructuraciones por indice que ya existian en los tests no se rompieran en silencio.

## Estado

**T1..T15 cerradas.** T16, T17 y T18 son del leader (gate rapido por tanda, gate completo y
`reviewer`). Esta feature termina en **F2.1**: sin PR, sin sincronizar con `dev`, sin `./init.sh`.
