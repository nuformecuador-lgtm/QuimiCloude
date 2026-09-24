// El esquema de entrada de encolar una tanda: estrategia + rutas (R4).

import { describe, expect, it } from 'vitest';

import { enqueueBatchSchema } from '@/lib/modules/documentos/domain/enqueue-input';
import { MAX_FILES_PER_BATCH } from '@/lib/modules/documentos/domain/limits';

function rutasDe(cuantas: number): string[] {
  return Array.from({ length: cuantas }, (_, indice) => `empresa/archivo-${indice}.pdf`);
}

describe('documentos — esquema de entrada de encolar (R4)', () => {
  it('R4 — cero rutas se rechaza', () => {
    expect(enqueueBatchSchema.safeParse({ strategy: 'catalogo', paths: [] }).success).toBe(false);
  });

  it('R4 — el tope exacto de MAX_FILES_PER_BATCH se acepta', () => {
    const resultado = enqueueBatchSchema.safeParse({
      strategy: 'catalogo',
      paths: rutasDe(MAX_FILES_PER_BATCH),
    });
    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data.paths).toHaveLength(MAX_FILES_PER_BATCH);
  });

  it('R4 — MAX_FILES_PER_BATCH + 1 rutas se rechaza ENTERA, usando la constante y no un literal', () => {
    const resultado = enqueueBatchSchema.safeParse({
      strategy: 'catalogo',
      paths: rutasDe(MAX_FILES_PER_BATCH + 1),
    });
    expect(resultado.success).toBe(false);
  });

  it('R4 — una estrategia fuera del enum cerrado se rechaza', () => {
    for (const ajena of ['recorte', 'CATALOGO', '', 'formulaX']) {
      expect(
        enqueueBatchSchema.safeParse({ strategy: ajena, paths: rutasDe(1) }).success,
        ajena,
      ).toBe(false);
    }
  });

  it('R4 — las dos estrategias del enum se aceptan', () => {
    for (const estrategia of ['catalogo', 'formula']) {
      expect(
        enqueueBatchSchema.safeParse({ strategy: estrategia, paths: rutasDe(1) }).success,
      ).toBe(true);
    }
  });

  it('R4 — una ruta vacia dentro de la tanda se rechaza', () => {
    expect(enqueueBatchSchema.safeParse({ strategy: 'catalogo', paths: [''] }).success).toBe(false);
  });

  it('R4 — un campo desconocido se rechaza en vez de ignorarse', () => {
    expect(
      enqueueBatchSchema.safeParse({ strategy: 'catalogo', paths: rutasDe(1), companyId: 'otra' })
        .success,
    ).toBe(false);
  });
});
