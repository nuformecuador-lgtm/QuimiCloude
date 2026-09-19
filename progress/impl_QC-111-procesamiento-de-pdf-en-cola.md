# QC-111 — procesamiento-de-pdf-en-cola · bitacora de implementacion

> `tasks.md` nombra este archivo `progress/impl_QC-111.md`; el leader lo pidio con el nombre
> completo de la feature, que es el que usa el resto de `progress/`. Es el mismo archivo.

## T0 — Lo que se HEREDA montado y NO se vuelve a crear

Leido antes de escribir una sola linea. Nada de esta lista se reimplementa; esta ficha **anade**
dentro del modulo y solo toca dos de estos archivos, y solo para lo que T4 y T14 mandan.

| Pieza heredada | De | Que se consume | Que se toca aqui |
|---|---|---|---|
| Modulo `documentos` entero (`index.ts`, `domain/`, `ports/`, `adapters/`) y su bloque en `lib/composition/index.ts` | QC-106/108/109 | la estructura | se **anade** dentro; no se reestructura |
| `domain/actor.ts` — `Actor`, `requirePermission`, `DOCUMENT_UPLOAD_PERMISSION` | QC-106 | el permiso de la subida, reutilizado tal cual | nada |
| `domain/errors.ts` — `DocumentosError`, `UnauthorizedError`, `ValidationError`, `AiUnavailableError`, `UnexpectedError` | QC-106/108 | el catalogo cerrado | nada; **ningun codigo nuevo** |
| `domain/document-path.ts` — `buildDocumentPath`, `isPathInCompany` | QC-106 | el aislamiento por ruta | nada |
| `domain/limits.ts` — `MAX_FILES_PER_BATCH`, `MAX_PDF_PAGES`, `MAX_PDF_BYTES`, `AI_READ_TIMEOUT_SECONDS`, `MILLISECONDS_PER_SECOND` | QC-106/108 | los limites, importados; **ningun literal se reescribe** | nada |
| `domain/read-document.ts` — `createDownloadDocument` | QC-106 | unico camino para bajar bytes | nada |
| `domain/process-pdf-by-strategy.ts` — `createProcessPdfByStrategy` | QC-109 | recibe bytes, no recibe actor; su plazo, su tope de paginas y su registro viven dentro | nada |
| `domain/pdf-strategy.ts` — `pdfStrategySchema`, `PdfStrategy` | QC-109 | el enum cerrado | nada |
| `ports/document-storage.ts` — `createSignedUpload`, `createSignedReadUrl`, `download` | QC-106 | las tres operaciones | **gana `remove` en T4** y nada mas |
| `adapters/driven/storage/document-storage-supabase.ts` | QC-106 | el adaptador del bucket | solo el `remove` de T4 |
| `adapters/driven/ai/ai-reader-genai.ts` | QC-108 | la lectura con IA | nada |
| `adapters/driven/pdf/pdf-converter-unpdf.ts` | QC-106 | la conversion | nada |
| `lib/shared/request-scope.ts` (`runInRequestScope`) y el traductor de `@/lib/modules/errores` | QC-104 | los usa el driving, igual que `document-upload-actions.ts` | nada |
| Las dos variables del bucket privado en `.env.example` | QC-106 | ya declaradas | **no se duplican** |

## Estado de las tareas

Se va actualizando a medida que cierran. El detalle vive en `specs/QC-111-procesamiento-de-pdf-en-cola/tasks.md`.

## Archivos creados / modificados

**Nuevos, produccion** (todos del modulo `documentos` salvo el `route.ts`, que es del App Router):

- `domain/`: `batch-status.ts`, `enqueue-input.ts`, `queue-message.ts`, `failure-kind.ts`,
  `processing-timeouts.ts`, `enqueue-batch.ts`, `run-document-job.ts`, `get-batch-status.ts`
- `ports/`: `document-batch-repository.ts`, `processing-queue.ts`, `queue-signature.ts`,
  `processing-config.ts`
