# design.md — Feature 2: hash-y-verificacion-de-contrasena

## 1. Estado de partida (verificado en el repo, no supuesto)

- `db/schema.prisma` existe y `User.passwordHash` es `String @map("password_hash")`, **sin
  longitud declarada, sin columna de sal y sin columna de algoritmo**. Es el hueco que dejo
  la feature 1 a proposito (`specs/1-modelo-usuarios-y-roles/design.md > 6`).
- `package.json` **no declara ninguna dependencia de hashing**: no hay `bcrypt`, `bcryptjs`,
  `argon2`, `@node-rs/argon2` ni `@phc/format`. Lo unico disponible hoy sin instalar nada es
  la libreria estandar de Node (`node:crypto`).
- Vitest ya esta montado (`vitest.config.mts`, `environment: 'node'`, include
  `tests/**/*.test.ts`), con `test`, `test:guardias` (`vitest run guard`) y `test:rapido`.
- Existen dos guardias de la feature 1 en `tests/guards/`, y `guard-password-never-plaintext`
  **ya vigila** que ningun identificador nombre la contrasena sin sufijo `_hash`. Los nombres
  que elija esta feature tienen que pasar por ahi (`passwordHash`, `password_hash` pasan;
  `password`, `plainPassword` no).
- No hay `middleware.ts` ni ningun archivo con `runtime = 'edge'` en el repo todavia.
- `docs/architecture.md`: deploy en Vercel, Prisma unico camino de datos, sin sobre-ingenieria.
- **Esta feature no necesita base de datos ni `.env`.** Todos sus tests son unitarios. No hay
  bloqueo de infraestructura.

## 2. Que se construye y donde

Un unico modulo, sin estado, sin I/O y sin dependencias nuevas:

```
lib/utils/password-hash.ts
```

`docs/architecture.md > Estructura de carpetas` reserva `lib/utils/` para "helpers puros (sin
side effects)". Es lo que esto es: no lee base, no lee entorno, no habla HTTP. Nombre de
archivo en `kebab-case` (`docs/conventions.md`).

**No se crea** `lib/services/PasswordService.ts` ni `lib/interfaces/services/IPasswordHasher.ts`.
Un service con inyeccion de dependencias existe para poder sustituir la implementacion en los
tests de quien lo consume; aqui no hay nada que sustituir (no hay repositorio ni cliente
externo detras) y `docs/architecture.md` rechaza explicitamente la sobre-ingenieria. Si la
feature 4 necesita abaratar sus propios tests, no le hace falta un mock: le basta con pasar
parametros de coste bajos (§4). Queda anotado como contrato hacia la feature 4, no como algo
que esta feature construya.

## 3. Decision clave: algoritmo y parametros de coste

**Decision: `scrypt` de `node:crypto`, con `n = 2^16 (65.536)`, `r = 8`, `p = 2`, sal de 16
bytes y clave derivada de 32 bytes. Llamada asincrona (`crypto.scrypt`), nunca `scryptSync`.**

### 3.1 Por que scrypt, y por que aqui

Los criterios son verificables, no de autoridad:

| Criterio | Como se comprueba | scrypt en `node:crypto` |
| --- | --- | --- |
| Corre en el runtime de destino sin binario nativo ni WASM | El modulo es parte de la libreria estandar de Node; el bundle de la funcion serverless no incluye ningun `.node` | Si |
| Es memory-hard (no se paraleliza barato en GPU/ASIC) | El parametro `n·r` fija memoria obligatoria: 128·n·r = 64 MiB por intento | Si |
| No trunca la contrasena | Test R4: dos contrasenas que comparten 72 bytes no verifican cruzado | Si |
| Coste medible y ajustable sin cambiar de algoritmo | Test R14: cota inferior de tiempo y de memoria | Si |
| No bloquea el event loop | `crypto.scrypt` (callback) corre en el threadpool de libuv | Si, con la variante asincrona |
| Cero dependencias nuevas que auditar/actualizar | `package.json` no cambia | Si |

**Comprobacion de runtime, que es lo que pide el encargo.** El proyecto despliega en Vercel
(`docs/architecture.md > Stack`). Ahi conviven dos runtimes y no son intercambiables:

- **Runtime Node** (Server Actions, route handlers por defecto, seed ejecutado con `tsx`): es
  donde van a vivir el seed de la feature 3 y el login de la feature 4. `node:crypto` y
  `crypto.scrypt` estan disponibles tal cual.
