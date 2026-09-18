/**
 * La UNICA fuente del texto de prompt de cada estrategia.
 *
 * Los textos viven en `.json` para poder editarse como documento, y se importan como modulo: entran
 * en el paquete de despliegue por el mismo camino que el codigo, asi que no hay disco que leer en
 * ejecucion ni archivo que pueda faltar en el servidor.
 *
 * Los dos textos son PROVISIONALES, y cada `.json` lo declara en sus propios campos.
 */
import catalogo from './catalogo.json';
import formula from './formula.json';

import type { PdfStrategy } from '../pdf-strategy';

/** La anotacion estrecha al `string` del dominio lo que TypeScript infiere del `.json`. */
export const PROMPT_BY_STRATEGY: Record<PdfStrategy, string> = {
  catalogo: catalogo.prompt,
  formula: formula.prompt,
};
