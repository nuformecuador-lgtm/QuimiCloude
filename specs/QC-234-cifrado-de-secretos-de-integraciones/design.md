# QC-234 — cifrado-de-secretos-de-integraciones · design.md

> Zona: `backend` · Complejidad: `low` · depends_on: — · Rama:
> `feature/QC-234-cifrado-de-secretos-de-integraciones`
>
> El **qué** está en `requirements.md` (R1–R23). Aquí va el **cómo**. Precedentes que se copian:
>
> - `lib/modules/documentos/adapters/driven/config/processing-config-env.ts`: variables leídas
>   dentro de una función y errores que nombran la variable, nunca el valor.
> - `lib/modules/pedidos/adapters/driven/config/cron-secret-env.ts`: `timingSafeEqual` con
>   longitudes iguales comprobadas antes.
> - `lib/modules/identity/adapters/driven/security/credential-setup-secret-crypto.ts`: SHA-256 en
>   hex como huella de un secreto de alta entropía, y el adaptador con `satisfies <Puerto>`.
> - `lib/modules/unidades/domain/errors.ts`: la familia de errores de un módulo contra el catálogo
>   único.
>
> **Regla transversal.** Manda `docs/conventions.md > Comentarios`: ningún comentario nuevo cita
> `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». En los tests, `R<n>` va en el nombre del caso.

---

## Lo que ya existe

Buscado `cifrado`/`encrypt`/`cipher`, `createCipheriv`/`createDecipheriv`/`aes-256`,
`ENCRYPTION_KEY`/`SecretCipher` y `timingSafeEqual`/`secret digest` en tres sitios:

- `feature_list.json`, por `name` y `description`, en todos los estados;
- `specs/`, con grep;
- el código, con el grafo (`search_code` «createCipheriv|createDecipheriv|subtle.encrypt|
  timingSafeEqual») y con grep sobre `lib/`, `app/`, `tests/` y `scripts/`.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| Ningún cifrado reversible en el código | Ni `createCipheriv` ni `subtle.encrypt` en ningún archivo | Nace aquí |
| `credential-setup-secret-crypto.ts` (`identity`) | SHA-256 en hex de un secreto de 256 bits; se busca por igualdad en la base | **No se reutiliza por import**: es un driven de otro módulo (prohibido, `docs/architecture.md > La regla de dependencias`). Se copia la forma, y el resumen sale con el mismo formato (hex, 64) |
| `cron-secret-env.ts` (`pedidos`) | `timingSafeEqual` tras comparar longitudes | Mismo criterio; tampoco se importa (driven de otro módulo) |
| `session-token.ts` (`identity`) | HMAC con WebCrypto, único dueño de la firma de sesión | No se toca. Esta ficha no usa `createHmac` ni `crypto.subtle`, así que `guard-firma-sesion-unica` no la ve |
| `specs/QC-79-*/design.md > 11.1` | Descartó **cifrar** el secreto del enlace porque bastaba la huella | Es el mismo razonamiento que D4 para el verify token |
| QC-119 `webhook-whatsapp-recepcion` (`cancelled`) | Recepción de WhatsApp, épica antigua | Nada que reutilizar |
| QC-237 y QC-238 (`pending`) | Consumidores: `accessTokenEnc`, `appSecretEnc`, `keyVersion`, `verifyTokenHash`; comparación del verify token | Fronteras en `> 9` |

Conclusión: no existe nada equivalente. Se sigue.

---

## 1. Qué cambia (resumen)

```
lib/modules/integraciones/
  index.ts                                    ← reexporta errores y SecretContext (R20)
  domain/
    errors.ts                                 ← IntegracionesError, SecretUnreadableError, ValidationError
    secret-context.ts                         ← SecretContext y su codificación canónica para el AAD
    stored-secret.ts                          ← forma `v<n>:<iv>:<tag>:<ct>`: partir y unir, sin cripto
  ports/
    secret-cipher.ts                          ← puerto SecretCipher
    secret-digest.ts                          ← puerto SecretDigest
  adapters/driven/
    config/encryption-keys-env.ts             ← lee y valida las dos variables, al llamar
    security/secret-cipher-aes-gcm.ts         ← AES-256-GCM con node:crypto
    security/secret-digest-sha256.ts          ← SHA-256 + timingSafeEqual
