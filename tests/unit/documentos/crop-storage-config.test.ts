// Configuracion del almacenamiento de los recortes.
//
// Este archivo NO hace red y NO depende de que ninguna variable tenga valor: lo que prueba es que
// la configuracion se lea EN LA INVOCACION —de modo que importar el adaptador con todo vacio no
// falle—, y que el error nombre lo que falta sin filtrar ningun valor.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { readCropStorageConfigFromEnv } from '@/lib/modules/documentos/adapters/driven/config/crop-storage-config-env';

const ADAPTADOR = '@/lib/modules/documentos/adapters/driven/storage/crop-storage-supabase';

const REQUIRED_VARS = ['SUPABASE_STORAGE_URL', 'SUPABASE_CROPS_BUCKET', 'SUPABASE_STORAGE_KEY'] as const;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('documentos — configuracion del almacenamiento de los recortes', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it('R14 — importar el adaptador con las tres variables vacias no lanza', async () => {
    for (const name of REQUIRED_VARS) process.env[name] = '';

    const adaptador = await import(ADAPTADOR);

    expect(typeof adaptador.uploadCrop).toBe('function');
  });

  it('R14 — falta SUPABASE_CROPS_BUCKET: el error la nombra y no filtra ningun valor', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    process.env.SUPABASE_STORAGE_URL = 'https://proyecto.supabase.co';
    process.env.SUPABASE_STORAGE_KEY = 'credencial-de-prueba';

    let mensaje = '';
    try {
      readCropStorageConfigFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }

    expect(mensaje).toContain('SUPABASE_CROPS_BUCKET');
    expect(mensaje).not.toContain('https://proyecto.supabase.co');
    expect(mensaje).not.toContain('credencial-de-prueba');
  });

  it('R14 — con las tres presentes devuelve las tres', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    process.env.SUPABASE_STORAGE_URL = 'https://proyecto.supabase.co';
    process.env.SUPABASE_CROPS_BUCKET = 'recortes';
    process.env.SUPABASE_STORAGE_KEY = 'credencial-de-prueba';

    expect(readCropStorageConfigFromEnv()).toEqual({
      url: 'https://proyecto.supabase.co',
      bucket: 'recortes',
      key: 'credencial-de-prueba',
    });
  });

  it('R1 — .env.example: SUPABASE_CROPS_BUCKET sigue vacia, su comentario dice PUBLICO y sigue compartiendo direccion y credencial', () => {
    const envExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');

    expect(envExample).toMatch(/^SUPABASE_CROPS_BUCKET=$/m);

    const bloque = envExample.match(/(?:^#.*\n)*^SUPABASE_CROPS_BUCKET=$/m)?.[0] ?? '';
    expect(bloque).toMatch(/PUBLICO/);
    expect(bloque).not.toMatch(/SUPABASE_CROPS_URL|SUPABASE_CROPS_KEY/);

    const declaradas = [...envExample.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1] as string);
    expect(declaradas.filter((nombre) => nombre === 'SUPABASE_STORAGE_URL')).toHaveLength(1);
    expect(declaradas.filter((nombre) => nombre === 'SUPABASE_STORAGE_KEY')).toHaveLength(1);
  });
});
