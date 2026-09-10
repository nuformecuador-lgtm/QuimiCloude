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


## Ampliacion del 2026-09-10 — los ocho E2E que R1 rompia (T19)

Decision humana del 2026-09-10, subida por el leader: el alcance se amplia y la reparacion entra
en esta ficha. **No es un requisito nuevo**: los aprobados siguen siendo R1..R28 y **no hay R29**.

> ⚠️ **CADUCADO EN PARTE ese mismo dia. Manda la seccion «Tanda 5 — la marca de sesion cortada»
> de mas abajo: R29 y R30 SI existen.** Se aprobaron *despues* de escribir este parrafo, cuando el
> E2E de R28 (b) destapo el bucle de redirecciones. Lo que sigue siendo cierto aqui es lo demas:
> los ocho E2E fueron una reparacion colateral de R1 y no trajeron requisito propio. (Nota anadida
> tras el review de F2.2, menor 7.)
El bloque de ampliacion y la tarea T19 estan en `tasks.md`, commiteados **antes** de tocar ningun
`.spec.ts`.

**Los ocho archivos, una linea cada uno:** `e2e/inventario.spec.ts`, `e2e/pedidos.spec.ts`,
`e2e/permisos.spec.ts`, `e2e/presentaciones.spec.ts`, `e2e/proveedores.spec.ts`,
`e2e/recetas.spec.ts`, `e2e/recetas-pasos.spec.ts`, `e2e/unidades.spec.ts`.

Se comprobo que **no hay helper compartido**: cada spec tiene el suyo, local, con un unico
`prisma.user.create`. Son ocho cambios de una linea (`accountStatus: 'active'`) y no uno en un
sitio comun. Diff total: **32 inserciones, 0 borrados**, cero aserciones tocadas.

> **Una nota de honestidad sobre «una linea».** Ademas del campo, cada sitio lleva **tres lineas de
> comentario** que citan R1 y explican por que el estado va explicito. Es la convencion del repo
> —el resto de fixtures de esta ficha la siguen— pero el encargo decia «una linea por archivo», asi
> que queda dicho en vez de escondido. Si el reviewer prefiere el campo pelado, se quitan.

**Un error propio, corregido antes de commitear:** el primer intento reescribio siete de los ocho
archivos enteros (2.988 inserciones / 2.956 borrados) porque el script normalizo los finales de
linea. Los specs de `e2e/` tienen finales **mezclados** en este repo (`permisos.spec.ts` es CRLF,
los otros siete LF). Se revirtio con `git checkout -- e2e/` y se rehizo byte a byte, copiando el
terminador de la propia linea ancla. El diff final es el de arriba.

## LA VERIFICACION E2E ENCONTRO UN DEFECTO REAL — BUCLE DE REDIRECCIONES

**Esto es un bloqueante y no lo arreglo por iniciativa propia.** Lo destapo justamente correr
Playwright de verdad en vez de razonar sobre el codigo.

`e2e/session.spec.ts:260` —el test de **R28 (b)**, el que demuestra el titular de la ficha— **FALLA
en los DOS navegadores**:

```
Error: page.goto: Load cannot follow more than 20 redirections
Call log:
  - navigating to "http://localhost:3117/inventario", waiting until "load"
  > 289 |     await page.goto(INVENTORY_ROUTE);
```

### El mecanismo, confirmado leyendo los dos archivos implicados

1. La cuenta pasa a `inactive`. `GET /inventario`: el middleware ve la cookie **firmada y no
   caducada** y deja pasar, porque decide **solo** con el contenido firmado y **nunca** con la base
   (QC-9 R4, QC-75 R18 — el borde tiene prohibido consultar).
2. El layout privado llama a `resolveSession`: el sexto corte de QC-78 devuelve `null` (R20) y
   **redirige al login**, llevando la ruta pedida como destino de vuelta (QC-75 R17).
3. `GET /login` con ese destino de vuelta: el middleware aplica su **regla 3**, escrita en
   `route-access.ts`: «Login + sesion -> al destino de vuelta valido si lo hay, si no al
   dashboard». La cookie **sigue viva porque R20 prohibe borrarla**, asi que redirige a
   `/inventario`.
4. Vuelta al paso 2. **Bucle infinito.**

El usuario cuya cuenta se apaga **no acaba en el login**: acaba en un error del navegador. Es
exactamente lo contrario del titular de la ficha.

