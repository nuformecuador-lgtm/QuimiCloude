// La ruta de un recorte dentro del bucket de recortes. Dominio puro: cadenas fabricadas aqui, sin
// bucket ni archivo binario alguno.

import { describe, expect, it } from 'vitest';

import { buildCropPath, isPathInCompany } from '@/lib/modules/documentos/domain/document-path';

const EMPRESA = '6b1c0000-0000-4000-8000-000000000001';
const OTRA_EMPRESA = '6b1c0000-0000-4000-8000-000000000002';
const DOCUMENT_FILE_ID = 'c9a10000-0000-4000-8000-000000000009';

describe('documentos — ruta de un recorte (R12)', () => {
  it('R12 — la forma exacta es <empresa>/<id del archivo>/<pagina>-<n>.png', () => {
    const path = buildCropPath(EMPRESA, DOCUMENT_FILE_ID, 3, 2);
    expect(path).toBe(`${EMPRESA}/${DOCUMENT_FILE_ID}/3-2.png`);
  });

  it('R12 — `<n>` empieza en 1 y numera dentro de su pagina', () => {
    const primera = buildCropPath(EMPRESA, DOCUMENT_FILE_ID, 1, 1);
    const segunda = buildCropPath(EMPRESA, DOCUMENT_FILE_ID, 1, 2);
    // La misma pagina, distinto indice: son rutas distintas.
    expect(primera).toBe(`${EMPRESA}/${DOCUMENT_FILE_ID}/1-1.png`);
    expect(segunda).toBe(`${EMPRESA}/${DOCUMENT_FILE_ID}/1-2.png`);
    expect(primera).not.toBe(segunda);

    // Otra pagina reinicia su propio indice en 1, sin colisionar con la anterior.
    const otraPagina = buildCropPath(EMPRESA, DOCUMENT_FILE_ID, 2, 1);
    expect(otraPagina).toBe(`${EMPRESA}/${DOCUMENT_FILE_ID}/2-1.png`);
    expect(otraPagina).not.toBe(primera);
  });

  it('R12 — isPathInCompany es cierto para la empresa del archivo y falso para otra', () => {
    const path = buildCropPath(EMPRESA, DOCUMENT_FILE_ID, 1, 1);
    expect(isPathInCompany(path, EMPRESA)).toBe(true);
    expect(isPathInCompany(path, OTRA_EMPRESA)).toBe(false);
  });
});
