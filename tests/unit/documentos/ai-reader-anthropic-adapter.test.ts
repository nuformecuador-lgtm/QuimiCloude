// El adaptador `@anthropic-ai/sdk` del puerto `AiReader`, proveedor principal de la lectura.
//
// Ningun caso de este archivo toca la red: la libreria se dobla con `vi.mock`. El caso
// "el doble reemplaza a la libreria de verdad" es el que sostiene esa afirmacion.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();

class AnthropicDouble {
  messages = { create };
}

vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn(AnthropicDouble) }));

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const REQUIRED_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'] as const;

const ADAPTADOR = 'lib/modules/documentos/adapters/driven/ai/ai-reader-anthropic.ts';

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

function importaAnthropic(source: string): boolean {
  return /from\s+['"]@anthropic-ai\/sdk(\/[^'"]*)?['"]|require\(\s*['"]@anthropic-ai\/sdk(\/[^'"]*)?['"]\s*\)|import\(\s*['"]@anthropic-ai\/sdk(\/[^'"]*)?['"]\s*\)/.test(
    fuenteSinComentarios(source),
  );
}

function mensaje(overrides: Record<string, unknown>) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'un-modelo',
    content: [],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    ...overrides,
  };
}

async function adaptador() {
  return import('@/lib/modules/documentos/adapters/driven/ai/ai-reader-anthropic');
}

function configurar() {
  process.env.ANTHROPIC_API_KEY = 'una-clave';
  process.env.ANTHROPIC_MODEL = 'un-modelo';
}

