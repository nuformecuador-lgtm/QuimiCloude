/**
 * El prompt de coordenadas del recorte.
 *
 * Texto PROVISIONAL: cumple lo minimo para que la IA devuelva algo interpretable, pero afinar su
 * redaccion no es trabajo de este archivo. No reutiliza ni mezcla el prompt de la estrategia, que
 * vive en `ports/strategy-prompt.ts` y responde a una pregunta distinta.
 */

export const CROP_COORDINATES_PROMPT = `Analiza cada pagina de este documento e identifica unicamente
las imagenes, fotografias o ilustraciones que contiene. No incluyas texto, tablas ni fondos de
color como si fueran imagenes.

Devuelve exclusivamente un objeto JSON, sin texto adicional antes ni despues, con esta forma:

{
  "images": [
    { "page": 1, "x": 0.08, "y": 0.12, "width": 0.4, "height": 0.3 }
  ]
}

Cada entrada de "images" corresponde a una imagen encontrada. "page" es el numero de pagina donde
esta esa imagen, empezando en 1. "x", "y", "width" y "height" son la posicion y el tamano de la
imagen como PROPORCION de la pagina, con valores entre 0 y 1: nunca en pixeles.

Si una pagina no contiene ninguna imagen, no agregues ninguna entrada por ella. Si el documento
entero no contiene ninguna imagen, devuelve exactamente {"images": []}.`;
