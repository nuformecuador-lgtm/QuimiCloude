// La FACHADA ya cableada del modulo `documentos` con su lectura por IA.
//
// Lo que se afirma aqui es el CABLEADO, no el dominio: que `lib/composition` publica
// `readPdfWithAi` y `processPdfByStrategy` junto a las cuatro claves que ya tenia, que construir la
// fachada NO lee las variables de Gemini ni las del texto de los prompts (R2) ni toca la red, y
// que el adaptador de IA no se invoca al importar.
//
// Mismo criterio que `tests/unit/composition/asignaciones-facade.test.ts`: se sustituye el
// cliente Prisma entero -`lib/composition` arrastra todos los adaptadores del repo- y no hace
// falta ni Postgres ni `DATABASE_URL`.

import { describe, expect, it, vi } from 'vitest';

const { readWithGenaiMock } = vi.hoisted(() => {
  // Borradas ANTES del `import` de mas abajo: si construir la fachada leyera alguna de las
  // cuatro, o el adaptador se invocara al cablearse, este archivo nunca llegaria a los `it`.
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.CATALOG_PROMPT;
  delete process.env.FORMULA_PROMPT;
  return { readWithGenaiMock: vi.fn() };
});

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai', () => ({
  readWithGenai: readWithGenaiMock,
}));

import { documentos } from '@/lib/composition';

describe('documentos — la fachada expone la lectura con IA (fachada cableada)', () => {
  it('R21 — expone readPdfWithAi y processPdfByStrategy junto a las cuatro claves que ya tenia, y todas son funciones', () => {
    expect(Object.keys(documentos).sort()).toEqual(
      [
        'convertPdfs',
        'downloadDocument',
        'issueReadLink',
        'issueUploadLinks',
        'readPdfWithAi',
        'processPdfByStrategy',
      ].sort(),
    );
    for (const clave of Object.keys(documentos) as (keyof typeof documentos)[]) {
      expect(typeof documentos[clave]).toBe('function');
    }
  });

  it('R22, R26, R2 de QC-129 — construir la fachada con GEMINI_API_KEY, GEMINI_MODEL, CATALOG_PROMPT y FORMULA_PROMPT ausentes no lanza', () => {
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
    expect(process.env.GEMINI_MODEL).toBeUndefined();
    expect(process.env.CATALOG_PROMPT).toBeUndefined();
    expect(process.env.FORMULA_PROMPT).toBeUndefined();
    expect(typeof documentos.readPdfWithAi).toBe('function');
    expect(typeof documentos.processPdfByStrategy).toBe('function');
  });

  it('R26 — el cableado no invoca el adaptador de IA al construirse', () => {
    expect(readWithGenaiMock).not.toHaveBeenCalled();
  });
});
