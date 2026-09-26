// `CropCatalog` contra el bucket de recortes. Ningun caso de este archivo toca la red:
// `@supabase/storage-js` se dobla con `vi.mock`, igual que el resto de adaptadores del bucket.

import { afterEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
const createSignedUrl = vi.fn();
const from = vi.fn(() => ({ list, createSignedUrl }));

vi.mock('@supabase/storage-js', () => ({
  StorageClient: vi.fn(function StorageClientDouble() {
    return { from };
  }),
}));

const REQUIRED_VARS = ['SUPABASE_STORAGE_URL', 'SUPABASE_CROPS_BUCKET', 'SUPABASE_STORAGE_KEY'] as const;

function configurarEnv(): void {
  process.env.SUPABASE_STORAGE_URL = 'https://proyecto.supabase.co';
  process.env.SUPABASE_CROPS_BUCKET = 'recortes';
  process.env.SUPABASE_STORAGE_KEY = 'credencial-secreta';
}

const EMPRESA = 'empresa-1';
const ARCHIVO = 'archivo-1';

describe('documentos — CropCatalog contra Supabase', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
    list.mockReset();
    createSignedUrl.mockReset();
    from.mockClear();
  });

  it('list — pide el prefijo <empresa>/<archivo> y devuelve las rutas completas', async () => {
    configurarEnv();
    list.mockResolvedValueOnce({
      data: [
        { id: 'a', name: '1-1.png' },
        { id: 'b', name: '1-2.png' },
      ],
      error: null,
    });

    const { listCrops } = await import(
      '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase'
    );

    await expect(listCrops(EMPRESA, ARCHIVO)).resolves.toEqual([
      `${EMPRESA}/${ARCHIVO}/1-1.png`,
      `${EMPRESA}/${ARCHIVO}/1-2.png`,
    ]);
    expect(list).toHaveBeenCalledWith(`${EMPRESA}/${ARCHIVO}`, expect.objectContaining({ limit: expect.any(Number) }));
  });

  it('list — descarta las entradas de carpeta (id null)', async () => {
    configurarEnv();
    list.mockResolvedValueOnce({
      data: [
        { id: null, name: 'subcarpeta' },
        { id: 'a', name: '1-1.png' },
      ],
      error: null,
    });

    const { listCrops } = await import(
      '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase'
    );

    await expect(listCrops(EMPRESA, ARCHIVO)).resolves.toEqual([`${EMPRESA}/${ARCHIVO}/1-1.png`]);
  });

  it('list — si la libreria devuelve error, lo envuelve sin ningun secreto', async () => {
    configurarEnv();
    list.mockResolvedValueOnce({ data: null, error: { message: 'bucket caido' } });

    const { listCrops } = await import(
      '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase'
    );

    await expect(listCrops(EMPRESA, ARCHIVO)).rejects.toThrow(/listar.*bucket caido/);
    await expect(listCrops(EMPRESA, ARCHIVO)).rejects.not.toThrow(/credencial-secreta/);
  });

  it('createSignedReadUrl — firma con el TTL pedido', async () => {
    configurarEnv();
    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://proyecto.supabase.co/signed/1-1.png' },
      error: null,
    });

    const { createCropSignedReadUrl } = await import(
      '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase'
    );

    await expect(createCropSignedReadUrl(`${EMPRESA}/${ARCHIVO}/1-1.png`, 900)).resolves.toBe(
      'https://proyecto.supabase.co/signed/1-1.png',
    );
    expect(createSignedUrl).toHaveBeenCalledWith(`${EMPRESA}/${ARCHIVO}/1-1.png`, 900);
  });

  it('createSignedReadUrl — si la libreria devuelve error, lo envuelve sin ningun secreto', async () => {
    configurarEnv();
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'ruta inexistente' } });

    const { createCropSignedReadUrl } = await import(
      '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase'
    );

    await expect(createCropSignedReadUrl(`${EMPRESA}/${ARCHIVO}/1-1.png`, 900)).rejects.toThrow(
      /firmar.*ruta inexistente/,
    );
    await expect(createCropSignedReadUrl(`${EMPRESA}/${ARCHIVO}/1-1.png`, 900)).rejects.not.toThrow(
      /credencial-secreta/,
    );
  });

  it('importar el adaptador con las variables vacias no lanza', async () => {
    for (const name of REQUIRED_VARS) process.env[name] = '';

    const adaptador = await import(
      '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase'
    );

    expect(typeof adaptador.listCrops).toBe('function');
    expect(typeof adaptador.createCropSignedReadUrl).toBe('function');
  });
});
