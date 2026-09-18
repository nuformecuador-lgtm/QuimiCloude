// La lectura de un PDF con IA, contra dobles del puerto de IA y del convertidor.
//
// Lo que se vigila es tanto lo que se hace como lo que NO se llega a hacer: en modo `pdf` el
// convertidor no se toca; si el PDF pasa el tope de paginas, ni se renderiza ni se llama a la IA;
// si el prompt o el modo son invalidos, ningun puerto se toca. Por eso los dos dobles registran sus
// llamadas.
//
// Sin red y sin la libreria de verdad: los dos puertos son la unica via al exterior y estan
// sustituidos.

import { describe, expect, it, vi } from 'vitest';

import { createReadPdfWithAi, type AiReadResult } from '@/lib/modules/documentos/domain/read-pdf-with-ai';
import { MAX_PDF_PAGES, PAGE_RENDER_DPI } from '@/lib/modules/documentos/domain/limits';

import type { AiReadRequest, AiReader } from '@/lib/modules/documentos/ports/ai-reader';
import type { PdfConverter, RenderedPage } from '@/lib/modules/documentos/ports/pdf-converter';

const PATH = '11111111-1111-4111-8111-111111111111/catalogo.pdf';

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.7\n% catalogo\n1 0 obj');
}

function pngDe(pageNumber: number): RenderedPage {
  return { pageNumber, png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, pageNumber]) };
}

function dobleDeIa(respuesta: string | ((request: AiReadRequest) => string) = 'texto de la IA') {
  const read = vi.fn(async (request: AiReadRequest): Promise<string> =>
    typeof respuesta === 'function' ? respuesta(request) : respuesta,
  );
  const ai: AiReader = { read };
  return { ai, read };
}

function dobleDeConversion(
  config: {
    readonly pageCount?: number;
    readonly pages?: readonly RenderedPage[];
  } = {},
) {
  const countPages = vi.fn(async (): Promise<number> => config.pageCount ?? 1);
  const extractText = vi.fn(async (): Promise<string> => '');
  const renderPages = vi.fn(
    async (): Promise<readonly RenderedPage[]> => config.pages ?? [pngDe(1)],
  );
  const converter: PdfConverter = { countPages, extractText, renderPages };
  return { converter, countPages, extractText, renderPages };
}

function falloDe(resultado: AiReadResult): { readonly code: string; readonly reason: string } {
  if (resultado.ok) throw new Error('se esperaba un fallo y el resultado fue exito');
  return resultado;
}

