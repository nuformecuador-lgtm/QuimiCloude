# impl_2-hash-y-verificacion-de-contrasena.md

> Feature 2 · zone `backend` · complexity `low` · rama `feature/2-hash-y-verificacion-de-contrasena`
> Spec aprobado por el humano el 2026-08-06. Implementado por `implementer` delegando en `backend_dev`.
> Entorno de medida: Node **v22.13.1**, Windows (win32-x64), 11th Gen Intel i5-11400H, 12 CPUs.

## 1. Estado de las tareas

| Task | Estado | Nota |
| --- | --- | --- |
| T1 modulo `lib/utils/password-hash.ts` | [x] | Sin dependencias nuevas; `package.json` sin tocar |
| T2 helper `TEST_SCRYPT_PARAMS` | [x] | En `tests/support/`, fuera de `lib/` |
| T3 tests de comportamiento (11 casos) | [x] | |
| T4 tests de fallo cerrado | [x] | 22 casos invalidos + control + 2 casos R11 |
| T5 guardia del modulo (4 reglas) | [x] | Cada regla con caso sintetico |
| T6 medicion del coste real | [x] | Ver seccion 4 |
| T7 test de coste (el unico caro) | [x] | 2 transformaciones caras de un techo de 4 |
| T8 10 mutaciones | [x] | 9 murieron a la primera; **M5 sobrevivio** (ver seccion 6) |
| T9 barrido de presupuesto | [x] | Ver seccion 7 |
| T10 gate y tiempo de suite | [x] parcial | Gate del implementer verde; el `pnpm test` completo y `./init.sh` son del leader (`AGENTS.md > Regla del gate`) |
| T11 mapa `R<n> -> test` | [x] | Ver seccion 5 |
| T12 cerrar pregunta abierta heredada | [x] | Ver seccion 8 |

## 2. Archivos creados

- `lib/utils/password-hash.ts` — unico archivo de produccion. scrypt asincrono de `node:crypto`,
  `maxmem` explicito, sal 16 B de `randomBytes`, clave 32 B, `normalize('NFC')` en ambas funciones,
  `timingSafeEqual` con comprobacion previa de longitud, parseo que valida antes de derivar.
- `tests/support/password-test-params.ts` — `TEST_SCRYPT_PARAMS = { n: 1024, r: 8, p: 1 }`.
- `tests/unit/password/password-hash.test.ts` — 11 casos de comportamiento.
- `tests/unit/password/password-verify-fail-closed.test.ts` — tabla de fallo cerrado + R11 + control.
- `tests/unit/password/password-cost.test.ts` — 3 casos, el unico archivo con coste real.
- `tests/guards/guard-password-hash-module.test.ts` — 4 reglas estaticas, cada una con su sintetico.

**Archivos NO tocados, a proposito:** `package.json` (cero dependencias nuevas), `db/` (ninguna
migracion, ningun cambio de esquema: `password_hash text NOT NULL` sirve tal cual — `design.md > 7`),
`tests/guards/guard-password-never-plaintext.test.ts` (la guardia de la feature 1 no se relaja: se
adaptaron los nombres, `design.md > 9.1`), `app/`, ninguna UI.

## 3. Salida real del gate (sin parafrasear)

```
> quimicloude@0.1.0 typecheck ...\.worktrees\2-hash-y-verificacion-de-contrasena
> tsc --noEmit

> quimicloude@0.1.0 lint ...\.worktrees\2-hash-y-verificacion-de-contrasena
> eslint
```
(typecheck y lint: cero errores, cero hallazgos)

```
$ pnpm exec vitest related --run lib/utils/password-hash.ts tests/support/password-test-params.ts
 RUN  v4.1.10 C:/Users/Cristian/.../2-hash-y-verificacion-de-contrasena
 Test Files  3 passed (3)
      Tests  42 passed (42)
   Duration  1.82s (transform 24ms, setup 0ms, import 274ms, tests 2.37s, environment 0ms)
```