- **Runtime Edge** (`middleware.ts`, rutas con `export const runtime = 'edge'`): expone
  WebCrypto, que **no tiene scrypt ni argon2** — solo PBKDF2 y primitivas basicas. Ningun
  algoritmo memory-hard es viable ahi sin WASM.

Consecuencia de diseno, no observacion suelta: **este modulo es Node-only y hay que impedir que
alguien lo importe desde Edge** (R18). La proteccion de rutas de la feature 6 va a vivir en
`middleware.ts`, que es Edge; si alguien intentara verificar una contrasena ahi, el fallo
aparece en deploy y no en local. Por eso hay una guardia estatica (§9) en vez de confiar en que
se recuerde.

Lo que **no** se ha comprobado y no se afirma: no se ha ejecutado nada en Vercel desde este
repo. La verificacion que si esta al alcance —que corre en el runtime Node con la version de
Node del proyecto, y cuanto tarda— es la tarea T6 de `tasks.md`, y es requisito para cerrar.

### 3.2 Los parametros, y por que estos

`n = 65.536`, `r = 8`, `p = 2` es uno de los conjuntos que OWASP da como equivalentes en coste
de ataque (junto con `n = 2^17, r = 8, p = 1`; `n = 2^15, r = 8, p = 3`; `n = 2^14, r = 8,
p = 5`). Se elige este por el perfil de Vercel: la memoria de trabajo es `128 · n · r`, o sea
**64 MiB** por intento, la mitad que la del conjunto `2^17/8/1` (128 MiB), a igual coste de
ataque. En una funcion serverless la memoria es el recurso que se agota primero y que se paga,
y 128 MiB por login concurrente es un techo de concurrencia demasiado bajo.

- `keyLen = 32` bytes: mismo tamano que la salida de SHA-256, sin motivo para pedir mas.
- `saltLen = 16` bytes de `crypto.randomBytes`: 128 bits, cota estandar y la que fija R3.
- **`maxmem` hay que pasarlo explicitamente.** El limite por defecto de `crypto.scrypt` en Node
  son 32 MiB y con estos parametros harian falta 64 MiB: sin `maxmem`, la llamada falla con
  `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`. Es la trampa concreta de esta decision y por eso se
  escribe aqui y no se descubre en runtime. Se pasa `maxmem = MAX_SCRYPT_MEMORY_BYTES`
  (192 MiB), que es tambien el techo que hace cumplir R11.

### 3.3 Si el coste medido no sirve

Regla, para que nadie improvise: si T6 mide **mas de 1 s** por transformacion en el entorno de
ejecucion, se baja al conjunto equivalente inmediato (`2^15/8/3`) y se documenta la medicion;
si mide **menos de 50 ms**, se sube a `2^17/8/1`. Lo que no se hace es cambiar de algoritmo por
una medicion.

### 3.4 Alternativas descartadas

**A. bcrypt (`bcrypt` nativo o `bcryptjs` puro) — DESCARTADA.** Es lo que la mayoria escribiria
por defecto, y tiene tres problemas concretos, todos comprobables:
1. **Trunca la contrasena a 72 bytes.** Silenciosamente: `"<71 chars>A"` y `"<71 chars>B"`
   verifican como la misma. En un ERP donde alguien use un gestor de contrasenas con frases
   largas, eso es una perdida de entropia invisible. R4 existe justamente para dejar cerrada
   esa puerta, y bcrypt no la pasa.
2. **No es memory-hard.** Su coste es solo CPU con 4 KiB de memoria fija, que es lo que lo hace
   barato de atacar con hardware dedicado. scrypt obliga a 64 MiB por intento.
3. **Coste de despliegue.** `bcrypt` es un addon nativo (`node-gyp`) que hay que empaquetar en
   la funcion serverless; `bcryptjs` evita eso pero es JavaScript puro y **sincrono en la
   practica**, bloqueando el event loop durante todo el hash, que es exactamente lo que R16
   prohibe.