lib/composition/index.ts                      ← export const integraciones = { secretCipher, secretDigest }
lib/modules/errores/domain/error-codes.ts     ← + 'integration_secret_unreadable'
lib/modules/errores/domain/error-catalog.ts   ← + clave y texto
.env.example                                  ← + las dos variables, vacías y comentadas
```

Sin tablas, sin migración, sin UI, sin dependencias.

---

## 2. Modelo de datos

**Ninguna tabla, columna, RLS ni migración** (fuera de alcance, las crea QC-237). Lo único que esta
ficha fija para la base es la **forma del valor guardado**, que QC-237 meterá en columnas `text`:

```
v<n>:<iv_b64>:<tag_b64>:<ciphertext_b64>
```

- `v<n>`: versión de la clave, `^v[1-9][0-9]*$`.
- `iv`: 12 bytes aleatorios (`randomBytes(12)`), base64 estándar → 16 caracteres.
- `tag`: 16 bytes de autenticación de GCM → 24 caracteres.
- `ciphertext`: el texto UTF-8 cifrado, mismo número de bytes que el texto, en base64 estándar.

Base64 **estándar** (no base64url): su alfabeto `A-Z a-z 0-9 + / =` no contiene `:`, así que el
separador no es ambiguo. Para un token de Meta de ~250 caracteres el valor guardado ronda los 390.

QC-237 piensa guardar también `keyVersion` en columna aparte. Con este formato es redundante (la
versión va dentro del valor), pero no estorba: le sirve para buscar con un índice qué filas siguen
en una versión vieja. Lo decide QC-237.

---

## 3. Los puertos y el dominio

### 3.1 `domain/secret-context.ts`

```ts
export type SecretContext = {
  readonly companyId: string;
  readonly recordId: string;
  readonly field: string;
};

/** Cadena canónica que va como AAD. */
export function encodeSecretContext(version: string, context: SecretContext): string;
export function isCompleteSecretContext(context: SecretContext): boolean; // ningún hueco vacío
```

**Codificación canónica (R6):** `JSON.stringify(['integraciones.secret', version, companyId,
recordId, field])`. JSON escapa comillas y barras, así que dos ternas distintas nunca producen la
misma cadena: `('a:b','c','d')` y `('a','b:c','d')` dan `["…","v1","a:b","c","d"]` y
`["…","v1","a","b:c","d"]`. Unir con `:` —lo que sugiere el `empresa:conexión:campo` de QC-237—
sí sería ambiguo. La etiqueta fija `integraciones.secret` separa este uso de cualquier otro AAD
futuro. La **versión** entra también en el AAD: cambiar `v1` por `v2` delante de un valor guardado
ya falla porque cambia la clave, pero así además falla aunque dos versiones compartieran clave por
error.

`field` es texto libre que elige el llamador (`access_token`, `app_secret`). No se cierra en una
unión de literales: cada integración trae sus campos y cerrarlo obligaría a tocar este archivo en
cada ficha.

### 3.2 `domain/stored-secret.ts`

Funciones puras, sin `Buffer` ni `node:crypto`:

```ts
export type StoredSecretParts = { version: string; iv: string; tag: string; ciphertext: string };
export function joinStoredSecret(parts: StoredSecretParts): string;
export function splitStoredSecret(stored: string): StoredSecretParts | null; // null = forma inválida
export function isKeyVersion(label: string): boolean;                         // ^v[1-9][0-9]*$
```

`splitStoredSecret` comprueba cuatro partes, versión válida, ninguna parte vacía y que las tres
últimas casen con el alfabeto base64 estándar con relleno correcto
(`^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$`). La regex hace falta porque
`Buffer.from(x, 'base64')` es permisivo: ignora caracteres sobrantes y no avisa (R7). El largo en
bytes del IV y del tag se comprueba en el adaptador, después de decodificar.

### 3.3 `domain/errors.ts`

Familia del módulo, igual que `unidades/domain/errors.ts`, para que `guard-catalogo-de-errores` la
barra (su patrón es `lib/modules/<m>/domain/errors.ts`):

| Clase | `code` | Cuándo |
|---|---|---|
| `IntegracionesError` (abstracta, `extends Error`) | — | Base. Mensaje del catálogo, `diagnostic` opcional para el log |
| `SecretUnreadableError` | `integration_secret_unreadable` (nuevo) | Descifrado fallido por cualquier causa: forma inválida, versión ausente, tag que no autentica, contexto distinto (R4, R5, R7, R8) |
| `ValidationError` | `invalid_input` (existe) | Texto vacío o contexto con un hueco vacío (R13) |

**Una sola clase para todos los fallos de descifrado, a propósito.** Distinguir «tag alterado» de
«contexto distinto» no le sirve de nada al llamador: en todos los casos la única acción es volver
a escribir el secreto. La causa concreta va en `diagnostic` (al log del servidor), con frases fijas
(`forma inválida`, `versión v3 no configurada`, `no autentica`), nunca con el valor guardado ni el
error crudo de `node:crypto`. GCM no distingue «ciphertext alterado» de «contexto distinto»: los
dos dan el mismo fallo de autenticación.

### 3.4 `ports/secret-cipher.ts` y `ports/secret-digest.ts`

```ts
import type { SecretContext } from '../domain/secret-context';

