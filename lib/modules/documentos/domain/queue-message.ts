/**
 * El BORDE del cuerpo que entrega la cola: solo el identificador de la fila.
 *
 * La empresa, la ruta y la estrategia NO viajan en el cuerpo: se leen de la base al reclamar la
 * fila. Meterlas aqui daria dos fuentes para el mismo dato, y la de fuera es la que se tocaria si
 * la firma se debilitara alguna vez.
 *
 * Dominio puro: el unico import externo es `zod`.
 */
import { z } from 'zod';

export const queueMessageSchema = z.strictObject({
  documentFileId: z.string().min(1),
});

export type QueueMessageBody = z.infer<typeof queueMessageSchema>;
