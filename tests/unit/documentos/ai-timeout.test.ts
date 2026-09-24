// El plazo de la lectura con IA: ni el puerto que cuelga ni un plazo agotado dejan la lectura sin
// resolver, y ninguna de las dos cosas se prueba durmiendo de verdad. El doble del puerto registra
// sus llamadas para que "cero reintentos" se pueda afirmar y no solo suponer.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createReadPdfWithAi, type AiReadResult } from '@/lib/modules/documentos/domain/read-pdf-with-ai';
import { AI_READ_TIMEOUT_SECONDS, MILLISECONDS_PER_SECOND } from '@/lib/modules/documentos/domain/limits';

import type { AiReadRequest, AiReader } from '@/lib/modules/documentos/ports/ai-reader';
import type { PdfConverter } from '@/lib/modules/documentos/ports/pdf-converter';

const PATH = '11111111-1111-4111-8111-111111111111/catalogo.pdf';

const converter: PdfConverter = {
  countPages: vi.fn(async () => 1),
  extractText: vi.fn(async () => ''),
  renderPages: vi.fn(async () => []),
};

function falloDe(resultado: AiReadResult): { readonly code: string; readonly reason: string } {
  if (resultado.ok) throw new Error('se esperaba un fallo y el resultado fue exito');
  return resultado;
}

describe('documentos — el plazo de la lectura con IA', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('R7, R8, R9 — un TimeoutRunner que vence al instante falla con ai_unavailable y UNA sola llamada', async () => {
    const read = vi.fn(async () => 'nunca se ve');
    const ai: AiReader = { read };
    const timeoutQueVenceAlInstante = async (): Promise<never> => {
      throw new Error('el plazo se agoto');
    };

    const leer = createReadPdfWithAi({ ai, converter, timeout: timeoutQueVenceAlInstante });
    const resultado = await leer({ path: PATH, bytes: new TextEncoder().encode('%PDF-1.7'), prompt: 'lee', mode: 'pdf' });

    expect(falloDe(resultado).code).toBe('ai_unavailable');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('R7, R8, R27 — el TimeoutRunner real vence sin esperar 60 s reales, con un doble que nunca resuelve', async () => {
    // `hrtime` se deja fuera de lo falseado a proposito: es el reloj de pared real que prueba que
    // no se durmio, mientras que `setTimeout` y `Date` son los que el temporizador falso adelanta.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const read = vi.fn(() => new Promise<string>(() => {}));
    const ai: AiReader = { read };

    const leer = createReadPdfWithAi({ ai, converter });
    const promesa = leer({ path: PATH, bytes: new TextEncoder().encode('%PDF-1.7'), prompt: 'lee', mode: 'pdf' });

    // `Date` tambien esta falseado por `vi.useFakeTimers()`: el reloj de pared real es
    // `process.hrtime`, que sigue corriendo de verdad y por eso sirve para medir si se durmio.
    const antes = process.hrtime.bigint();
    await vi.advanceTimersByTimeAsync(60_000);
    const resultado = await promesa;
    const transcurridoDeVerdadEnMs = Number(process.hrtime.bigint() - antes) / 1_000_000;

    expect(falloDe(resultado).code).toBe('ai_unavailable');
    expect(read).toHaveBeenCalledTimes(1);
    expect(transcurridoDeVerdadEnMs).toBeLessThan(5000);
  });

  it('R7 — el plazo que se pasa a la IA sale de AI_READ_TIMEOUT_SECONDS, no de un numero suelto', async () => {
    const read = vi.fn<(request: AiReadRequest) => Promise<string>>(async () => 'ok');
    const ai: AiReader = { read };
    const leer = createReadPdfWithAi({ ai, converter });

    await leer({ path: PATH, bytes: new TextEncoder().encode('%PDF-1.7'), prompt: 'lee', mode: 'pdf' });

    expect(read.mock.calls[0]?.[0]?.timeoutMs).toBe(AI_READ_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND);
    expect(AI_READ_TIMEOUT_SECONDS).toBe(60);
  });

  it('R9 — si el puerto lanza, hay UNA sola llamada y ningun reintento', async () => {
    const read = vi.fn(async () => {
      throw new Error('el proveedor no respondio');
    });
    const ai: AiReader = { read };
    const leer = createReadPdfWithAi({ ai, converter });

    const resultado = await leer({ path: PATH, bytes: new TextEncoder().encode('%PDF-1.7'), prompt: 'lee', mode: 'pdf' });

    expect(falloDe(resultado).code).toBe('ai_unavailable');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('R27 — barrido: ningun test de esta ficha llama a setTimeout de verdad para dormir el plazo', () => {
    const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const esteArchivo = readFileSync(join(raiz, 'tests', 'unit', 'documentos', 'ai-timeout.test.ts'), 'utf8');
    const elOtroArchivo = readFileSync(
      join(raiz, 'tests', 'unit', 'documentos', 'read-pdf-with-ai.test.ts'),
      'utf8',
    );

    expect(esteArchivo).not.toMatch(/setTimeout\(/);
    expect(elOtroArchivo).not.toMatch(/setTimeout\(/);
  });
});
