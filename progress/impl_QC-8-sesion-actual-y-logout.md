# QC-8 — sesion-actual-y-logout · bitacora de implementacion

> Estado: **EN CURSO**. Bloques 1, 2 y 3 (T1-T10) cerrados y comiteados. Falta **T11**
> (gate rapido, lo corre el leader) y el **bloque 5** (T15 trazabilidad, T16 gate completo y PR).
> Alcance **R1-R23**. **R24 esta FUERA** (diferido a QC-9 por el humano el 2026-09-02):
> el bloque 4 de `tasks.md` no se ejecuta, no hay `e2e/session.spec.ts`, no se toca
> `playwright.config.ts` y no se crean fixtures `qc8_e2e_`.

## Bloque 1 — Dominio y puertos (T1-T4) · commit `35df1ea`

### Archivos creados
- `lib/modules/identity/domain/session-claims.ts`
- `lib/modules/identity/domain/display-name.ts`
- `lib/modules/identity/domain/resolve-session-user.ts`
- `lib/modules/identity/ports/session-reader.ts`
- `lib/modules/identity/ports/session-user-reader.ts`
- `tests/unit/identity/session-claims.test.ts`
- `tests/unit/identity/display-name.test.ts`
- `tests/unit/identity/resolve-session-user.test.ts`

Ninguna dependencia nueva. Sin migracion (R15). `SessionUser` **no se toco** (R14).

### Salida real de los tests

```
$ pnpm exec vitest run --project node tests/unit/identity/session-claims.test.ts \
    tests/unit/identity/display-name.test.ts tests/unit/identity/resolve-session-user.test.ts

 RUN  v4.1.10 C:/Users/Cristian/Documents/trabajo/arc/labs/.worktrees/QC-8-sesion-actual-y-logout

 Test Files  3 passed (3)
      Tests  21 passed (21)
   Duration  498ms
```

`pnpm run lint`: limpio.

`pnpm run typecheck`: **ROJO, y el rojo NO es de QC-8** — ver «Rojo heredado» abajo.

## Bloque 2 — Adaptadores (T5, T6)

### T5 — lectura y borrado de la cookie · commit `ee326ad`
- `lib/modules/identity/adapters/driven/session/session-cookie.ts` (**modificado**, ampliado en
  el sitio: un solo dueño del formato del valor)
- `tests/unit/identity/session-cookie.test.ts` (**ampliado**, no reescrito)

`SESSION_VALUE_VERSION` pasa de constante privada a exportada, para que lector y escritor no
puedan desincronizarse. **No hay segunda implementacion de la firma** (R5), comprobado:

```
$ grep -rn "createHmac" lib/
lib/modules/identity/adapters/driven/session/session-cookie.ts:1:import { createHmac, timingSafeEqual } from 'node:crypto';
lib/modules/identity/adapters/driven/session/session-cookie.ts:40:  return createHmac('sha256', secret).update(signedPart).digest('base64url');
```

```
$ pnpm exec vitest run --project node tests/unit/identity/session-cookie.test.ts
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

**El caso feliz cruza escritor y lector de verdad**: obtiene el valor llamando a `startSession`
y capturando lo que escribe, y compara `expiresAt` contra el `Date` real del ticket. Es el test
que habria cazado el defecto de unidades del bloque 1, y por eso el spec lo exigia asi.

### T6 — adaptador Prisma del usuario · commit `08f92c0`
- `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts` (**nuevo**)
- `tests/integration/identity/session-user.int.test.ts` (**nuevo**)

Sin migracion ni columna nueva (R15). Cada caso que muta la fila restaura el estado en
`try`/`finally`, asi que el archivo pasa igual corrido dos veces seguidas.

```
$ pnpm exec vitest run --project integration tests/integration/identity/session-user.int.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)

$ pnpm exec vitest run --project integration tests/integration/identity/identity-constraints.int.test.ts
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

La segunda corrida es la prueba de que el fixture **no deja huerfanos**: ese archivo afirma
`user.count() === 0` sobre el estado global de la tabla.

### Verificacion propia de la tanda (corrida por el implementer)
`pnpm run typecheck`: **verde, sin errores**. `pnpm run lint`: **verde**.
(El rojo heredado de `mustChangeCredential` desaparecio al regenerar el cliente Prisma; ver la
correccion en «Rojo heredado».)

## Bloque 3 — Cableado y superficie (T7-T10)

