# Bitacora de implementacion — QC-19 politica-de-contrasenas

> Consolidado por el IMPLEMENTER el 2026-09-02, en el worktree
> `.worktrees/QC-19-politica-de-contrasenas` (rama `feature/QC-19-politica-de-contrasenas`).
> Dos tandas de `backend_dev`: T1-T4 (dominio, puerto, contrato, composicion) y T6-T8
> (adaptador, guardia, costura de R18 con QC-6, regresion de R17). T9 lo cierra esta bitacora.
>
> **Tasks cerradas: T0-T9 (10 de 10).** Ninguna queda a medias.
>
> **Ninguna credencial en claro aparece en este documento.** Los valores de prueba de los tests
> son marcadores evidentemente ficticios; la credencial de instalacion vive solo en `.env`.

## Que se construyo

Una politica de credenciales en el dominio del modulo `identity`, partida en dos a proposito
(`design.md > 2.1`): `evaluateCredentialRules` (pura y sincrona: longitud y composicion) y
`createCredentialPolicy` (lo anterior mas la lista de filtradas, que llega por un puerto).

## Archivos creados

| Archivo | Task |
| --- | --- |
| `lib/modules/identity/domain/credential-policy.ts` | T1, T3 |
| `lib/modules/identity/ports/breached-credential-list.ts` | T2 |
| `lib/modules/identity/adapters/driven/security/breached-credential-list.ts` | T6 |
| `tests/unit/identity/credential-policy.test.ts` | T1, T3 |
| `tests/unit/identity/credential-policy-contract.test.ts` | T4 |
| `tests/unit/identity/breached-credential-list.test.ts` | T6 |
| `tests/guards/guard-politica-de-contrasenas.test.ts` | T7 |
| `progress/impl_QC-19-politica-de-contrasenas.md` | T9 |

## Archivos modificados

| Archivo | Que cambio | Task |
| --- | --- | --- |
| `lib/modules/identity/index.ts` | 6 reexports nuevos, todos desde `./domain/credential-policy`. No exporta ni el puerto ni el adaptador | T4 |
| `lib/composition/index.ts` | cablea `breachedCredentialList`, crea **una sola** instancia `checkCredentialPolicy` y la usa en la fachada **y** en el seed | T4, T7 |
| `lib/modules/identity/domain/seed-initial-access.ts` | dep obligatoria `checkCredentialPolicy` y evaluacion **antes** del hash (**desviacion 1**) | T7 |
| `tests/unit/identity/seed/seed-initial-access.test.ts` | 10 sitios de llamada + doble de la politica + 1 caso nuevo de comportamiento de R18 | T7 |
| `tests/integration/identity/identity-seed.int.test.ts` | 15 sitios de llamada con la politica **real** (**desviacion 2**) | T7 |
| `tests/unit/identity/verify-credentials.test.ts` | 2 casos nuevos (R17). Ninguna asercion existente cambio | T8 |
| `docs/dependencias.md` | la fila de `@zxcvbn-ts/language-common` decia "Todavia NO instalada"; ahora dice el estado real | T6 |
| `specs/QC-19-politica-de-contrasenas/tasks.md` | casillas T0-T9 marcadas | T9 |
| `progress/current.md` | cuatro deudas de T9 | T9 |

**Lo que NO se toco**, como manda `tasks.md`: `db/schema.prisma`, `db/migrations/**`, `app/**`,
`components/**`, `lib/modules/identity/adapters/driving/**`, `domain/credentials.ts`, el codigo
de `domain/verify-credentials.ts`, `.env` y `.env.example`. Ninguna dependencia nueva
(`@zxcvbn-ts/language-common@4.1.3` ya estaba instalada y aprobada, commit `03412f8`).
Ninguna guardia existente se relajo ni gano exenciones.

## Mapa `R<n> -> test`

