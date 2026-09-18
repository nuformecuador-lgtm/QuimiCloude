/**
 * La ESTRATEGIA con la que se lee un PDF: un enum cerrado de dos valores y el modo de lectura que
 * le toca a cada uno.
 *
 * Los dos literales son nombres del negocio, y por eso son los unicos identificadores que no estan
 * en ingles.
 *
 * Dominio puro: el unico import externo es `zod`.
 */
import { z } from 'zod';

import type { AiReadMode } from './read-pdf-with-ai';

export const pdfStrategySchema = z.union([z.literal('catalogo'), z.literal('formula')]);

export type PdfStrategy = z.infer<typeof pdfStrategySchema>;

/**
 * `catalogo` se lee como IMAGEN —paginas rasterizadas— y `formula` como TEXTO —el PDF entero al
 * modelo multimodal—. Es contraintuitivo por el nombre del literal: esta verificado contra
 * `read-pdf-with-ai`, no deducido del nombre.
 *
 * Es un `Record` y no un `switch` porque un `Record` NO COMPILA si manana el enum gana un valor y
 * alguien olvida su modo.
 */
export const MODE_BY_STRATEGY: Record<PdfStrategy, AiReadMode> = {
  catalogo: 'images',
  formula: 'pdf',
};