### T7 + T8 — agrupadas · commit `384a758`
Agrupacion **aprobada por el leader**. Motivo: borrar `session-stub.ts` suelto deja el
`typecheck` **rojo** hasta que la composicion deja de importarlo, y un commit intermedio
deliberadamente rojo rompe la bisectabilidad. Es el mismo criterio que `tasks.md` ya aplica a
los cuatro cambios de T8 («por separado dejan el typecheck rojo»), un paso antes. **No cambia
el alcance ni el contenido de ninguna task.**

- `lib/modules/identity/adapters/driven/session/session-stub.ts` (**BORRADO**)
- `lib/modules/identity/ports/session-provider.ts` — `getSessionUser(): Promise<SessionUser | null>` (R1)
- `lib/modules/identity/index.ts` — reexporta solo desde `./domain`
- `lib/composition/index.ts` — `design.md > 4.4`; `verifyCredentials` **intacto**
- `lib/shared/routes.ts` — `LOGIN_ROUTE = '/login'`

El cambio de contrato rompio `app/(private)/layout.tsx`, que lo arregla T10. **Pero la
afirmacion de que rompia «exactamente un sitio» era FALSA, y la premisa de `design.md > 4.5`
(«no hay llamadores silenciosos») estaba incompleta** — ver la seccion siguiente.

### T9 — el cierre de sesion vuelve al login · commit `1cd4094`
`redirect(LOGIN_ROUTE)` despues de `endSession()` y **fuera de cualquier `try`**: Next señaliza
la navegacion **lanzando**, y un `try` se la tragaria. Firma congelada intacta (R19).

### T10 — la zona privada redirige sin sesion · commit `af8fb20`
`if (user === null) redirect(LOGIN_ROUTE)` (R16). Nada mas cambia en el layout.

**Detalle que decide si el test vale o no:** el doble de `redirect` **lanza un centinela**, como
el real. Con un `vi.fn()` que no lanza, el layout seguiria ejecutandose con `user === null` y
petaria al pintar la barra: el test estaria midiendo otra cosa.

### Revocaciones de prohibiciones de QC-11: linea a linea

Las dos tasks revocan tests que QC-11 escribio en negativo. Se revoco **exactamente** lo que
`tasks.md` acota y **nada mas**. Cada revocacion, con lo que prohibia y que la invalida:

| # | Archivo | Linea revocada | Que prohibia | Que la invalida |
|---|---|---|---|---|
| 1 | `logout-action.test.ts` | `'lib/modules/identity/adapters/driven/session/session-stub.ts'` en `MODULOS_INSPECCIONADOS` | Inspeccionaba el fuente del stub para exigir que no tocara cookies ni navegacion | **El archivo ya no existe** (T7). `readFileSync` reventaria |
| 2 | `logout-action.test.ts` | `/next\/navigation/i` en `prohibidos` | Que la action importara el modulo de navegacion de Next | Decision del humano **2026-09-02**: al cerrar sesion se vuelve al login (R18) |
| 3 | `logout-action.test.ts` | `/redirect/i` en `prohibidos` | Que la action navegara | Idem — el `redirect(LOGIN_ROUTE)` es ahora el comportamiento exigido |
| 4 | `logout-action.test.ts` | `/next\/headers/i` en `prohibidos` | Que la action tocara el almacen de cookies del servidor | R18 exige retirar la cookie **desde el servidor**; la ruta pasa por el adaptador |
| 5 | `logout-action.test.ts` | `/cookies/i` en `prohibidos` | Idem | Idem |
| 6 | `private-layout.test.tsx` | `'redirect'` en la lista de la guardia de R35 | Que el layout protegiera rutas | Decision del humano **2026-09-02**: sin sesion valida la zona privada redirige **ya en QC-8** (R16), para no dejar la ventana entre QC-8 y QC-9 en la que entrar sin sesion romperia la pagina |

**Lo que se CONSERVA, y es lo que hace que la revocacion no sea un cheque en blanco:**
- En `logout-action.test.ts` siguen prohibidos `document.cookie`, `prisma`, `PrismaClient`,
  `supabase` y `fetch`. Se retiro `/cookies/i` pero **se conserva `document.cookie`**: la
  cookie la retira el **servidor**, y que el navegador la toque sigue prohibido.
