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

Dos corridas independientes, con la maquina a cargas distintas:

```
--- corrida 1 ---
usuario inexistente        n=40 p10=97.3ms  mediana=108.3ms p90=119.5ms min=86.4ms max=177.6ms
contrasena incorrecta      n=40 p10=95.5ms  mediana=107.4ms p90=119.0ms min=85.2ms max=187.8ms
bloqueada (contrasena OK)  n=40 p10=100.9ms mediana=109.2ms p90=120.3ms min=78.7ms max=128.4ms
dispersion entre medianas: 1.8 ms (1.7 % del camino mas rapido)

--- corrida 2, maquina mas cargada ---
usuario inexistente        n=40 p10=233.5ms mediana=261.0ms p90=331.0ms min=221.2ms max=339.0ms
contrasena incorrecta      n=40 p10=230.5ms mediana=260.4ms p90=297.4ms min=213.6ms max=307.9ms
bloqueada (contrasena OK)  n=40 p10=229.9ms mediana=255.9ms p90=299.4ms min=208.9ms max=305.3ms
dispersion entre medianas: 5.1 ms (2.0 % del camino mas rapido)
```

**Lectura:** la dispersion entre los tres caminos (~2 %) es **un orden de magnitud menor que la
dispersion interna de cada camino** (p10-p90 de ~22 ms en la corrida 1, ~70 ms en la 2). O sea
que la senal que un atacante podria extraer queda enterrada bajo el ruido propio de bcrypt. Y
el resultado se sostiene a dos cargas de maquina distintas, que es lo que descarta que sea
casualidad de una corrida.

**El banco no se deja en el repo**: un test que mide tiempos es intermitente por construccion y
convertiria el gate en una ruleta. Se conserva fuera del arbol para poder repetirlo; lo que si
queda vigilado en la suite es el **numero de verificaciones de hash** ("el camino bloqueado
verifica el hash una vez, igual que los otros", R29), que es la causa de la uniformidad y esa
si es determinista.

**Limite conocido, no maquillado:** los caminos que escriben (fallo con usuario existente)
pagan un `UPDATE` de mas. Es del orden del milisegundo frente a ~100 ms de bcrypt, o sea que no
es un oraculo utilizable, pero la uniformidad no es perfecta y queda dicho.

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
| R15 | `session-cookie.test.ts` — "no se registra contrasena, hash ni valor de cookie" |
| R16 | `login-action.test.ts` — "conserva el usuario escrito tras un intento rechazado", "el estado devuelto nunca contiene la contrasena", "genera un attemptId distinto por invocacion" (aserciones intactas) |
| R17 | `verify-credentials.test.ts` — "el caso de uso se construye con puertos"; `guard-arquitectura-modulos.test.ts` bloques 4, 7, 13; revision manual en 5 |
| R18 | `guard-arquitectura-modulos.test.ts` — bloque 6 (contrato limpio, cierre transitivo) |
| R19 | `login-action.test.ts` — "redirige a /dashboard cuando las credenciales son aceptadas y no emite toast"; `e2e/login.spec.ts` — camino feliz |
| R20 | `logout-action.test.ts` (existente, **sin modificar**, pasa tal cual) |
| R21 | `login.int.test.ts` — `beforeAll`/`afterAll` crean y limpian sus propias filas; `e2e/login.spec.ts` usa su propio fixture. Ninguna referencia al seed |
| R22 | `account-lock.test.ts` — "el quinto fallo bloquea y reinicia el contador"; `verify-credentials.test.ts` — "un fallo con usuario existente registra lo que calcula nextLockState"; `login.int.test.ts` — "cinco fallos dejan la cuenta bloqueada en la base" |
| R23 | `account-lock.test.ts` — "la escalada es 1, 5, 15 y 60 minutos y no pasa de 60" |
| R24 | `verify-credentials.test.ts` — "una cuenta bloqueada no entra ni con la contrasena correcta"; `login.int.test.ts` — mismo caso contra fila real |
| R25 | `verify-credentials.test.ts` — "un intento durante el bloqueo no escribe nada"; `account-lock.test.ts` — "fallo estando bloqueada devuelve el mismo estado" |
| R26 | `account-lock.test.ts` — "con el bloqueo caducado vuelve a aceptar intentos" |
| R27 | `verify-credentials.test.ts` — "el exito reinicia contador, nivel y bloqueo"; `account-lock.test.ts` — "un intento correcto deja contador, nivel y bloqueo a cero"; `login.int.test.ts` — "un login correcto reinicia contador, nivel y bloqueo en la base" |
| R28 | `verify-credentials.test.ts` — "bloqueada, contrasena mala y usuario inexistente devuelven el mismo objeto" |
| R29 | `verify-credentials.test.ts` — "el camino bloqueado verifica el hash una vez, igual que los otros" |
| R30 | `identity-schema.test.ts` + `identity-migration.test.ts` (extendidos con las tres columnas y la migracion nueva); ciclo `db:migrate`/`db:rollback` de 4.3 |
| R31 | `verify-credentials.test.ts` — "un usuario inexistente no provoca ninguna escritura" |

Los 31 requisitos tienen test. Ninguno queda sin cubrir.

---

## 8. Lo que queda abierto

- **`./init.sh` completo**: lo corre el leader antes del PR. Yo corri typecheck, lint, guardias
  y relacionados, que es lo que me toca segun la regla del gate de `AGENTS.md`.
- **Pregunta abierta 2 del spec** (`next/headers` en un adaptador driven): sigue abierta, ver
  5.3. Necesita respuesta del humano para anotar la fila en `docs/architecture.md`.
- **Preguntas abiertas 1 y 3** (auditoria de accesos, rotacion del secreto): sin cambios, siguen
  abiertas tal como las dejo el spec.
