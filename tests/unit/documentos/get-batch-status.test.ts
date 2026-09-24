// La consulta del estado de una tanda, contra un doble del repositorio que REGISTRA las
// escrituras de `expireStale` para comprobar que una fila caducada de verdad QUEDA GUARDADA.

import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_UPLOAD_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { UnauthorizedError } from '@/lib/modules/documentos/domain/errors';
import { createGetBatchStatus } from '@/lib/modules/documentos/domain/get-batch-status';

import type { BatchStatus } from '@/lib/modules/documentos/domain/batch-status';
import type { DocumentBatchRepository } from '@/lib/modules/documentos/ports/document-batch-repository';
import type { ProcessingConfig } from '@/lib/modules/documentos/ports/processing-config';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444';
const PERSONA = '11111111-1111-4111-8111-111111111111';
const TANDA = 'tanda-1';

const AHORA = new Date('2026-09-18T12:00:00.000Z');
const TIMEOUT_SEGUNDOS = 900;

function actorAutorizado(companyId: string = EMPRESA): Actor {
  return { id: PERSONA, companyId, permissions: [DOCUMENT_UPLOAD_PERMISSION] };
}

function config(): ProcessingConfig {
  return { timeoutSeconds: () => TIMEOUT_SEGUNDOS, maxRetries: () => 3 };
}

function tandaGuardada(companyId: string = EMPRESA): BatchStatus {
  return { id: TANDA, companyId, strategy: 'catalogo', files: [] };
}

/** Doble en memoria: `readBatch` solo devuelve lo que sea de LA MISMA empresa que se pide. */
function dobleDeRepositorio(guardada: BatchStatus | null) {
  const expireStale = vi.fn<DocumentBatchRepository['expireStale']>(async () => {});
  const readBatch = vi.fn(async (batchId: string, companyId: string): Promise<BatchStatus | null> => {
    if (!guardada || guardada.id !== batchId || guardada.companyId !== companyId) return null;
    return guardada;
  });
  const repository: DocumentBatchRepository = {
    createBatch: vi.fn(async () => {
      throw new Error('getBatchStatus no crea tandas');
    }),
    attachMessageId: vi.fn(async () => {
      throw new Error('getBatchStatus no anota mensajes');
    }),
    claim: vi.fn(async () => {
      throw new Error('getBatchStatus no reclama nada');
    }),
    finish: vi.fn(async () => {
      throw new Error('getBatchStatus no termina nada');
    }),
    expireStale,
    readBatch,
  };
  return { repository, expireStale, readBatch };
}

