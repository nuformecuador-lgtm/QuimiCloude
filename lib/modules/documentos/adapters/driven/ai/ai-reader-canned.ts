import { CROP_COORDINATES_PROMPT } from '../../../domain/crop-prompt';

import type { AiReader } from '../../../ports/ai-reader';

/**
 * Implementa el puerto de la lectura con IA devolviendo SIEMPRE uno de dos textos fijos, para que
 * el recorrido de extremo a extremo pueda correr sin cuenta ni cuota de ningun proveedor.
 *
 * No se cablea nunca por defecto: el punto de composicion solo lo elige cuando
 * `DOCUMENTS_E2E_DOUBLES` esta puesta, y ningun archivo versionado la pone salvo la configuracion
 * de Playwright.
 *
 * Es la UNICA parte de la peticion que mira: distingue el prompt del recorte del resto por
 * comparacion EXACTA con `CROP_COORDINATES_PROMPT`, y devuelve coordenadas de recorte o el catalogo
 * segun cual sea. Ni las partes ni el plazo cambian lo que devuelve.
 */

/** Prefijo neutro de los nombres que trae el catalogo de guion, para que otros especificadores lo reutilicen. */
export const CANNED_CATALOG_PREFIX = 'guion-e2e';

/** Nombre de la fila que sale «nueva», con una presentacion que ninguna empresa sembro. */
export const CANNED_CATALOG_NEW_LINE_NAME = `${CANNED_CATALOG_PREFIX}-nueva`;
/** Presentacion inexistente de la fila «nueva»: se crea al confirmar. */
export const CANNED_CATALOG_NEW_PRESENTATION = `${CANNED_CATALOG_PREFIX}-presentacion-nueva`;
/** Unidad leida por la fila «nueva»: deliberadamente no casa con ninguna unidad sembrada. */
export const CANNED_CATALOG_NEW_UNIT_READ = `${CANNED_CATALOG_PREFIX}-unidad-sin-sembrar`;

/** Nombre de la fila que sale «cambia»: el especificador siembra antes una linea viva con este nombre. */
export const CANNED_CATALOG_CHANGES_LINE_NAME = `${CANNED_CATALOG_PREFIX}-cambia`;
/** Presentacion de la fila «cambia»: el especificador la siembra existente. */
export const CANNED_CATALOG_CHANGES_PRESENTATION = `${CANNED_CATALOG_PREFIX}-presentacion-viva`;
/** Costo NUEVO que trae el documento para la fila «cambia»; el viejo lo siembra el especificador, distinto. */
export const CANNED_CATALOG_CHANGES_NEW_COST = '999.0000';

/** El JSON de coordenadas de recorte: dos regiones en la pagina 1, en proporcion de una pagina de 200x200. */
export const CANNED_CROP_COORDINATES_TEXT = JSON.stringify({
  images: [
    { page: 1, x: 0.05, y: 0.05, width: 0.4, height: 0.4 },
    { page: 1, x: 0.55, y: 0.55, width: 0.4, height: 0.4 },
  ],
});

/**
 * El JSON del catalogo: dos lineas en pagina 1, tantas como regiones de recorte trae
 * `CANNED_CROP_COORDINATES_TEXT`, para que el emparejamiento por pagina y orden proponga imagen a
 * las dos. La primera trae material y medidas completas y una presentacion inexistente («nueva»);
 * la segunda no trae imagen emparejable con exclusividad, solo costo distinto sobre una identidad
 * viva («cambia»).
 */
export const CANNED_CATALOG_TEXT = JSON.stringify({
  lines: [
    {
      name: CANNED_CATALOG_NEW_LINE_NAME,
      presentation: CANNED_CATALOG_NEW_PRESENTATION,
      unit: CANNED_CATALOG_NEW_UNIT_READ,
      cost: '120.5000',
      minPurchase: '15.0000',
      deliveryTime: 5,
      material: 'polietileno',
      measurements: {
        diameter: { value: '7.5000', unit: 'cm' },
        height: { value: '12.0000', unit: 'cm' },
        mouth: '28/410',
      },
      page: 1,
    },
    {
      name: CANNED_CATALOG_CHANGES_LINE_NAME,
      presentation: CANNED_CATALOG_CHANGES_PRESENTATION,
      unit: 'kg',
      cost: CANNED_CATALOG_CHANGES_NEW_COST,
      minPurchase: null,
      deliveryTime: null,
      material: null,
      measurements: null,
      page: 1,
    },
  ],
});

export const readCannedText: AiReader['read'] = (request) =>
  Promise.resolve(
    request.prompt === CROP_COORDINATES_PROMPT ? CANNED_CROP_COORDINATES_TEXT : CANNED_CATALOG_TEXT,
  );
