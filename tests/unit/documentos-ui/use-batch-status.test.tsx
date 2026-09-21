import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetBatchStatusResult } from '@/lib/modules/documentos/adapters/driving/document-batch-actions';

const { getBatchStatusActionMock } = vi.hoisted(() => ({
  getBatchStatusActionMock: vi.fn<(batchId: string) => Promise<GetBatchStatusResult>>(),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: vi.fn(),
  getBatchStatusAction: getBatchStatusActionMock,
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: vi.fn(),
}));

import { BATCH_STATUS_POLL_INTERVAL_MS, useBatchStatus } from '@/components/shared/document-upload';

import { batch, entry } from './helpers';

const INTERVALO = BATCH_STATUS_POLL_INTERVAL_MS;

async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  getBatchStatusActionMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('el sondeo del estado de una tanda', () => {
  it('sondea el estado de la tanda hasta que todos los archivos terminan (R8)', async () => {
    getBatchStatusActionMock
      .mockResolvedValueOnce({ status: 'success', data: batch([entry({ status: 'queued' })]) })
      .mockResolvedValueOnce({ status: 'success', data: batch([entry({ status: 'processing' })]) })
      .mockResolvedValueOnce({ status: 'success', data: batch([entry({ status: 'done' })]) });

    const { result } = renderHook(() => useBatchStatus('batch-1'));

    await avanzar(0);
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(1);
    expect(result.current.status?.files[0]?.status).toBe('queued');

    await avanzar(INTERVALO);
    expect(result.current.status?.files[0]?.status).toBe('processing');

    await avanzar(INTERVALO);
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(3);
    expect(result.current.status?.files[0]?.status).toBe('done');
  });

  it('deja de sondear en cuanto ningun archivo sigue en cola ni procesando (R8)', async () => {
    getBatchStatusActionMock.mockResolvedValue({
      status: 'success',
      data: batch([entry({ id: 'a', status: 'done' }), entry({ id: 'b', status: 'error' })]),
    });

    renderHook(() => useBatchStatus('batch-1'));

    await avanzar(0);
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(1);

    await avanzar(INTERVALO * 10);
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(1);
  });

  it('no lanza una consulta nueva mientras la anterior sigue en vuelo (R8)', async () => {
    let responder: ((result: GetBatchStatusResult) => void) | undefined;
    getBatchStatusActionMock.mockImplementation(
      () =>
        new Promise<GetBatchStatusResult>((resolve) => {
          responder = resolve;
        }),
    );

    renderHook(() => useBatchStatus('batch-1'));

    await avanzar(INTERVALO * 5);
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      responder?.({ status: 'success', data: batch([entry({ status: 'queued' })]) });
      await Promise.resolve();
    });

    await avanzar(INTERVALO);
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(2);
  });

  it('deja de sondear al desmontarse (R8)', async () => {
    getBatchStatusActionMock.mockResolvedValue({
      status: 'success',
      data: batch([entry({ status: 'queued' })]),
    });

    const { unmount } = renderHook(() => useBatchStatus('batch-1'));

    await avanzar(0);
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(1);

    unmount();

    await avanzar(INTERVALO * 10);
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(1);
  });

  it('no declara ningun plazo propio para dar por fallido un archivo (R10)', async () => {
    getBatchStatusActionMock.mockResolvedValue({
      status: 'success',
      data: batch([entry({ status: 'queued' })]),
    });

    const { result } = renderHook(() => useBatchStatus('batch-1'));

    await avanzar(0);
    await avanzar(INTERVALO * 200);

    expect(result.current.status?.files[0]?.status).toBe('queued');
    expect(result.current.error).toBeNull();
    expect(getBatchStatusActionMock.mock.calls.length).toBeGreaterThan(100);
  });
});
