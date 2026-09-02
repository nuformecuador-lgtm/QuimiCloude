# QC-7 — login-usuario-y-contrasena · bitacora de implementacion

Spec aprobado por el humano el 2026-09-01. Implementado sobre la estructura hexagonal de
QC-15, en el worktree `.worktrees/QC-7-login-usuario-y-contrasena/`, rama
`feature/QC-7-login-usuario-y-contrasena`.

`verifyCredentials` deja de ser un stub: verifica contra la base, cuenta fallos, bloquea la
cuenta con escalada y emite la cookie de sesion firmada.

---

## 1. Estado de las tasks

| Task | Estado | Nota |
| --- | --- | --- |
| T0 preparar worktree | hecha | ver 6.1: hubo que anadir `DIRECT_URL`, que no estaba |
| T1 `domain/session.ts` | hecha | |
| T1b `domain/account-lock.ts` | hecha | |
| T2 puertos nuevos | hecha | |
| T2b migracion del bloqueo | hecha | ciclo up/down probado de verdad (4.3) |
| T3 adaptador Prisma | hecha | |
| T4 caso de uso real | hecha | el corazon de la feature |
| T5 adaptador de cookie | hecha | |
| T6 composicion | hecha | |
| T6b adaptar `login-action.test.ts` | hecha | alcance limitado a lo que dice la task |
| T7 `.env.example` | hecha | |
| T8 integracion contra Postgres | hecha | destapo la carrera de 6.2 |
| T9 guardia de arquitectura | hecha | revision manual en 5 |
| T11 Playwright instalado Y registrado | hecha | en un solo commit, a proposito |
| T12 E2E del login | hecha | |
| T13 gate completo y trazabilidad | **parcial** | esta bitacora si; **`./init.sh` completo lo corre el leader**, no yo |

**Fuera del spec, un arreglo necesario:** serializar los tests de integracion
(`vitest.config.mts`). Justificacion y corrida de control en 6.2.

---

## 2. Archivos tocados

### Nuevos

```
lib/modules/identity/domain/session.ts
lib/modules/identity/domain/account-lock.ts
lib/modules/identity/ports/user-credentials-reader.ts
lib/modules/identity/ports/login-attempt-recorder.ts
lib/modules/identity/ports/session-writer.ts
lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts
lib/modules/identity/adapters/driven/session/session-cookie.ts
db/migrations/20260901220609_user_login_lockout/migration.sql
db/migrations/20260901220609_user_login_lockout/down.sql
tests/unit/identity/session-ticket.test.ts
tests/unit/identity/account-lock.test.ts
tests/unit/identity/verify-credentials.test.ts
tests/unit/identity/session-cookie.test.ts
tests/integration/identity/login.int.test.ts
playwright.config.ts
e2e/login.spec.ts
```

### Modificados

```
lib/modules/identity/domain/verify-credentials.ts     (deja de ser stub)
lib/modules/identity/index.ts                         (exporta createVerifyCredentials, SessionTicket)
lib/composition/index.ts                              (cablea los tres adaptadores nuevos)
db/schema.prisma                                      (3 columnas en User, nada mas)
package.json, pnpm-lock.yaml                          (@playwright/test + script e2e)
docs/dependencias.md                                  (fila de @playwright/test)
tests/unit/identity/login-action.test.ts              (solo lo que dice T6b)
tests/unit/identity/schema/identity-schema.test.ts    (las 3 columnas)
tests/unit/identity/schema/identity-migration.test.ts (la migracion nueva)
.env.example                                          (SESSION_SECRET, placeholder)
.gitignore                                            (artefactos de Playwright)
vitest.config.mts                                     (INFRAESTRUCTURA COMPARTIDA — ver 6.2)
AGENTS.md                                             (NO es de esta feature — ver 6.3)
```

### Que NO se toco, y se comprobo que no

`login-action.ts`, `login-form-state.ts`, `credentials.ts`, `session-stub.ts`,
`logout-action.ts`, `app/**`, `components/**`, y ningun modelo de `db/schema.prisma` que no
sea `User`. Verificado con `git diff --stat` sobre esas rutas: vacio.

---

## 3. Las cuatro propiedades que se rompen solas

Las que no se ven en un diff y se pierden en cuanto alguien "simplifica".

### 3.1 El mensaje es siempre el mismo, tambien para una cuenta bloqueada

Hay **un unico objeto de rechazo**, construido una vez y congelado con `Object.freeze`:

```ts
const REJECTED: { ok: boolean } = Object.freeze({ ok: false });
```