export interface SecretCipher {
  encrypt(plaintext: string, context: SecretContext): Promise<string>;
  decrypt(stored: string, context: SecretContext): Promise<string>;
}

export interface SecretDigest {
  digestOf(secret: string): string;                       // hex, 64
  matches(secret: string, storedDigest: string): boolean; // tiempo constante
}
```

`SecretCipher` es **asíncrono** aunque `node:crypto` cifre en síncrono: los casos de uso que lo
llaman (QC-237) ya son `async`, y el día que la clave salga a un KMS (fuera de alcance) la firma no
cambia. `SecretDigest` es síncrono, como `CredentialSetupSecretFactory.digestOf`: es una huella
local y no tiene por qué dejar de serlo.

---

## 4. El catálogo de errores

Una entrada nueva (R21, Pregunta abierta 2):

- `error-codes.ts`: `'integration_secret_unreadable'` al final de `ERROR_CODES`, con su línea de
  enmienda en el JSDoc (fecha, sin cita de ficha).
- `error-catalog.ts`: `integration_secret_unreadable: 'errors.integration_secret_unreadable'` y el
  texto propuesto «No se pudo leer una credencial guardada de la integración. Vuelve a
  escribirla.».
- `tests/unit/errores/catalogo.test.ts`: el conteo literal pasa de 74 a 75 con su línea de
  comentario.

Ninguna pantalla lo muestra todavía: lo traducirá a estado la acción de QC-237 con
`createErrorStateTranslator(IntegracionesError, …)`. `invalid_input` ya existe y no cambia.

---

## 5. Las variables de entorno

`adapters/driven/config/encryption-keys-env.ts`:

```ts
export type EncryptionKeyRing = ReadonlyMap<string, Buffer>; // 'v1' -> 32 bytes
export function readEncryptionKeyRing(): EncryptionKeyRing;     // solo INTEGRATIONS_ENCRYPTION_KEYS
export function readActiveKeyVersion(ring: EncryptionKeyRing): string; // INTEGRATIONS_ENCRYPTION_ACTIVE
```

Se llaman **dentro** de `encrypt`/`decrypt`, en cada llamada (R10). Nada a nivel de módulo. El
coste —partir una cadena corta y decodificar uno o dos base64 por llamada— es despreciable al
lado de una petición a Graph.

**`INTEGRATIONS_ENCRYPTION_KEYS`**: `v1:<base64>,v2:<base64>`. Se parte por `,`, cada entrada se
recorta y se parte por el **primer** `:`. Errores (todos `Error` llano, Pregunta abierta 3), y su
mensaje siempre empieza por el nombre de la variable:

| Caso | Mensaje (forma) |
|---|---|
| Ausente, vacía o solo espacios | `falta la variable de entorno INTEGRATIONS_ENCRYPTION_KEYS` |
| Entrada sin `:` o con versión mal formada | `INTEGRATIONS_ENCRYPTION_KEYS: la entrada 2 no tiene la forma v<n>:<base64>` |
| Clave que no es base64 o no da 32 bytes | `INTEGRATIONS_ENCRYPTION_KEYS: la clave v2 no son 32 bytes en base64` |
| Versión repetida | `INTEGRATIONS_ENCRYPTION_KEYS: la versión v1 aparece dos veces` |

Con versión mal formada se da la **posición**, no la etiqueta: la etiqueta sería un trozo del
valor sin validar (R11). La clave se valida con la misma regex de base64 estándar de `> 3.2`.

**`INTEGRATIONS_ENCRYPTION_ACTIVE`**: `v<n>`. Ausente o vacía, mal formada, o versión que no está en
la lista: `Error` con `INTEGRATIONS_ENCRYPTION_ACTIVE` en el mensaje (`la versión activa v3 no está
en INTEGRATIONS_ENCRYPTION_KEYS`; nombrar `v3` no filtra nada, es una etiqueta). Solo la lee
`encrypt` (R12): descifrar con la versión activa mal puesta sigue funcionando, para que un error
de despliegue no deje de golpe a todas las empresas sin poder leer sus credenciales.

**Generar una clave:** `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
Va en el comentario de `.env.example`.