**B. argon2id (`argon2` con node-gyp o `@node-rs/argon2`) — DESCARTADA, y es la que mas cuesta
descartar.** Es el algoritmo recomendado de primera linea y seria la eleccion si no hubiera
runtime que respetar. Se descarta porque: (1) Node **no lo trae**, asi que entra una dependencia
con **binario nativo por plataforma** en un proyecto que se compila en local (Windows) y se
despliega en Vercel (Linux x64) — dos plataformas, un `pnpm-lock` y el clasico "en mi maquina
si"; (2) empaquetar un `.node` en una funcion serverless de Next obliga a declararlo como
paquete externo del servidor, y si eso se olvida el fallo aparece **solo en deploy**, no en
local ni en `./init.sh`; (3) la variante WASM elimina el binario pero pierde buena parte del
rendimiento, con lo que para el mismo coste de ataque hay que bajar parametros. El delta de
seguridad real entre argon2id bien parametrizado y scrypt con 64 MiB no compensa meter la
primera dependencia nativa del proyecto en la ruta critica del login. **Si algun dia entra**,
el formato de §4 lo admite sin migracion: se anade el prefijo `$argon2id$` y los hashes viejos
siguen verificando (R12, R13).

**C. PBKDF2 (`crypto.pbkdf2`, disponible tambien en WebCrypto y por tanto en Edge) —
DESCARTADA.** Es la unica opcion que correria tambien en Edge, y ese es su unico argumento.
No es memory-hard en absoluto: su coste es iteraciones de HMAC, justo el patron que mejor se
acelera en GPU. Se descarta porque el requisito no es "que corra en todos lados" sino "que sea
caro de atacar", y porque nada de esta feature necesita ejecutarse en Edge: el middleware valida
una cookie, no una contrasena.

**D. Delegar en Supabase Auth (`auth.users`) — DESCARTADA.** Elimina la feature entera. No se
puede: la feature 1 ya definio `users.password_hash` como la fuente de verdad de las
credenciales, con nombre de usuario propio (no correo) como identificador de login, y
`docs/architecture.md` prohibe usar el cliente de Supabase para datos de negocio. Adoptarlo
significaria rehacer las features 1 y 4 y sostener dos tablas de usuarios.

## 4. Decision clave: formato del valor almacenado

**Decision: una unica cadena ASCII autodescriptiva, al estilo PHC/modular-crypt:**

```
$scrypt$n=65536,r=8,p=2$<sal en base64url sin padding>$<clave derivada en base64url sin padding>
```

Ejemplo de longitud: `$scrypt$` (8) + `n=65536,r=8,p=2$` (16) + sal de 16 bytes en base64url
(22) + `$` + clave de 32 bytes en base64url (43) = **90 caracteres**. Cota holgada bajo los 256
de R15.

Por que asi:

- **La sal viaja dentro del valor** (R2, R3). Ni columna aparte ni derivacion del username: si
  la sal saliera del nombre de usuario, dejaria de ser unica por transformacion y renombrar a un
  usuario invalidaria su contrasena.
- **Los parametros viajan dentro del valor** (R12). La verificacion los lee del propio hash, no
  de una constante del codigo ni de una variable de entorno (R9). Eso es lo que hace que subir
  el coste manana no invalide lo guardado hoy (R13).
- **Es ASCII imprimible y de longitud acotada**, asi que entra en `password_hash text` tal como
  esta (§7).
- Se **descarto guardar JSON** (`{"alg":"scrypt","n":65536,...}`) en la columna: es mas largo,
  invita a que alguien lo parsee con `JSON.parse` sin validar rangos, y no aporta nada que la
  cadena de un renglon no dé.
- Se **descarto usar el formato binario crudo concatenado** (`salt || key` en base64): ahorra 24
  caracteres y pierde el algoritmo y los parametros, que es justo lo que cierra R12 y la
  pregunta de rotacion (§8).

## 5. Decision clave: dos usuarios con la misma contrasena, y como se comprueba sin tautologia

La garantia es la **sal aleatoria por transformacion**: 16 bytes de `crypto.randomBytes` que
entran en la funcion de derivacion, de modo que la clave derivada de `"secreto"` con sal A y la
de `"secreto"` con sal B no tienen relacion computable.

**El riesgo del test es que sea vacuo, y hay que nombrarlo.** Afirmar
`expect(hashA).not.toBe(hashB)` es casi una tautologia: los dos valores contienen la sal, asi
que difieren por construccion **aunque la clave derivada fuese identica**. Un test asi pasaria
incluso con un scrypt roto que ignorase la sal. El test util afirma tres cosas separadas sobre
una tanda de N transformaciones de **la misma** contrasena:

1. Las **sales** decodificadas son N valores distintos, y cada una mide exactamente 16 bytes
   (si alguien la deja en constante, o la acorta, cae aqui).
2. Las **claves derivadas** —el ultimo segmento, aislado de la sal— son N valores distintos.
   Este es el assert que de verdad prueba que la sal entra en la derivacion.
3. Las N verificaciones contra la contrasena original devuelven `true` (que la sal varie no
   sirve de nada si rompe la verificacion).

Y ademas la comprobacion por mutacion de `tasks.md` (M1): fijar la sal a una constante debe
poner el test en rojo. Un test de unicidad que sobrevive a una sal constante no protege nada.

## 6. Decision clave: tiempo constante y fallo cerrado

**Comparacion (R8).** scrypt no resuelve esto solo: la derivacion es de coste fijo, pero
comparar las dos claves derivadas con `===` o con `Buffer.compare` **cortocircuita en el primer
byte distinto**. Se usa `crypto.timingSafeEqual` sobre los dos `Buffer` de 32 bytes.
`timingSafeEqual` **lanza** si las longitudes difieren —eso en si es una fuga y un error— asi
que la longitud se comprueba antes y una longitud distinta se resuelve como "no coincide" sin
llamar a la funcion.

Lo que **no** se hace: un test de reloj de pared que compare tiempos de dos verificaciones. En
una maquina con GC y otros procesos eso es ruido, produce rojos aleatorios y acaba desactivado,
que es peor que no tenerlo. R8 se cierra con una **guardia estatica** sobre el fuente del modulo
(usa `timingSafeEqual`; no compara claves derivadas con `===`, `==`, `Buffer.compare`,
`.equals()` ni `localeCompare`), y la guardia se autocomprueba contra fuentes sinteticos —el
mismo patron que `guard-password-never-plaintext` de la feature 1.

**Fallo cerrado (R10, R11).** `verifyPasswordHash` devuelve `false` ante cualquier valor almacenado
que no pueda interpretar, y **no lanza**. Los casos: cadena vacia, cadena sin los 5 segmentos,
prefijo de algoritmo distinto de `scrypt`, segmento de parametros mal formado, `n` que no es
potencia de dos o fuera de `[2^10, 2^20]`, `r` fuera de `[1, 32]`, `p` fuera de `[1, 16]`,
sal o clave que no decodifican como base64url, sal de menos de 16 bytes, clave fuera de
`[16, 64]` bytes, y `null`/`undefined` colandose desde JavaScript sin tipos.

Dos matices que no son obvios:

- **Devolver `false` en vez de propagar el error es deliberado**, y `docs/conventions.md`
  ("nada de catch vacios: un error o se maneja o se propaga") no se incumple: aqui el error
  **se maneja**, y la forma de manejarlo es la respuesta negativa. Si en cambio se propagara,
  el login de la feature 4 tendria dos caminos de salida distinguibles desde fuera —error 500
  para el usuario con hash corrupto, 401 para el resto— y eso es exactamente el oraculo de
  enumeracion de usuarios que la feature 4 dice querer evitar. Un hash corrupto en `users` es un
  problema de datos, no del que esta intentando entrar.
- **El orden del parseo importa para R11.** Los parametros se validan contra
  `MAX_SCRYPT_MEMORY_BYTES` **antes** de llamar a `crypto.scrypt`. Un valor almacenado forjado
  con `n=2^30` no puede llegar a reservar gigabytes ni a colgar el proceso: el parseo lo rechaza
  antes. Como esta feature no escribe en la base, el vector es real solo si alguien inyecta un
  hash por otra via, pero el coste de cerrarlo es una comparacion.

## 7. Modelo de datos, migraciones y RLS

**Ninguna migracion. Ningun cambio de esquema. Ninguna tabla ni policy nueva.**

**Hallazgo pedido explicitamente, con su justificacion:** `password_hash text NOT NULL` sirve
tal cual. La cadena de §4 son ~90 caracteres ASCII, `text` no tiene limite practico, la sal va
embebida (no hace falta columna `salt`) y el algoritmo y los parametros tambien (no hace falta
columna `algorithm` ni `params`). **No hace falta tocar el esquema de la feature 1**, y por eso
esta feature no crea `db/migrations/`. Si se hubiera elegido `char(60)` en la feature 1 —la
huella de bcrypt— este diseno no cabria; la decision de dejar la columna sin longitud fue la
correcta y aqui se cobra.