- En `private-layout.test.tsx` siguen intactas `prisma`, `PrismaClient`, `supabase`, `fetch(`,
  `document.cookie`, `Set-Cookie`, `cookiestore.set`, `cookiestore.delete`, la exigencia de que
  aparezca `SIDEBAR_STATE_COOKIE`, el bucle que comprueba que **toda** operacion
  `cookieStore.<metodo>(...)` es un `get` de esa constante, y el assert de runtime de que la
  unica cookie consultada al renderizar es esa.
- Tambien intacto el test `el sidebar no importa el proveedor de sesion`: `tasks.md` no pedia
  tocarlo y su lista conserva la cadena `'session-stub'`.

**Una consecuencia no prevista en `tasks.md`, dicha por honestidad:** en `logout-action.test.ts`
el test original *«invoca el cierre de sesion... y no devuelve valor»* **se partio en dos**. No
es una revocacion extra: al comportarse el doble de `redirect` como el real (lanzando), la
llamada a `logoutAction()` **rechaza**, asi que la comprobacion de la firma congelada (R19) se
separo a un test que no invoca la action. R19 sigue cubierto y sigue verde.

### Verificacion propia de la tanda (corrida por el implementer)

```
$ pnpm run typecheck        -> verde, sin errores
$ pnpm run lint             -> verde

$ pnpm exec vitest run --project node tests/unit/identity/logout-action.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)

$ pnpm exec vitest run --project ui tests/unit/private-layout.test.tsx
 Test Files  1 passed (1)
      Tests  7 passed (7)

$ pnpm exec vitest run guard
 Test Files  5 passed (5)
      Tests  65 passed (65)

$ grep -rn "session-stub" lib/ app/ components/
(ninguna)
```

## T7 va unido a T8, y no es una desviacion del spec

`tasks.md > T7` pide borrar `session-stub.ts` y cerrar con **`pnpm run typecheck` en verde**.
Las dos cosas no caben en el mismo commit por si solas: hoy el stub lo importa
`lib/composition/index.ts` (que es **T8**) y lo inspeccionan `logout-action.test.ts` (**T9**) y
`private-layout.test.tsx` (**T10**). Borrarlo suelto deja el typecheck **rojo** hasta T8.

Se agrupa por tanto **T7 con T8** en un unico commit. Es exactamente el mismo motivo que
`tasks.md` ya da para juntar los cuatro cambios de T8 («por separado dejan el typecheck rojo»),
aplicado un paso antes. No cambia el alcance ni el contenido de ninguna task.

## Alcance no previsto por `tasks.md`: dos archivos mas de QC-11

Ademas de las seis revocaciones acotadas de T9/T10, QC-8 tuvo que tocar **otros dos** archivos
de QC-11. **No es una revocacion** —no se levanta ninguna prohibicion— pero si es alcance que
`tasks.md` no habia previsto, y el `reviewer` debe verlo:

- `tests/unit/sidebar-desktop.test.tsx` (7 -> 8 tests)
- `tests/unit/sidebar-mobile.test.tsx` (6 -> 7 tests)

Los dos renderizan `app/(private)/layout.tsx` **sin mockear `@/lib/composition`**. Con el stub
daba igual: `getSessionUser()` devolvia siempre un usuario de relleno. Con el contrato nuevo
corre el cableado real, no hay cookie de sesion, `getSessionUser()` resuelve `null` y el layout
**redirige**: los 13 tests morian con `Error: NEXT_REDIRECT` antes de pintar la barra.

El arreglo es **andamiaje**: se les da la sesion que antes les regalaba el stub, con el patron de
`private-layout.test.tsx`. **Ninguna de las 13 aserciones preexistentes cambio lo que mide** —
se verifico contando los `it(...)` contra `HEAD` (7+6=13) y comprobando que solo se añaden dos.
Y se añadio la cobertura que faltaba: **un test por archivo** de que, sin sesion, el layout
redirige a `LOGIN_ROUTE` y no pinta la barra (R16).

## Leccion de proceso: `vitest related` no ve a todos los llamadores

**Se reporto que el cambio de contrato rompia «exactamente un sitio», y era falso.** El
`typecheck` veia **uno** (`app/(private)/layout.tsx`); los tests veian **tres**. Un test que
renderiza el layout **es un llamador**, aunque el compilador no lo cante: no pasa el
`SessionUser` como argumento tipado, lo obtiene por un mock que TypeScript nunca comprueba.

