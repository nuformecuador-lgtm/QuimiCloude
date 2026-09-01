# review_5-hash-y-verificacion-de-contrasena.md

> Revision de la version **bcrypt** (`bcryptjs`), la unica vigente. La version scrypt anterior
> fue retirada por decision humana: su ausencia **no** se cuenta como cobertura perdida.
> Revisado sobre el working tree sin commitear de `feature/5-hash-y-verificacion-de-contrasena`.
>
> `progress/review_2-hash-y-verificacion-de-contrasena.md` revisa la version scrypt ya
> inexistente. **No se toca aqui**; recomendacion: borrarlo (M8).

## Checklist

### Especificacion
- [x] `requirements.md` con R1-R10 en EARS.
- [x] `design.md` con alternativa descartada y su porque (paquete `bcrypt` nativo, por el binding
      por plataforma Windows/Vercel).
- [ ] **`tasks.md` con todas las tasks marcadas `[x]`** - las nueve (T1-T9) siguen en `[ ]`.

### Trazabilidad
- [x] Los 10 requisitos mapean a un test concreto, y los tests existen y **se ejecutaron** (no
      solo estan escritos). Corrido por mi:
      `npx vitest run tests/unit/password tests/unit/password-max-length.test.ts tests/unit/login-action.test.ts tests/guards`
      -> **7 archivos, 47 tests, todos verdes**.
- [x] `progress/impl_5-hash-y-verificacion-de-contrasena.md` contiene el mapa `R<n> -> test`, y
      ese mapa coincide con los nombres reales de los tests (comprobado uno a uno contra la
      salida `--reporter=verbose`).

| R | Test verificado (existe, nombra el comportamiento y pasa) |
| --- | --- |
| R1 | H - "el valor guardado no contiene la contrasena en claro" (`not.toContain` + prefijo `$2`) |
| R2 | H - "dos transformaciones ... dan valores distintos, y las dos verifican correctamente"; el segundo assert impide que pase una funcion que devuelva basura distinta cada vez |
| R3 | H - "verifica la contrasena correcta" (incluye espacios y acentos) |
| R4 | H - "rechaza la contrasena incorrecta" (primer caracter, ultimo, mayusculas, longitud) |
| R5 | F - 10 valores invalidos, cada uno afirmando `false` **y** que no lanzo, mas el caso de control valido |
| R6 | H - "el valor guardado declara 10 rondas" (extrae el segmento de coste del hash) |
| R7 | H - "el valor guardado son 60 caracteres ASCII con formato bcrypt" |
| R8 | G - guardia estatica sobre el fuente (con autocomprobacion) + H - "el error de longitud no incluye la contrasena en su mensaje" |
| R9 | H - 73 ASCII lanza, 40 acentuados (80 bytes) lanza, 72 bytes exactos pasa y verifica |
| R10 | L - 4 casos: 65 rechazados con `PASSWORD_TOO_LONG_ERROR`, cero llamadas a `verifyCredentials`, 64 aceptados, vacia sigue dando obligatorio |

### Borrado de la version scrypt (T1)
- [x] Los seis archivos viejos ya no existen; `tests/support/` desaparecio entero.
- [x] Busqueda en `lib/`, `app/`, `scripts/`, `db/`, `tests/` y `package.json` de
      `password-test-params`, `scrypt` (case-insensitive, cubre `DEFAULT_SCRYPT_PARAMS`,
      `ScryptCostParams`, `MAX_SCRYPT_MEMORY_BYTES`), `password-cost` y `pepper`:
      **cero coincidencias**. Ninguna referencia colgante.
- [x] `package.json` no arrastra ninguna dependencia de la version vieja.

### Alcance: nada reaparecido por la puerta de atras
- [x] Sin formato PHC propio: se usa la cadena estandar de bcrypt tal cual.
- [x] Sin parametros de coste configurables: `BCRYPT_ROUNDS = 10` es constante literal, no se lee
      de `process.env` ni de ningun argumento.
