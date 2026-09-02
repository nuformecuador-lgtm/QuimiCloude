# QC-7 — login-usuario-y-contrasena · revision

**Veredicto: RECHAZADO** — 1 mayor, 8 menores.

Revisado sobre el worktree `.worktrees/QC-7-login-usuario-y-contrasena/`, diff
`git diff origin/dev...HEAD` (14 commits, 36 archivos). Todo lo que se afirma abajo se
verifico ejecutando, no leyendo la bitacora.

El trabajo es bueno: el dominio decide de verdad, la trazabilidad no es de adorno y los
cuatro puntos que el implementer declaro se sostienen. Lo que bloquea es **uno** y es
barato de cerrar: puede cerrarse con codigo o, si el humano acepta el riesgo, con una
linea de deuda escrita. Lo que no vale es que siga en silencio en la feature que QC-8 y
QC-9 van a copiar.

---

## 1. Checklist de CHECKPOINTS

### Especificacion
- [x] `requirements.md` con R1-R31 en EARS.
- [x] `design.md` con alternativas descartadas y su porque (6.1 cookie desde la Server
      Action, 6.2 sesion opaca con tabla, 6.3 libreria de JWT).
- [ ] **`tasks.md` con todas las tasks `[x]`** — T13 tiene la primera casilla vacia
      (`./init.sh` completo). Es la unica, esta declarada y su dueno es el leader, no el
      implementer. Ver menor M2.

### Trazabilidad
- [x] Los 31 requisitos mapean a un test que existe. Recorridos uno a uno contra el
      archivo y el nombre del `it`: los 31 estan y ninguno apunta a un test fantasma.
- [x] `progress/impl_QC-7-...md > 7` contiene el mapa `R<n> -> test`.
- Matiz: **R15 esta cubierto solo en parte**. Ver menor M1.

### Calidad de codigo
- [x] `pnpm run typecheck` — sin errores (corrido por mi).
- [x] `pnpm run lint` — sin errores (corrido por mi).
- [x] `pnpm exec vitest run` — **27 archivos / 267 tests, todos verdes** (corrido por mi,
      incluida la carpeta de integracion contra la base real).
- [x] `pnpm exec vitest run guard` — **5 archivos / 65 tests verdes**.
- [~] E2E en flujo critico: el spec existe (`e2e/login.spec.ts`, chromium + webkit) pero
      **no pude reproducir su verde**: el disco de la maquina esta al 100 % y `next dev` no
      puede compilar. Ver menor M6.
- [x] Feature de backend: no toca `app/` ni `components/`. La regla multiplataforma no
      aplica y `design.md > 10` lo declara. Aun asi el E2E corre en WebKit, que es el motor
      de iOS: es mas de lo que se pedia.
- [x] Dependencias: una sola, `@playwright/test`, con fila en `docs/dependencias.md` y los
      cuatro checks citados en `design.md > 6.4`.

### Datos y seguridad
- [x] La autorizacion se decide en el dominio y tiene test; no se delega a RLS.
- [x] No hay tabla nueva (tres columnas en `users`), asi que no aplica RLS nueva. `users`
      ya tiene `FORCE ROW LEVEL SECURITY` desde QC-4 y anadir columnas no lo altera;
      `guard-rls-force` sigue verde.
- [x] El acceso a datos pasa solo por Prisma. `$queryRaw` **parametrizado** (template tag),
      nunca interpolacion.
- [x] Migracion reversible: **ciclo up/down probado por mi**, no leido —
      `pnpm run db:rollback` -> `prisma migrate status` dice "not yet applied" ->
      `pnpm run db:migrate` -> "Database schema is up to date!".
- [x] Ningun secreto hardcodeado. `SESSION_SECRET` por entorno, `.env.example` con
      placeholder vacio, y el adaptador falla cerrado por debajo de 32 caracteres.
- [x] No hay webhooks en esta feature.

### Modulos hexagonales
- [x] `domain/` y `ports/` no importan framework, base, `shared` ni adaptadores.
- [x] De otro modulo no se importa nada por ruta profunda.
- [x] Ningun driving instancia su driven: el unico archivo que importa `adapters/driven/`
      es `lib/composition/index.ts`.
- [x] `lib/shared/` sigue siendo hoja.
- [x] El barrel no reexporta `'use server'` ni arrastra `next/*` ni `@prisma/client`.
- [x] `User` conserva `/// @module identity` — y lo afirma un test, no un ojo
      (`identity-schema.test.ts`, "el modelo User sigue siendo propiedad del modulo identity").
- [x] En la raiz de `lib/` solo hay `composition/`, `modules/`, `shared/` y `utils.ts`.
- [x] **La logica de negocio esta en `domain/`, no en la Server Action.** Ver seccion 3.

### Verificacion final
- [ ] `./init.sh` completo: **lo corre el leader en paralelo**, por acuerdo explicito. Yo
      corri sus componentes por separado, todos verdes. **No lo lance a proposito**: dos
      procesos de vitest simultaneos contra la misma base es exactamente la carrera que el
      propio implementer documenta en 6.2, y habria producido un rojo falso para los dos.
- [x] Este archivo existe.
- [ ] Entrada en `progress/history.md`: pendiente, es del leader al cerrar.
- [ ] Desmontar worktree: pendiente, es del leader.

---

## 2. Las cuatro propiedades de seguridad, verificadas por mi

### 2.1 Mensaje identico en los tres caminos — OK

`lib/modules/identity/domain/verify-credentials.ts:39` define **un** objeto de rechazo,
congelado, y los tres caminos devuelven **esa misma referencia**:

```ts
const REJECTED: { ok: boolean } = Object.freeze({ ok: false });
```

- linea 68-74: usuario inexistente -> `REJECTED`
- linea 82: cuenta bloqueada -> `REJECTED`
- linea 84-87: contrasena mala -> `REJECTED`

No es que se parezcan: es el mismo objeto. Un campo nuevo en uno de los caminos exigiria
construir un objeto distinto, y eso se ve en el diff. El test
`verify-credentials.test.ts:235` compara los tres con `toEqual` en cadena. El bloqueo no
tiene mensaje propio, que es lo correcto: solo un usuario que existe puede estar bloqueado.

