/**
 * El caso de uso de la CONVERSION: de un PDF, o su texto, o sus paginas como imagen.
 *
 * LOS CUATRO PASOS, EN ESTE ORDEN:
 *
 *   1. «¿Esto es un PDF?», POR EL CONTENIDO y nunca por la extension ni por el tipo que declare
 *      quien lo subio: las dos cosas las escribe el cliente y las dos se pueden mentir.
 *   2. Cuantas paginas tiene. Si pasa del tope, se rechaza **sin renderizar ni una**: contar es una
 *      operacion aparte del puerto precisamente para que rechazar un archivo de cientos de paginas
 *      no cueste cientos de renders.
 *   3. Lo que pida quien llama: el texto, o las paginas a la resolucion unica del modulo.
 *   4. El resultado de cada archivo es un DISCRIMINADO `{ ok: true … } | { ok: false, reason }`.
 *
 * **Por que un valor y no una excepcion que suba** (paso 4): quien invoca esto procesa una tanda
 * entera, y un archivo cifrado o corrupto en mitad de la tanda no puede tumbar a los demas. Con una
 * excepcion, el noveno archivo roto se llevaria por delante a los otros nueve ya convertidos; con un
 * valor por archivo, el fallo es un dato mas del resultado y la tanda sigue.
 *
 * **Y no es un `catch` vacio**: el fallo viaja con QUE OPERACION fallo, SOBRE QUE RUTA y cual fue la
 * causa. Devolverlo en `reason` ES registrarlo —lo recibe entero quien llamo—, no tragarselo.
 *
 * Aqui no se comprueba ningun permiso, y la ausencia es deliberada: la frontera de autorizacion es
 * la operacion que un actor pide —la emision de enlaces—, mientras que esto lo invoca el trabajo que
 * procesa la tanda ya admitida, que no tiene actor ni sesion que consultar.
 *
 * Dominio puro: su propio `domain/` y sus `ports/`. La libreria que de verdad abre el PDF vive en el
 * adaptador y este archivo no la nombra.
 */
import { DocumentosError, ValidationError } from './errors';
import { MAX_PDF_PAGES, PAGE_RENDER_DPI } from './limits';
import { isPdfContent } from './pdf-content';

import type { PdfConverter, RenderedPage } from '../ports/pdf-converter';

/** Que se le pide al PDF: su texto, o sus paginas como imagen. */
export type PdfOutput = 'text' | 'images';

/** Un archivo de la tanda: su ruta dentro del bucket —para poder nombrarlo al fallar— y sus bytes. */
export type PdfToConvert = {
  readonly path: string;
  readonly bytes: Uint8Array;
};

export type ConversionSuccess =
  | {
      readonly ok: true;
      readonly path: string;
      readonly pageCount: number;
      readonly output: 'text';
      readonly text: string;
    }
  | {
      readonly ok: true;
      readonly path: string;
      readonly pageCount: number;
      readonly output: 'images';
      readonly pages: readonly RenderedPage[];
    };

/**
 * El fallo de UN archivo, que no es el fallo de la tanda.
 *
 * `reason` es texto de DIAGNOSTICO para el registro del servidor: nombra la operacion y la ruta, y
 * arrastra la causa. No es un mensaje para el navegador ni un codigo de error.
 */
export type ConversionFailure = {
  readonly ok: false;
  readonly path: string;
  readonly output: PdfOutput;
  readonly reason: string;
};

export type ConversionResult = ConversionSuccess | ConversionFailure;

export type ConvertPdfDeps = {
  /** Las dos conversiones, dichas sin nombrar ninguna libreria. */
  readonly converter: PdfConverter;
};

/** El diagnostico, con el mismo formato siempre: QUE operacion, SOBRE QUE ruta y por que. */
function diagnostico(operation: string, path: string, cause: string): string {
  return `convert-pdf: '${operation}' fallo sobre '${path}' (${cause})`;
}

/**
 * La causa en texto. Se queda con el MENSAJE y nunca con el objeto entero: un error de una libreria
 * arrastra rutas de archivo y fragmentos del documento, y por ahi se cuela en un registro lo que no
 * deberia estar. Lo que no es `Error` se describe por su tipo, sin volcar su contenido.
 */
function causaDe(error: unknown): string {
  return error instanceof Error ? error.message : typeof error;
}

/**
 * Invoca una operacion del puerto y, si revienta, la vuelve a lanzar diciendo CUAL era. Sin esto, el
 * unico `catch` del archivo no podria distinguir si lo que fallo fue contar, extraer o renderizar.
 */
async function conDiagnostico<T>(
  operation: string,
  path: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new Error(diagnostico(operation, path, causaDe(error)));
  }
}

/** El `reason` que ve quien llama: el diagnostico del error del modulo, o el mensaje ya compuesto. */
function razonDe(error: unknown): string {
  if (error instanceof DocumentosError) return error.diagnostic ?? error.message;
  return causaDe(error);
}

export function createConvertPdfs(
  deps: ConvertPdfDeps,
): (files: readonly PdfToConvert[], output: PdfOutput) => Promise<readonly ConversionResult[]> {
  async function convertOne(file: PdfToConvert, output: PdfOutput): Promise<ConversionResult> {
    try {
      // 1. Por el contenido. El nombre del archivo ni siquiera entra en la decision.
      if (!isPdfContent(file.bytes)) {
        throw new ValidationError(
          diagnostico('isPdfContent', file.path, 'el contenido no empieza por la firma de un PDF'),
        );
      }

      // 2. El tope se aplica ANTES de renderizar. Es inclusivo: el archivo que tiene justo el tope
      //    se convierte; solo se rechaza el que lo pasa.
      const pageCount = await conDiagnostico('countPages', file.path, () =>
        deps.converter.countPages(file.bytes),
      );
      if (pageCount > MAX_PDF_PAGES) {
        throw new ValidationError(
          diagnostico('countPages', file.path, `${pageCount} paginas, por encima del tope`),
        );
      }

      // 3. Una cosa o la otra, nunca las dos: quien llama pide lo que va a usar.
      if (output === 'text') {
        const text = await conDiagnostico('extractText', file.path, () =>
          deps.converter.extractText(file.bytes),
        );
        return { ok: true, path: file.path, pageCount, output, text };
      }

      // La resolucion sale de la constante unica del modulo: quien renderiza no elige DPI.
      const pages = await conDiagnostico('renderPages', file.path, () =>
        deps.converter.renderPages(file.bytes, PAGE_RENDER_DPI),
      );
      return { ok: true, path: file.path, pageCount, output, pages };
    } catch (error) {
      // 4. El fallo se convierte en DATO. Nada sube de aqui, y nada se pierde.
      return { ok: false, path: file.path, output, reason: razonDe(error) };
    }
  }

  return async function convertPdfs(
    files: readonly PdfToConvert[],
    output: PdfOutput,
  ): Promise<readonly ConversionResult[]> {
    // En paralelo y con el fallo ya capturado archivo a archivo: ninguna promesa puede rechazar, asi
    // que el resultado trae SIEMPRE una entrada por archivo y en el orden de entrada.
    return Promise.all(files.map((file) => convertOne(file, output)));
  };
}
