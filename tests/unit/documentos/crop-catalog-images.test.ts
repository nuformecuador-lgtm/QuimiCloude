// El recorte de las imagenes de un catalogo, contra dobles del convertidor, de la IA, del recorte
// y del almacenamiento. Ningun doble llama a la red ni importa `sharp`: el recorte y la subida son
// funciones fabricadas que devuelven bytes fijos o lanzan.

import { describe, expect, it, vi } from 'vitest';

import {
  createCropCatalogImages,
  type CropCatalogImagesResult,
} from '@/lib/modules/documentos/domain/crop-catalog-images';
import { CROP_COORDINATES_PROMPT } from '@/lib/modules/documentos/domain/crop-prompt';
import { MAX_PDF_PAGES, PAGE_RENDER_DPI } from '@/lib/modules/documentos/domain/limits';

import type { AiReadRequest, AiReader } from '@/lib/modules/documentos/ports/ai-reader';
import type { CropRegionLog, CropRegionSkipSummary } from '@/lib/modules/documentos/ports/crop-region-log';
import type { CropStorage } from '@/lib/modules/documentos/ports/crop-storage';
import type { CropRegion, ImageCropper } from '@/lib/modules/documentos/ports/image-cropper';
import type { PdfConverter, RenderedPage } from '@/lib/modules/documentos/ports/pdf-converter';

const EMPRESA = '22222222-2222-4222-8222-222222222222';
const ARCHIVO = 'archivo-catalogo';
const PATH = `${EMPRESA}/catalogo.pdf`;

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.7\n% catalogo\n1 0 obj');
}

function pngDe(pageNumber: number): RenderedPage {
  return { pageNumber, png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, pageNumber]) };
}

function dobleDeConversion(
  config: { readonly pageCount?: number; readonly pages?: readonly RenderedPage[] } = {},
) {
  const countPages = vi.fn(async (): Promise<number> => config.pageCount ?? 1);
  const extractText = vi.fn(async (): Promise<string> => '');
  const renderPages = vi.fn(async (): Promise<readonly RenderedPage[]> => config.pages ?? [pngDe(1)]);
  const converter: PdfConverter = { countPages, extractText, renderPages };
  return { converter, countPages, extractText, renderPages };
}

function dobleDeIa(respuesta: string | ((request: AiReadRequest) => string) = '{"images": []}') {
  const read = vi.fn(async (request: AiReadRequest): Promise<string> =>
    typeof respuesta === 'function' ? respuesta(request) : respuesta,
  );
  const ai: AiReader = { read };
  return { ai, read };
}

function dobleDeCropper(comportamiento?: (png: Uint8Array, region: CropRegion) => Uint8Array) {
  const crop = vi.fn(async (png: Uint8Array, region: CropRegion): Promise<Uint8Array> => {
    if (comportamiento) return comportamiento(png, region);
    return new Uint8Array([9, 9, 9]);
  });
  const cropper: ImageCropper = { crop };
  return { cropper, crop };
}

function dobleDeAlmacenamiento() {
  const rutas: string[] = [];
  const upload = vi.fn(async (path: string): Promise<void> => {
    rutas.push(path);
  });
  const storage: CropStorage = { upload };
  return { storage, upload, rutas };
}

function dobleDeRegistro() {
  const skip = vi.fn<(summary: CropRegionSkipSummary) => void>();
  const log: CropRegionLog = { skip };
  return { log, skip };
}

function falloDe(resultado: CropCatalogImagesResult): { readonly code: string; readonly reason: string } {
  if (resultado.ok) throw new Error('se esperaba un fallo y el resultado fue exito');
  return resultado;
}