**Rotar** (procedimiento, se escribe en el comentario de `.env.example`):

1. Añadir `v2` a la lista, sin quitar `v1`, y desplegar.
2. Cambiar la versión activa a `v2` y desplegar. Lo nuevo se cifra con `v2`; lo viejo se sigue
   leyendo con `v1`.
3. Quitar `v1` **solo** cuando no quede ningún valor guardado con `v1`. Hoy eso exige re-guardar a
   mano cada credencial: el re-cifrado masivo queda como **deuda** (`> 10`).

**Preview y producción comparten base** (`docs/architecture.md > Despliegue a produccion`): las dos
variables tienen que tener el mismo valor en los dos entornos de Vercel, o una preview no podrá
leer lo que guardó producción. Se dice en el comentario de `.env.example`.

---

## 6. Los adaptadores

### 6.1 `adapters/driven/security/secret-cipher-aes-gcm.ts`

```ts
export const secretCipherAesGcm = { encrypt, decrypt } satisfies SecretCipher;
```

**`encrypt(plaintext, context)`**

1. `plaintext === ''` o `!isCompleteSecretContext(context)` → `ValidationError` (R13).
2. `ring = readEncryptionKeyRing()`, `version = readActiveKeyVersion(ring)`, `key = ring.get(version)`.
3. `iv = randomBytes(12)`; `cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })`.
4. `cipher.setAAD(Buffer.from(encodeSecretContext(version, context), 'utf8'))`.
5. `ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])`, `tag = cipher.getAuthTag()`.
6. `joinStoredSecret({ version, iv: b64(iv), tag: b64(tag), ciphertext: b64(ct) })`.

**`decrypt(stored, context)`**

1. Contexto incompleto → `ValidationError` (R13).
2. `parts = splitStoredSecret(stored)`; `null` → `SecretUnreadableError('forma inválida')`.
3. `ring = readEncryptionKeyRing()` (un error de configuración aquí sube tal cual: es `Error` llano,
   R11). `key = ring.get(parts.version)`; ausente → `SecretUnreadableError('versión vN no
   configurada')` (R8).
