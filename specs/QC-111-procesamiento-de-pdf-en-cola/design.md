# QC-111 — procesamiento-de-pdf-en-cola · design.md

> Diseño técnico de F1.2. Cubre `R1`–`R27` de `requirements.md`. Se apoya entero en lo que
> **QC-106**, **QC-108** y **QC-109** dejaron publicado y **no recrea nada de eso**.

## 0. Hallazgos que el leader tiene que ver antes de aprobar

Ninguno **bloqueante**. Las 22 decisiones son implementables tal como están escritas. Lo que sí hay
son **cuatro cosas que esta ficha descubre al bajar a diseño** y que no son supuestos, sino
consecuencias:

1. **`app/api/` no existe todavía y aquí nace.** No hay ningún Route Handler en el repo, así que no
   hay precedente que copiar. Dónde vive y qué forma tiene se decide en `## 5`.
2. **El puerto de almacenamiento no sabe borrar, a propósito.** `ports/document-storage.ts` lo dice
   en su cabecera: «ninguna de las tres operaciones BORRA… el borrado del PDF temporal es trabajo de
   la ficha que procesa la tanda». `[D6]` es justo esa ficha, así que **esta ficha amplía el puerto**
   con una cuarta operación. Es cambio en un archivo existente, no una tabla nueva de la nada.
3. **`@napi-rs/canvas` en Vercel sigue siendo DESCONOCIDO** (pregunta abierta 2). Esta ficha es la
   primera que ejecuta la conversión a imagen en el despliegue. **No bloquea el spec**: el diseño
   funciona igual, y si el binario no corre, lo que cae es la estrategia `catalogo` **en ejecución**,
   con su fila en error y su motivo, exactamente por el camino de `[D5]`/R16. Se cierra en T14.
4. **`@upstash/qstash` es dependencia nueva y no se instala hasta F1.4** (`## 8`), con **plan B
   escrito** por si el humano no la aprueba.

## 1. Qué se construye, en una frase

Una tanda de PDFs ya subidos gana **identidad y estado en Postgres**, se **publica un mensaje por
archivo** en Upstash QStash, y un **Route Handler** —el primero del repo— recibe cada mensaje, valida
su firma, **reclama** la fila, baja los bytes, ejecuta la conversión + estrategia que ya existen,
guarda el texto tal cual y borra el PDF. Una tercera operación **consulta** el estado de la tanda y,
de paso, caduca lo que lleva demasiado tiempo esperando.

Tres caminos de entrada, y **solo tres**:

| Camino | Quién entra | Qué lo protege |
|---|---|---|
| Encolar una tanda | la pantalla, con sesión | **permiso en el service** + empresa (`[D8]`, R3) |
| Ejecutar un trabajo | QStash, sin usuario | **firma del mensaje** (`[D9]`, R7) |
| Consultar el estado | la pantalla, con sesión | **permiso en el service** + empresa (`[D13]`, R18) |

## 2. Modelo de datos

Dos tablas nuevas, las dos del módulo `documentos`, las dos con `/// @module documentos` en
`db/schema.prisma` (R21, R24).

### 2.1 Por qué **dos** tablas y no una

`[D4]` cierra que la tanda **tiene identidad propia**. Con una sola tabla de archivos, la estrategia
se repetiría en las diez filas y nada impediría que la séptima tuviera otra: `[D3]` («una vez por
tanda») pasaría de ser una imposibilidad estructural a ser una convención que alguien tiene que
respetar. Además `[D13]`/QC-107 consultan **la tanda entera de una vez**, y sin fila de tanda esa
consulta no tiene por dónde empezar.

### 2.2 Los dos enums

Convención vigente del repo: **enum de Postgres**, no `TEXT` + `CHECK`. Es lo que fijó la migración
`20260918120000_inventory_movement_kind_enum_and_reason_catalog` al convertir `kind`.

```prisma
enum DocumentStrategy {
  catalogo
  formula
}

enum DocumentFileStatus {
  queued
  processing
  done
  error
}
```

Los dos valores de `DocumentStrategy` son **los mismos literales** que el `pdfStrategySchema` de
QC-109, y son los únicos identificadores que no están en inglés: son nombres de negocio que fijó el
humano en QC-109 `[D1]`, y el precedente está escrito en
`specs/QC-109-procesamiento-de-pdf-por-estrategia/design.md > 3.1`. Todo lo demás va en inglés
(`[D22]`).

**El enum de la base y el enum de zod conviven, y eso es deliberado.** Son dos fronteras distintas: la
base impide que se escriba basura, y zod impide que entre basura. QC-109 ya avisó de que la estrategia
**puede llegar podrida desde la base** —su enmienda del 2026-09-18 anuló `mode` justo por esto—, así
que el trabajo vuelve a validarla con `pdfStrategySchema` antes de procesar aunque venga de una
columna tipada. Un enum ampliado en una migración futura sin tocar el código sería exactamente ese
caso.

### 2.3 Los dos modelos

