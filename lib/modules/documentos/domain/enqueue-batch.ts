/**
 * El caso de uso de ENCOLAR una tanda: permiso, esquema, empresa de cada ruta, escritura y
 * publicacion, en ese orden exacto.
 *
 * Si publicar el mensaje de un archivo revienta, esa fila se queda en `queued` y no se deshace
 * nada mas: no hay forma de "despublicar" un mensaje ya entregado a la cola, y la caducidad cierra
 * esas filas mas tarde.
 */
import { requirePermission, type Actor, DOCUMENT_UPLOAD_PERMISSION } from './actor';
import { enqueueBatchSchema } from './enqueue-input';
import { isPathInCompany } from './document-path';
import { ValidationError } from './errors';

import type { DocumentBatchRepository } from '../ports/document-batch-repository';
import type { ProcessingQueue } from '../ports/processing-queue';

export type EnqueueBatchDeps = {
  readonly repository: DocumentBatchRepository;
  readonly queue: ProcessingQueue;
};

export type EnqueuedBatch = { readonly batchId: string };

export function createEnqueueBatch(
  deps: EnqueueBatchDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<EnqueuedBatch> {
  return async function enqueueBatch(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<EnqueuedBatch> {
    requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION);

    const parsed = enqueueBatchSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { strategy, paths } = parsed.data;
    if (!paths.every((path) => isPathInCompany(path, actor.companyId))) {
      throw new ValidationError();
    }

    const created = await deps.repository.createBatch({
      companyId: actor.companyId,
      strategy,
      createdBy: actor.id,
      paths,
    });

    // Ningun `await` en paralelo aqui: publicar y anotar el mensaje de un archivo no debe
    // entrelazarse con el de otro, para que un fallo a mitad de tanda deje un estado predecible.
    for (const file of created.files) {
      try {
        const messageId = await deps.queue.publish({ documentFileId: file.id });
        await deps.repository.attachMessageId(file.id, messageId);
      } catch {
        // Sin recuperacion: la fila sigue en `queued` y la caduca `expireStale` mas adelante.
      }
    }

    return { batchId: created.batchId };
  };
}