- [x] Sin techo de memoria, sin medicion de coste, sin rotacion de algoritmo, sin pepper.
- [x] 37 lineas con exactamente las dos funciones y las dos constantes de `design.md > 2`. Sin
      service, interfaz, repositorio, migraciones, RLS ni UI.

### Calidad de codigo
- [x] `npx tsc --noEmit` sin errores (corrido por mi).
- [x] `npx eslint` sin salida (corrido por mi).
- [x] Tests de la feature y vecinos en verde (corridos por mi). `./init.sh` completo lo corrio el
      humano: 13 suites, 121 tests, verde.
- [n/a] E2E Playwright: el repo **no tiene** Playwright (ni `playwright.config` ni `tests/e2e`) y
      esta feature no anade UI ni flujo navegable. Deuda del arnes anterior a esta tanda (M6).

### Datos, seguridad y capas
- [x] Sin tablas nuevas: no aplica RLS ni `FORCE ROW LEVEL SECURITY`.
- [x] Sin migraciones: no aplica `down.sql`. Sin webhooks: no aplica firma ni idempotencia.
- [x] Sin secretos hardcodeados y sin lectura de `process.env` en el modulo.
- [x] Sin hardcode de contexto: el unico valor discutible es el coste, y `design.md > 3` explica
      por que es constante (queda escrito dentro del hash; subirlo no invalida lo ya guardado).
- [x] Capas: `lib/utils/` es helper puro (`docs/architecture.md > Estructura de carpetas`), no
      conoce HTTP ni Prisma ni cookies; la Server Action sigue sin queries.
- [x] La guardia heredada `guard-password-never-plaintext` sigue verde **sin relajarse**: su
      allowlist y sus sufijos no se tocaron (`git diff` sobre ese archivo: sin cambios).

### Multiplataforma
- [n/a] La feature no toca UI: `lib/types/auth.ts` y `lib/actions/login.ts` son validacion de
      servidor. Sin CSS, sin componentes, sin librerias de UI nuevas.

### Dependencias
- [x] `bcryptjs@^3.0.3` en `dependencies` (correcto: corre en produccion), justificada en
      `design.md > 3` con su alternativa descartada, y trae sus propios tipos (por eso no se
      anade `@types/bcryptjs`).
- [n/a] `docs/dependencias.md` **no existe en esta rama**; esa regla vive en el arnes actualizado
      del arbol principal, aun sin mergear a `dev`. Hoy no es exigible aqui (M5).

---

## Verificaciones especificas pedidas

### 1. Calidad de los tests, no cantidad

- **Casos de control reales.** `password-verify-fail-closed.test.ts` tiene **dos** anclas contra
  una implementacion que devolviera siempre `false`: "la base de las variantes corruptas es un
  hash bcrypt valido" (que ademas evita que las variantes sean invalidas por el motivo
  equivocado) y el control final "un hash valido con su contrasena correcta sigue devolviendo
  true". Con `verify` degenerado a `return false` **caen los dos**. Correcto.
- **Cada invalido afirma dos cosas.** `try/catch` con `lanzo === false` ademas de
  `resultado === false`: no confunde "lanzo" con "dijo que no". Correcto.
- **Autocomprobacion de la guardia (T7).** Las dos reglas (`findOutputChannels`,
  `findBlockingCalls`) se ejercen contra fuentes sinteticos que **si** las violan
  (`console.log`, `console . error` con espacios, `process.stdout`, `process.stderr`, `hashSync`,
  `compareSync`, `genSaltSync`) afirmando que las detecta, y contra fuentes que no las violan
  (comentario que menciona console, `hash(...)`, `await compare(...)`) para que no sea un
  `toEqual([])` trivial. Es el patron de las guardias de la feature 1. Correcto.