describe('documentos — lectura de un PDF con IA', () => {
  it('R3, R4 — modo pdf manda UNA parte pdf y no toca el convertidor', async () => {
    const doble = dobleDeIa();
    const conversion = dobleDeConversion();
    const leer = createReadPdfWithAi({ ai: doble.ai, converter: conversion.converter });

    const resultado = await leer({ path: PATH, bytes: pdfBytes(), prompt: 'lee esto', mode: 'pdf' });

    expect(resultado.ok).toBe(true);
    expect(doble.read).toHaveBeenCalledTimes(1);
    expect(doble.read.mock.calls[0]?.[0]?.parts).toEqual([{ kind: 'pdf', bytes: expect.any(Uint8Array) }]);
    expect(conversion.countPages).not.toHaveBeenCalled();
    expect(conversion.renderPages).not.toHaveBeenCalled();
  });

  it('R3, R4 — modo images con 3 paginas manda TRES partes image en orden, a la resolucion del modulo', async () => {
    const doble = dobleDeIa();
    const conversion = dobleDeConversion({ pageCount: 3, pages: [pngDe(1), pngDe(2), pngDe(3)] });
    const leer = createReadPdfWithAi({ ai: doble.ai, converter: conversion.converter });

    const resultado = await leer({ path: PATH, bytes: pdfBytes(), prompt: 'lee esto', mode: 'images' });

    expect(resultado.ok).toBe(true);
    expect(conversion.renderPages).toHaveBeenCalledWith(expect.any(Uint8Array), PAGE_RENDER_DPI);
    const partes = doble.read.mock.calls[0]?.[0]?.parts ?? [];
    expect(partes.map((parte) => parte.kind)).toEqual(['image', 'image', 'image']);
    expect(partes.map((parte) => (parte.kind === 'image' ? parte.pageNumber : -1))).toEqual([1, 2, 3]);
  });

  it('R5 — 51 paginas se rechaza con CERO llamadas a renderPages y CERO a la IA', async () => {
    const doble = dobleDeIa();
    const conversion = dobleDeConversion({ pageCount: 51 });
    const leer = createReadPdfWithAi({ ai: doble.ai, converter: conversion.converter });

    const resultado = await leer({ path: PATH, bytes: pdfBytes(), prompt: 'lee esto', mode: 'images' });

    expect(resultado.ok).toBe(false);
    expect(conversion.renderPages).not.toHaveBeenCalled();
    expect(doble.read).not.toHaveBeenCalled();
    expect(falloDe(resultado).reason).toContain('countPages');
    expect(falloDe(resultado).reason).toContain('51');
  });

  it('R5 — el tope es INCLUSIVO: con 50 paginas se lee', async () => {
    const doble = dobleDeIa();
    const conversion = dobleDeConversion({ pageCount: MAX_PDF_PAGES, pages: [pngDe(1)] });
    const leer = createReadPdfWithAi({ ai: doble.ai, converter: conversion.converter });

    const resultado = await leer({ path: PATH, bytes: pdfBytes(), prompt: 'lee esto', mode: 'images' });

    expect(resultado.ok).toBe(true);
    expect(doble.read).toHaveBeenCalledTimes(1);
    expect(MAX_PDF_PAGES).toBe(50);
  });

  it('R2 — el prompt que recibe la IA es EXACTAMENTE el que entro, sin prefijos ni sufijos', async () => {
    const doble = dobleDeIa();
    const conversion = dobleDeConversion();
    const leer = createReadPdfWithAi({ ai: doble.ai, converter: conversion.converter });
    const prompt = 'extrae el precio y el producto de cada fila';

    await leer({ path: PATH, bytes: pdfBytes(), prompt, mode: 'pdf' });

    expect(doble.read.mock.calls[0]?.[0]?.prompt).toBe(prompt);
  });

  it('R6 — el texto devuelto es IDENTICO al de la IA, saltos de linea y espacios incluidos', async () => {
    const texto = '  Acido citrico\n12,5 kg\n\nGlicerina';
    const doble = dobleDeIa(texto);
    const conversion = dobleDeConversion();
    const leer = createReadPdfWithAi({ ai: doble.ai, converter: conversion.converter });

    const resultado = await leer({ path: PATH, bytes: pdfBytes(), prompt: 'lee esto', mode: 'pdf' });

    if (!resultado.ok) throw new Error('se esperaba exito');
    expect(resultado.text).toBe(texto);
  });

  it('R2, R23 — un prompt vacio se rechaza SIN tocar ningun puerto', async () => {
    const doble = dobleDeIa();
    const conversion = dobleDeConversion();
    const leer = createReadPdfWithAi({ ai: doble.ai, converter: conversion.converter });

    const resultado = await leer({ path: PATH, bytes: pdfBytes(), prompt: '   ', mode: 'pdf' });

    expect(resultado.ok).toBe(false);
    expect(doble.read).not.toHaveBeenCalled();
    expect(conversion.countPages).not.toHaveBeenCalled();
  });

  it('R3, R23 — un modo desconocido se rechaza SIN tocar ningun puerto', async () => {
    const doble = dobleDeIa();
    const conversion = dobleDeConversion();
    const leer = createReadPdfWithAi({ ai: doble.ai, converter: conversion.converter });

    const resultado = await leer({
      path: PATH,
      bytes: pdfBytes(),
      prompt: 'lee esto',
      // @ts-expect-error -- se prueba justo el rechazo de un modo que no existe
      mode: 'texto',
    });

    expect(resultado.ok).toBe(false);
    expect(doble.read).not.toHaveBeenCalled();
    expect(conversion.renderPages).not.toHaveBeenCalled();
  });

  it('R8 — si el convertidor lanza, el fallo nombra la operacion y la ruta', async () => {
    const doble = dobleDeIa();
    const conversion = dobleDeConversion();
    conversion.countPages.mockImplementation(async () => {
      throw new Error('el archivo esta corrupto');
    });
    const leer = createReadPdfWithAi({ ai: doble.ai, converter: conversion.converter });

    const resultado = await leer({ path: PATH, bytes: pdfBytes(), prompt: 'lee esto', mode: 'images' });

    const { reason } = falloDe(resultado);
    expect(reason).toContain('countPages');
    expect(reason).toContain(PATH);
    expect(reason).toContain('corrupto');
  });
});