```
$ pnpm exec vitest run tests/unit/password tests/guards/guard-password-hash-module.test.ts
 Test Files  4 passed (4)
      Tests  50 passed (50)
   Duration  2.17s (transform 291ms, setup 0ms, import 608ms, tests 2.47s, environment 1ms)
real    0m3.578s
```

```
$ pnpm exec vitest run guard        # las TRES guardias: las dos de la feature 1 y la nueva
 Test Files  3 passed (3)
      Tests  16 passed (16)
   Duration  816ms (transform 178ms, setup 0ms, import 425ms, tests 64ms, environment 1ms)
```

**Tiempo que esta feature anade a la suite (T10): 2.17 s** de duracion de vitest (3.6 s de reloj
incluyendo el arranque de pnpm), contra el objetivo de **< 3 s**. Dentro de presupuesto. Los dos
sumandos que mandan son `password-cost.test.ts` (1.36 s: las 2 transformaciones de coste real) y las
200 verificaciones de T3.4 (319 ms). No se midio `pnpm test` completo: la suite entera incluye
`tests/integration/identity-constraints.int.test.ts`, que necesita Postgres, y el gate completo es
del leader.

## 4. T6 — medicion del coste con `DEFAULT_SCRYPT_PARAMS` (numeros crudos)

```
{ "node": "v22.13.1", "platform": "win32-x64",
  "params": { "n": 65536, "r": 8, "p": 2 },
  "maxmemBytes": 201326592, "memoriaExigidaBytes": 67108864,
  "muestrasMs": [ 741.5, 752, 753, 815.3, 764.1 ],
  "medianaMs": 753, "maximoMs": 815.3 }
```

Regla de `design.md > 3.3`: la mediana de **753 ms** cae dentro de `[50 ms, 1 s]`, asi que **los
parametros se quedan como estan y `design.md` no se toca**. Los parametros vigentes quedan
justificados por esta medicion, no por la spec. Aviso util para la feature 4: 753 ms esta a ~250 ms
del techo de 1 s; en una maquina mas lenta la regla pediria bajar a `{ n: 32768, r: 8, p: 3 }`.

Trampa de `maxmem` comprobada explicitamente (`design.md > 3.2`), mismos parametros y misma version
de Node:
```
sin maxmem  -> RangeError: Invalid scrypt params: ...memory limit exceeded  { code: 'ERR_CRYPTO_INVALID_SCRYPT_PARAMS' }
con maxmem  -> OK   (las 5 transformaciones de arriba)
```

## 5. Mapa `R<n> -> test` (todos EJECUTADOS, no solo escritos)

Abreviaturas: **H** = `tests/unit/password/password-hash.test.ts` · **F** =
`tests/unit/password/password-verify-fail-closed.test.ts` · **C** =
`tests/unit/password/password-cost.test.ts` · **G** =
`tests/guards/guard-password-hash-module.test.ts` · **G1** =
`tests/guards/guard-password-never-plaintext.test.ts` (feature 1).