### 2.2 Uniformidad de tiempo — la conclusion aguanta; el numero "2,0 %" no

Medi yo, con bcrypt real, los tres caminos **interleavados** (no en bloques), con
calentamiento previo y **medianas** sobre 60 muestras por camino:

```
inexistente n=60 p10=110.7 mediana=166.2 p90=392.7 min=103.1 max=539.1
clave-mala  n=60 p10=112.1 mediana=160.0 p90=378.5 min=102.4 max=460.9
bloqueada   n=60 p10=110.5 mediana=169.0 p90=388.7 min= 99.4 max=645.5
dispersion entre medianas = 8.96 ms (5.6 %)
```

Juicio del metodo, que es lo que se me pedia:

- **La mediana sobre 40-60 muestras interleavadas y con calentamiento es el metodo
  correcto** para esto. Una media habria sido inaceptable (las colas de 500-645 ms la
  arrastran); el implementer no uso media, uso mediana y reporto ademas p10/p90. Bien.
- **El numero concreto no es una propiedad del codigo, es de la maquina.** El declaro
  1,7 % y 2,0 %; a mi me sale 5,6 % con la maquina mas cargada todavia. Citar "2,0 %"
  como si fuera una garantia es lo unico criticable.
- **Lo que sostiene la conclusion no es la dispersion, es la comparacion con el ruido
  propio.** El recorrido p10->p90 **dentro** de cada camino es de ~280 ms; la diferencia
  **entre** caminos es de 9 ms. La senal esta ~30 veces por debajo del ruido de bcrypt.
- **Y el orden se da la vuelta entre corridas**: en las suyas "bloqueada" era el camino
  mas rapido, en la mia el mas lento. Un sesgo real no cambia de signo. Esa inversion es
  mejor evidencia de que no hay senal que cualquier porcentaje.
- **El p10 es aun mas limpio** (110,7 / 112,1 / 110,5 ms, 1,4 % entre si) y es el
  estadistico menos contaminado por la carga de la maquina.

Concluyo: **uniformidad correcta y bien argumentada**. La causa —una y solo una
verificacion de hash en los tres caminos— si esta vigilada de forma determinista
(`verify-credentials.test.ts:127`, `:257`), que es la unica forma sana de tenerlo en el
gate. Acierto no dejar el banco de tiempos en el repo.

El limite que el declara (el camino que escribe paga un `UPDATE` extra) es real, esta
escrito y es del orden del milisegundo frente a ~110 ms. De acuerdo con dejarlo asi.

### 2.3 Cero escrituras si el usuario no existe — OK

`verify-credentials.ts:68-74`: la rama `usuario === null` verifica el senuelo y **retorna
antes** de que `deps.attempts` aparezca en ninguna linea. No es que no se llame por
casualidad: el puerto de escritura no se toca en esa rama. Test:
`verify-credentials.test.ts:313` con dos usuarios inexistentes distintos y
`expect(attempts.record).not.toHaveBeenCalled()`.

### 2.4 Un bloqueado no entra ni con la contrasena correcta, y no se alarga — OK

`verify-credentials.ts:82`: `if (isLocked(usuario, now)) return REJECTED;` — el corte esta
**despues** de verificar el hash (uniformidad) y **antes** de cualquier `record`, asi que
martillear la cuenta no escribe nada. Ademas `account-lock.ts:50` devuelve el estado tal
cual si esta bloqueada, o sea que hay doble red. Tres tests, y ademas contra fila real:
`login.int.test.ts:253` afirma que las tres columnas quedan **exactamente** como estaban
tras un intento durante el bloqueo.

---

## 3. La logica de negocio esta en `domain/`, no en la Server Action — OK

Esto es lo que la guardia no ve, y donde mas facil habria sido colar un caso de uso de
paja. No lo es:

- `login-action.ts` **no aparece en el diff**: cero lineas. Sigue traduciendo `FormData`,
  llamando a la fachada y redirigiendo.
- `verify-credentials.ts` **decide**: parsea (corte por R8 antes de tocar puerto ninguno),
  normaliza el usuario, fija **un solo reloj** por invocacion, corta por bloqueo, decide
  verificar siempre —tambien en el camino bloqueado—, calcula el siguiente estado con
  `nextLockState` y solo entonces emite el ticket. Nada de eso es delegacion.
- `account-lock.ts` es politica pura: 68 lineas sin un solo import, con `now` por
  parametro. La tabla de escalada de `design.md > 5.5` esta ahi y en ningun otro sitio; el
  adaptador Prisma **solo persiste lo que el dominio ya calculo**
  (`user-credentials-prisma.ts:60-69`), no decide nada.
- El puerto lo dice explicitamente en su comentario
  (`ports/login-attempt-recorder.ts`): "el dominio calcula, el puerto solo persiste".

Un caso de uso que solo llamara al adaptador y devolviera no podria tener el test
"el exito reinicia contador, nivel y bloqueo" comprobando el **orden** entre `record` y
`startSession` (`verify-credentials.test.ts:288`). Ese test solo existe porque hay
decision que ordenar.

---

## 4. La guardia de arquitectura sigue mordiendo — OK, fila por fila

Recorri la tabla de `docs/architecture.md > La regla de dependencias` contra lo nuevo:

| Archivo nuevo | Fila | Importa | Veredicto |
| --- | --- | --- | --- |
| `ports/user-credentials-reader.ts` | domain/ports | `../domain/account-lock` (type) | OK |
| `ports/login-attempt-recorder.ts` | domain/ports | `../domain/account-lock` (type) | OK |
| `ports/session-writer.ts` | domain/ports | `../domain/session` (type) | OK |
| `domain/session.ts` | domain | nada | OK |
| `domain/account-lock.ts` | domain | nada | OK |
| `domain/verify-credentials.ts` | domain | su propio `domain/` + los 4 puertos, todos `import type` | OK |
| `adapters/driven/persistence/user-credentials-prisma.ts` | driven | `@/lib/shared/db/prisma` (permitido), su `domain/`, sus `ports/` | OK |
| `adapters/driven/session/session-cookie.ts` | driven | `node:crypto`, **`next/headers`**, su `domain/` | ver abajo |
| `lib/composition/index.ts` | composition | barrel + puertos + adapters/driven. Ningun driving | OK |

