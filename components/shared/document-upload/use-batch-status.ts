'use client';

import { useCallback, useEffect, useState } from 'react';

import type { BatchStatus } from '@/lib/modules/documentos';
import { getBatchStatusAction } from '@/lib/modules/documentos/adapters/driving/document-batch-actions';
import type { ErrorState } from '@/lib/modules/errores';

export const BATCH_STATUS_POLL_INTERVAL_MS = 2000;

export type UseBatchStatusResult = {
  readonly status: BatchStatus | null;
  readonly error: ErrorState | null;
  /** La tanda no existe o es de otra empresa, sin distinguirlo. */
  readonly missing: boolean;
  readonly resume: () => void;
};

function everyFileFinished(batch: BatchStatus): boolean {
  return batch.files.every((file) => file.status === 'done' || file.status === 'error');
}

/**
 * Sondea el estado de una tanda a intervalo fijo. El siguiente temporizador se arma cuando la
 * consulta anterior responde, de modo que un servidor lento no acumule consultas en vuelo.
 *
 * Ante un error se detiene y espera a que alguien pulse `resume`: reintentar solo seria un plazo
 * propio encubierto, y la caducidad de una fila la decide el servidor.
 */
export function useBatchStatus(batchId: string | null): UseBatchStatusResult {
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [missing, setMissing] = useState(false);
  const [resumeToken, setResumeToken] = useState(0);

  useEffect(() => {
    if (batchId === null) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const consultar = async (): Promise<void> => {
      const result = await getBatchStatusAction(batchId);
      if (cancelled) return;

      if (result.status === 'error') {
        setError(result);
        return;
      }

      const batch = result.data;
      if (batch === null) {
        setMissing(true);
        return;
      }

      setStatus(batch);
      if (everyFileFinished(batch)) return;

      timer = setTimeout(() => {
        void consultar();
      }, BATCH_STATUS_POLL_INTERVAL_MS);
    };

    void consultar();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [batchId, resumeToken]);

  const resume = useCallback(() => {
    setError(null);
    setResumeToken((token) => token + 1);
  }, []);

  return { status, error, missing, resume };
}
