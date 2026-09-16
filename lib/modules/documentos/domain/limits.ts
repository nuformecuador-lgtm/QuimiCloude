/**
 * Los limites del modulo, cada uno declarado UNA SOLA VEZ.
 *
 * Que vivan aqui y en ningun otro sitio no es orden por gusto: un numero repetido en dos archivos
 * se desincroniza en silencio el dia que uno de los dos cambia, y entonces el codigo aplica dos
 * limites distintos segun por donde entre la operacion. Quien necesite uno de estos valores lo
 * IMPORTA; nadie lo vuelve a escribir.
 *
 * Dominio puro: este archivo no importa nada.
 */

/** Cuantos archivos admite una tanda. Por encima de esto la tanda se rechaza ENTERA. */
export const MAX_FILES_PER_BATCH = 10;

/**
 * Cuantas paginas admite un PDF. El numero de paginas importa tanto como el peso: un archivo
 * liviano con cientos de paginas cuesta cientos de renders y cientos de llamadas de IA, asi que un
 * limite solo de tamano no protegeria de nada.
 *
 * Solo se sabe ABRIENDO el archivo, asi que lo aplica la conversion y no el momento de firmar.
 */
export const MAX_PDF_PAGES = 50;

/**
 * Resolucion a la que se rasteriza cada pagina. Es donde el texto pequeno sigue siendo legible sin
 * disparar el peso de la imagen.
 */
export const PAGE_RENDER_DPI = 150;

/**
 * Cuanto vive un enlace de LECTURA firmado.
 *
 * Este plazo SI lo elige este modulo: la firma de lectura se pide con el y el servicio lo aplica.
 * Tiempo de sobra para que quien procese la tanda lea el archivo, y corto para que un enlace
 * filtrado sirva de poco.
 */
export const READ_LINK_TTL_SECONDS = 15 * 60;

/**
 * Cuanto vive un enlace de SUBIDA firmado.
 *
 * **Lo fija el PROVEEDOR. Este modulo NO lo elige y, por tanto, NO lo promete.** La operacion de
 * firmar una subida no acepta ningun plazo —solo recibe la ruta—, asi que este numero no viaja a
 * ninguna llamada: se declara aqui UNICAMENTE para poder informar cuando muere el enlace. Si el
 * proveedor cambiara su plazo, este valor quedaria obsoleto sin que nada fallara, porque nunca fue
 * una garantia de este codigo.
 */
export const PROVIDER_UPLOAD_LINK_TTL_SECONDS = 2 * 60 * 60;

/**
 * Tamano maximo por archivo, en bytes.
 *
 * **Este valor tiene que COINCIDIR con el `fileSizeLimit` configurado en el bucket, y el codigo de
 * este modulo NO LO HACE CUMPLIR.** Quien rechaza un archivo demasiado grande es el servicio de
 * almacenamiento, porque el servidor nunca ve los bytes: viajan del navegador al bucket sin
 * atravesar la aplicacion. Se declara aqui para que el numero tenga un sitio unico y citable al
 * configurar el bucket; comprobarlo desde el codigo seria fingir una garantia que no existe.
 */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
