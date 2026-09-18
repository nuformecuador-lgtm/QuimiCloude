# QC-108 — lectura-de-pdf-con-gemini · tasks.md

> `[P]` = paralelizable con las otras `[P]` de su misma tanda. Cada task declara **los archivos que
> toca** y su criterio de «hecho». Ninguna task se da por hecha sin `./init.sh --rapido` en verde; la
> feature no se cierra sin `./init.sh` completo (`docs/verification.md`). **El gate lo corre el
> leader**, no el implementer (`AGENTS.md > Regla del gate`).
>
> **Siete cosas que esta ficha NO hace, y son criterio de rechazo si aparecen** (`design.md > 10`):
> **(a)** nada bajo `app/**`, `components/**`, `app/api/**` ni `e2e/**` (R17, R19);
> **(b)** ningún adaptador **driving**, ninguna Server Action, ninguna ruta (R17);
> **(c)** ningún cambio en `db/schema.prisma`, ninguna migración, ningún `down.sql` (R20);
> **(d)** ninguna entrada nueva en `lib/modules/identity/domain/permissions.ts` (R18);
> **(e)** ni un carácter en `ports/pdf-converter.ts` ni en `pdf-converter-unpdf.ts` (R4);
> **(f)** ninguna dependencia instalada antes de **T0** (R25);
> **(g)** ningún texto de prompt escrito en el código ni ningún archivo de prompt (R2 — es QC-109).
> Si una task acaba pidiendo cualquiera de las siete, **se para y se anota**: es señal de que algo se
> diseñó mal.
>
> **Comentarios del código**: explican **el porqué**, y **no citan fichas, requisitos ni
> `design.md`**. Los identificadores `R<n>` van **solo en los nombres de los tests**, que es donde el
> reviewer los busca para el mapa de trazabilidad.

## Tanda 0 — las tres puertas que no se pueden saltar

- [x] **T0 — Cerrar la puerta F1.4. BLOQUEANTE de T4, T8 y T10.**
      Archivos: ninguno todavía; la respuesta se escribe en
      `progress/impl_QC-108-lectura-de-pdf-con-gemini.md`.
      **Tres respuestas humanas, las tres en la aprobación del spec:**
      1. **La OCTAVA enmienda al catálogo cerrado: `ai_unavailable`** (`design.md > 5`). Si es «no»,
         se aplica el **plan B de `design.md > 5.1`** —el fallo cae a `unexpected`, se pierde el matiz
         en QC-107 y en el log— y **T4 no se abre**.
      2. **La dependencia `@google/genai`** con los cuatro checks de `design.md > 8.2` y la fila ya
         redactada en `design.md > 8.2`. Sin «sí», **T8 no se empieza** y `package.json` no se toca.
      3. **El conflicto con QC-68 por `lib/composition/index.ts`** (`design.md > 7`): esperar (a),
         implementar todo menos el cableado (b), o aceptar el merge a mano (c). Sin respuesta, **T10
         no se abre**.
      Se anota además que el desconocido de `design.md > 8.3` —plazo, PDF e imagen en la API de
      `@google/genai`— sigue **abierto** hasta T8.
      **Hecho:** las tres respuestas escritas en `progress/impl_QC-108-*.md`, con fecha. Cubre la
      puerta de **R12** y el lado «nada antes de la aprobación» de **R25**.

## Tanda 1 — las piezas puras (nada aquí conoce al tercero)