Abreviaturas: `policy` = `tests/unit/identity/credential-policy.test.ts`;
`contract` = `tests/unit/identity/credential-policy-contract.test.ts`;
`lista` = `tests/unit/identity/breached-credential-list.test.ts`;
`guardia` = `tests/guards/guard-politica-de-contrasenas.test.ts`;
`login` = `tests/unit/identity/verify-credentials.test.ts`;
`seed` = `tests/unit/identity/seed/seed-initial-access.test.ts`.

| R | Test |
| --- | --- |
| R1 | `policy` — "una candidata aceptable devuelve ok y ninguna regla incumplida"; `policy` — "una candidata rechazada dice que reglas incumple, no un generico" |
| R2 | `policy` — "menos de 8 caracteres incumple min_length" |
| R3 | `policy` — "sin mayuscula incumple no_uppercase, y la Ñ cuenta como mayuscula" |
| R4 | `policy` — "sin minuscula incumple no_lowercase, y la ñ cuenta como minuscula" |
| R5 | `policy` — "sin digito incumple no_digit" |
| R6 | `policy` — "sin simbolo incumple no_symbol, y el espacio cuenta como simbolo" |
| R7 | `policy` — "una candidata de la lista incumple breached aunque cumpla todo lo demas"; `policy` — "la comparacion con la lista no distingue mayusculas"; `lista` — "la lista real contiene password y 123456 y no una cadena aleatoria"; `lista` — "la comparacion del adaptador no distingue mayusculas" |
| R8 | `policy` — "devuelve todas las reglas incumplidas, no solo la primera"; `policy` — "el orden de las reglas incumplidas es el de CREDENTIAL_RULES" |
| R9 | `policy` — "una candidata aceptable devuelve unmet vacio" |
| R10 | `policy` — "no recorta espacios: ' Abc12! ' cuenta 8 caracteres y tiene simbolo" |
| R11 | `policy` — "mas de CREDENTIAL_MAX_LENGTH caracteres incumple max_length"; `contract` — "el maximo es la constante de credentials.ts, no un literal nuevo" |
| R12 | `policy` — "dos evaluaciones de la misma candidata devuelven el mismo resultado"; `guardia` — "el dominio de la politica no usa Date ni Math.random" |
| R13 | `policy` — "las reglas de longitud y composicion se evaluan sin puerto alguno" (llama sin dependencias y afirma que el retorno **no** es una promesa); `tests/guards/guard-arquitectura-modulos.test.ts` — bloque 4 |
| R14 | `policy` — "la lista se consulta por el puerto: con un doble que devuelve true, la candidata queda breached"; `guardia` — "ningun archivo de domain/ importa la libreria de la lista" |
| R15 | `policy` — "si el puerto lanza, el error se propaga y no se devuelve un resultado aceptable" (comprueba tambien que el mensaje no contiene la candidata) |
| R16 | `contract` — "el contrato del modulo exporta la politica y el catalogo"; `tests/guards/guard-arquitectura-modulos.test.ts` — bloque 6 (cierre transitivo del contrato) |
| R17 | `login` — "una contrasena guardada que no cumple la politica sigue autenticando"; `login` — "verifyCredentials no recibe ni llama a la politica" |
| R18 | `guardia` — "todo archivo que produce un hash referencia tambien la politica"; `guardia` — "la exencion es por ruta exacta: el mismo archivo en otra ruta sigue siendo hallazgo"; **y el test de comportamiento** `seed` — "si la politica rechaza la credencial de instalacion, no se hashea ni se escribe nada" |
| R19 | `guardia` — "la regla detecta un archivo sintetico que hashea sin evaluar la politica", mas la rotura manual del archivo real (abajo) |
| R20 | `contract` — "la politica no recibe historial: su unica entrada es la candidata"; `contract` — "no existe tabla ni columna de contrasenas anteriores en db/schema.prisma" |
| R21 | `contract` — "esta feature no anade migraciones ni columnas" |
| R22 | `contract` — "la politica no se referencia desde app/ ni desde ningun adaptador driving" |
| R23 | `contract` — "CREDENTIAL_RULES exporta los siete codigos estables y toda regla incumplida pertenece al catalogo" |
| R24 | `policy` — "el resultado no contiene la candidata ni un fragmento"; `guardia` — "el modulo de la politica no escribe en ningun canal de salida" |

