/**
 * La ruta del archivo dentro del bucket, y el UNICO sitio del modulo donde se escribe su formato.
 *
 * ```
 * <companyId>/<uuid>.pdf
 * ```
 *
 * Como estas subidas no dejan ninguna fila en la base, no hay `company_id` que filtrar: **el
 * aislamiento por empresa ES la ruta**. Por eso el formato tiene un solo dueno —si dos archivos lo
 * escribieran, uno de los dos podria dejar de empezar por la empresa sin que nada avise— y por eso
 * el nombre que manda quien sube NO entra en la ruta: sin usarlo, la travesia de directorios es
 * inexpresable.
 *
 * `crypto.randomUUID()` es un GLOBAL del runtime (Node >= 19 y el borde), asi que no hace falta
 * importar nada y el dominio sigue sin conocer la plataforma. Es el mismo criterio con el que el
 * modulo de observabilidad genera su identificador de peticion.
 */

/** Extension unica: este bucket solo guarda PDFs. */
const PDF_EXTENSION = '.pdf';

/** Extension unica del bucket de recortes: cada region se sube como PNG. */
const CROP_EXTENSION = '.png';

/** Construye la ruta de un archivo nuevo de esa empresa. El nombre lo pone el servidor, no el cliente. */
export function buildDocumentPath(companyId: string): string {
  return `${companyId}/${crypto.randomUUID()}${PDF_EXTENSION}`;
}

/**
 * Construye la ruta de un recorte, agrupado por el archivo del que salio. `index` empieza en 1 y
 * numera las regiones DENTRO de su pagina, en el orden en que la IA las devolvio.
 */
export function buildCropPath(
  companyId: string,
  documentFileId: string,
  pageNumber: number,
  index: number,
): string {
  return `${companyId}/${documentFileId}/${pageNumber}-${index}${CROP_EXTENSION}`;
}

/**
 * `true` si la ruta cae DENTRO de la empresa indicada.
 *
 * La comparacion es por SEGMENTO COMPLETO y no con un `startsWith` pelado: con el prefijo a secas,
 * `empresa-A2/x.pdf` pasaria como ruta de `empresa-A` y una empresa leeria los archivos de otra
 * solo por como se llama. Ademas se exige que haya algo DESPUES del segmento de empresa: la carpeta
 * de la empresa, sola, no es la ruta de ningun archivo.
 *
 * Y NINGUN segmento puede ser `..`, empiece la ruta por donde empiece: `empresa-A/../empresa-B/x.pdf`
 * arranca con el segmento correcto y, sin embargo, apunta FUERA de la empresa en cuanto alguien la
 * normalice. Comparar solo el primer segmento dejaria pasar exactamente esa ruta.
 */
export function isPathInCompany(path: string, companyId: string): boolean {
  if (companyId.length === 0) return false;
  const [head, ...rest] = path.split('/');
  if (head !== companyId || rest.length === 0 || rest.join('/').length === 0) return false;
  return !rest.includes('..');
}

/** Nombre de archivo de un recorte: `<pagina>-<n>.png`, los dos numericos. */
const CROP_FILENAME_PATTERN = /^\d+-\d+\.png$/;

/**
 * `true` si `path` es EXACTAMENTE el recorte de esa empresa y ese archivo: tres segmentos, el
 * primero la empresa, el segundo el archivo, el tercero con la forma `<pagina>-<n>.png`.
 *
 * Exigir tres segmentos exactos, y no un `startsWith`, es lo que rechaza otra empresa, otro
 * archivo, una extension distinta y cualquier `..` que pretenda colarse como segmento propio: con
 * el largo fijo, un segmento igual a `..` nunca puede desviar la ruta fuera de estos dos
 * identificadores.
 */
export function isCropPathOf(path: string, companyId: string, documentFileId: string): boolean {
  if (companyId.length === 0 || documentFileId.length === 0) return false;
  const segments = path.split('/');
  if (segments.length !== 3) return false;
  const [company, file, filename] = segments;
  if (company !== companyId || file !== documentFileId) return false;
  return CROP_FILENAME_PATTERN.test(filename ?? '');
}
