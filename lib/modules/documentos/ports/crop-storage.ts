/**
 * El puerto de subida de los recortes: una sola operacion, subir bytes a una ruta.
 *
 * No firma, no descarga y no borra porque es lo unico que este paso necesita; `DocumentStorage`
 * queda intacto, atado a su propio bucket y a su propio papel de firmar subidas para el navegador.
 */

export interface CropStorage {
  /** Sube los bytes de un PNG a una ruta del bucket de recortes. Lanza si no puede. */
  upload(path: string, png: Uint8Array): Promise<void>;
}