Usuario inexistente, contrasena mala y cuenta bloqueada devuelven **ese mismo valor**. No es
elegancia: si cada camino construyera el suyo, cualquier dia uno se lleva un campo de mas y el
login pasa a ser un oraculo de que usuarios existen. Test: "bloqueada, contrasena mala y
usuario inexistente devuelven el mismo objeto" (R28), que compara los tres con `toEqual`.

El bloqueo **no tiene mensaje propio** a proposito. Solo un usuario que existe puede estar
bloqueado, asi que un "cuenta bloqueada" delataria que el nombre de usuario es real y ademas le
confirmaria al atacante que su fuerza bruta funciona. El precio se acepta y esta escrito: un
usuario legitimo que se autobloquea ve el mensaje generico hasta 60 minutos sin saber por que.

### 3.2 Uniformidad de TIEMPO en los tres caminos — medida, no supuesta

El camino que se olvida es el bloqueado: comprobar `lockedUntil` es comparar dos fechas,
mientras los otros dos pagan bcrypt. Si el bloqueado respondiera al instante, la diferencia
hablaria. Por eso el camino bloqueado **tambien verifica el hash y tira el resultado**, y el
camino sin usuario verifica contra un senuelo.

**Como lo medi** (lo que se pidio es como se midio, no solo que esta implementado):

Un banco de pruebas temporal que instancia `createVerifyCredentials` con el hasher **real**
(bcrypt, el mismo de produccion) y puertos dobles, y cronometra con `performance.now()` los
tres caminos. Dos decisiones del banco, que son las que hacen que la medicion signifique algo:

- **Interleavados, no en bloques.** Medidos en bloques seguidos, el JIT y el GC se reparten
  distinto entre los tres y la diferencia que sale es del banco, no del codigo.
- **Con calentamiento previo.** La primera llamada del camino "usuario inexistente" paga el
  hash del senuelo, que por diseno se calcula UNA vez por instancia y queda cacheado. Sin
  calentar, esa unica llamada contaminaria la muestra.

**Medicion REHECHA tras el arreglo atomico de M-A1** (el camino de fallo cambio de escritura, asi
que la medicion anterior ya no valia). Dos corridas independientes, `n=60` por camino:

```
--- corrida A ---
usuario inexistente        n=60 p10=92.1 mediana=103.0 p90=110.3 min=84.8 max=115.3
contrasena incorrecta      n=60 p10=94.9 mediana=102.6 p90=108.3 min=86.9 max=118.9
bloqueada (contrasena OK)  n=60 p10=96.3 mediana=102.0 p90=109.5 min=84.9 max=128.6
diferencia ENTRE medianas : 0.9 ms   |  ruido p10-p90 DENTRO de cada camino: 18 / 13 / 13 ms
camino mas lento por mediana: usuario inexistente

--- corrida B ---
usuario inexistente        n=60 p10=94.3 mediana=101.7 p90=111.0 min=87.7 max=119.8
contrasena incorrecta      n=60 p10=95.2 mediana=103.3 p90=110.8 min=81.6 max=132.7
bloqueada (contrasena OK)  n=60 p10=97.2 mediana=103.7 p90=112.7 min=90.6 max=135.1
diferencia ENTRE medianas : 1.9 ms   |  ruido p10-p90 DENTRO de cada camino: 17 / 16 / 15 ms
camino mas lento por mediana: bloqueada (contrasena OK)
```

**Como se lee esto — y por que ya NO se cita un porcentaje** (menor M4 de la revision). El
reviewer midio 5,6 % sobre este mismo codigo con la maquina mas cargada, frente al 1,7 %/2,0 %
que yo habia reportado. Tenia razon: **el porcentaje es una propiedad de la maquina, no del
codigo**, y citarlo como garantia era el unico punto criticable del argumento. Lo que si es
del codigo y se sostiene en las tres mediciones (las dos mias y la suya):

1. **La diferencia entre caminos esta muy por debajo del ruido de cada camino.** Aqui, ~1-2 ms
   de diferencia entre medianas contra 13-18 ms de recorrido p10-p90 **dentro** de un mismo
   camino. En la corrida del reviewer, 9 ms contra ~280 ms. La senal que un atacante tendria que
   extraer esta enterrada bajo la varianza propia de bcrypt.
2. **El orden del camino mas lento se invierte entre corridas.** En la corrida A el mas lento es
   "usuario inexistente"; en la B, "bloqueada"; en la del reviewer, "bloqueada"; en mi medicion
   original, tambien cambiaba. **Un sesgo real no cambia de signo.** Esta inversion es mejor
   evidencia de que no hay senal que cualquier porcentaje, y no depende de la maquina.