- **Asserts contra constantes exportadas.** `password-hash.test.ts` usa `BCRYPT_ROUNDS` y
  `BCRYPT_MAX_INPUT_BYTES`; `password-max-length.test.ts` usa `CREDENTIAL_MAX_LENGTH`,
  `PASSWORD_TOO_LONG_ERROR` y `REQUIRED_FIELD_ERROR`, incluso en los nombres de los `it(...)`.
  Ni un literal de copy ni de longitud: justo lo que T8 exigia y lo que la feature 7 hizo mal.
  El unico literal, `expect(BCRYPT_ROUNDS).toBe(10)`, es deliberado y correcto: R6 dice **10**,
  asi que si alguien cambia la constante el test debe caer.

### 2. El limite de 72 bytes (R9, R8)

`createPasswordHash` mide `Buffer.byteLength(plaintext, 'utf8')` y lanza **antes** de llamar a
`hash`: bcrypt nunca llega a truncar. El test lo prueba por los tres lados que importan: 73 ASCII
lanza; 40 caracteres acentuados (`length` 40, **80 bytes**) lanza -el caso que distingue bytes de
caracteres y el que caeria si alguien usara `plaintext.length`-; y 72 bytes exactos **no** lanzan
y verifican correctamente (el borde no esta desplazado en uno).

El mensaje del error es "La contrasena excede el maximo de 72 bytes UTF-8 que admite bcrypt.":
no interpola `plaintext`. Y el test lo comprueba de verdad, con una contrasena de marca
(`secreto-irrepetible-...`) y `expect.not.stringContaining`, no leyendo el codigo. Correcto.

### 3. `verifyPasswordHash` falla cerrado (R5)

Dos piezas, como pedia `design.md > 6`: filtro previo de formato mas `try/catch`. Cubiertos y
verdes: cadena vacia, solo espacios, prefijo suelto, hash al que le falta un caracter, al que le
sobra uno, prefijo `$9z$10$`, texto suelto, caracter fuera del alfabeto, y `null`/`undefined`
colados con `as unknown as string`. Nunca lanza y nunca devuelve `true`. El `catch` sin cuerpo no
es un catch vacio de los que prohibe `docs/conventions.md`: devuelve el resultado negativo, que
**es** el manejo, y `design.md > 6` argumenta por que propagar seria un oraculo de enumeracion.

### 4. La regex de formato, puede rechazar un hash bcrypt legitimo?

`/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`. **No encuentro forma de que rechace un hash utilizable.**
Comprobado ejecutando el `bcryptjs` de este mismo `node_modules`:

- **Coste de un digito:** no existe en el formato; bcrypt lo escribe siempre con dos digitos
  (verificado generando hashes con coste 4, 6, 10 y 12: `$2b$04$`, `$2b$06$`, ...). `\d{2}` no
  descarta nada.
- **Variantes de prefijo:** `$2a$`, `$2b$` y `$2y$` pasan la regex **y** `compare` los acepta
  (verificado). El unico fuera es `$2x$`, que `bcryptjs` rechaza igualmente lanzando
  `Invalid salt revision: x$`: la regex solo convierte ese throw atrapado en un `false` limpio.
- **Longitud:** todos los hashes generados miden 60 (7 de prefijo + 53). `{53}` es exacto.
- **Alfabeto:** `[./A-Za-z0-9]` es el radix-64 completo de bcrypt.

Conclusion: la regex **no** convierte ningun login valido en un rechazo silencioso. Queda un
matiz teorico, sin efecto hoy, en M3.

### 5. La desviacion de nombre: `PASSWORD_MAX_LENGTH` -> `CREDENTIAL_MAX_LENGTH`

**Juicio: la resolucion es correcta.** Fundamento:

1. **El conflicto es real, no una excusa.** Verificado contra
   `tests/guards/guard-password-never-plaintext.test.ts`: `isPlaintextPasswordIdentifier`
   descompone `PASSWORD_MAX_LENGTH` en `[password, max, length]`; `password` esta en
   `FORBIDDEN_SEGMENTS`, el ultimo segmento es `length`, que no es `hash` ni figura en
   `NON_COLUMN_SUFFIXES` -> devuelve `true`. Y la allowlist de `lib/types/auth.ts` solo tolera el
   identificador `password` pelado. La guardia se habria puesto en rojo.
2. **Adaptar el nombre y no la guardia es el precedente que fija el propio spec.** `design.md > 2`
   resolvio identicamente `hashPassword`/`verifyPassword` -> `createPasswordHash`/
   `verifyPasswordHash`. Aplicar el mismo criterio es coherencia, no improvisacion.
3. **Las alternativas eran peores.** (a) Anadir `length` a `NON_COLUMN_SUFFIXES` relaja una
   guardia de seguridad heredada por comodidad de nombre, y el propio comentario de la guardia
   pide criterio estrecho para esa lista. (b) Meter `PASSWORD_MAX_LENGTH` en la allowlist es peor:
   esa lista es para contrasena **en transito**, y una constante de longitud no lo es; ensancharla
   erosiona la unica excepcion acotada que existe. (c) Tocar el spec hacia falta igual.
4. **Esta declarada, no tapada.** La bitacora explica el porque y como se comprobo, y
   `lib/types/auth.ts` lleva el motivo en su TSDoc, que es donde lo leera el siguiente. Cumple
   `CLAUDE.md > No inventes` y `docs/conventions.md` (nombres en UPPER_SNAKE para constantes).

Con una reserva menor (M2): `CREDENTIAL_MAX_LENGTH` es mas ancho que lo que hace -limita solo el
campo de contrasena, mientras que "credential" sugiere tambien `username`, que no tiene maximo-.
`SECRET_MAX_LENGTH` o `LOGIN_SECRET_MAX_LENGTH` habrian esquivado la guardia igual siendo mas
precisos. No es bloqueante: el TSDoc desambigua.

---

## Hallazgos

### BLOQUEANTE