```prisma
/// La TANDA: quien sube elige la estrategia UNA vez y sus hasta diez archivos la heredan. Sin
/// `deleted_at`: nada de esta ficha borra estas filas, y una columna que nadie escribe es
/// infraestructura por si acaso.
/// Las FK a `companies` y `users` van escritas a mano en la migracion y son drift: hay que borrar su
/// `DROP CONSTRAINT` de toda migracion generada, como en `orders` y `order_assignments`.
/// `document_batches_id_company_id_key` es la clave candidata a la que apunta la FK COMPUESTA de
/// `document_files`: quitarla la rompe.
/// @module documentos
model DocumentBatch {
  id        String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companyId String           @map("company_id") @db.Uuid
  strategy  DocumentStrategy
  createdBy String?          @map("created_by") @db.Uuid
  createdAt DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([id, companyId], map: "document_batches_id_company_id_key")
  @@index([companyId], map: "document_batches_company_id_idx")
  @@index([createdBy], map: "document_batches_created_by_idx")
  @@map("document_batches")
}

/// Un PDF de una tanda, con su estado. `extracted_text` guarda lo que escribio la IA TAL CUAL, como
/// texto plano y sin longitud declarada: un catalogo de 40 paginas no cabe en un `varchar`.
/// La FK a la tanda es COMPUESTA con `company_id` contra `document_batches_id_company_id_key`: una
/// fila cuya tanda sea de otra empresa no puede existir.
/// `updated_at` es el reloj de la caducidad: se mueve al reclamar y al terminar.
/// @module documentos
model DocumentFile {
  id             String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  batchId        String             @map("batch_id") @db.Uuid
  companyId      String             @map("company_id") @db.Uuid
  path           String
  status         DocumentFileStatus @default(queued)
  extractedText  String?            @map("extracted_text")
  errorCode      String?            @map("error_code")
  errorReason    String?            @map("error_reason")
  queueMessageId String?            @map("queue_message_id")
  attempts       Int                @default(0)
  createdAt      DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([companyId, path], map: "document_files_company_path_key")
  @@index([batchId], map: "document_files_batch_id_idx")
  @@index([companyId], map: "document_files_company_id_idx")
  @@map("document_files")
}
```

Cinco decisiones de columna, con su porqué:

1. **No hay columna con el nombre original del archivo.** `[D1]` enumera lo que la fila lleva
   —empresa, ruta, estrategia, estado, motivo— y el nombre no está. Tampoco viaja hoy: la salida de
   `createIssueUploadLinks` son rutas y enlaces, y el nombre «ni siquiera se lee»
   (`issue-upload-links.ts:87-89`). Si QC-107 lo necesita para pintar, es decisión de QC-107, y
   añadirlo aquí sería inventar una regla que nadie decidió.
2. **`error_code` es `TEXT`, no un enum.** Guarda un `ErrorCode` del catálogo **cerrado** de
   `@/lib/modules/errores` (R22), que ya es una unión de literales en TypeScript; duplicarlo como
   enum de Postgres sería una segunda copia del catálogo que se desincroniza en la primera ficha que
   lo amplíe.
3. **`attempts` existe para poder mirarlo, no para decidir con él.** Quien cuenta los reintentos y
   los corta es QStash (`## 6.4`); esta columna es diagnóstico.
4. **`queue_message_id`** ata la fila al mensaje que la reclama (`## 6.3`).
5. **Único `(company_id, path)`**: la misma ruta no puede entrar dos veces en dos tandas. Es la
   segunda red de la idempotencia y cierra el caso «la pantalla manda la misma tanda dos veces».

### 2.4 Los CHECK de coherencia

Mismo patrón que `inventory_movements_reason_matches_kind`:

```sql
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_text_matches_status"
  CHECK (("status" = 'done' AND "extracted_text" IS NOT NULL)
      OR ("status" <> 'done' AND "extracted_text" IS NULL));

ALTER TABLE "document_files" ADD CONSTRAINT "document_files_error_matches_status"
  CHECK (("status" = 'error' AND "error_code" IS NOT NULL AND "error_reason" IS NOT NULL)
      OR ("status" <> 'error' AND "error_code" IS NULL AND "error_reason" IS NULL));
```

Esto hace **inexpresable** en la base una fila «listo» sin texto o «error» sin motivo, que es
exactamente lo que `[D2]` y `[D1]` prometen. Ojo con el efecto que tiene y que se acepta: una fila que
vuelve de `error` a `queued` por un reintento tiene que **limpiar** el código y el motivo en el mismo
`UPDATE`; el `CHECK` lo obliga y por eso el reintento no puede dejar un motivo viejo pegado.

### 2.5 La migración

`db/migrations/<timestamp>_document_batches_and_files/` con su `migration.sql` y su `down.sql`
(R21, `docs/architecture.md > Migraciones up/down`).

`migration.sql`, en este orden: `CREATE TYPE` de los dos enums → `CREATE TABLE` de las dos tablas →
FK **escritas a mano** a `companies` y `users` (son de otro módulo, no llevan `@relation`, y son
drift: hay que borrar su `DROP CONSTRAINT` de toda migración generada después, como ya pasa con
`orders`) → FK **compuesta** `document_files (batch_id, company_id)` → `document_batches (id,
company_id)` → índices → los dos `CHECK` → y

```sql
ALTER TABLE "document_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_batches" FORCE ROW LEVEL SECURITY;
ALTER TABLE "document_files"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_files"   FORCE ROW LEVEL SECURITY;
```

**Sin policies, deny-by-default**, igual que `inventory_movements`. Es defensa en profundidad: quien
aísla de verdad es el service (`docs/architecture.md > Acceso a datos y autorizacion`).

