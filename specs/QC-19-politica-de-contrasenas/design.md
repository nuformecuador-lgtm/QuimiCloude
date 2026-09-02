# QC-19 — politica-de-contrasenas · design.md

> Escrito el 2026-09-02 sobre el `requirements.md` sembrado por `/afinar-feature` el
> 2026-09-01. La tabla de decisiones cerradas de ese archivo manda sobre este: donde algo de
> aquí la contradijera, gana la tabla.
>
> **Esta feature no se implementa todavía.** QC-6 (seed de roles y usuario inicial) está
> `in_progress` en otra rama y es la dependencia de la ficha. Aquí se describe la **costura** que
> QC-6 tendrá que usar (`> 7`), por contrato y no por sus internos: sus archivos no están en esta
> rama y van a cambiar.

## 1. Estado de partida (verificado en esta rama, no supuesto)

Lo que ya existe y esta feature **copia en vez de reinventar** (QC-15 fijó la forma):

```
lib/modules/identity/index.ts                                   # contrato: solo reexporta de ./domain
lib/modules/identity/domain/credentials.ts                      # CREDENTIAL_MAX_LENGTH = 64, loginInputSchema
lib/modules/identity/domain/verify-credentials.ts               # caso de uso construido con puertos
lib/modules/identity/ports/password-hasher.ts                   # hash/verify
lib/modules/identity/adapters/driven/security/password-hash.ts  # bcryptjs, 10 rondas
lib/composition/index.ts                                        # punto UNICO de composicion
```

- `CREDENTIAL_MAX_LENGTH = 64` ya está exportado por el contrato (`domain/credentials.ts`), y su
  porqué es el límite de **72 bytes** de bcrypt (`specs/5-.../design.md > 5`). **R11 lo reutiliza,
  no inventa un máximo nuevo.**
- `PasswordHasher` es el puerto de hash y la fachada `identity` lo expone ya cableado. Es el
  punto por el que pasa **todo** el que fija una contraseña, y por eso es donde se ancla R18/R19.
- Guardias vivas que esta feature tiene que respetar (no relajar):
  `guard-arquitectura-modulos`, `guard-password-never-plaintext`, `guard-password-hash-module`,
  `guard-dependencias-aprobadas`, `guard-rls-force`.
- `package.json` **no tiene hoy ninguna librería de listas de contraseñas**. Ver `> 5`.

Lo que **no** existe y esta feature no da por hecho: nada de QC-6. No se lee, no se importa, no
se referencia ningún archivo suyo.

## 2. Qué se construye

```
lib/modules/identity/domain/credential-policy.ts                     # NUEVO — la regla, pura
lib/modules/identity/ports/breached-credential-list.ts               # NUEVO — puerto de la lista
lib/modules/identity/adapters/driven/security/breached-credential-list.ts   # NUEVO — la librería
lib/modules/identity/index.ts                                        # MODIFICADO — 4 exports
lib/composition/index.ts                                             # MODIFICADO — 1 puerto, 1 clave
tests/guards/guard-politica-de-contrasenas.test.ts                   # NUEVO — R19
```

Ni tablas, ni migraciones, ni RLS, ni rutas, ni Server Actions, ni componentes (**R21**, **R22**).

### 2.1 El dominio, partido en dos a propósito

```ts
// lib/modules/identity/domain/credential-policy.ts

/** Minimo de caracteres de una credencial nueva (R2). */
export const CREDENTIAL_MIN_LENGTH = 8

/** Catalogo completo y estable de reglas. Lo consume QC-21 para pintarlas (R23). */
export const CREDENTIAL_RULES = [
  'min_length', 'max_length', 'no_uppercase', 'no_lowercase', 'no_digit', 'no_symbol', 'breached',
] as const
export type CredentialRule = (typeof CREDENTIAL_RULES)[number]

export type CredentialPolicyResult = { readonly ok: boolean; readonly unmet: readonly CredentialRule[] }

/** SINCRONA y pura: longitud + composicion (R13). La reusa QC-21 en el cliente. */
export function evaluateCredentialRules(candidate: string): CredentialPolicyResult

/** ASINCRONA: lo anterior + la lista de filtradas, por puerto (R7, R14). */
export function createCredentialPolicy(deps: { readonly breached: BreachedCredentialList }):
  (candidate: string) => Promise<CredentialPolicyResult>
```

**Por qué dos funciones y no una.** La lista de filtradas es lo único que necesita una
dependencia y puede ser asíncrona; longitud y composición son tres líneas puras. Partirlo aquí:

- deja **R13** demostrable (la parte propia no toca ningún puerto),
- deja a **QC-21** una función síncrona que puede correr en el navegador según se escribe, sin
  arrastrar la lista ni el servidor al bundle — que es exactamente lo que `index.ts` exige del
  contrato (`docs/architecture.md > Modulos`),
- y evita que QC-21 tenga que re-declarar las reglas, que es la copia desincronizada que la fila
  «¿La regla vive en el dominio o en el borde?» de la tabla vino a impedir.

`createCredentialPolicy` no vuelve a implementar nada: llama a `evaluateCredentialRules` y le
suma `breached`. **Orden estable (R8):** el resultado se ensambla recorriendo `CREDENTIAL_RULES`
en su orden declarado, no en el orden en que se descubren los fallos.

### 2.2 El puerto

```ts
// lib/modules/identity/ports/breached-credential-list.ts
export interface BreachedCredentialList {
  /** `true` si `candidate` figura en la lista. Comparacion insensible a mayusculas (R7). */
  includes(candidate: string): Promise<boolean>
}
```

Asíncrono aunque la implementación de hoy pueda ser síncrona: un `Set` en memoria, un fichero
cargado en frío o una consulta remota caben todos detrás de esta firma sin tocar el dominio.

### 2.3 Composición

`lib/composition/index.ts` gana una línea de cableado y una clave en la fachada:

```ts
const breachedCredentialList: BreachedCredentialList = { includes: isBreachedCredential }
export const identity = {
  // ...lo de QC-7, intacto
  checkCredentialPolicy: createCredentialPolicy({ breached: breachedCredentialList }),
} as const
```

Nada más importa el adaptador: es la regla del punto único de composición
(`docs/architecture.md > Punto unico de composicion`).

## 3. Definición exacta de las reglas (cierra la pregunta abierta 1)

| Regla | Se cumple si… | Comprobación |
| --- | --- | --- |
| `min_length` | `candidate.length >= 8` | longitud en **caracteres** (unidades UTF-16, igual que el `.max()` de `credentials.ts`) |
| `max_length` | `candidate.length <= CREDENTIAL_MAX_LENGTH` (64) | reutiliza la constante existente |
| `no_uppercase` | hay al menos un `\p{Lu}` | `/\p{Lu}/u` |
| `no_lowercase` | hay al menos un `\p{Ll}` | `/\p{Ll}/u` |
| `no_digit` | hay al menos un `\p{Nd}` | `/\p{Nd}/u` |
| `no_symbol` | hay al menos un carácter que **no** es `\p{L}` ni `\p{N}` | `/[^\p{L}\p{N}]/u` |
| `breached` | la lista no la contiene | puerto (`> 2.2`) |

**Por categorías Unicode, no por una lista ASCII cerrada.** Con `[A-Za-z]` y «símbolo = todo lo
demás», `contraseña` tendría un símbolo (`ñ`) y `Ñ` no contaría como mayúscula: la política diría
que una contraseña en español cumple algo que no cumple. Con `\p{L}` eso no pasa. El precio es
que el espacio cuenta como símbolo — aceptado y explícito en **R6** y **R10**: la contraseña no
se recorta (`domain/credentials.ts` ya lo dice para el login), así que un espacio es un carácter
como cualquier otro.

**Sin normalización Unicode (NFC/NFD).** Se compara la cadena tal cual llega, igual que hace
bcrypt al hashear. Normalizar aquí y no allí produciría una contraseña que pasa la política y
luego no verifica.

## 4. Comparación contra la lista (R7)

- **Insensible a mayúsculas**: se compara `candidate.toLowerCase()`. Las listas públicas de
  filtradas se distribuyen en minúsculas, y `Password1!` no es más secreta que `password1!`.
- **Sin des-leetificar ni quitar sufijos.** `P4ssw0rd!` puede pasar aunque `password` esté en la
  lista. Es una pérdida conocida y aceptada: adivinar variantes es puntuar fuerza, y puntuar
  fuerza no está en el alcance de la ficha.
- **Fail-loud, no fail-open (R15).** Si el adaptador lanza —la lista no carga, el fichero falta—
  el error se propaga con contexto (`docs/conventions.md > Manejo de errores`). Tragar el fallo y
  devolver «aceptable» convertiría R7 en decorado el día que se rompa, y sin ruido. Es la
  decisión **contraria** a la de `verifyPasswordHash` (feature 5 R5, que falla cerrado y devuelve
  `false`), y por buen motivo: allí un hash corrupto es un problema de datos que no debe delatar
  a quien intenta entrar; aquí quien llama es código nuestro fijando una contraseña, y merece
  enterarse.