**Ningun R<n> se queda sin test.** R18 gano ademas un test de **comportamiento** que el
`design.md > 7` no preveia (ver desviacion 1): el diseño lo dejaba en "el reviewer de QC-6 lo
mira a mano", y ahora el orden de las llamadas y el respeto al resultado estan verificados por
codigo, no por lectura.

## Desviaciones del diseño — declaradas, no escondidas

**1. La costura de QC-6 se implemento aqui, y toca `domain/seed-initial-access.ts`.**
`design.md > 7` y el bloque "Lo que NO se toca" de `tasks.md` se escribieron cuando **QC-6 no
estaba en la rama**. Esa premisa ya es falsa: QC-6 aterrizo en `dev` y `seed-initial-access.ts`
llamaba a `passwordHasher.hash(...)` sin evaluar la politica. Caida la premisa, R18 (evaluar la
politica **antes** de producir el hash) y R19 (el gate DEBE ponerse rojo si un archivo hashea sin
referenciarla) dejaban una sola salida honesta: implementar la costura. La alternativa —exentar
`seed-initial-access.ts` de la guardia— se descarto porque vaciaba R18 justo en el unico punto del
repo que hoy fija una contrasena.

Forma concreta: `SeedInitialAccessDeps` gana una dependencia **obligatoria** llamada
`checkCredentialPolicy` (mismo nombre que la clave de la fachada, para que la guardia la reconozca
con el token que manda el diseño); el dominio la llama antes de hashear y lanza con
`unmet.join(', ')` si el resultado no es aceptable, sin hashear y sin escribir nada. El mensaje
nombra reglas, nunca la credencial (R24). Precio pagado: 25 sitios de llamada en los tests de QC-6
tuvieron que recibir la dependencia que faltaba. **Ninguna asercion existente de QC-6 se
modifico**, solo se anadio la dependencia.

**2. Los tests de integracion del seed reciben la politica REAL, no un doble.**
Consecuencia obligada de (1). El marcador `FAKE_ADMIN_CREDENTIAL` de
`tests/integration/identity/identity-seed.int.test.ts` no tenia mayuscula y ahora la tiene; sigue
siendo un marcador evidentemente ficticio. Se prefirio la politica real porque un doble en
integracion habria dejado el cableado real sin ejercitar, que es justo lo que un test de
integracion viene a cubrir.

**3. La guardia detecta USO de hash, no declaracion del tipo.**
`design.md > 7` decia "por cada archivo que referencie `passwordHasher.hash`, `createPasswordHash`
o el puerto `PasswordHasher`". Tomado literal marcaba `ports/password-hasher.ts` y
`ports/initial-access-credentials.ts`, que solo **declaran** el contrato y no producen ningun hash;
exigirles referenciar la politica seria pedir que un contrato conozca a otro. El detector marca
llamadas (`.hash(`, `createPasswordHash(`), y el porque queda escrito en el propio archivo de la
guardia. Las **tres exenciones por ruta exacta** del diseño se mantienen tal cual, y un caso prueba
que son por ruta y no por nombre de archivo.

**4. El `toLowerCase()` de la comparacion vive en el dominio, no en el adaptador.**
`design.md > 4` dice "se compara `candidate.toLowerCase()`" sin fijar donde. En el dominio, la
garantia de R7 queda demostrada con un doble del puerto en vez de depender de que cada
implementacion futura la respete. El adaptador ademas normaliza su propio conjunto y su entrada,
defensivamente.