- [x] **T1 [P] — La constante única del plazo.** Depende de T0 (solo para arrancar la tanda).
      Archivos: `lib/modules/documentos/domain/limits.ts` (**se amplía**, no se reescribe),
      `tests/unit/documentos/ai-limits.test.ts`.
      `AI_READ_TIMEOUT_SECONDS = 60`, en segundos como el resto de plazos del módulo, con docblock que
      diga **por qué 60 y por qué aquí** —una sola definición— y que **los reintentos no son de este
      módulo**. Ninguna otra constante se toca.
      **Hecho:** (a) el valor es 60; (b) barrido del árbol `lib/modules/documentos/**`: el número
      aparece **una sola vez** y los demás archivos lo **importan**; (c) `MAX_PDF_PAGES` y
      `PAGE_RENDER_DPI` siguen declarados una sola vez y **sin duplicar** en los archivos nuevos.
      Cubre **R7** y el lado «no se duplican los límites» de **R5**.

- [x] **T2 [P] — El esquema del borde de la lectura.** Depende de T0.
      Archivos: `lib/modules/documentos/domain/ai-read-input.ts`,
      `tests/unit/documentos/ai-read-input.test.ts`.
      `strictObject` (zod): `prompt` recortado y **no vacío**, `mode` literal `'pdf' | 'images'`,
      `path` no vacío, `bytes` `Uint8Array` no vacío. Tipo inferido exportado; **una sola** definición
      de la entrada.
      **Hecho:** tests de prompt vacío, prompt solo-espacios, prompt ausente, modo `'texto'`, modo
      ausente, campo desconocido y `bytes` vacío ⇒ todos rechazados. Cubre el lado entrada de **R2**,
      **R3** y **R23**.

- [x] **T3 [P] — El puerto `AiReader`.** Depende de T0.
      Archivos: `lib/modules/documentos/ports/ai-reader.ts`.
      Las firmas de `design.md > 3.1`: `AiDocumentPart` discriminado (`pdf` | `image`), `AiReadRequest`
      con `prompt`, `parts` y `timeoutMs`, y **un solo método** `read`. Docblock que diga que el puerto
      **no conoce modos** y que `timeoutMs` viaja para poder abortar, no para sustituir al plazo del
      dominio.
      **Hecho:** `pnpm run typecheck` en verde; el archivo **no importa nada** —ni `@google/genai`, ni
      `next/*`, ni `@prisma/client`, ni `lib/shared/**`, ni `lib/composition`—, verificado por
      `tests/guards/guard-arquitectura-modulos.test.ts`. Cubre el lado contrato de **R1** y **R21**.

- [x] **T4 — La OCTAVA enmienda y la clase de error.** Depende de **T0.1**.
      Archivos: `lib/modules/errores/domain/error-codes.ts`,
      `lib/modules/errores/domain/error-catalog.ts`, `tests/unit/errores/catalogo.test.ts`,
      `lib/modules/documentos/domain/errors.ts` (**se amplía**),
      `tests/unit/documentos/ai-errors.test.ts`.
      **Los cuatro puntos de `design.md > 0.3` van juntos o no va ninguno**: la entrada en
      `ERROR_CODES`; su clave en `ERROR_MESSAGE_KEY` **y** su texto en `ERROR_MESSAGES_ES`; el conteo
      literal `toHaveLength(46)` → **47**; y la cabecera de `error-codes.ts` con la **octava** enmienda,
      **sin borrar** la línea de la sexta que ya exige un test. Además, `AiUnavailableError` en
      `errors.ts`, sin `message` por parámetro, como sus dos hermanas.
      **SI T0.1 salió «no»:** esta task **no se hace**; en su lugar nace `AiReadError` con
      `code = 'unexpected'` en `errors.ts`, **el catálogo no se toca** y la pérdida se escribe en
      `progress/impl_*` (plan B, `design.md > 5.1`).
      **Hecho:** typecheck verde (los `satisfies` son el guardia real); `tests/unit/errores/catalogo.test.ts`
      y `tests/guards/guard-catalogo-de-errores.test.ts` en verde; test de que el texto de
      `ai_unavailable` es **distinto** del de `invalid_input` y del de `unexpected`; y de que un
      `AiUnavailableError` lleva `code` del catálogo y mensaje **del catálogo**, no propio.
      Cubre **R10, R11, R12**.