4. Decodificar; IV ≠ 12 bytes o tag ≠ 16 → `SecretUnreadableError('forma inválida')`.
5. `createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })`, `setAAD`, `setAuthTag`,
   `update` + `final` dentro de un `try`. Cualquier excepción ahí → `SecretUnreadableError('no
   autentica')`, **sin** encadenar la original como `cause` (su mensaje es de OpenSSL y no aporta;
   y así es imposible que un `cause` arrastre algo del valor guardado a un log, R14).
6. Devolver `toString('utf8')`.

`authTagLength: 16` explícito en los dos lados: sin él, `createDecipheriv` en GCM aceptaría tags
truncados (Node lo permite con aviso de deprecación), y un tag de 4 bytes se falsifica a fuerza
bruta.

### 6.2 `adapters/driven/security/secret-digest-sha256.ts`

```ts
export function digestOfSecret(secret: string): string;            // createHash('sha256').update(secret, 'utf8').digest('hex')
export function secretMatchesDigest(secret: string, storedDigest: string): boolean;
export const secretDigestSha256 = { digestOf: digestOfSecret, matches: secretMatchesDigest } satisfies SecretDigest;
```

`secretMatchesDigest`:

1. `storedDigest` no casa con `^[0-9a-f]{64}$` → `false` (R16). Se compara en minúsculas, igual que
   lo que produce `digestOfSecret`.
2. `timingSafeEqual(Buffer.from(digestOfSecret(secret), 'hex'), Buffer.from(storedDigest, 'hex'))`:
   siempre 32 contra 32 bytes, así que `timingSafeEqual` nunca lanza por longitud (R17).

Se comparan **resúmenes**, no el secreto contra algo: el largo del secreto que llega no influye en
el tiempo de la comparación.

**Por qué SHA-256 sin sal ni pimienta.** El verify token lo genera QC-237 con un CSPRNG (alta
entropía): no hay diccionario que encarecer. Es el mismo argumento de
`credential-setup-secret-crypto.ts`. Si una integración futura resume secretos de baja entropía
(elegidos por personas), este resumidor **no** le sirve y tendrá que decirlo su spec.

### 6.3 Runtime

Los dos adaptadores importan `node:crypto`: solo corren en el runtime de Node. Hoy lo cumple todo
lo que pasa por `lib/composition/index.ts` (el borde usa `lib/composition/edge.ts`, que no se
toca). Las rutas de webhook de QC-238 tendrán que declarar `runtime = 'nodejs'`, como
`app/api/cron/caducar-pedidos/route.ts`.

---

## 7. Composición y contrato

`lib/composition/index.ts`, bloque nuevo al final, mismo estilo que el resto:

```ts
import { secretCipherAesGcm } from '@/lib/modules/integraciones/adapters/driven/security/secret-cipher-aes-gcm';
import { secretDigestSha256 } from '@/lib/modules/integraciones/adapters/driven/security/secret-digest-sha256';
import type { SecretCipher } from '@/lib/modules/integraciones/ports/secret-cipher';
import type { SecretDigest } from '@/lib/modules/integraciones/ports/secret-digest';

const secretCipher: SecretCipher = secretCipherAesGcm;
const secretDigest: SecretDigest = secretDigestSha256;

export const integraciones = { secretCipher, secretDigest } as const;
```

Importar la composición no lee ninguna variable: las lecturas viven dentro de `encrypt`/`decrypt`
(R10).

`lib/modules/integraciones/index.ts` (R20):

```ts
export { IntegracionesError, SecretUnreadableError, ValidationError } from './domain/errors';
export type { SecretContext } from './domain/secret-context';
```

`SecretContext` va en el contrato porque QC-237 lo construirá en su dominio; los errores, porque
su acción los traducirá. `encodeSecretContext` y `stored-secret.ts` **no** se exportan: son
detalle del formato y solo los usa el adaptador (vía `../../domain`, permitido).

---

## 8. Tests

