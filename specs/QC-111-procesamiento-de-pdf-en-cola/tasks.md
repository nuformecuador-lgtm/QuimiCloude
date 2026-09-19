# QC-111 — procesamiento-de-pdf-en-cola · tasks.md

> Checklist de F1.3. `[P]` = puede ir en paralelo con las tareas marcadas igual en su mismo nivel.
> Cada tarea cierra con su criterio de **Hecho**, comprobable sin interpretar.
> Nada de `app/`, `lib/` ni `db/` se toca antes de la **aprobación humana del spec (F1.4)**, y
> `@upstash/qstash` **no se instala** hasta T7.

## T0 — Lo que se HEREDA montado y NO se vuelve a crear (bloquea todo)

No es una task de escribir código: es la lista de lo que ya existe y que esta ficha **consume**. Si
algo de aquí aparece reimplementado en el diff, es un rechazo.

- [x] Leer, y dar por consumido tal cual, lo que ya montaron **QC-106**, **QC-108** y **QC-109**:
  - **Módulo `documentos` entero**: `index.ts` (barrel), `domain/`, `ports/`, `adapters/` y su bloque
    en `lib/composition/index.ts`. Esta ficha **añade** dentro; no reestructura.
  - **`domain/actor.ts`**: el tipo `Actor`, `requirePermission` y **`DOCUMENT_UPLOAD_PERMISSION`**. No
    nace ningún permiso nuevo ni ninguna constante de rol.
  - **`domain/errors.ts`**: `DocumentosError`, `UnauthorizedError`, `ValidationError`,
    `AiUnavailableError`, `UnexpectedError`. **Ningún código nuevo al catálogo** (`[D21]`).
  - **`domain/document-path.ts`**: `buildDocumentPath` y **`isPathInCompany`**, que es el aislamiento
    por ruta. No se escribe otra comparación de empresa.
  - **`domain/limits.ts`**: `MAX_FILES_PER_BATCH` (el 10), `MAX_PDF_PAGES`, `MAX_PDF_BYTES`,
    `AI_READ_TIMEOUT_SECONDS`, `MILLISECONDS_PER_SECOND`. **Ningún literal se reescribe.**
  - **`domain/read-document.ts`**: `createDownloadDocument`. Es el único camino para bajar bytes.
  - **`domain/process-pdf-by-strategy.ts`**: `createProcessPdfByStrategy`, ya cableado en la
    composición. Recibe los **bytes** y **no recibe actor**; su plazo, su tope de páginas y su
    registro viven dentro y **no se reconstruyen**.
  - **`domain/pdf-strategy.ts`**: `pdfStrategySchema` y `PdfStrategy`.
  - **`ports/document-storage.ts`**: `createSignedUpload`, `createSignedReadUrl`, `download`. **Gana
    una cuarta operación en T4** y nada más.
  - **`adapters/driven/storage/document-storage-supabase.ts`**, **`.../ai/ai-reader-genai.ts`**,
    **`.../pdf/pdf-converter-unpdf.ts`**: los tres se quedan como están salvo el `remove` de T4.
  - **`lib/shared/request-scope.ts`** (`runInRequestScope`) y el traductor de errores de
    `@/lib/modules/errores`: los usa el driving, igual que `document-upload-actions.ts`.
  - **Las dos variables del bucket privado** ya declaradas en `.env.example`. No se duplican.
- [x] Abrir `progress/impl_QC-111.md` con esta lista, para que el reviewer pueda comprobar que
      ninguno de esos archivos se reimplementó.
- **Hecho:** el implementer ha leído los archivos de arriba y `progress/impl_QC-111.md` abre con esta
  lista, para que el reviewer pueda comprobar que ninguno se reimplementó.

---

## Bloque 1 — Datos

## T1 — Esquema Prisma: dos enums y dos modelos · depende de T0

- [x] Añadir al final de `db/schema.prisma`, **sin reordenar nada de lo de arriba**,
      `DocumentStrategy`, `DocumentFileStatus`, `DocumentBatch` y `DocumentFile` tal como los fija
      `design.md > 2.2` y `> 2.3`, cada modelo con su `/// @module documentos`.
