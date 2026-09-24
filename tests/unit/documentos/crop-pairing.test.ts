// Emparejamiento de recortes y filas por pagina (R25). Dominio puro.

import { describe, expect, it } from 'vitest';

import { pairCropsWithLines } from '@/lib/modules/documentos/domain/crop-pairing';

const EMPRESA = 'empresa-1';
const ARCHIVO = 'archivo-1';

function ruta(pagina: number, n: number): string {
  return `${EMPRESA}/${ARCHIVO}/${pagina}-${n}.png`;
}

describe('pairCropsWithLines — R25', () => {
  it('R25 — pagina con 2 filas y 2 recortes empareja en orden', () => {
    const filas = [{ page: 1 }, { page: 1 }];
    const recortes = [ruta(1, 2), ruta(1, 1)];

    expect(pairCropsWithLines(filas, recortes)).toEqual([ruta(1, 1), ruta(1, 2)]);
  });

  it('R25 — 2 filas y 3 recortes en la misma pagina: sin imagen propuesta', () => {
    const filas = [{ page: 1 }, { page: 1 }];
    const recortes = [ruta(1, 1), ruta(1, 2), ruta(1, 3)];

    expect(pairCropsWithLines(filas, recortes)).toEqual([null, null]);
  });

  it('R25 — huecos en el numero de recorte (1-1, 1-3) se ordenan por n, no por conteo', () => {
    const filas = [{ page: 1 }, { page: 1 }];
    const recortes = [ruta(1, 3), ruta(1, 1)];

    expect(pairCropsWithLines(filas, recortes)).toEqual([ruta(1, 1), ruta(1, 3)]);
  });

  it('sin recortes para una pagina, sus filas no llevan imagen', () => {
    const filas = [{ page: 2 }];
    expect(pairCropsWithLines(filas, [ruta(1, 1)])).toEqual([null]);
  });

  it('una fila sin pagina nunca lleva imagen propuesta', () => {
    const filas = [{ page: null }];
    expect(pairCropsWithLines(filas, [ruta(1, 1)])).toEqual([null]);
  });

  it('paginas distintas se emparejan cada una por su cuenta', () => {
    const filas = [{ page: 1 }, { page: 2 }];
    const recortes = [ruta(1, 1), ruta(2, 1)];

    expect(pairCropsWithLines(filas, recortes)).toEqual([ruta(1, 1), ruta(2, 1)]);
  });
});