**El banco no se deja en el repo**: un test que mide tiempos es intermitente por construccion y
convertiria el gate en una ruleta. Se conserva fuera del arbol para poder repetirlo; lo que si
queda vigilado en la suite es el **numero de verificaciones de hash** ("el camino bloqueado
verifica el hash una vez, igual que los otros", R29), que es la causa de la uniformidad y esa
si es determinista.

**Dos limites conocidos, no maquillados:**

- Los caminos que escriben (fallo con usuario existente) pagan un `UPDATE` de mas, del orden del
  milisegundo frente a ~100 ms de bcrypt.
- **Nuevo con el arreglo de M-A1:** bajo contencion real, el camino de fallo puede dar mas de una
  vuelta de `compareAndSet` + relectura, y eso **solo ocurre cuando el usuario existe**. En
  teoria es una diferencia observable; en la practica solo aparece cuando el propio atacante
  esta martilleando esa cuenta en paralelo —o sea, cuando ya sabe que le interesa— y desaparece
  en cuanto la cuenta se bloquea, que es a los 5 fallos. No se considera un oraculo utilizable,
  pero queda escrito en vez de fingir que la uniformidad es perfecta.

### 3.3 Cero escrituras si el usuario no existe

Si un usuario inexistente incrementara un contador, el propio contador delataria que usuarios
hay. En el caso de uso, la rama sin usuario verifica el senuelo y **retorna sin tocar
`attempts`**. Test: "un usuario inexistente no provoca ninguna escritura" (R31).

### 3.4 Un bloqueado no entra ni con la contrasena correcta, y no ve su bloqueo alargado

Dos tests separados, porque son dos fallos distintos:

- "una cuenta bloqueada no entra ni con la contrasena correcta" (R24) — el caso que se olvida:
  el test usa la contrasena **buena** y exige `{ ok: false }` y `startSession` sin llamar.
- "un intento durante el bloqueo no escribe nada" (R25) + "fallo estando bloqueada devuelve el
  mismo estado" en `account-lock.test.ts` — martillear una cuenta bloqueada no sube el nivel ni
  mueve `lockedUntil`, asi que nadie puede mantener una cuenta fuera indefinidamente.

---

## 4. Verificacion ejecutada

**No corri la suite completa: `./init.sh` lo corre el leader.** Lo mio: typecheck, lint,
guardias y los tests relacionados con el diff, mas las comprobaciones de datos que exige
`docs/verification.md > Datos`.

### 4.1 Typecheck y lint

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida: cero errores)

$ pnpm run lint
> eslint
(sin salida: cero errores)
```

### 4.2 Guardias y tests relacionados

```
$ pnpm exec vitest related --run <archivos del diff vs origin/dev>
 Test Files  18 passed (18)
      Tests  172 passed (172)

$ pnpm exec vitest run guard
 Test Files  5 passed (5)
      Tests  65 passed (65)
```

Las cinco guardias en verde, incluida `guard-dependencias-aprobadas` **en las dos direcciones**
(paquete instalado + fila en el registro, en el mismo commit).

### 4.3 Migracion: ciclo up/down probado de verdad

`down.sql` es convencion propia del repo y nadie lo prueba por ti:

```
$ pnpm run db:rollback
db:rollback: aplicando down.sql de 20260901220609_user_login_lockout y borrando su fila de _prisma_migrations
db:rollback: 20260901220609_user_login_lockout revertida.

$ pnpm run db:migrate
2 migrations found in prisma/migrations
Applying migration `20260901220609_user_login_lockout`
The following migration(s) have been applied:
migrations/
  20260901220609_user_login_lockout/
    migration.sql
All migrations have been successfully applied.

$ pnpm exec prisma migrate status
Database schema is up to date!
```

### 4.4 Integracion: repetible, no de una vez

```
$ pnpm exec vitest run tests/integration/   (x3 seguidas)
 Test Files  2 passed (2)   Tests  30 passed (30)
 Test Files  2 passed (2)   Tests  30 passed (30)
 Test Files  2 passed (2)   Tests  30 passed (30)
```

Base limpia al terminar: 0 usuarios, 0 roles (comprobado con una consulta directa, no asumido).

### 4.5 E2E en navegador real, chromium y webkit

```
$ pnpm run e2e
Running 4 tests using 4 workers
  OK  2 [chromium] login en navegador real > con credenciales incorrectas se queda en el login, avisa y no emite sesion (9.0s)
  OK  4 [webkit]   login en navegador real > con credenciales incorrectas se queda en el login, avisa y no emite sesion (12.1s)
  OK  1 [chromium] login en navegador real > entra con credenciales correctas y recibe la cookie de sesion httpOnly (10.3s)
  OK  3 [webkit]   login en navegador real > entra con credenciales correctas y recibe la cookie de sesion httpOnly (12.7s)
  4 passed (1.6m)