- **Hecho:** `pnpm run typecheck` verde; `tests/guards/guard-empresa-en-esquema.test.ts` verde sin
  tocar su lista `EXENTAS` (las dos tablas declaran `company_id`); `guard-arquitectura-modulos.test.ts`
  verde.

## T2 — Migración `up` + `down` · depende de T1

- [ ] `pnpm run db:migrate:create` → `db/migrations/<ts>_document_batches_and_files/migration.sql`, y
      `down.sql` **a mano**. Contenido y orden exactos en `design.md > 2.5`: enums, tablas, FK a mano
      a `companies`/`users` (drift: borrar su `DROP CONSTRAINT` de lo generado), FK compuesta contra
      `document_batches_id_company_id_key`, índices, los dos `CHECK` de `> 2.4`, y `ENABLE` +
      **`FORCE ROW LEVEL SECURITY`** en las dos tablas.
- **Hecho:** `pnpm run db:migrate` aplica; `pnpm run db:rollback` revierte y deja `_prisma_migrations`
  coherente; volver a aplicar funciona.
- **SIN MARCAR a proposito (2026-09-18).** Los dos archivos estan escritos con el contenido y el
  orden exactos de `design.md > 2.5`, pero **el criterio no se ha comprobado**: este worktree no
  tiene `.env` ni `DATABASE_URL`, asi que `db:migrate` y `db:rollback` no pudieron correr. No se
  invento ninguna credencial. Lo cierra el leader al correr el gate con una base configurada.

## T3 — Tests de integración del esquema `[P]` · depende de T2

- [ ] En `tests/integration/`: los dos `CHECK` rechazan una fila `done` sin texto y una `error` sin
      motivo; la FK compuesta rechaza un archivo cuya tanda es de otra empresa; el único
      `(company_id, path)` rechaza la ruta repetida.
- **Hecho:** los cuatro casos pasan contra la base de test. Cubre R21 y parte de R1.
- **SIN MARCAR a proposito (2026-09-18).** Los cuatro casos estan escritos, con el patron de
  `tests/integration/inventario/inventory-movements-constraints.int.test.ts` y censados en
  `tests/integration/aislamiento.json`, pero **no se han ejecutado**: sin `DATABASE_URL` el guardian
  de `tests/integration/_setup.ts` aborta antes del primer caso. Lo cierra el leader con el gate.

---

## Bloque 2 — Puertos y dominio (sin tocar QStash todavía)

## T4 — `DocumentStorage` gana `remove` `[P]` · depende de T0

- [x] Añadir `remove(path): Promise<void>` a `ports/document-storage.ts` —actualizando la frase de su
      cabecera que dice que ninguna operación borra, porque **esta es la ficha** que la levanta— y su
      implementación en `document-storage-supabase.ts`.
- **Hecho:** typecheck verde; test unitario del adaptador con el doble; `guard-arquitectura-modulos`
  verde. Cubre parte de R14.

## T5 — Los cuatro puertos nuevos `[P]` · depende de T0

- [x] `ports/document-batch-repository.ts`, `ports/processing-queue.ts`, `ports/queue-signature.ts`,
      `ports/processing-config.ts`, con las firmas de `design.md > 4`.
- **Hecho:** typecheck verde; ninguno importa `@upstash/qstash`, `next/*` ni `@prisma/client` (R24), y
  ninguno sale por el barrel.

## T6 — Dominio: esquemas, clasificación y plazos `[P]` · depende de T5

- [x] `domain/enqueue-input.ts`, `domain/queue-message.ts`, `domain/batch-status.ts`,
      `domain/failure-kind.ts` (la tabla de `design.md > 6.4`) y `domain/processing-timeouts.ts` (los
      valores por defecto **900** y **3** de `> 7`).
- **Hecho:** tests unitarios: el esquema de encolar rechaza 0 y 11 rutas usando `MAX_FILES_PER_BATCH`
  (no el literal 10) y una estrategia fuera del enum; `failureKind` clasifica los cinco casos de la
  tabla. Cubre R4, R9 y parte de R15/R16.

---

## Bloque 3 — La dependencia

## T7 — PARADA: propuesta de `@upstash/qstash` · depende de la aprobación del spec (F1.4)