- `adapters/driven/`: `queue/queue-signature-qstash.ts`, `queue/processing-queue-qstash.ts`,
  `config/processing-config-env.ts`, `persistence/document-batch-repository-prisma.ts`
- `adapters/driving/`: `document-batch-actions.ts`, `document-job-route.ts`
- `app/api/documentos/trabajos/route.ts` — **el primer archivo de `app/api/` del repo**
- `db/migrations/20260918130000_document_batches_and_files/` — `migration.sql` y `down.sql`

**Existentes que se tocan, y solo para lo que la ficha manda:**

| Archivo | Que cambia |
|---|---|
| `db/schema.prisma` | dos enums y dos modelos **al final**, sin reordenar nada |
| `ports/document-storage.ts` | gana `remove`, y su cabecera deja de decir que ninguna operacion borra: esta es la ficha que lo levanta |
| `adapters/driven/storage/document-storage-supabase.ts` | implementa `remove` |
| `lib/modules/documentos/index.ts` | publica las tres fabricas nuevas y sus tipos; ni puertos ni adaptadores |
| `lib/composition/index.ts` | ata los cuatro puertos nuevos **dentro** del bloque `documentos` que ya existia |
| `.env.example` | bloque nuevo al final con las seis variables, vacias |

**Censos de otras fichas que esta tanda dejo rojos.** No son cambios de alcance: son la deuda de
mantenimiento que cada ficha paga, y las propias listas dicen que la actualiza la ficha nueva.

| Archivo | Que se actualizo |
|---|---|
| `tests/integration/aislamiento.json` | censo del test de integracion nuevo |
| `tests/guards/guard-identificador-de-request.test.ts` | la migracion nueva en `MIGRACIONES_ESPERADAS`; `DEPENDENCIAS_ESPERADAS` de 34 a 35 por `@upstash/qstash` |
| `tests/unit/identity/schema/identity-schema.test.ts` | **acotamiento por NOMBRE** de `expectDocumentTypeIsNotAnEnum`, que rechazaba `/documen/i` y mordia a `DocumentStrategy` sin que ese enum sea el tipo de documento de identidad. **La comprobacion por CONTENIDO contra `DOCUMENT_TYPE_CODES` queda intacta**, y un caso nuevo demuestra que `DocumentType`, `TipoDocumento` y `DocumentTypeCode` siguen mordiendo. Es el **segundo** acotamiento de esa funcion; el primero lo hizo QC-33 el 2026-09-03 por el mismo motivo |
| `tests/unit/documentos/limits-and-path.test.ts` | el barrido «ningun archivo repite un valor de `limits.ts`» exime a `processing-timeouts.ts` **solo** para `READ_LINK_TTL_SECONDS`: el plazo por defecto de 900 s coincide en valor sin ser el mismo limite, y `design.md > 7` ya anotaba la coincidencia como no causal |
| `tests/unit/documentos/storage-config.test.ts` | el caso que afirmaba «el puerto NO expresa borrado» —verdad de QC-106— pasa a comprobar que `remove` existe, que es la verdad de esta ficha |

## Lo que T8 verifico contra el paquete instalado

> **Restaurada el 2026-09-19** (menor 6 de la review). Esta seccion la escribio el commit
> `27a7b525` y una reescritura posterior del archivo se la llevo por delante. Importa porque es el
> unico DESCONOCIDO de la ficha que puede impedir que funcione en produccion sin que ningun test lo
> note: todos doblan esa cabecera.

`@upstash/qstash@2.11.3`, leido en
`node_modules/.pnpm/@upstash+qstash@2.11.3/node_modules/@upstash/qstash/client-CsnfJpnA.d.ts`.
No de memoria y no de la documentacion: del paquete, como hizo QC-108 con `@google/genai`.