### Por que NO lo he arreglado

Las cuatro salidas posibles chocan **todas** con una decision cerrada o con una ficha excluida:

| Salida | Con que choca |
|---|---|
| Borrar la cookie en el corte | Decision cerrada del 2026-09-08: «**sin borrar la cookie** y sin mensaje que diga por que» (R20) |
| Que el middleware consulte la base | QC-9 R4 y QC-75 R18 (el borde no toca la base) y **R21** de esta ficha (cero consultas nuevas) |
| Que `/login` deje de redirigir a quien trae cookie viva | Es QC-9 R17 / QC-75 R17, y para decidirlo bien haria falta la base: mismo choque que la anterior |
| El sello de invalidacion por usuario | **R22** lo prohibe explicitamente: QC-23 no es dependencia de esta ficha |

Elegir una es reabrir una decision que fijo el humano, y eso no me toca. **Lo sube el leader.**

### Alcance real del defecto: es MAS VIEJO que esta ficha

Los cortes de **QC-8 R11** (`deleted_at`) y **QC-48 R15** (empresa muerta) tienen la **misma forma**
—`resolveSession` devuelve `null` con la cookie viva— asi que producen **el mismo bucle**. Nadie lo
habia visto porque **no hay ningun E2E que abra sesion y luego mate la ficha o la empresa**: el
E2E de empresa dada de baja de QC-48 va por el **login**, donde nunca llega a haber cookie.

O sea: QC-78 **no inventa el bucle, lo hace alcanzable** por el camino que la ficha existe para
cubrir. Eso importa para decidir donde se arregla — puede que no sea en esta ficha.

## Salida real de Playwright (T19 y R28)

`pnpm exec playwright test e2e/login.spec.ts e2e/session.spec.ts e2e/permisos.spec.ts e2e/pedidos.spec.ts`
da **10 passed, 8 failed (3.8m)**, en Chromium y WebKit.

**Verde, y es lo que la ficha aporta:**

| Test | Chromium | WebKit |
|---|---|---|
| `login.spec.ts` › `una cuenta que no esta activa ve el MISMO mensaje que una contrasena mala, no recibe sesion y no deja rastro` (**R28 a**) | PASA | PASA |
| `login.spec.ts` › `entra con credenciales correctas y recibe la cookie de sesion httpOnly` | PASA | PASA |
| `login.spec.ts` › `con la empresa dada de baja no entra pese a tener las credenciales correctas` | PASA | PASA |
| `session.spec.ts` › `pide una pantalla privada sin sesion, entra, aterriza en ella, ve su nombre, cierra sesion y atras no muestra la zona privada` | PASA | PASA |
| `pedidos.spec.ts` › `el Administrador entra, da de alta un pedido, lo ve por su correlativo y lo cancela con motivo (R48)` | flake de base (ver abajo) | **PASA** |

Que `pedidos R48` y los tres de `login` pasen **demuestra que la reparacion de T19 funciona**: esos
usuarios efimeros nacian `pending` y hoy entran.

**Rojo, con su atribucion:**

| Test | Navegadores | De quien es |
|---|---|---|
| `session.spec.ts:260` (**R28 b**) | **los dos** | **DE ESTA FICHA.** El bucle de redirecciones de arriba. Bloqueante. |
| `permisos.spec.ts:201` | los dos | **NO es de QC-78.** El artefacto de fallo muestra que el Operador **si aterrizo en la zona privada** —el menu lateral corto se renderizo con «Inventario»—, o sea que login y resolucion de sesion funcionaron. Lo que falta es `private-user-trigger`, un control del layout. QC-78 no toca `app/**` ni `components/**`. |
| `pedidos.spec.ts:447` | los dos | **NO es de QC-78.** El login **funciono** y navego a la zona privada; lo que falla es que el helper `login()` espera `DASHBOARD_ROUTE` y un usuario no-Administrador aterriza en `/inventario` (aterrizaje por permisos, QC-75). Nada que ver con el estado de cuenta. |
| `login.spec.ts:324` | **solo Chromium** | **Flake de infraestructura.** El log trae `Can't reach database server at localhost:5432` durante esa ventana. **Pasa en WebKit.** |
| `pedidos.spec.ts:342` | **solo Chromium** | Misma ventana de caida de la base. **Pasa en WebKit.** |

