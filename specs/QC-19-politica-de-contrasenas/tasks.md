# QC-19 — politica-de-contrasenas · tasks

Reglas de esta lista:

- **Nada de esto se ejecuta todavía.** La fase 2 espera a que **QC-6** pase a `done` y a que el
  spec esté aprobado (`spec_ready` → aprobado, `docs/specs.md`). Todas las casillas nacen vacías.
- Ninguna task da por hecho nada de QC-6: no está en esta rama. La única relación con él es el
  contrato de `design.md > 7`, y quien lo cumple es él, no esta lista.
- El repo queda **compilando y en verde en cada task**: `./init.sh --rapido` al cerrar cada tanda;
  `./init.sh` completo antes del PR, sin excepción.
- `[P]` = paralelizable con las otras `[P]` de su bloque.
- **Los nombres no son libres:** `credential`, nunca `password`, en todo identificador declarado.
  El porqué está en `design.md > 6`. Si aparece un `PASSWORD_MIN_LENGTH`, el gate se pone rojo y
  la guardia **no** se toca.

## Archivos esperados

**Nuevos**

```
lib/modules/identity/domain/credential-policy.ts
lib/modules/identity/ports/breached-credential-list.ts
lib/modules/identity/adapters/driven/security/breached-credential-list.ts
tests/unit/identity/credential-policy.test.ts
tests/unit/identity/credential-policy-contract.test.ts
tests/unit/identity/breached-credential-list.test.ts
tests/guards/guard-politica-de-contrasenas.test.ts
progress/impl_QC-19-politica-de-contrasenas.md
```

**Modificados**

```
lib/modules/identity/index.ts               (4 exports nuevos, solo de ./domain)
lib/composition/index.ts                    (1 puerto cableado, 1 clave en la fachada)
package.json + docs/dependencias.md         (SOLO si T5 se aprueba, y en el MISMO cambio)
tests/unit/identity/verify-credentials.test.ts   (un caso nuevo, R17; nada más)
```

**Lo que NO se toca** (si aparece en el diff, es alcance inventado): `db/schema.prisma`,
`db/migrations/**`, `app/**`, `components/**`, `lib/modules/identity/adapters/driving/**`,
`domain/credentials.ts`, `domain/verify-credentials.ts` (el código; el test sí gana un caso), y
cualquier archivo que QC-6 vaya a traer.

---

## T0 — Preparar el worktree

- [x] `pnpm install --frozen-lockfile`, `pnpm exec prisma generate --schema db/schema.prisma`,
      `pnpm exec next typegen`, copiar `.env` (los worktrees no lo heredan; deuda conocida) con
      `DATABASE_URL` y `DIRECT_URL`.
- [x] Confirmar que **QC-6 está en `dev`**. Si no lo está, se para y se dice: esta ficha depende
      de él y el contrato de `design.md > 7` no se puede cerrar sin su punto de llamada.
- **Hecho cuando:** `./init.sh --rapido` sale verde **antes** de cambiar nada. Si está rojo de
  entrada, se para: no se construye sobre un gate roto.

## T1 — `domain/credential-policy.ts`: reglas propias, puras y síncronas

Depende de: T0.

- [x] `CREDENTIAL_MIN_LENGTH = 8`, `CREDENTIAL_RULES`, `CredentialRule`,
      `CredentialPolicyResult` y `evaluateCredentialRules(candidate)` según `design.md > 2.1`.
- [x] Regex por **categoría Unicode** (`design.md > 3`), no listas ASCII. `max_length` reutiliza
      `CREDENTIAL_MAX_LENGTH` de `domain/credentials.ts`; **no** declara un máximo nuevo.
- [x] Sin `trim()`, sin `normalize()`, sin `Date`, sin `Math.random`, sin imports fuera del
      propio `domain/`.
- [x] El resultado se ensambla recorriendo `CREDENTIAL_RULES` en orden declarado (R8).
- **Hecho cuando:** `tests/unit/identity/credential-policy.test.ts` pasa con los casos de la
  tabla de trazabilidad para **R2–R6, R8–R13**.

## T2 — Puerto `ports/breached-credential-list.ts`  `[P con T1]`

Depende de: T0.

- [x] `BreachedCredentialList` con `includes(candidate: string): Promise<boolean>`. Parámetro
      `candidate`, no `password` (`design.md > 6`).
- [x] Solo importa de su propio `domain/`. Nada de framework, Prisma ni la librería.
- **Hecho cuando:** `pnpm run typecheck` pasa y `pnpm exec vitest run guard` sigue verde.
  **Cubre R14 (parte).**

## T3 — `createCredentialPolicy`: reglas + lista, por puerto

Depende de: T1, T2.

- [x] `createCredentialPolicy({ breached })` en el mismo archivo del dominio: llama a
      `evaluateCredentialRules` y le suma `breached`. **No reimplementa ninguna regla.**
- [x] Comparación de la lista en minúsculas (`design.md > 4`).
- [x] Si el puerto lanza, el error se propaga con contexto y **sin incluir la candidata**.
- **Hecho cuando:** los casos de **R1, R7, R15 y R24** de la tabla pasan con un **doble** del
  puerto (sin librería y sin red).