## Tanda 2 — el caso de uso

- [x] **T5 — La lectura: los dos modos y el texto tal cual.** Depende de T1, T2, T3 y T4.
      Archivos: `lib/modules/documentos/domain/read-pdf-with-ai.ts`,
      `tests/unit/documentos/read-pdf-with-ai.test.ts`.
      El orden **fijo** de `design.md > 1`: esquema → (si `images`) `countPages` y tope → `renderPages`
      con `PAGE_RENDER_DPI` → **una** llamada al puerto → discriminado. El `reason` con el mismo formato
      que `convert-pdf.ts`: **qué operación, sobre qué ruta, con qué causa**; nunca un `catch` vacío.
      **Hecho:** tests con dobles que **registran llamadas**: (a) modo `pdf` ⇒ **una** parte `pdf` y
      **cero** llamadas a `countPages`/`renderPages`; (b) modo `images` con 3 páginas ⇒ **tres** partes
      `image` en orden y el DPI **es el del módulo**; (c) 51 páginas ⇒ fallo con **cero** llamadas a
      `renderPages` **y cero al puerto de IA**; (d) 50 páginas ⇒ se lee; (e) el prompt que recibe el
      doble es **exactamente** el que entró, sin prefijos ni sufijos añadidos; (f) el texto devuelto es
      **idéntico** al del doble, incluidos saltos de línea y espacios iniciales; (g) prompt vacío o
      modo desconocido ⇒ rechazo **sin tocar ningún puerto**; (h) si el convertidor lanza, el fallo
      **nombra la operación y la ruta**.
      Cubre **R2, R3, R4, R5, R6, R8 (lado forma del fallo), R23**.

- [x] **T6 — El plazo de 60 s y los CERO reintentos.** Depende de T5.
      Archivos: `lib/modules/documentos/domain/read-pdf-with-ai.ts` (el `TimeoutRunner` y su valor por
      defecto), `tests/unit/documentos/ai-timeout.test.ts`.
      El `Promise.race` por defecto del dominio, con limpieza del temporizador, y el `TimeoutRunner`
      inyectable por `deps` (`design.md > 4`). **Ningún bucle, ningún reintento, ningún backoff.**
      **Hecho:** (a) con un `TimeoutRunner` que vence al instante ⇒ `{ ok: false, code }` con el código
      de T4 y **una sola** llamada al puerto; (b) con el `TimeoutRunner` **real**, un doble que nunca
      resuelve y `vi.useFakeTimers()` + `advanceTimersByTimeAsync(60_000)` ⇒ el mismo fallo, **sin
      esperar tiempo real**; (c) el plazo que se pasa al puerto sale de `AI_READ_TIMEOUT_SECONDS` y no
      de un número escrito ahí; (d) si el puerto lanza, **una** llamada y ningún reintento; (e) barrido:
      **ningún test de la ficha duerme** el plazo de verdad.
      Cubre **R7, R8, R9, R27**.

## Tanda 3 — los adaptadores driven (el único sitio que conoce al tercero)

- [x] **T7 [P] — Configuración perezosa y `.env.example`.** Depende de T3.
      Archivos: `lib/modules/documentos/adapters/driven/config/ai-config-env.ts`, `.env.example`
      (**bloque nuevo al final**), `tests/unit/documentos/ai-config.test.ts`.
      **Calcado** de `document-storage-config-env.ts`: los dos nombres viven **solo** como literales de
      un arreglo `as const`, se leen **dentro de una función**, vacío o solo-espacios cuenta como
      ausente, y el error **nombra** las que faltan **sin incluir jamás un valor**.
      **Hecho:** (a) **importar** el archivo con las dos variables vacías **no lanza**; (b) invocar sin
      configuración lanza **nombrando las dos**; (c) falta solo `GEMINI_MODEL` ⇒ lanza nombrándola y
      **no** cae a ningún modelo por defecto — test explícito de que **no existe** ninguna cadena de
      modelo escrita en el módulo; (d) el mensaje **no contiene** ningún valor de las variables;
      (e) `.env.example` declara las dos **vacías** y documentadas y el archivo sigue sin ningún
      secreto.
      Cubre **R13, R14, R15, R16**.