describe('documentos — getBatchStatus', () => {
  it('R18 — sin permiso rechaza, sin llamar a expireStale ni a readBatch', async () => {
    const doble = dobleDeRepositorio(tandaGuardada());
    const getBatchStatus = createGetBatchStatus({ repository: doble.repository, config: config(), now: () => AHORA });
    const sinPermiso: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [] };

    await expect(getBatchStatus(sinPermiso, TANDA)).rejects.toThrow(UnauthorizedError);
    expect(doble.expireStale).not.toHaveBeenCalled();
    expect(doble.readBatch).not.toHaveBeenCalled();
  });

  it('R18 — una tanda de OTRA empresa da EXACTAMENTE el mismo rechazo que una inexistente', async () => {
    const doble = dobleDeRepositorio(tandaGuardada(OTRA_EMPRESA));
    const getBatchStatus = createGetBatchStatus({ repository: doble.repository, config: config(), now: () => AHORA });
    const dobleInexistente = dobleDeRepositorio(null);
    const getBatchStatusInexistente = createGetBatchStatus({
      repository: dobleInexistente.repository,
      config: config(),
      now: () => AHORA,
    });

    const deOtraEmpresa = await getBatchStatus(actorAutorizado(), TANDA);
    const inexistente = await getBatchStatusInexistente(actorAutorizado(), TANDA);

    expect(deOtraEmpresa).toBeNull();
    expect(inexistente).toBeNull();
    expect(deOtraEmpresa).toEqual(inexistente);
  });

  it('R19 — una fila queued mas vieja que el plazo vuelve como error con su motivo, y QUEDA GUARDADA', async () => {
    const CADUCADA: BatchStatus = {
      id: TANDA,
      companyId: EMPRESA,
      strategy: 'catalogo',
      files: [
        {
          id: 'archivo-1',
          path: `${EMPRESA}/documento.pdf`,
          status: 'error',
          extractedText: null,
          errorCode: 'unexpected',
          errorReason: 'se agoto el tiempo de espera',
        },
      ],
    };
    const doble = dobleDeRepositorio(CADUCADA);
    const getBatchStatus = createGetBatchStatus({ repository: doble.repository, config: config(), now: () => AHORA });

    const resultado = await getBatchStatus(actorAutorizado(), TANDA);

    expect(doble.expireStale).toHaveBeenCalledTimes(1);
    const [batchId, companyId, olderThan] = doble.expireStale.mock.calls[0] ?? [];
    expect(batchId).toBe(TANDA);
    expect(companyId).toBe(EMPRESA);
    expect((olderThan as Date).toISOString()).toBe(
      new Date(AHORA.getTime() - TIMEOUT_SEGUNDOS * 1000).toISOString(),
    );
    // Lo que se devuelve viene de la MISMA lectura que la caducidad ya dejo escrita.
    expect(resultado?.files[0]?.status).toBe('error');
    expect(resultado?.files[0]?.errorReason).toBe('se agoto el tiempo de espera');
  });

  it('R19 — el instante lo da la dependencia inyectada, nunca `new Date()`', async () => {
    const doble = dobleDeRepositorio(tandaGuardada());
    const now = vi.fn(() => AHORA);
    const getBatchStatus = createGetBatchStatus({ repository: doble.repository, config: config(), now });

    await getBatchStatus(actorAutorizado(), TANDA);

    expect(now).toHaveBeenCalled();
    const [, , olderThan] = doble.expireStale.mock.calls[0] ?? [];
    expect((olderThan as Date).getTime()).toBe(AHORA.getTime() - TIMEOUT_SEGUNDOS * 1000);
  });

  it('R19 — una fila mas joven que el plazo no se toca: sigue queued y sin motivo', async () => {
    const RECIENTE: BatchStatus = {
      id: TANDA,
      companyId: EMPRESA,
      strategy: 'catalogo',
      files: [
        {
          id: 'archivo-1',
          path: `${EMPRESA}/documento.pdf`,
          status: 'queued',
          extractedText: null,
          errorCode: null,
          errorReason: null,
        },
      ],
    };
    const doble = dobleDeRepositorio(RECIENTE);
    const getBatchStatus = createGetBatchStatus({ repository: doble.repository, config: config(), now: () => AHORA });

    const resultado = await getBatchStatus(actorAutorizado(), TANDA);

    // `expireStale` se llama igual —es la operacion la que decide si algo caduco, no este caso de
    // uso—, pero lo que vuelve de la lectura sigue intacto porque el doble no toco esa fila.
    expect(doble.expireStale).toHaveBeenCalledTimes(1);
    expect(resultado?.files[0]?.status).toBe('queued');
    expect(resultado?.files[0]?.errorReason).toBeNull();
  });

  it('R19 — el plazo sale de la configuracion inyectada, no de un literal', async () => {
    const doble = dobleDeRepositorio(tandaGuardada());
    const otroTimeout: ProcessingConfig = { timeoutSeconds: () => 60, maxRetries: () => 1 };
    const getBatchStatus = createGetBatchStatus({
      repository: doble.repository,
      config: otroTimeout,
      now: () => AHORA,
    });

    await getBatchStatus(actorAutorizado(), TANDA);

    const [, , olderThan] = doble.expireStale.mock.calls[0] ?? [];
    expect((olderThan as Date).getTime()).toBe(AHORA.getTime() - 60 * 1000);
  });
});