## 5. Dependencia nueva: PROPUESTA, no aprobada

> Regla 7 de `CLAUDE.md` y `docs/architecture.md > Dependencias de terceros`. **Nada se instala
> con este spec.** El humano aprueba junto con el spec (F1.4) o lo rechaza.
>
> **Y esta es la ficha donde más caro sale saltárselo:** la feature 5 implementó scrypt a mano,
> llegó hasta el PR y se rehízo entera con `bcryptjs`. Una lista de contraseñas filtradas
> mantenida a mano es exactamente el mismo error con otro disfraz.

### 5.1 Qué se propone

**`@zxcvbn-ts/language-common`** — el paquete de diccionarios del port TypeScript mantenido de
zxcvbn. Del paquete se usa **solo el diccionario de contraseñas más comunes/filtradas**; **no**
se instala `@zxcvbn-ts/core` ni se usa su puntuación de fuerza, que está fuera del alcance de la
ficha.

**Qué código nos ahorra:** mantener, actualizar y versionar una lista de decenas de miles de
contraseñas filtradas. Escribirla a mano significa o bien una lista de juguete de 50 entradas
—que no cumple R7 de verdad— o bien un fichero enorme que alguien tiene que refrescar y que nadie
va a refrescar.

### 5.2 Los cuatro checks — **VERIFICADOS los cuatro el 2026-09-02**

| # | Check | Resultado |
| --- | --- | --- |
| 1 | No marcada `deprecated` en npm | ✅ **PASA** — `npm view ... deprecated` no devuelve nada |
| 2 | Release en los últimos 12 meses | ✅ **PASA** — `4.1.3` publicada el **2026-07-16**, hace mes y medio |
| 3 | >= 10.000 descargas semanales | ✅ **PASA** — **1.260.688** (semana del 2026-08-23 al 2026-08-29) |
| 4 | Licencia MIT / Apache-2.0 / BSD / ISC | ✅ **PASA** — **MIT** |

Los verificó el **leader** el 2026-09-02 contra el registro de npm (`npm view` y
`api.npmjs.org/downloads`), porque quien escribió este spec no tuvo red y los dejó —bien— como
**DESCONOCIDO** en vez de rellenarlos de memoria: «Si no puedes verificarlo, **no es un sí**: es
un desconocido, y se dice» (regla 6 de `CLAUDE.md`). Una fila del registro con un número
inventado es peor que no tener fila, porque el registro es el acta de la aprobación.

**Dato que no es un check pero pesa en la decisión:** el paquete ocupa **~1,9 MB desempaquetado**
(`dist.unpackedSize` = 1 891 187 B). Es un diccionario, no código: no entra en el bundle del
cliente si solo lo consume el adaptador en servidor, y el diseño ya lo pone detrás de un puerto.
Quien apruebe debería saberlo igualmente.

Comandos exactos, por si hay que reverificar:

```
npm view @zxcvbn-ts/language-common deprecated time.modified license version dist.unpackedSize
curl -s https://api.npmjs.org/downloads/point/last-week/@zxcvbn-ts/language-common
```

**Los cuatro checks no bastan: sigue faltando la aprobación humana** (`docs/architecture.md >
Dependencias de terceros`). Aprobada, se añade su fila a `docs/dependencias.md` y ahí se instala.

y escribir el resultado en la fila de `docs/dependencias.md` **en el mismo cambio que la
instalación** — `guard-dependencias-aprobadas` es bidireccional y QC-7 ya se estrelló con eso
(`specs/QC-7-.../tasks.md > T11`).

**Riesgo de tamaño anotado, no medido:** el diccionario ronda las decenas de miles de entradas.
Vive solo en el adaptador driven, que es servidor, así que no llega al bundle del cliente; el
coste esperable es memoria y arranque en frío de la función serverless. Si al implementarlo el
peso resulta inaceptable, es material de pregunta al humano, no de decisión del implementer.

### 5.3 Por qué el puerto hace que esta pregunta no bloquee el resto

Todo lo que depende de la librería está detrás de `BreachedCredentialList`. Si el humano aprueba
otra cosa, o una lista propia, cambia **un archivo** (`adapters/driven/security/
breached-credential-list.ts`) y no cambia ningún requisito, ni el dominio, ni un test del
dominio: los tests del dominio usan un doble del puerto.