- [x] **T8 — Adaptador `@google/genai`.** Depende de **T0.2**, de T3 y de T7.
      Archivos: `lib/modules/documentos/adapters/driven/ai/ai-reader-genai.ts`, `package.json` y
      `pnpm-lock.yaml` (**solo** si T0.2 salió «sí»), `docs/dependencias.md` (una fila nueva, **la
      escribe el leader** en F1.4 con el texto ya redactado en `design.md > 8.2`),
      `tests/unit/documentos/ai-reader-adapter.test.ts`.
      **Empieza cerrando el desconocido de `design.md > 8.3`**: con el paquete ya instalado, se
      verifica **en sus declaraciones de tipos** —no de memoria— cómo se pide un **plazo máximo** y
      cómo viaja un **PDF** y una **imagen**, y se **anota lo encontrado** en
      `progress/impl_QC-108-*.md`. Si no admitiera abortar, se aplica `design.md > 3.1` y el límite se
      escribe en `progress/impl_*`; **no se finge**. Es el **único** archivo de producción que importa
      la librería, y lee su configuración **en cada invocación**.
      **Hecho:** typecheck y lint en verde; `tests/guards/guard-dependencias-aprobadas.test.ts` en
      verde **con la fila ya escrita** (si falta, el gate cae: es la guardia haciendo su trabajo);
      barrido del árbol de producción ⇒ **un solo** archivo importa `@google/genai`; **importar** este
      adaptador sin variables **no lanza**; **ningún test de este archivo toca la red**.
      Cubre **R22, R25** y el lado adaptador de **R26**.

## Tanda 4 — contrato y cableado

- [x] **T9 [P] — El barrel del módulo.** Depende de T5.
      Archivos: `lib/modules/documentos/index.ts` (**se amplía al final**),
      `tests/unit/documentos/module-contract.test.ts` (**se amplía** el de QC-106).
      Se exportan la **factory** `createReadPdfWithAi`, su `ReadPdfWithAiDeps`, el tipo de salida y la
      nueva clase de error; **nada** de `ports/` ni de `adapters/`, igual que el resto del barrel.
      **Hecho:** el barrel sigue siendo importable desde un componente de cliente —su cierre de imports
      **no** contiene `'use server'`, `@prisma/client`, `next/*`, `@supabase/storage-js`, `unpdf` ni
      `@google/genai`—; el test es **rojo** si alguien cuelga un adaptador del barrel.
      Cubre **R1 (publicación de la capacidad)** y **R21**.

- [x] **T10 — Cableado en el punto de composición.** Depende de **T0.3**, T5, T8 y T9.
      Archivos: `lib/composition/index.ts` (**bloque nuevo dentro del bloque `documentos` ya
      existente**, líneas 1083-1155; sus imports, al final del bloque de imports: **no se reordena ni
      se reformatea nada**).
      Se ata `AiReader` a su adaptador y se añade **una clave nueva al final** de la fachada
      `documentos`. `pdfConverter` **NO se vuelve a construir**: se reutiliza la constante que QC-106
      dejó cableada. **Ninguna función se invoca aquí**, solo se referencia.
      **ATENCIÓN — conflicto declarado con QC-68** (`design.md > 7`): este archivo está entre los que
      QC-68 marcó intocables. **Esta task no se empieza sin la respuesta T0.3.**
      **Hecho:** `tests/unit/composition/*` y la guardia de arquitectura en verde; importar
      `@/lib/composition` **con `GEMINI_API_KEY` y `GEMINI_MODEL` vacías sigue funcionando** — ese test
      es el que sostiene que la suite entera arranca sin claves.
      Cubre **R21** y el cierre de **R22** y **R26**.

