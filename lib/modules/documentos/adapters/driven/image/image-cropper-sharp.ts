import sharp from 'sharp';

import type { CropRegion } from '../../../ports/image-cropper';

/**
 * Implementa el puerto del recorte. **UNICO archivo del repositorio que importa la libreria de
 * recorte de imagen**, y esa no es una preferencia de orden: es la condicion con la que la
 * dependencia fue aprobada. Sustituirla tiene que ser reescribir este archivo, no buscarla por
 * el arbol.
 *
 * El puerto habla en proporcion (0..1) porque quien conoce el tamano real del PNG es esta
 * libreria, no el dominio; aqui se convierte la proporcion a pixeles usando ese tamano real.
 */

/** Texto del fallo, a secas, sin arrastrar la pila de la libreria al mensaje. */
function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Redondea y fuerza un minimo de 1. Es una defensa TECNICA, no un umbral de negocio: una region
 * que redondea a 0 pixeles no es recortable por ninguna libreria, y este minimo solo evita
 * invocarla con un rectangulo vacio. No descarta nada por tamano.
 */
function toPixelSize(proportion: number, dimension: number): number {
  return Math.max(1, Math.round(proportion * dimension));
}

/**
 * `crop` del puerto: convierte la region de proporcion a pixeles con el tamano real del PNG,
 * la recorta a esos limites reales por si el redondeo se pasa de largo, y devuelve otro PNG.
 */
export async function cropImage(png: Uint8Array, region: CropRegion): Promise<Uint8Array> {
  const image = sharp(png);

  let width: number | undefined;
  let height: number | undefined;
  try {
    ({ width, height } = await image.metadata());
  } catch (cause) {
    throw new Error(`fallo al leer el tamano de la imagen a recortar: ${describeCause(cause)}`);
  }
  if (width === undefined || height === undefined) {
    throw new Error('fallo al leer el tamano de la imagen a recortar: metadata sin ancho o alto');
  }

  const left = Math.min(Math.round(region.x * width), width - 1);
  const top = Math.min(Math.round(region.y * height), height - 1);
  const extractWidth = Math.min(toPixelSize(region.width, width), width - left);
  const extractHeight = Math.min(toPixelSize(region.height, height), height - top);

  try {
    return new Uint8Array(
      await image
        .extract({ left, top, width: extractWidth, height: extractHeight })
        .png()
        .toBuffer(),
    );
  } catch (cause) {
    throw new Error(`fallo al recortar la imagen: ${describeCause(cause)}`);
  }
}