**5. `credential-policy.ts` importa el puerto con `import type`.**
`tasks.md > T1` decia "sin imports fuera del propio `domain/`", pero `design.md > 2.1` pone
`createCredentialPolicy` en ese mismo archivo con `BreachedCredentialList` en su firma. Es
`import type`: se borra al compilar, no arrastra nada al cliente, y el bloque 4 de
`guard-arquitectura-modulos` permite explicitamente `domain -> ports` del propio modulo.

**6. Dos tests donde `tasks.md` T8 pedia uno.** La propia tabla de trazabilidad listaba los dos
nombres; se escribieron los dos. El test del adaptador tiene tres casos, no uno.

**7. `contract` fija por nombre los 4 directorios actuales de `db/migrations/`.** Es lo que R21
pide, pero habra que actualizarlo cuando otra feature legitima anada una migracion tras el merge.
Queda dicho para el reviewer de la siguiente ficha que toque migraciones.

## La guardia muerde: rotura manual del archivo real

`docs/verification.md > Probar que muerde, no que pasa` exige romper el archivo real, no solo
pasar fuentes sinteticos. Copia de `lib/modules/identity/domain/seed-initial-access.ts` al
scratchpad (**fuera del repo**), quitadas la dependencia, la evaluacion y el `throw`
(`grep -c checkCredentialPolicy` da 0), y `pnpm exec vitest run tests/guards`:

```
 x |node| tests/guards/guard-politica-de-contrasenas.test.ts (9 tests | 1 failed) 61ms
     x todo archivo que produce un hash referencia tambien la politica 45ms

 FAIL  tests/guards/guard-politica-de-contrasenas.test.ts > guardia - politica de contrasenas
       > todo archivo que produce un hash referencia tambien la politica
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "lib/modules/identity/domain/seed-initial-access.ts: passwordHasher.hash(",
+ ]

 Test Files  1 failed | 5 passed (6)
      Tests  1 failed | 73 passed (74)
```

Restaurado con `cp` desde la copia —nunca con `git checkout`, como manda `docs/verification.md`—
(`grep -c` vuelve a 3) y re-corrido:

```
 Test Files  6 passed (6)
      Tests  74 passed (74)
   Duration  735ms
```

## El diccionario, medido (no estimado)

`node --expose-gc` sobre `@zxcvbn-ts/language-common@4.1.3`, clave `passwords-common`:

- **49 233 entradas**, y el tamano del conjunto en memoria es 49 233: no hay duplicados tras
  pasar a minusculas.
- `heapUsed` 6 880 000 B -> 8 585 872 B, con dos recolecciones a cada lado: **el conjunto cuesta
  1 705 872 B, unos 1,63 MiB** de memoria anadida sobre el arreglo que la carga del modulo ya trae.
- Comprobado en la misma medicion: `password` da `true`, `123456` da `true`, la cadena de control
  da `false`.

El riesgo de tamano que `design.md > 5.2` dejaba "anotado, no medido" queda **medido**: 1,63 MiB
en el proceso de servidor, nunca en el bundle del cliente (solo lo importa el adaptador driven).
No es material de pregunta al humano.

## Salida real del gate

### Gate completo — `./init.sh` sin flags, sobre el estado FINAL

```
== Arnes SDD :: init (modo: completo) ==
OK node v22.13.1
OK dependencias presentes
OK regla max-2-por-zona respetada (in_progress=0)
OK specs presentes para features sdd en vuelo
OK ninguna ficha sembrada esperando al board
OK cada spec sembrado tiene su ficha, con el mismo slug
OK typecheck paso
OK lint paso

 Test Files  41 passed (41)
      Tests  432 passed (432)
   Duration  20.84s

OK tests: sin rojos nuevos (41 archivos ejecutados, baseline vacio)
OK todas las migraciones tienen down.sql
OK .env presente
== init OK ==
```

Exit code **0**. Corrido el 2026-09-02 a las 11:01:40, **despues** del ultimo cambio: ninguna
casilla de esta bitacora se marco con una corrida vieja.