## Tanda 5 — límites de la ficha y cierre

- [x] **T11 [P] — La guardia de alcance de esta ficha.** Depende de nada.
      Archivos: `tests/unit/documentos/qc108-alcance.test.ts` (nuevo; patrón de
      `tests/unit/documentos/qc106-alcance.test.ts`).
      Afirma contra el **diff de la rama** frente al merge-base con `origin/dev`: cero archivos bajo
      `app/**`, `components/**`, `e2e/**` y `db/**`; cero archivos nuevos en `adapters/driving/`;
      `permissions.ts` **idéntico** al de `dev`; y **`ports/pdf-converter.ts` y
      `pdf-converter-unpdf.ts` idénticos** a los de `dev` (R4). Si T0.1 salió «no», afirma además que
      `error-codes.ts` y `error-catalog.ts` están intactos; si T0.2 salió «no», que `package.json` está
      intacto.
      **Hecho:** el test en verde, y **rojo si alguien toca la pantalla, la base, los permisos o el
      puerto de conversión**. Cubre **R4 (lado «no se toca»), R17, R18, R19, R20, R24**.

- [x] **T12 [P] — El E2E diferido, escrito como deuda.** Depende de T11.
      Archivos: `progress/impl_QC-108-lectura-de-pdf-con-gemini.md`.
      Se escribe, con esas palabras, que **no hay E2E** porque la ficha no añade recorrido navegable, y
      que el destinatario es **QC-107**. Es **deuda con destinatario, no exención** de
      `CHECKPOINTS.md > Calidad de codigo`.
      **Hecho:** la nota escrita y citada desde el mapa de trazabilidad. Cubre **R19**.

- [x] **T13 — Trazabilidad y gate.** Depende de **todas**.
      Archivos: `progress/impl_QC-108-lectura-de-pdf-con-gemini.md`.
      El mapa `R1..R27 → test` completo, sin ningún requisito huérfano. Se escriben además: las **tres**
      respuestas de T0 tal como salieron; **cuál de los dos caminos de R12** se ejecutó (enmienda o plan
      B) y, si fue el plan B, **qué se perdió**; lo que T8 encontró sobre la API de `@google/genai`
      —plazo, PDF, imagen—, que hoy es **desconocido**; los siete límites de `design.md > 12`; y la
      salida real de `./init.sh` completo.
      **Hecho:** gate completo en verde, ningún archivo rojo fuera de `tests/baseline-rojos.json`.

## Mapa requisito → task (para que ninguno se quede sin dueño)

| R | Task que lo cubre |
|---|---|
| R1 | T3 (contrato), T9 (publicación) |
| R2 | T2 (esquema), T5 (el prompt llega intacto al puerto) |
| R3 | T2, T5 |
| R4 | T5 (usa el puerto existente), T11 (el puerto y su adaptador, intactos) |
| R5 | T1 (la constante no se duplica), T5 (rechazo sin renderizar ni llamar a la IA) |
| R6 | T5 (el texto sale idéntico) |
| R7 | T1, T6 |
| R8 | T5 (forma del fallo), T6 (plazo agotado) |
| R9 | T6 (una sola llamada, sin reintentos) |
| R10, R11, R12 | T4, y T0.1 como puerta; T13 escribe cuál camino se ejecutó |
| R13, R14 | T7 |
| R15, R16 | T7 |
| R17 | T11 |
| R18 | T11 |
| R19 | T11, T12 |
| R20 | T11 |
| R21 | T3, T9, T10 |
| R22 | T8 (único importador), T10 (no invoca nada al cablear) |
| R23 | T2, T5 |
| R24 | T11 y la revisión de `docs/conventions.md` en cada task |
| R25 | T0.2, T8 |
| R26 | T5, T6, T7, T8, T10 — y el hecho de que **ningún** test de la ficha use red |
| R27 | T6 |