| Lo que `design.md > 8` dejaba abierto | Lo que dice el paquete | Veredicto |
|---|---|---|
| La firma real de `Receiver.verify` | `verify(request: VerifyRequest): Promise<boolean>`, con `VerifyRequest = { signature: string; body: string; url?: string; clockTolerance?: number; upstashRegion?: string }` | **coincide** |
| Como se construye el `Receiver` | `new Receiver({ currentSigningKey?, nextSigningKey?, devMode? })` — las **dos** claves vivas a la vez, que es la rotacion que el diseno describe | **coincide** |
| Nombre de la cabecera de la **firma** | **`upstash-signature`**, escrito en el propio tipo `VerifyRequest` | **cerrado** |
| La opcion del tope de reintentos al publicar | `retries?: number` en `PublishRequest`; `publishJSON` devuelve `{ messageId, url }` | **coincide** |
| Nombre de la cabecera del **identificador de mensaje** | **NO APARECE EN EL PAQUETE.** El SDK no lee esa cabecera en ningun punto: no esta en los tipos, ni en el bundle, ni en el README | **SIGUE ABIERTO** |

**Un matiz que el diseno no preveia y que el adaptador absorbe.** `Receiver.verify` **lanza
`SignatureError`** cuando la firma es invalida; **no devuelve `false`**. El puerto `QueueSignature`
promete `Promise<boolean>` y «nunca lanza por una firma mala», asi que el adaptador captura y
devuelve `false`. No es una desviacion del diseno: es exactamente el sitio donde el diseno dijo que
se reconciliaria («quien conoce el nombre real es su adaptador»).

**El DESCONOCIDO que NO se pudo cerrar, y se dice en vez de rellenarlo.** `design.md > 8` mandaba
verificar el nombre de la cabecera del identificador de mensaje **contra el paquete instalado**. El
paquete no lo contiene, porque el SDK nunca lee esa cabecera: la manda el servidor de QStash al
webhook y el cliente no la modela. Este worktree no tiene acceso a la documentacion del proveedor,
asi que **no se puede cerrar aqui**. Se implementa en una sola constante con el valor convencional
`upstash-message-id`, `messageIdOf` la busca sin distinguir mayusculas y devuelve `null` si no
viene. **Queda elevado al leader**, no dado por cerrado.

**Alcance del fallo si el nombre fuera otro, medido y no supuesto:** `messageIdOf` devolveria
`null` siempre; el `claim` sigue siendo atomico y la idempotencia sigue en pie, porque su candado es
`status='queued'` y no el identificador. Lo unico que se perderia en silencio es la proteccion
secundaria de `queue_message_id` —«un mensaje viejo sobre una fila re-encolada no la reclama»—.
Es degradacion silenciosa, y por eso se eleva.

**Correccion a ese alcance, medida el 2026-09-19 sobre el codigo de la ruta.** Es PEOR que lo que
decia el parrafo de arriba: sin identificador de mensaje la ruta responde **400** —R9, sin id no hay
candado que reclamar— asi que **ninguna entrega se procesaria**, no solo se perderia la proteccion
secundaria. No es degradacion silenciosa parcial: es la ficha entera parada. Sigue sin cerrarse con
un supuesto; se eleva como **pregunta abierta con dueno** junto a la de `@napi-rs/canvas`.

## Mapa R1..R27 -> test

Los 27 tienen test nombrado. **Ninguno huerfano.** El `R<n>` va en el nombre del caso, que es el
enlace de trazabilidad. Los nombres de abajo son literales.