`down.sql` revierte exactamente y en orden inverso: `DROP` de los CHECK → de los índices → de las FK
→ `DROP TABLE` de las dos → `DROP TYPE` de los dos enums.

## 3. Archivos nuevos

Todos dentro del módulo salvo el `route.ts`, que es del App Router (R24).

```
lib/modules/documentos/
  domain/
    batch-status.ts              # el estado de un archivo y el de una tanda: tipos + zod
    enqueue-input.ts             # esquema del borde de encolar (estrategia + 1..10 rutas)
    queue-message.ts             # esquema del cuerpo del mensaje + su tipo
    enqueue-batch.ts             # caso de uso: permiso -> validar -> filas -> publicar
    run-document-job.ts          # caso de uso: reclamar -> bajar -> procesar -> guardar -> borrar
    get-batch-status.ts          # caso de uso: permiso -> empresa -> caducar -> leer
    failure-kind.ts              # reintentable vs definitivo, en un solo sitio
    processing-timeouts.ts       # lectura del plazo y del tope, con sus valores por defecto
  ports/
    document-batch-repository.ts # las cinco operaciones de persistencia
    processing-queue.ts          # publicar un mensaje
    queue-signature.ts           # verificar la firma de un cuerpo crudo
    processing-config.ts         # plazo de caducidad y tope de reintentos, desde el entorno
  adapters/driven/
    persistence/document-batch-repository-prisma.ts
    queue/processing-queue-qstash.ts
    queue/queue-signature-qstash.ts
    config/processing-config-env.ts
  adapters/driving/
    document-batch-actions.ts    # Server Actions: encolar y consultar
    document-job-route.ts        # el handler del webhook, sin `next/server` en el dominio
app/api/documentos/trabajos/
  route.ts                       # `export { POST } from '...document-job-route'`
```

Y tres existentes que se tocan sin reordenar lo suyo: `ports/document-storage.ts` (gana `remove`),
`adapters/driven/storage/document-storage-supabase.ts` (lo implementa), `lib/modules/documentos/index.ts`
(barrel) y `lib/composition/index.ts` (cableado).

## 4. Los puertos

```ts
// ports/processing-queue.ts
export type QueuedMessage = { readonly documentFileId: string };
export interface ProcessingQueue {
  /** Publica UN mensaje y devuelve el id que le da el servicio. */
  publish(message: QueuedMessage): Promise<string>;
}

// ports/queue-signature.ts
export type SignedDelivery = { readonly rawBody: string; readonly signature: string | null };
export interface QueueSignature {
  /** `true` solo si la firma corresponde a ESE cuerpo. Nunca lanza por una firma mala. */
  verify(delivery: SignedDelivery): Promise<boolean>;
  /** El id del mensaje que trae la entrega, o `null` si no viene. */
  messageIdOf(headers: Readonly<Record<string, string>>): string | null;
}

// ports/processing-config.ts
export interface ProcessingConfig {
  timeoutSeconds(): number;   // caducidad [D11]
  maxRetries(): number;       // tope de reintentos [D5]
}

// ports/document-batch-repository.ts
export interface DocumentBatchRepository {
  createBatch(input: NewBatch): Promise<CreatedBatch>;
  attachMessageId(documentFileId: string, messageId: string): Promise<void>;
  /** El UPDATE condicional de `## 6.3`. `null` si nadie la reclamó. */
  claim(documentFileId: string, messageId: string): Promise<ClaimedFile | null>;
  finish(documentFileId: string, outcome: JobOutcome): Promise<void>;
  expireStale(batchId: string, companyId: string, olderThan: Date): Promise<void>;
  readBatch(batchId: string, companyId: string): Promise<BatchStatus | null>;
}
```

El cuerpo del mensaje lleva **solo el id de la fila** (R11): la empresa, la ruta y la estrategia se
leen de la base al reclamarla. Meterlas en el cuerpo daría dos fuentes para el mismo dato y la de
fuera es la que un atacante tocaría si algún día la firma se debilitara.

## 5. El Route Handler: el primero del repo

`docs/architecture.md > Server Actions vs Route Handlers` manda Route Handler en `app/api/` para «un
webhook de un tercero», y `## Estructura de carpetas` ya reserva `app/api/` aunque hoy esté vacío.
**Ruta elegida:** `app/api/documentos/trabajos/route.ts`. Por módulo primero y capacidad después, que
es como se agrupa el resto del repo; una ruta genérica tipo `/api/webhook` obligaría a multiplexar por
un campo del cuerpo el día que haya un segundo webhook.

**El archivo de `app/` es de tres líneas y no decide nada:**

```ts
export { POST, runtime } from '@/lib/modules/documentos/adapters/driving/document-job-route';
```

Por qué así y no con la lógica dentro: la tabla de `docs/architecture.md > La regla de dependencias`
deja a `app/**` importar `lib/composition`, el barrel o **un adaptador driving**, y prohíbe el resto.
Con la lógica en `app/` el handler tendría que resolver a mano lo que el driving ya sabe resolver, y
`tests/guards/guard-arquitectura-modulos.test.ts` trata `adapters/driving/**` como el sitio de «Server
Actions, route handlers» — que es literalmente lo que dice `docs/architecture.md`. Efecto práctico:
**el handler se puede testear sin levantar Next**, invocándolo con un `Request` normal (R26).

