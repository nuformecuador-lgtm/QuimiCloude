/**
 * El puerto de LECTURA de los recortes de un archivo: lo que la revision de catalogo necesita para
 * mostrarlos, distinto de `CropStorage` -que solo sabe subir- porque subir y listar-para-mostrar
 * son operaciones de momentos distintos del ciclo de vida.
 */

export interface CropCatalog {
  /** Las rutas completas de los recortes que ya existen para ese archivo de esa empresa. */
  list(companyId: string, documentFileId: string): Promise<readonly string[]>;
  /** Una URL de lectura firmada para esa ruta, valida durante `expiresInSeconds`. */
  createSignedReadUrl(path: string, expiresInSeconds: number): Promise<string>;
}
