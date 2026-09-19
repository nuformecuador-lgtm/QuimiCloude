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

(pendiente)

## Lo que T8 verifico contra el paquete instalado

`@upstash/qstash@2.11.3`, leido en
`node_modules/.pnpm/@upstash+qstash@2.11.3/node_modules/@upstash/qstash/client-CsnfJpnA.d.ts`.
No de memoria y no de la documentacion: del paquete, como hizo QC-108 con `@google/genai`.

| Lo que `design.md > 8` dejaba abierto | Lo que dice el paquete | Veredicto |
|---|---|---|
| La firma real de `Receiver.verify` | `verify(request: VerifyRequest): Promise<boolean>`, con `VerifyRequest = { signature: string; body: string; url?: string; clockTolerance?: number; upstashRegion?: string }` | **coincide** |
| Como se construye el `Receiver` | `new Receiver({ currentSigningKey?, nextSigningKey?, devMode? })` — las **dos** claves vivas a la vez, que es la rotacion que el diseno describe | **coincide** |
| Nombre de la cabecera de la **firma** | **`upstash-signature`**, escrito en el propio tipo `VerifyRequest` | **cerrado** |
| La opcion del tope de reintentos al publicar | `retries?: number` en `PublishRequest`; `publishJSON` devuelve `{ messageId, url }` | **coincide** |
| Nombre de la cabecera del **identificador de mensaje** | **No aparece en el paquete**: el SDK no lee esa cabecera en ningun punto —ni en los tipos, ni en el bundle, ni en el README—. La cierra el leader contra la documentacion del proveedor (`upstash.com/docs/qstash/howto/receiving`, 2026-09-18): es **`Upstash-Message-Id`** | **cerrado** |

**Un matiz que el diseno no preveia y que el adaptador absorbe.** `Receiver.verify` **lanza
`SignatureError`** cuando la firma es invalida; **no devuelve `false`**. El puerto `QueueSignature`
promete `Promise<boolean>` y «nunca lanza por una firma mala», asi que el adaptador captura y
devuelve `false`. No es una desviacion del diseno: es exactamente el sitio donde el diseno dijo que
se reconciliaria («quien conoce el nombre real es su adaptador»).

**El DESCONOCIDO esta cerrado.** El paquete no podia cerrarlo —el SDK nunca lee esa cabecera—, asi
que se elevo en vez de rellenarlo con un supuesto; el leader lo verifico contra la documentacion del
proveedor el 2026-09-18 y el valor coincide con el que ya estaba implementado, `upstash-message-id`,
buscado sin distinguir mayusculas. El codigo no cambia.

**El analisis de degradacion se queda escrito, porque sigue siendo la razon de por que esto no era
critico:** la idempotencia **no depende** de esa cabecera. Su candado es el `UPDATE ... WHERE
status='queued' ... RETURNING`, que es atomico; `queue_message_id` solo aporta la proteccion
secundaria de que un mensaje viejo no reclame una fila re-encolada.

**Dato del proveedor anotado y no usado:** la entrega trae tambien `Upstash-Retried`, el numero de
reintentos ya gastados. El diseno no la pide y no se consume; queda apuntada para quien diagnostique
un archivo que agoto los reintentos.

## Mapa R1..R27 -> test

(pendiente)

## Salida de los tests

(pendiente)