`runtime = 'nodejs'` explícito, no `edge`: la conversión usa `@napi-rs/canvas`, un binario nativo, y
el runtime edge no lo carga. Es la misma razón por la que `middleware.ts` no puede tocar un
repositorio.

Respuestas del handler, y son el contrato con QStash (`## 6.4`):

| Caso | HTTP | Efecto |
|---|---|---|
| Firma ausente o inválida | **401** | ninguno (R7) |
| Cuerpo que no pasa zod | **400** | ninguno; definitivo (R9) |
| Fila ya reclamada, terminada o inexistente | **200** | ninguno; idempotente (R10) |
| Procesado bien | **200** | texto guardado, PDF borrado |
| Fallo **definitivo** | **200** | fila en error (R16) |
| Fallo **reintentable** | **500** | fila de vuelta a `queued` (R15) |

**La sutileza que hay que no perder de vista:** un fallo definitivo responde **200**. Parece al revés
y no lo es — el 200 le dice a QStash «no lo repitas», que es justo `[D5]`. Lo que fracasó fue el PDF,
no la entrega.

## 6. Los tres caminos, en detalle

### 6.1 Encolar (`domain/enqueue-batch.ts`) — R3, R4, R5, R6

Orden, y el orden **es** el requisito (mismo criterio que `issue-upload-links.ts`):

1. `requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION)` — primera línea, antes del esquema y antes
   de tocar puerto alguno. **El mismo permiso de la subida** (`[D8]`), reutilizando la constante que
   ya vive en `domain/actor.ts`: no nace ningún `documentos.*` y no hay migración ni seed de permisos.
2. `enqueueBatchSchema`: `strategy` con `pdfStrategySchema`, `paths` con `min(1).max(MAX_FILES_PER_BATCH)`
   —la constante ya existe en `domain/limits.ts`, no se vuelve a escribir el 10—.
3. Cada ruta pasa por `isPathInCompany(path, actor.companyId)`. Falla una, **se rechaza la tanda
   entera**, y esto ocurre antes de escribir nada.
4. `repository.createBatch(...)`: **una transacción** que inserta la tanda y sus N archivos en
   `queued`.
5. Por cada archivo, `queue.publish({ documentFileId })` y `repository.attachMessageId(...)`.

Devuelve `{ batchId }`. La pantalla se queda con eso y con él consulta (R18).

**Si la publicación del archivo 3 de 10 revienta**, los dos primeros ya están en la cola y los ocho
restantes se quedan en `queued`: la operación **no deshace** lo publicado —QStash no tiene «des-publicar»
y borrar filas ya reclamadas sería peor— y devuelve el `batchId` igual. Esas ocho filas terminan en
error por caducidad (R6, `[D11]`). Es exactamente el escenario que `[D11]` existe para cubrir y por eso
no hace falta inventar nada más.

### 6.2 Ejecutar el trabajo (`domain/run-document-job.ts`) — R10..R17

```
firma (fuera, en el driving)      401 si falla, sin efectos
  -> zod del cuerpo               400 si falla
  -> claim(id, messageId)         null -> 200 sin efectos  (idempotencia, ## 6.3)
  -> storage.download vía downloadDocument(scope, path)     (comprueba empresa, ## 6.5)
  -> processPdfByStrategy({ strategy, path, bytes })        (QC-109, tal cual)
  -> ok:true   -> finish(done, text) -> storage.remove(path) -> 200
     ok:false  -> clasificar (## 6.4)
                  definitivo   -> finish(error, code, reason) -> 200
                  reintentable -> finish(requeue, code, reason) -> 500
```

Lo que este caso de uso **no** hace, y la ausencia es el requisito (R12): no recorta imágenes, no
declara ningún puerto de recorte y no deja ningún campo de salida para él. QC-110 engancha su paso
cuando exista, igual que QC-106 publicó la conversión sin invocarla.

### 6.3 Idempotencia: qué es la clave y qué pasa en la segunda entrega — R10, `[D10]`

**La clave es la fila del archivo, y el candado es su estado.** No hay tabla de mensajes vistos: la
fila *es* el registro de si eso ya se hizo.

```sql
UPDATE "document_files"
   SET "status" = 'processing',
       "attempts" = "attempts" + 1,
       "queue_message_id" = $2,
       "error_code" = NULL,
       "error_reason" = NULL,
       "updated_at" = now()
 WHERE "id" = $1
   AND "status" = 'queued'
   AND ("queue_message_id" IS NULL OR "queue_message_id" = $2)
RETURNING "id", "company_id", "batch_id", "path";
```

Un `UPDATE ... WHERE status='queued' ... RETURNING` es **atómico**: Postgres serializa dos entregas
concurrentes sobre la misma fila y **solo una** se lleva el `RETURNING`.

**Qué pasa exactamente en la segunda entrega del mismo mensaje**, caso por caso:

| Estado de la fila al llegar la 2.ª entrega | `claim` | Qué ocurre |
|---|---|---|
| `processing` (la 1.ª sigue viva) | `null` | no se llama a la IA, no se escribe nada, **200** |
| `done` | `null` | el texto guardado **no se pisa**, **200** |
| `error` (definitivo o caducado) | `null` | el motivo **no se pisa**, **200** |
| `queued` tras un fallo **reintentable** | reclama | se procesa: eso **es** el reintento que `[D5]` pide |
| id inexistente o de otra tanda | `null` | **200**, sin decir si existe |

