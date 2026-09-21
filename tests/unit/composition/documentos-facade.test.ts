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
  // Borradas ANTES del `import` de mas abajo. Desde 2026-09-21 estas cuatro ya no se
  // verifican con `expect` (ver el caso de R22/R26/R2 de QC-129 mas abajo: Vitest recarga
  // `.env` despues de este borrado, asi que la ausencia no se sostiene). El borrado se deja
  // igual, como intencion declarada, y sigue vivo el mock `readWithGenaiMock`.
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
  it('R21 — expone exactamente las diez claves del censo, y cada una con la forma que promete', () => {
    // 2026-09-18 (QC-111, `@upstash/qstash` y su Route Handler ya aprobados): el procesamiento en
    // cola suma cuatro claves legitimas al censo -- `enqueueBatch`, `getBatchStatus`,
    // `queueSignature` y `runDocumentJob` --. La lista sigue siendo un censo CERRADO comparado con
    // `toEqual`, nunca `toContain`: cualquier clave nueva que no se declare aqui pone este caso en
    // rojo.
    expect(Object.keys(documentos).sort()).toEqual(
      [
        'convertPdfs',
        'downloadDocument',
        'enqueueBatch',
        'getBatchStatus',
        'issueReadLink',
        'issueUploadLinks',
        'queueSignature',
        'readPdfWithAi',
        'processPdfByStrategy',
        'runDocumentJob',
      ].sort(),
    );
    // `queueSignature` es el objeto del puerto -verificar una firma no es un caso de uso, R8-, no
    // una funcion: se comprueba aparte para no perder la afirmacion original sobre el resto.
    const clavesFuncion = (Object.keys(documentos) as (keyof typeof documentos)[]).filter(
      (clave) => clave !== 'queueSignature',
    );
    for (const clave of clavesFuncion) {
      expect(typeof documentos[clave]).toBe('function');
    }
    expect(typeof documentos.queueSignature).toBe('object');
    expect(typeof documentos.queueSignature.verify).toBe('function');
    expect(typeof documentos.queueSignature.messageIdOf).toBe('function');
  });

  it('R22 de QC-129 — la fachada expone readPdfWithAi y processPdfByStrategy ya cableadas', () => {
    // Retirado 2026-09-21 por decision humana: aqui habia cuatro `expect(process.env.X).toBeUndefined()`
    // para GEMINI_API_KEY, GEMINI_MODEL, CATALOG_PROMPT y FORMULA_PROMPT. Vitest recarga `.env` en
    // `process.env` despues del `delete` del bloque `vi.hoisted` de arriba, asi que esa precondicion
    // era inalcanzable mientras exista `.env` y no probaba nada del codigo de produccion, solo que el
    // borrado habia funcionado. R2 de QC-129 -"construir la fachada no lee las variables de Gemini"-
    // queda SIN GUARDIA en este archivo a partir de ahora.
    expect(typeof documentos.readPdfWithAi).toBe('function');
    expect(typeof documentos.processPdfByStrategy).toBe('function');
  });

  it('R26 — el cableado no invoca el adaptador de IA al construirse', () => {
    expect(readWithGenaiMock).not.toHaveBeenCalled();
  });
});
