// El procesamiento de un PDF por ESTRATEGIA, contra dobles: un `readPdfWithAi` falso, un
// `countPages` falso y un `log` espia.
//
// Sin red, sin claves y sin PDF real: quien interpreta los bytes es el doble, asi que cualquier
// `Uint8Array` no vacio sirve. Lo que se vigila es tanto lo que se hace —que modo y prompt salen de
// la estrategia, que el texto vuelve intacto, que se registra una vez en toda ejecucion, incluida la
// que rechaza la estrategia— como lo que NO se hace: con una estrategia desconocida no se lee nada.

import { describe, expect, it, vi } from 'vitest';

import { aiReadInputSchema } from '@/lib/modules/documentos/domain/ai-read-input';
import { UnexpectedError } from '@/lib/modules/documentos/domain/errors';
import {
  createProcessPdfByStrategy,
  type StrategyRunResult,
} from '@/lib/modules/documentos/domain/process-pdf-by-strategy';
import { createStrategyRunLogConsole } from '@/lib/modules/documentos/adapters/driven/observability/strategy-run-log-console';

import type { PdfStrategy } from '@/lib/modules/documentos/domain/pdf-strategy';
import type {
  AiReadRequestInput,
  AiReadResult,
} from '@/lib/modules/documentos/domain/read-pdf-with-ai';
import type { StrategyRunSummary } from '@/lib/modules/documentos/ports/strategy-run-log';
import type { ErrorCode } from '@/lib/modules/errores';

const PATH = '11111111-1111-4111-8111-111111111111/catalogo.pdf';

/** Un texto que delata cualquier recorte: saltos de linea, espacios al borde y caracteres raros. */
const TEXTO_DE_LA_IA =
  '  \n Producto\tA — 12,50 €/kg\r\n  «ref: X-001»  \n\n  Producto B – 7,00 €/L \n ';

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.7\n% cualquier cosa\n1 0 obj');
}

type RespuestaDeLectura = AiReadResult | ((input: AiReadRequestInput) => AiReadResult);

/** El doble de la lectura: devuelve lo que se le diga y guarda la entrada que recibio. */
function dobleDeLectura(respuesta: RespuestaDeLectura) {
  const readPdfWithAi = vi.fn(async (input: AiReadRequestInput): Promise<AiReadResult> => {
    if (typeof respuesta === 'function') return respuesta(input);
    return respuesta;
  });
  return readPdfWithAi;
}

/** La lectura que sale bien, devolviendo el texto dado y repitiendo ruta y modo de la entrada. */
function lecturaQueDevuelve(text: string) {
  return dobleDeLectura((input) => ({ ok: true, path: input.path, mode: input.mode, text }));
}

/** La lectura que falla con un `code` y un `reason` concretos, como hace `readPdfWithAi` de verdad. */
function lecturaQueFalla(code: ErrorCode, reason: string) {
  return dobleDeLectura((input) => ({ ok: false, path: input.path, mode: input.mode, code, reason }));
}

function dobleDeConteo(pages: number | (() => never) = 3) {
  return vi.fn(async (): Promise<number> => {
    if (typeof pages === 'function') return pages();
    return pages;
  });
}

function espiaDeRegistro() {
  const run = vi.fn<(summary: StrategyRunSummary) => void>();
  return { log: { run }, run };
}

function falloDe(resultado: StrategyRunResult): {
  readonly code: ErrorCode;
  readonly reason: string;
} {
  if (resultado.ok) throw new Error('se esperaba un fallo y el resultado fue exito');
  return resultado;
}

function textoDe(resultado: StrategyRunResult): string {
  if (!resultado.ok) throw new Error(`se esperaba exito y fallo con '${resultado.code}'`);
  return resultado.text;
}

/** Todos los valores primitivos del objeto, por hondos que esten. Para R9. */
function valoresHondos(valor: unknown): unknown[] {
  if (valor === null || typeof valor !== 'object') return [valor];
  return Object.values(valor as Record<string, unknown>).flatMap(valoresHondos);
}