Todos unitarios, sin base ni red. Las variables se ponen con `vi.stubEnv` y se limpian con
`vi.unstubAllEnvs()` en `afterEach`. Las claves de test se generan en el propio test
(`randomBytes(32)`), nunca escritas como literal.

| Archivo | Cubre |
|---|---|
| `tests/unit/integraciones/secret-cipher-aes-gcm.test.ts` | R1–R9, R13, R14 (cifrador) |
| `tests/unit/integraciones/encryption-keys-env.test.ts` | R10, R11, R12 (y R14 en los errores de config) |
| `tests/unit/integraciones/secret-digest-sha256.test.ts` | R14 (resumidor), R15, R16, R17 |
| `tests/unit/integraciones/stored-secret.test.ts` | R3, R7 (forma, sin cripto) |
| `tests/unit/integraciones/module-shape.test.ts` (modificado) | R18, R19, R20, R22 |
| `tests/unit/errores/catalogo.test.ts` (modificado) | R21 (conteo 75) |
| `guard-catalogo-de-errores`, `guard-arquitectura-modulos` (sin cambios) | R18, R21, R23 |

Notas de cómo se prueba lo menos obvio:

- **R4 alteración:** se cambia un carácter de cada parte por otro del alfabeto base64 que cambie
  los bytes decodificados (no el relleno), y se espera `SecretUnreadableError` con
  `rejects.toBeInstanceOf`, y que el error no sea de `node:crypto` (`name`).
- **R6:** los dos contextos del ejemplo; cada uno no descifra el valor del otro.
- **R10 (importar sin variables):** `vi.resetModules()` + `import()` dinámico de
  `@/lib/composition` con las dos variables a `undefined`: la importación resuelve. Y dos llamadas
  seguidas con `INTEGRATIONS_ENCRYPTION_ACTIVE` cambiada entre ellas dan versiones distintas.
- **R11/R12/R14 (sin fuga):** el error se serializa entero (`message`, `diagnostic`, `stack` y
  `JSON.stringify` de sus propiedades propias) y se comprueba que no contiene ni la clave en base64
  ni ningún trozo del valor de la variable de más de 4 caracteres. Hay un caso por fila de la tabla
  de `> 5`.
- **R14 consola:** `vi.spyOn(console, 'log'|'warn'|'error'|'info'|'debug')` sin llamadas en todos
  los casos de error.
- **R17:** `vi.mock('node:crypto', async (orig) => ({ ...(await orig()), timingSafeEqual:
  vi.fn(real) }))` y se comprueba que cada `matches` con resumen bien formado lo llama una vez con
  dos buffers de 32 bytes; con resumen mal formado, cero veces y `false`.
- **R18:** un caso nuevo en `module-shape.test.ts` que pasa a `findDomainPurityFindings` (exportada
  por la guardia) un `lib/modules/integraciones/domain/x.ts` sintético con `import … from
  'node:crypto'` y espera un hallazgo; y otro que barre `domain/` y `ports/` reales y no encuentra
  `node:crypto` ni `crypto`.

**`module-shape.test.ts` (QC-221):** cambian tres casos y el resto se queda.

| Caso de hoy | Qué pasa |
|---|---|
| R11 «el contrato es exactamente `export {};`» | Se sustituye por R20: el contrato reexporta exactamente los cuatro símbolos de `> 7`, y solo desde `./domain` |
| R11 «`domain/`, `ports/` y `adapters/` sin `.ts`» | Se sustituye por R18: la lista exacta de archivos `.ts` del módulo es la de `> 1`, y `node:crypto` solo aparece en `adapters/driven/` |
| R12 «nadie de fuera lo importa» y «`lib/composition` no nombra el módulo» | Pasan a R19: el único importador de fuera es `lib/composition/index.ts`, y exporta `integraciones` con exactamente `secretCipher` y `secretDigest` |
| R10, R12 (detector), R13, R8, R17 | Sin cambios |

