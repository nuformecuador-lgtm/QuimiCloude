/**
 * El puerto del almacenamiento: lo que el dominio necesita del bucket, dicho sin nombrarlo.
 *
 * El caso de uso no conoce el proveedor, ni su SDK, ni su forma de firmar. Eso vive en el adaptador
 * driven, y por eso la suite puede ejercitar las operaciones con un doble en memoria, sin red y sin
 * bucket configurado.
 *
 * **Cuatro operaciones, y el borrado ya es una de ellas.** Quien procesa la tanda borra el archivo
 * SOLO tras terminar bien: mientras una fila siga en cola, procesando o en error, ningun codigo de
 * este modulo la borra.
 *
 * La lectura firmada y la descarga entran aqui —y no donde se consumen— porque el bucket es
 * PRIVADO: sin ellas, quien procese la tanda no tendria forma de leer el archivo sin conocer al
 * proveedor, que es justo lo que el puerto existe para evitar.
 */

export type SignedUpload = {
  /** Ruta DENTRO del bucket, con prefijo de empresa. Nunca una URL completa. */
  readonly path: string;
  /** Enlace firmado de subida. */
  readonly uploadUrl: string;
  /** El que consume la subida desde el navegador. */
  readonly token: string;
  /** ISO-8601: instante de emision mas la vida que el PROVEEDOR le da al enlace de subida. */
  readonly expiresAt: string;
};

export interface DocumentStorage {
  /**
   * Firma la SUBIDA de una ruta. **Sin plazo, a proposito**: el que vive un enlace de subida lo
   * impone el proveedor y nadie de este lado puede honrar otro. Pedir aqui un `expiresInSeconds`
   * que se tirara a la basura seria una mentira escrita en el contrato.
   */
  createSignedUpload(path: string): Promise<SignedUpload>;
  /** Firma la LECTURA de una ruta. Este plazo SI se cumple: el servicio lo aplica. */
  createSignedReadUrl(path: string, expiresInSeconds: number): Promise<string>;
  download(path: string): Promise<Uint8Array>;
  /** Borra la ruta del bucket. Solo se llama tras terminar bien el procesamiento del archivo. */
  remove(path: string): Promise<void>;
}
