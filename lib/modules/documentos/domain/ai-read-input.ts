/**
 * El BORDE de la lectura con IA: el esquema de la entrada.
 *
 * Validacion con zod en el borde: ningun dato sin validar ni tipar cruza hacia el puerto ni hacia
 * el proveedor. `strictObject` hace que un campo que no esta en el esquema FALLE la entrada en vez
 * de dejarlo pasar en silencio.
 *
 * `prompt` NO tiene texto por defecto ni se completa aqui: lo pone quien llama, y un prompt vacio o
 * de puros espacios se rechaza ANTES de tocar ningun puerto. `mode` admite exactamente dos valores;
 * un tercero se rechaza aqui, no en el adaptador. `path` es solo para poder nombrar el archivo en
 * un fallo. `bytes` es el PDF y no puede estar vacio.
 *
 * Dominio puro: el unico import externo es `zod`.
 */

import { z } from 'zod';

export const aiReadInputSchema = z.strictObject({
  prompt: z.string().trim().min(1),
  mode: z.union([z.literal('pdf'), z.literal('images')]),
  path: z.string().min(1),
  bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.length > 0),
});

export type AiReadInput = z.infer<typeof aiReadInputSchema>;
