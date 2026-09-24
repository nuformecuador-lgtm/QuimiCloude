/**
 * El caso de uso del RECORTE de las imagenes de un catalogo: rasteriza el PDF, le pide a la IA
 * donde estan las imagenes de cada pagina, ajusta esas coordenadas al borde y sube cada region al
 * bucket de recortes.
 *
 * Rasteriza el PDF por SEGUNDA vez, a sabiendas: la lectura con IA ya rasterizo para pedir el
 * texto pero no devuelve las paginas, y devolverlas obligaria a cambiar su contrato publico para
 * un unico consumidor. Un fallo de UNA region no aborta las demas: se cuenta y se sigue.
 */
import { clampRegionToPage, type CropRegionInput } from './crop-region';
import { extractCropCoordinates } from './crop-coordinates';
import { CROP_COORDINATES_PROMPT } from './crop-prompt';
import { buildCropPath } from './document-path';
import { AiUnavailableError, DocumentosError, UnexpectedError, ValidationError } from './errors';
import { AI_READ_TIMEOUT_SECONDS, MAX_PDF_PAGES, MILLISECONDS_PER_SECOND, PAGE_RENDER_DPI } from './limits';
import { raceAgainstTimeout, type TimeoutRunner } from './read-pdf-with-ai';

import type { ErrorCode } from '@/lib/modules/errores';
import type { AiDocumentPart, AiReader } from '../ports/ai-reader';
import type { CropRegionLog } from '../ports/crop-region-log';
import type { CropRegion as PortCropRegion, ImageCropper } from '../ports/image-cropper';
import type { CropStorage } from '../ports/crop-storage';
import type { PdfConverter, RenderedPage } from '../ports/pdf-converter';

export type CropCatalogImagesInput = {
  readonly documentFileId: string;
  readonly companyId: string;
  readonly path: string;
  readonly bytes: Uint8Array;
};

export type CropCatalogImagesResult =
  | { readonly ok: true; readonly uploaded: number; readonly skipped: number }
  | { readonly ok: false; readonly code: ErrorCode; readonly reason: string };

export type CropCatalogImagesDeps = {
  /** El MISMO `PdfConverter` que ya usa la conversion y la lectura con IA. */
  readonly converter: PdfConverter;
  /** El MISMO puerto de lectura con IA, sin tocar. */
  readonly ai: AiReader;
  readonly cropper: ImageCropper;
  readonly storage: CropStorage;
  readonly log: CropRegionLog;
  readonly prompt?: () => string;
  readonly timeout?: TimeoutRunner;
};

function diagnostico(operation: string, path: string, cause: string): string {
  return `crop-catalog-images: '${operation}' fallo sobre '${path}' (${cause})`;
}

function causaDe(error: unknown): string {
  return error instanceof Error ? error.message : typeof error;
}

/** Mismo criterio que `read-pdf-with-ai`: un `DocumentosError` interno se relanza tal cual. */
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

function fallo(error: unknown): { readonly code: ErrorCode; readonly reason: string } {
  if (error instanceof DocumentosError) {
    return { code: error.code, reason: error.diagnostic ?? error.message };
  }
  return { code: new UnexpectedError().code, reason: causaDe(error) };
}

function toPortRegion(region: CropRegionInput): PortCropRegion {
  return { x: region.x, y: region.y, width: region.width, height: region.height };
}

/** `true` si el ajuste al borde dejo un rectangulo sin area: no es recortable por ninguna libreria. */
function isEmptyAfterClamp(region: CropRegionInput): boolean {
  return region.width <= 0 || region.height <= 0;
}

const CAUSA_PAGINA_INEXISTENTE = 'la pagina no esta entre las paginas rasterizadas';
const CAUSA_REGION_VACIA = 'el ajuste al borde dejo la region sin area';

export function createCropCatalogImages(
  deps: CropCatalogImagesDeps,
): (input: CropCatalogImagesInput) => Promise<CropCatalogImagesResult> {
  const runWithTimeout = deps.timeout ?? raceAgainstTimeout;
  const promptFor = deps.prompt ?? (() => CROP_COORDINATES_PROMPT);

  return async function cropCatalogImages(
    input: CropCatalogImagesInput,
  ): Promise<CropCatalogImagesResult> {
    try {
      const pageCount = await conDiagnostico(
        'countPages',
        input.path,
        (diagnostic) => new UnexpectedError(diagnostic),
        () => deps.converter.countPages(input.bytes),
      );
      if (pageCount > MAX_PDF_PAGES) {
        throw new ValidationError(
          diagnostico('countPages', input.path, `${pageCount} paginas, por encima del tope`),
        );
      }

      const pages = await conDiagnostico(
        'renderPages',
        input.path,
        (diagnostic) => new UnexpectedError(diagnostic),
        () => deps.converter.renderPages(input.bytes, PAGE_RENDER_DPI),
      );
      const pngByPage = new Map<number, Uint8Array>(
        pages.map((page: RenderedPage) => [page.pageNumber, page.png]),
      );

      const parts: readonly AiDocumentPart[] = pages.map((page) => ({
        kind: 'image',
        png: page.png,
        pageNumber: page.pageNumber,
      }));

      const timeoutMs = AI_READ_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;
      const text = await conDiagnostico(
        'read',
        input.path,
        (diagnostic) => new AiUnavailableError(diagnostic),
        () => runWithTimeout(deps.ai.read({ prompt: promptFor(), parts, timeoutMs }), timeoutMs),
      );

      const coordinates = extractCropCoordinates(text, input.path);

      let uploaded = 0;
      let skipped = 0;
      // El indice `<n>` numera las regiones DENTRO de su pagina, en el orden en que la IA las
      // devolvio: un contador por pagina, actualizado en el mismo recorrido, lo respeta aunque
      // las paginas lleguen intercaladas.
      const indexByPage = new Map<number, number>();

      for (const rawRegion of coordinates.images) {
        const nextIndex = (indexByPage.get(rawRegion.page) ?? 0) + 1;
        indexByPage.set(rawRegion.page, nextIndex);

        const region = clampRegionToPage(rawRegion);
        const png = pngByPage.get(rawRegion.page);
        if (png === undefined) {
          skipped += 1;
          deps.log.skip({
            path: input.path,
            page: rawRegion.page,
            index: nextIndex,
            cause: CAUSA_PAGINA_INEXISTENTE,
          });
          continue;
        }
        if (isEmptyAfterClamp(region)) {
          skipped += 1;
          deps.log.skip({
            path: input.path,
            page: rawRegion.page,
            index: nextIndex,
            cause: CAUSA_REGION_VACIA,
          });
          continue;
        }

        try {
          const cropped = await deps.cropper.crop(png, toPortRegion(region));
          const path = buildCropPath(input.companyId, input.documentFileId, rawRegion.page, nextIndex);
          await deps.storage.upload(path, cropped);
          uploaded += 1;
        } catch (error) {
          skipped += 1;
          deps.log.skip({ path: input.path, page: rawRegion.page, index: nextIndex, cause: causaDe(error) });
        }
      }

      return { ok: true, uploaded, skipped };
    } catch (error) {
      return { ok: false, ...fallo(error) };
    }
  };
}