| R | Test ejecutado | Resultado |
| --- | --- | --- |
| R1 | H · "el valor almacenado no contiene la entrada en ninguna codificacion reversible" | PASS 18ms |
| R2 | H · "produce 200 sales distintas, de 16 bytes cada una" · "produce 200 claves derivadas distintas" · "las 200 verificaciones de la tanda devuelven true" | PASS 17/12/319ms |
| R3 | H · "produce 200 sales distintas, de 16 bytes cada una" | PASS 17ms |
| R4 | H · "no trunca: dos entradas que comparten 72 bytes y difieren despues no verifican cruzado" | PASS 32ms |
| R5 | H · "una entrada en NFD verifica contra el hash de su forma NFC, y al reves" | PASS 22ms |
| R6 | H · "verifica correctamente la entrada correcta, con espacios, emoji y acentos" | PASS 53ms |
| R7 | H · "rechaza una entrada incorrecta: primer caracter, ultimo, mayusculas y longitud" | PASS 46ms |
| R8 | G · "la comparacion usa timingSafeEqual y no cortocircuita" (+ su sintetico) | PASS 8ms/3ms |
| R9 | H · "verifica valores generados con parametros distintos, sin recibir ninguna configuracion" | PASS 44ms |
| R10 | F · 22 casos invalidos ("devuelve false y no lanza: ...") + "hash valido con un caracter alterado" + CASO DE CONTROL que devuelve true + "la tabla cubre los 22 casos de tasks.md" | PASS (26 casos) |
| R11 | F · "n = 2^30 (1 TiB) ... false en menos de 100 ms y sin derivar nada" · "n = 2^20 y r = 32 (4 GiB), ambos dentro de rango ... sin derivar nada" · "el contador de derivaciones esta vivo" | PASS 1ms/0ms/12ms |
| R12 | H · "el valor almacenado declara el algoritmo y sus parametros" | PASS 15ms |
| R13 | H · "verifica valores generados con parametros distintos, sin recibir ninguna configuracion" | PASS 44ms |
| R14 | C · "los parametros por defecto exigen al menos 64 MiB por transformacion" · C · "una transformacion con los parametros por defecto cuesta al menos 50 ms" | PASS 4ms/769ms |
| R15 | H · "el valor almacenado son a lo sumo 256 caracteres ASCII imprimibles" | PASS 6ms |
| R16 | C · "la transformacion no bloquea el hilo principal" · G · "el modulo no bloquea el hilo: nada de scryptSync ni pbkdf2Sync" (+ sintetico) | PASS 593ms/1ms |
| R17 | G · "el modulo no escribe en ningun canal de salida" (+ sintetico) · G1 (heredada, verde) | PASS 1ms/1ms |
| R18 | G · "ningun archivo desplegable que corra en Edge importa el modulo de credenciales" · "la regla 4 detecta un fuente Edge que importa el modulo (hoy no existe ninguno real)" | PASS 4ms/3ms |

**Ningun R1-R18 se queda sin test ejecutado.** R8, R17 y R18 se cierran solo con guardias
estaticas, y es deliberado (`design.md > 6` y `> 12`): un test de reloj de pared para el tiempo
constante seria ruido estadistico. Las tres guardias llevan caso sintetico, asi que ninguna es un
assert vacuo.

## 6. T8 — las 10 mutaciones, ejecutadas de verdad

Procedimiento por mutacion: copia intacta del modulo -> mutar -> `pnpm exec vitest run
tests/unit/password tests/guards` -> anotar el rojo -> revertir y confirmar verde (comparando byte a
byte contra la copia intacta: `lib/utils/` esta untracked y `git diff` no habria visto la mutacion).
Baseline antes de empezar: 56 tests; tras rehacer el test de R11 (ver M5): 58 tests.

