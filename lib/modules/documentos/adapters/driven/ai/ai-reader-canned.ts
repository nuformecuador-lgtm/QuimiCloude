import { CROP_COORDINATES_PROMPT } from '../../../domain/crop-prompt';

import type { AiReader } from '../../../ports/ai-reader';

/**
 * Implementa el puerto de la lectura con IA devolviendo SIEMPRE uno de tres textos fijos, para que
 * el recorrido de extremo a extremo pueda correr sin cuenta ni cuota de ningun proveedor.
 *
 * No se cablea nunca por defecto: el punto de composicion solo lo elige cuando
 * `DOCUMENTS_E2E_DOUBLES` esta puesta, y ningun archivo versionado la pone salvo la configuracion
 * de Playwright.
 *
 * Distingue el prompt del recorte del resto por comparacion EXACTA con `CROP_COORDINATES_PROMPT`
 * (coordenadas de recorte); del resto, distingue la formula del catalogo por la FORMA de las
 * partes: si todas son `kind: 'pdf'` (la fórmula se lee por texto, sin recortar) devuelve el texto
 * de fórmula, y si no, el catalogo. No mira el prompt ni el entorno para esa segunda distincion.
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

/** Prefijo neutro de los nombres que trae el guion de formula, para que el E2E no repita cadenas. */
export const CANNED_FORMULA_PREFIX = 'guion-e2e-formula';

/** Nombre fijo de la receta leida; el E2E siembra una receta viva con este mismo nombre (reemplazar). */
export const CANNED_FORMULA_RECIPE_NAME = `${CANNED_FORMULA_PREFIX}-nombre`;

/** Nombre del ingrediente que preselecciona: el E2E siembra un producto vivo con este mismo nombre. */
export const CANNED_FORMULA_EXISTING_PRODUCT_NAME = `${CANNED_FORMULA_PREFIX}-preseleccion`;
/** Porcentaje leido para ese ingrediente preseleccionado. */
export const CANNED_FORMULA_PRESELECTED_PERCENTAGE = '25';

/** Nombre del ingrediente que no existe: se crea como materia prima nueva al confirmar. */
export const CANNED_FORMULA_NEW_INGREDIENT_NAME = `${CANNED_FORMULA_PREFIX}-materia-prima-nueva`;
/** Porcentaje leido para la materia prima nueva. */
export const CANNED_FORMULA_NEW_INGREDIENT_PERCENTAGE = '60';

/** Cantidad y unidad de referencia del ingrediente sin porcentaje leido. */
export const CANNED_FORMULA_UNASSIGNED_QUANTITY = '250';
export const CANNED_FORMULA_UNASSIGNED_UNIT = 'g';

/** Lo que falta para llegar a 100 %: el E2E lo teclea en el ingrediente sin porcentaje leido. */
export const CANNED_FORMULA_MISSING_PERCENTAGE = '15';

/**
 * El JSON de una formula: tres ingredientes -uno preseleccionable, uno de materia prima nueva y uno
 * sin porcentaje leido (solo cantidad y unidad de referencia)- y tres pasos, el segundo de dos
 * lineas.
 */
export const CANNED_FORMULA_TEXT = JSON.stringify({
  name: CANNED_FORMULA_RECIPE_NAME,
  description: null,
  ingredients: [
    {
      name: CANNED_FORMULA_EXISTING_PRODUCT_NAME,
      percentage: CANNED_FORMULA_PRESELECTED_PERCENTAGE,
      quantity: null,
      unit: null,
    },
    {
      name: CANNED_FORMULA_NEW_INGREDIENT_NAME,
      percentage: CANNED_FORMULA_NEW_INGREDIENT_PERCENTAGE,
      quantity: null,
      unit: null,
    },
    {
      name: null,
      percentage: null,
      quantity: CANNED_FORMULA_UNASSIGNED_QUANTITY,
      unit: CANNED_FORMULA_UNASSIGNED_UNIT,
    },
  ],
  steps: [
    `${CANNED_FORMULA_PREFIX}-paso-1`,
    `${CANNED_FORMULA_PREFIX}-paso-2-linea-a\n${CANNED_FORMULA_PREFIX}-paso-2-linea-b`,
    `${CANNED_FORMULA_PREFIX}-paso-3`,
  ],
});

export const readCannedText: AiReader['read'] = (request) => {
  if (request.prompt === CROP_COORDINATES_PROMPT) return Promise.resolve(CANNED_CROP_COORDINATES_TEXT);
  const isFormulaRead = request.parts.length > 0 && request.parts.every((part) => part.kind === 'pdf');
  return Promise.resolve(isFormulaRead ? CANNED_FORMULA_TEXT : CANNED_CATALOG_TEXT);
};