> Nota para el leader: esa corrida decia `in_progress=0` porque el `feature_list.json` de esta
> rama era todavia el que venia de `dev`, sin la contabilidad F2.0. **Resuelto**: tras el merge
> `1a7875e` (menor 1 de la review) el gate dice `in_progress=1`, que es lo correcto. Nunca fue
> un hallazgo de esta feature.

### Por niveles (corridas de las tandas, todas en verde)

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | sin salida, exit 0 |
| `pnpm run lint` | sin hallazgos, exit 0 |
| `pnpm exec vitest run tests/guards` | **6 archivos, 74 tests** en 714 ms |
| `pnpm exec vitest run tests/unit` | **29 archivos, 287 tests** en 13,78 s |
| `pnpm exec vitest run tests/integration` | **4 archivos, 65 tests** en 7,30 s |

Los de integracion de `identity` estan serializados en `vitest.config.mts` y se corrieron de uno
en uno: nunca dos procesos de vitest a la vez contra la base local.

## E2E: NO, y con motivo escrito

La fila "Hace falta E2E (Playwright)?" de la tabla de decisiones cerradas lo **difiere a QC-21**:
la politica no tiene interfaz propia y un Playwright sin pantalla no ejercita nada. No es un
olvido, es la decision del humano del 2026-09-01. `CHECKPOINTS.md` se recorre entero sin casilla
vacia salvo esa, que queda con su razon.

## Preguntas abiertas

**Ninguna.** Las tres de `requirements.md` estaban cerradas antes de la fase 2 (las dos de la
dependencia, por el humano al aprobar el spec). No aparecio ninguna nueva durante la
implementacion. Las cuatro deudas de T9 estan en `progress/current.md > Deudas`.

---

# Adenda post-review (2026-09-02)

El reviewer **aprobo QC-19 sin bloqueantes** (`progress/review_QC-19-politica-de-contrasenas.md`,
veredicto OK, 0 bloqueantes y 7 menores) y verifico por su cuenta que la guardia muerde, sin
apoyarse en esta bitacora. El menor 1 (la rama por detras de `dev`) lo cerro el leader con el
merge `1a7875e`. Los seis restantes se cierran aqui, **ninguno pasa a Deudas**.

| # | Menor | Como queda |
| --- | --- | --- |
| 2 | `design.md > 5` decia "PROPUESTA, no aprobada" | **Cerrado en el spec.** La seccion pasa a "Dependencia nueva: **APROBADA** el 2026-09-02" y abre citando la aprobacion (F1.4), la fila de `docs/dependencias.md`, el commit de instalacion `03412f8` y que `@zxcvbn-ts/core` no entro. Es lo que pide `CHECKPOINTS.md > Calidad de codigo` |
| 3 | Hueco de la guardia: `import { hash } from 'bcryptjs'` | **Cerrado en codigo**, no anotado como deuda |
| 4 | Riesgo operativo del seed en un entorno nuevo | **Anotado** en `progress/current.md > Deudas` |
| 5 | Estilo de dos tests nuevos | **Alineado** con los vecinos de cada directorio |
| 6 | Indentacion en `identity-seed.int.test.ts:418` | **Corregida** |
| 7 | El design anunciaba 4 exports y son 6 | **Cuadrado**: `design.md > 2` dice 6 |

## Menor 3: el hueco se cerro, y por que asi

**La forma exacta que evadia la guardia:** `import { hash } from 'bcryptjs'` seguido de
`hash(candidate, 10)`. Sin receptor, ni `<algo>.hash(` ni `createPasswordHash(` casaban, asi que
`findHashProductions` devolvia `[]` y el archivo no quedaba obligado a referenciar la politica.
El hueco lo heredaba la guardia del propio `design.md > 7`, que fijaba esos dos tokens.