```

WebKit no es decoracion: es el motor de iOS, y `context.cookies()` es la unica forma honesta de
comprobar `httpOnly` desde fuera del navegador. Base limpia al terminar (0 usuarios, 0 roles):
el fixture del E2E borra lo suyo.

---

## 5. Lo que la guardia NO comprueba, revisado a mano

`vitest run guard` recorre el arbol y el grafo de imports; estas tres son de criterio y las
revise leyendo el codigo (`CHECKPOINTS.md > Modulos hexagonales`):

1. **La logica de negocio esta en `domain/`, no en la Server Action.** `login-action.ts` no
   cambia ni una linea: sigue traduciendo `FormData`, llamando a la fachada y redirigiendo. El
   parseo, la normalizacion, el corte por bloqueo, la decision de verificar siempre, el calculo
   del siguiente estado y la emision del ticket estan **todos** en
   `domain/verify-credentials.ts`. Un caso de uso que solo delegara y devolviera pasaria la
   guardia en verde y estaria mal; este decide.
2. **Ningun driving instancia su driven.** El unico archivo que importa adaptadores driven es
   `lib/composition/index.ts` (comprobado con un grep sobre `lib/`, `app/` y `components/`).
3. **Bloque 13 (fila driven) pasa con `next/headers` en `session-cookie.ts`.** La fila
   `adapters/driven/**` de la tabla de dependencias **no menciona `next/*`**, ni para
   permitirlo ni para prohibirlo, y la guardia solo le prohibe la composicion, el driving
   propio y la UI. O sea que esto pasa en verde **porque la regla no existe**, no porque se
   haya comprobado. Es la **pregunta abierta 2** del spec: hay que confirmar la ubicacion y
   anotar la fila en `docs/architecture.md`. No la anoto yo: no se inventa una regla de
   arquitectura desde una feature.

---

## 6. Incidencias y decisiones que el reviewer va a preguntar

### 6.1 Faltaba `DIRECT_URL` en el `.env`

El `.env` del repo principal solo tiene `DATABASE_URL`, y `db/schema.prisma` declara
`directUrl = env("DIRECT_URL")`. Sin ella, `prisma migrate` ni arranca (`P1012`). Como la base
local es `localhost:5432` (conexion directa, no pooler), `DIRECT_URL` toma el mismo valor.
Anadida **solo al `.env` del worktree**, que esta git-ignorado. `.env.example` ya la
documentaba: el que estaba incompleto era el `.env` real. Deuda anotada en `progress/current.md`.

### 6.2 `fileParallelism` en `vitest.config.mts`: justificado, con corrida de control

**Es infraestructura compartida y por eso lleva justificacion explicita.**

QC-7 anade el **segundo** archivo de `tests/integration/`. Desde ese momento Vitest corre los
dos **en paralelo contra la misma base real**, y `identity-constraints.int.test.ts` (de QC-4,
que aqui **no se toca**) afirma en tres puntos `expect(await tx.user.count()).toBe(0)`: el
estado **global** de la tabla. El fixture de `login.int.test.ts` commitea filas a proposito
(tiene que hacerlo: ejercita el adaptador Prisma real, que usa el cliente compartido y no veria
filas de una transaccion sin confirmar) y el otro archivo las ve.

Arreglo: un tercer proyecto `integration` en `vitest.config.mts` con `fileParallelism: false`.
Los unitarios y los de UI siguen en paralelo.

**Corrida de control**, porque un verde por serializacion podria estar tapando un test malo:

```
cada archivo SOLO             -> 23/23 y 7/7 verdes
los dos, serializados, x3     -> 30/30 verdes las tres veces
los dos, --file-parallelism   -> ROJO: 5 fallos una vez, 9 la siguiente, MISMO codigo
```

Tres cosas que lo cierran:

1. **Todos los fallos caen en el archivo de QC-4**, ninguno en el de QC-7. Si QC-7 tuviera un
   test que solo pasa por orden, fallaria el suyo.
2. **Todos son la misma asercion**: el recuento global de `users`. No hay un segundo sintoma.
3. **El numero de fallos varia entre corridas identicas** (5 y 9). Esa es la firma de una
   carrera, no de un test mal escrito.

Ademas la base queda limpia al terminar (0 filas), asi que tampoco es un fallo de limpieza.

Serializar es el arreglo correcto para un **recurso mutable compartido**: ninguna asercion de
ninguno de los dos archivos se debilita. Dos limites, escritos para que nadie los descubra a
golpes:

- `fileParallelism: false` serializa archivos **dentro de una corrida**. **Dos procesos de
  vitest a la vez contra la misma base siguen chocando** (me paso mientras un subagente corria
  tests y yo tambien).
- **El arreglo de fondo es de QC-4**: esa asercion deberia acotarse a sus propias filas en vez
  de exigir la tabla vacia. Reescribir el test de otra feature no es alcance de esta; queda
  como deuda.

### 6.3 `AGENTS.md` aparece modificado, y no es de esta feature

Lo reinyecta `node_modules/next/dist/server/lib/generate-agent-files.js` cada vez que arranca
`next dev`, y aqui arranco porque el `webServer` de Playwright lo levanta para el E2E.
Revertirlo solo hace que reaparezca en el siguiente `next dev`. Va en un **commit aparte y
etiquetado** para que no viaje camuflado dentro de un commit de la feature.

### 6.4 El E2E afirma el destino y la cookie, no el contenido

`/dashboard` es hoy un 404 (QC-12 esta `pending`). El E2E afirma que la URL acaba en
`DASHBOARD_ROUTE` y que `context.cookies()` trae `qc_session` con `httpOnly: true`. Eso **no lo
invalida**: lo que QC-7 promete es a donde te lleva y que emite la cookie, no que la pagina
exista.

---

## 7. Trazabilidad `R<n> -> test`

| R | Test que lo cubre |
| --- | --- |
| R1 | `verify-credentials.test.ts` — "acepta usuario activo con contrasena correcta"; `login.int.test.ts` — "autentica contra una fila real"; `e2e/login.spec.ts` — camino feliz |
| R2 | `verify-credentials.test.ts` — "usuario inexistente devuelve el resultado generico"; `e2e/login.spec.ts` — camino de error |
| R3 | `verify-credentials.test.ts` — "contrasena incorrecta devuelve un resultado indistinguible del de usuario inexistente" |
| R4 | `verify-credentials.test.ts` — "el usuario no distingue mayusculas ni espacios, la contrasena si"; `login.int.test.ts` — "encuentra al usuario escrito en otra caja" |
| R5 | `verify-credentials.test.ts` — "un usuario borrado no autentica"; `login.int.test.ts` — "con deleted_at no autentica" |
| R6 | `verify-credentials.test.ts` — "verifica un hash senuelo cuando el usuario no existe" |
| R7 | `verify-credentials.test.ts` — "el senuelo se produce con el hasher del sistema y se calcula una sola vez" |
| R8 | `verify-credentials.test.ts` — "entrada invalida no toca ningun puerto" |
| R9 | `session-cookie.test.ts` — "la cookie se emite httpOnly"; `e2e/login.spec.ts` — cookie con `httpOnly: true` |
| R10 | `session-cookie.test.ts` — "sameSite lax, path / y secure solo en produccion" |
| R11 | `session-cookie.test.ts` — "maxAge y exp coinciden con la duracion"; `session-ticket.test.ts` — "el ticket caduca a las 8 h" |
| R12 | `session-cookie.test.ts` — "el valor va firmado con HMAC y solo lleva sub/iat/exp" |
| R13 | `session-cookie.test.ts` — "sin secreto valido lanza y no escribe cookie" |
| R14 | `verify-credentials.test.ts` — "ningun fallo emite sesion" |
| R15 | `verify-credentials.test.ts` — espia de `console` sobre un login completo con hasher real, en los tres caminos (anadido por M1); `session-cookie.test.ts` — el valor de la cookie y el secreto que la firma |
| R16 | `login-action.test.ts` — "conserva el usuario escrito tras un intento rechazado", "el estado devuelto nunca contiene la contrasena", "genera un attemptId distinto por invocacion" (aserciones intactas) |
| R17 | `verify-credentials.test.ts` — "el caso de uso se construye con puertos"; `guard-arquitectura-modulos.test.ts` bloques 4, 7, 13; revision manual en 5 |
| R18 | `guard-arquitectura-modulos.test.ts` — bloque 6 (contrato limpio, cierre transitivo) |
| R19 | `login-action.test.ts` — "redirige a /dashboard cuando las credenciales son aceptadas y no emite toast"; `e2e/login.spec.ts` — camino feliz |
| R20 | `logout-action.test.ts` (existente, **sin modificar**, pasa tal cual) |
| R21 | `login.int.test.ts` — `beforeAll`/`afterAll` crean y limpian sus propias filas; `e2e/login.spec.ts` usa su propio fixture. Ninguna referencia al seed |
| R22 | `account-lock.test.ts` — "el quinto fallo bloquea y reinicia el contador"; `verify-credentials.test.ts` — "un fallo con usuario existente registra lo que calcula nextLockState"; `login.int.test.ts` — "cinco fallos dejan la cuenta bloqueada en la base" **y, tras M-A1, "intentos fallidos en paralelo se cuentan todos" + "cinco intentos fallidos en paralelo bloquean la cuenta"** |
| R23 | `account-lock.test.ts` — "la escalada es 1, 5, 15 y 60 minutos y no pasa de 60" |
| R24 | `verify-credentials.test.ts` — "una cuenta bloqueada no entra ni con la contrasena correcta"; `login.int.test.ts` — mismo caso contra fila real |
| R25 | `verify-credentials.test.ts` — "un intento durante el bloqueo no escribe nada" y "si la cuenta se bloquea mientras tanto, el reintento no escribe"; `account-lock.test.ts` — "fallo estando bloqueada devuelve el mismo estado"; `login.int.test.ts` — "intentos en paralelo durante el bloqueo no lo alargan" |
| R26 | `account-lock.test.ts` — "con el bloqueo caducado vuelve a aceptar intentos" |
| R27 | `verify-credentials.test.ts` — "el exito reinicia contador, nivel y bloqueo"; `account-lock.test.ts` — "un intento correcto deja contador, nivel y bloqueo a cero"; `login.int.test.ts` — "un login correcto reinicia contador, nivel y bloqueo en la base" |
| R28 | `verify-credentials.test.ts` — "bloqueada, contrasena mala y usuario inexistente devuelven el mismo objeto" |
| R29 | `verify-credentials.test.ts` — "el camino bloqueado verifica el hash una vez, igual que los otros" |
| R30 | `identity-schema.test.ts` + `identity-migration.test.ts` (extendidos con las tres columnas y la migracion nueva); ciclo `db:migrate`/`db:rollback` de 4.3 |
| R31 | `verify-credentials.test.ts` — "un usuario inexistente no provoca ninguna escritura" y "un usuario que desaparece entre el intento y el reintento no provoca escritura" |

Los 31 requisitos tienen test. Ninguno queda sin cubrir.

---

## 8. Lo que queda abierto

- **`./init.sh` completo**: lo corre el leader antes del PR. Yo corri typecheck, lint, guardias
  y relacionados, que es lo que me toca segun la regla del gate de `AGENTS.md`.
- **Pregunta abierta 2 del spec** (`next/headers` en un adaptador driven): sigue abierta, ver
  5.3. Necesita respuesta del humano para anotar la fila en `docs/architecture.md`.
- **Preguntas abiertas 1 y 3** (auditoria de accesos, rotacion del secreto): sin cambios, siguen
  abiertas tal como las dejo el spec.

---

## 9. Respuesta a la revision (RECHAZADO: 1 mayor, 8 menores)

Revision en `progress/review_QC-7-login-usuario-y-contrasena.md`.

### 9.1 M-A1 (bloqueante) — CERRADO CON CODIGO

**El diagnostico del reviewer era correcto y el fallo era real.** El registro del intento
fallido era **lectura-modificacion-escritura no atomica** con ~110 ms de bcrypt en medio: el
dominio leia `failedAttempts`, verificaba, y el adaptador escribia un **valor absoluto**
calculado sobre aquella lectura ya vieja. N intentos en paralelo leian `0` y escribian todos
`1`: **el contador no llegaba nunca a 5 y R22 no se disparaba jamas.**

Lo que mas pesa del hallazgo no es el bug, es lo que dice de mi trabajo anterior: documente
limites mucho mas pequenos —el `UPDATE` de 1 ms, los dos procesos de vitest, el nivel que no
decae— con precision, y **la concurrencia no aparecia en ningun sitio**. No es que se asumiera
el riesgo: es que no se penso. `CLAUDE.md` regla 6: lo que no esta escrito no esta decidido.
Y es la feature que QC-8 y QC-9 van a copiar.

**Arreglo: compare-and-set con reintento acotado.** Decision y alternativas descartadas en
`design.md > 5.7`, escrito ahora (antes no existia). En una frase: la escritura del fallo pasa
a ser **condicional al estado que se leyo**, y si pierde la carrera el dominio **relee y
recalcula la politica** sobre el estado fresco. La escalada la sigue decidiendo
`nextLockState` y solo el; el puerto sigue sin decidir nada.

| Pieza | Antes | Ahora |
| --- | --- | --- |
| `ports/login-attempt-recorder.ts` | `record(userId, state)` | `compareAndSet(userId, esperado, siguiente): Promise<boolean>` + `set(userId, estado)` |
| adaptador | `prisma.user.update` por id, valor absoluto | `updateMany` con el estado leido en el `WHERE`, devuelve `count === 1`; `set` incondicional solo para el exito |
| dominio, camino de fallo | una escritura y a correr | `registrarFallo()`: bucle acotado con relectura y recalculo |
| dominio, camino de exito | igual | igual: `set` incondicional, porque el estado de exito es todo ceros y **no depende del valor previo** |

Detalle que no es obvio y esta comentado en el codigo: **el predicado del CAS usa solo los dos
enteros, no `locked_until`.** La columna es `timestamptz(6)` —microsegundos en Postgres— y un
`Date` de JS solo tiene milisegundos: meterla en el `WHERE` es una comparacion que un dia deja
de casar en silencio y el CAS no volveria a aplicar nunca. El par
`(failed_login_attempts, lock_level)` ya identifica cada estado de la cadena.

**Las tres cosas que el arreglo no podia romper, comprobadas:**

- **Cero escrituras si el usuario no existe (R31).** La rama sin usuario sigue sin tocar el
  puerto de escritura, y el CAS es un `updateMany` — no puede insertar. Ademas, si la relectura
  del reintento devuelve `null` o un `id` distinto, se sale sin escribir.
- **Un intento durante el bloqueo no lo alarga (R25).** El bucle comprueba `isLocked` en cada
  vuelta, asi que tambien cubre el caso nuevo: que el bloqueo aparezca **entre** la lectura y la
  escritura. Test de integracion propio.
- **Uniformidad de tiempo.** Remedida entera, ver 3.2. Diferencia entre medianas de 0,9 y 1,9 ms
  contra 13-18 ms de ruido interno, y el orden del camino mas lento se invierte entre corridas.

### 9.2 La evidencia de que el arreglo arregla algo

Tres tests de concurrencia nuevos en `tests/integration/identity/login.int.test.ts`, contra
Postgres real:

```
+ intentos fallidos en paralelo se cuentan todos            (3 en Promise.all -> contador 3)
+ cinco intentos fallidos en paralelo bloquean la cuenta    (5 -> lock_level 1, contador 0, locked_until futuro)
+ intentos en paralelo durante el bloqueo no lo alargan     (5 durante el bloqueo -> las 3 columnas intactas)
```

**Y se comprobo que fallan con el codigo viejo**, que es lo que convierte un test en evidencia
y no en decoracion. Ejecutado, no argumentado: copia temporal del archivo sustituyendo unicamente
el recorder por un doble que reproduce la escritura absoluta anterior:

```
FAIL > intentos fallidos en paralelo se cuentan todos
-   "failedLoginAttempts": 3,
+   "failedLoginAttempts": 1,
FAIL > cinco intentos fallidos en paralelo bloquean la cuenta
AssertionError: expected 1 to be +0
```

Con el codigo nuevo, los tres pasan. Precision honesta: **el tercero (R25) pasa tambien con el
codigo viejo** —el corte por bloqueo esta en el dominio, asi que no discrimina—; se deja porque
cubre el caso nuevo de que el bloqueo aparezca a mitad del reintento.

Ademas, tres tests unitarios del bucle con dobles: que un CAS perdido se reintenta sobre el
estado fresco, que si la cuenta se bloquea entre medias no hay segunda escritura, y que si el
usuario desaparece tampoco.

### 9.3 Los 8 menores

| # | Que decia | Que hice |
| --- | --- | --- |
| **M1** | R15 solo cubierto en su tercio de la cookie: el espia de `console` rodea `startSession`, por donde la contrasena y el hash **no pasan nunca**; y el bucle `not.toContain` posterior es codigo muerto | **Aplicado.** Test nuevo en `verify-credentials.test.ts` que espia `console` alrededor de un `verifyCredentials` **completo** con hasher **real**, en los tres caminos, y afirma que ni la contrasena ni el hash aparecen. Codigo muerto eliminado del test de la cookie, que se renombra a lo que de verdad cubre |
| **M2** | `tasks.md` T13 tiene una casilla sin marcar (`./init.sh` completo) | **No es mio.** Su dueno es el leader, que es quien corre el gate completo. Sigo sin marcar lo que no he corrido; marcarlo seria justo la casilla mentirosa que el reviewer fue a buscar |
| **M3** | El senuelo se calcula perezosamente: el primer intento con usuario inexistente de cada proceso paga bcrypt **dos veces** (~220 ms frente a ~110) | **Aplicado.** Se calienta al **construir** el caso de uso, sin bloquear la construccion, con un `.catch` que solo evita un unhandled rejection sin tragarse el error para quien espere la promesa de verdad |
| **M4** | El "2,0 % de dispersion" no es una propiedad del codigo sino de la maquina; a el le salio 5,6 % | **Aplicado.** Seccion 3.2 reescrita: ya no se cita ningun porcentaje como garantia. Se afirman las dos cosas que si son del codigo — la diferencia entre caminos esta muy por debajo del ruido interno de cada uno, y **el orden del camino mas lento se invierte entre corridas**, que es lo que un sesgo real no hace |
| **M5** | `reuseExistingServer: !CI` en el 3000 puede engancharse al `next dev` de **otro worktree** y afirmar sobre codigo ajeno | **Aplicado.** Puerto propio del E2E (3117) en `baseURL`, `webServer.url` y el `command`, y `reuseExistingServer: false` tambien en local. El falso verde que no se distingue de uno bueno es el peor de todos |
| **M6** | El verde del E2E no se pudo reproducir: el disco estaba al 100 % y `next dev` no podia escribir `.next` | **Cerrado.** Reproducido con disco libre: **4 tests verdes en chromium y webkit**, salida en 4.5. No era el codigo |
| **M7** | Los dos tests del E2E comparten usuario; cada fallo suma un intento y con `retries` podria **bloquear la cuenta** y poner rojo el camino feliz | **Aplicado, y mas fuerte de lo pedido.** Un usuario **por test**, no un reset compartido: se confirmo que con `fullyParallel` los dos tests caen en workers distintos del mismo proyecto, asi que un reset se pisaria a si mismo |
| **M8** | Tres desajustes de documentacion | **Aplicados los tres.** El hueco T10 de `tasks.md` queda explicado en el propio archivo; `design.md > 4.2` pasa de "pregunta abierta 5" a la 2, que es su numero en `requirements.md`; y el snippet de 4.2 ya no importa `timingSafeEqual`, con una nota de que es de QC-8 |

**Ninguno descartado.** El unico que no aplico es M2, y no por desacuerdo: es trabajo del leader.

### 9.4 Un hallazgo que salio del arreglo y no estaba en la revision

El `pnpm run e2e` que el reviewer no pudo terminar por el disco dejo **4 usuarios y 4 roles
`qc7_e2e_*` huerfanos** en la base. Eso puso **9 tests rojos** en
`identity-constraints.int.test.ts` —que afirma `expect(await tx.user.count()).toBe(0)`— en la
primera corrida de la tanda de arreglo. **No era el codigo ni el arreglo**: era basura de un E2E
interrumpido poniendo rojo el test de otra feature.

Es la misma deuda de QC-4 que ya obligo a serializar la integracion (6.2), vista por su otra
cara. Arreglado en lo que si es mio: el `afterAll` del E2E borra **por prefijo** y no por ids en
memoria (que no existen si el `beforeAll` murio a medias), cada borrado en su propio `try/catch`,
y hay una **limpieza defensiva de huerfanos** al empezar. Con un matiz que no estaba previsto y
decidio el subagente: la limpieza solo barre filas de mas de una hora, porque chromium y webkit
corren en paralelo y comparten prefijo — sin ese filtro se borrarian el usuario el uno al otro.

### 9.5 Verificacion tras el arreglo

```
$ pnpm run typecheck        -> sin errores
$ pnpm run lint             -> sin errores
$ pnpm exec vitest run guard
 Test Files  5 passed (5)        Tests  65 passed (65)
$ pnpm exec vitest run tests/integration/     (x2 seguidas)
 Test Files  2 passed (2)        Tests  33 passed (33)
 Test Files  2 passed (2)        Tests  33 passed (33)
$ pnpm exec vitest related --run <archivos del diff>
 Test Files  18 passed (18)      Tests  179 passed (179)
$ pnpm run e2e
 4 passed (2.7m)   [chromium + webkit]
```

179 tests relacionados frente a los 172 de antes: +7 (3 de concurrencia contra base real, 3 del
bucle de reintento con dobles, 1 de R15 completo).

**Sigue pendiente y sigue siendo del leader:** `./init.sh` completo, y con el la casilla de T13.
