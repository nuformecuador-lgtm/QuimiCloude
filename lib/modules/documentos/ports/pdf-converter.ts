/**
 * El puerto de la conversion: las dos formas de leer un PDF —sus paginas como imagen y su texto—,
 * dichas sin nombrar ninguna libreria.
 *
 * El dominio decide QUE se convierte y con que limites; COMO se hace es del adaptador driven, que
 * es el unico archivo que conoce al tercero. Cambiar de libreria es reescribir ese archivo, no
 * buscarla por el repositorio.
 */

export type RenderedPage = {
  readonly pageNumber: number;
  readonly png: Uint8Array;
};

export interface PdfConverter {
  /**
   * Cuantas paginas tiene el archivo.
   *
   * Es una operacion APARTE de `renderPages` a proposito: el tope de paginas se aplica ANTES de
   * renderizar, y un puerto que solo devolviera paginas ya renderizadas obligaria a hacer todos los
   * renders justo para poder rechazarlos.
   */
  countPages(pdf: Uint8Array): Promise<number>;
  extractText(pdf: Uint8Array): Promise<string>;
  renderPages(pdf: Uint8Array, dpi: number): Promise<readonly RenderedPage[]>;
}