**R24 no tiene un test dedicado, y se dice en vez de disimularlo**: «identificadores en inglés y sin
identificador de base» se comprueba por la ausencia —T11 afirma que no hay nada bajo `db/**`— y por
lectura del reviewer. No se inventa una guardia de nombres para esta ficha.

## Archivos que la implementación espera tocar

Para la validación de conflicto de F1.4. **`backend` está a 1 de 2 con QC-68**, que declaró intocables
`tests/integration/inventario/list-query-indexes.int.test.ts` y **`lib/composition/index.ts`**.

### Producción — NUEVOS (sin riesgo de conflicto)

| Ruta | Task |
|---|---|
| `lib/modules/documentos/domain/ai-read-input.ts` | T2 |
| `lib/modules/documentos/domain/read-pdf-with-ai.ts` | T5, T6 |
| `lib/modules/documentos/ports/ai-reader.ts` | T3 |
| `lib/modules/documentos/adapters/driven/ai/ai-reader-genai.ts` | T8 |
| `lib/modules/documentos/adapters/driven/config/ai-config-env.ts` | T7 |

### Producción — MODIFICADOS (aquí está el riesgo)

| Ruta | Task | Naturaleza del cambio |
|---|---|---|
| **`lib/composition/index.ts`** | **T10** | **CONFLICTO CON QC-68.** Una constante y **una clave nueva al final** de la fachada `documentos` (zona 1083-1155), más sus dos imports al final del bloque de imports. No reordena ni reformatea nada |
| `lib/modules/documentos/index.ts` | T9 | Bloque de exports **al final**; nada de lo existente se toca |
| `lib/modules/documentos/domain/errors.ts` | T4 | **+1 clase** al final |
| `lib/modules/documentos/domain/limits.ts` | T1 | **+1 constante** al final |
| `lib/modules/errores/domain/error-codes.ts` | T4 | **+1 entrada** y la cabecera de la octava enmienda. **Solo si T0.1 = sí.** Colisiona con **QC-92** (séptima enmienda) |
| `lib/modules/errores/domain/error-catalog.ts` | T4 | **+1 clave y +1 texto.** Solo si T0.1 = sí. Misma colisión con QC-92 |
| `.env.example` | T7 | **Bloque nuevo al final** |
| `package.json`, `pnpm-lock.yaml` | T8 | **Solo si T0.2 = sí.** Una entrada |
| `docs/dependencias.md` | T8 | **Una fila nueva, la escribe el leader** en F1.4 |

### Tests — NUEVOS

`tests/unit/documentos/ai-limits.test.ts`, `ai-read-input.test.ts`, `ai-errors.test.ts`,
`read-pdf-with-ai.test.ts`, `ai-timeout.test.ts`, `ai-config.test.ts`, `ai-reader-adapter.test.ts`,
`qc108-alcance.test.ts`.

### Tests — MODIFICADOS

| Ruta | Task | Naturaleza |
|---|---|---|
| `tests/unit/errores/catalogo.test.ts` | T4 | El conteo literal `46 → 47` y la cabecera de la octava enmienda. **Solo si T0.1 = sí.** **Colisiona con QC-92**: es la misma línea física |
| `tests/unit/documentos/module-contract.test.ts` | T9 | Se amplía con los símbolos nuevos del barrel |

### Progreso

`progress/impl_QC-108-lectura-de-pdf-con-gemini.md` (T0, T8, T12, T13).

### Lo que esta ficha NO toca, dicho para la validación

- `tests/integration/inventario/list-query-indexes.int.test.ts` — **intocable de QC-68, y no se toca.**
- `lib/modules/documentos/ports/pdf-converter.ts` y
  `lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts` — **intocables por R4.**
- `db/**`, `app/**`, `components/**`, `e2e/**`,
  `lib/modules/identity/domain/permissions.ts`.
