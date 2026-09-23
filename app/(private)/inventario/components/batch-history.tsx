'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { listBatchMovementsAction } from '@/lib/modules/inventario/adapters/driving/batch-actions';
import type { ErrorState } from '@/lib/modules/errores';
import type { BatchHistoryEntry, MovementReason } from '@/lib/modules/inventario';
import { exactDecimalTitle, formatDecimalDisplay, trimDecimal } from '@/lib/shared/ui/decimal-display';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const KIND_LABEL = 'Tipo';
const QUANTITY_LABEL = 'Cantidad';
const REASON_LABEL = 'Motivo';
const ORDER_LABEL = 'Pedido';
const AUTHOR_LABEL = 'Autor';
const DATE_LABEL = 'Fecha';

/** Sin autor, lo hizo el sistema: caducidad, la migracion que aparta pedidos vivos. */
const SYSTEM_AUTHOR = 'Sistema';

/**
 * Etiqueta legible de cada tipo de asiento del historial, en el mismo orden que
 * `BatchHistoryEntry['kind']`: el libro fisico (apertura, ajuste, salida por entrega) y el libro
 * de la reserva (apartado, liberacion, caducidad, consumo).
 */
const KIND_LABELS: Record<BatchHistoryEntry['kind'], string> = {
  opening: 'Apertura',
  adjustment: 'Ajuste',
  consumption: 'Salida por entrega',
  reserve: 'Apartado',
  release: 'Liberación',
  expire: 'Caducidad',
  consume: 'Consumo',
};

/**
 * Deriva la etiqueta legible de un motivo a partir del propio valor, sin enumerarlo a mano:
 * guion bajo a espacio y primera letra en mayuscula. Exportada porque el dialogo de ajuste
 * necesita la misma etiqueta.
 */
export function movementReasonLabel(reason: MovementReason): string {
  const conEspacios = reason.split('_').join(' ');
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1);
}

/** Etiqueta del tipo de asiento. Exportada por el mismo motivo que `movementReasonLabel`. */
export function movementKindLabel(kind: BatchHistoryEntry['kind']): string {
  return KIND_LABELS[kind];
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
  | { readonly status: 'success'; readonly data: readonly BatchHistoryEntry[] }
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
    void listBatchMovementsAction(batchId).then((result) => {
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
            {state.data.map((movimiento, indice) => {
              // Sin `id` en `BatchHistoryEntry` (une dos libros distintos): la posicion en un
              // orden ya fijo, junto a la fecha y el tipo, es clave suficiente para la lista.
              const clave = `${indice}-${movimiento.createdAt}-${movimiento.kind}`;

              return (
                <li key={clave} data-testid={`batch-history-entry-${clave}`}>
                  <span className="text-xs text-muted-foreground">{KIND_LABEL}</span>
                  <span data-testid="batch-history-entry-kind">
                    {movementKindLabel(movimiento.kind)}
                  </span>
                  <span className="text-xs text-muted-foreground">{QUANTITY_LABEL}</span>
                  <span
                    data-testid="batch-history-entry-quantity"
                    title={exactDecimalTitle(movimiento.quantity)}
                    aria-label={trimDecimal(movimiento.quantity)}
                  >
                    {formatDecimalDisplay(movimiento.quantity)}
                  </span>
                  {movimiento.reason === null ? null : (
                    <>
                      <span className="text-xs text-muted-foreground">{REASON_LABEL}</span>
                      <span data-testid="batch-history-entry-reason">
                        {movementReasonLabel(movimiento.reason)}
                      </span>
                    </>
                  )}
                  {movimiento.orderNumberText === null ? null : (
                    <>
                      <span className="text-xs text-muted-foreground">{ORDER_LABEL}</span>
                      <span data-testid="batch-history-entry-order">
                        {movimiento.orderNumberText}
                      </span>
                    </>
                  )}
                  <span className="text-xs text-muted-foreground">{AUTHOR_LABEL}</span>
                  <span data-testid="batch-history-entry-author">
                    {movimiento.authorName ?? SYSTEM_AUTHOR}
                  </span>
                  <span className="text-xs text-muted-foreground">{DATE_LABEL}</span>
                  <span data-testid="batch-history-entry-date">
                    {formatMovementDate(movimiento.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
