/**
 * «¿Esto es un PDF?», respondido POR EL CONTENIDO.
 *
 * Ni la extension del archivo ni el tipo que declare quien lo sube son evidencia de nada: las dos
 * cosas las escribe el cliente y las dos se pueden mentir sin esfuerzo. Lo unico que dice la verdad
 * es la firma del propio archivo, que es lo que esta funcion mira.
 *
 * Dominio puro: sin imports, sin plataforma y sin librerias. Por eso se puede ejercitar con bytes
 * fabricados en el propio test, sin un solo archivo binario en el repositorio.
 */

/** La firma con la que empieza todo PDF, en bytes: `%PDF-`. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

/** `true` solo si los primeros bytes son la firma de un PDF. Un archivo vacio o corto es `false`. */
export function isPdfContent(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_SIGNATURE.length) return false;
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
