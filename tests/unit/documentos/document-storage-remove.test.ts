// `remove` del puerto `DocumentStorage`, la cuarta operacion que gana en QC-111 (R14).
//
// Ningun caso de este archivo toca la red: `@supabase/storage-js` se dobla con `vi.mock`, igual que
// el adaptador de IA dobla `@google/genai`.

import { afterEach, describe, expect, it, vi } from 'vitest';

const remove = vi.fn();
const from = vi.fn(() => ({ remove }));

vi.mock('@supabase/storage-js', () => ({
  StorageClient: vi.fn(function StorageClientDouble() {
    return { from };
  }),
}));

const REQUIRED_VARS = ['SUPABASE_STORAGE_URL', 'SUPABASE_DOCUMENTS_BUCKET', 'SUPABASE_STORAGE_KEY'] as const;

function configurarEnv(): void {
  process.env.SUPABASE_STORAGE_URL = 'https://proyecto.supabase.co';
  process.env.SUPABASE_DOCUMENTS_BUCKET = 'documentos-privados';
  process.env.SUPABASE_STORAGE_KEY = 'credencial';
}

describe('documentos — DocumentStorage.remove (R14)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
    remove.mockReset();
    from.mockClear();
  });

  it('R14 — borra la ruta pasandola como lista de UN elemento a la libreria', async () => {
    configurarEnv();
    remove.mockResolvedValueOnce({ data: [{ name: 'empresa/archivo.pdf' }], error: null });

    const { removeDocument } = await import(
      '@/lib/modules/documentos/adapters/driven/storage/document-storage-supabase'
    );

    await removeDocument('empresa/archivo.pdf');

    expect(remove).toHaveBeenCalledWith(['empresa/archivo.pdf']);
  });

  it('R14 — si la libreria devuelve error, lo envuelve nombrando la operacion y la ruta', async () => {
    configurarEnv();
    remove.mockResolvedValueOnce({ data: null, error: { message: 'bucket caido' } });

    const { removeDocument } = await import(
      '@/lib/modules/documentos/adapters/driven/storage/document-storage-supabase'
    );

    await expect(removeDocument('empresa/archivo.pdf')).rejects.toThrow(/borrar.*empresa\/archivo\.pdf.*bucket caido/);
  });

  it('R14 — el puerto expone `remove` y el adaptador la implementa como funcion', async () => {
    configurarEnv();
    const adaptador = await import(
      '@/lib/modules/documentos/adapters/driven/storage/document-storage-supabase'
    );
    expect(typeof adaptador.removeDocument).toBe('function');
  });
});