Sobre la caida de Postgres: hay **otra sesion de Claude trabajando en este repo** ahora mismo, y la
propia `tests/baseline-rojos.json` documenta desde el 2026-09-10 un flake de **saturacion** por esa
causa. No se re-ejecutaron los dos de Chromium para no gastar otros 4 minutos de reloj en algo que
ya paso en el otro navegador; **queda dicho, no tapado**.

## Lo que NO se ejecuto, y hay que saberlo

**Seis de los ocho reparados NO se corrieron:** `inventario`, `presentaciones`, `proveedores`,
`recetas`, `recetas-pasos` y `unidades`. Llevan **exactamente el mismo** cambio de una linea que
`permisos` y `pedidos`, en la misma posicion del mismo tipo de helper, y el diff de los ocho es
identico salvo el nombre del fixture. Pero **eso es un argumento, no una medicion**: si el reviewer
quiere los ocho verdes, hay que correrlos.

Tampoco se corrio la suite E2E entera ni `./init.sh`.

## Estado

**T1..T15 y T19 cerradas** en cuanto a codigo escrito. **La ficha NO esta lista para el reviewer
sin una decision del leader**, porque su requisito titular —R20 y R28 (b), «quien deja de estar
activo sale en la siguiente pantalla»— **no se cumple en un navegador real**: se cumple el corte
(la sesion no se resuelve) pero el usuario acaba en un bucle de redirecciones en vez de en el
login, y la salida exige reabrir una decision cerrada.

T16, T17 y T18 siguen siendo del leader. Sigue en **F2.1**: sin PR, sin sincronizar con `dev`, sin
`./init.sh`.

---

## Tanda 5 — la marca de sesion cortada (R29, R30), 2026-09-10

El spec cambio despues de F2.1: el humano aprobo la salida por **marca en la redireccion** y
`spec_author` escribio R29 y R30. **R1–R28 no se tocaron**, ni su codigo ni sus tests. La lista de
archivos declarados paso a 40 y `design.md > 10` describe el mecanismo.

### Que se escribio

| Archivo | Cambio |
|---|---|
| `lib/shared/routes.ts` | `SESSION_ENDED_PARAM = 'sesion'` y `LOGIN_ROUTE_SESSION_ENDED`, derivada de `LOGIN_ROUTE`. |
| `lib/modules/identity/domain/route-access.ts` | Campo **opcional** `sessionEndedParam`, helper `traeMarcaDeSesionCortada` (comprueba PRESENCIA con `URLSearchParams.has`, no valor) y la condicion previa en la regla 3. |
| `lib/modules/identity/adapters/driving/route-guard-middleware.ts` | Pasa `sessionEndedParam: SESSION_ENDED_PARAM`. Sigue sin tocar base ni cookie. |
| `app/(private)/layout.tsx` | `redirect(LOGIN_ROUTE_SESSION_ENDED)`. |
| `lib/modules/identity/adapters/driving/require-page-permission.ts` | Idem. **No basta con el layout**: layout y pagina se renderizan en la misma peticion y cualquiera puede ganar el `redirect`. |

`logout-action.ts`, `lib/modules/identity/index.ts` y `lib/composition/index.ts` **no se tocan**.
El literal vive en `lib/shared/routes.ts` justamente para que la interseccion con QC-66 —que
declara `identity/index.ts`— siga vacia.

**El literal aparece UNA sola vez** en todo el arbol de produccion; comprobado con `grep` sobre
`lib`, `app`, `components` y `middleware.ts`.

### Por que la marca no es un agujero (R30 b)

Se lee **dentro** del `if` del paso 3, que solo se evalua cuando `pathname === routes.login`. Los
pasos 1, 2 y 4 no la ven. Consecuencia, y esta demostrada en negativo con tests, no afirmada:
alguien con sesion legitima que escriba `?sesion=fin` a mano en una ruta privada obtiene la
**misma** decision que sin ella, y un anonimo que la escriba **no gana acceso a nada**.

**Un residuo, encontrado y no tapado.** `buildLoginRedirect` codifica `pathname + search` entero,
asi que un anonimo que pida `/dashboard?sesion=fin` acaba con
`to: '/login?next=%2Fdashboard%3Fsesion%3Dfin'`: la marca viaja **dentro** del destino de vuelta,
aunque no como parametro del login. Lo importante es que **no vuelve a disparar R29 en el salto
siguiente**, y hay un test que cierra ese circulo: ese login, pedido despues con sesion valida,
sigue redirigiendo (`already-authenticated`). El residuo es cosmetico —tras autenticarse el
usuario aterriza en `/dashboard?sesion=fin`, un parametro que nadie lee— y queda anotado por si el
diseno lo quiere limpio.