| # | Mutacion aplicada | Veredicto | Test(s) que cayeron |
| --- | --- | --- | --- |
| M1 | `randomBytes(SALT_LENGTH_BYTES)` -> `Buffer.alloc(SALT_LENGTH_BYTES, 0x2a)` | ROJO esperado (2 failed) | H · "produce 200 sales distintas, de 16 bytes cada una" · H · "produce 200 claves derivadas distintas" |
| M2 | `SALT_LENGTH_BYTES = 16` -> `4` | ROJO esperado (1 failed) | H · "produce 200 sales distintas, de 16 bytes cada una" |
| M3 | `timingSafeEqual` -> comparacion con `===` sobre el hex de las claves | ROJO esperado (1 failed) | G · "la comparacion usa timingSafeEqual y no cortocircuita" |
| M4 | `if (storedHash === '') return true` al entrar en `verifyPasswordHash` | ROJO esperado (1 failed) | F · "devuelve false y no lanza: cadena vacia" |
| M5 | En `areUsableCostParams`: `memoryBytesFor(params) <= MAX_SCRYPT_MEMORY_BYTES` -> `true` | **VERDE INESPERADO la primera vez** (56/56). Test rehecho -> ROJO (1 failed) | F · "un valor almacenado con n = 2^20 y r = 32 (4 GiB), ambos dentro de rango devuelve false en menos de 100 ms y sin derivar nada (R11)" — `AssertionError: expected 5 to be 4` |
| M6 | `Buffer.from(plaintext.normalize('NFC'),'utf8')` -> `.subarray(0, 72)` | ROJO esperado (1 failed) | H · "no trunca: dos entradas que comparten 72 bytes y difieren despues no verifican cruzado" |
| M7 | Se quita `.normalize('NFC')` | ROJO esperado (1 failed) | H · "una entrada en NFD verifica contra el hash de su forma NFC, y al reves" |
| M8 | `DEFAULT_SCRYPT_PARAMS.n: 65536` -> `1024` | ROJO esperado (4 failed) | C · "los parametros por defecto exigen al menos 64 MiB" · C · "una transformacion cuesta al menos 50 ms" · C · "no bloquea el hilo principal" · H · "a lo sumo 256 caracteres ASCII" (caida colateral: ese caso afirma longitud exacta 90 y cambian los digitos de `n`) |
| M9 | `scrypt` con callback -> `scryptSync` envuelto en promesa (mutacion adaptada para que compile: `scryptSync` no acepta callback; `pnpm typecheck` limpio con ella puesta) | ROJO esperado (3 failed) | G · "el modulo no bloquea el hilo: nada de scryptSync ni pbkdf2Sync" · C · "la transformacion no bloquea el hilo principal" · F · "el contador de derivaciones esta vivo" |
| M10 | `console.log(plaintext)` al principio de `createPasswordHash` | ROJO esperado (1 failed) | G · "el modulo no escribe en ningun canal de salida" |

**Resultado: 9 de 10 mutaciones murieron a la primera; M5 sobrevivio y su test hubo que rehacerlo.**
Cierre comprobado: el modulo quedo byte-identico a la copia intacta, sin ninguna marca de mutacion,
y typecheck + lint + 58 tests en verde despues de revertir.

### 6.1 Por que M5 sobrevivio, y que se cambio (hallazgo, no adorno)