describe('documentos — procesar un PDF por estrategia', () => {
  it('R1 — una estrategia desconocida se rechaza con invalid_input y modo vacio, sin llamar a la lectura con IA', async () => {
    const readPdfWithAi = lecturaQueDevuelve('no deberia llegar aqui');
    const countPages = dobleDeConteo();
    const espia = espiaDeRegistro();
    const procesar = createProcessPdfByStrategy({ readPdfWithAi, countPages, log: espia.log });

    // La entrada esta TIPADA como `PdfStrategy`, asi que el valor invalido solo puede entrar con un
    // cast: el caso simula al llamante que no valido antes de llamar, que es justo lo que R1
    // describe. Sin el cast no habria forma de ejercitar la rama.
    const resultado = await procesar({
      strategy: 'panfleto' as PdfStrategy,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(resultado.ok).toBe(false);
    expect(falloDe(resultado).code).toBe('invalid_input');
    expect(resultado.ok ? null : resultado.mode).toBeNull();
    expect(
      readPdfWithAi,
      'R1: con una estrategia desconocida no se llama a la lectura con IA; llamarla gastaria una ' +
        'peticion al proveedor por una entrada que ya se sabe invalida.',
    ).not.toHaveBeenCalled();
    expect(countPages, 'R1: tampoco se cuentan las paginas de un PDF que no se va a leer.').not.toHaveBeenCalled();
    expect(espia.run).toHaveBeenCalledTimes(1);
  });

  it('R8 — el rechazo por estrategia invalida se registra una vez, con el modo vacio y la estrategia tal como llego', async () => {
    const readPdfWithAi = lecturaQueDevuelve('no deberia llegar aqui');
    const espia = espiaDeRegistro();
    const procesar = createProcessPdfByStrategy({
      readPdfWithAi,
      countPages: dobleDeConteo(),
      log: espia.log,
    });

    const resultado = await procesar({
      strategy: 'panfleto' as PdfStrategy,
      path: PATH,
      bytes: pdfBytes(),
    });

    expect(
      espia.run,
      'R8: la estrategia puede llegar de la base, asi que su rechazo es una ejecucion mas y tambien ' +
        'registra UNA entrada. Comprobar solo el retorno pasaria verde aunque nadie registrara nada.',
    ).toHaveBeenCalledTimes(1);
    expect(espia.run.mock.calls[0]?.[0]).toEqual({
      strategy: 'panfleto',
      mode: null,
      path: PATH,
      pages: null,
      textLength: 0,
    });
    expect(resultado.ok).toBe(false);
    expect(falloDe(resultado).code, 'R8: registrar el rechazo no cambia el fallo que se devuelve.').toBe(
      'invalid_input',
    );
  });

  it('R2 — catalogo pide la lectura en modo images', async () => {
    const readPdfWithAi = lecturaQueDevuelve(TEXTO_DE_LA_IA);
    const procesar = createProcessPdfByStrategy({
      readPdfWithAi,
      countPages: dobleDeConteo(),
      log: espiaDeRegistro().log,
    });

    const resultado = await procesar({ strategy: 'catalogo', path: PATH, bytes: pdfBytes() });

    expect(readPdfWithAi).toHaveBeenCalledTimes(1);
    expect(
      readPdfWithAi.mock.calls[0]?.[0]?.mode,
      'R2: `catalogo` se lee como IMAGEN, y el literal que manda las paginas rasterizadas es ' +
        "'images'. Si aqui sale 'pdf', el mapa estrategia -> modo esta invertido.",
    ).toBe('images');
    expect(resultado.ok ? resultado.mode : null).toBe('images');
  });

  it('R3 — formula pide la lectura en modo pdf', async () => {
    const readPdfWithAi = lecturaQueDevuelve(TEXTO_DE_LA_IA);
    const procesar = createProcessPdfByStrategy({
      readPdfWithAi,
      countPages: dobleDeConteo(),
      log: espiaDeRegistro().log,
    });

    const resultado = await procesar({ strategy: 'formula', path: PATH, bytes: pdfBytes() });

    expect(readPdfWithAi).toHaveBeenCalledTimes(1);
    expect(
      readPdfWithAi.mock.calls[0]?.[0]?.mode,
      "R3: `formula` se lee como TEXTO, y eso es el PDF entero al modelo multimodal: el literal 'pdf'.",
    ).toBe('pdf');
    expect(resultado.ok ? resultado.mode : null).toBe('pdf');
  });

  it('R5 — la entrada que construye cada estrategia trae un prompt que pasa aiReadInputSchema, sin que el llamante aporte texto', async () => {
    for (const strategy of ['catalogo', 'formula'] as const) {
      const readPdfWithAi = lecturaQueDevuelve(TEXTO_DE_LA_IA);
      const procesar = createProcessPdfByStrategy({
        readPdfWithAi,
        countPages: dobleDeConteo(),
        log: espiaDeRegistro().log,
      });

      // La entrada del caso de uso NO lleva prompt: el texto lo pone la estrategia.
      await procesar({ strategy, path: PATH, bytes: pdfBytes() });

      const entrada = readPdfWithAi.mock.calls[0]?.[0];
      expect(entrada, `R5: '${strategy}' no llego a llamar a la lectura`).toBeDefined();
      const delPrompt = aiReadInputSchema.shape.prompt.safeParse(entrada?.prompt);
      expect(
        delPrompt.success,
        `R5: el prompt de '${strategy}' no pasa aiReadInputSchema (prompt: z.string().trim().min(1)), ` +
          `asi que esa estrategia nace incapaz de ejecutarse. Recibido: ${JSON.stringify(entrada?.prompt)}`,
      ).toBe(true);
      // La entrada entera, no solo el prompt: es lo que de verdad cruza hacia el puerto.
      expect(
        aiReadInputSchema.safeParse(entrada).success,
        `R5: la entrada construida por '${strategy}' no satisface aiReadInputSchema entero.`,
      ).toBe(true);
    }
  });

  it('R7 — devuelve el texto de la IA byte a byte, con su estrategia', async () => {
    const readPdfWithAi = lecturaQueDevuelve(TEXTO_DE_LA_IA);
    const procesar = createProcessPdfByStrategy({
      readPdfWithAi,
      countPages: dobleDeConteo(),
      log: espiaDeRegistro().log,
    });

    const resultado = await procesar({ strategy: 'formula', path: PATH, bytes: pdfBytes() });

    expect(resultado.ok).toBe(true);
    expect(
      textoDe(resultado),
      'R7: el texto vuelve TAL CUAL. Un `trim`, un recorte o una normalizacion de saltos de linea ' +
        'por el camino se ve aqui, porque el texto de prueba empieza y acaba en espacios y trae ' +
        'saltos, tabuladores y caracteres no ASCII.',
    ).toBe(TEXTO_DE_LA_IA);
    expect(textoDe(resultado)).toHaveLength(TEXTO_DE_LA_IA.length);
    expect(resultado.strategy).toBe('formula');
    expect(resultado.path).toBe(PATH);
  });

  it('R8 — registra exactamente una vez por ejecucion, en exito y en fallo, con los cinco campos', async () => {
    const enExito = espiaDeRegistro();
    await createProcessPdfByStrategy({
      readPdfWithAi: lecturaQueDevuelve(TEXTO_DE_LA_IA),
      countPages: dobleDeConteo(7),
      log: enExito.log,
    })({ strategy: 'catalogo', path: PATH, bytes: pdfBytes() });

    expect(enExito.run, 'R8: una ejecucion con exito registra UNA entrada.').toHaveBeenCalledTimes(1);
    const resumenDeExito = enExito.run.mock.calls[0]?.[0] as StrategyRunSummary;
    expect(
      Object.keys(resumenDeExito).sort(),
      'R8: el resumen lleva los cinco campos, ni mas ni menos.',
    ).toEqual(['mode', 'pages', 'path', 'strategy', 'textLength']);
    expect(resumenDeExito).toEqual({
      strategy: 'catalogo',
      mode: 'images',
      path: PATH,
      pages: 7,
      textLength: TEXTO_DE_LA_IA.length,
    });

    const enFallo = espiaDeRegistro();
    await createProcessPdfByStrategy({
      readPdfWithAi: lecturaQueFalla('ai_unavailable', 'el proveedor no respondio'),
      countPages: dobleDeConteo(7),
      log: enFallo.log,
    })({ strategy: 'formula', path: PATH, bytes: pdfBytes() });

    expect(
      enFallo.run,
      'R8: una ejecucion que FALLA tambien registra UNA entrada: R8 exige una por ejecucion, no una ' +
        'por exito.',
    ).toHaveBeenCalledTimes(1);
    expect(enFallo.run.mock.calls[0]?.[0]).toEqual({
      strategy: 'formula',
      mode: 'pdf',
      path: PATH,
      pages: 7,
      textLength: 0,
    });
  });

  it('R8 — `pages` sale del countPages inyectado y no de ningun otro sitio', async () => {
    const countPages = dobleDeConteo(42);
    const espia = espiaDeRegistro();
    await createProcessPdfByStrategy({
      readPdfWithAi: lecturaQueDevuelve(TEXTO_DE_LA_IA),
      countPages,
      log: espia.log,
    })({ strategy: 'catalogo', path: PATH, bytes: pdfBytes() });

    expect(countPages).toHaveBeenCalledTimes(1);
    expect(
      (espia.run.mock.calls[0]?.[0] as StrategyRunSummary).pages,
      'R8: el numero de paginas no sale de la lectura —`AiReadResult` no lo trae—, sale del ' +
        '`countPages` inyectado.',
    ).toBe(42);
  });

  it('R9 — el resumen registrado no contiene el texto por ningun lado, y textLength coincide con su longitud', async () => {
    const espia = espiaDeRegistro();
    const resultado = await createProcessPdfByStrategy({
      readPdfWithAi: lecturaQueDevuelve(TEXTO_DE_LA_IA),
      countPages: dobleDeConteo(),
      log: espia.log,
    })({ strategy: 'catalogo', path: PATH, bytes: pdfBytes() });

    const resumen = espia.run.mock.calls[0]?.[0] as StrategyRunSummary;
    // Se recorre el objeto entero, no los campos conocidos: un campo nuevo que colara el texto
    // tiene que hacer rojo este caso.
    for (const valor of valoresHondos(resumen)) {
      const comoTexto = typeof valor === 'string' ? valor : String(valor);
      expect(
        comoTexto.includes(TEXTO_DE_LA_IA.trim()),
        `R9: al registro solo llega la LONGITUD del texto. Un valor del resumen lo trae dentro: ` +
          `${JSON.stringify(valor)}`,
      ).toBe(false);
      expect(comoTexto.includes('Producto A')).toBe(false);
    }
    expect(
      resumen.textLength,
      'R9: `textLength` es la longitud exacta del texto que se devolvio, no una estimacion ni la de ' +
        'un recorte.',
    ).toBe(textoDe(resultado).length);
    expect(resumen.textLength).toBe(TEXTO_DE_LA_IA.length);
  });

  it('R10 — un fallo de la lectura vuelve con su mismo code y reason, sin lanzar y sin inventar texto', async () => {
    const fallos = [
      { code: 'invalid_input' as ErrorCode, reason: "read-pdf-with-ai: 'countPages' fallo (51 > 50)" },
      { code: 'ai_unavailable' as ErrorCode, reason: 'read-pdf-with-ai: el proveedor no respondio' },
    ];

    for (const fallo of fallos) {
      const espia = espiaDeRegistro();
      const procesar = createProcessPdfByStrategy({
        readPdfWithAi: lecturaQueFalla(fallo.code, fallo.reason),
        countPages: dobleDeConteo(),
        log: espia.log,
      });

      const resultado = await procesar({ strategy: 'catalogo', path: PATH, bytes: pdfBytes() });

      expect(resultado.ok, `R10: el fallo '${fallo.code}' tiene que volver como ok:false.`).toBe(false);
      expect(
        falloDe(resultado).code,
        `R10: el catalogo de ErrorCode es el mismo de la lectura: '${fallo.code}' no se traduce ni se ` +
          'reetiqueta al subir de capa.',
      ).toBe(fallo.code);
      expect(falloDe(resultado).reason).toBe(fallo.reason);
      expect(
        Object.hasOwn(resultado, 'text'),
        'R10: un fallo no trae texto; inventar una cadena vacia haria pasar por lectura algo que no ocurrio.',
      ).toBe(false);
      expect(resultado.strategy).toBe('catalogo');
    }
  });

  it('R12 — la firma no admite actor y el caso corre entero sin recibir ninguno ni exigir permiso', async () => {
    const readPdfWithAi = lecturaQueDevuelve(TEXTO_DE_LA_IA);
    const espia = espiaDeRegistro();
    const procesar = createProcessPdfByStrategy({
      readPdfWithAi,
      countPages: dobleDeConteo(),
      log: espia.log,
    });

    // La comprobacion de verdad la hace el compilador: si algun dia la firma admitiera un actor,
    // este `@ts-expect-error` sobraria y `pnpm typecheck` se pondria rojo.
    await procesar({
      strategy: 'catalogo',
      path: PATH,
      bytes: pdfBytes(),
      // @ts-expect-error R12: la entrada NO admite actor; quien encola es quien comprueba el permiso.
      actor: { id: 'quien-sea', companyId: 'la-que-sea', permissions: [] },
    });

    // Y sin actor corre a fondo: ni se rechaza por falta de permiso ni se queda a medias.
    const resultado = await procesar({ strategy: 'catalogo', path: PATH, bytes: pdfBytes() });

    expect(
      resultado.ok,
      'R12: no hay permiso que exigir aqui; si esto fuera ok:false, alguien habria duplicado la ' +
        'comprobacion que ya hace quien encola.',
    ).toBe(true);
    expect(textoDe(resultado)).toBe(TEXTO_DE_LA_IA);
    expect(readPdfWithAi).toHaveBeenCalledTimes(2);
    expect(espia.run).toHaveBeenCalledTimes(2);
  });

  it('design 3.4 — si countPages LANZA, el resumen va con pages null y la ejecucion sigue igual', async () => {
    const reventar = (): never => {
      throw new Error('PDF corrupto');
    };
    const espia = espiaDeRegistro();
    const conConteoRoto = createProcessPdfByStrategy({
      readPdfWithAi: lecturaQueDevuelve(TEXTO_DE_LA_IA),
      countPages: dobleDeConteo(reventar),
      log: espia.log,
    });

    const resultado = await conConteoRoto({ strategy: 'catalogo', path: PATH, bytes: pdfBytes() });

    expect(espia.run).toHaveBeenCalledTimes(1);
    expect(
      (espia.run.mock.calls[0]?.[0] as StrategyRunSummary).pages,
      'design.md > 3.4 (1): contar paginas es para el REGISTRO. Si revienta se registra `null`.',
    ).toBeNull();

    const conConteoSano = espiaDeRegistro();
    const esperado = await createProcessPdfByStrategy({
      readPdfWithAi: lecturaQueDevuelve(TEXTO_DE_LA_IA),
      countPages: dobleDeConteo(3),
      log: conConteoSano.log,
    })({ strategy: 'catalogo', path: PATH, bytes: pdfBytes() });

    expect(
      resultado,
      'design.md > 3.4 (1): un fallo de conteo no puede convertirse en un fallo de lectura que no ' +
        'ocurrio, asi que el resultado es identico al de una ejecucion que conto bien.',
    ).toEqual(esperado);
  });

  it('design 3.4 — la red de seguridad del catch: si readPdfWithAi LANZA, la excepcion no se propaga y vuelve como ok:false con el code de UnexpectedError, registrando igual', async () => {
    const MENSAJE = 'el SDK del proveedor reviento en vez de devolver ok:false';
    const readPdfWithAi = vi.fn(async (): Promise<AiReadResult> => {
      throw new Error(MENSAJE);
    });
    const espia = espiaDeRegistro();
    const procesar = createProcessPdfByStrategy({
      readPdfWithAi,
      countPages: dobleDeConteo(),
      log: espia.log,
    });

    // Se captura a mano en vez de con `.resolves`: asi el caso solo pasa si de verdad hay un
    // resultado. Sin el `catch` de produccion, `resuelto` se quedaria en null y esto seria rojo.
    let resuelto: StrategyRunResult | null = null;
    let propagado: unknown = null;
    try {
      resuelto = await procesar({ strategy: 'catalogo', path: PATH, bytes: pdfBytes() });
    } catch (error) {
      propagado = error;
    }

    expect(
      propagado,
      'design.md > 3.4: el contrato dice que esta capa NO lanza. Si la lectura inyectada deja de ' +
        'cumplir el suyo, el `catch` es lo unico que sostiene el nuestro.',
    ).toBeNull();
    expect(resuelto, 'design.md > 3.4: tiene que haber un resultado, no una promesa rechazada.').not.toBeNull();

    const resultado = resuelto as StrategyRunResult;
    expect(resultado.ok).toBe(false);
    expect(
      falloDe(resultado).code,
      'design.md > 3.4: un lanzamiento no es un corte del proveedor ni una entrada invalida; es lo ' +
        'inesperado, y su codigo sale del propio error del dominio.',
    ).toBe(new UnexpectedError().code);
    expect(
      falloDe(resultado).reason,
      'design.md > 3.4: la causa del lanzamiento viaja en el reason, o el diagnostico se pierde.',
    ).toContain(MENSAJE);
    expect(
      resultado.strategy,
      'design.md > 3.4: aqui la estrategia SI era valida, asi que estrategia y modo no quedan vacios.',
    ).toBe('catalogo');
    expect(resultado.ok ? null : resultado.mode).toBe('images');

    expect(
      espia.run,
      'design.md > 3.4: un lanzamiento no se traga la entrada del registro: sigue habiendo UNA por ' +
        'ejecucion.',
    ).toHaveBeenCalledTimes(1);
    expect((espia.run.mock.calls[0]?.[0] as StrategyRunSummary).textLength).toBe(0);
  });
});

describe('documentos — el adaptador de consola del registro por estrategia', () => {
  function resumen(cambios: Partial<StrategyRunSummary> = {}): StrategyRunSummary {
    return {
      strategy: 'catalogo',
      mode: 'images',
      path: PATH,
      pages: 3,
      textLength: TEXTO_DE_LA_IA.length,
      ...cambios,
    };
  }

  it('R9 — la linea que escribe lleva la longitud y nunca el texto de la IA', () => {
    const escrito: string[] = [];
    // La escritura entra por parametro: no hay que parchear la consola global, que ensuciaria el
    // resto de la suite.
    createStrategyRunLogConsole((linea) => escrito.push(linea)).run(resumen());

    expect(escrito).toHaveLength(1);
    const linea = escrito[0] ?? '';
    expect(
      linea.includes(TEXTO_DE_LA_IA.trim()),
      `R9: la linea del registro no puede traer el texto de la IA. Escrito: ${linea}`,
    ).toBe(false);
    expect(linea.includes('Producto A')).toBe(false);
    expect(
      linea,
      'R9: lo que si lleva es la LONGITUD, que es lo unico que el puerto admite.',
    ).toContain(`longitud=${TEXTO_DE_LA_IA.length}`);
    expect(linea).toContain('estrategia=catalogo');
    expect(linea).toContain('modo=images');
    expect(linea).toContain(PATH);
    expect(linea).toContain('paginas=3');
  });

  it('R8 — con pages null escribe su hueco en vez de un numero inventado', () => {
    const escrito: string[] = [];
    createStrategyRunLogConsole((linea) => escrito.push(linea)).run(resumen({ pages: null }));

    const linea = escrito[0] ?? '';
    expect(linea).toContain('paginas=sin-paginas');
    expect(
      linea.includes('paginas=null') || linea.includes('paginas=0'),
      `R8: un PDF que no se pudo contar no tiene cero paginas. Escrito: ${linea}`,
    ).toBe(false);
  });

  it('R8 — con mode null escribe su hueco en vez de volcar el nulo', () => {
    const escrito: string[] = [];
    createStrategyRunLogConsole((linea) => escrito.push(linea)).run(
      resumen({ mode: null, pages: null, textLength: 0 }),
    );

    const linea = escrito[0] ?? '';
    expect(linea).toContain('modo=sin-modo');
    expect(
      linea.includes('modo=null') || linea.includes('modo=undefined'),
      `R8: el rechazo por estrategia invalida se registra, y su modo vacio se lee como hueco. Escrito: ${linea}`,
    ).toBe(false);
  });
});
