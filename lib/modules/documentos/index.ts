// lib/modules/documentos/index.ts — CONTRATO PUBLICO del modulo `documentos`.
//
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente sin
// arrastrar servidor: nada de 'use server', @prisma/client ni ningun import de `next` en su cierre
// de imports.
//
// Lo que el barril publica y lo que NO, y por que:
//
//   SI — el `Actor` del modulo y su forma de exigir un permiso, los errores con su `code` estable,
//        las constantes de limite, las dos funciones puras de la ruta, la comprobacion de contenido
//        y el esquema del borde con su tipo. Todo eso es dominio: puro, sin plataforma.
//
//   NO — los PUERTOS (`ports/**`) ni los adaptadores driven: los ve solo `lib/composition`, el
//        unico sitio que ata puerto -> implementacion, y los importa por su ruta exacta.
//
//   NO — los adaptadores driving (`adapters/driving/**`): un `'use server'` en el cierre
//        transitivo de este contrato lo volveria inimportable desde un componente de cliente. Quien
//        los necesite los importa por su RUTA EXACTA.

// El actor entra por PARAMETRO en cada caso de uso: el dominio no lee sesion, cookie ni cabecera.
// `requirePermission` se publica porque es la definicion UNICA de como este modulo exige un
// permiso, no para que la repita nadie. El CODIGO del permiso se queda dentro del modulo.
export { requirePermission, type Actor } from './domain/actor';

// La jerarquia de errores con `code` estable del catalogo unico: quien traduzca decide POR el
// `code` —nunca por el texto del mensaje— y reconoce el caso con un solo `instanceof` sobre la
// clase base.
export { DocumentosError, UnauthorizedError, ValidationError } from './domain/errors';

// Los limites, en su unica definicion. Se publican para que nadie los vuelva a escribir: quien
// configure el bucket o pinte la pantalla los lee de aqui.
export {
  MAX_FILES_PER_BATCH,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  PAGE_RENDER_DPI,
  PROVIDER_UPLOAD_LINK_TTL_SECONDS,
  READ_LINK_TTL_SECONDS,
} from './domain/limits';

// «¿Esto es un PDF?», respondido por el contenido y no por la extension.
export { isPdfContent } from './domain/pdf-content';

// El formato de la ruta dentro del bucket y la comparacion de empresa, que es lo que aisla a una
// empresa de otra cuando no hay ninguna fila en la base.
export { buildDocumentPath, isPathInCompany } from './domain/document-path';

// El esquema del borde y su tipo inferido: una sola definicion de la entrada, no dos que puedan
// diverger.
export { issueUploadLinksSchema, type IssueUploadLinksInput } from './domain/upload-input';

// Las dos capacidades del modulo, publicadas como FABRICAS: quien las usa recibe el caso de uso ya
// construido y no conoce a sus dependencias. Ata puerto -> adaptador un solo sitio, que es
// `lib/composition`; aqui solo se dice QUE hay y con que forma.
export {
  createIssueUploadLinks,
  type IssueUploadLinksDeps,
  type IssuedUploadBatch,
} from './domain/issue-upload-links';

// Las DOS operaciones de LECTURA, tambien como fabricas y por el mismo motivo. Lo que sale por el
// contrato son los casos de uso —que comprueban la empresa del actor antes de tocar el puerto— y
// NUNCA las funciones del puerto: leer o descargar sin esa comprobacion no es una opcion que este
// modulo ofrezca.
export {
  createDownloadDocument,
  createIssueReadLink,
  type ReadDocumentDeps,
} from './domain/read-document';

export {
  createConvertPdfs,
  type ConversionFailure,
  type ConversionResult,
  type ConversionSuccess,
  type ConvertPdfDeps,
  type PdfOutput,
  type PdfToConvert,
} from './domain/convert-pdf';

// El plazo de la lectura con IA, en la misma seccion de arriba de los limites: quien decida cuanto
// esperar antes de dar una lectura por fallida lo lee de aqui, no lo vuelve a escribir.
export { AI_READ_TIMEOUT_SECONDS } from './domain/limits';

// El esquema del borde de la lectura con IA y su tipo inferido, mismo criterio que el esquema de
// subida de arriba: una sola definicion de la entrada.
export { aiReadInputSchema, type AiReadInput } from './domain/ai-read-input';

// El unico codigo nuevo que este modulo aporta al catalogo cerrado: el proveedor de IA no
// respondio, no estaba disponible o agoto el plazo. Lo reconoce el mismo `instanceof
// DocumentosError` de siempre.
export { AiUnavailableError } from './domain/errors';

// La lectura de un PDF con IA, publicada como FABRICA por el mismo motivo que las de arriba: quien
// la usa recibe el caso de uso ya construido y nunca ve al puerto ni a su adaptador. Atar puerto ->
// adaptador sigue siendo trabajo exclusivo de `lib/composition`.
export {
  createReadPdfWithAi,
  type AiReadResult,
  type ReadPdfWithAiDeps,
} from './domain/read-pdf-with-ai';

// La estrategia de lectura, con su esquema y su tipo: es el borde de la capacidad de abajo, asi que
// quien la invoque valida con el mismo esquema y no escribe los dos literales a mano.
export { pdfStrategySchema, type PdfStrategy } from './domain/pdf-strategy';

// El procesamiento por estrategia, tambien como FABRICA. Su puerto de registro y su puerto de
// prompt NO salen por aqui: los ve solo `lib/composition`, que es quien ata cada uno a su
// adaptador. El texto del prompt llega por dependencia, desde el entorno.
export {
  createProcessPdfByStrategy,
  type ProcessPdfByStrategyDeps,
  type ProcessPdfByStrategyInput,
  type StrategyRunResult,
} from './domain/process-pdf-by-strategy';

// El esquema del borde de ENCOLAR una tanda y su tipo inferido: mismo criterio que los esquemas de
// arriba, una sola definicion de la entrada.
export { enqueueBatchSchema, type EnqueueBatchInput } from './domain/enqueue-input';

// El estado de un archivo y el de una tanda, tal como los ve quien consulta: es lo que devuelve la
// tercera capacidad de abajo y lo que pintara la pantalla.
export {
  type BatchStatus,
  type DocumentFileStatus,
  type DocumentFileStatusEntry,
} from './domain/batch-status';

// El cuerpo que entrega la cola, con su tipo: el Route Handler valida con el MISMO esquema, no con
// una copia que pudiera diverger.
export { queueMessageSchema, type QueueMessageBody } from './domain/queue-message';

// Las TRES capacidades del procesamiento en cola, publicadas como FABRICAS por el mismo motivo que
// las de arriba: quien las usa recibe el caso de uso ya construido y nunca ve a sus puertos.
// `enqueueBatch` escribe la tanda y publica un mensaje por archivo; `runDocumentJob` es el trabajo
// que ejecuta el Route Handler por cada mensaje; `getBatchStatus` consulta y caduca. Atar puerto ->
// adaptador sigue siendo trabajo exclusivo de `lib/composition`.
export { createEnqueueBatch, type EnqueuedBatch } from './domain/enqueue-batch';
export {
  createRunDocumentJob,
  type RunDocumentJobMessage,
  type RunDocumentJobResult,
} from './domain/run-document-job';
export { createGetBatchStatus } from './domain/get-batch-status';
