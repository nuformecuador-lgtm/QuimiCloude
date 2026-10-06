// Configuracion de la IA (clave y modelo): se lee EN LA INVOCACION, nunca al importar el modulo, de
// modo que importar el adaptador con todo vacio no falle. Vacia o solo-espacios cuenta como
// ausente; si falta alguna, el error las nombra sin filtrar ningun valor; el modelo NO cae a
// ningun valor por defecto.
//
// Ningun caso hace red ni depende de que GEMINI_API_KEY o GEMINI_MODEL tengan valor.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  readAiConfigFromEnv,
  readAnthropicConfigFromEnv,
} from '@/lib/modules/documentos/adapters/driven/config/ai-config-env';
import type { AiConfig } from '@/lib/modules/documentos/adapters/driven/config/ai-config-env';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const REQUIRED_VARS = ['GEMINI_API_KEY', 'GEMINI_MODEL'] as const;

function archivosDe(absDir: string): readonly string[] {
  if (!existsSync(absDir)) return [];
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.(ts|tsx|mts|mjs|js)$/.test(ruta)) salida.push(ruta);
    }
  };
  recorrer(absDir);
  return salida;
}

function toPosix(ruta: string): string {
  return ruta.split(sep).join('/');
}

describe('documentos — configuracion de la IA (clave y modelo)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it('R13, R15 — importar el archivo con las dos variables vacias no lanza', async () => {
    for (const name of REQUIRED_VARS) process.env[name] = '';

    const modulo = await import('@/lib/modules/documentos/adapters/driven/config/ai-config-env');

    expect(typeof modulo.readAiConfigFromEnv).toBe('function');
  });

  it('R13, R15, R16 — invocar sin configuracion lanza nombrando las dos variables', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];

    let mensaje = '';
    try {
      readAiConfigFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }
    for (const name of REQUIRED_VARS) expect(mensaje).toContain(name);
  });

  it('R15, R16 — falta solo GEMINI_MODEL: lanza nombrandola y no cae a ningun modelo por defecto', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    process.env.GEMINI_API_KEY = 'una-clave-cualquiera';

    let mensaje = '';
    try {
      readAiConfigFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }
    expect(mensaje).toContain('GEMINI_MODEL');
    expect(mensaje).not.toContain('GEMINI_API_KEY');
  });

  it('R16 — en todo el arbol del modulo no existe escrita ninguna cadena de identificador de modelo', () => {
    const archivos = archivosDe(join(repoRoot, 'lib', 'modules', 'documentos'));
    expect(archivos.length).toBeGreaterThan(0);

    // Cualquier variante de "gemini-..." o "...flash..." como literal seria un modelo por defecto
    // escrito a mano: exactamente lo que R16 prohibe.
    const patronDeIdentificadorDeModelo = /['"`][^'"`\n]*(gemini-[a-z0-9.-]+|flash)[^'"`\n]*['"`]/i;

    const hallazgos = archivos
      .map((abs) => ({ ruta: toPosix(abs), fuente: readFileSync(abs, 'utf8') }))
      .filter(({ fuente }) => patronDeIdentificadorDeModelo.test(fuente))
      .map(({ ruta }) => ruta);

    expect(hallazgos, `archivos con un identificador de modelo escrito a mano: ${hallazgos.join(', ')}`).toEqual([]);
  });

  it('R16 — el detector muerde con un id de modelo y no con codigo que no lo es', () => {
    const patronDeIdentificadorDeModelo = /['"`][^'"`\n]*(gemini-[a-z0-9.-]+|flash)[^'"`\n]*['"`]/i;
    expect(patronDeIdentificadorDeModelo.test("const model = 'gemini-2.0-flash';")).toBe(true);
    expect(patronDeIdentificadorDeModelo.test("const model = readAiConfigFromEnv().model;")).toBe(false);
  });

  it('R13, R16 — el mensaje de error no contiene ningun valor de las variables configuradas', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    process.env.GEMINI_API_KEY = 'CLAVE-SECRETA-RECONOCIBLE';
    process.env.GEMINI_MODEL = '   ';

    let mensaje = '';
    try {
      readAiConfigFromEnv();
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error);
    }
    expect(mensaje).toContain('GEMINI_MODEL');
    expect(mensaje).not.toContain('CLAVE-SECRETA-RECONOCIBLE');
  });

  it('R13 — una variable vacia o solo-espacios cuenta como ausente', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    process.env.GEMINI_API_KEY = '   ';
    process.env.GEMINI_MODEL = 'un-modelo';

    expect(() => readAiConfigFromEnv()).toThrowError(/GEMINI_API_KEY/);
  });

  it('R13, R15 — con las dos presentes resuelve apiKey y model', () => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    process.env.GEMINI_API_KEY = 'una-clave';
    process.env.GEMINI_MODEL = 'un-modelo';

    expect(readAiConfigFromEnv()).toEqual({ apiKey: 'una-clave', model: 'un-modelo' });
  });

  it('R14 — AiConfig no tiene ningun campo de empresa: es una unica configuracion por despliegue', () => {
    const config: AiConfig = { apiKey: 'x', model: 'y' };
    const claves = Object.keys(config);
    expect(claves.sort()).toEqual(['apiKey', 'model']);
    expect(claves.some((clave) => /company|empresa|tenant/i.test(clave))).toBe(false);
  });

  it('R14 — el arbol de la ficha no anade nada bajo db/**: sin tabla, columna ni cifrado de credencial', () => {
    expect(existsSync(join(repoRoot, 'db', 'migrations', 'ai-config'))).toBe(false);
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8');
    expect(schema).not.toMatch(/gemini/i);
    expect(schema).not.toMatch(/AiCredential/i);
  });

  describe('Anthropic, proveedor principal: mismas reglas que Gemini', () => {
    const ANTHROPIC_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'] as const;

    afterEach(() => {
      for (const name of ANTHROPIC_VARS) delete process.env[name];
      Object.assign(process.env, originalEnv);
    });

    function mensajeDe(lectura: () => unknown): string {
      try {
        lectura();
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      return '';
    }

    it('importar el archivo con las dos variables vacias no lanza', async () => {
      for (const name of ANTHROPIC_VARS) process.env[name] = '';

      const modulo = await import('@/lib/modules/documentos/adapters/driven/config/ai-config-env');

      expect(typeof modulo.readAnthropicConfigFromEnv).toBe('function');
    });

    it('invocar sin configuracion lanza nombrando las dos variables', () => {
      for (const name of ANTHROPIC_VARS) delete process.env[name];

      const mensaje = mensajeDe(readAnthropicConfigFromEnv);

      for (const name of ANTHROPIC_VARS) expect(mensaje).toContain(name);
    });

    it('falta solo ANTHROPIC_MODEL: lanza nombrandola y no cae a ningun modelo por defecto', () => {
      for (const name of ANTHROPIC_VARS) delete process.env[name];
      process.env.ANTHROPIC_API_KEY = 'una-clave-cualquiera';

      const mensaje = mensajeDe(readAnthropicConfigFromEnv);

      expect(mensaje).toContain('ANTHROPIC_MODEL');
      expect(mensaje).not.toContain('ANTHROPIC_API_KEY');
    });

    it('el mensaje de error no contiene ningun valor configurado', () => {
      for (const name of ANTHROPIC_VARS) delete process.env[name];
      process.env.ANTHROPIC_API_KEY = 'CLAVE-SECRETA-RECONOCIBLE';
      process.env.ANTHROPIC_MODEL = '   ';

      const mensaje = mensajeDe(readAnthropicConfigFromEnv);

      expect(mensaje).toContain('ANTHROPIC_MODEL');
      expect(mensaje).not.toContain('CLAVE-SECRETA-RECONOCIBLE');
    });

    it('una variable vacia o solo-espacios cuenta como ausente', () => {
      for (const name of ANTHROPIC_VARS) delete process.env[name];
      process.env.ANTHROPIC_API_KEY = '   ';
      process.env.ANTHROPIC_MODEL = 'un-modelo';

      expect(() => readAnthropicConfigFromEnv()).toThrowError(/ANTHROPIC_API_KEY/);
    });

    it('con las dos presentes resuelve apiKey y model, sin recortar', () => {
      for (const name of ANTHROPIC_VARS) delete process.env[name];
      process.env.ANTHROPIC_API_KEY = 'una-clave';
      process.env.ANTHROPIC_MODEL = 'un-modelo';

      expect(readAnthropicConfigFromEnv()).toEqual({ apiKey: 'una-clave', model: 'un-modelo' });
    });

    it('las variables de un proveedor no satisfacen al otro', () => {
      for (const name of [...ANTHROPIC_VARS, ...REQUIRED_VARS]) delete process.env[name];
      process.env.GEMINI_API_KEY = 'una-clave';
      process.env.GEMINI_MODEL = 'un-modelo';

      expect(() => readAnthropicConfigFromEnv()).toThrowError(/ANTHROPIC_API_KEY, ANTHROPIC_MODEL/);
    });

    it('en todo el arbol del modulo no existe escrito ningun identificador de modelo de Claude', () => {
      const patron = /['"`][^'"`\n]*claude-[a-z0-9.-]+[^'"`\n]*['"`]/i;
      expect(patron.test("const model = 'claude-sonnet-5-5';")).toBe(true);
      expect(patron.test('const model = readAnthropicConfigFromEnv().model;')).toBe(false);

      const hallazgos = archivosDe(join(repoRoot, 'lib', 'modules', 'documentos'))
        .filter((abs) => patron.test(readFileSync(abs, 'utf8')))
        .map(toPosix);

      expect(hallazgos).toEqual([]);
    });

    it('.env.example declara las dos variables VACIAS y documentadas', () => {
      const envExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');
      expect(envExample).toMatch(/^ANTHROPIC_API_KEY=$/m);
      expect(envExample).toMatch(/^ANTHROPIC_MODEL=$/m);
      expect([...envExample.matchAll(/^(ANTHROPIC_API_KEY|ANTHROPIC_MODEL)=(.+)$/gm)]).toEqual([]);
    });
  });

  describe('.env.example declara las dos variables, vacias y documentadas (R13, R15)', () => {
    const envExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');

    it('R13 — GEMINI_API_KEY esta declarada, VACIA y documentada', () => {
      expect(envExample).toMatch(/^GEMINI_API_KEY=$/m);
      expect(envExample).toMatch(/UNA SOLA por despliegue/);
    });

    it('R15 — GEMINI_MODEL esta declarada, VACIA y documentada', () => {
      expect(envExample).toMatch(/^GEMINI_MODEL=$/m);
      expect(envExample).toMatch(/OBLIGATORIA/);
    });

    it('R13, R15 — ninguna de las dos lleva un valor: el archivo sigue sin secretos', () => {
      const conValor = [...envExample.matchAll(/^(GEMINI_API_KEY|GEMINI_MODEL)=(.+)$/gm)];
      expect(conValor).toEqual([]);
    });
  });
});