Los `.gitkeep` de `domain/`, `ports/` y `adapters/driven/` se borran (ya hay archivos); el de
`adapters/driving/` se queda, porque R10 de QC-221 exige que la carpeta exista.

---

## 9. Fronteras con las fichas siguientes (no se implementan aquí)

- **QC-237** usa `integraciones.secretCipher` con el contexto
  `{ companyId, recordId: <id de la conexión>, field: 'access_token' | 'app_secret' }` y
  `integraciones.secretDigest` para el verify token. **Ojo con el orden al crear la fila:** el
  `recordId` tiene que existir antes de cifrar, así que el id de la conexión se genera en la
  aplicación (o se inserta y luego se cifra en la misma transacción). Lo decide QC-237.
- **QC-238** usa `secretDigest.matches` para el `hub.verify_token` y `secretCipher.decrypt` para el
  `app_secret` con el que valida la firma.
- **Re-cifrado masivo:** deuda (`> 10`).

---

## 10. Deuda que deja

`progress/deudas.md`, bloque nuevo: «Re-cifrar las credenciales de integraciones a la versión
activa». Sin ese comando, retirar una versión vieja de la lista obliga a re-guardar a mano cada
credencial cifrada con ella. Hoy no hay ninguna fila cifrada (las tablas llegan con QC-237), así que
no bloquea.

---

## 11. Alternativas descartadas

### 11.1 Una librería de cifrado (`@noble/ciphers`, `libsodium-wrappers`, `iron-session`…) — descartada

Resuelven lo mismo con otra API, y obligarían a pasar por la puerta de dependencias
(`docs/architecture.md > Dependencias de terceros`) para algo que `node:crypto` ya trae y que D1
cierra. Lo que una librería nos ahorraría aquí son unas 30 líneas (IV, AAD, tag); a cambio
añadiría una dependencia que auditar.

### 11.2 Supabase Vault o un KMS externo — descartada (fuera de alcance por la ficha)

Sacaría la clave del proceso, que es mejor, pero ata el cifrado a un proveedor y a una llamada de
red por secreto. El puerto asíncrono de `> 3.4` deja la puerta abierta sin cambiar a los
consumidores.

### 11.3 Contexto unido con `:` (`empresa:registro:campo`) como AAD — descartada

Es lo que sugiere la ficha de QC-237, pero es ambiguo (R6): `('a:b','c','d')` y `('a','b:c','d')`
dan la misma cadena. Los ids de hoy son UUID y no llevan `:`, pero `field` es texto libre. JSON
cuesta lo mismo y no tiene el problema.

### 11.4 Clave derivada por empresa (HKDF de la maestra con el `companyId`) — descartada

Daría una clave por empresa sin guardar nada más. Pero el AAD ya impide mover un valor entre
empresas (D3), y una derivación añade otra pieza que fijar y probar sin cambiar lo que protege:
quien tiene la maestra tiene todas las derivadas.

### 11.5 Errores de configuración como error de dominio con código propio — descartada (Pregunta abierta 3)

Pondría otra entrada en el catálogo para un caso que solo ve quien despliega. Y el mensaje del
catálogo es fijo, así que el nombre de la variable iría solo en `diagnostic`, que no es lo que pide
la ficha («error claro que nombra la variable»). Se queda el patrón de `processing-config-env.ts`.

### 11.6 Puerto síncrono — descartada

Más simple hoy, pero cambiarlo a `Promise` el día que la clave salga del proceso tocaría a todos
los consumidores. Hoy no hay ninguno: es el momento barato.

### 11.7 `SecretDigest` con HMAC y pimienta en env — descartada

Protegería el resumen de un token de baja entropía si se filtrara la base. El verify token es de
alta entropía (`> 6.2`), y la ficha dice SHA-256. Además `createHmac` fuera de `session-token.ts`
dispara `guard-firma-sesion-unica`.

---

## 12. Dependencias de terceros

Ninguna. `node:crypto` es parte de Node (D1). `package.json` no cambia (R22).