### 5.4 Alternativas descartadas

**(a) La API de Have I Been Pwned (`hibp`, o `fetch` con k-anonimato).** Es la lista más completa
que existe y no pesa nada en el repo. Se descarta: mete una **llamada de red en el camino de
fijar una contraseña**, y con ella una decisión imposible de ganar —si la API no responde, o
rechazas todas las contraseñas y el seed no puede correr, o aceptas cualquiera y R7 desaparece en
silencio justo cuando hace falta—. Además el gate corre sin red (`docs/verification.md`), así que
el test de R7 sería un mock y R7 no quedaría verificado de verdad en ningún sitio. Una regla de
dominio que depende de que un tercero esté vivo no es una regla de dominio.

**(b) El paquete original `zxcvbn` de Dropbox.** Trae la misma clase de diccionarios y es el más
conocido, pero está **sin mantenimiento desde hace años**: reventaría el check 2 (release en los
últimos 12 meses) y entraría, como mucho, por la excepción documentada. El port TypeScript
mantenido existe precisamente por eso.

**(c) Una lista propia en el repo (un `.txt` con las N más comunes).** Cero dependencias y cero
esperas al humano. Se descarta porque **contradice la tabla de decisiones cerradas** («la lista
de contraseñas filtradas **sí** viene de una librería, que no tiene sentido mantener a mano») y
porque es la lección de la feature 5 repetida: código nuestro que nadie va a actualizar.

**(d) Un esquema `zod` en la pantalla de cambio de contraseña.** Es lo más rápido de escribir y
lo que casi todo el mundo hace. Descartado por la tabla y con motivo: el seed no pasa por
ninguna pantalla, así que habría **dos** implementaciones de la misma regla desde el primer día
—y la del seed sería la que nadie testea—. La política vive en el dominio y el borde la llama
(**R16**).

**(e) Un servicio con la política como método de `verifyCredentials`.** Descartado: mezclaría
entrar con fijar. El login **no** debe evaluar la política (**R17**, fila «¿Y quien ya tiene una
contraseña que no cumple?»), y tenerlas en el mismo caso de uso es la forma más fácil de que un
día alguien la llame donde no toca.

## 6. Nombres: `credential`, no `password` (y no es cosmético)

`guard-password-never-plaintext` marca en rojo **todo identificador declarado** en `lib/`, `app/`,
`db/` o `scripts/` que tenga un segmento `password`/`pass`/`contrasena` y no termine en `hash`
(ni en uno de los sufijos de no-columna). Es decir: `PASSWORD_MIN_LENGTH`, `checkPassword` o un
parámetro llamado `password` **ponen el gate en rojo**.

Por eso: `CREDENTIAL_MIN_LENGTH`, `CREDENTIAL_RULES`, `credential-policy.ts`,
`evaluateCredentialRules`, `createCredentialPolicy`, `BreachedCredentialList`, y el parámetro se
llama `candidate`. Es la misma adaptación que hizo la feature 5 con `CREDENTIAL_MAX_LENGTH`
(`specs/5-.../design.md > 2`), y va en la misma dirección: **se adaptan los nombres, no se
relaja la guardia**. Los códigos de regla (`min_length`, `no_uppercase`…) son valores de cadena,
no identificadores declarados, y además ninguno contiene esos segmentos.

## 7. La costura de QC-6 (por contrato, no por sus internos)

QC-6 está `in_progress` en otra rama. Lo único que este diseño afirma sobre él es el **contrato
que tendrá que cumplir cuando aterrice**, y es el mismo para el seed, para un reseteo y para
cualquier alta futura:

> **Antes de llamar a `identity.passwordHasher.hash(...)`, se llama a
> `identity.checkCredentialPolicy(candidate)`. Si el resultado no es `ok`, no se hashea y no se
> escribe: se falla con las reglas incumplidas.**

Tres consecuencias operativas:

1. **Quien fije contraseñas importa la fachada** (`@/lib/composition`), no el dominio ni el
   adaptador. Un script de seed vive en `scripts/`, que está exento de la guardia de
   arquitectura, pero la fachada sigue siendo el camino correcto.
2. **La contraseña del usuario sembrado tiene que cumplir la política.** Si QC-6 la trae por
   variable de entorno, una que no cumpla hace fallar el seed con el detalle de qué le falta.
   Esto es consecuencia de R18, no un requisito nuevo sobre QC-6.