RLS: no aplica, no hay tabla nueva (`CHECKPOINTS.md > Datos y seguridad` pide RLS en tablas
**nuevas**). Autorizacion en el service: no aplica, esta feature no expone ninguna operacion de
negocio ni tiene permiso que validar; el primer permiso real llega con el login.

## 8. Decision clave: ¿hace falta una via para rotar parametros o algoritmo?

**Se cierra la pregunta abierta 3 de la feature 1** (`specs/1-modelo-usuarios-y-roles/design.md
> 11`: "¿harian falta columnas `password_algorithm` / `password_updated_at`?").

**Respuesta: NO. No hace falta ninguna columna nueva, y no se anade ninguna.**

Razonado, no por comodidad:

1. **El dato que esas columnas guardarian ya esta dentro del valor almacenado.** `$scrypt$` es
   el algoritmo y `n=...,r=...,p=...` son los parametros (§4). Una columna `password_algorithm`
   seria una segunda copia del mismo dato, con el problema clasico de las dos copias: pueden
   discrepar, y entonces ¿cual manda? La cadena, siempre, porque es la que se usa para verificar.
   La columna solo podria mentir.
2. **La rotacion ya funciona sin ellas.** Cambiar `DEFAULT_SCRYPT_PARAMS` manana hace que los
   valores nuevos usen el coste nuevo y que los viejos sigan verificando con el suyo (R13), sin
   migracion, sin backfill y sin invalidar ninguna contrasena. Eso es la rotacion.
3. **`password_updated_at` responde a otra pregunta** —caducidad de contrasenas, "cambiala cada
   90 dias"— que nadie ha pedido y que no aparece en ninguna description del backlog. Anadirla
   ahora seria adivinar una politica (regla 6 de `CLAUDE.md`).
4. **Lo que si queda pendiente no es una columna, es una decision de la feature 4:** detectar
   "este hash usa parametros viejos" es trivial con el formato de §4 (se parsea y se comparan
   los parametros), pero **rehashear implica escribir en `users`**, y escribir esta fuera del
   alcance de esta feature. Por eso este modulo **no exporta `needsRehash`**: seria API sin
   consumidor, que es sobre-ingenieria segun `docs/architecture.md`. Nace con la feature que lo
   use, si es que se decide usarlo (pregunta abierta 4 de `requirements.md`).

Coste aceptado de decir que no: el dia que se quiera saber "cuantos usuarios siguen con
parametros viejos" hay que hacer un `LIKE` sobre `password_hash` en vez de un `GROUP BY` sobre
una columna indexada. Con un catalogo de usuarios de un ERP de una sola empresa, es un escaneo
irrelevante y no justifica una columna redundante.

## 8.1 Decision cerrada: no hay pepper (humano, 2026-08-06)

Un *pepper* es un secreto de aplicacion —no guardado en la base— que se mezcla con la
contrasena antes de derivar el hash. Su efecto es que un volcado de la tabla `users` sin volcado
de las variables de entorno no basta para atacar los hashes offline.

**Decision del humano: NO se anade. scrypt con sal por usuario y 64 MiB por intento se queda
como esta.** Las razones, escritas aqui para que no se reabra la discusion a ciegas:

1. **El coste real de un pepper no es el HMAC, es la custodia del secreto:** respaldo, rotacion
   y plan de desastre. Eso hoy no esta montado en este proyecto. Y un pepper mal custodiado es
   **peor** que no tenerlo: si se pierde, se pierden todas las contrasenas de golpe; si se rota
   sin plan, se invalidan todas de golpe.
2. **El margen que anade es pequeno frente a lo que ya cuesta atacar esto.** Con scrypt a 64 MiB
   por intento (`§3.2`), el crackeo masivo de una tabla filtrada ya es muy caro.
3. **Tiene sentido cuando el secreto vive en un almacen aparte** (un KMS), no junto al resto de
   variables de entorno de la misma aplicacion. Guardado al lado de `DATABASE_URL`, el mismo
   incidente que filtra la base filtra el pepper, y el beneficio se evapora.