**`next/headers` en `adapters/driven/`:** la fila de la tabla **no lo menciona**, ni para
permitirlo ni para prohibirlo, y la guardia solo prohibe ahi `lib/composition`,
`../driving/`, `app/` y `components/`. O sea que pasa en verde **porque la regla no
existe**, no porque se haya comprobado. El implementer no se lo callo: esta en
`design.md > 4.2`, en la pregunta abierta del `requirements.md` y en la bitacora. **Es la
conducta correcta** — no inventar una fila de arquitectura desde una feature (regla 6 de
`CLAUDE.md`). Queda para el humano.

La guardia sigue mordiendo, no solo pasando: `guard-dependencias-aprobadas` es
bidireccional y lo comprobo el propio commit de Playwright; `identity-migration.test.ts`
incluye un test de mutacion ("la guardia de simetria cae si el DOWN se olvida de una
columna") que demuestra que la asercion de simetria no es tautologica.

---

## 5. Los cuatro puntos que el implementer declaro

### 5.1 `fileParallelism: false` — de acuerdo, y ademas mejor de lo declarado

**Reproduje la carrera yo mismo:**

```
$ pnpm exec vitest run tests/integration --fileParallelism
 Test Files  1 failed | 1 passed (2)
      Tests  3 failed | 27 passed (30)
  -> los 3 fallos en tests/integration/identity/identity-constraints.int.test.ts
  -> los 3 en la misma asercion: expect(await tx.user.count()).toBe(0)
```

Y en serie: 267/267 verdes. La evidencia sostiene la conclusion, con una correccion a
favor del implementer: **no puso `fileParallelism: false` global**, creo un **tercer
proyecto** `integration` en `vitest.config.mts` y lo limito ahi. Unitarios y UI siguen en
paralelo. Eso es menos invasivo de lo que la bitacora sugiere y es lo correcto para
infraestructura compartida.

**No debilita ninguna asercion.** Serializar cambia el **entrelazado**, no lo que se
comprueba: las 30 aserciones se siguen evaluando igual. Serializar debilitaria algo si el
verde dependiera de saltarse un caso o de relajar un `expect` — no es lo que pasa aqui.
Lo que se pierde es velocidad y la capacidad de detectar carreras entre archivos, que era
justamente ruido y no senal: el estado global de una tabla no es una propiedad que un test
de otra feature deba poder observar.

**Y si, es deuda ajena.** `expect(await tx.user.count()).toBe(0)` es un test de QC-4
escrito bajo el supuesto tacito "soy el unico". El arreglo de fondo —acotar esa asercion a
sus propias filas— es reescribir el test de otra feature, que no es alcance de QC-7 y que
ademas violaria la regla de no tocar lo ajeno. El limite que el declara (dos **procesos**
de vitest simultaneos siguen chocando) es real y esta escrito. Correcto en los tres
frentes.

### 5.2 `.gitignore`, `.env.example`, `AGENTS.md` — verificado: es ruido, no proceso

Mire el diff de `AGENTS.md` linea a linea. Son **10 lineas**, todas dentro de los
marcadores `BEGIN:nextjs-agent-rules` / `END:nextjs-agent-rules`, con el texto generico de
Next ("This is NOT the Next.js you know") y la referencia a
`node_modules/next/dist/server/lib/generate-agent-files.js`. **Cero contenido de proceso**:
no toca delegacion, ni orden de subagentes, ni puertas de aprobacion, ni la regla de
paralelismo. Va ademas en un commit **aparte** (`5682dd6`), etiquetado, sin mezclarse con
la feature. Manejo correcto.

`.gitignore` (+5): artefactos de Playwright (`/test-results/`, `/playwright-report/`,
`/.playwright/`). Justificado por T11.
`.env.example` (+5): `SESSION_SECRET=` **vacio**, con comentario. Ningun valor real.

### 5.3 Playwright: instalacion y fila en el mismo commit — verificado

`git show --stat bec3b8e` -> `.gitignore`, `docs/dependencias.md`, `package.json`,
`pnpm-lock.yaml`, `playwright.config.ts`. **Un solo commit**, como exige la
bidireccionalidad de la guardia.

Los cuatro checks de la fila coinciden **exactamente** con `design.md > 6.4`:

| Check | `docs/dependencias.md` | `design.md > 6.4` |
| --- | --- | --- |
| deprecada | "no deprecada" | No |
| ultima publicacion | 2026-09-01 | 2026-09-01 |
| descargas | 58,4M/semana | 58,4 M/semana |
| licencia | Apache-2.0 | Apache-2.0 |
| puerta humana | "Aprobada por el humano" | "Aprobada por el humano el 2026-09-01" |

`guard-dependencias-aprobadas` verde en las dos direcciones.

### 5.4 La migracion `user_login_lockout` — verificado, ejecutandola

- `down.sql` existe, con cabecera explicando la convencion y los tres `DROP COLUMN` **en
  orden inverso** al `ADD COLUMN`.
- Ciclo probado por mi: `db:rollback` -> `migrate status` = "not yet applied" ->
  `db:migrate` -> "Database schema is up to date!". `_prisma_migrations` coherente.
- `/// @module identity` sobre `model User` intacto, y **con test que lo afirma**
  (`identity-schema.test.ts`), no solo ausencia en el diff.
- El UP no crea tabla ni indice ni toca RLS; los tests lo afirman por forma de la
  sentencia, no por texto literal.

---

## 6. Reanudacion: ninguna casilla `[x]` miente

El implementer murio a media tarea. Repase las 16 casillas de `tasks.md` contra el arbol:

| Task | Casilla | Comprobado |
| --- | --- | --- |
| T0 | [x] | `.env` presente en el worktree |
| T1 | [x] | `domain/session.ts` existe, sin imports, con su test |
| T1b | [x] | `domain/account-lock.ts` con los 6 casos de la task, uno a uno, todos presentes |
| T2 | [x] | los 3 puertos existen y solo importan de `domain/` |
| T2b | [x] | migracion + `down.sql`; ciclo up/down **ejecutado por mi** |
| T3 | [x] | adaptador con `$queryRaw` parametrizado y `update` tipado; devuelve solo id/hash/bloqueo |
| T4 | [x] | los **17** casos que enumera la task estan en `verify-credentials.test.ts`, con su marca `R<n>` |
| T5 | [x] | los 6 casos de la task estan en `session-cookie.test.ts` |
| T6 | [x] | composicion cablea los 4 puertos; `logout-action.test.ts` **no** aparece en el diff |
| T6b | [x] | **diff acotado exactamente a lo permitido** |
| T7 | [x] | `.env.example` con placeholder vacio |
| T8 | [x] | 7 casos contra Postgres real; verdes en mi corrida |
| T9 | [x] | guardias verdes; revision manual escrita en la bitacora seccion 5 |
| T11 | [x] | un solo commit; `playwright test --list` funciona |
| T12 | [x] | el spec existe con los dos caminos; su verde no lo pude reproducir (M6) |
| T13 | parcial | primera casilla `[ ]`, declarada |

**No encontre ninguna casilla `[x]` falsa.** El riesgo tipico de una reanudacion —marcar
hecho lo que no esta— no se materializo.

Sobre el alcance de tests: `login-action.test.ts` es el **unico** test preexistente que se
toco, y solo en lo que T6b autorizaba: quita `loadRealStub`, sustituye el `beforeEach` por
un doble explicito, borra el test "rechaza todo intento valido mientras no hay verificacion
real" y **conserva** "no accede a base de datos ni emite cookie". Ni una asercion mas.
`logout-action.test.ts`, `password-hash.test.ts`, `password-verify-fail-closed.test.ts`,
`password-max-length.test.ts` y las cinco guardias **no aparecen en el diff**. Los dos de
`schema/` se extienden, no se modifican: las aserciones viejas siguen ahi y las nuevas se
anaden en bloques propios.

---

## 7. Hallazgos

### MAYORES (bloqueantes)

**M-A1 — El contador de fallos se escribe con lectura-modificacion-escritura no atomica:
bajo peticiones concurrentes el bloqueo de R22 no se dispara.**

Archivos:
- `lib/modules/identity/domain/verify-credentials.ts:66` (lectura) y `:85` (escritura)
- `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts:60-69`

```ts
// user-credentials-prisma.ts:60
await prisma.user.update({
  where: { id: userId },
  data: { failedLoginAttempts: state.failedAttempts, ... },   // valor ABSOLUTO
});
```

El caso de uso lee el estado (`findActiveByUsername`), tarda ~110 ms verificando bcrypt y
**despues** escribe un valor absoluto calculado sobre la lectura vieja. No hay transaccion,
ni `SELECT ... FOR UPDATE`, ni `increment`, ni update condicional por el valor leido.

Consecuencia concreta: un atacante que dispare 50 intentos **en paralelo** contra la misma
cuenta hace que las 50 lecturas devuelvan `failedAttempts: 0` y las 50 escrituras dejen
`1`. La cuenta nunca llega a 5 y **nunca se bloquea**. El limite de intentos deja de
existir justo frente al unico atacante que importa: nadie hace fuerza bruta en serie
esperando 110 ms por intento.

Por que es bloqueante y no un menor:

1. **Es el control entero que anade esta feature.** El bloqueo con escalada es la
   ampliacion de alcance del 2026-09-01, con migracion propia y diez requisitos (R22-R31).
   Un control de fuerza bruta esquivable con un `Promise.all` no cumple su proposito.
2. **No esta declarado en ningun sitio.** Esto es lo que mas pesa. El implementer documento
   limites mucho mas pequenos —el `UPDATE` de 1 ms en la uniformidad de tiempo
   (`design.md > 5.5`), los dos procesos de vitest (`impl > 6.2`), el nivel que no decae—
   con precision ejemplar. Que la concurrencia no aparezca ni en `design.md`, ni en
   `requirements.md`, ni en la bitacora, ni en `progress/current.md > Deudas`, indica que
   **no se penso**, no que se decidiera asumirlo. `CLAUDE.md` regla 6: lo que no esta
   escrito no esta decidido.
3. **Es la feature plantilla.** El propio encargo dice que QC-8 y QC-9 van a copiar lo que
   pase aqui. El patron "leer estado, tardar 100 ms, escribir absoluto" se copia entero.

Que hace falta para cerrarlo — **cualquiera de las dos**:

- **(a) Codigo.** Que el registro del fallo sea atomico o condicional. La forma barata, sin
  transaccion y sin tocar el dominio: un update condicionado al estado leido
  (`where: { id, failedLoginAttempts: <valor leido> }`) que, si no afecta filas, reintente
  releyendo. O mover el incremento a un `increment` de Prisma y dejar en el dominio solo la
  decision de bloquear. Ojo con R31: la escritura solo puede ocurrir cuando el usuario
  existe, cosa que ya garantiza la posicion de la rama.
- **(b) Papel.** Si el humano acepta el riesgo —es un ERP de un tenant, sin registro
  publico, lo mismo que ya se acepto en D12— basta con **escribirlo**: una fila en
  `design.md > 6.5` junto al riesgo de DoS por cuenta y una entrada en
  `progress/current.md > Deudas`, con el mecanismo y por que se asume. La decision es del
  humano; lo que el reviewer no puede aprobar es el silencio.

No propongo el parche ni lo escribo: vuelve al implementer.

### MENORES

**M1 — R15 esta cubierto solo en su tercio de la cookie.**
`tests/unit/identity/session-cookie.test.ts:150-164`. R15 prohibe registrar tres cosas: la
contrasena recibida, el hash almacenado y el valor de la cookie. El test espia `console`
**solo durante `startSession`**, funcion por la que la contrasena y el hash no pasan nunca.
Las clausulas de contrasena y hash no las ejercita ningun test. Comprobado a mano que el
requisito **si se cumple** (buscar `console.` en `lib/` devuelve una sola linea, y es un
comentario en `user-credentials-prisma.ts:31`), por eso es menor y no mayor. Ademas,
`expect(espia).not.toHaveBeenCalled()` en la linea 159 deja el bucle de `not.toContain` de
las lineas 160-162 como codigo muerto. Cerrarlo cuesta poco: espiar `console` alrededor de
un `verifyCredentials` completo con hasher real y afirmar que ni la contrasena ni el hash
aparecen en ninguna llamada.

**M2 — `tasks.md` T13 tiene una casilla sin marcar.**
`specs/QC-7-login-usuario-y-contrasena/tasks.md:312`. `CHECKPOINTS.md > Especificacion`
exige todas `[x]`. Es la unica, esta declarada en la bitacora y su dueno es el leader. **El
cierre de la feature queda condicionado a marcarla cuando `./init.sh` complete verde.** No
es reproche al implementer: hizo bien en no marcar lo que no corrio.

**M3 — El hash senuelo se calcula perezosamente: el primer intento con usuario inexistente
de cada proceso paga bcrypt dos veces.**
`lib/modules/identity/domain/verify-credentials.ts:46-53`. `decoyHashPromise` se rellena en
la primera llamada, asi que esa unica invocacion paga `hash()` **mas** `verify()`, ~220 ms
frente a ~110. Es una sola muestra por proceso y el atacante no controla cuando arranca el
proceso, o sea que no es explotable; pero es una asimetria real que no esta escrita en
ningun sitio. Basta con anotarlo, o con calentar el senuelo al construir el caso de uso.

**M4 — El "2,0 % de dispersion" no es una propiedad del codigo.**
`progress/impl_QC-7-login-usuario-y-contrasena.md:141`. Es una medida de una maquina y una
carga; a mi me sale 5,6 % con el mismo codigo. La conclusion es correcta y el metodo
tambien (medianas, interleavado, calentamiento), pero el numero no deberia citarse como
garantia. Lo que si se puede afirmar y se sostiene: **la diferencia entre caminos esta ~30
veces por debajo del recorrido p10-p90 de cada camino, y su orden se invierte entre
corridas**. Reescribir esa frase deja la evidencia mas fuerte, no mas debil.

**M5 — `playwright.config.ts:31` reusa un servidor ajeno.**
`reuseExistingServer: !process.env.CI`. Este repo se trabaja con varios worktrees a la vez
(`docs/worktrees.md`). Si hay un `next dev` de **otra rama** en `:3000`, el E2E se engancha
a el y da verde o rojo sobre codigo que no es el de la feature. En CI esta bien; en local
es una trampa silenciosa. Un puerto propio por worktree, o al menos un aviso en la
bitacora, lo evita.

**M6 — El verde del E2E no lo pude reproducir, por el disco de la maquina.**
`pnpm run e2e` me da 4 fallos, los cuatro por timeout en
`page.getByTestId('login-username')` (`e2e/login.spec.ts:129`). La causa **no es el
codigo**: `C:` esta al 100 % (140 K libres), `next dev` no puede escribir `.next` y la
pagina no llega a compilarse. Lo dejo escrito por dos razones: la salida pegada en
`impl > 4.5` queda **sin verificacion independiente**, y el `./init.sh` que corre el leader
puede topar con la misma pared. Habria que repetir `pnpm run e2e` con disco libre antes de
dar por cerrada la casilla de E2E de `CHECKPOINTS.md`.

**M7 — El E2E reutiliza el mismo usuario para el camino de error.**
`e2e/login.spec.ts:129-131`. Cada fallo suma uno a `failed_login_attempts` del usuario del
fixture. Con `fullyParallel` y `retries: 2` en CI, varias repeticiones del camino de error
en el mismo worker podrian acercarse a 5 y **bloquear la cuenta**, volviendo rojo el camino
feliz por una razon que no es un fallo del login. Un usuario propio por test, o resetear
las tres columnas en un `beforeEach`, lo cierra.

**M8 — Tres desajustes de documentacion, sin efecto en el codigo.**
- `specs/QC-7-login-usuario-y-contrasena/tasks.md` salta de T9 a T11: no hay T10 y nada
  explica el hueco.
- `design.md > 4.2` la llama "pregunta abierta 5"; en `requirements.md:173` es la 2.
- `design.md > 4.2` muestra `import { createHmac, timingSafeEqual } from 'node:crypto'`,
  pero `session-cookie.ts:1` solo importa `createHmac` — `timingSafeEqual` es de QC-8, como
  el propio 5.1 explica. El snippet del design deberia decirlo o no incluirlo.

---

## 8. Veredicto

**RECHAZADO** — 1 mayor, 8 menores.

Vuelve al implementer solo por **M-A1**. Los ocho menores no bloquean; M1, M2 y M6 conviene
cerrarlos en la misma vuelta porque son baratos y tocan casillas de `CHECKPOINTS.md`.

Para que conste, porque un rechazo por un punto no debe leerse como un suspenso: la
trazabilidad R1-R31 es real y no decorativa, el dominio decide de verdad, el ciclo up/down
de la migracion aguanta ejecutado, la carrera de integracion la reproduje y el arreglo es
correcto y esta bien acotado, el diff de `AGENTS.md` es ruido comprobado, Playwright entro
por la puerta, y `login-action.test.ts` se toco exactamente en lo autorizado. El unico
agujero es el que ningun test podia encontrar porque nadie escribio la pregunta.

---
---

# Ronda 2 — tras el arreglo de M-A1

**Veredicto: RECHAZADO** — 1 mayor nuevo, 3 menores nuevos.

Revisado `git diff 682e2e5..HEAD` (4 commits, el ultimo del leader). No repeti el gate completo:
el leader lo corrio en verde y repetirlo a la vez habria chocado con la carrera de la base. Si
corri un archivo de integracion propio y temporal, ya borrado (`git status` limpio).

M-A1 esta **bien arreglado en lo esencial**: el CAS aguanta la concurrencia, y lo comprobe con
mas carga de la que el implementer probo. Lo que devuelve la feature es una **segunda ventana**,
mas estrecha, que el propio codigo declara imposible con un argumento que **no es cierto**. Lo
demostre ejecutandolo.

## R2.1 ¿El CAS cierra la carrera o la estrecha? — la cierra, y aguanta mas de lo probado

Sus tests usan 3 y 5 intentos. Los subi a 20 y 40, con adaptadores reales contra Postgres:

```
REV 20-paralelo => {"failedLoginAttempts":0,"lockLevel":1,"lockedUntil":"2026-09-02T01:21:13.888Z"}
REV 40-paralelo => {"failedLoginAttempts":0,"lockLevel":1,"lockedUntil":"2026-09-02T01:21:15.449Z"}
```

Con 40 intentos simultaneos la cuenta **se bloquea**, en nivel 1 y con el contador a 0, que es
exactamente el estado correcto. Con el codigo viejo el contador se habria quedado en 1.

**El razonamiento de los 10 reintentos es correcto y lo confirma la maquina.** La cadena de
transiciones tiene 5 escalones antes del bloqueo —(0,0) -> (1,0) -> ... -> (4,0) -> (0,1,T)— y en
cada ronda gana exactamente un CAS; en cuanto la fila queda bloqueada, todo el que relee ve el
bloqueo y sale sin escribir. Por eso subir de 5 a 40 intentos **no** aumenta las vueltas del
bucle: las aumenta hasta el bloqueo y ahi se acaban. 10 sobra con holgura, y el caso limite
—perder 10 veces y no contar ese intento— esta declarado en `design.md > 5.7` y en
`progress/current.md > Deudas`, con el argumento correcto de que el contador es monotono y el
bloqueo se dispara igual. Nada que objetar aqui.

El camino de exito con `set` incondicional tambien es correcto: su estado es todo ceros, no
depende del valor previo y es idempotente. Bien separadas las dos primitivas en el puerto.

## R2.2 El predicado sin `locked_until` SI abre una ventana — MAYOR

### El argumento sobre `timestamptz(6)` es defendible; la frase que lo acompana es falsa

Lo primero es cierto a medias: `locked_until` es `timestamptz(6)` y un `Date` de JS solo llega al
milisegundo. Pero **todos** los valores que se escriben en esa columna salen de un `new Date()`
via Prisma, o sea que llegan con los microsegundos a cero y vuelven identicos: una igualdad
exacta casaria hoy sin problema. El riesgo que describe es real solo si algun dia escribe esa
columna algo que no sea este codigo. Es una precaucion legitima, no un hecho.

Lo que **no** es cierto es la segunda mitad, la que hace de coartada — en
`user-credentials-prisma.ts:64` y repetida en `design.md > 5.7`:

> "Ademas no hace falta: el par `(failedAttempts, lockLevel)` ya identifica cada estado de la
> cadena de transiciones."

**No lo identifica.** El par `(0, 1)` aparece **dos veces** con `locked_until` distinto:

- como bloqueo **recien consumado**: `(0, 1, T_futuro)`;
- como ese mismo bloqueo ya **caducado**: `(0, 1, T_pasado)`.

Y se vuelve a llegar a `(0,1)` despues de un exito, porque `nextLockState(_, 'success')` devuelve
`(0, 0, null)` y desde ahi otros 5 fallos dan `(0, 1, T')`. El par se repite; el estado no es el
mismo. Eso es un ABA de manual, y el predicado del CAS no lo ve.

### Ejecutado, no argumentado

Puse la fila en un bloqueo **activo** y lance el CAS con el estado obsoleto que otro intento
habria leido cuando ese bloqueo aun estaba caducado:

```ts
// fila real: failed=0, level=1, lockedUntil = ahora + 60s   (bloqueo ACTIVO)
await compareAndSetLoginAttempt(
  usuarioId,
  { failedAttempts: 0, lockLevel: 1, lockedUntil: pasado },   // lo que leyo el intento viejo
  { failedAttempts: 1, lockLevel: 1, lockedUntil: null },
);
```

```
REV ABA aplico => true estado => {"failedLoginAttempts":1,"lockLevel":1,"lockedUntil":null}
```

**El CAS aplico sobre un bloqueo activo y lo borro.** `locked_until` paso a `null`: la cuenta
salio del bloqueo. No es que el CAS "no proteja lo suficiente" — es que escribe encima de un
estado que el dominio jamas habria escogido, porque el dominio corta por `isLocked` justo antes
y aqui el `isLocked` se evaluo sobre la copia vieja.

### Que hace falta para alcanzarlo desde el dominio, y por que aun asi bloquea

Honestamente, la ventana es estrecha. Hace falta, dentro de los ~110 ms que un intento pasa en
bcrypt entre su lectura y su CAS:

1. que ese intento leyera `(0, 1, caducado)`;
2. **un login con exito** por medio (sin el, `lock_level` nunca vuelve a un valor anterior y no
   hay ABA posible: lo comprobe recorriendo la cadena entera);
3. y otros 5 fallos ganadores que consumen un bloqueo nuevo.

Con muchos intentos en vuelo a la vez —que es el escenario del que trata todo este arreglo— los
puntos 3 caben de sobra en 110 ms, porque sus bcrypt ya venian corriendo. El punto 2 es el que lo
hace raro. El dano tampoco es total: el bloqueo se limpia una vez y el atacante necesita otros 5
fallos para reponerlo.

Aun asi lo mantengo como **mayor**, por tres razones:

1. **Es el mismo tipo de fallo que M-A1, un escalon mas abajo:** una escritura que pisa un estado
   que no leyo. Cerrar M-A1 y dejar esta es cerrar la puerta y no la ventana.
2. **Esta declarado imposible por escrito, y no lo es.** Un comentario que dice "no hace falta"
   apaga la pregunta para el proximo que lea. Es exactamente lo que el propio implementer
   diagnostico de si mismo en 9.1: "no es que se asumiera el riesgo, es que no se penso". Aqui si
   se penso, pero se cerro con una premisa falsa, que es peor de rastrear.
3. **El arreglo es de tres lineas y no reabre el problema de precision** que motivo dejar
   `locked_until` fuera. No hace falta igualdad exacta de timestamps: basta con exigir que la
   fila **no este bloqueada ahora**, que es una comparacion de **rango** y por tanto inmune al
   micro-vs-milisegundo:

```ts
where: {
  id: userId,
  failedLoginAttempts: esperado.failedAttempts,
  lockLevel: esperado.lockLevel,
  OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
}
```

Con eso el CAS no puede aplicar **nunca** sobre un bloqueo vivo, que es la unica propiedad que
hacia falta. Exige pasar `now` al puerto —el dominio ya lo tiene fijado por invocacion— y deja
intacto todo lo demas: la politica sigue en `nextLockState` y el adaptador sigue sin decidir.
Tambien cierra el unico escenario en que los 10 reintentos podrian agotarse (un exito reinicia la
cadena a mitad del bucle).

No escribo el parche: vuelve al implementer. Si el humano prefiere asumirlo, la condicion minima
es **borrar la frase falsa** de `user-credentials-prisma.ts` y de `design.md > 5.7` y sustituirla
por el escenario real y su probabilidad. Lo que no puede quedarse es la coartada.

## R2.3 El tercer test: la honestidad es cierta, la razon que da no

Confirmado lo que declara: **"intentos en paralelo durante el bloqueo no lo alargan" pasa tambien
con el codigo viejo**. El corte esta en `verify-credentials.ts:135` (`isLocked` antes de tocar
ningun puerto de escritura) y no depende en absoluto de como se persista. Declararlo, en vez de
apuntarse tres tests discriminantes cuando solo dos lo son, es lo que separa la evidencia del
adorno. Bien.

Pero la razon que da para conservarlo **no describe lo que el test hace**:

> "se deja porque cubre el caso nuevo de que el bloqueo aparezca a mitad del reintento"

No lo cubre. En ese test (`login.int.test.ts:301`) la fila se deja **bloqueada antes** de lanzar
los cinco intentos, asi que el bloqueo ya esta ahi cuando cada intento hace su primera lectura:
no aparece a mitad de nada. El caso "aparece entre la lectura y la escritura" lo cubre el
**unitario** `verify-credentials.test.ts` — "si la cuenta se bloquea mientras tanto, el reintento
no escribe", con `compareAndSet` devolviendo `false` y una relectura que ya viene bloqueada.

Sigue aportando, pero **por otro motivo**: es el unico sitio donde R25 se afirma con los
adaptadores **reales** y bajo cinco peticiones simultaneas, y detectaria una regresion que moviera
el corte por bloqueo a despues de la escritura. No es ruido — pero la frase que lo justifica hay
que cambiarla, porque manda al siguiente lector a buscar en ese test una cobertura que no tiene.
Menor m9.

## R2.4 La medicion de tiempo — M4 cerrado, y bien cerrado

El metodo ahora aguanta. Lo que pedia M4 era dejar de vender un porcentaje como propiedad del
codigo, y eso es lo que hizo: **dos** corridas independientes en vez de una, n=60, medianas, y
—la parte que importa— el ruido **p10-p90 dentro de cada camino** publicado al lado de la
diferencia entre caminos. 1-2 ms de diferencia contra 13-18 ms de ruido interno es un argumento
que se sostiene solo; el 5,6 % que yo medi en una maquina peor encaja en el mismo cuadro en vez
de contradecirlo, que es la prueba de que ahora se afirma lo correcto.

Y el dato decisivo esta bien identificado: **el camino mas lento cambia de identidad entre
corridas** (A: inexistente; B: bloqueada; la mia: bloqueada). Un sesgo real no cambia de signo.
Es una afirmacion sobre el codigo, no sobre la maquina, y por eso vale.

Bien tambien haber declarado el limite nuevo que el propio arreglo introduce —el camino de fallo
puede dar mas de una vuelta de CAS, y eso solo pasa cuando el usuario existe— en vez de fingir
uniformidad perfecta. Es la conducta que faltaba en la ronda 1.

## R2.5 La limpieza del E2E — acotada, con un borde afilado

**El barrido no puede borrar datos ajenos.** Lo comprobe contra el codigo:

- `prisma.user.deleteMany` con `username startsWith 'qc7_e2e_'` **y** `createdAt < corte`
- `prisma.role.deleteMany` con `name startsWith 'qc7_e2e_rol_'` **y** `createdAt < corte`

Dos condiciones **conjuntas**, y el prefijo es propiedad exclusiva de este spec: no hay forma de
que alcance una fila que no haya creado el E2E de QC-7. El `afterAll` va mas acotado todavia
(`qc7_e2e_<RUN_ID>`), y borra por prefijo y no por ids en memoria, que es lo correcto justo para
el caso que lo motivo: un `beforeAll` que murio a medias no dejo ids que borrar. El filtro de una
hora esta bien razonado —chromium y webkit comparten prefijo y corren a la vez— y esta escrito.
El veto al borrado fisico de `docs/architecture.md > Anti-patrones` se cita y se acota a
produccion, correctamente.

El borde: los dos `deleteMany` usan **el mismo corte de tiempo pero sobre filas con `createdAt`
distinto**. El rol se crea unos segundos antes que su usuario, asi que hay una ventana de esos
pocos segundos en la que el corte cae **entre** los dos: el rol huerfano califica como viejo y su
usuario no. Entonces el borrado del rol choca con la FK `users.role_id` (`onDelete: Restrict`),
`deleteMany` lanza dentro del `beforeAll` y **el spec entero se pone rojo** — por la limpieza, no
por el login. Es estrecho y solo ocurre habiendo huerfanos, pero es el mismo genero de rojo
confuso que la limpieza venia a evitar. Menor m10.

## R2.6 Los menores de la ronda 1 — verificados uno a uno

| # | Estado | Comprobado en el codigo |
| --- | --- | --- |
| M1 | **cerrado** | Test nuevo en `verify-credentials.test.ts` con `createPasswordHash`/`verifyPasswordHash` **reales**, los tres caminos, y afirma que no aparecen ni la clave, ni el hash, ni sus primeros 29 caracteres. El codigo muerto del test de la cookie eliminado y el `it` renombrado a lo que de verdad cubre. Cubre lo que M1 pedia y algo mas |
| M2 | **cerrado por el leader** | `tasks.md` T13 en `[x]` con constancia de quien lo corrio y que salio |
| M3 | **cerrado** | `const calentamiento = decoyHash()` al construir, con un `void ...catch(() => {})` que evita el unhandled rejection **sin** tragarse el error para quien espere la promesa cacheada. El `hasher.hash.mockClear()` del test de R8 esta bien puesto: limpia el calentamiento y sigue detectando cualquier hash **durante** la invocacion |
| M4 | **cerrado** | Ver R2.4 |
| M5 | **cerrado, y mas fuerte** | Puerto propio 3117 en `baseURL`, `webServer.url` y `command`, y `reuseExistingServer: false` **tambien en local**: si el puerto esta ocupado falla ruidosamente en vez de mentir. Es mas de lo que pedi |
| M6 | **cerrado** | 4 tests verdes en chromium y webkit con disco libre. No lo reproduje: el disco de esta maquina sigue con 59 MB libres. Lo doy por bueno porque el leader corrio el gate completo en verde |
| M7 | **cerrado, y mas fuerte** | Un usuario **por test** via `createTestUser(label)`, no un reset compartido, con la razon escrita: con `fullyParallel` los dos tests caen en workers distintos y un reset se pisaria |
| M8 | **cerrado** | Los tres: nota del hueco de T10 en `tasks.md`, "pregunta abierta 2" en `design.md:162`, y el snippet de 4.2 ya solo importa `createHmac` con la nota de que `timingSafeEqual` es de QC-8 (`design.md:150`) |

**Ninguno quedo a medias y ninguno se descarto.** M2 no era suyo y no lo marco, que es lo
correcto.

## R2.7 Casillas de `tasks.md` — ninguna miente

Hubo una segunda reanudacion. El unico cambio de casilla en todo el diff es T13, y lo firma el
leader con el resultado del gate. El resto siguen siendo las que verifique en la ronda 1. Reviso
ademas lo que **no** aparece: el arreglo de M-A1 no se colo como task nueva marcada `[x]` —esta
donde tiene que estar, en `design.md > 5.7` y en la seccion 9 de la bitacora—, y no hay ninguna
casilla marcada que apunte a trabajo que no exista.

## R2.8 Lo que el arreglo no rompio, comprobado

- **R31** — la rama sin usuario sigue sin tocar el puerto de escritura, y el bucle sale sin
  escribir si la relectura da `null` o un `id` distinto. Dos tests.
- **R29/R6** — el bucle de reintento **no llama al hasher**: sigue habiendo exactamente una
  verificacion por intento, y se afirma dentro del propio test del reintento
  (`expect(hasher.verify).toHaveBeenCalledTimes(1)`), que es donde tenia que estar.
- **Hexagonal** — el puerto sigue sin decidir: `compareAndSet` recibe los dos estados ya
  calculados. La escalada sigue viviendo solo en `account-lock.ts`. `updateMany` con `id` en el
  `where` afecta a 0 o 1 filas, y esta explicado por que no es `update`.
- **Alternativas descartadas** — la politica en SQL y el `SELECT ... FOR UPDATE` estan descartadas
  con el motivo correcto en `design.md > 5.7`: la primera duplicaria la tabla de escalada dentro
  del adaptador, la segunda obligaria al dominio a correr dentro de una transaccion. De acuerdo
  con las dos.

## R2.9 Hallazgos de la ronda 2

### MAYOR

**M-B1 — El predicado del CAS ignora `locked_until` y puede borrar un bloqueo ACTIVO (ABA).**
`user-credentials-prisma.ts:59-70` y `design.md > 5.7`. Demostrado ejecutandolo: el CAS aplico
sobre una fila con `lockedUntil` en el futuro y la dejo en `null`. La justificacion escrita —"el
par de enteros ya identifica cada estado de la cadena"— es **falsa**: `(0,1)` existe como bloqueo
fresco y como bloqueo caducado, y se vuelve a el tras un exito. Remedio de tres lineas y sin
igualdad de timestamps, en R2.2. Alternativa minima si el humano asume el riesgo: borrar la frase
falsa y escribir en su lugar el escenario real y su probabilidad.

### MENORES

**m9 — La razon para conservar el tercer test de concurrencia no describe lo que el test hace.**
`impl > 9.2`. Dice que cubre "el bloqueo que aparece a mitad del reintento"; en ese test la fila
esta bloqueada **antes** de empezar. Ese caso lo cubre el unitario. El test aporta, pero por otro
motivo (R25 con adaptadores reales y cinco peticiones a la vez): hay que reescribir la frase.

**m10 — El barrido de huerfanos del E2E puede chocar con la FK y poner rojo el spec.**
`e2e/login.spec.ts`, `beforeAll`. Rol y usuario se crean con segundos de diferencia; si el corte
de una hora cae entre ambos, el rol califica como huerfano y su usuario no, y el `deleteMany` de
roles choca con `onDelete: Restrict`. Se cierra borrando primero los usuarios **de los roles que
se van a borrar**, o envolviendo ese `deleteMany` en un `try/catch` — ahi si es inofensivo,
porque es limpieza defensiva.

**m11 — El calentamiento del senuelo mete un bcrypt en la carga del modulo de composicion.**
`verify-credentials.ts:69` mas `lib/composition/index.ts`, que construye el caso de uso al
importarse. Todo proceso de servidor paga ahora un hash de coste 10 al arrancar, tambien si nadie
va a hacer login. Es lo correcto para la uniformidad de tiempo y no lo discuto; solo que es un
efecto de arranque que no esta escrito en ningun sitio, y este equipo documenta cosas mas
pequenas.

## R2.10 Veredicto de la ronda 2

**RECHAZADO** — 1 mayor (M-B1), 3 menores (m9, m10, m11).

M-A1 esta bien cerrado: el CAS aguanta 40 intentos simultaneos, el bucle esta acotado con un
argumento correcto, el limite que queda esta declarado en dos sitios, los tests nuevos se
comprobaron rojos contra el codigo viejo y los ocho menores de la ronda 1 estan aplicados —dos de
ellos mas fuerte de lo que pedi—. La calidad de la respuesta a la revision es alta y la
autocritica de 9.1 es la correcta.

Lo que impide el OK es que el arreglo dejo una segunda escritura que pisa un estado que no leyo, y
la apago con una premisa falsa en vez de con una condicion. Tres lineas en el `where` y una frase
reescrita.
