// El esquema de una region de recorte y su ajuste al borde de la pagina. Todo el archivo es
// dominio puro: sin red, sin bucket, sin bytes de imagen de verdad.

import { describe, expect, it } from 'vitest';

import {
  clampRegionToPage,
  cropRegionSchema,
  type CropRegionInput,
} from '@/lib/modules/documentos/domain/crop-region';

function region(overrides: Partial<Record<'page' | 'x' | 'y' | 'width' | 'height', unknown>> = {}) {
  return { page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.2, ...overrides };
}

/** Igual que `region`, pero tipada como una region ya valida: para pasarla a `clampRegionToPage`. */
function regionValida(overrides: Partial<CropRegionInput> = {}): CropRegionInput {
  return { page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.2, ...overrides };
}

describe('documentos — esquema de la region de recorte', () => {
  describe('regiones validas (R4, R6)', () => {
    it('R4 — una region dentro de la pagina se acepta', () => {
      expect(cropRegionSchema.safeParse(region()).success).toBe(true);
    });

    it('R6 — los bordes 0 y 1 son validos para x/y, y un ancho o alto de 1 tambien', () => {
      expect(cropRegionSchema.safeParse(region({ x: 0, y: 0, width: 1, height: 1 })).success).toBe(true);
      expect(cropRegionSchema.safeParse(region({ x: 1, y: 1, width: 1, height: 1 })).success).toBe(true);
    });
  });

  describe('regiones invalidas: fuera de [0,1], negativas, cero o no numericas (R4, R6)', () => {
    it('R6 — x, y, width o height fuera de [0,1] se rechazan', () => {
      expect(cropRegionSchema.safeParse(region({ x: -0.1 })).success).toBe(false);
      expect(cropRegionSchema.safeParse(region({ y: 1.1 })).success).toBe(false);
      expect(cropRegionSchema.safeParse(region({ width: 1.5 })).success).toBe(false);
      expect(cropRegionSchema.safeParse(region({ height: -0.5 })).success).toBe(false);
    });

    it('R6 — un ancho o alto de cero se rechaza: tienen que ser ESTRICTAMENTE mayores que cero', () => {
      expect(cropRegionSchema.safeParse(region({ width: 0 })).success).toBe(false);
      expect(cropRegionSchema.safeParse(region({ height: 0 })).success).toBe(false);
    });

    it('R6 — un valor no numerico o no finito se rechaza', () => {
      expect(cropRegionSchema.safeParse(region({ x: '0.1' })).success).toBe(false);
      expect(cropRegionSchema.safeParse(region({ width: Number.NaN })).success).toBe(false);
      expect(cropRegionSchema.safeParse(region({ height: Number.POSITIVE_INFINITY })).success).toBe(false);
    });

    it('R4 — `page` en 0 o decimal se rechaza', () => {
      expect(cropRegionSchema.safeParse(region({ page: 0 })).success).toBe(false);
      expect(cropRegionSchema.safeParse(region({ page: 1.5 })).success).toBe(false);
      expect(cropRegionSchema.safeParse(region({ page: -1 })).success).toBe(false);
    });
  });

  describe('el ajuste al borde (R7)', () => {
    it('R7 — desbordada por la DERECHA: el ancho se recorta hasta el borde, x no se mueve', () => {
      const ajustada = clampRegionToPage(regionValida({ x: 0.8, width: 0.5 }));
      expect(ajustada.x).toBeCloseTo(0.8);
      expect(ajustada.width).toBeCloseTo(0.2);
    });

    it('R7 — desbordada por ABAJO: el alto se recorta hasta el borde, y no se mueve', () => {
      const ajustada = clampRegionToPage(regionValida({ y: 0.9, height: 0.4 }));
      expect(ajustada.y).toBeCloseTo(0.9);
      expect(ajustada.height).toBeCloseTo(0.1);
    });

    it('R7 — desbordada por la IZQUIERDA: x se lleva a 0', () => {
      const ajustada = clampRegionToPage(regionValida({ x: -0.3, width: 0.2 }));
      expect(ajustada.x).toBe(0);
    });

    it('R7 — desbordada por ARRIBA: y se lleva a 0', () => {
      const ajustada = clampRegionToPage(regionValida({ y: -0.2, height: 0.2 }));
      expect(ajustada.y).toBe(0);
    });

    it('R7 — una region que queda con ancho o alto CERO tras el ajuste no se rechaza aqui', () => {
      // x=1 no deja nada de ancho a la derecha: la funcion lo dice con un cero, no lanzando.
      const sinAncho = clampRegionToPage(regionValida({ x: 1, width: 0.3 }));
      expect(sinAncho.width).toBe(0);

      const sinAlto = clampRegionToPage(regionValida({ y: 1, height: 0.3 }));
      expect(sinAlto.height).toBe(0);
    });
  });
});