**Y no es una decision irreversible ni urgente** (esto corrige lo que decia la primera version de
esta spec, que sobreestimaba la urgencia). En el login se tiene la contrasena **en claro**, asi
que un pepper introducido mas adelante se puede migrar de forma **perezosa**: se rehashea en cada
login exitoso y los valores viejos siguen verificando por el camino antiguo mientras tanto — el
formato de `§4` ya distingue un algoritmo de otro. Lo unico que se pierde por decidirlo tarde es
que **los usuarios que no vuelvan a entrar se quedan sin migrar** (habria que forzarles un cambio
de contrasena o dejarlos con el esquema viejo), y que hay que escribir esa logica de migracion.
Ninguna de las dos cosas obliga a decidirlo antes de la feature 3.

## 9. Contratos de entrada/salida

Modulo `lib/utils/password-hash.ts`. Todo `export` es publico para las features 3 y 4:

```ts
/** Parametros de coste de scrypt. Viajan dentro del valor almacenado (design.md > 4). */
export type ScryptCostParams = {
  readonly n: number  // potencia de dos, [2^10, 2^20]
  readonly r: number  // [1, 32]
  readonly p: number  // [1, 16]
}

/** Coste vigente: 64 MiB por transformacion (design.md > 3.2). */
export const DEFAULT_SCRYPT_PARAMS: ScryptCostParams

/** Techo de memoria admitido al verificar; hace cumplir R11. 192 MiB. */
export const MAX_SCRYPT_MEMORY_BYTES: number

/**
 * Transforma una contrasena en su valor almacenable.
 * Sal nueva de 16 bytes en cada llamada: dos llamadas con la misma contrasena
 * devuelven valores distintos (R2).
 * `params` existe para abaratar los tests y para rotar el coste; en produccion
 * se omite (design.md > 11).
 * Lanza solo si `params` esta fuera de rango: eso es un error del programador,
 * no un dato de entrada.
 */
export function createPasswordHash(
  plaintext: string,
  params?: ScryptCostParams,
): Promise<string>

/**
 * Responde si `plaintext` corresponde a `storedHash`.
 * Falla cerrado: cualquier `storedHash` vacio, mal formado o con parametros fuera
 * de rango devuelve `false` sin lanzar (R10, R11).
 * No recibe parametros de coste: los lee del propio `storedHash` (R9, R12).
 */
export function verifyPasswordHash(plaintext: string, storedHash: string): Promise<boolean>
```

### 9.1 Los nombres no son libres: los fija la guardia de la feature 1

Hallazgo del cruce con el codigo ya mergeado, y conviene saberlo **antes** de escribir el
modulo. `tests/guards/guard-password-never-plaintext.test.ts` barre `lib/` y marca en rojo
cualquier identificador declarado cuyos segmentos incluyan `password`, `pass`, `contrasena` o
`contraseña` **y que no termine en `hash`**. Su deteccion en TypeScript alcanza declaraciones
(`const|let|var|function`), claves de objeto y **parametros de funcion** (el patron
`(nombre:` los captura).

Consecuencia concreta: los nombres "naturales" para esta API **rompen la suite de la feature
1**, y no por un falso positivo tonto sino porque la guardia hace exactamente lo que dice hacer:

| Nombre natural | Segmentos | Veredicto de la guardia |
| --- | --- | --- |
| `hashPassword` | hash · password | **rojo** (no termina en `hash`) |
| `verifyPassword` | verify · password | **rojo** |
| `password` (parametro) | password | **rojo** |
| `rawPassword` (parametro) | raw · password | **rojo** |
| `createPasswordHash` | create · password · hash | verde |
| `verifyPasswordHash` | verify · password · hash | verde |
| `plaintext`, `storedHash` (parametros) | plaintext / stored · hash | verde |

**Decision: se adaptan los nombres, no la guardia.** Relajar la guardia para que ignore
parametros de funcion la debilitaria justo donde importa —un parametro `password` que acaba
escrito en un log o en una fila es el escenario que vigila— y ademas tocaria un archivo de otra
feature ya mergeada. El coste de escribir `createPasswordHash` en vez de `hashPassword` es cero,
y los nombres resultantes son mas precisos: la funcion no "hashea una contrasena", **crea el
hash de una contrasena**, y la otra verifica una contrasena **contra un hash**.

Efecto colateral util: cualquier variable local del modulo que quiera llamarse `password` esta
prohibida por construccion, asi que la contrasena en claro solo puede vivir en el parametro
`plaintext`.

Detalles del contrato que son parte del diseno, no de la implementacion:

- **Ambas son asincronas** y por dentro usan `crypto.scrypt` con callback (envuelto en una
  promesa), nunca `crypto.scryptSync`. Con los parametros por defecto una transformacion ocupa
  del orden de 10^2 ms: hacerla sincrona bloquearia el event loop de la funcion serverless
  entera durante cada login (R16).
- **La contrasena se normaliza con `String.prototype.normalize('NFC')`** en las dos funciones
  antes de convertirla a bytes UTF-8 (R5). Sin eso, la misma contrasena tecleada en un teclado
  que compone acentos y en otro que los descompone produce bytes distintos y el usuario queda
  fuera sin explicacion posible. **Advertencia que hay que respetar:** cambiar esta decision
  despues invalida los hashes ya generados; por eso se toma ahora y se deja escrita.
- **No hay validacion de politica de contrasena** (longitud minima, complejidad): no esta
  definida en ningun lado y no se inventa (`requirements.md > Pregunta abierta 1`). La cadena
  vacia se transforma como cualquier otra.
- **No hay zod aqui.** `docs/architecture.md` pide validacion en el borde con zod para toda
  entrada externa; el borde de una contrasena es el formulario de login (feature 4), no este
  modulo, que recibe una `string` ya tipada desde codigo propio.

## 10. Rutas, endpoints e integraciones

**Ninguna.** Ni route handler, ni Server Action, ni pagina, ni integracion externa. Un modulo
de funciones puras. Los unicos consumidores previstos son el seed (feature 3) y el login
(feature 4), y ambos importan directamente.

## 11. Coste en la suite de tests

Un algoritmo bien parametrizado es lento **a proposito**, y una suite que hashee con los
parametros de produccion en cada caso se vuelve inusable. La salida es el parametro opcional de
`createPasswordHash`:

- **Parametros de test:** `{ n: 1024, r: 8, p: 1 }` → 1 MiB, del orden de milisegundos. Con
  ellos corren todos los casos de comportamiento (unicidad, verificacion, formato, fallo
  cerrado). Son criptograficamente insuficientes y por eso **no** se exportan desde el modulo de
  produccion: se definen en un helper de tests.
- **Parametros de produccion:** solo en el test de R14/R16, con un presupuesto explicito de
  **como maximo 4 transformaciones con coste real en toda la suite** y `timeout` holgado. Ese
  test es el unico que puede tardar ~1 s.
- `verifyPasswordHash` no recibe parametros de coste (R9): los lee del hash, asi que un hash generado con
  parametros de test se verifica barato **sin ninguna configuracion global**. Esa propiedad es
  lo que hace innecesario un mock del modulo en las features 3 y 4.

Se descarta la alternativa de **bajar el coste por variable de entorno** (`SCRYPT_N` leido de
`process.env`): abarata los tests igual, pero mete la seguridad en la configuracion y basta una
variable mal puesta en Vercel para que produccion hashee con 1 MiB **sin que nada se ponga
rojo**. El parametro explicito en la firma no puede filtrarse a produccion por accidente: hay
que escribirlo en la llamada, y una llamada asi se ve en el diff.

## 12. Guardias (barren el arbol de archivos, no el grafo de imports)

`tests/guards/guard-password-hash-module.test.ts`, en la linea de las dos guardias de la
feature 1 y con su mismo patron de autocomprobacion sobre fuentes sinteticos:

1. **Comparacion en tiempo constante (R8):** el fuente del modulo contiene `timingSafeEqual` y
   no compara claves derivadas con `===`, `Buffer.compare`, `.equals(` ni `localeCompare`.
2. **Sin bloqueo del hilo (R16):** el fuente no contiene `scryptSync` ni `pbkdf2Sync`.
3. **Sin filtraciones (R17):** el fuente no contiene ningun `console.*`.
4. **Frontera de runtime (R18):** ningun archivo del repo que sea `middleware.ts` o declare
   `runtime = 'edge'` importa `password-hash`. Hoy no existe ninguno, asi que el assert de
   barrido es vacuo por si solo: la guardia **debe** incluir el caso sintetico (un fuente Edge
   ficticio que importa el modulo) y comprobar que lo detecta. Sin eso, el dia que aparezca
   `middleware.ts` nadie sabra si la guardia funcionaba.

Las cuatro recorren archivos y ningun grafo de imports las seleccionaria: por eso van en
`tests/guards/` y entran en `pnpm run test:guardias` (`docs/verification.md`).
