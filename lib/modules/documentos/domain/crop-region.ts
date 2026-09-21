/**
 * El esquema de una region de recorte y su ajuste al borde de la pagina.
 *
 * Las cuatro medidas son proporcion de la pagina (0..1), nunca pixeles: la resolucion de
 * rasterizado puede cambiar, y unas coordenadas en pixeles quedarian invalidas en silencio el dia
 * que eso pase.
 *
 * Dominio puro: el unico import externo es `zod`.
 */

import { z } from 'zod';

/** Una region tal como llega de la IA, antes de ajustarla al borde. */
export const cropRegionSchema = z.object({
  page: z.number().int().min(1),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().gt(0).max(1),
  height: z.number().finite().gt(0).max(1),
});

export type CropRegionInput = z.infer<typeof cropRegionSchema>;

/** El objeto que la IA devuelve: una lista de regiones, posiblemente vacia. */
export const cropCoordinatesSchema = z.object({
  images: z.array(cropRegionSchema),
});

export type CropCoordinates = z.infer<typeof cropCoordinatesSchema>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Ajusta una region a los bordes de su pagina. El ancho y el alto se recortan contra lo que queda
 * DESPUES de mover `x`/`y`, asi que una region que se sale por la derecha o por abajo se acorta en
 * vez de desplazarse. El resultado puede quedar con ancho o alto en cero: eso no es un error de esta
 * funcion, es un rectangulo vacio que ya no es recortable.
 */
export function clampRegionToPage(region: CropRegionInput): CropRegionInput {
  const x = clamp(region.x, 0, 1);
  const y = clamp(region.y, 0, 1);
  const width = clamp(region.width, 0, 1 - x);
  const height = clamp(region.height, 0, 1 - y);
  return { ...region, x, y, width, height };
}
