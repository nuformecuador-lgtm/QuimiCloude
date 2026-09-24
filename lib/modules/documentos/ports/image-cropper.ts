/**
 * El puerto del recorte: dado un PNG y una region, devuelve el PNG recortado.
 *
 * La region habla en PROPORCION de la pagina (0..1) y no en pixeles a proposito: quien conoce el
 * tamano real del PNG es la libreria que lo decodifica, no el dominio, y pedirle pixeles al dominio
 * lo obligaria a decodificar la imagen el mismo, que es justo lo que este puerto existe para evitar.
 * Convertir proporcion a pixeles es tarea del adaptador, que es quien tiene la imagen delante.
 */

/** Region YA ajustada al borde de su pagina, en proporcion (0..1). */
export type CropRegion = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export interface ImageCropper {
  /** Recorta la region del PNG y devuelve otro PNG. Lanza si no puede. */
  crop(png: Uint8Array, region: CropRegion): Promise<Uint8Array>;
}
