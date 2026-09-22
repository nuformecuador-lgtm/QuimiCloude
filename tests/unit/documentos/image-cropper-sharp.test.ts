// El adaptador de recorte con sharp.
//
// El PNG de prueba se construye AQUI MISMO con sharp, sin fixtures en disco y sin red: es computo
// local, igual que el resto de la suite.

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { cropImage } from '@/lib/modules/documentos/adapters/driven/image/image-cropper-sharp';

async function makePng(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer(),
  );
}

describe('documentos — el adaptador de recorte con sharp', () => {
  it('R8 — recorta y el resultado tiene el tamano esperado en pixeles, con redondeo', async () => {
    const png = await makePng(200, 100);

    const recorte = await cropImage(png, { x: 0.1, y: 0.2, width: 0.31, height: 0.33 });

    const { width, height } = await sharp(recorte).metadata();
    // 0.31 * 200 = 62; 0.33 * 100 = 33: el redondeo se afirma sobre el valor exacto.
    expect(width).toBe(62);
    expect(height).toBe(33);
  });

  it('R8 — una region que por redondeo se pasaria del borde se recorta a los limites reales', async () => {
    const png = await makePng(100, 50);

    const recorte = await cropImage(png, { x: 0.96, y: 0.96, width: 0.5, height: 0.5 });

    const { width, height } = await sharp(recorte).metadata();
    expect(width).toBeLessThanOrEqual(100 - Math.round(0.96 * 100));
    expect(height).toBeLessThanOrEqual(50 - Math.round(0.96 * 50));
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it('R8 — una region minuscula da al menos 1x1 y no lanza', async () => {
    const png = await makePng(100, 100);

    const recorte = await cropImage(png, { x: 0.5, y: 0.5, width: 0.001, height: 0.001 });

    const { width, height } = await sharp(recorte).metadata();
    expect(width).toBe(1);
    expect(height).toBe(1);
  });

  it('R8 — un input que no es un PNG hace que el error nombre la operacion que fallo', async () => {
    const noEsUnPng = new Uint8Array([1, 2, 3, 4, 5]);

    let mensaje = '';
    try {
      await cropImage(noEsUnPng, { x: 0, y: 0, width: 0.5, height: 0.5 });
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }

    expect(mensaje).toMatch(/recort|imagen/);
  });
});
