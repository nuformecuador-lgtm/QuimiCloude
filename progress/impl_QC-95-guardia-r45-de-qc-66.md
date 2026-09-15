# Implementacion — QC-95 · arreglo de la re-review (vuelta F2.2 -> F2.1)

> Zona `backend` · complejidad `low` · worktree `.worktrees/QC-95-guardia-r45-de-qc-66`, rama
> `feature/QC-95-guardia-r45-de-qc-66` desde `origin/dev` en `f777c56` (merge del PR #70).
> Informe que se cierra: `progress/review_QC-95-desbloqueo-manual-limpia-el-conteo-2026-09-15.md`
> (RECHAZADO, 5 bloqueantes y 8 menores).
> Coordinado por el implementer. Los cambios los hicieron tres subagentes `backend_dev`: dos en
> paralelo (B1+m1 y B3/B4) y uno despues (B2+m3+m4), porque sus mutaciones tocaban archivos que
> lee la guardia de B1.
> **No se corrio `./init.sh` ni `pnpm test` completo**: el gate lo corre el leader.

## Commits de esta rama

| Commit | Que cierra |
| --- | --- |
| `fdea487` fix(QC-95): la guardia R45 de QC-66 acepta la enmienda de QC-95 con una unica excepcion anclada | **B1**, **m1** |
| `16249df` test(QC-95): R8, R9 y R10 se verifican sobre el rango inmutable del PR #70 | **B3**, **B4** |
| `394a6d7` test(QC-95): R6 con doble centinela, R5 encadenado de verdad y R3 con data unico y aborto | **B2**, **m3**, **m4** |
| el commit de esta bitacora: docs(QC-95), casillas de tasks.md y bitacora | **B5**, **m5** |

## Archivos, y que cierra cada uno

| Archivo | Estado | Cierra |
| --- | --- | --- |
| `tests/unit/identity/usuarios/scope.test.ts` | modificado | **B1** |
| `lib/modules/identity/domain/user-input.ts` | modificado, **solo comentario** (20-23) | **m1** |
| `lib/modules/identity/domain/user-view.ts` | modificado, **solo comentario** (15-17) | **m1** |
| `tests/guards/guard-qc95-alcance-del-pr-70.test.ts` | nuevo | **B3** (R8), **B4** (R9, R10) |
| `tests/unit/identity/usuarios/set-user-account-status-cleared-lock-state.test.ts` | nuevo | **B2** (R6) |
| `tests/unit/identity/usuarios/set-user-account-status-lock.test.ts` | modificado | **m3** (R5) |
| `tests/unit/identity/usuarios/user-admin-prisma-lock-state.test.ts` | nuevo | **m4** (R3, mismo `data`) |
| `tests/integration/identity/session-stamp-writes.int.test.ts` | modificado | **m4** (R3, aborto) |
| `specs/QC-95-desbloqueo-manual-limpia-el-conteo/tasks.md` | modificado | **B5** |
| `progress/impl_QC-95-guardia-r45-de-qc-66.md` | nuevo (esta bitacora) | **m5** (mapa de R7) y el mapa completo |

La produccion no cambia fuera de los dos comentarios de m1: `git diff f777c56 -- lib/` solo
lista esos dos archivos. No hay dependencias nuevas, ni cambios en `db/`, `app/` o
`components/`. `feature_list.json` y `progress/current.md` no se tocaron.

## Que se hizo, bloqueante a bloqueante

### B1: guardia R45 de QC-66 (`scope.test.ts`)

El caso de contenido de R45 se retensa con un bloque «RETENSADO 2026-09-15 (QC-95)». Titulo y
mensaje dicen «QC-95 enmienda R45 de QC-66».

- **Una excepcion, y solo para `user-admin-prisma.ts`.** Sobre la fuente sin comentarios:
  - `limitesDeApplyGuardedChange` aisla el cuerpo de la funcion. Termina en lo primero que
    encuentre: el `}` de cierre en columna 0, el siguiente `export` o el final del archivo.
  - `aparicionesDelFragmentoAutorizado` busca el spread con un patron tolerante al espaciado. El
    patron exige `input.lockState === null ? {} : {...}` y los tres valores leidos de
    `input.lockState`.
  - `hallazgosDeLaExcepcionQC95` da rojo en cuatro casos: si falta la funcion, si el fragmento no
    aparece, si aparece mas de una vez o si aparece fuera de la funcion.
  - Despues quita esa unica aparicion y pasa el barrido original sobre el resto del archivo.
- **Los otros 20 archivos se miden igual que antes:** cero grafias.
- **El caso de rama sobre `lib/composition/index.ts` no cambia.**
- **Casos sinteticos**, en el `describe` «QC-95 enmienda R45 de QC-66: la excepcion de
  applyGuardedChange muerde»:
  - (a) segundo `lockedUntil` en `USER_ROW_SELECT`;
  - (b) el spread fuera de la funcion: en otro `export` y en una funcion no exportada debajo;
  - (c) sin la condicion;
  - (d) con literales;
  - (e) duplicado;
  - (f) el fragmento legitimo, en varias lineas, en una sola y sin espacios: sin hallazgos;
  - la excepcion sin enmienda (cero apariciones) o sin la funcion;
  - el archivo real: una aparicion y cero hallazgos.

### B2: R6 (`set-user-account-status-cleared-lock-state.test.ts`)

- **El doble.** `vi.mock` del modulo `effective-account-status`, que tambien intercepta el import
  relativo del caso de uso. `clearedLockState` devuelve un centinela congelado con valores
  imposibles.
- **`active`, `pending` e `inactive`:** el doble se llama una vez, y el `lockState` del puerto
  es ese mismo objeto (`toBe`).
- **`blocked`:** el doble no se llama y `lockState` es `null`.

### B3 y B4: R8, R9 y R10 (`tests/guards/guard-qc95-alcance-del-pr-70.test.ts`)

**Rango elegido: `0ed8431e7e67c69532c0c0cb40e7d8e0dc04853c..f777c56f941b0fdae1566663d24f82fd413fd1b5`**
(primer padre del merge contra el merge). Se mide con
`git -c core.quotepath=off diff --name-only --no-renames`.

**Por que este y no `f728d15^..f728d15`:** es exactamente lo que el PR #70 metio en `dev`,
incluida cualquier resolucion hecha en el propio merge, y eso el diff del commit de la feature no
lo veria. El otro rango no se descarta: entra como ancla. Hoy los dos dan los mismos 11 archivos.
`--no-renames` hace que un archivo de R8 movido se vea tambien por su ruta vieja.

**Anclas**, para que un rango mal escrito no pase en vacio:
1. `f777c56` tiene exactamente los padres `[0ed8431, f728d15]`.
2. El rango no esta vacio y contiene los tres archivos de produccion de QC-95 y su spec.
3. Coincide con `f728d15^..f728d15`.

**Fallo ruidoso, nunca salto.** Si falta un commit (`git cat-file -e` falla), se lanza
«QC-95 R8, R9 y R10 NO se han comprobado». El mensaje remite a `git fetch --unshallow` si el
clon es superficial, y a `git fetch origin dev` si falta el remoto. Si `git diff` falla, tambien
lanza. No hay ningun `ctx.skip`.

**Lo que se afirma sobre el rango:**
- **R9:** no contiene `db/schema.prisma`, nada bajo `db/migrations/`, `package.json` ni
  `pnpm-lock.yaml`.
- **R10:** no contiene nada bajo `app/` ni `components/`.
- **R8:** no contiene ninguna de las **10 rutas** de abajo, y cada una existe en disco.
  - Las 5 del encargo: `domain/effective-account-status.ts`, `domain/account-lock.ts`,
    `domain/verify-credentials.ts`, `domain/resolve-session.ts` y
    `adapters/driven/persistence/user-credentials-prisma.ts`.
  - La proyeccion de la resolucion: `domain/resolve-session-user.ts`.
  - Los puertos y adaptadores de lectura y escritura del login y la sesion:
    `ports/login-attempt-recorder.ts`, `ports/user-credentials-reader.ts`,
    `ports/session-user-reader.ts` y `adapters/driven/persistence/session-user-prisma.ts`.
  - Todo bajo `lib/modules/identity/`.

  **La lista se amplio a proposito.** Sobre un rango inmutable, una ruta de mas no puede dar un
  falso positivo en el futuro; solo endurece la guardia. **Queda fuera** `domain/credential-policy.ts`:
  es la politica de contrasenas y no sabe nada de intentos ni de bloqueo.

**Casos sinteticos** (git inyectado):
- cada ruta prohibida de R8, R9 y R10, por separado;
- comparacion por ruta exacta, no por basename;
- la lista real del PR sin violaciones;
- un rango con prohibidos;
- el ancla (2) con rango vacio;
- las anclas (1) y (3) con padres o listas distintos;
- un commit ausente con clon superficial, y con clon completo;
- `git diff` roto.

### B5: `tasks.md`

- **T1-T5:** cada una tiene su casilla `[x]` y la evidencia de su «Hecho» junto a ella.
- **T6 queda `[ ]`.** Su «Hecho» exige `./init.sh` completo en verde, y lo corre el leader.
  - Lo demas de T6 esta cumplido: las guardias se verificaron (B1 retensa la unica que enumeraba
    escritores de los contadores) y hay mapa `R<n> -> test`.
  - Cuando el gate completo salga verde, la casilla se puede marcar.

### Menores

- **m1:** las notas de `user-input.ts` y `user-view.ts` dicen ya que los contadores solo los
  escribe `applyGuardedChange` al salir de `blocked` (QC-95, que enmienda R45 de QC-66). Corrio
  el grep de T5, ampliado con `no (los )?lee(n)? ni (los )?escribe`, y ninguna linea restante es
  obsoleta:
  - `session-revocation-prisma.ts:8,30`: es el R45 de QC-23 (borrado de sesiones).
  - `user-actions.ts:156` y `update-user.ts:32`: dicen que el formulario rechaza los contadores,
    y es cierto.
  - `resolve-session.ts:119`: habla de la autoria de un parrafo.
  - Las demas ya estaban enmendadas por QC-95.
- **m3:** el `it` tautologico de R5 se borro y lo sustituye un encadenado real con dobles en
  memoria:
  - una fila `blocked` (4, 3, 2099) pasa a `active` por `createSetUserAccountStatus`;
  - `createVerifyCredentials` real lee esa fila y recibe una contrasena incorrecta;
  - el login registra `{ failedAttempts: 1, lockLevel: 0, lockedUntil: null }` y no rebloquea;
  - control: la misma fila sin pasar por el caso de uso se trata como bloqueada.
- **m4:**
  - (a) test del adaptador con el cliente Prisma simulado: un unico `updateMany`, con estado y
    contadores en el mismo `data`, y valores tomados de `lockState` (tambien con 2/1/2031, no
    solo 0/0/null). Con `blocked`, ninguna clave de contador.
  - (b) integracion: el unico administrador `active` a `inactive` devuelve `last_administrator`,
    y la fila conserva el estado y los tres contadores; con un id de otra empresa (`not_found`)
    los contadores tampoco cambian.
- **m5:** el mapa de R7 cita `authorization.test.ts` (ver abajo).
- **Fuera de alcance, sin tocar:** m2 (nota de enmienda en el spec de QC-66), m6 (board y
  `history.md`), m7 (E2E, ficha aparte) y m8 (`design.md`).

## Mapa `R<n> -> test`

| R | Test |
| --- | --- |
| R1 | `tests/unit/identity/usuarios/set-user-account-status-lock.test.ts` «R1 — destino `active`: el puerto recibe `lockState` IGUAL a `clearedLockState()`» + `tests/integration/identity/session-stamp-writes.int.test.ts` «R1/R3: mover a `active` limpia los tres contadores en la misma escritura» |
| R2 | `set-user-account-status-lock.test.ts` «R2 — destino `blocked`: `lockState` va `null` y no se escribe ningun contador» + `set-user-account-status-cleared-lock-state.test.ts` «R6/R2 — destino `blocked`: `clearedLockState()` NO se llama y `lockState` es `null`» + `user-admin-prisma-lock-state.test.ts` «R2/R3 — destino `blocked` con `lockState` null: el `data` lleva `accountStatus` y NINGUNO de los tres contadores» + `session-stamp-writes.int.test.ts` «R2: mover a `blocked` NO toca los contadores, aunque se escriba el estado» |
| R3 | `tests/unit/identity/usuarios/user-admin-prisma-lock-state.test.ts` «R3 — destino `active`/`pending`/`inactive` con `clearedLockState()`: un solo `updateMany` y su `data` lleva a la vez `accountStatus` y los tres contadores» y «R3 — los valores de los contadores salen de `lockState`, no de un literal del adaptador» + `session-stamp-writes.int.test.ts` «R1/R3: …», «R3: si la transaccion aborta por `last_administrator`, ni el estado ni los tres contadores cambian» y «R3: un objetivo de otra empresa (`not_found`) conserva sus tres contadores» |
| R4 | `set-user-account-status-lock.test.ts` «R4 — destino `pending`: idem (la decision es por el destino, no por el estado actual)» (y `findAliveInCompany` no llamado en R1, R2 y R4) + `set-user-account-status-cleared-lock-state.test.ts` «R6 — destino `inactive`: …» |
| R5 | `set-user-account-status-lock.test.ts` «R5 — `blocked` -> `active` por el caso de uso, y un fallo de login registra `failedAttempts = 1` sin rebloquear», con su control «control: la MISMA fila, sin pasar por el caso de uso, el login la trata como bloqueada»; complementa `tests/unit/identity/verify-credentials.test.ts:1051` «tras clearedLockState el siguiente fallo cuenta como el primero y no rebloquea» |
| R6 | `tests/unit/identity/usuarios/set-user-account-status-cleared-lock-state.test.ts` «R6 — destino `active`: se llama a `clearedLockState()` una vez y el puerto recibe ESE MISMO objeto» (y `pending`, `inactive`) + «R6/R2 — destino `blocked`: …»; en el adaptador, `tests/unit/identity/usuarios/scope.test.ts` exige que el spread lea de `input.lockState` y no escriba literales |
| R7 | `tests/unit/identity/usuarios/authorization.test.ts`, fila `setUserAccountStatus` (252-258): «R1 — cada caso de uso avanza con EXACTAMENTE el codigo de su fila y con ningun otro», «R3 — solo `usuarios.consultar` no abre ninguna de las cuatro escrituras» y «R1 — el permiso se comprueba ANTES de zod: …» + `tests/unit/identity/usuarios/admin-guards.test.ts` «R21 — rechaza setUserAccountStatus con `self_operation` y no modifica ninguna fila» y «R22 — mover el estado del ultimo administrador activo se traduce a `last_administrator`» |
| R8 | `tests/guards/guard-qc95-alcance-del-pr-70.test.ts` «R8: el PR #70 no modifica la politica de bloqueo por intentos, el estado efectivo, el login ni la resolucion de sesion» y «R8: cada archivo vigilado por R8 existe en disco (…)», con las anclas (1)-(3) y los sinteticos «R8: cada archivo del bloqueo por intentos, … es hallazgo por separado» y «un rango sintetico con archivos prohibidos: …» |
| R9 | mismo archivo: «R9: el PR #70 no toca `db/schema.prisma`, `db/migrations/`, `package.json` ni `pnpm-lock.yaml`», con los sinteticos «R9: `db/schema.prisma`, una migracion, `package.json` y `pnpm-lock.yaml` son hallazgo cada uno por separado» y «un commit ausente en un clon SUPERFICIAL lanza con `git fetch --unshallow`, nunca salta» |
| R10 | mismo archivo: «R10: el PR #70 no trae nada bajo `app/` ni `components/`», con el sintetico «R10: una pagina bajo `app/` y un componente bajo `components/` son hallazgo» |

## Mutaciones que muerden

Todas se hicieron sobre el archivo real y se restauraron con `cp` desde el scratchpad, con `cmp`
identico; nunca con `git checkout`. Al terminar, `git diff f777c56 -- lib/` solo lista los dos
comentarios de m1.

| # | Mutacion | Resultado |
| --- | --- | --- |
| B1-1 | `lockedUntil: true` en `USER_ROW_SELECT` (`user-admin-prisma.ts`) | `scope.test.ts` ROJO: «…mas alla de lo que QC-95 enmienda R45 de QC-66…: `lockedUntil` fuera del unico spread condicional autorizado» |
| B1-2 | spread sin la condicion | ROJO: «el spread condicional que autoriza QC-95 no aparece (0 apariciones)» + 3 grafias |
| B1-3 | literales `0, 0, null` en el spread | ROJO: 0 apariciones + 3 grafias |
| B1-4 | spread duplicado en `applyGuardedChange` | ROJO: «aparece 2 veces: se autoriza UNA» |
| B2-1 | `set-user-account-status.ts:69`: literal `{ failedAttempts: 0, lockLevel: 0, lockedUntil: null }` en vez de `clearedLockState()` | test nuevo de R6 ROJO en `active`/`pending`/`inactive` («expected vi.fn() to be called 1 times, but got 0 times»). **Contraprueba:** el test de R6 de antes (version de HEAD) sigue 4/4 VERDE con la misma mutacion; por eso no bastaba |
| B2-1b | `{ ...clearedLockState() }` (copia por valor) | ROJO por el `toBe` («Object.is equality») |
| B2-2 | llamar a `clearedLockState()` tambien para `blocked` | ROJO «R6/R2 — destino `blocked`» («to not be called at all, but actually been called 1 times») |
| m3 | el caso de uso pasa `lockState: null` siempre | ROJO el encadenado de R5, y tambien R1 y R4; el control sigue verde |
| m4a | los contadores en un SEGUNDO `tx.user.updateMany` | `user-admin-prisma-lock-state.test.ts` ROJO en los 4 casos con `lockState` («called 1 times, but got 2 times»); `blocked` sigue verde |
| m4b | `updateMany` de los contadores ANTES del chequeo de `last_administrator`, y sin empresa en el `where` | `session-stamp-writes.int.test.ts` ROJO en el aborto (`:662`) y en `not_found` (`:690`) |
| B3/B4-1 | `BASE_DEL_PR_70` = `0000…0000` (commit inexistente) | guardia ROJA, 6 casos: «QC-95 R8, R9 y R10 NO se han comprobado: el commit … no existe en este clon … `git fetch --unshallow` … `git fetch origin dev`». Ningun salto |
| B3/B4-2 | rango cambiado al de QC-65 (`9485fb1^1..9485fb1`) | ROJO R9, nombrando `db/schema.prisma` y dos migraciones de `db/migrations/20260908190002_user_account_status/`; caen tambien las anclas (1), (2) y (3) |

## Salida real de la verificacion final

Corrida por el implementer sobre `394a6d7`, con todo restaurado. Nota de entorno: en este
worktree `pnpm exec` no resuelve `vitest`, `tsc` ni `eslint`, asi que se usaron los binarios de
`labs/node_modules/.bin/`, igual que el reviewer. Antes, los subagentes corrieron
`next typegen`, sin el cual `tsc` da el falso `LayoutProps`.

```
tsc --noEmit                      -> exit 0 (sin salida)
eslint (repo completo)            -> exit 0 (sin salida)

vitest run  usuarios/{set-user-account-status-lock,set-user-account-status-cleared-lock-state,
            user-admin-prisma-lock-state,admin-guards,authorization,scope}.test.ts
            identity/{verify-credentials,effective-account-status,account-lock,qc78-alcance,
            account-status-scope,credential-policy-contract}.test.ts  identity/credencial/scope.test.ts
 Test Files  13 passed (13)
      Tests  279 passed | 12 skipped (291)          -> exit 0

vitest run guard
 Test Files  40 passed (40)
      Tests  426 passed | 9 skipped (435)           -> exit 0

vitest run --project integration  (con .env cargado; base efimera)
            identity/{session-stamp-writes,last-administrator,user-crud}.int.test.ts
 Test Files  3 passed (3)
      Tests  69 passed (69)                          -> exit 0
test-db: borrada la base de la corrida: qct_qc95_0a1ff440_mu2zjhmm_b00.
```

**Los skipped no son de estos cambios:**
- Los 12 unitarios son los casos de rama de QC-65, QC-66 y QC-78, que la review ya documentaba.
- Los de la guardia nueva no se saltan nunca.
- De los 9 del `vitest run guard`, ninguno es de la guardia nueva: sus 19 casos pasan.

## Puntos abiertos para el leader

1. **`./init.sh` completo sin correr**, como pide la regla del gate. Es lo que falta para marcar T6.
2. **`check-trazabilidad.mjs` lee otra bitacora.** Lee `progress/impl_<spec_path>.md`, o sea
   `impl_QC-95-desbloqueo-manual-limpia-el-conteo.md`, y no esta. Su mapa viejo (R8-R10
   «verificado por git status») seguira haciendo verde el script. No lo toque: decide si esta
   bitacora lo sustituye o se enlaza desde alli.
3. **R8 atribuye mal la politica de intentos.** El texto la da a QC-19, pero segun `git log`
   `nextLockState` e `isLocked` nacieron en QC-7 (`23323a6`) y QC-78 las amplio. Es correccion
   de spec, no de codigo; va con m2/m8 si se reabre.
4. **La guardia de rango depende de un clon completo.** Si algun entorno clona en superficial,
   caera con el mensaje de `git fetch --unshallow`, a proposito. Hoy no hay
   `.github/workflows` en el repo.
5. **`pnpm exec` no encuentra los binarios en este worktree** (el entorno, no el codigo):
   conviene saberlo antes del gate.
