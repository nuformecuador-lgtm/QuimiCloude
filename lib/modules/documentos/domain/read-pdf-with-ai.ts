/**
 * El caso de uso de la LECTURA con IA: un PDF entero, o sus paginas ya convertidas a imagen, con un
 * prompt dado.
 *
 * El texto que devuelve la IA sale tal cual del puerto: este archivo no lo recorta, reordena ni
 * interpreta.
 *
 * El plazo lo hace cumplir el DOMINIO, envolviendo la llamada al puerto, y no el adaptador: asi la
 * garantia de cuanto espera el llamante es cierta sin depender de lo que sepa hacer el tercero.
 *
 * Dominio puro: su propio `domain/` y sus `ports/`. La libreria que habla con el proveedor vive en
 * el adaptador y este archivo no la nombra.
 */
import { aiReadInputSchema } from './ai-read-input';
import { AiUnavailableError, DocumentosError, UnexpectedError, ValidationError } from './errors';
import { AI_READ_TIMEOUT_SECONDS, MAX_PDF_PAGES, MILLISECONDS_PER_SECOND, PAGE_RENDER_DPI } from './limits';

import type { ErrorCode } from '@/lib/modules/errores';
import type { AiDocumentPart, AiReader } from '../ports/ai-reader';
import type { PdfConverter } from '../ports/pdf-converter';

export type AiReadMode = 'pdf' | 'images';

/** Lo que se pide leer: el PDF, su ruta —solo para poder nombrarlo al fallar—, el prompt y el modo. */
export type AiReadRequestInput = {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly prompt: string;
  readonly mode: AiReadMode;
};

export type AiReadResult =
  | { readonly ok: true; readonly path: string; readonly mode: AiReadMode; readonly text: string }
  | {
      readonly ok: false;
      readonly path: string;
      readonly mode: AiReadMode;
      readonly code: ErrorCode;
      readonly reason: string;
    };

/**
 * Corre una promesa contra un plazo. Quien la sustituye desde un test puede hacer vencer el plazo al
 * instante, o dejar correr el `Promise.race` de verdad contra un temporizador falso.
 */
export type TimeoutRunner = <T>(promise: Promise<T>, ms: number) => Promise<T>;

export type ReadPdfWithAiDeps = {
  readonly ai: AiReader;
  /** El MISMO `PdfConverter` que ya usa la conversion; este caso de uso no lo reimplementa. */
  readonly converter: PdfConverter;
  readonly timeout?: TimeoutRunner;
};

/** El diagnostico, con el mismo formato siempre: QUE operacion, SOBRE QUE ruta y por que. */
function diagnostico(operation: string, path: string, cause: string): string {
  return `read-pdf-with-ai: '${operation}' fallo sobre '${path}' (${cause})`;
}

function causaDe(error: unknown): string {
  return error instanceof Error ? error.message : typeof error;
}

/**
 * Invoca una operacion y, si revienta, la vuelve a lanzar diciendo CUAL era. Sin esto, un fallo de
 * `countPages`, de `renderPages` o de la lectura misma se verian iguales desde fuera.
 *
 * Un `DocumentosError` que ya venia de mas adentro (el tope de paginas) se relanza TAL CUAL: ya
 * sabe su propio `code`. Cualquier otra cosa se envuelve con el `code` que le corresponde a ESTA
 * operacion, para que `countPages` o `renderPages` no terminen pareciendo un corte del proveedor.
 */
async function conDiagnostico<T>(
  operation: string,
  path: string,
  crearError: (diagnostic: string) => DocumentosError,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DocumentosError) throw error;
    throw crearError(diagnostico(operation, path, causaDe(error)));
  }
}

/**
 * El plazo por defecto: una carrera contra un temporizador. Si gana el temporizador, la promesa que
 * corre por debajo puede seguir viva; si gana la lectura, el temporizador se limpia para no dejar
 * el proceso colgado.
 */
const raceAgainstTimeout: TimeoutRunner = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`el plazo de ${ms} ms se agoto`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/** Las paginas del PDF, ya rasterizadas a la resolucion unica del modulo, como partes para la IA. */
async function buildImageParts(
  converter: PdfConverter,
  bytes: Uint8Array,
  path: string,
): Promise<readonly AiDocumentPart[]> {
  const pageCount = await conDiagnostico(
    'countPages',
    path,
    (diagnostic) => new UnexpectedError(diagnostic),
    () => converter.countPages(bytes),
  );
  if (pageCount > MAX_PDF_PAGES) {
    throw new ValidationError(
      diagnostico('countPages', path, `${pageCount} paginas, por encima del tope`),
    );
  }

  const pages = await conDiagnostico(
    'renderPages',
    path,
    (diagnostic) => new UnexpectedError(diagnostic),
    () => converter.renderPages(bytes, PAGE_RENDER_DPI),
  );
  return pages.map((page) => ({ kind: 'image', png: page.png, pageNumber: page.pageNumber }));
}

/** El `code` y el `reason` que ve quien llama, a partir de lo que reviento. */
function fallo(error: unknown): { readonly code: ErrorCode; readonly reason: string } {
  if (error instanceof DocumentosError) {
    return { code: error.code, reason: error.diagnostic ?? error.message };
  }
  // conDiagnostico envuelve en un DocumentosError todo lo que puede reventar: llegar aqui es lo
  // verdaderamente imprevisto, y ese es el caso que le corresponde a `unexpected`.
  return { code: new UnexpectedError().code, reason: causaDe(error) };
}

export function createReadPdfWithAi(
  deps: ReadPdfWithAiDeps,
): (input: AiReadRequestInput) => Promise<AiReadResult> {
  const runWithTimeout = deps.timeout ?? raceAgainstTimeout;

  return async function readPdfWithAi(input: AiReadRequestInput): Promise<AiReadResult> {
    const parsed = aiReadInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        path: input.path,
        mode: input.mode,
        code: 'invalid_input',
        reason: diagnostico(
          'aiReadInputSchema',
          input.path,
          parsed.error.issues.map((issue) => issue.message).join('; '),
        ),
      };
    }

    const { path, bytes, prompt, mode } = parsed.data;

    try {
      const parts: readonly AiDocumentPart[] =
        mode === 'pdf' ? [{ kind: 'pdf', bytes }] : await buildImageParts(deps.converter, bytes, path);

      const timeoutMs = AI_READ_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;
      const text = await conDiagnostico(
        'read',
        path,
        (diagnostic) => new AiUnavailableError(diagnostic),
        () => runWithTimeout(deps.ai.read({ prompt, parts, timeoutMs }), timeoutMs),
      );

      return { ok: true, path, mode, text };
    } catch (error) {
      return { ok: false, path, mode, ...fallo(error) };
    }
  };
}
