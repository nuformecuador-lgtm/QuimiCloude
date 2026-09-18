/**
 * El puerto de la COLA de trabajos: lo que el dominio necesita para publicar un mensaje, dicho sin
 * nombrar al proveedor.
 *
 * Una sola operacion, un solo mensaje. Encolar una tanda entera es responsabilidad de quien llama:
 * publicar N veces, no de este puerto pedir una lista.
 */

export type QueuedMessage = {
  readonly documentFileId: string;
};

export interface ProcessingQueue {
  /** Publica UN mensaje y devuelve el identificador que le da el servicio de cola. */
  publish(message: QueuedMessage): Promise<string>;
}
