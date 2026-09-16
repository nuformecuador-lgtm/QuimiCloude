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
  UPLOAD_LINK_TTL_SECONDS,
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

export {
  createConvertPdfs,
  type ConversionFailure,
  type ConversionResult,
  type ConversionSuccess,
  type ConvertPdfDeps,
  type PdfOutput,
  type PdfToConvert,
} from './domain/convert-pdf';
