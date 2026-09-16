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

/** Construye la ruta de un archivo nuevo de esa empresa. El nombre lo pone el servidor, no el cliente. */
export function buildDocumentPath(companyId: string): string {
  return `${companyId}/${crypto.randomUUID()}${PDF_EXTENSION}`;
}

/**
 * `true` si la ruta cae DENTRO de la empresa indicada.
 *
 * La comparacion es por SEGMENTO COMPLETO y no con un `startsWith` pelado: con el prefijo a secas,
 * `empresa-A2/x.pdf` pasaria como ruta de `empresa-A` y una empresa leeria los archivos de otra
 * solo por como se llama. Ademas se exige que haya algo DESPUES del segmento de empresa: la carpeta
 * de la empresa, sola, no es la ruta de ningun archivo.
 */
export function isPathInCompany(path: string, companyId: string): boolean {
  if (companyId.length === 0) return false;
  const [head, ...rest] = path.split('/');
  return head === companyId && rest.length > 0 && rest.join('/').length > 0;
}
