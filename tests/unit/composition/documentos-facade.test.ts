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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { readWithGenaiMock, descargaRealMock, descargaDobleMock } = vi.hoisted(() => {
  // Borradas ANTES del `import` de mas abajo. Desde 2026-09-21 estas cuatro ya no se
  // verifican con `expect` (ver el caso de R22/R26/R2 de QC-129 mas abajo: Vitest recarga
  // `.env` despues de este borrado, asi que la ausencia no se sostiene). El borrado se deja
  // igual, como intencion declarada, y siguen vivos los mocks de mas abajo.
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.CATALOG_PROMPT;
  delete process.env.FORMULA_PROMPT;
  return {
    readWithGenaiMock: vi.fn(),
    descargaRealMock: vi.fn(async () => new Uint8Array([1])),
    descargaDobleMock: vi.fn(async () => new Uint8Array([2])),
  };
});

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai', () => ({
  readWithGenai: readWithGenaiMock,
}));
// Los DOS adaptadores del almacenamiento, doblados a la vez: la eleccion se observa mirando cual
// de los dos recibio la llamada, que es la unica forma de afirmar sobre el cableado sin bucket.
vi.mock('@/lib/modules/documentos/adapters/driven/storage/document-storage-supabase', () => ({
  createDocumentSignedUpload: vi.fn(),
  createDocumentSignedReadUrl: vi.fn(),
  downloadDocument: descargaRealMock,
  removeDocument: vi.fn(),
}));
vi.mock('@/lib/modules/documentos/adapters/driven/storage/document-storage-memory', () => ({
  documentStorageMemory: {
    createSignedUpload: vi.fn(),
    createSignedReadUrl: vi.fn(),
    download: descargaDobleMock,
    remove: vi.fn(),
  },
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

// La bifurcacion por entorno de `design.md > 8` de QC-107, observada por el puerto del
// almacenamiento: los tres puertos se eligen con la MISMA consulta, asi que doblar uno basta para
// afirmar cual de las dos ramas corre. `downloadDocument` es el camino mas corto hasta el puerto
// —no exige ningun permiso, solo que la ruta caiga bajo la empresa del actor—.
describe('documentos — la bifurcacion de los dobles de extremo a extremo', () => {
  const VARIABLE = 'DOCUMENTS_E2E_DOUBLES';
  const ACTOR = { id: 'quien-sea', companyId: 'empresa-a', permissions: [] };
  const RUTA = 'empresa-a/00000000-0000-4000-8000-000000000000.pdf';

  beforeEach(() => {
    delete process.env[VARIABLE];
    descargaRealMock.mockClear();
    descargaDobleMock.mockClear();
  });

  afterEach(() => {
    delete process.env[VARIABLE];
  });

  it('sin la variable de entorno, la composicion elige los adaptadores reales (R20)', async () => {
    expect(process.env[VARIABLE]).toBeUndefined();

    await documentos.downloadDocument(ACTOR, RUTA);

    expect(descargaRealMock).toHaveBeenCalledWith(RUTA);
    expect(descargaDobleMock).not.toHaveBeenCalled();
  });

  it('con la variable, la composicion elige los dobles (R20)', async () => {
    process.env[VARIABLE] = '1';

    await documentos.downloadDocument(ACTOR, RUTA);

    expect(descargaDobleMock).toHaveBeenCalledWith(RUTA);
    expect(descargaRealMock).not.toHaveBeenCalled();
  });
});