**Se cierra por el IMPORT, no por la llamada.** Detectar un `hash(` pelado habria hecho la guardia
fragil —hay muchas cosas legitimamente llamadas `hash`—; detectar quien importa `bcryptjs` es
exacto, porque no se puede llamar a esa funcion sin importarla. El detector nuevo
(`findBcryptImports`) cubre `from '...'`, comillas dobles, `require('bcryptjs')`,
`import('bcryptjs')` y el import de efecto, casa el especificador completo o un subpath suyo, y
**no** casa `bcryptjs-suplantador`. Los comentarios los sigue quitando `stripComments`.

**La allowlist NO crece: sigue teniendo exactamente 3 rutas.** Verificado por `grep` antes de
tocar nada que el unico archivo de `lib/`, `app/` y `scripts/` que importa `bcryptjs` es
`adapters/driven/security/password-hash.ts`, que ya estaba exento por ruta exacta.

Aqui el criterio se **invierte** respecto a la desviacion 3 de mas arriba, y merece decirse: alli
se marca la invocacion y no la declaracion, porque un puerto declara sin producir; aqui se marca
la declaracion del import, porque importar `bcryptjs` **es** tener la capacidad de producir un
hash. Las dos vias conviven en `findHashProductions` con su porque escrito en el JSDoc.

**Prueba de mordida, dos veces y con el archivo real copiado a una ruta nueva** (`lib/tmp-prueba-guardia.ts`,
creado y borrado; sin residuos en `git status`):

```
+   "lib/tmp-prueba-guardia.ts: createPasswordHash(",
+   "lib/tmp-prueba-guardia.ts: import 'bcryptjs'",
 Test Files  1 failed | 5 passed (6)
      Tests  1 failed | 74 passed (75)
```

Y reducido a **la forma exacta que evadia** (`import { hash } from 'bcryptjs'` +
`return hash(candidate, 10)`, sin `createPasswordHash`), que antes de este cambio daba `[]`:

```
+   "lib/tmp-prueba-guardia.ts: import 'bcryptjs'",
```

Borrado el archivo, verde de vuelta: **6 archivos, 75 tests**.

**Lo que sigue siendo deuda y no cambia:** la guardia **no comprueba el ORDEN** de las llamadas.
Esa linea de `progress/current.md > Deudas` se queda tal cual, porque el hueco del orden sigue
abierto; lo que se cierra es el otro, el del import sin receptor.

## Menores 5 y 6: estilo, sin tocar ni una asercion

El repo esta genuinamente mixto (no hay Prettier), asi que el unico criterio disponible es "los
vecinos del directorio", y se aplico **en los dos sentidos**: `tests/unit/**` usa punto y coma y
los globals de vitest, y ahi se alinearon `credential-policy.test.ts` y
`credential-policy-contract.test.ts`; `tests/guards/**` usa lo contrario —sin punto y coma e
importando `{ describe, expect, it }`— en sus **cinco** archivos previos, y ahi se alineo
`guard-politica-de-contrasenas.test.ts`, que era el disidente. Ningun nombre de caso y ninguna
asercion cambiaron; el diff es cosmetico. La linea 418 de `identity-seed.int.test.ts` quedo
realineada, y se revisaron las otras 12 llamadas del archivo: ya estaban bien.

## Cero cambios de produccion

`git status -- lib app scripts db` sale **vacio**: los seis menores no tocaron ni un archivo de
produccion. Lo unico que cambio fuera de tests es documentacion (`design.md`, `current.md` y esta
bitacora).

## Gate completo tras los menores

```
== Arnes SDD :: init (modo: completo) ==
OK typecheck paso
OK lint paso

 Test Files  41 passed (41)
      Tests  433 passed (433)

OK tests: sin rojos nuevos (41 archivos ejecutados, baseline vacio)
OK todas las migraciones tienen down.sql
OK .env presente
== init OK ==
```

Exit code **0**. **433 tests, uno mas que los 432 de la review**: el caso nuevo que prueba que la
guardia ve al que importa `hash` de `bcryptjs` y lo llama sin receptor. Corrido despues del
ultimo cambio.