En los cinco casos: **no se llama a Gemini dos veces, no se duplica ninguna fila y no se pisa ningún
resultado**, que son las tres promesas literales de `[D10]`.

**El límite, dicho entero porque es real.** La última fila de la tabla es una ventana: si un fallo
reintentable devuelve la fila a `queued` y llega un **duplicado** de la entrega anterior antes que el
reintento, esa entrega reprocesa. Es **indistinguible** de un reintento legítimo —QStash reusa el
mismo `messageId` al reintentar, así que ninguna comprobación sobre el id los separa— y procesar de
nuevo es justo lo que `[D5]` quiere en ese estado. Lo que la ventana **no** puede hacer es pisar un
`done` ni duplicar filas. Se acepta y queda escrito.

`queue_message_id` no está para eso, sino para lo otro: una entrega cuyo id no coincide con el que la
fila ya tiene —un mensaje viejo sobre una fila re-encolada— **no la reclama**.

### 6.4 Reintentable vs definitivo, y cómo se le dice a QStash — R15, R16, R17, `[D5]`

La clasificación vive en **un solo archivo**, `domain/failure-kind.ts`, y decide por el `ErrorCode`
que devuelve la capa de abajo. Verificado leyendo `domain/read-pdf-with-ai.ts` y
`domain/process-pdf-by-strategy.ts`, no de memoria:

| Origen del fallo | `ErrorCode` que sale hoy | Clase | Por qué |
|---|---|---|---|
| `storage.download` revienta | lo lanza el puerto | **reintentable** | el bucket caído mejora esperando |
| `deps.ai.read` falla o agota el plazo | `ai_unavailable` (`read-pdf-with-ai.ts:180`) | **reintentable** | es literalmente «el proveedor no respondió» |
| `countPages`/`renderPages` revientan | `unexpected` (`read-pdf-with-ai.ts:121,133`) | **definitivo** | PDF cifrado o corrupto: tres intentos, tres veces el mismo error |
| PDF por encima de 50 páginas | `invalid_input` (`read-pdf-with-ai.ts:125`) | **definitivo** | el tope no cambia por esperar |
| estrategia guardada inválida | `invalid_input` (`process-pdf-by-strategy.ts:95`) | **definitivo** | es un dato podrido en la fila |
| PDF por encima de 20 MB | nunca llega aquí | — | lo rechaza el bucket al subir (`limits.ts:69`) |

**El coste que esto tiene y se acepta:** un bug propio en la conversión también sale `unexpected` y
por tanto se clasifica como definitivo. Es correcto por el mismo motivo que un PDF corrupto —un bug no
se arregla reintentándolo— y evita quemar tres conversiones por cada archivo mientras el bug exista.
Lo que se pierde es que un fallo transitorio **dentro** del convertidor no se reintenta; hoy no hay
ninguno conocido, y si aparece, la tabla de arriba es el único sitio que hay que tocar.

**Cómo se le comunica a QStash:** por el **código de estado HTTP**, que es el único canal que un
webhook tiene. **5xx → QStash reintenta; 2xx → lo da por entregado y no reintenta.** El **tope** no se
manda en la respuesta: se fija **al publicar**, en la opción `retries` de `publishJSON`, con el valor
de `ProcessingConfig.maxRetries()`. Por eso el tope vive en el adaptador de la cola y no en el
handler.

**Cuando QStash agota el tope**, deja de entregar y **nadie nos avisa** —no hay callback de fallo
cableado en esta ficha—: la fila se quedó en `queued` tras el último 500, y quien la cierra es la
**caducidad** de `## 6.6` (R17). Es el mismo mecanismo que cubre R6, y ese es el motivo de que `[D11]`
no sea un adorno.

### 6.5 Bajar los bytes sin actor de sesión — R11

`process-pdf-by-strategy.ts` recibe los **bytes ya cargados** y **no recibe actor** (lo dice su propia
cabecera). Quien los baja es esta ficha, y el único camino publicado es `createDownloadDocument`, que
**sí exige un actor** — pero solo para leer su `companyId`: `read-document.ts:22-26` dice explícitamente
que ahí **no se comprueba ningún permiso**, solo la empresa.

Así que el trabajo construye su **ámbito** con la empresa que salió del `claim`:

```ts
const scope: Actor = { id: claimed.id, companyId: claimed.companyId, permissions: [] };
```

Esto **no es un actor falso con permisos inventados**: el conjunto de permisos va **vacío**, así que si
alguien intentara pasar este ámbito a una operación que exige permiso, `requirePermission` lo
rechazaría. Lo único que concede es lo que la fila ya dice: «esta ruta es de esta empresa». Y esa
comprobación no es decorativa — una fila cuya `path` no caiga bajo su propia `company_id` se rechaza
antes de tocar el bucket (R11).

### 6.6 Consultar y caducar (`domain/get-batch-status.ts`) — R18, R19, `[D12]`, `[D13]`

1. `requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION)` — el **mismo** permiso, otra vez. `[D13]`
   dice «cualquier Administrador de la empresa», y `[D8]` cierra que el catálogo de quince no se
   amplía: ese permiso es, en el sembrado vigente, exactamente «Administrador». **Alternativa
   considerada y descartada:** no exigir permiso y filtrar solo por empresa, como hacen las dos
   lecturas de QC-106. Se descarta porque allí lo que se devuelve es una URL firmada de un archivo que
   quien pregunta ya conoce, y aquí se devuelve **el texto y los errores de lo que la IA leyó de los
   documentos de un proveedor**: dárselo a cualquier rol sería una regla que nadie decidió.