- [x] Subir al humano la propuesta de `design.md > 8` con los cuatro checks y el plan B. **Aprobada**:
      se añade la fila a `docs/dependencias.md` (el texto ya está redactado en `> 8`) y **entonces** se
      instala. **No aprobada**: se para y se vuelve al leader con el plan B; no se implementan T8 ni T9
      tal como están.
- **Hecho:** fila en `docs/dependencias.md` + `package.json` con la entrada, y
  `tests/guards/guard-dependencias-aprobadas.test.ts` verde. Cubre R25.

## T8 — Adaptador de firma + cierre del DESCONOCIDO · depende de T7

- [x] `adapters/driven/queue/queue-signature-qstash.ts` con `Receiver`. **Primera acción de la task:**
      verificar contra el paquete instalado (1) la firma real de `Receiver.verify` y (2) **el nombre
      exacto de la cabecera del id de mensaje**, y anotarlo en `progress/impl_QC-111.md`. Es el
      desconocido que `design.md > 8` deja abierto a propósito.
- **Hecho:** lo verificado queda escrito; el adaptador implementa `QueueSignature`; `@upstash/qstash`
  no aparece en ningún otro archivo salvo T9.

## T9 — Adaptador de publicación `[P]` · depende de T7

- [x] `adapters/driven/queue/processing-queue-qstash.ts` con `Client.publishJSON`, la URL de destino y
      `retries` desde `ProcessingConfig`.
- **Hecho:** typecheck verde; un test comprueba que el tope de reintentos que se manda es el de la
  configuración y no un literal.

## T10 — Adaptadores de configuración y de persistencia `[P]` · depende de T2, T5

- [x] `adapters/driven/config/processing-config-env.ts` —leyendo **en la invocación**, nunca al
      importar, igual que `document-storage-config-env.ts`—.
- [x] `adapters/driven/persistence/document-batch-repository-prisma.ts` con las seis operaciones,
      incluido el `UPDATE ... WHERE status='queued' ... RETURNING` literal de `design.md > 6.3` y el
      `expireStale` acotado por tanda **y empresa**.
- **Hecho:** typecheck verde; test que comprueba que si la variable falta, el adaptador **falla
  nombrándola** y sin filtrar su valor. Cubre R23.

---

## Bloque 4 — Casos de uso

## T11 — `enqueueBatch` · depende de T5, T6

- [x] `domain/enqueue-batch.ts` con los cinco pasos **en el orden** de `design.md > 6.1`.
- **Hecho:** tests unitarios con dobles — sin permiso rechaza sin escribir fila **y sin publicar**; con
  permiso pero ruta de otra empresa rechaza la tanda entera; 11 rutas rechaza entera; el caso bueno
  escribe primero y publica después. Cubre R3, R4, R5.

## T12 — `runDocumentJob` · depende de T4, T5, T6

- [x] `domain/run-document-job.ts` con el flujo de `design.md > 6.2`, el ámbito de empresa de `> 6.5`
      (con `permissions: []`) y la clasificación de T6.
- **Hecho:** tests unitarios — éxito guarda el texto **tal cual** y llama a `remove`; fallo
  `ai_unavailable` deja la fila re-encolable y **no** llama a `remove`; fallo `unexpected` deja error a
  la primera; un `claim` que devuelve `null` no llama a la IA. Cubre R10..R17.

## T13 — `getBatchStatus` · depende de T5, T6

- [x] `domain/get-batch-status.ts` con los tres pasos de `design.md > 6.6`.
- **Hecho:** tests unitarios — sin permiso rechaza; tanda de otra empresa da **el mismo** rechazo que
  una inexistente; una fila en `queued` más vieja que el plazo vuelve como `error` con su motivo y
  **queda guardada**; una más joven no se toca. Cubre R18, R19.

## T14 — Barrel y composición · depende de T8, T9, T10, T11, T12, T13

- [x] `lib/modules/documentos/index.ts` publica **las tres fábricas** y los tipos, y **no** los
      puertos ni los adaptadores.
- [x] `lib/composition/index.ts` ata puerto → implementación dentro del bloque `documentos` que ya
      existe, **sin reordenar nada**.