- **B1 - `tasks.md`: las nueve tasks siguen sin marcar.**
  `specs/5-hash-y-verificacion-de-contrasena/tasks.md` tiene `### [ ] T1` ... `### [ ] T9`,
  ninguna en `[x]`. `CHECKPOINTS.md > Especificacion` lo exige literalmente ("todas las tasks
  estan marcadas `[x]`"), y es el unico registro en disco de que el trabajo se cerro task a task;
  la bitacora no lo sustituye (`CLAUDE.md > Estado en disco`). Es un hallazgo **documental**: el
  trabajo esta hecho y verificado, falta dejarlo escrito donde manda el arnes.
  **Para cumplirlo:** marcar T1-T9 como `[x]` en `tasks.md` y, en la misma pasada, resolver M1,
  que vive en ese mismo archivo. Sin tocar codigo.

### Menores

- **M1 - `tasks.md > T4` y `design.md > 5` siguen diciendo `PASSWORD_MAX_LENGTH`**, nombre que el
  codigo no usa (ni puede usar). La desviacion esta en la bitacora, pero spec y codigo divergen:
  quien lea `tasks.md` manana buscara una constante inexistente. Corregir en ambos con una linea
  de porque.
- **M2 - `CREDENTIAL_MAX_LENGTH` es mas ancho que lo que restringe** (solo la contrasena;
  `username` no tiene maximo). Correcto frente a la guardia, impreciso frente al dominio.
- **M3 - La regex excluye el prefijo `$2x$`.** Sin efecto operativo: `bcryptjs` tampoco lo acepta
  (lanza), el resultado final es el mismo `false`, y hoy el unico productor de hashes es este
  modulo. Anotado por si alguna vez se importan hashes de un PHP antiguo: entonces habria que
  decidirlo, no descubrirlo.
- **M4 - Fuga de temporizacion en `verifyPasswordHash`.** Un `storedHash` que no casa la regex
  devuelve `false` de inmediato, mientras que uno valido cuesta ~10^2 ms: por tiempo se distingue
  "usuario con hash utilizable" de "inexistente o con hash corrupto". Es el mismo oraculo de
  enumeracion que `design.md > 6` cerraba, por otro canal. No es de esta feature resolverlo (el
  mitigante estandar, comparar contra un hash senuelo, vive en el login, feature 4, que es quien
  sabe si el usuario existe), pero conviene anotarlo para esa feature.
- **M5 - `bcryptjs` no esta en ningun registro de dependencias.** `docs/dependencias.md` no existe
  en esta rama, asi que hoy no es exigible; la justificacion esta en `design.md > 3`. Al mergear
  contra el arnes actualizado del arbol principal habra que darle su fila.
- **M6 - Sin E2E del flujo de login.** `CHECKPOINTS.md > Calidad de codigo` lo pide para flujos
  criticos, pero el repo no tiene Playwright y esta feature no anade UI. Deuda del arnes anterior
  a esta tanda; no se le imputa, sigue abierta.
- **M7 - Encabezados de spec desactualizados.** Los tres archivos de
  `specs/5-hash-y-verificacion-de-contrasena/` siguen titulados "Feature 2" y citan
  `Branch: feature/2-...` y `depends_on: 1`; carpeta, rama y `feature_list.json` del arbol
  principal dicen 5 (`depends_on: QC-4`). Ademas el `feature_list.json` **de esta rama** conserva
  la numeracion vieja (su id 5 es `sesion-actual-y-logout`) porque la renumeracion por Jira vive
  sin commitear en el arbol principal. No es de la implementacion, pero hay que reconciliarlo al
  mergear o la trazabilidad feature-spec queda ambigua.
- **M8 - `progress/review_2-hash-y-verificacion-de-contrasena.md` sigue en disco** revisando una
  implementacion que ya no existe. No lo toco. Recomendacion: **borrarlo**; `impl_2-...md` ya se
  borro por la misma razon, y dejar solo la mitad reproduce el problema que ese borrado evitaba.

### Lo que explicitamente NO es un hallazgo

- La ausencia de formato PHC, parametros configurables, techo de memoria, medicion de coste,
  rotacion de algoritmo y pepper: salieron de la feature por decision humana del 2026-08-06.
- La ausencia de service, interfaz y repositorio: `design.md > 2` y `> 7` lo justifican (no hay
  nada que inyectar ni que mockear en un helper puro).
- El `catch` sin cuerpo de `verifyPasswordHash`: es manejo, no silencio.
- Que el `maxLength` no este en el input del formulario: es zona del FRONTEND_DEV, fuera del
  alcance declarado. R10 se cumple en el servidor, que es donde el requisito lo pide.

---

## Veredicto

**RECHAZADO** - por **B1 y solo por B1**.

Que quede claro el tamano de lo que falta. La implementacion es correcta; el recorte respecto a
la version scrypt es completo y limpio (cero referencias colgantes); los 10 requisitos tienen
test **ejecutado** en verde; los tests traen los casos de control y las autocomprobaciones que
los hacen capaces de fallar; los asserts van contra constantes exportadas; el limite de 72 bytes
se impone antes de que bcrypt trunque y sin filtrar la contrasena; la verificacion falla cerrada
en los diez casos; y la regex de formato no rechaza ningun hash utilizable. La desviacion de
nombre esta bien resuelta y bien argumentada.

Lo unico que falta es marcar T1-T9 como `[x]` en
`specs/5-hash-y-verificacion-de-contrasena/tasks.md` y, de paso, corregir alli y en
`design.md > 5` el nombre `PASSWORD_MAX_LENGTH` -> `CREDENTIAL_MAX_LENGTH` (M1). Vuelve al
implementer; con eso hecho, y sin tocar una linea de codigo, pasa a **OK**.