Por eso la premisa de `design.md > 4.5` —«no hay llamadores silenciosos», apoyada en que
TypeScript strict lo señala en el sitio exacto— **estaba incompleta**: vale para el codigo de
produccion y no vale para los dobles de los tests. **QC-9 va a volver a pasar por este mismo
camino** (el `middleware.ts` toca la misma resolucion de sesion), asi que queda escrito.

**Regla practica que sale de aqui:** cuando se cambia un **contrato compartido** —la firma de un
puerto, un tipo exportado, algo que consume un layout—, `vitest related` **no basta**: selecciona
por grafo de imports y estos dos archivos no importan el puerto, importan el layout. Hay que
decirlo explicitamente y dejar correr el gate **antes** de dar el bloque por cerrado, no despues.

### Verificacion tras el arreglo

```
$ pnpm exec vitest run --project ui tests/unit/sidebar-desktop.test.tsx tests/unit/sidebar-mobile.test.tsx
 Test Files  2 passed (2)
      Tests  15 passed (15)

$ pnpm exec vitest run --project ui --project node
 Test Files  34 passed (34)
      Tests  348 passed (348)

$ pnpm run typecheck   -> verde
$ pnpm run lint        -> verde
```

Los proyectos `ui` y `node` se corrieron **enteros a proposito**, saltandose la regla de
«solo los relacionados»: el motivo de la regla es no juzgar rojos ajenos ni morir en corridas
largas, y aqui habia un motivo mayor —un contrato compartido cuyos llamadores `related` ya
habia demostrado no ver—. Los de integracion **no** se corrieron: los corre el gate.

## Defecto mayor encontrado y corregido en el bloque 1: `iat`/`exp` en segundos, no en milisegundos

La primera version de `parseSessionClaims` hacia `new Date(resultado.data.iat)`. El emisor del
formato es QC-7 (`session-cookie.ts`), que firma con **epoch en SEGUNDOS**:

```ts
function toEpochSeconds(date: Date): number { return Math.floor(date.getTime() / 1000); }
```

`new Date(n)` interpreta **milisegundos**, asi que una cookie real de QC-7 producia un
`expiresAt` de enero de 1970 y `isSessionExpired` devolvia `true` **siempre**: ninguna sesion
real se habria podido resolver jamas (R7, y de rebote R1 y R10).

El test original no lo detectaba porque construia `iat`/`exp` con `Date.parse(...)`
(milisegundos): era autoconsistente con el error y **verde por casualidad**. Es exactamente el
tipo de test que no puede fallar contra el que avisa `docs/verification.md`.

Corregido a `new Date(n * 1000)` y **anclada la unidad en el test** con un caso explicito que
compara contra el `Date` ISO esperado, mas un comentario que fija que el dueño de la unidad es
el emisor de QC-7. El cruce escritor/lector lo cerrara de verdad **T5**, cuyo test obtiene el
valor valido **llamando a `startSession`** en vez de copiando un literal (`design.md > 7`, nivel 2).

## Mapa `R<n> -> test` (parcial: solo lo cubierto por el bloque 1)

| R | Test |
|---|---|
| R1 | `resolve-session-user.test.ts > sin claims resuelve null sin lanzar` |
| R6 | `session-claims.test.ts > un JSON valido con sub/iat/exp produce claims con Date`; `> un texto que no es JSON devuelve null sin lanzar`; `> un JSON valido pero sin los campos esperados devuelve null`; `> un sub que no tiene formato UUID devuelve null`; `> iat o exp no enteros o no positivos devuelven null` |
| R7 | `session-claims.test.ts > en el instante exacto de expiresAt la sesion esta caducada`; `> un segundo despues de expiresAt sigue caducada`; `> un segundo antes de expiresAt la sesion sigue valida`; `> un exp en segundos epoch produce el Date correcto` |
| R10 | `resolve-session-user.test.ts > con claims vigentes consulta al lector de usuario por el sub` |
| R11 | `resolve-session-user.test.ts > sin registro de usuario activo resuelve null aunque la sesion sea valida` |
| R12 | `resolve-session-user.test.ts > con usuario activo compone el SessionUser con displayName y roleName actuales` |
| R13 | `display-name.test.ts` (caso literal «Ana Maria» + «Perez Gomez» -> «Ana Perez», e iniciales `AP` componiendo con `getInitials` desde el test) |
| R14 | `resolve-session-user.test.ts > con usuario activo compone el SessionUser...` (afirma que las claves son exactamente `id`, `username`, `displayName`, `roleName`) |
| R23 | `resolve-session-user.test.ts > con claims null no se consulta al lector de usuario`; `> con sesion caducada no se consulta al lector de usuario`; `> con now igual a expiresAt no consulta al lector de usuario` |

