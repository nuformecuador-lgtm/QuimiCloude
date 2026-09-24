// El encolado de una tanda, contra dobles del repositorio y de la cola que REGISTRAN sus llamadas
// y el ORDEN en el que llegan: lo que aqui importa no es solo que se escriba y se publique, es
// que se escriba PRIMERO y se publique DESPUES.

import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_UPLOAD_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { createEnqueueBatch } from '@/lib/modules/documentos/domain/enqueue-batch';
import { UnauthorizedError, ValidationError } from '@/lib/modules/documentos/domain/errors';
import { MAX_FILES_PER_BATCH } from '@/lib/modules/documentos/domain/limits';

import type {
  CreatedBatch,
  DocumentBatchRepository,
  NewBatch,
} from '@/lib/modules/documentos/ports/document-batch-repository';
import type { ProcessingQueue, QueuedMessage } from '@/lib/modules/documentos/ports/processing-queue';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444';
const PERSONA = '11111111-1111-4111-8111-111111111111';

function actorAutorizado(companyId: string = EMPRESA): Actor {
  return { id: PERSONA, companyId, permissions: [DOCUMENT_UPLOAD_PERMISSION] };
}

function rutas(cantidad: number, companyId: string = EMPRESA): string[] {
  return Array.from({ length: cantidad }, (_, indice) => `${companyId}/archivo-${indice + 1}.pdf`);
}

type Llamada = { readonly tipo: 'createBatch' | 'attachMessageId' | 'publish'; readonly detalle: unknown };

/** Doble en memoria que anota, EN ORDEN, cada llamada a la escritura y a la publicacion. */
function dobles() {
  const llamadas: Llamada[] = [];
  let siguienteId = 0;

  const createBatch = vi.fn(async (input: NewBatch): Promise<CreatedBatch> => {
    const files = input.paths.map((path) => ({ id: `archivo-${(siguienteId += 1)}`, path }));
    llamadas.push({ tipo: 'createBatch', detalle: input });
    return { batchId: 'tanda-1', files };
  });
  const attachMessageId = vi.fn(async (documentFileId: string, messageId: string): Promise<void> => {
    llamadas.push({ tipo: 'attachMessageId', detalle: { documentFileId, messageId } });
  });

  const repository: DocumentBatchRepository = {
    createBatch,
    attachMessageId,
    claim: vi.fn(async () => {
      throw new Error('enqueue-batch no reclama nada');
    }),
    finish: vi.fn(async () => {
      throw new Error('enqueue-batch no termina nada');
    }),
    expireStale: vi.fn(async () => {
      throw new Error('enqueue-batch no caduca nada');
    }),
    readBatch: vi.fn(async () => {
      throw new Error('enqueue-batch no lee ninguna tanda');
    }),
    readFileForReview: vi.fn(async () => {
      throw new Error('enqueue-batch no lee para revision');
    }),
  };

  let contadorDeMensajes = 0;
  const publish = vi.fn(async (message: QueuedMessage): Promise<string> => {
    llamadas.push({ tipo: 'publish', detalle: message });
    return `mensaje-${(contadorDeMensajes += 1)}`;
  });
  const queue: ProcessingQueue = { publish };

  return { repository, queue, createBatch, attachMessageId, publish, llamadas };
}