### Mapa `R29, R30 → test`

Verificado **abriendo cada caso**. `RA` = `tests/unit/identity/route-access.test.ts`,
`RGM` = `tests/unit/identity/route-guard-middleware.test.ts`.

| R | Archivo | Caso |
|---|---|---|
| R29 | `RA` | `sirve el login a una sesion valida que llega con la marca, en vez de devolverla a la zona privada` |
| R29 | `RA` | `sin la marca, el login con sesion valida sigue redirigiendo al dashboard` (**la regla 3 sigue intacta**: sin este caso, el arreglo podria haberse comido la regla entera) |
| R29 | `RA` | `sin la marca, el login con sesion valida y destino de vuelta sigue redirigiendo ahi` |
| R29 | `RA` | `con la marca gana la marca aunque la query traiga tambien un destino de vuelta valido` |
| R29 | `RA` | `basta con que la marca este presente (%s) para no redirigir, sea cual sea su valor` (`it.each`: `?sesion=fin`, `?sesion=`, `?sesion`, `?sesion=loquesea`) |
| R29 | `RA` | `el login sin sesion se sigue sirviendo igual, traiga o no la marca` |
| R29 | `RGM` | `sirve /login con la marca aunque la cookie firmada siga siendo valida` |
| R29 | `RGM` | `sin la marca, /login con la misma cookie valida sigue redirigiendo al dashboard` |
| R29 | `RGM` | `el nombre de la marca sale de la constante compartida, no de un literal en el adaptador` |
| R29 | `e2e/session.spec.ts` | `una sesion abierta cuya cuenta deja de estar activa no llega a la siguiente pantalla privada y acaba en el login` (con el contador de redirecciones) |
| R29 | `e2e/session.spec.ts` | `una sesion abierta cuya ficha se da de baja tampoco rebota: sale al login en una sola redireccion` (**corte PREEXISTENTE**, QC-8 R11) |
| R30 (a) | `e2e/session.spec.ts` | `una sesion abierta cuya ficha se da de baja tampoco rebota...` compara la query final contra `LOGIN_ROUTE_SESSION_ENDED`: **la marca del corte por baja logica es la MISMA** que la del corte por estado |
| R30 (a) | `RA` | La decision no lleva motivo: `traeMarcaDeSesionCortada` mira presencia y el resultado es `allow` a secas, sin campo que distinga cual de los tres cortes fue |
| R30 (b) | `RA` | `una ruta privada con la marca se decide identicamente a la misma sin ella (con sesion)` (`toEqual` contra la llamada sin marca, no contra un literal) |
| R30 (b) | `RA` | `una ruta privada con la marca sigue mandando al login a un anonimo, igual que sin ella` — **la marca NO deja entrar a nadie** |
| R30 (b) | `RA` | `una ruta publica con la marca se sirve igual que sin ella` |
| R30 (b) | `RA` | `la marca no altera la decision de %s ni para el anonimo ni para la sesion valida` (`it.each` sobre cuatro caminos, compara `.kind`) |
| R30 (b) | `RA` | `la marca no queda como parametro del login al que se redirige una ruta privada` (y cierra el circulo: ese login con sesion valida **sigue** redirigiendo) |
| R30 (b) | `RGM` | `la marca no deja entrar a un anonimo en una ruta privada` |
| R30 (b) | `RGM` | `la marca en una ruta privada con cookie valida se decide igual que sin ella: pasa` |
| — | `RA` | `la regla 3 dispara aunque la query traiga el texto de la marca` y `con destino de vuelta y el texto de la marca, sigue ganando el destino de vuelta`: la red del campo **opcional**, que protege a los cinco tests de otras zonas que construyen un `RouteAccessInput` literal |

**Con las 28 anteriores, las 30 filas del mapa estan cubiertas.**

### Evidencia de que el test del adaptador muerde

Borrada la linea `sessionEndedParam: SESSION_ENDED_PARAM` de
`route-guard-middleware.ts` (dejando el comentario, para que el fallo fuera solo por la linea):

