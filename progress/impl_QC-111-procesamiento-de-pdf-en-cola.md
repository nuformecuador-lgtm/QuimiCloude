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

(pendiente)

## Mapa R1..R27 -> test

(pendiente)

## Salida de los tests

(pendiente)