describe('documentos — enqueueBatch', () => {
  it('R3 — sin permiso rechaza sin escribir fila y sin publicar', async () => {
    const doble = dobles();
    const enqueueBatch = createEnqueueBatch(doble);
    const sinPermiso: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [] };

    await expect(
      enqueueBatch(sinPermiso, { strategy: 'catalogo', paths: rutas(2) }),
    ).rejects.toThrow(UnauthorizedError);
    expect(doble.createBatch).not.toHaveBeenCalled();
    expect(doble.publish).not.toHaveBeenCalled();
  });

  it('R3 — el actor ausente rechaza igual, sin tocar ningun puerto', async () => {
    const doble = dobles();
    const enqueueBatch = createEnqueueBatch(doble);

    await expect(enqueueBatch(null, { strategy: 'catalogo', paths: rutas(1) })).rejects.toThrow(
      UnauthorizedError,
    );
    expect(doble.llamadas).toEqual([]);
  });

  it('R4 — una ruta de otra empresa rechaza la tanda ENTERA, sin escribir ni publicar', async () => {
    const doble = dobles();
    const enqueueBatch = createEnqueueBatch(doble);
    const paths = [...rutas(2), `${OTRA_EMPRESA}/robado.pdf`];

    await expect(
      enqueueBatch(actorAutorizado(), { strategy: 'catalogo', paths }),
    ).rejects.toThrow(ValidationError);
    expect(doble.createBatch).not.toHaveBeenCalled();
    expect(doble.publish).not.toHaveBeenCalled();
  });

  it('R4 — once rutas rechaza la tanda entera con invalid_input', async () => {
    const doble = dobles();
    const enqueueBatch = createEnqueueBatch(doble);

    await expect(
      enqueueBatch(actorAutorizado(), {
        strategy: 'catalogo',
        paths: rutas(MAX_FILES_PER_BATCH + 1),
      }),
    ).rejects.toThrow(ValidationError);
    expect(doble.createBatch).not.toHaveBeenCalled();
    expect(doble.publish).not.toHaveBeenCalled();
  });

  it('R4 — una estrategia fuera del enum rechaza sin escribir ni publicar', async () => {
    const doble = dobles();
    const enqueueBatch = createEnqueueBatch(doble);

    await expect(
      enqueueBatch(actorAutorizado(), { strategy: 'panfleto', paths: rutas(1) }),
    ).rejects.toThrow(ValidationError);
    expect(doble.llamadas).toEqual([]);
  });

  it('R5 — el caso bueno ESCRIBE PRIMERO y PUBLICA DESPUES, en ese orden', async () => {
    const doble = dobles();
    const enqueueBatch = createEnqueueBatch(doble);

    const { batchId } = await enqueueBatch(actorAutorizado(), {
      strategy: 'catalogo',
      paths: rutas(3),
    });

    expect(batchId).toBe('tanda-1');
    expect(doble.llamadas[0]?.tipo).toBe('createBatch');
    const tipos = doble.llamadas.map((llamada) => llamada.tipo);
    const indiceDeEscritura = tipos.indexOf('createBatch');
    const indiceDePublicacion = tipos.indexOf('publish');
    expect(indiceDeEscritura).toBeLessThan(indiceDePublicacion);
    // Un mensaje publicado por archivo, y su id anotado en la fila que le corresponde.
    expect(doble.publish).toHaveBeenCalledTimes(3);
    expect(doble.attachMessageId).toHaveBeenCalledTimes(3);
  });

  it('R6 — si publicar el archivo 2 de 3 revienta, los otros dos siguen su curso y el batchId vuelve igual', async () => {
    const doble = dobles();
    doble.publish.mockImplementationOnce(async () => 'mensaje-1');
    doble.publish.mockImplementationOnce(async () => {
      throw new Error('la cola esta caida');
    });
    doble.publish.mockImplementationOnce(async () => 'mensaje-3');
    const enqueueBatch = createEnqueueBatch(doble);

    const { batchId } = await enqueueBatch(actorAutorizado(), {
      strategy: 'catalogo',
      paths: rutas(3),
    });

    expect(batchId).toBe('tanda-1');
    expect(doble.publish).toHaveBeenCalledTimes(3);
    // Solo dos publicaciones tuvieron exito, asi que solo dos filas anotan su mensaje.
    expect(doble.attachMessageId).toHaveBeenCalledTimes(2);
  });

  it('R2 — la estrategia se pasa una sola vez, para toda la tanda, sin ningun campo por archivo', async () => {
    const doble = dobles();
    const enqueueBatch = createEnqueueBatch(doble);

    await enqueueBatch(actorAutorizado(), { strategy: 'formula', paths: rutas(2) });

    const entrada = doble.createBatch.mock.calls[0]?.[0];
    expect(entrada?.strategy).toBe('formula');
    expect(Object.keys(entrada ?? {}).sort()).toEqual(['companyId', 'createdBy', 'paths', 'strategy']);
  });

  describe('documentos.modificar decide, nunca proveedores.* (R14, R15, R16)', () => {
    it('R15 — proveedores.modificar y proveedores.consultar, sin documentos.modificar, rechazan sin escribir ni publicar', async () => {
      const doble = dobles();
      const enqueueBatch = createEnqueueBatch(doble);
      const actor: Actor = {
        id: PERSONA,
        companyId: EMPRESA,
        permissions: ['proveedores.modificar', 'proveedores.consultar'],
      };

      await expect(
        enqueueBatch(actor, { strategy: 'catalogo', paths: rutas(1) }),
      ).rejects.toThrow(UnauthorizedError);
      expect(doble.llamadas).toEqual([]);
    });

    it('R15 — solo documentos.consultar, sin documentos.modificar, tambien rechaza', async () => {
      const doble = dobles();
      const enqueueBatch = createEnqueueBatch(doble);
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: ['documentos.consultar'] };

      await expect(
        enqueueBatch(actor, { strategy: 'catalogo', paths: rutas(1) }),
      ).rejects.toThrow(UnauthorizedError);
      expect(doble.llamadas).toEqual([]);
    });

    it('R16 — documentos.modificar sin ningun permiso de proveedores autoriza la operacion', async () => {
      const doble = dobles();
      const enqueueBatch = createEnqueueBatch(doble);
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: ['documentos.modificar'] };

      const { batchId } = await enqueueBatch(actor, { strategy: 'catalogo', paths: rutas(1) });

      expect(batchId).toBe('tanda-1');
    });
  });
});