```
❯ tests/unit/identity/route-guard-middleware.test.ts (28 tests | 2 failed)
  × sirve /login con la marca aunque la cookie firmada siga siendo valida
    AssertionError: expected false to be true
  × el nombre de la marca sale de la constante compartida, no de un literal en el adaptador
 Tests  2 failed | 26 passed (28)
```

Linea **revertida** y verificada con `git diff`. Tras revertir: `28 passed (28)`.

### Salida real de Playwright

**`e2e/session.spec.ts`, los dos navegadores — EL QUE DESTAPO EL BUCLE:**

```
✓ [chromium] session.spec.ts:289 una sesion abierta cuya cuenta deja de estar activa ... (29.1s)
✓ [chromium] session.spec.ts:352 una sesion abierta cuya ficha se da de baja tampoco rebota (28.9s)
✓ [chromium] session.spec.ts:241 pide una pantalla privada sin sesion, entra, ... (30.7s)
✓ [webkit]   session.spec.ts:289 una sesion abierta cuya cuenta deja de estar activa ... (30.2s)
✓ [webkit]   session.spec.ts:352 una sesion abierta cuya ficha se da de baja tampoco rebota (30.9s)
✓ [webkit]   session.spec.ts:241 pide una pantalla privada sin sesion, entra, ... (31.2s)

6 passed (46.7s)          EXIT=0
```

El bucle esta muerto: el mismo paso que antes reventaba con
`Load cannot follow more than 20 redirections` ahora resuelve en **una sola** redireccion de
documento, en los dos navegadores, y para **dos** cortes distintos.

### Un error propio en el primer intento del contador, y su correccion

La primera version del contador sumaba **toda** respuesta con estado 300-399. `next dev` sirve los
chunks de `_next/static` con **304 Not Modified**, que cae en ese rango: el contador dio 15, 20 y
29 «redirecciones» de JavaScript, y **pasaba o fallaba segun lo que el navegador tuviera en
cache** —chromium paso una vez, webkit no—. Un test que depende de la cache no mide nada. Ahora
`contarRedireccionesDeNavegacion` filtra a `resourceType() === 'document'` y excluye 304, con el
porque escrito en el helper. **El fallo era del test, no del producto.**

### Los seis E2E de T19 que faltaban por correr, ya ejecutados

`inventario`, `presentaciones`, `proveedores`, `recetas`, `recetas-pasos` y `unidades`, en los dos
navegadores: **17 passed, 11 failed (5.0m)**.

**Verde** (o sea: la reparacion de T19 funciona, esos usuarios entran): los dos de
`presentaciones`, el alta de `proveedores`, el alta de `recetas`, `recetas-pasos`, y los **dos** de
`unidades` —incluido `una sesion valida sin los permisos de unidades recibe 404 dentro del layout
privado`, que ejercita `requirePagePermission` con sesion viva y demuestra que la marca **no**
rompio ese camino—.

**Rojo, y ninguno es de QC-78:**

| Test | Navegadores | Atribucion |
|---|---|---|
| `inventario:310`, `proveedores:467`, `recetas:368` (y `pedidos:447` de la tanda anterior) — todos `un usuario que no es Administrador acaba fuera` | los dos | El helper `login()` de esos specs espera aterrizar en `DASHBOARD_ROUTE`, y el log dice `navigated to /inventario`. La causa esta en `login-action.ts`: desde **QC-75 R12** el destino tras login es `firstVisibleNavHref(...)`, o sea la primera pantalla del menu que esa persona puede ver — para un Operador, `/inventario`. **`login-action.ts` y `lib/shared/navigation/` NO estan en el diff de QC-78** (comprobado con `git diff --name-only` contra la base de fusion: cero archivos). La expectativa de esos specs quedo obsoleta con QC-75; T19 solo la destapo al permitir que esos usuarios lleguen a entrar. |
| `inventario:249` (el alta de producto del Administrador) | los dos | `locator.click` expira esperando `presentation-create-open`: es la UI de inventario, que QC-78 no toca (`app/**` y `components/**` estan fuera de su alcance declarado). Ademas el arbol principal tiene trabajo de inventario sin commitear (`product-field.tsx`, `presentation-select.tsx`). |

