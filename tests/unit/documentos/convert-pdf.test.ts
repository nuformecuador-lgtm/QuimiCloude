// La conversion de un PDF, contra un doble del convertidor.
//
// Lo que se vigila aqui es tanto lo que se hace como lo que NO se llega a hacer: que un archivo que
// no es PDF no llegue a contarse, que uno con demasiadas paginas no llegue a renderizarse, y que un
// archivo roto no se lleve por delante a los demas de la tanda. Por eso el doble registra sus
// llamadas y varios casos afirman sobre `not.toHaveBeenCalled()`.
//
// Sin red y sin la libreria de verdad: el puerto es la unica via al exterior y esta sustituido.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  createConvertPdfs,
  type ConversionResult,
  type PdfToConvert,
} from '@/lib/modules/documentos/domain/convert-pdf';
import { MAX_PDF_PAGES, PAGE_RENDER_DPI } from '@/lib/modules/documentos/domain/limits';

import type { PdfConverter, RenderedPage } from '@/lib/modules/documentos/ports/pdf-converter';

const EMPRESA = '33333333-3333-4333-8333-333333333333';

/** Bytes con la firma de un PDF de verdad, mas una marca para distinguir un archivo de otro. */
function pdfDe(marca: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n% ${marca}\n1 0 obj`);
}

function archivo(marca: string, bytes: Uint8Array = pdfDe(marca)): PdfToConvert {
  return { path: `${EMPRESA}/${marca}.pdf`, bytes };
}

function paginaFalsa(pageNumber: number): RenderedPage {
  // La firma de un PNG: lo que produce el adaptador de verdad.
  return { pageNumber, png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
}

/**
 * Doble del convertidor. Cada operacion se puede sustituir por una funcion que devuelva o que LANCE,
 * que es como se simulan el archivo corrupto y el par nativo ausente.
 */
function dobleDeConversion(
  config: {
    readonly pageCount?: (pdf: Uint8Array) => number;
    readonly text?: (pdf: Uint8Array) => string;
    readonly render?: (pdf: Uint8Array, dpi: number) => readonly RenderedPage[];
  } = {},
) {
  const countPages = vi.fn(async (pdf: Uint8Array): Promise<number> => config.pageCount?.(pdf) ?? 1);
  const extractText = vi.fn(
    async (pdf: Uint8Array): Promise<string> => config.text?.(pdf) ?? 'precio;producto',
  );
  const renderPages = vi.fn(
    async (pdf: Uint8Array, dpi: number): Promise<readonly RenderedPage[]> =>
      config.render?.(pdf, dpi) ?? [paginaFalsa(1)],
  );

  const converter: PdfConverter = { countPages, extractText, renderPages };
  return { converter, countPages, extractText, renderPages };
}

/** El fallo de un resultado, ya estrechado: los casos que lo usan ya afirmaron que fallo. */
function fallo(resultado: ConversionResult): { readonly path: string; readonly reason: string } {
  if (resultado.ok) throw new Error('se esperaba un fallo y el resultado fue exito');
  return resultado;
}

describe('documentos — conversion de un PDF', () => {
  describe('«¿es un PDF?» se pregunta PRIMERO y por el contenido (R17)', () => {
    it('R17 — unos bytes que no son PDF se rechazan ANTES de llamar a countPages', async () => {
      const doble = dobleDeConversion();
      const convertir = createConvertPdfs({ converter: doble.converter });
      // Se llama `.pdf` y no lo es: la extension no decide nada, porque no entra en la decision.
      const csv = archivo('catalogo', new TextEncoder().encode('precio;producto\n12.5;Acido citrico'));

      const [resultado] = await convertir([csv], 'text');

      expect(resultado?.ok).toBe(false);
      expect(doble.countPages).not.toHaveBeenCalled();
      expect(doble.extractText).not.toHaveBeenCalled();
      expect(doble.renderPages).not.toHaveBeenCalled();
    });

    it('R17, R23 — el fallo dice QUE operacion fallo y SOBRE QUE ruta', async () => {
      const doble = dobleDeConversion();
      const convertir = createConvertPdfs({ converter: doble.converter });
      const png = archivo('imagen', new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

      const [resultado] = await convertir([png], 'images');

      const { path, reason } = fallo(resultado as ConversionResult);
      expect(path).toBe(png.path);
      expect(reason).toContain('isPdfContent');
      expect(reason).toContain(png.path);
      // Y no es un `catch` vacio: la causa viaja escrita.
      expect(reason).toContain('firma');
    });
  });

  describe('el tope de paginas se aplica sin renderizar (R19)', () => {
    it('R19 — un PDF con 51 paginas se rechaza con CERO llamadas a renderPages', async () => {
      const doble = dobleDeConversion({ pageCount: () => 51 });
      const convertir = createConvertPdfs({ converter: doble.converter });

      const [resultado] = await convertir([archivo('gordo')], 'images');

      expect(resultado?.ok).toBe(false);
      expect(doble.countPages).toHaveBeenCalledTimes(1);
      expect(doble.renderPages).not.toHaveBeenCalled();
      expect(doble.extractText).not.toHaveBeenCalled();
      expect(fallo(resultado as ConversionResult).reason).toContain('countPages');
      expect(fallo(resultado as ConversionResult).reason).toContain('51');
    });

    it('R19 — tampoco se extrae texto de un archivo por encima del tope', async () => {
      const doble = dobleDeConversion({ pageCount: () => MAX_PDF_PAGES + 1 });
      const convertir = createConvertPdfs({ converter: doble.converter });

      const [resultado] = await convertir([archivo('gordo')], 'text');

      expect(resultado?.ok).toBe(false);
      expect(doble.extractText).not.toHaveBeenCalled();
    });

    it('R19 — el tope es INCLUSIVO: con 50 paginas se renderiza', async () => {
      const doble = dobleDeConversion({ pageCount: () => MAX_PDF_PAGES });
      const convertir = createConvertPdfs({ converter: doble.converter });

      const [resultado] = await convertir([archivo('justo')], 'images');

      expect(resultado?.ok).toBe(true);
      expect(doble.renderPages).toHaveBeenCalledTimes(1);
      expect(MAX_PDF_PAGES).toBe(50);
    });
  });

  describe('lo que se pide es lo que se hace (R21, R22)', () => {
    it('R22 — las paginas se piden a la resolucion unica del modulo, y vuelven como PNG', async () => {
      const doble = dobleDeConversion({ pageCount: () => 2, render: () => [paginaFalsa(1), paginaFalsa(2)] });
      const convertir = createConvertPdfs({ converter: doble.converter });
      const uno = archivo('catalogo');

      const [resultado] = await convertir([uno], 'images');

      expect(doble.renderPages).toHaveBeenCalledWith(uno.bytes, PAGE_RENDER_DPI);
      expect(PAGE_RENDER_DPI).toBe(150);
      if (resultado === undefined || !resultado.ok || resultado.output !== 'images') {
        expect.unreachable('se esperaba el render de las paginas');
      } else {
        expect(resultado.pages.map((pagina) => pagina.pageNumber)).toEqual([1, 2]);
        // La firma de un PNG, que es lo que no admite perdida.
        expect([...(resultado.pages[0] as RenderedPage).png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
        expect(resultado.pageCount).toBe(2);
      }
    });

    it('R21 — pedir el texto no renderiza ninguna pagina, y pedir imagenes no extrae texto', async () => {
      const paraTexto = dobleDeConversion({ text: () => 'Acido citrico 12,5' });
      await createConvertPdfs({ converter: paraTexto.converter })([archivo('uno')], 'text');
      expect(paraTexto.extractText).toHaveBeenCalledTimes(1);
      expect(paraTexto.renderPages).not.toHaveBeenCalled();

      const paraImagen = dobleDeConversion();
      await createConvertPdfs({ converter: paraImagen.converter })([archivo('uno')], 'images');
      expect(paraImagen.renderPages).toHaveBeenCalledTimes(1);
      expect(paraImagen.extractText).not.toHaveBeenCalled();
    });

    it('R21 — el dominio no nombra ninguna libreria de conversion: solo conoce el puerto', async () => {
      const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const fuente = readFileSync(
        join(raiz, 'lib', 'modules', 'documentos', 'domain', 'convert-pdf.ts'),
        'utf8',
      );

      expect(fuente).not.toMatch(/unpdf/);
      expect(fuente).not.toMatch(/@napi-rs/);
      expect(fuente).not.toMatch(/from\s+'next/);
    });
  });

  describe('un archivo roto NO tumba la tanda (R23)', () => {
    it('R23 — si el convertidor revienta con el 2.o de 3, el 1.o y el 3.o siguen saliendo bien', async () => {
      const roto = archivo('cifrado');
      const doble = dobleDeConversion({
        text: (pdf) => {
          if (pdf === roto.bytes) throw new Error('el documento esta cifrado y no se puede abrir');
          return 'precio;producto';
        },
      });
      const convertir = createConvertPdfs({ converter: doble.converter });

      const resultados = await convertir([archivo('uno'), roto, archivo('tres')], 'text');

      expect(resultados).toHaveLength(3);
      expect(resultados[0]?.ok).toBe(true);
      expect(resultados[1]?.ok).toBe(false);
      expect(resultados[2]?.ok).toBe(true);
      // El orden se conserva, asi que quien llama sabe cual archivo fallo sin adivinarlo.
      expect(resultados.map((resultado) => resultado.path)).toEqual([
        `${EMPRESA}/uno.pdf`,
        roto.path,
        `${EMPRESA}/tres.pdf`,
      ]);
    });

    it('R23 — el fallo del archivo roto nombra la operacion, la ruta y la causa, y no se traga', async () => {
      const roto = archivo('cifrado');
      const doble = dobleDeConversion({
        text: (pdf) => {
          if (pdf === roto.bytes) throw new Error('el documento esta cifrado y no se puede abrir');
          return 'precio;producto';
        },
      });

      const resultados = await createConvertPdfs({ converter: doble.converter })(
        [archivo('uno'), roto],
        'text',
      );

      const { reason } = fallo(resultados[1] as ConversionResult);
      expect(reason).toContain('extractText');
      expect(reason).toContain(roto.path);
      expect(reason).toContain('cifrado');
    });

    it('R23 — la conversion de una tanda NUNCA lanza: el fallo es un valor, no una excepcion', async () => {
      const doble = dobleDeConversion({
        pageCount: () => {
          throw new Error('el archivo esta corrupto');
        },
      });

      const resultados = await createConvertPdfs({ converter: doble.converter })(
        [archivo('uno'), archivo('dos')],
        'images',
      );

      expect(resultados.every((resultado) => !resultado.ok)).toBe(true);
      expect(fallo(resultados[0] as ConversionResult).reason).toContain('countPages');
      expect(fallo(resultados[0] as ConversionResult).reason).toContain('corrupto');
    });
  });

  describe('sin el par opcional, el texto sigue en pie (R25)', () => {
    it('R25 — el render falla nombrando la causa y la extraccion de texto del mismo archivo sale bien', async () => {
      // El par nativo que rasteriza la pagina es OPCIONAL; la extraccion de texto no lo necesita.
      const sinParNativo = () => {
        throw new Error('@napi-rs/canvas no esta disponible en este runtime');
      };
      const doble = dobleDeConversion({ pageCount: () => 3, render: sinParNativo, text: () => 'Acido citrico' });
      const convertir = createConvertPdfs({ converter: doble.converter });
      const uno = archivo('catalogo');

      const [imagen] = await convertir([uno], 'images');
      const [texto] = await convertir([uno], 'text');

      // La imagen falla, y el error NOMBRA la causa en vez de decir «fallo la conversion».
      const { reason } = fallo(imagen as ConversionResult);
      expect(reason).toContain('renderPages');
      expect(reason).toContain('@napi-rs/canvas');
      expect(reason).toContain(uno.path);

      // Y el texto no se cae por ese motivo.
      if (texto === undefined || !texto.ok || texto.output !== 'text') {
        expect.unreachable('el texto tenia que haberse extraido');
      } else {
        expect(texto.text).toBe('Acido citrico');
        expect(texto.pageCount).toBe(3);
      }
    });
  });
});
