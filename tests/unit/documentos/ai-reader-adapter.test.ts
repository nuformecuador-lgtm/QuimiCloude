// El adaptador `@google/genai` del puerto `AiReader`.
//
// Ningun caso de este archivo toca la red: la libreria se dobla con `vi.mock`. El caso
// "R26 — el doble reemplaza a la libreria de verdad" es el que sostiene esa afirmacion: si el
// doble no estuviera activo, `readWithGenai` intentaria una conexion real y ese caso lo
// delataria por la forma de la respuesta.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();

class GoogleGenAIDouble {
  models = { generateContent };
}

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn(GoogleGenAIDouble),
    createPartFromBase64: vi.fn((data: string, mimeType: string) => ({
      inlineData: { data, mimeType },
    })),
    createPartFromText: vi.fn((text: string) => ({ text })),
    createUserContent: vi.fn((parts: unknown) => ({ role: 'user', parts })),
  };
});

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

function fuenteSinComentarios(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function importaGenai(source: string): boolean {
  return /from\s+['"]@google\/genai['"]|require\(\s*['"]@google\/genai['"]\s*\)|import\(\s*['"]@google\/genai['"]\s*\)/.test(
    fuenteSinComentarios(source),
  );
}

const ADAPTADOR = 'lib/modules/documentos/adapters/driven/ai/ai-reader-genai.ts';

describe('documentos — el adaptador de lectura con Gemini (@google/genai)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
    generateContent.mockReset();
  });

  describe('R22 — la libreria vive en un solo archivo de produccion', () => {
    const ARBOL_VIGILADO = ['lib', 'app', 'components', 'scripts'];

    it('R22 — el barrido recorre de verdad el arbol vigilado', () => {
      const fuentes = ARBOL_VIGILADO.flatMap((dir) => archivosDe(join(repoRoot, dir)));
      expect(fuentes.length).toBeGreaterThan(100);
    });

    it('R22 — un unico archivo de produccion importa @google/genai, y es el adaptador', () => {
      const fuentes = ARBOL_VIGILADO.flatMap((dir) => archivosDe(join(repoRoot, dir)));
      const importadores = fuentes
        .filter((abs) => importaGenai(readFileSync(abs, 'utf8')))
        .map((abs) => toPosix(relative(repoRoot, abs)))
        .sort();

      expect(importadores).toEqual([ADAPTADOR]);
    });

    it('R22 — el detector dispara: un import de la libreria en otro archivo seria un hallazgo', () => {
      expect(importaGenai("import { GoogleGenAI } from '@google/genai';")).toBe(true);
      expect(importaGenai("// se nombra @google/genai en un comentario")).toBe(false);
    });
  });

  describe('R25, R26 — importar el adaptador sin claves no lanza, y no toca la red', () => {
    it('R25 — importar el adaptador con las dos variables vacias no lanza', async () => {
      for (const name of REQUIRED_VARS) process.env[name] = '';

      const modulo = await import('@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai');

      expect(typeof modulo.readWithGenai).toBe('function');
      expect(generateContent).not.toHaveBeenCalled();
    });

    it('R13, R16 — invocar sin configuracion lanza nombrando las variables, sin llamar a la libreria', async () => {
      for (const name of REQUIRED_VARS) delete process.env[name];

      const { readWithGenai } = await import(
        '@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai'
      );

      let mensaje = '';
      try {
        await readWithGenai({ prompt: 'lee esto', parts: [], timeoutMs: 1000 });
      } catch (error) {
        mensaje = error instanceof Error ? error.message : String(error);
      }

      for (const name of REQUIRED_VARS) expect(mensaje).toContain(name);
      expect(generateContent).not.toHaveBeenCalled();
    });
  });

  describe('R6 — el texto de la respuesta se devuelve tal cual, con el cliente doblado', () => {
    it('R6, R26 — devuelve exactamente response.text, sin recortar ni interpretar', async () => {
      process.env.GEMINI_API_KEY = 'una-clave';
      process.env.GEMINI_MODEL = 'un-modelo';
      generateContent.mockResolvedValue({ text: '  Texto  con espacios  raros.\n\n' });

      const { readWithGenai } = await import(
        '@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai'
      );

      const resultado = await readWithGenai({
        prompt: 'lee el documento',
        parts: [{ kind: 'pdf', bytes: new Uint8Array([1, 2, 3]) }],
        timeoutMs: 5000,
      });

      expect(resultado).toBe('  Texto  con espacios  raros.\n\n');
      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(generateContent.mock.calls[0]?.[0]?.model).toBe('un-modelo');
    });

    it('R26 — el doble reemplaza a la libreria de verdad: ninguna llamada real ocurre', async () => {
      process.env.GEMINI_API_KEY = 'una-clave';
      process.env.GEMINI_MODEL = 'un-modelo';
      generateContent.mockResolvedValue({ text: 'ok' });

      const genai = await import('@google/genai');
      const { readWithGenai } = await import(
        '@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai'
      );

      await readWithGenai({ prompt: 'x', parts: [], timeoutMs: 1000 });

      // El constructor que se invoca es el simulado por vi.mock, no la clase real del SDK.
      expect(vi.isMockFunction(genai.GoogleGenAI)).toBe(true);
      expect(genai.GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'una-clave' });
    });

    it('R6 — si la respuesta no trae texto, lanza nombrando la operacion en vez de devolver algo', async () => {
      process.env.GEMINI_API_KEY = 'una-clave';
      process.env.GEMINI_MODEL = 'un-modelo';
      generateContent.mockResolvedValue({ text: undefined });

      const { readWithGenai } = await import(
        '@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai'
      );

      await expect(
        readWithGenai({ prompt: 'x', parts: [], timeoutMs: 1000 }),
      ).rejects.toThrowError(/gemini/i);
    });
  });

  describe('la traduccion de partes es pura y se prueba en memoria (R6, R26)', () => {
    it('R6 — un PDF se traduce a base64 con application/pdf', async () => {
      const { toGenaiPart } = await import(
        '@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai'
      );

      const parte = toGenaiPart({ kind: 'pdf', bytes: new Uint8Array([1, 2, 3]) }) as {
        inlineData: { data: string; mimeType: string };
      };

      expect(parte.inlineData.mimeType).toBe('application/pdf');
      expect(Buffer.from(parte.inlineData.data, 'base64')).toEqual(Buffer.from([1, 2, 3]));
    });

    it('R6 — una imagen se traduce a base64 con image/png', async () => {
      const { toGenaiPart } = await import(
        '@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai'
      );

      const parte = toGenaiPart({
        kind: 'image',
        png: new Uint8Array([9, 9]),
        pageNumber: 1,
      }) as { inlineData: { data: string; mimeType: string } };

      expect(parte.inlineData.mimeType).toBe('image/png');
      expect(Buffer.from(parte.inlineData.data, 'base64')).toEqual(Buffer.from([9, 9]));
    });

    it('R26 — el cuerpo de la peticion lleva el prompt recibido por parametro, sin texto propio', async () => {
      const { buildGenaiContents } = await import(
        '@/lib/modules/documentos/adapters/driven/ai/ai-reader-genai'
      );

      const contenido = buildGenaiContents({
        prompt: 'un prompt cualquiera que llega por parametro',
        parts: [],
        timeoutMs: 1000,
      }) as { parts: readonly { text?: string }[] };

      expect(contenido.parts[0]?.text).toBe('un prompt cualquiera que llega por parametro');
    });
  });
});