- **Hecho:** `guard-arquitectura-modulos` verde; el barrel sigue importable desde un componente de
  cliente (nada de `'use server'`, `@prisma/client` ni `next/*` en su cierre); test del contrato del
  módulo actualizado.
- **Nota para T14:** aquí es donde se ejercita por primera vez `@napi-rs/canvas` de verdad en el
  despliegue (pregunta abierta 2). Si no corre en Vercel, **no se parchea**: se anota como hallazgo y
  se devuelve al leader.

---

## Bloque 5 — Bordes

## T15 — Server Actions · depende de T14

- [x] `adapters/driving/document-batch-actions.ts`: resuelve el actor con las dos caras de la sesión
      dentro de **un solo** `runInRequestScope`, valida con el mismo objeto de esquema del contrato y
      traduce el error por su `code`. Mismo patrón exacto que `document-upload-actions.ts`.
- [x] Añadir el archivo a la lista de `tests/unit/identity/session-once-per-request-actions.test.ts`.
- **Hecho:** typecheck y lint verdes, y **el archivo queda añadido a la lista de
  `tests/unit/identity/session-once-per-request-actions.test.ts`**, que descubre por disco los
  `driving/` con las dos caras de la sesión y se pone rojo si una acción supera **una** lectura.

## T16 — El Route Handler · depende de T14

- [x] `adapters/driving/document-job-route.ts` con el `POST` y `runtime = 'nodejs'`, y
      `app/api/documentos/trabajos/route.ts` con **solo** el reexport de `design.md > 5`. Los códigos
      de respuesta salen de la tabla de `> 5`.
- **Hecho:** `guard-arquitectura-modulos` verde con el primer archivo de `app/api/` del repo; el
  handler se invoca desde un test con un `Request` normal, sin levantar Next.

## T17 — Tests de integración de la ruta · depende de T16

- [x] Los tres de `[D18]`: **firma inválida** → 401 y cero efectos; **firma válida** → procesa y 200;
      **mismo mensaje dos veces** → una sola llamada a la IA, un solo texto guardado, 200 las dos
      veces.
- [ ] El de atomicidad del `claim` contra la base de test (`design.md > 9`).
- **SIN MARCAR a proposito (2026-09-18).** Este es el unico de los cuatro que necesita la base: mide
  la atomicidad real del `UPDATE ... WHERE status='queued'` bajo concurrencia, que un doble en
  memoria no puede probar (`design.md > 9` ya lo avisaba). Sin `DATABASE_URL` no se puede correr, y
  **no se escribe un test que no se puede correr**: seria afirmar algo que nadie ha comprobado. Los
  otros tres de `[D18]` si estan, con dobles y en verde.
- **Hecho:** los cuatro pasan **sin red** y sin que ninguna variable de entorno tenga valor. Cubre R26.

---

## Bloque 6 — Cierre

## T18 — `.env.example` y documentación `[P]` · depende de T10

- [x] Las seis variables de `design.md > 7`, **vacías**, en un bloque nuevo al final con su
      comentario, al estilo de los cuatro que ya hay.
- **Hecho:** ningún secreto en el diff; `./init.sh --rapido` verde. Cubre R23.

## T19 — Trazabilidad · depende de todas

- [x] `progress/impl_QC-111.md` con el mapa **`R1..R27 -> test`** completo, la lista de T0 y lo que T8
      verificó del paquete.
- **Hecho:** los 27 requisitos tienen test nombrado; ningún hueco (`CHECKPOINTS.md > Trazabilidad`).

## T20 — Gate completo · depende de T19

- [ ] `./init.sh` completo antes del PR, sin excepción.
- **Hecho:** `./init.sh` termina en verde, incluidas **todas** las guardias, y no se añadió ningún
  archivo bajo `e2e/` (R27).

---

### Orden corto

`T0 → T1 → T2 → (T3 ‖ T4 ‖ T5) → T6 → **T7 (parada humana)** → (T8 ‖ T9 ‖ T10) → (T11 ‖ T12 ‖ T13) →
T14 → (T15 ‖ T16) → T17 → T18 → T19 → T20`

**Una sola dependencia humana:** T7, la aprobación de `@upstash/qstash` en F1.4. Todo el bloque 1 y el
bloque 2 corren antes de ella, porque nada de lo que escriben nombra la librería.