2. `expireStale(batchId, companyId, now - timeoutSeconds)`: un `UPDATE` acotado a esa tanda y esa
   empresa que pasa a `error` las filas en `queued`/`processing` con `updated_at` más viejo que el
   plazo, con `error_code = 'unexpected'` y un motivo que dice que se agotó el tiempo.
3. `readBatch(batchId, companyId)`: `null` si no existe **o** si es de otra empresa —las dos cosas dan
   el mismo rechazo, sin revelar cuál fue (R18)—.

**Sí, la consulta escribe, y es a conciencia.** Podría derivarse la caducidad al vuelo sin tocar la
base, pero entonces (a) dos consultas seguidas podrían discrepar si el plazo se cruza entre ellas, (b)
una entrega tardía todavía podría **reclamar** una fila que la pantalla ya pinta como caducada, porque
el candado de `## 6.3` mira la **columna**, no un cálculo, y (c) `[D14]` quedaría a medias: el historial
diría «en cola» para siempre en algo que nadie va a procesar. Persistir cierra las tres. El coste es
que la lectura no es de solo-lectura, y va dicho aquí en vez de sorprender a quien la lea.

**El código de error de la caducidad es `unexpected`.** No es el más expresivo, y es a propósito:
`[D21]` cierra que **no se añade ningún código** y el catálogo no tiene ninguno de «se agotó el
tiempo». Lo que sí distingue el caso es el `error_reason`, que es texto libre y es lo que QC-107
pintará.

## 7. Configuración — R23, `[D17]`

Tres variables nuevas, **declaradas y vacías** en `.env.example`, con su bloque de comentario como los
cuatro bloques que ya hay, y leídas **en el momento de la invocación** desde
`adapters/driven/config/processing-config-env.ts` —nunca al importar—, exactamente como
`document-storage-config-env.ts` y `ai-config-env.ts`:

```
QSTASH_TOKEN=                          # credencial de publicación. SECRETO.
QSTASH_CURRENT_SIGNING_KEY=            # clave con la que se verifica la firma. SECRETO.
QSTASH_NEXT_SIGNING_KEY=               # la siguiente, para la rotación. SECRETO.
QSTASH_TARGET_URL=                     # URL pública del handler, p. ej. https://app.dominio.com/api/documentos/trabajos
DOCUMENT_PROCESSING_TIMEOUT_SECONDS=   # plazo de caducidad [D11]. Por defecto 900.
DOCUMENT_PROCESSING_MAX_RETRIES=       # tope de reintentos [D5]. Por defecto 3.
```

**Los dos valores por defecto, que es la pregunta abierta 3**, con su motivo:

- **`DOCUMENT_PROCESSING_TIMEOUT_SECONDS = 900` (15 minutos).** Cota superior real de un archivo que
  va bien: la lectura con IA tiene su propio plazo de **60 s** (`AI_READ_TIMEOUT_SECONDS`), y con 3
  reintentos y el retroceso exponencial de la cola entre ellos, el peor caso honesto ronda los pocos
  minutos. 900 s deja holgura de sobra para no caducar algo que iba a terminar, y es lo bastante corto
  para que nadie mire una rueda girando media hora. Coincide, sin que sea causa, con
  `READ_LINK_TTL_SECONDS`.
- **`DOCUMENT_PROCESSING_MAX_RETRIES = 3`.** Es el valor por defecto de QStash y cubre los cortes
  breves de proveedor sin multiplicar por más de cuatro el gasto de un archivo que va a fallar igual.

Los dos **son plazos de infraestructura, no límites de negocio**, así que **no** van a
`domain/limits.ts`: ese archivo declara lo que el módulo promete y estos cambian por entorno.
`domain/processing-timeouts.ts` solo guarda los **valores por defecto** y la función que los aplica
cuando la variable viene vacía; quien la lee es el adaptador.

**Ningún secreto en el repositorio** (`CHECKPOINTS.md > Configuracion`), y ningún test depende de que
estas variables tengan valor (R26).

## 8. Dependencia nueva: `@upstash/qstash` — R25, `[D16]`

**Qué es y qué código nos ahorra.** El cliente oficial de Upstash QStash. Dos cosas, y las dos son
justo lo que no queremos escribir a mano:

- **`Client.publishJSON`**: publicar el mensaje con su URL de destino, su cuerpo y su `retries`. A
  mano son `fetch` contra `https://qstash.upstash.io/v2/publish/<url>` con las cabeceras
  `Upstash-Retries`, el `Bearer` y el manejo de errores del servicio, versionado incluido.
- **`Receiver.verify`**: verificar la firma. **Esto es lo que de verdad no se reimplementa**: la firma
  es un **JWT firmado** cuyo `body` es el **hash SHA-256 del cuerpo crudo**, con **dos claves** vivas
  a la vez para permitir la rotación. Escribirlo a mano es criptografía propia en el camino de un
  webhook, que es exactamente donde `docs/architecture.md > Dependencias de terceros` dice que se
  prefiera una librería mantenida.

**Los cuatro checks, los cuatro limpios** (contra el registro de npm, 2026-09-18, tal como los fijó
`[D16]`):

