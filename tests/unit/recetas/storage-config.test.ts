// T11 — Configuracion del Storage de recetas (D11, R28; `design.md > 9.4`).
//
// R43: sin red y sin bucket. Este archivo NUNCA importa el adaptador de Storage con
// Supabase, ni la libreria de cliente (lo vigila ademas `scope.test.ts`): solo prueba
// `storage-config-env.ts` -que falla limpio sin red- y el contenido de `.env.example`.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readRecipeImageStorageConfigFromEnv } from '@/lib/modules/recetas/adapters/driven/config/storage-config-env';

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

const REQUIRED_VARS = ['SUPABASE_STORAGE_URL', 'SUPABASE_STORAGE_BUCKET', 'SUPABASE_STORAGE_KEY'] as const;

describe('.env.example declara las tres variables del Storage, vacias', () => {
  it('las tres variables estan presentes y vacias, con su documentacion', () => {
    const envExamplePath = join(repoRoot, '.env.example');
    expect(existsSync(envExamplePath)).toBe(true);
    const source = readFileSync(envExamplePath, 'utf8');

    for (const name of REQUIRED_VARS) {
      const regex = new RegExp(`^${name}=$`, 'm');
      expect(source, `${name} debe estar declarada y VACIA en .env.example`).toMatch(regex);
    }
    // Documentadas: al menos un comentario menciona el bloque de Storage de recetas.
    expect(source).toMatch(/Storage de recetas/);
  });
});

describe('readRecipeImageStorageConfigFromEnv falla nombrando las variables faltantes, sin filtrar valores', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it('sin ninguna variable, el mensaje nombra las tres y no incluye ningun valor', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];

    let mensaje = '';
    try {
      readRecipeImageStorageConfigFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }
    for (const name of REQUIRED_VARS) expect(mensaje).toContain(name);
  });

  it('con una sola variable presente, el mensaje nombra solo las que faltan', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    process.env.SUPABASE_STORAGE_URL = 'https://proyecto.supabase.co';

    let mensaje = '';
    try {
      readRecipeImageStorageConfigFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }
    expect(mensaje).not.toContain('SUPABASE_STORAGE_URL');
    expect(mensaje).toContain('SUPABASE_STORAGE_BUCKET');
    expect(mensaje).toContain('SUPABASE_STORAGE_KEY');
    // Nunca el valor de la unica variable presente.
    expect(mensaje).not.toContain('https://proyecto.supabase.co');
  });

  it('una variable vacia o solo espacios cuenta como ausente', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    process.env.SUPABASE_STORAGE_URL = '   ';
    process.env.SUPABASE_STORAGE_BUCKET = 'recetas-bucket';
    process.env.SUPABASE_STORAGE_KEY = 'clave-secreta';

    expect(() => readRecipeImageStorageConfigFromEnv()).toThrowError(/SUPABASE_STORAGE_URL/);
  });

  it('con las tres presentes, resuelve la configuracion sin lanzar', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    process.env.SUPABASE_STORAGE_URL = 'https://proyecto.supabase.co';
    process.env.SUPABASE_STORAGE_BUCKET = 'recetas-bucket';
    process.env.SUPABASE_STORAGE_KEY = 'clave-secreta';

    expect(readRecipeImageStorageConfigFromEnv()).toEqual({
      url: 'https://proyecto.supabase.co',
      bucket: 'recetas-bucket',
      key: 'clave-secreta',
    });
  });
});