Pendientes de cubrir en bloques 2-3: R2, R3, R4, R5, R8, R9, R15, R16, R17, R18, R19, R20,
R21, R22. **R21** se escribira como test de **caracterizacion del riesgo asumido** por el humano
(una copia del valor de la cookie sigue valiendo tras cerrar sesion): no se «arregla», y
**QC-23 lo pondra rojo a proposito** el dia que aterrice. Ese rojo sera la señal de que la
promesa cambio, no un fallo.

## Rojo heredado, NO causado por QC-8 — **RESUELTO**

Durante el bloque 1, `pnpm run typecheck` fallaba con 4 errores, **ninguno en archivos de
QC-8**:

```
lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts(69,13):
  error TS2353: ... 'mustChangeCredential' does not exist in type 'UserCreateInput...'
tests/integration/identity/identity-seed.int.test.ts(221,20) / (271,55) / (293,34): idem
```

Causa real: **el cliente de Prisma no estaba generado en este worktree**.
`mustChangeCredential` si esta en `db/schema.prisma` (columna de QC-6), asi que no era un
problema de fuente sino de artefacto generado ausente. Se reporto sin tocarlo, y el leader lo
resolvio con `pnpm exec prisma generate`. Desde entonces `typecheck` esta **verde**.

**Correccion de un diagnostico equivocado, para que nadie lo repita:** se dijo que faltaba
`node_modules/.prisma`. Eso era una **pista falsa** — con pnpm el cliente generado vive en
`node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client`, y un `.prisma` de primer
nivel **no existe ni cuando todo esta bien**. La ausencia de ese directorio no prueba nada. Lo
que faltaba era el `generate`, y lo que lo estorbaba era el `prisma.config.ts` ajeno.

## Incidente de git en el worktree: un `git stash pop` sobre un stash AJENO

El 2026-09-02 a las 09:46 aparecio en este worktree un arbol conflictivo (`UU` en
`db/schema.prisma`, `package.json` y `progress/current.md`) que se deshizo solo entre dos
comandos consecutivos. **Causa identificada, y no fue una sesion externa:** el subagente
`backend_dev` del bloque 1 hizo `git stash` para comprobar si el rojo de typecheck era
preexistente y luego `git stash pop`, y lo que aplico fue un **stash ajeno y preexistente**:

```
stash@{0}: On dev: WIP siembra QC-20/QC-22 + prisma.config (pre-merge QC-14)
```

El subagente lo reporto en vez de taparlo, y revirtio los archivos trackeados con
`git checkout HEAD -- <archivos>`. **No se perdio nada**: el pop dio conflicto, asi que git
**no descarto la entrada** y el stash sigue en la lista con sus 4 archivos
(`db/schema.prisma`, `feature_list.json`, `package.json`, `progress/current.md`).
Verificado con `git stash list` y `git stash show --stat stash@{0}`.

**Leccion para el arnes:** `git stash`/`git stash pop` es una operacion **global del repo**, no
del worktree, y en un repo con varias features en paralelo puede aplicar el trabajo a medias de
otro. Ningun subagente deberia usarla; para saber si un rojo es preexistente basta con mirar si
los errores citan archivos propios.

Quedaron dos artefactos **ajenos y sin comitear**, residuo de la parte sin trackear de ese
stash, que se han dejado intactos a proposito (que hacer con ellos y con el stash lo decide el
leader con su dueño original):

- `prisma.config.ts`
- `specs/QC-20-crud-de-productos/`

Los commits de QC-8 se hacen con `git add` de **rutas explicitas**, nunca `git add -A`, para que
esos dos no entren en la rama. **Retirados por el leader**, que comprobo byte a byte que eran
copias identicas de lo que sigue vivo y sin comitear en el arbol principal, su sitio. El
`stash@{0}` sigue intacto: no se perdio nada de la otra sesion. El `origin/dev` remoto ha avanzado a `f1484ef` y trae cambios en
`package.json`, `db/schema.prisma`, `prisma.config.ts` y el spec de QC-20; **si se mergea o no
es decision del leader**, no de esta bitacora.

Nota sobre el spec: `origin/dev` tiene una version **anterior** del spec de QC-8 (sin el
diferimiento de R24). La version buena es la de esta rama, commit `9f57f01`.