| Check | Resultado |
|---|---|
| 1. No `deprecated` | **PASA** — no está marcada |
| 2. Release en 12 meses | **PASA** — `2.11.3` del **2026-07-22** |
| 3. ≥ 10.000 descargas/semana | **PASA** — **561.073** |
| 4. Licencia MIT/Apache-2.0/BSD/ISC | **PASA** — **MIT** |

**Arrastra tres transitivas** —`jose`, `crypto-js` y `neverthrow`—, ninguna presente hoy en
`package.json`. **No llevan fila**: la guardia compara solo entradas **directas**, igual que se
anotó con `@tanstack/react-store` y con `date-fns`. **`@upstash/redis` NO entra**, por decisión de
`[D16]`, y **la aprobación en suspenso de QC-28 no se toca**.

**Fila que iría en `docs/dependencias.md`** (la escribe F1.4, no antes):

> \| `@upstash/qstash` \| Publicar un trabajo por PDF en la cola (`Client.publishJSON`, con su tope de
> reintentos) y **verificar la firma** del webhook (`Receiver.verify`), que es un JWT cuyo cuerpo es el
> SHA-256 del cuerpo crudo y admite dos claves para la rotación (QC-111). La alternativa es `fetch` a
> mano contra la API de publicación **y criptografía propia** en el camino de un webhook \| aprobada \|
> 2026-09-18 \| **Los cuatro checks PASAN**, verificados contra el registro de npm el 2026-09-18 al
> acotar QC-111: sin `deprecated`; última release **`2.11.3` del 2026-07-22**; **561.073** descargas
> semanales; licencia **MIT**. Aprobada por el humano al aprobar el spec de QC-111 (F1.4), como manda
> `AGENTS.md`. **Arrastra `jose`, `crypto-js` y `neverthrow`**, transitivas y sin fila propia, como
> `@tanstack/react-store` y `date-fns`. **`@upstash/redis` NO entra**. **Aislada en dos archivos**,
> `processing-queue-qstash.ts` y `queue-signature-qstash.ts`, detrás de sus dos puertos: sustituirla es
> reescribirlos y no buscarla por el repo. Mismo criterio con el que entraron `@supabase/storage-js`,
> `@google/genai`, `resend` y `unpdf` \|

**Plan B, por si el humano NO la aprueba en F1.4.** El diseño no se cae, porque todo lo que la toca
está detrás de dos puertos:

- **`ProcessingQueue`** pasa a implementarse con `fetch` contra la API de publicación de QStash
  (~20 líneas, del mismo tamaño que el `fetch` a mano que se registró como alternativa honesta en la
  fila de `resend`).
- **`QueueSignature`** es el problema de verdad, y hay dos salidas, **las dos peores** y se dicen:
  (a) verificar el JWT con `jose` a pelo —que entraría como dependencia directa, o sea cambiar una
  aprobación por otra—; o (b) sustituir la firma por un **secreto compartido** comparado en tiempo
  constante con `crypto.timingSafeEqual` de Node, sin librería. La (b) es más débil que la firma
  —un secreto estático no ata la firma al **cuerpo**, así que protege contra un desconocido pero no
  contra un replay con otro cuerpo—, y por eso **no se propone como equivalente**: si es la que se
  elige, R7 cambia de letra y hay que volver a `/afinar-feature`.
- **Lo que no cambia en ningún caso:** tablas, migración, puertos, casos de uso, clasificación de
  fallos, idempotencia y tests. El plan B toca **dos archivos** de `adapters/driven/queue/`.

**Nada se instala antes de la aprobación** (regla 7 de `CLAUDE.md`, `[D16]`).

**Un DESCONOCIDO, y se dice** (regla 6): **el nombre exacto de la cabecera del identificador de
mensaje** y la firma exacta de `Receiver.verify` **no se verificaron contra el paquete**, porque este
diseño se escribió sin red y sin `node_modules`. El diseño **no depende de ello**: el puerto
`QueueSignature` declara `messageIdOf(headers)` y quien conoce el nombre real es su adaptador. Se
cierra en la **primera task del adaptador (T8)**, igual que QC-108 cerró lo suyo con `@google/genai`.

## 9. Verificación sin red — R26, R27, `[D18]`, `[D19]`

**Ningún test toca QStash, Supabase ni Gemini**, y no por disciplina sino por construcción: las tres
están detrás de puertos, y lo que el test cablea son dobles.

| Pieza real | Doble en el test | Por qué basta |
|---|---|---|
| `ProcessingQueue` (QStash) | objeto en memoria que apunta lo publicado | lo que se verifica es **qué** se publicó y **cuántas veces**, no que Upstash lo reciba |
| `QueueSignature` (QStash) | doble que devuelve `true`/`false` según el caso | la validez de la firma es una decisión, y es la **reacción** a esa decisión lo que se prueba |
| `DocumentStorage` (Supabase) | el doble en memoria que QC-106 ya usa | ya existe y ya sabe descargar; gana `remove` |
| `readPdfWithAi` (Gemini) | función falsa, como en QC-109 | `process-pdf-by-strategy` lo recibe **construido**, no como puerto |
| `DocumentBatchRepository` (Prisma) | doble en memoria con la semántica del `claim` | ver el aviso de abajo |
| `ProcessingConfig` (entorno) | doble con valores fijos | ningún test depende de que una variable tenga valor |