El unico caso de R11 era `n = 2^30`, y `2^30 > MAX_N (2^20)`: lo rechazaba el chequeo de **rango de
`n`**, no el techo de memoria, asi que quitar el techo no cambiaba nada. Peor: la cota de 100 ms
tampoco lo habria distinguido, porque aunque el valor llegue a `crypto.scrypt`, el `maxmem`
explicito lo hace fallar rapido con `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, que el `try/catch` convierte
en `false`. Rapido y en verde: el test decia proteger R11 y no protegia nada.

Correccion aplicada en `tests/unit/password/password-verify-fail-closed.test.ts` (unico test
modificado, sin quitar ni debilitar ningun assert previo):
1. Espia sobre `crypto.scrypt` que **delega en el original** y solo cuenta llamadas. R11 dice
   literalmente "sin llegar a reservar esa memoria": observar que la derivacion **no se invoca** es
   lo unico que distingue "rechazado en el parseo" de "rechazado por el propio scrypt".
2. Caso nuevo `n = 2^20, r = 32` (4 GiB) con **ambos parametros dentro de su rango**: solo lo puede
   rechazar el techo de memoria.
3. Caso de control "el contador de derivaciones esta vivo", para que el espia no sea vacuo.

### 6.2 Correccion a la tabla de `tasks.md` (M10)

`tasks.md` anuncia que M10 debe caer tambien por `guard-password-never-plaintext`. **No cae, y no es
un agujero:** esa guardia mira posiciones de *declaracion* de identificadores que nombran la
contrasena, y `console.log(plaintext)` no declara nada ni usa un identificador prohibido. R17 queda
cubierto por la regla 3 de la guardia nueva. Lo que estaba mal era la expectativa escrita en
`tasks.md`, no el test; queda anotado aqui para el reviewer.

## 7. T9 — barrido del presupuesto de coste (salida cruda)

```
$ grep -rn "createPasswordHash([^,)]*)" tests/
tests/unit/password/password-cost.test.ts:35:      const storedHash = await createPasswordHash(SECRET)
tests/unit/password/password-cost.test.ts:57:        await createPasswordHash(SECRET)
```

De las 18 llamadas a `createPasswordHash` en `tests/`, las unicas 2 sin `params` viven en
`password-cost.test.ts` (2 <= 4 del techo declarado). `password-hash.test.ts` importa
`DEFAULT_SCRYPT_PARAMS` solo para aritmetica de formato (T3.11 lo manda), no hashea con ellos.
Sin violaciones de presupuesto.

## 8. T12 — preguntas abiertas

**Pregunta abierta 3 de la feature 1** (`specs/1-modelo-usuarios-y-roles/design.md > 11`: si harian
falta columnas `password_algorithm` / `password_updated_at`) queda **RESPONDIDA: NO.** El algoritmo y
los parametros viajan dentro del propio valor almacenado (`$scrypt$n=..,r=..,p=..$..$..`), asi que
una columna seria una segunda copia del mismo dato que solo podria mentir; la rotacion ya funciona
sin ellas y `password_updated_at` responde a una politica de caducidad que nadie ha pedido.
Razonamiento completo en `design.md > 8`. El reviewer no debe buscarla abierta.

**Pregunta abierta 5 (pepper): CERRADA por el humano el 2026-08-06 con un no.** No se anadio nada.
Migrable de forma perezosa mas adelante si cambia la decision (`design.md > 8.1`).

**Sobreviven, y quedan anotadas en `progress/current.md > Deudas y cosas abiertas`** porque
condicionan la feature 4: la memoria/concurrencia de las funciones en Vercel con 64 MiB por
verificacion (pregunta 3 de `requirements.md`) y si el login debe rehashear al vuelo o la rotacion es
un script puntual (pregunta 4).

## 9. Notas de entorno para el leader (no son cambios de codigo)

El worktree recien montado **no tenia `node_modules`** y `pnpm typecheck` fallaba con `"tsc" no se
reconoce`. Dentro del worktree, y solo ahi, hubo que correr: `pnpm install --frozen-lockfile` (sin
cambios en el lockfile), `pnpm exec prisma generate` (sin el, `lib/prisma.ts` no typecheckea) y
`pnpm exec next typegen` (sin el, `app/layout.tsx` da `TS2304: Cannot find name 'LayoutProps'`). Los
tres errores eran **preexistentes y ajenos a esta feature**: son artefactos generados que faltan en
todo worktree nuevo. Vale la pena que `scripts/wt.sh new` los haga.

## 10. Veredicto del implementer

T1-T12 completadas. Typecheck, lint, las tres guardias y los 50 tests de la feature en verde; los 18
requisitos con test ejecutado; 10 mutaciones probadas de verdad, 9 rojas a la primera y M5 corregida
con su hallazgo documentado; delta de suite 2.17 s contra un objetivo de 3 s. **No me autoapruebo:**
faltan el `./init.sh` completo (del leader) y la revision del reviewer.

## 11. Sincronizacion con `dev` (2026-08-06, antes del reviewer)

Merge de `origin/dev` (que ya incluye la feature 7, `pantalla-de-login`) en la rama de la feature 2.

**Conflictos: ninguno, y esta vez se verifico en vez de suponerlo.** El aviso del leader era que la
colision entre las features 1 y 7 paso desapercibida porque git auto-mergeo en silencio dos archivos
con nombres distintos (`vitest.config.mts` vs `.ts`). Los dos puntos de riesgo se comprobaron uno a
uno tras el merge:

1. **Config de vitest: quedo la unificada de `dev`, sin duplicar.** Existe un solo archivo,
   `vitest.config.mts`, y `git diff origin/dev -- vitest.config.mts` sale **vacio**: es literalmente
   la version de `dev`, con los dos `projects` (`ui` en jsdom, `node` en node) repartidos por
   convencion de nombre y carpeta. Mis tests son `tests/unit/password/*.test.ts` y
   `tests/guards/*.test.ts`, o sea `.test.ts` fuera de `tests/ui/`: caen en el proyecto `node`, que
   es donde tienen que caer. Se confirma ejecutandolos, no leyendo la config.
   Igual de vacio el diff contra `dev` en `scripts/` (un solo `test-rapido.mjs`, el `.ts` viejo
   borrado) y en `package.json`.
2. **La guardia que corre es la afinada, y no me exime.** `git diff origin/dev --
   tests/guards/guard-password-never-plaintext.test.ts` tambien sale vacio. Su `IN_TRANSIT_ALLOWLIST`
   acota por ruta y solo cubre `lib/actions/login.ts` y `lib/types/auth.ts` (el `password` en transito
   del formulario de login), asi que `lib/utils/password-hash.ts` **no esta exento**: pasa por sus
   propios meritos, gracias a los nombres `createPasswordHash` / `verifyPasswordHash` / `plaintext`
   de `design.md > 9.1`.

**Comprobacion empirica de que la guardia nueva de verdad barre mi modulo** (una allowlist silenciosa
habria dejado el verde sin significado). Mutacion efimera: se anadio `const password = 'x'` al final
de `lib/utils/password-hash.ts`.
```
AssertionError: expected [ Array(1) ] to deeply equal []
+   "lib/utils/password-hash.ts: password",
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```
Revertida y confirmada byte-identica contra la copia intacta; guardias de nuevo verdes.

### Gate tras el merge (salida real)

```
> tsc --noEmit          (sin errores)
> eslint                (sin hallazgos)

$ pnpm exec vitest related --run lib/utils/password-hash.ts tests/support/password-test-params.ts
 Test Files  3 passed (3)
      Tests  42 passed (42)
   Duration  1.86s

$ pnpm exec vitest run tests/unit/password tests/guards
 Test Files  6 passed (6)
      Tests  60 passed (60)
   Duration  2.35s
real    0m4.001s
```

Los 60 son mis 50 mas los 10 tests de las otras dos guardias (la de RLS y la afinada, que trae dos
casos nuevos sobre su allowlist). **Los 18 requisitos siguen verdes contra la guardia afinada y con
la config unificada**; el merge no rompio nada mio y no hubo que tocar ni una linea del modulo.
Antes del merge hizo falta `pnpm install --frozen-lockfile` por las dependencias que trae la
feature 7 (`@vitejs/plugin-react`, jsdom, shadcn/ui); el lockfile no cambio.

## 12. Menores del reviewer, cerrados (2026-08-06, tras la aprobacion)

El reviewer aprobo sin bloqueantes y repitio las 10 mutaciones por su cuenta (las 10 mueren y
coinciden caso por caso con la seccion 6). Se cierran 3 de sus 4 menores; el cuarto
(`feature_list.json` desactualizado) es del leader, no de esta rama.

### 12.1 `areUsableCostParams` deja de estar exportada

**Decision: se quita el `export`, la funcion queda privada al modulo. `design.md` NO se toca.**
Barrido previo, que es lo que sostiene la decision:

```
$ grep -rn "areUsableCostParams" . --include="*.ts" --include="*.tsx" --include="*.md" | grep -v node_modules
./lib/utils/password-hash.ts:54:export function areUsableCostParams(...)
./lib/utils/password-hash.ts:111:  if (!areUsableCostParams(params)) {
./lib/utils/password-hash.ts:155:  if (!areUsableCostParams(params)) return null
./progress/impl_2-...md:150:| M5 | En `areUsableCostParams`: ...      <- prosa, no un import
```

Cero importadores: ni produccion, ni tests, ni las features 3/4 (que aun no existen). Y no figura en
el contrato publico de `design.md > 9`. La otra salida —anadirla al design— seria documentar API sin
consumidor, que es justo la sobre-ingenieria que `docs/architecture.md` rechaza; el dia que la
feature 4 quiera detectar parametros viejos, se exporta entonces y con su test. Un `export` "por si
acaso" es superficie publica que hay que sostener a cambio de nada.

### 12.2 R3: la sal ahora prueba su FUENTE, no solo unicidad y longitud

Hueco real: 200 sales distintas de 16 bytes las satisface igual un contador o `Math.random()`. Caso
nuevo en `tests/unit/password/password-hash.test.ts`:

`la sal sale de crypto.randomBytes: una llamada de 16 bytes por transformacion, y esos mismos bytes acaban en el segmento de sal (R3)`

Espia sobre `randomBytes` con `vi.hoisted` + `vi.mock('node:crypto', ...)` que **delega en el
original** (el hash sigue siendo real, no un stub) y afirma tres cosas: exactamente **una** llamada
por transformacion, pedida con **16**, y que **los bytes devueltos son hex-identicos al segmento de
sal decodificado**. El tercero es el que impide llamar a `randomBytes` de adorno y salar con otra cosa.

### 12.3 R17: los mensajes de error ya no pueden filtrar la entrada

Hueco real: el reviewer comprobo a mano que no hay fuga, pero nada la impedia manana. Casos nuevos:

- `un error de parametros de coste no filtra la entrada en claro por ningun canal del error (R17)` —
  hashea `'zorro-canela-9137-SECRETO'` con parametros invalidos y comprueba que **ninguna** de las
  cuatro superficies del error (`message`, `stack`, `String(error)`, `JSON.stringify` con
  `getOwnPropertyNames`) contiene el plaintext en texto plano, base64, base64url ni hex —las mismas
  codificaciones que R1, extraidas a un helper compartido— ni en comparacion case-insensitive.
- `verifyPasswordHash no produce ningun error del que filtrar nada ante valores almacenados invalidos (R17)`.

**Limitacion declarada, no disimulada:** no hay assert sobre el mensaje de un throw de
`verifyPasswordHash` porque **no existe camino que lance** (el error de `scrypt` se captura y se
vuelve `false`, el `plaintext` no-string se corta antes de `normalize`, y `timingSafeEqual` va
precedido de la comparacion de longitudes). Fabricar uno exigiria retorcer el codigo de produccion.

### 12.4 Mutaciones que respaldan los asserts nuevos

| # | Mutacion | Veredicto | Test caido |
| --- | --- | --- | --- |
| M11 | Sal desde `Math.random()` (16 bytes, siguen siendo unicos: fuente no criptografica) | ROJO (1 failed) | R3 nuevo — `AssertionError: expected [] to have a length of 1 but got +0` |
| M11b | Igual, pero **llamando a `randomBytes(16)` de adorno** y descartando el resultado | ROJO (1 failed) | R3 nuevo — `AssertionError: expected '8b681935...' to be 'ea6d71d7...'` (cae en el assert de igualdad de bytes) |
| M12 | `+ (entrada: ${plaintext})` en el mensaje del `RangeError` | ROJO (1 failed) | R17 nuevo — `AssertionError: expected 'parametros de coste fuera de rango: n…' not to contain 'zorro-canela-9137-SECRETO'` |

Dato que hace que M11 signifique algo: **los asserts viejos de R3 siguieron en verde** con la
mutacion puesta, o sea que la mutacion prueba lo nuevo y no lo que ya estaba. M11b la anadio el
`backend_dev` por su cuenta y esta bien tirada: sin ella, el assert de igualdad de bytes se quedaba
sin mutacion propia, porque M11 ya moria en el conteo de llamadas. Reversion confirmada por
`sha256sum` identico contra la copia intacta.

### 12.5 Gate tras los tres menores

```
> tsc --noEmit          (sin errores)
> eslint                (sin hallazgos)

$ pnpm exec vitest related --run lib/utils/password-hash.ts tests/support/password-test-params.ts
 Test Files  3 passed (3)
      Tests  45 passed (45)
   Duration  2.18s

$ pnpm exec vitest run tests/unit/password tests/guards
 Test Files  6 passed (6)
      Tests  63 passed (63)
   Duration  2.42s
```

63 tests (eran 60): +3 casos nuevos. Presupuesto **2.42 s < 3 s**, se sigue cumpliendo. Las tres
guardias verdes y ninguna modificada. En el mapa de la seccion 5, **R3** suma el caso de fuente
criptografica (respaldado por M11 y M11b) y **R17** suma los dos casos de mensajes de error
(respaldado por M12), ademas de las guardias estaticas que ya tenian.