describe('documentos — recorte de las imagenes de un catalogo', () => {
  it('R2 — renderPages recibe PAGE_RENDER_DPI; mas de MAX_PDF_PAGES es invalid_input SIN haber renderizado', async () => {
    const conversion = dobleDeConversion({ pageCount: MAX_PDF_PAGES + 1 });
    const ia = dobleDeIa();
    const cropper = dobleDeCropper();
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
    });

    const resultado = await recortar({
      documentFileId: ARCHIVO,
      companyId: EMPRESA,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(falloDe(resultado).code).toBe('invalid_input');
    expect(conversion.renderPages).not.toHaveBeenCalled();
    expect(ia.read).not.toHaveBeenCalled();
  });

  it('R2 — con un PDF dentro del tope, renderPages se llama con la resolucion unica del modulo', async () => {
    const conversion = dobleDeConversion({ pageCount: 1, pages: [pngDe(1)] });
    const ia = dobleDeIa();
    const cropper = dobleDeCropper();
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
    });

    await recortar({ documentFileId: ARCHIVO, companyId: EMPRESA, path: PATH, bytes: pdfBytes() });

    expect(conversion.renderPages).toHaveBeenCalledWith(expect.any(Uint8Array), PAGE_RENDER_DPI);
  });

  it('R3 — la IA recibe partes image y el prompt del recorte, y devuelve texto plano', async () => {
    const conversion = dobleDeConversion({ pageCount: 2, pages: [pngDe(1), pngDe(2)] });
    const ia = dobleDeIa();
    const cropper = dobleDeCropper();
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
    });

    await recortar({ documentFileId: ARCHIVO, companyId: EMPRESA, path: PATH, bytes: pdfBytes() });

    expect(ia.read).toHaveBeenCalledTimes(1);
    const request = ia.read.mock.calls[0]?.[0] as AiReadRequest;
    expect(request.parts.map((parte) => parte.kind)).toEqual(['image', 'image']);
    expect(request.prompt).toBe(CROP_COORDINATES_PROMPT);
  });

  it('R5 — texto sin JSON interpretable deja invalid_input y CERO subidas', async () => {
    const conversion = dobleDeConversion();
    const ia = dobleDeIa('esto no trae ningun objeto');
    const cropper = dobleDeCropper();
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
    });

    const resultado = await recortar({
      documentFileId: ARCHIVO,
      companyId: EMPRESA,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(falloDe(resultado).code).toBe('invalid_input');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('R7 — una region desbordada se ajusta al borde y SIGUE recortandose', async () => {
    const conversion = dobleDeConversion({ pageCount: 1, pages: [pngDe(1)] });
    const ia = dobleDeIa(
      JSON.stringify({ images: [{ page: 1, x: 0.9, y: 0.9, width: 0.5, height: 0.5 }] }),
    );
    const cropper = dobleDeCropper();
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
    });

    const resultado = await recortar({
      documentFileId: ARCHIVO,
      companyId: EMPRESA,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(resultado).toEqual({ ok: true, uploaded: 1, skipped: 0 });
    expect(cropper.crop).toHaveBeenCalledTimes(1);
    const [, regionRecortada] = cropper.crop.mock.calls[0] as [Uint8Array, CropRegion];
    expect(regionRecortada.x).toBeCloseTo(0.9);
    expect(regionRecortada.width).toBeCloseTo(0.1);
    expect(regionRecortada.y).toBeCloseTo(0.9);
    expect(regionRecortada.height).toBeCloseTo(0.1);
  });

  it('R16 — {"images": []} termina bien con cero subidas', async () => {
    const conversion = dobleDeConversion();
    const ia = dobleDeIa('{"images": []}');
    const cropper = dobleDeCropper();
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
    });

    const resultado = await recortar({
      documentFileId: ARCHIVO,
      companyId: EMPRESA,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(resultado).toEqual({ ok: true, uploaded: 0, skipped: 0 });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('R17 — tres regiones, la segunda revienta al recortar: la primera y la tercera se suben, skipped: 1', async () => {
    const conversion = dobleDeConversion({ pageCount: 1, pages: [pngDe(1)] });
    const ia = dobleDeIa(
      JSON.stringify({
        images: [
          { page: 1, x: 0.0, y: 0.0, width: 0.2, height: 0.2 },
          { page: 1, x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
          { page: 1, x: 0.6, y: 0.6, width: 0.2, height: 0.2 },
        ],
      }),
    );
    const cropper = dobleDeCropper();
    cropper.crop.mockImplementationOnce(async () => new Uint8Array([1]));
    cropper.crop.mockImplementationOnce(async () => {
      throw new Error('la libreria no pudo recortar esta region');
    });
    cropper.crop.mockImplementationOnce(async () => new Uint8Array([3]));
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
    });

    const resultado = await recortar({
      documentFileId: ARCHIVO,
      companyId: EMPRESA,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(resultado).toEqual({ ok: true, uploaded: 2, skipped: 1 });
    expect(storage.rutas).toEqual([
      `${EMPRESA}/${ARCHIVO}/1-1.png`,
      `${EMPRESA}/${ARCHIVO}/1-3.png`,
    ]);
  });

  it('R17 — la region que revienta al recortar deja su causa en el registro, y las otras dos se suben igual', async () => {
    const conversion = dobleDeConversion({ pageCount: 1, pages: [pngDe(1)] });
    const ia = dobleDeIa(
      JSON.stringify({
        images: [
          { page: 1, x: 0.0, y: 0.0, width: 0.2, height: 0.2 },
          { page: 1, x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
          { page: 1, x: 0.6, y: 0.6, width: 0.2, height: 0.2 },
        ],
      }),
    );
    const cropper = dobleDeCropper();
    cropper.crop.mockImplementationOnce(async () => new Uint8Array([1]));
    cropper.crop.mockImplementationOnce(async () => {
      throw new Error('la libreria no pudo recortar esta region');
    });
    cropper.crop.mockImplementationOnce(async () => new Uint8Array([3]));
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
    });

    const resultado = await recortar({
      documentFileId: ARCHIVO,
      companyId: EMPRESA,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(resultado).toEqual({ ok: true, uploaded: 2, skipped: 1 });
    expect(storage.rutas).toEqual([
      `${EMPRESA}/${ARCHIVO}/1-1.png`,
      `${EMPRESA}/${ARCHIVO}/1-3.png`,
    ]);
    expect(registro.skip).toHaveBeenCalledTimes(1);
    expect(registro.skip).toHaveBeenCalledWith({
      path: PATH,
      page: 1,
      index: 2,
      cause: 'la libreria no pudo recortar esta region',
    });
  });

  it('R17 — una region que apunta a una pagina inexistente se salta sin abortar las demas', async () => {
    const conversion = dobleDeConversion({ pageCount: 1, pages: [pngDe(1)] });
    const ia = dobleDeIa(
      JSON.stringify({
        images: [
          { page: 2, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          { page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        ],
      }),
    );
    const cropper = dobleDeCropper();
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
    });

    const resultado = await recortar({
      documentFileId: ARCHIVO,
      companyId: EMPRESA,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(resultado).toEqual({ ok: true, uploaded: 1, skipped: 1 });
    expect(storage.rutas).toEqual([`${EMPRESA}/${ARCHIVO}/1-1.png`]);
    expect(registro.skip).toHaveBeenCalledTimes(1);
    expect(registro.skip).toHaveBeenCalledWith(
      expect.objectContaining({ path: PATH, page: 2, index: 1 }),
    );
  });

  it('R5 — un plazo agotado en la lectura de coordenadas es ai_unavailable, no invalid_input', async () => {
    const conversion = dobleDeConversion();
    const ia = dobleDeIa();
    const cropper = dobleDeCropper();
    const storage = dobleDeAlmacenamiento();
    const registro = dobleDeRegistro();
    const timeout = vi.fn(async () => {
      throw new Error('el plazo de la lectura se agoto');
    });
    const recortar = createCropCatalogImages({
      converter: conversion.converter,
      ai: ia.ai,
      cropper: cropper.cropper,
      storage: storage.storage,
      log: registro.log,
      timeout,
    });

    const resultado = await recortar({
      documentFileId: ARCHIVO,
      companyId: EMPRESA,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(falloDe(resultado).code).toBe('ai_unavailable');
  });
});