**Limite declarado, para que el reviewer sepa exactamente que se midio:** los cuatro rojos de
«no es Administrador» y el de `inventario:249` **no** se ejecutaron sobre la base de fusion para
confirmar que ya fallaban alli. La atribucion se apoya en el diff (los archivos causantes no estan
tocados) y en el mensaje del log, no en una corrida comparativa.

### Estado

**T1–T15 y T19–T26 cerradas.** T16, T17 y T18 siguen siendo del leader. Sigue en **F2.1**: sin PR,
sin sincronizar con `dev`, sin `./init.sh`.

---

## Tanda 6 — tres menores del review de F2.2, y la sincronizacion con `dev` (F2.3)

El `reviewer` aprobo la ficha: **0 mayores, 7 menores**, con 9 mutaciones aplicadas y revertidas
(`progress/review_QC-78-estado-de-cuenta-en-el-acceso.md`). De los siete, aqui entran **tres**. El
**menor 2** (la marca dentro del destino de vuelta) espera decision humana y **no se toco**; el
**menor 4** (que solo dos de los tres cortes tengan E2E) queda documentado a proposito; los
**menores 5 y 6** son del leader.

### T27 — menor 1: R5 no lo ataba ningun test, y por que el test es del FUENTE

El reviewer aplico la mutacion **M3** —mover el corte por estado **debajo** del bloque que llama a
`registrarFallo`, que es literalmente la «uniformizacion» contra la que R5 avisa por su nombre— y
`verify-credentials.test.ts` se quedo en **56 passed (56)**.

**No era un descuido de los tests: esa mutacion no tiene efecto observable.** `registrarFallo`
lleva **su propio** corte por estado efectivo al principio del bucle, calculado sobre los MISMOS
valores (`visto` es `usuario`), asi que con el orden invertido se entra en la funcion y se sale sin
escribir nada. R6 —«ese camino no escribe nada»— se conserva, y R6 es lo unico que unos puertos
falsos pueden ver.

O sea: **R5 no es una propiedad del comportamiento, es una propiedad del orden del codigo.** Se ata
donde se puede atar, sobre el fuente, con el mismo idioma que ese archivo ya usa para QC-19 R17
(`FUENTE_DE_VERIFY_CREDENTIALS` + `readFileSync`). Escribir un test de comportamiento que no cayera
con M3 habria sido **peor que no tener ninguno**: daria por atado lo que no lo esta.

El caso nuevo fija la **secuencia entera**, no solo el punto de R5, porque los tres ordenes son
decisiones con requisito y los tres son «faciles de arreglar» por accidente:

```
hash (R2)  <  corte por estado (R5)  <  !correcta  <  corte de empresa (QC-48)
```

Cada ancla se comprueba ademas **presente y unica**: si una linea deja de existir tal cual, el caso
cae por el `toBeGreaterThan(-1)` en vez de pasar en vacio comparando dos `-1`.

**Evidencia de que muerde, con la mutacion del reviewer.** Aplicada M3 byte a byte (mover la linea
del corte debajo del bloque de `registrarFallo`):

```
× el corte por estado va DESPUES del hash y ANTES de registrar el fallo, y el de empresa despues
AssertionError: el corte por estado tiene que ir ANTES del `if (!correcta)` (R5): si se mueve
debajo, `pending` e `inactive` entran en el camino de registro del intento fallido:
expected 11444 to be less than 11332
 Tests  1 failed | 56 passed (57)
```

Revertida con `git checkout --` y confirmada: **`57 passed (57)`**. Es exactamente la mutacion que
antes dejaba 56/56 en verde.

**Y `design.md > 11`, riesgo 1, queda corregido.** Afirmaba «hay test para cada uno de los dos
ordenes» y para el corte de estado **era falso**. Ahora lleva el bloque que explica por que la
mutacion no era observable y donde se ata de verdad.

### T28 — menor 3: la segunda mitad de R30 (a), con test propio

R30 (a) pide que la pantalla de login se renderice **igual** con la marca y sin ella. Eso se
sostenia con (a) un argumento estructural y (b) la ausencia de toast en el E2E. Ninguna de las dos
es la **igualdad** que pide el requisito.

Se intento el test antes de decidir que no se podia, y **si se puede**: `tests/unit/identity/login-page-marca.test.tsx`
(archivo **41** de la lista declarada) renderiza `LoginPage` con la marca y sin ella y compara el
marcado. Tres casos:

| Caso | Que ata |
|---|---|
| `el marcado con la marca es identico al marcado sin ella` | La igualdad literal, mas un `length > 100` y un `toContain('data-login="screen"')` para que comparar dos cadenas vacias no pase por la razon equivocada |
| `tampoco cambia con otro valor de la marca, ni con la marca sin valor` | `fin`, `''` y `loquesea`: la pantalla ignora el valor, no solo el que usa la constante |
| `el destino de vuelta SI cambia el marcado: la comparacion detecta diferencias` | **EL CONTROL.** Sin el, los dos casos de arriba no valdrian nada: hay que demostrar que la comparacion sabe ver una diferencia cuando la hay |

Por que el requisito importa y no es celo: la marca viaja en la barra de direcciones, a la vista.
Si algun dia se usara para pintar «tu sesion ha caducado» o «cuenta inactiva», la URL pasaria a
distinguir **por que** no hay sesion — el oraculo que R3 lleva toda la ficha evitando.

`app/(public)/login/page.tsx` **no se toca**: el test solo lo lee.

### T29 — menor 7: las dos afirmaciones caducas

El primer bloque de ampliacion de `tasks.md` y la primera mitad de esta bitacora decian «no hay
R29». Era cierto al escribirse y el segundo bloque lo deroga, pero convivian sin nota. Los dos
llevan ahora una advertencia que remite al bloque que manda.

## F2.3 — sincronizacion con `dev`

```
$ git fetch origin dev && git merge origin/dev
17 commits nuevos, entre ellos el merge de QC-70 (errores-centralizados, PR #52)
116 files changed, 5217 insertions(+), 657 deletions(-)
Merge: 74e6a94        SIN CONFLICTOS
```

**Conflictos: ninguno.** Se predijo antes de mezclar con `comm -12` sobre los dos diffs contra la
base de fusion: de los 41 archivos de esta ficha y los 116 de `dev`, la interseccion era **un solo
archivo**, `tests/unit/identity/account-status-scope.test.ts` —la guardia de QC-65, que `dev` toco
en `d88c60b` («los centinelas de QC-65 y QC-38 solo muerden en su rama») y que esta ficha amplio en
T9—. Git lo resolvio solo y se **inspecciono a mano** porque era el unico sitio donde un
auto-merge silencioso podia hacer dano: sobreviven las dos cosas, la `SITIOS_PERMITIDOS` de 13
entradas y la `PIEZAS_DE_QC19` reducida a `account-lock.ts` de QC-78, junto con la precondicion de
rama de `dev`. La guardia pasa.

**Los codigos de error que renombra QC-70 no rozaron esta ficha**: `identity` no consume el
catalogo de errores y ninguno de los 41 archivos declarados aparece en el diff de QC-70 salvo el
mencionado. No hubo que decidir nada ambiguo.

### El typecheck heredado: RESUELTO por el merge

```
$ pnpm typecheck
(sin salida)     exit 0
```

Los **tres** errores de `tests/unit/recetas/*` (`ProductRef.stock`) que la rama arrastraba desde
`dev` y que dejaban `./init.sh` en rojo **han desaparecido**: los arreglo QC-70 en `d364405` («los
dobles de recetas absorben el productStock que trae dev»). El **menor 5** del review, que era la
unica condicion de cierre pendiente y no era de esta ficha, **queda cerrado por la sincronizacion**.

### Verificacion despues del merge

```
$ pnpm typecheck                                    exit 0, sin salida
$ pnpm lint                                         exit 0, sin salida
$ pnpm exec vitest run guard                        26 archivos, 268 passed | 4 skipped
$ pnpm exec vitest run <unitarios de la ficha>      49 archivos, 772 passed | 5 skipped
$ pnpm exec vitest run tests/integration/identity/   5 archivos, 113 passed
```

**Cero rojos.** No se corrio la suite completa ni `./init.sh`: eso es F2.4 y lo corre el leader.
Los E2E tampoco se re-ejecutaron tras el merge — la ultima corrida medida de `e2e/session.spec.ts`
es la de la tanda 5 (**6 passed, exit 0, los dos navegadores**), sobre el codigo de esta ficha, que
el merge no ha tocado.

## Estado

**T1–T15 y T19–T29 cerradas.** Rama sincronizada con `origin/dev` y typecheck limpio. T16, T17 y
T18 siguen siendo del leader. **F2.3 hecha**: sin PR y sin `./init.sh`, que son F2.4.