3. **La marca de «debe cambiar la contraseña» de `users` es de QC-6**, está fuera de esta ficha
   (bloque «Lo que NO entra») y este diseño no la lee ni la escribe.

**Quién lo hace cumplir: `tests/guards/guard-politica-de-contrasenas.test.ts` (R19).** Recorre el
árbol de `lib/`, `app/` y `scripts/` —no el grafo de imports, igual que las guardias
existentes— y por cada archivo que referencie `passwordHasher.hash`, `createPasswordHash` o el
puerto `PasswordHasher` exige que el mismo archivo referencie también
`checkCredentialPolicy`/`evaluateCredentialRules`. Exenciones explícitas y por ruta, como la
allowlist de `guard-password-never-plaintext`:

- `lib/modules/identity/adapters/driven/security/password-hash.ts` (es el hasher, no lo llama),
- `lib/composition/index.ts` (cablea ambos),
- `lib/modules/identity/domain/verify-credentials.ts` (verifica, no fija — **R17**).

**Lo que esta guardia NO demuestra, dicho aquí y no descubierto en la review:** que la llamada a
la política ocurra **antes** del hash, ni que se respete su resultado. Eso es orden y control de
flujo, y un barrido de texto no lo ve. Lo cubre el test de comportamiento del punto que fija la
contraseña — que hoy no existe porque QC-6 aún no ha aterrizado. La guardia atrapa el olvido
completo, que es el fallo realista; el reviewer de QC-6 tiene que mirar el orden a mano.

## 8. Contratos de entrada/salida

| Punto | Entrada | Salida |
| --- | --- | --- |
| `evaluateCredentialRules` | `candidate: string` | `{ ok, unmet }` — síncrono, sin `breached` |
| `createCredentialPolicy(deps)(candidate)` | `candidate: string` | `Promise<{ ok, unmet }>` — puede lanzar (R15) |
| `BreachedCredentialList.includes` | `candidate: string` | `Promise<boolean>` |
| Fachada `identity.checkCredentialPolicy` | `candidate: string` | `Promise<{ ok, unmet }>` |

`unmet` nunca contiene la candidata ni un fragmento (**R24**): son códigos del catálogo. El
mensaje que ve una persona lo compone la UI (QC-21) a partir del código; esta feature **no**
produce copy.

## 9. Datos, permisos y seguridad

- **Sin migración, sin tablas, sin columnas, sin RLS** (**R21**). `guard-rls-force` no cambia.
- **Sin permisos que validar**: la política no lee ni escribe datos de nadie; no hay
  autorización que ejercitar en un service.
- **Sin secretos ni configuración de entorno**: no hay nada que parametrizar por entorno. El
  mínimo (8) y el máximo (64) son constantes del dominio, no variables de entorno: cambiarlas es
  cambiar la política, y eso es una decisión, no una configuración.
- **Nada de `console.*` en el módulo de la política** (**R24**), en la misma línea que
  `guard-password-hash-module` para el hasher.

## 10. Verificación

Niveles, según `docs/verification.md`:

1. **Unitarios del dominio** — el grueso. Cada regla rechazada por separado, la combinación de
   varias, el caso aceptable, y el orden estable. Con un doble del puerto: sin librería, sin red.
2. **Unitario del adaptador** — que la lista real contiene un puñado de contraseñas notorias
   (`password`, `123456`) y no contiene una cadena aleatoria. Depende de la aprobación de `> 5`.
3. **Guardias** — `guard-politica-de-contrasenas` (R19, con fuentes sintéticas que la violan,
   como el resto de guardias del repo), más las cinco existentes en verde.
4. **E2E: NO.** La fila «¿Hace falta E2E?» de la tabla lo difiere **con motivo** a QC-21: la
   regla no tiene interfaz propia y un Playwright sin pantalla no ejercita nada.

**Regresión que hay que probar explícitamente (R17):** un usuario cuya contraseña guardada no
cumple la política **entra igual**. Es el caso que se olvida, porque el impulso natural al añadir
una política es aplicarla en todas partes.

## 11. Riesgos asumidos

- **`P4ssw0rd!` pasa.** Sin des-leetificación, variantes de contraseñas filtradas cuelan
  (`> 4`). Puntuar fuerza está fuera del alcance.
- **La lista envejece.** Se actualiza cuando se actualice la librería; no hay refresco
  automático y no lo habrá en esta ficha.
- **Un usuario existente con contraseña débil sigue débil** hasta que la cambie (**R17**, decidido
  en la tabla).
- **La guardia de R19 no comprueba el orden de las llamadas** (`> 7`).