| R | Que promete | Test |
|---|---|---|
| R1 | fila de tanda y fila por PDF, ninguna de otra empresa | `qc111-alcance` «R1/R21: DocumentBatch y DocumentFile declaran companyId» y «R1: la FK de document_files hacia su tanda es compuesta»; `document-batch-repository-prisma` «R1 — inserta la tanda y un archivo por ruta»; **integracion** «la FK compuesta rechaza un archivo cuya tanda es de otra empresa» |
| R2 | estrategia **por tanda**, nunca por archivo | `qc111-alcance` «R2: strategy en DocumentBatch y NO en DocumentFile» y «R2: ningun tipo nuevo permite una estrategia por archivo»; `enqueue-batch` «R2 — la estrategia se pasa una sola vez» |
| R3 | permiso **en el service y primero**, sin escribir ni publicar | `enqueue-batch` «R3 — sin permiso rechaza sin escribir fila y sin publicar» y «R3 — el actor ausente rechaza igual» |
| R4 | zod: enum, 1..10 rutas, cada ruta bajo la empresa | `enqueue-input` (7 casos R4, incluido el del tope con la constante y no el literal); `enqueue-batch` «R4 — una ruta de otra empresa rechaza la tanda ENTERA», «R4 — once rutas», «R4 — una estrategia fuera del enum» |
| R5 | **escribe primero, publica despues** | `enqueue-batch` «R5 — el caso bueno ESCRIBE PRIMERO y PUBLICA DESPUES, en ese orden» |
| R6 | publicacion fallida deja la fila en cola, sin otro camino | `enqueue-batch` «R6 — si publicar el archivo 2 de 3 revienta, los otros dos siguen su curso» |
| R7 | Route Handler, y **firma antes de interpretar el cuerpo**; 401 sin efectos | `document-job-route` «R7 — firma invalida: 401 y CERO efectos» y «R7 — firma ausente»; `qc111-alcance` «R7: verify( aparece antes que safeParse(/JSON.parse(» + su detector |
| R8 | el webhook **no** mira permiso, cookie ni actor | `qc111-alcance` «R8: ni document-job-route.ts ni app/api/... nombran nada de sesion» + su detector |
| R9 | zod del cuerpo; resultado **definitivo** si no encaja | `document-job-route` «R9 — cuerpo que no pasa zod: 400 y cero efectos» y «R9 — cuerpo que ni siquiera es JSON» |
| R10 | mismo mensaje dos veces = **una** vez | `document-job-route` «R10 — el mismo mensaje dos veces: una sola llamada a la IA, un solo texto guardado, 200 las dos veces»; `run-document-job` «R10 — un claim que devuelve null» y «R10 — dos claim seguidos»; `document-batch-repository-prisma` «R10 — devuelve null cuando el UPDATE no reclamo ninguna fila» |
| R11 | empresa **de la fila**, nunca del cuerpo | `run-document-job` «R11 — el ambito con el que se descarga no lleva ningun permiso concedido» y «R11 — la descarga falla (bucket caido)» |
| R12 | **ningun** paso de recorte de imagenes | `qc111-alcance` (4 casos R12: `ports/`, `run-document-job`, el esquema y el detector); `run-document-job` «R12 — la estrategia que llega al procesamiento es la de la TANDA» |
| R13 | el texto de la IA **tal cual** | `run-document-job` «R13 — el exito guarda el texto TAL CUAL y llama a remove»; `document-batch-repository-prisma` «R13 — done: guarda el texto tal cual y limpia error» |
| R14 | borra **solo** al terminar bien | `document-storage-remove` (3 casos R14); `run-document-job` «R13 — … y llama a remove», «R15 — … NO llama a remove», «R16 — … NO llama a remove» |
| R15 | fallo de IA o almacenamiento -> reintentable, tope de configuracion | `failure-kind` «R15 — la descarga del bucket es reintentable» y «R15 — ai_unavailable … es reintentable»; `run-document-job` «R15 — fallo ai_unavailable deja la fila re-encolable»; `document-job-route` «R15 — fallo REINTENTABLE responde 500»; `processing-queue-qstash` «el tope … es el de la CONFIGURACION, no un literal» |
| R16 | fallo del archivo -> **error a la primera** | `failure-kind` (3 casos R16); `run-document-job` «R16 — fallo unexpected deja error a la primera»; `document-job-route` «R16 — fallo DEFINITIVO responde 200: le dice a la cola que no reintente» |
| R17 | agotado el tope, la fila **no** se queda en cola | `document-batch-repository-prisma` «R17 — pasa a error lo que lleva demasiado en queued/processing» y «R17 — requeue: vuelve a queued LIMPIANDO code y reason»; `qc111-alcance` «R17/R19: app/api/ contiene exactamente un route.ts» |
| R18 | consulta con permiso y por empresa; otra empresa = inexistente | `get-batch-status` «R18 — sin permiso rechaza» y «R18 — una tanda de OTRA empresa da EXACTAMENTE el mismo rechazo que una inexistente»; `document-batch-repository-prisma` «R18 — sin fila de tanda visible en la empresa, devuelve null» |
| R19 | caducidad al consultar, plazo de entorno, **sin cron** | `get-batch-status` (4 casos R19, incluidos «QUEDA GUARDADA» y «el plazo sale de la configuracion inyectada»); `qc111-alcance` «R19: no hay ningun vercel.json … con crons» y «R19: ningun archivo nuevo declara un calendario» |
| R20 | las filas se **conservan**, sin borrado fisico | `qc111-alcance` «R20: … no ejecuta delete, deleteMany, DELETE FROM ni TRUNCATE sobre las dos tablas» + su detector + «R20: DocumentBatch y DocumentFile no declaran deleted_at» |
| R21 | empresa, RLS **forzado**, `down.sql`, rechazo cruzado | `qc111-alcance` «R21: la migracion activa ENABLE y FORCE ROW LEVEL SECURITY para las dos tablas» y «R21: la migracion trae su down.sql»; `guard-rls-force`; `guard-empresa-en-esquema`; **integracion** «la FK compuesta rechaza un archivo cuya tanda es de otra empresa» |
| R22 | **ningun** codigo de error nuevo | `qc111-alcance` «R22: domain/errors.ts sigue declarando exactamente las cinco clases que ya tenia» y «R22: failure-kind.ts y run-document-job.ts solo nombran codigos del catalogo cerrado»; `guard-catalogo-de-errores` |
| R23 | entorno, vacio y documentado, leido **en la invocacion** | `processing-config-env` (6 casos R23, incluidos «falla NOMBRANDOLA» y «nunca incluye el VALOR de una variable») |
| R24 | modulo, puertos nuevos, cableado solo en composicion | `qc111-alcance` «R24: domain/ y ports/ … no importan @upstash/qstash, next/* ni @prisma/client» + detector + «R24: el cableado … solo aparece en lib/composition»; `guard-arquitectura-modulos`; `module-contract` |
| R25 | **solo** `@upstash/qstash`, aprobada y con su fila | `qc111-alcance` «R25: la unica dependencia nueva respecto de dev es @upstash/qstash», «R25: @upstash/redis no esta en package.json», «R25: docs/dependencias.md trae la fila … aprobada» + detector; `guard-dependencias-aprobadas` |
| R26 | integracion sobre la ruta; **ningun test toca la red** | `document-job-route` (8 casos, todos con dobles); `qc111-alcance` «R26: ningun archivo … llama a fetch( ni importa @upstash/qstash fuera de un vi.mock» + detector |
| R27 | **ningun** E2E en esta ficha | `qc111-alcance` «R27: el diff de la rama no trae ningun .spec.ts nuevo bajo e2e/» + detector |

## Salida de los tests

Lo que **si** se corrio, en esta rama y sobre este arbol:

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida: verde)

$ pnpm run lint
> eslint
(sin salida: verde)

$ pnpm exec vitest run tests/unit/documentos \
      tests/unit/identity/session-once-per-request-actions.test.ts \
      tests/unit/identity/schema/identity-schema.test.ts \
      tests/guards

 Test Files  76 passed (76)
      Tests  954 passed | 23 skipped (977)
   Duration  16.71s
```

Los 23 `skipped` son los `qcXXX-alcance.test.ts` de **otras** fichas, que se saltan fuera de su rama
a proposito. El de esta, `qc111-alcance.test.ts`, **midio de verdad**: 35 casos, 35 en verde.

**Con base de datos ya disponible** (el `.env` lo puso el leader; era deuda del arnes):

```
$ pnpm exec vitest run --project integration tests/integration/documentos
 Test Files  2 passed (2)
      Tests  6 passed (6)          <- los 4 de T3 y los 2 de la concurrencia de T17

$ pnpm exec vitest run tests/guards tests/unit/documentos
 Test Files  74 passed (74)
      Tests  886 passed | 23 skipped (909)

$ pnpm run db:test template
 plantilla de esta rama: qct_tpl_b6f834eb0913 (37 migraciones)
```

**No se corrio `./init.sh` ni la suite completa**, por el reparto del gate de
`AGENTS.md > Regla del gate`: eso es del leader.

## La migracion no aplicaba, y el orden lo mandaba mal el diseno

El gate la encontro: **42830**, «no hay restriccion unique que coincida con las columnas dadas en la
tabla referida `document_batches`». La FK compuesta de `document_files` se declaraba **cinco lineas
antes** de crear `document_batches_id_company_id_key`, y Postgres exige que la restriccion unica a la
que apunta una FK ya exista al declararla.

**El `migration.sql` transcribia fielmente el diseno: el orden malo es del diseno.**
`design.md > 2.5` dice, literal, «FK **compuesta** `document_files (batch_id, company_id)` →
`document_batches (id, company_id)` → **indices**». Ese orden es imposible en Postgres.
**El `design.md` sigue diciendolo y corregirlo no es del implementer.**

Arreglado moviendo el `CREATE UNIQUE INDEX` **antes** de la FK. Un indice unico sirve de destino de
una clave foranea; no hace falta convertirlo en `UNIQUE CONSTRAINT`.

**Se reviso el resto del archivo buscando la misma especie y no hay mas.** Las otras dos FK apuntan
a `companies("id")` y `users("id")`, claves primarias de tablas que ya existian; los dos `CHECK`
solo miran columnas de su propia tabla; `ENABLE`/`FORCE ROW LEVEL SECURITY` no referencian nada.

**El `down.sql` no tenia el problema por el otro lado**, porque no suelta indices ni FK uno a uno:
`DROP TABLE` se los lleva. Lo que si estaba mal era **su comentario**, que anunciaba un orden
—«los CHECK primero, luego los indices, luego las claves foraneas»— que el archivo no ejecuta. Un
comentario con la razon equivocada es peor que ninguno (`docs/conventions.md`), asi que ahora dice lo
que de verdad pasa, incluido **por que `document_files` va primero**: es quien guarda la FK, y al
reves haria falta un `CASCADE` que borraria mas de lo que dice.

### El ciclo up/down, verificado sin tocar la base de desarrollo

`pnpm run db:rollback` apunta a `DATABASE_URL`, que es la base de **desarrollo**, asi que el ciclo se
comprobo sobre una **copia desechable de la plantilla**, creada y borrada para esto:

```
1. copia de la plantilla:        {"batches":true, "files":true, "enum_strategy":true, "enum_status":true}
2. despues de down.sql:          {"batches":false,"files":false,"enum_strategy":false,"enum_status":false}
3. despues de reaplicar el up:   {"batches":true, "files":true, "enum_strategy":true, "enum_status":true}
4. down otra vez:                {"batches":false,"files":false,"enum_strategy":false,"enum_status":false}
base temporal borrada. La base de desarrollo NO se ha tocado.
```

## Los cuatro casos de T3 fallaban por donde entraba el INSERT, no por el esquema

Primera corrida: los cuatro rojos. **Las cuatro restricciones disparaban de verdad** —el rechazo
ocurria—, pero el test leia el codigo del sitio equivocado: insertaba con el cliente **tipado**, que
traduce el SQLSTATE a su propio codigo (`P2002`, `P2003`) y no expone `meta.code`.

Es un caso que el hermano del que se copio el patron ya tenia documentado
(`tests/integration/inventario/inventory-movements-constraints.int.test.ts`): los casos que esperan
un `CHECK` insertan con **`$executeRaw`**. Corregido asi. **Las aserciones de `23514`, `23503` y
`23505` no se relajaron**; lo que cambio es por donde entra la fila.

Un solo ajuste de contenido, y se dice: en el caso del unico `(company_id, path)`, Prisma reenvia el
campo **DETAIL** de Postgres y no el mensaje primario, que es donde va el nombre de la restriccion.
La asercion pasa a exigir `(company_id, path)` en vez del nombre: identifica la misma restriccion por
sus columnas, que son las unicas con clave unica sobre ese par. El SQLSTATE sigue afirmado igual.

## Hallazgos que el leader tiene que ver

0. **`design.md > 2.5` manda un orden de migracion imposible** y **sigue sin corregir**: «FK
   compuesta -> indices». El SQL ya esta arreglado; el diseno no, porque no es del implementer.
   Cualquiera que vuelva a transcribir esa seccion reproduce el fallo.
1. **`@napi-rs/canvas` en el runtime de Vercel SIGUE SIENDO DESCONOCIDO** (pregunta abierta 2 y el
   aviso de T14). Lo unico medible aqui es que **carga en Node local** —v22.13.1, win32,
   `import('@napi-rs/canvas')` devuelve `LOADED`—. **Eso no responde la pregunta**, que es sobre
   Vercel, y no se rellena con un supuesto. El diseno ya dice que pasa si falla: cae la estrategia
   `catalogo` **en ejecucion**, con su fila en error y su motivo, por la rama de R16. No se parcheo
   nada.
2. **Un borde que la tabla de `design.md > 5` no cubre**: firma **valida** pero sin la cabecera del
   identificador de mensaje. Se responde **400**, porque sin id no hay candado que reclamar, y tiene
   su test. Si se prefiere otro codigo, es una linea.
3. **El `claim` no devuelve la estrategia.** `ClaimedFile` trae `{ id, companyId, batchId, path }`,
   asi que `run-document-job` la obtiene con un `readBatch` posterior. Funciona y esta probado; la
   alternativa mas directa seria anadir `strategy` a `ClaimedFile`, tocando puerto y adaptador.
4. **`crypto-js`, transitiva de `@upstash/qstash`, la marca npm como `deprecated`.** Es transitiva,
   no lleva fila propia y los cuatro checks se corren sobre la directa, que esta limpia. Se dice por
   honestidad, no como bloqueo.
5. **`CHECKPOINTS.md > Calidad de codigo` pide E2E para «webhooks»** y esta ficha no aporta ninguno.
   No es un descuido: R27 y `[D18]` lo difieren a **QC-107** con el motivo escrito —un E2E real
   exigiria una URL publica y una cuenta, y el gate dejaria de correr sin red—. Lo decide el
   reviewer; la ficha lo declara en vez de callarlo.
6. **Un test de integracion se aisla por `commit`, no por transaccion.** El de la concurrencia del
   `claim` no puede envolverse en una transaccion con rollback: `claim` va contra el cliente global,
   asi que una sola transaccion no tiene dos conexiones compitiendo y el test no mediria nada. Va
   declarado asi en `tests/integration/aislamiento.json`, con limpieza en orden de FK.
7. **Se acoto una guardia ajena** (`identity-schema.test.ts`). Esta arriba, en la tabla de censos,
   con su motivo y su precedente. Es el cambio que mas merece una mirada del reviewer.
8. **Desviacion consciente del diseno al fallar la publicacion** (menor 4 de la review, anotada el
   2026-09-19). `design.md > 6.1` dice que si revienta la publicacion del archivo 3 de 10 «los ocho
   restantes se quedan en queued». El codigo **no aborta**: el try/catch es **por archivo** dentro
   del bucle, asi que del 4 al 10 si se publican, y el test lo afirma. Cumple **R6** —«dejar ESA
   fila en cola, sin inventar otro camino de recuperacion»— y es la conducta preferible: abortar
   castigaria a siete archivos sanos por el fallo de uno. Se declara aqui como desviacion, igual
   que se hizo con el orden de la migracion; **el texto del design no lo corrige el implementer**.
9. **El nombre de la cabecera del identificador de mensaje vuelve a la bitacora** (menor 6), arriba,
   en «Lo que T8 verifico contra el paquete instalado». Es el unico desconocido de la ficha que
   puede dejarla **entera parada en produccion** sin que ningun test lo note.
