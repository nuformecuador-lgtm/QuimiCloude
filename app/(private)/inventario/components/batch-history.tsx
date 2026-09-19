'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { withRateLimitNotice } from '@/hooks/use-rate-limited-action-state';
import { listBatchMovementsAction } from '@/lib/modules/inventario/adapters/driving/batch-actions';
import type { ErrorState } from '@/lib/modules/errores';
import type { InventoryMovementView, MovementReason } from '@/lib/modules/inventario';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const REASON_LABEL = 'Motivo';
const AUTHOR_LABEL = 'Autor';
const DATE_LABEL = 'Fecha';

/**
 * Deriva la etiqueta legible de un motivo a partir del propio valor, sin enumerarlo a mano:
 * guion bajo a espacio y primera letra en mayuscula. Exportada porque el dialogo de ajuste
 * necesita la misma etiqueta.
 */
export function movementReasonLabel(reason: MovementReason): string {
  const conEspacios = reason.split('_').join(' ');
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1);
}

/** El alta no lleva motivo: se nombra por lo que es, no se le inventa uno. */
function movementReasonDisplay(movement: InventoryMovementView): string {
  if (movement.kind === 'opening') return 'Alta de lote';
  return movement.reason === null ? '' : movementReasonLabel(movement.reason);
}

/**
 * En `YYYY-MM-DD HH:mm`, recortando el ISO tal cual llega: sin `Date` ni `toLocaleString`, que
 * dependen del huso del entorno y desalinean servidor y navegador.
 */
function formatMovementDate(createdAt: string): string {
  return `${createdAt.slice(0, 10)} ${createdAt.slice(11, 16)}`;
}

type LoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: readonly InventoryMovementView[] }
  | ErrorState;

type BatchHistoryProps = {
  readonly batchId: string;
  readonly batchLot?: string;
};

/**
 * Despliegue del historial de un lote: se monta plegado y pide los asientos a la primera
 * apertura, sin volver a pedirlos en las siguientes. El orden que llega de la action se pinta
 * tal cual, del mas reciente al mas antiguo.
 */
export function BatchHistory({ batchId, batchLot }: BatchHistoryProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || state.status !== 'idle') return;

    setState({ status: 'loading' });
    void withRateLimitNotice(listBatchMovementsAction)(batchId).then((result) => {
      // Frenado: el toast ya lo puso el envoltorio. Se vuelve a `idle` para no dejar el
      // "Cargando…" colgado y que la proxima apertura reintente.
      if (result === undefined) {
        setState({ status: 'idle' });
        return;
      }
      setState(result.status === 'success' ? { status: 'success', data: result.data } : result);
    });
  }

  const etiquetaDisparador =
    batchLot === undefined ? 'Historial del lote' : `Historial del lote ${batchLot}`;

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger
        render={
          <Button
            variant="outline"
            className={`${TOUCH_TARGET} w-full justify-between`}
            aria-label={etiquetaDisparador}
            data-testid="batch-history-trigger"
          />
        }
      >
        {etiquetaDisparador}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {state.status === 'loading' ? (
          <p data-testid="batch-history-loading">Cargando historial…</p>
        ) : null}

        {state.status === 'error' ? (
          <p role="alert" data-testid="batch-history-error">
            {state.message}
          </p>
        ) : null}

        {state.status === 'success' && state.data.length === 0 ? (
          <p data-testid="batch-history-before-ledger">
            Este lote es anterior al libro de movimientos: no tiene historial registrado.
          </p>
        ) : null}

        {state.status === 'success' && state.data.length > 0 ? (
          <ul data-testid="batch-history-list">
            {state.data.map((movimiento) => (
              <li key={movimiento.id} data-testid={`batch-history-entry-${movimiento.id}`}>
                <span className="text-xs text-muted-foreground">{REASON_LABEL}</span>
                <span data-testid="batch-history-entry-reason">
                  {movementReasonDisplay(movimiento)}
                </span>
                <span className="text-xs text-muted-foreground">{AUTHOR_LABEL}</span>
                <span data-testid="batch-history-entry-author">
                  {movimiento.authorName ?? 'Sin autor'}
                </span>
                <span className="text-xs text-muted-foreground">{DATE_LABEL}</span>
                <span data-testid="batch-history-entry-date">
                  {formatMovementDate(movimiento.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
