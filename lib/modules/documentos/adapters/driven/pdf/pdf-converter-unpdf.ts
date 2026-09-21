import { extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';

import type { RenderedPage } from '../../../ports/pdf-converter';

/**
 * Implementa el puerto de conversion. **UNICO archivo del repositorio que importa la libreria de
 * PDF y su par nativo de rasterizado**, y esa no es una preferencia de orden: es la condicion con
 * la que las dos entradas fueron aprobadas. Sustituirlas tiene que ser reescribir este archivo, no
 * buscarlas por el arbol.
 *
 * El dominio decide QUE se convierte y con que limites; aqui solo esta el COMO.
 *
 * **La conversion a TEXTO no depende del par nativo.** Solo la de imagen lo necesita, y por eso el
 * par se carga dentro de `renderPages` y no al importar este archivo: en un entorno donde el
 * binario no cargue, extraer texto sigue funcionando y solo falla el rasterizado, con un error que
 * nombra esa causa.
 *
 * **Sobre el contexto de los errores.** Se envuelven diciendo QUE operacion fallo; la RUTA la
 * anade quien llama, que es el unico que la conoce —el puerto habla en bytes, no en rutas, porque
 * el adaptador no debe tener que saber de donde salieron—.
 */

/**
 * Un punto de PDF es 1/72 de pulgada: es la unidad del propio formato, no un ajuste de este
 * modulo. Convierte la resolucion pedida en el factor de escala que entiende el rasterizador.
 */
const PDF_POINTS_PER_INCH = 72;

/**
 * La libreria se queda con el `ArrayBuffer` que recibe y lo DETACHA: el arreglo del llamante queda
 * vacio y ya no sirve para nada mas. Entregarle una copia deja los bytes de quien llama utilizables.
 */
function copyForLibrary(pdf: Uint8Array): Uint8Array {
  return new Uint8Array(pdf);
}

/** Texto del fallo, a secas, sin arrastrar la pila de una libreria al mensaje. */
function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Carga el par nativo de rasterizado y, si no esta disponible, falla NOMBRANDO esa causa.
 *
 * Recibe el cargador por parametro a proposito: es lo que permite comprobar el mensaje de la
 * ausencia sin tener que provocar un fallo de carga real ni convertir ningun PDF de verdad. En
 * produccion el cargador siempre es el `import()` de mas abajo.
 */
export async function resolveRasterizer<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (cause) {
    throw new Error(
      `no se puede convertir a imagen: el par nativo de rasterizado no esta disponible en este ` +
        `entorno; la conversion a texto no depende de el y sigue disponible: ${describeCause(cause)}`,
    );
  }
}

/** `countPages` del puerto: cuenta SIN renderizar una sola pagina. */
export async function countPages(pdf: Uint8Array): Promise<number> {
  let document;
  try {
    document = await getDocumentProxy(copyForLibrary(pdf));
  } catch (cause) {
    throw new Error(`fallo al abrir el documento para contar sus paginas: ${describeCause(cause)}`);
  }

  try {
    return document.numPages;
  } finally {
    await document.loadingTask.destroy();
  }
}

/** `extractText` del puerto: el texto del documento entero, en una sola cadena. */
export async function extractPdfText(pdf: Uint8Array): Promise<string> {
  try {
    const { text } = await extractText(copyForLibrary(pdf), { mergePages: true });
    return text;
  } catch (cause) {
    throw new Error(`fallo al extraer el texto del documento: ${describeCause(cause)}`);
  }
}

/**
 * `renderPages` del puerto: una imagen PNG por pagina, a la resolucion que se pide.
 *
 * El documento se abre UNA vez y se reutiliza para todas las paginas —la libreria respeta el ciclo
 * de vida de un documento que recibe ya abierto—: abrirlo por pagina volveria a analizar el archivo
 * entero tantas veces como paginas tenga.
 */
export async function renderPages(pdf: Uint8Array, dpi: number): Promise<readonly RenderedPage[]> {
  const rasterizer = await resolveRasterizer(() => import('@napi-rs/canvas'));
  const scale = dpi / PDF_POINTS_PER_INCH;

  let document;
  try {
    document = await getDocumentProxy(copyForLibrary(pdf));
  } catch (cause) {
    throw new Error(`fallo al abrir el documento para rasterizar sus paginas: ${describeCause(cause)}`);
  }

  try {
    const pages: RenderedPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      try {
        const png = await renderPageAsImage(document, pageNumber, {
          scale,
          canvasImport: async () => rasterizer,
        });
        pages.push({ pageNumber, png: new Uint8Array(png) });
      } catch (cause) {
        throw new Error(`fallo al rasterizar la pagina ${pageNumber} del documento: ${describeCause(cause)}`);
      }
    }
    return pages;
  } finally {
    await document.loadingTask.destroy();
  }
}