## T4 — Contrato y composición

Depende de: T3.

- [x] `lib/modules/identity/index.ts` reexporta `CREDENTIAL_MIN_LENGTH`, `CREDENTIAL_RULES`,
      `evaluateCredentialRules`, `createCredentialPolicy` y los tipos. **Solo de `./domain`.**
- [x] `lib/composition/index.ts` cablea `breachedCredentialList` y añade
      `checkCredentialPolicy` a la fachada (`design.md > 2.3`). Ninguna clave existente cambia
      de nombre ni de firma.
- **Hecho cuando:** `tests/unit/identity/credential-policy-contract.test.ts` pasa (**R16, R20,
  R21, R22, R23**) y `guard-arquitectura-modulos` sigue verde, en especial el bloque 6 (el
  contrato no arrastra servidor).

## T5 — Dependencia de la lista: PARAR Y PREGUNTAR

Depende de: T2. **BLOQUEANTE para T6, y solo para T6.**

> **No se instala nada sin aprobación humana** (regla 7 de `CLAUDE.md`). El candidato y el estado
> de los cuatro checks están en `design.md > 5`: **los cuatro salen DESCONOCIDOS**, porque el
> spec se escribió sin red. Esto no es un trámite: la feature 5 llegó al PR con un algoritmo
> escrito a mano y hubo que rehacerla entera.

- [x] Con red: `npm view @zxcvbn-ts/language-common deprecated time.modified license version` y
      las descargas semanales. Anotar los **cuatro resultados reales**.
- [x] Llevar el resultado al humano y esperar respuesta. Si falla algún check o el humano prefiere
      otra cosa, **se para y se pregunta** — no se elige alternativa por cuenta propia
      (`requirements.md > Preguntas abiertas 2 y 3`).
- [x] Aprobada: `pnpm add <pkg>@<version>` **y** la fila en `docs/dependencias.md` con los cuatro
      checks y quién aprobó, **en el mismo cambio**. `guard-dependencias-aprobadas` es
      bidireccional: fila sin paquete es tan rojo como paquete sin fila (lección de QC-7 T11).
- **Hecho cuando:** `pnpm exec vitest run guard` pasa entero, o queda escrito en
  `progress/current.md` que la ficha está en HOLD esperando la decisión.

## T6 — Adaptador driven de la lista

Depende de: T5 (aprobada).

- [x] `adapters/driven/security/breached-credential-list.ts`: expone `isBreachedCredential` sobre
      el diccionario de la librería, cargado una sola vez (`Set` en el módulo, no por llamada).
- [x] Ni `console.*`, ni `process.stdout/stderr`. Único archivo del módulo que toca la librería.
- **Hecho cuando:** `tests/unit/identity/breached-credential-list.test.ts` pasa (**R7** contra la
  lista real) y se anota en `progress/impl_*.md` el **tamaño real** del diccionario en memoria,
  medido, no estimado (`design.md > 5.2`).

## T7 — Guardia `guard-politica-de-contrasenas`  `[P con T6]`

Depende de: T4.

- [x] `tests/guards/guard-politica-de-contrasenas.test.ts` según `design.md > 7`: barre el árbol
      de `lib/`, `app/` y `scripts/` y exige que todo archivo que produzca un hash referencie
      también la política. Exenciones por ruta exacta (`password-hash.ts`, `lib/composition/
      index.ts`, `verify-credentials.ts`), como la allowlist de `guard-password-never-plaintext`.
- [x] Añade la comprobación de canales de salida sobre `domain/credential-policy.ts` y el
      adaptador (**R24**), al estilo de `guard-password-hash-module`.
- [x] **Cada regla se autocomprueba sobre un fuente sintético que la viola.** Un
      `expect(...).toEqual([])` sobre archivos que ya cumplen no demuestra que la guardia muerda
      (`docs/gate.md > Probar que muerde, no que pasa`).
- **Hecho cuando:** la guardia pasa, y **falla de verdad** al inyectar a mano un archivo que
  hashea sin política (probado y restaurado desde copia, no con `git checkout`). **Cubre R18,
  R19.**

## T8 — La regresión que se olvida: el login no evalúa la política

Depende de: T4.

- [x] Añadir a `tests/unit/identity/verify-credentials.test.ts` **un** caso: un usuario cuyo hash
      corresponde a una contraseña que incumple la política autentica igual.
- [x] Afirmar que `createVerifyCredentials` **no** recibe ni llama a la política (sus deps siguen
      siendo `users`, `attempts`, `hasher`, `session`).
- [x] No se toca ninguna otra aserción del archivo ni el código de `verify-credentials.ts`.
- **Hecho cuando:** el archivo pasa entero y el diff se limita a ese caso. **Cubre R17.**

## T9 — Gate completo y trazabilidad (última)

Depende de: T1–T8.

- [x] `./init.sh` completo en verde, sobre el estado final (una casilla marcada con una corrida
      vieja es una casilla mentirosa).
- [x] `progress/impl_QC-19-politica-de-contrasenas.md` con la salida real y el mapa `R<n> → test`
      de la tabla de abajo.