**El aviso que hay que leer antes de implementar:** un doble en memoria del repositorio **no prueba la
atomicidad** del `UPDATE ... WHERE status='queued'`. Prueba la **semántica** —que dos `claim` seguidos
solo devuelven fila una vez—, que es lo que R10 pide. La atomicidad real bajo concurrencia la prueba
un test de `tests/integration/` **contra la base de test**, que es donde el repo ya prueba sus
constraints; ahí también van los dos `CHECK` de `## 2.4` y el rechazo cruzado por empresa de R21.

**Los tres tests de integración sobre la ruta** que `[D18]` exige, con un `Request` construido a mano
y el handler importado directo (`## 5`): firma inválida → **401 y cero efectos**; firma válida →
procesa y responde 200; **mismo mensaje dos veces** → una sola llamada a la IA, un solo texto, 200 las
dos veces.

**Sin E2E, con motivo** (R27, `[D18]`): esta ficha no añade ninguna pantalla que un navegador pueda
visitar. **Es deuda con destinatario: QC-107**, que aporta la interfaz y el recorrido. El E2E completo
aquí exigiría una URL pública que QStash pudiera llamar y una cuenta real, y **el gate dejaría de
correr sin red**, que es condición del repo.

**Comentarios (`docs/conventions.md > Comentarios`).** Ninguna línea de producción que este diseño
manda escribir cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada» — **los bloques de comentario
de `## 2.3` están escritos ya cumpliendo la regla**, y en `.env.example` los bloques existentes citan
fichas porque no es código de producción. `/// @module documentos` no es una cita: es obligatorio.

## 10. Caso de borde: el PDF ya no está en el bucket (pregunta abierta 4)

`[D6]` borra **solo al terminar bien**, así que por nuestro camino no debería pasar: una fila que
llega al `claim` en `queued` nunca tuvo su archivo borrado. Pero puede pasar por fuera —alguien vacía
el bucket, la subida firmada nunca llegó a completarse y la pantalla encoló igual—.

**Qué hace:** el fallo lo lanza `storage.download`, o sea la rama «almacenamiento» de `## 6.4`, que es
**reintentable**. Y eso está bien aunque parezca que no: un archivo que falta no vuelve, pero el
reintento cuesta una descarga fallida —**no una conversión ni una llamada a Gemini**—, la cola agota
su tope de 3 y la fila la cierra la caducidad con su motivo (R17). La alternativa sería distinguir un
404 del almacenamiento de un 503, y hoy el puerto **no distingue**: `DocumentStorage.download` devuelve
bytes o lanza, sin código. Añadir esa distinción es tocar el puerto de QC-106 para un caso que no
debería ocurrir, así que **no se hace** y queda escrito aquí.

## 11. Alternativa descartada (principal): cron que barre en vez de caducar al consultar

**Qué era.** Un segundo Route Handler bajo `app/api/`, llamado por el cron de Vercel cada pocos
minutos, que barriera todas las filas vencidas de todas las empresas y las pasara a error.

**Por qué es tentadora.** La consulta se quedaría de **solo lectura**, sin el `UPDATE` de `## 6.6`, y
la pantalla de QC-107 no tendría que disparar ninguna escritura para pintar. Además la caducidad
ocurriría aunque nadie mirara, que es lo que uno espera de un «tiempo agotado».

**Por qué se descarta.** Porque **`[D12]` ya la descartó a sabiendas**, y las razones aguantan el
diseño: sería **un segundo Route Handler con su propio calendario** en la ficha que monta el primero
del repo, con su propia autenticación —el cron de Vercel también hay que autenticarlo—, su propio
barrido sin ámbito de empresa (una consulta global sobre una tabla multiempresa, que es justo lo que
`docs/architecture.md > Dominio` obliga a justificar) y su propio test. Y resuelve un problema que
nadie tiene: si **nadie mira** el estado de la tanda, que la fila diga «en cola» un rato más no le
cuesta nada a nadie.

**Qué se pierde.** Que una fila caducada lo esté solo desde que alguien pregunta, así que un informe
que leyera la tabla por fuera vería «en cola» en algo muerto. Se acepta: hoy nadie lee esa tabla por
fuera, y el día que alguien lo haga, el barrido es una ficha propia — igual que la poda de `[D14]`
(pregunta abierta 1).

## 12. Alternativa descartada (secundaria): una tabla de mensajes vistos para la idempotencia

**Qué era.** Una tercera tabla, `processed_messages(message_id, processed_at)`, con `INSERT` único al
principio del trabajo: si el `INSERT` choca, el mensaje ya se procesó.

**Por qué se descarta.** Hace **dos** afirmaciones donde hay una: la tabla diría «este mensaje ya se
vio» y la fila diría «este archivo ya está listo», y esas dos pueden discrepar —mensaje anotado y fila
sin terminar porque el proceso murió en medio, y entonces el archivo **no se procesa nunca** y nada lo
reintenta—. El `claim` de `## 6.3` no puede discrepar consigo mismo: **el candado y el resultado son
la misma fila**. Además cuesta una tabla más, con su empresa, su RLS y su poda, en una ficha que ya
añade dos.

**Qué se pierde.** La traza de «cuántos mensajes distintos tocaron esta fila»; se sustituye por la
columna `attempts`, que es más barata y dice casi lo mismo.