describe('documentos — el adaptador de lectura con Claude (@anthropic-ai/sdk)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of REQUIRED_VARS) delete process.env[name];
    Object.assign(process.env, originalEnv);
    create.mockReset();
  });

  describe('la libreria vive en un solo archivo de produccion', () => {
    const ARBOL_VIGILADO = ['lib', 'app', 'components', 'scripts'];

    it('un unico archivo de produccion importa @anthropic-ai/sdk, y es el adaptador', () => {
      const fuentes = ARBOL_VIGILADO.flatMap((dir) => archivosDe(join(repoRoot, dir)));
      expect(fuentes.length).toBeGreaterThan(100);
      const importadores = fuentes
        .filter((abs) => importaAnthropic(readFileSync(abs, 'utf8')))
        .map((abs) => toPosix(relative(repoRoot, abs)))
        .sort();

      expect(importadores).toEqual([ADAPTADOR]);
    });

    it('el detector dispara con un import y no con un comentario', () => {
      expect(importaAnthropic("import Anthropic from '@anthropic-ai/sdk';")).toBe(true);
      expect(importaAnthropic("import type { X } from '@anthropic-ai/sdk/resources';")).toBe(true);
      expect(importaAnthropic('// se nombra @anthropic-ai/sdk en un comentario')).toBe(false);
    });
  });

  describe('importar sin claves no lanza, y no toca la red', () => {
    it('importar el adaptador con las dos variables vacias no lanza', async () => {
      for (const name of REQUIRED_VARS) process.env[name] = '';

      const modulo = await adaptador();

      expect(typeof modulo.readWithAnthropic).toBe('function');
      expect(create).not.toHaveBeenCalled();
    });

    it('invocar sin configuracion lanza nombrando las variables, sin llamar a la libreria', async () => {
      for (const name of REQUIRED_VARS) delete process.env[name];
      const { readWithAnthropic } = await adaptador();

      let texto = '';
      try {
        await readWithAnthropic({ prompt: 'lee esto', parts: [], timeoutMs: 1000 });
      } catch (error) {
        texto = error instanceof Error ? error.message : String(error);
      }

      for (const name of REQUIRED_VARS) expect(texto).toContain(name);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('la llamada, con el cliente doblado', () => {
    it('el doble reemplaza a la libreria: cliente sin reintentos y con el plazo de la peticion', async () => {
      configurar();
      create.mockResolvedValue(mensaje({ content: [{ type: 'text', text: 'ok' }] }));

      const sdk = await import('@anthropic-ai/sdk');
      const { readWithAnthropic } = await adaptador();

      await readWithAnthropic({ prompt: 'x', parts: [], timeoutMs: 4321 });

      expect(vi.isMockFunction(sdk.default)).toBe(true);
      expect(sdk.default).toHaveBeenCalledWith({ apiKey: 'una-clave', maxRetries: 0, timeout: 4321 });
    });

    it('una sola llamada con el modelo configurado, el contenido traducido y una senal de aborto', async () => {
      configurar();
      create.mockResolvedValue(mensaje({ content: [{ type: 'text', text: 'ok' }] }));
      const { readWithAnthropic } = await adaptador();

      await readWithAnthropic({
        prompt: 'lee el documento',
        parts: [{ kind: 'pdf', bytes: new Uint8Array([1, 2, 3]) }],
        timeoutMs: 5000,
      });

      expect(create).toHaveBeenCalledTimes(1);
      const [cuerpo, opciones] = create.mock.calls[0] as [Record<string, unknown>, { signal: AbortSignal }];
      expect(cuerpo.model).toBe('un-modelo');
      expect(cuerpo.max_tokens).toBe(16000);
      expect(cuerpo.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: 'AQID' },
            },
            { type: 'text', text: 'lee el documento' },
          ],
        },
      ]);
      expect(opciones.signal).toBeInstanceOf(AbortSignal);
    });

    it('no envia thinking, temperature, top_p ni un turno de asistente prefijado', async () => {
      configurar();
      create.mockResolvedValue(mensaje({ content: [{ type: 'text', text: 'ok' }] }));
      const { readWithAnthropic } = await adaptador();

      await readWithAnthropic({ prompt: 'x', parts: [], timeoutMs: 1000 });

      const cuerpo = create.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(Object.keys(cuerpo).sort()).toEqual(['max_tokens', 'messages', 'model']);
      const mensajes = cuerpo.messages as { role: string }[];
      expect(mensajes.map((m) => m.role)).toEqual(['user']);
    });

    it('devuelve el texto tal cual, concatenando solo los bloques de texto', async () => {
      configurar();
      create.mockResolvedValue(
        mensaje({
          content: [
            { type: 'text', text: '  Texto  con espacios ' },
            { type: 'tool_use', id: 't', name: 'n', input: {} },
            { type: 'text', text: 'raros.\n\n' },
          ],
        }),
      );
      const { readWithAnthropic } = await adaptador();

      const resultado = await readWithAnthropic({ prompt: 'x', parts: [], timeoutMs: 1000 });

      expect(resultado).toBe('  Texto  con espacios raros.\n\n');
    });

    it('si la respuesta no trae texto, lanza nombrando al proveedor', async () => {
      configurar();
      create.mockResolvedValue(mensaje({ content: [] }));
      const { readWithAnthropic } = await adaptador();

      await expect(readWithAnthropic({ prompt: 'x', parts: [], timeoutMs: 1000 })).rejects.toThrowError(
        /claude/i,
      );
    });

    it('una negativa del modelo lanza, y el error no vuelca el contenido', async () => {
      configurar();
      create.mockResolvedValue(
        mensaje({ stop_reason: 'refusal', content: [{ type: 'text', text: 'CONTENIDO-RECONOCIBLE' }] }),
      );
      const { readWithAnthropic } = await adaptador();

      const error = await readWithAnthropic({ prompt: 'x', parts: [], timeoutMs: 1000 }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/rechazada/);
      expect((error as Error).message).not.toContain('CONTENIDO-RECONOCIBLE');
    });

    it('un corte por max_tokens lanza en vez de devolver una lectura incompleta', async () => {
      configurar();
      create.mockResolvedValue(
        mensaje({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'a medias' }] }),
      );
      const { readWithAnthropic } = await adaptador();

      await expect(readWithAnthropic({ prompt: 'x', parts: [], timeoutMs: 1000 })).rejects.toThrowError(
        /limite de tokens/,
      );
    });

    it('un error de la libreria se propaga sin reintentar', async () => {
      configurar();
      create.mockRejectedValue(new Error('fallo de red'));
      const { readWithAnthropic } = await adaptador();

      await expect(readWithAnthropic({ prompt: 'x', parts: [], timeoutMs: 1000 })).rejects.toThrowError(
        'fallo de red',
      );
      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  describe('la traduccion de partes es pura y se prueba en memoria', () => {
    it('un PDF se traduce a un bloque document en base64 con application/pdf', async () => {
      const { toAnthropicBlock } = await adaptador();

      const bloque = toAnthropicBlock({ kind: 'pdf', bytes: new Uint8Array([1, 2, 3]) });

      expect(bloque).toEqual({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'AQID' },
      });
    });

    it('una imagen se traduce a un bloque image en base64 con image/png', async () => {
      const { toAnthropicBlock } = await adaptador();

      const bloque = toAnthropicBlock({ kind: 'image', png: new Uint8Array([9, 9]), pageNumber: 1 });

      expect(bloque).toEqual({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: Buffer.from([9, 9]).toString('base64') },
      });
    });

    it('el base64 no lleva saltos de linea aunque el adjunto sea grande', async () => {
      const { toAnthropicBlock } = await adaptador();

      const bloque = toAnthropicBlock({ kind: 'pdf', bytes: new Uint8Array(100_000).fill(7) }) as {
        source: { data: string };
      };

      expect(bloque.source.data).not.toMatch(/\s/);
    });

    it('los adjuntos van antes del prompt, en orden, y el prompt llega tal cual', async () => {
      const { buildAnthropicContent } = await adaptador();

      const contenido = buildAnthropicContent({
        prompt: 'un prompt cualquiera que llega por parametro',
        parts: [
          { kind: 'image', png: new Uint8Array([1]), pageNumber: 1 },
          { kind: 'image', png: new Uint8Array([2]), pageNumber: 2 },
        ],
        timeoutMs: 1000,
      });

      expect(contenido.map((bloque) => bloque.type)).toEqual(['image', 'image', 'text']);
      expect(contenido[2]).toEqual({ type: 'text', text: 'un prompt cualquiera que llega por parametro' });
    });
  });
});
