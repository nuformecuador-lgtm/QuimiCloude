/**
 * El caso de uso de PROCESAR un PDF por ESTRATEGIA: traduce la estrategia a un modo de lectura y a
 * un prompt, delega en la lectura con IA ya construida, registra un resumen y devuelve el texto tal
 * cual. Toda llamada registra un resumen, incluida la que rechaza la estrategia.
 *
 * La dependencia es el CASO DE USO ya construido y no el puerto de la IA: el plazo, el tope de
 * paginas y el manejo de errores viven dentro de el, y reconstruirlos aqui los duplicaria. Por eso
 * este archivo no importa ningun limite.
 *
 * No recibe actor: quien encola es quien comprueba el permiso, y la firma no lo admite.
 */
import { UnexpectedError } from './errors';
import { MODE_BY_STRATEGY, pdfStrategySchema } from './pdf-strategy';

import type { PdfStrategy } from './pdf-strategy';
import type { AiReadMode, AiReadRequestInput, AiReadResult } from './read-pdf-with-ai';
import type { ErrorCode } from '@/lib/modules/errores';
import type { PdfConverter } from '../ports/pdf-converter';
import type { StrategyPrompt } from '../ports/strategy-prompt';
import type { StrategyRunLog } from '../ports/strategy-run-log';

export type ProcessPdfByStrategyInput = {
  readonly strategy: PdfStrategy;
  readonly path: string;
  readonly bytes: Uint8Array;
};

export type StrategyRunResult =
  | {
      readonly ok: true;
      readonly strategy: PdfStrategy;
      readonly path: string;
      readonly mode: AiReadMode;
      readonly text: string;
    }
  | {
      readonly ok: false;
      readonly strategy: PdfStrategy;
      readonly path: string;
      /**
       * `null` cuando lo invalido es la propia estrategia: el modo SALE de ella, asi que no hay
       * ninguno que decir sin inventarselo.
       */
      readonly mode: AiReadMode | null;
      readonly code: ErrorCode;
      readonly reason: string;
    };

export type ProcessPdfByStrategyDeps = {
  readonly readPdfWithAi: (input: AiReadRequestInput) => Promise<AiReadResult>;
  /** Solo para el resumen del registro: el numero de paginas no sale de la lectura. */
  readonly countPages: PdfConverter['countPages'];
  readonly log: StrategyRunLog;
  readonly prompt: StrategyPrompt;
};

function causaDe(error: unknown): string {
  return error instanceof Error ? error.message : typeof error;
}

/** Contar paginas es para el registro: si revienta se registra `null` y la lectura sigue igual. */
async function contarPaginas(
  countPages: PdfConverter['countPages'],
  bytes: Uint8Array,
): Promise<number | null> {
  try {
    return await countPages(bytes);
  } catch {
    return null;
  }
}

export function createProcessPdfByStrategy(
  deps: ProcessPdfByStrategyDeps,
): (input: ProcessPdfByStrategyInput) => Promise<StrategyRunResult> {
  return async function processPdfByStrategy(
    input: ProcessPdfByStrategyInput,
  ): Promise<StrategyRunResult> {
    const parsed = pdfStrategySchema.safeParse(input.strategy);
    if (!parsed.success) {
      // La estrategia puede llegar de la base, asi que el rechazo es un suceso de ejecucion y se
      // registra: con el modo vacio —sale de la estrategia—, la estrategia tal como llego y sin
      // contar paginas, que no llegaron a hacer falta.
      deps.log.run({
        strategy: input.strategy,
        mode: null,
        path: input.path,
        pages: null,
        textLength: 0,
      });
      return {
        ok: false,
        strategy: input.strategy,
        path: input.path,
        mode: null,
        code: 'invalid_input',
        reason: `process-pdf-by-strategy: estrategia desconocida sobre '${input.path}'`,
      };
    }

    const strategy = parsed.data;
    const mode = MODE_BY_STRATEGY[strategy];

    let prompt: string;
    try {
      prompt = deps.prompt.promptFor(strategy);
    } catch (error) {
      deps.log.run({ strategy, mode, path: input.path, pages: null, textLength: 0 });
      return {
        ok: false, strategy, path: input.path, mode,
        code: new UnexpectedError().code,
        reason: `process-pdf-by-strategy: ${causaDe(error)}`,
      };
    }

    const pages = await contarPaginas(deps.countPages, input.bytes);

    // La lectura inyectada devuelve `ok:false` en vez de lanzar; el `catch` sostiene que esta capa
    // tampoco lance —y que el resumen se registre igual— si alguna vez dejara de cumplirlo.
    let outcome: AiReadResult;
    try {
      outcome = await deps.readPdfWithAi({ path: input.path, bytes: input.bytes, prompt, mode });
    } catch (error) {
      outcome = {
        ok: false,
        path: input.path,
        mode,
        code: new UnexpectedError().code,
        reason: causaDe(error),
      };
    }

    deps.log.run({
      strategy,
      mode,
      path: outcome.path,
      pages,
      textLength: outcome.ok ? outcome.text.length : 0,
    });

    return outcome.ok
      ? { ok: true, strategy, path: outcome.path, mode: outcome.mode, text: outcome.text }
      : {
          ok: false,
          strategy,
          path: outcome.path,
          mode: outcome.mode,
          code: outcome.code,
          reason: outcome.reason,
        };
  };
}