- [x] Anotar en `progress/current.md > Deudas`: (a) `P4ssw0rd!` pasa, no hay des-leetificación;
      (b) la lista envejece con la librería y nadie la refresca; (c) la guardia de R19 no
      comprueba el **orden** de las llamadas — el reviewer de QC-6 lo mira a mano; (d) QC-21
      hereda pintar los mensajes a partir de `CREDENTIAL_RULES`.
- **Hecho cuando:** `CHECKPOINTS.md` se recorre entero sin casilla vacía, salvo el E2E, que queda
  con su razón escrita (diferido a QC-21 por decisión de la tabla, no por olvido).

---

## Trazabilidad `R<n> → test`

Abreviaturas: `policy` = `tests/unit/identity/credential-policy.test.ts`;
`contract` = `tests/unit/identity/credential-policy-contract.test.ts`;
`lista` = `tests/unit/identity/breached-credential-list.test.ts`;
`guardia` = `tests/guards/guard-politica-de-contrasenas.test.ts`.

| R | Test |
| --- | --- |
| R1 | `policy` — "una candidata aceptable devuelve ok y ninguna regla incumplida"; `policy` — "una candidata rechazada dice que reglas incumple, no un generico" |
| R2 | `policy` — "menos de 8 caracteres incumple min_length" |
| R3 | `policy` — "sin mayuscula incumple no_uppercase, y la Ñ cuenta como mayuscula" |
| R4 | `policy` — "sin minuscula incumple no_lowercase, y la ñ cuenta como minuscula" |
| R5 | `policy` — "sin digito incumple no_digit" |
| R6 | `policy` — "sin simbolo incumple no_symbol, y el espacio cuenta como simbolo" |
| R7 | `policy` — "una candidata de la lista incumple breached aunque cumpla todo lo demas"; `policy` — "la comparacion con la lista no distingue mayusculas"; `lista` — "la lista real contiene password y 123456 y no una cadena aleatoria" |
| R8 | `policy` — "devuelve todas las reglas incumplidas, no solo la primera"; `policy` — "el orden de las reglas incumplidas es el de CREDENTIAL_RULES" |
| R9 | `policy` — "una candidata aceptable devuelve unmet vacio" |
| R10 | `policy` — "no recorta espacios: ' Abc12! ' cuenta 8 caracteres y tiene simbolo" |
| R11 | `policy` — "mas de CREDENTIAL_MAX_LENGTH caracteres incumple max_length"; `contract` — "el maximo es la constante de credentials.ts, no un literal nuevo" |
| R12 | `policy` — "dos evaluaciones de la misma candidata devuelven el mismo resultado"; `guardia` — "el dominio de la politica no usa Date ni Math.random" |
| R13 | `policy` — "las reglas de longitud y composicion se evaluan sin puerto alguno" (llama a `evaluateCredentialRules` sin dependencias y comprueba que el retorno no es una promesa); `tests/guards/guard-arquitectura-modulos.test.ts` — bloque 4 (el dominio no importa hacia afuera) |
| R14 | `policy` — "la lista se consulta por el puerto: con un doble que devuelve true, la candidata queda breached"; `guardia` — "ningun archivo de domain/ importa la libreria de la lista" |
| R15 | `policy` — "si el puerto lanza, el error se propaga y no se devuelve un resultado aceptable" |
| R16 | `contract` — "el contrato del modulo exporta la politica y el catalogo"; `guard-arquitectura-modulos.test.ts` — bloque 6 (cierre transitivo del contrato, importable desde cliente) |
| R17 | `tests/unit/identity/verify-credentials.test.ts` — "una contrasena guardada que no cumple la politica sigue autenticando"; mismo archivo — "verifyCredentials no recibe ni llama a la politica" |
| R18 | `guardia` — "todo archivo que produce un hash referencia tambien la politica"; `guardia` — "la exencion es por ruta exacta: el mismo archivo en otra ruta sigue siendo hallazgo" |
| R19 | `guardia` — "la regla detecta un archivo sintetico que hashea sin evaluar la politica" (fuente sintético, más la rotura manual del archivo real anotada en `progress/impl_*.md`) |
| R20 | `contract` — "la politica no recibe historial: su unica entrada es la candidata"; `contract` — "no existe tabla ni columna de contrasenas anteriores en db/schema.prisma" |
| R21 | `contract` — "esta feature no anade migraciones ni columnas" (cuenta los directorios de `db/migrations/` y compara el modelo `User` con el esperado) |
| R22 | `contract` — "la politica no se referencia desde app/ ni desde ningun adaptador driving" |
| R23 | `contract` — "CREDENTIAL_RULES exporta los siete codigos estables y toda regla incumplida pertenece al catalogo" |
| R24 | `policy` — "el resultado no contiene la candidata ni un fragmento"; `guardia` — "el modulo de la politica no escribe en ningun canal de salida" |

> **Ningún `R<n>` se queda sin test, y ninguno se cubre solo con «lo mira el reviewer».** Los dos
> límites conocidos —el orden de las llamadas (R18/R19) y el tamaño real del diccionario— quedan
> escritos como deuda en T9, no disfrazados de casilla verde.
