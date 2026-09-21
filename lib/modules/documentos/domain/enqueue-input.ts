/**
 * El BORDE de encolar una tanda: la estrategia, elegida una sola vez, y sus rutas.
 *
 * `strategy` se valida con el MISMO esquema que ya usa el procesamiento por estrategia: dos
 * fronteras sobre el mismo enum no son redundancia, son dos sitios distintos donde algo puede
 * entrar podrido. `paths` reutiliza el tope del modulo: un archivo de mas rechaza la tanda entera,
 * nunca "los diez primeros".
 *
 * Dominio puro: el unico import externo es `zod`.
 */
import { z } from 'zod';

import { MAX_FILES_PER_BATCH } from './limits';
import { pdfStrategySchema } from './pdf-strategy';

export const enqueueBatchSchema = z.strictObject({
  strategy: pdfStrategySchema,
  paths: z.array(z.string().min(1)).min(1).max(MAX_FILES_PER_BATCH),
});

export type EnqueueBatchInput = z.infer<typeof enqueueBatchSchema>;
