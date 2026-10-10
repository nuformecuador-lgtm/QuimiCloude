'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  listProductBatchesAction,
  type ProductBatchesResult,
} from '@/lib/modules/inventario/adapters/driving/batch-actions';
import type { ErrorState } from '@/lib/modules/errores';
import {
  PRODUCT_TYPES,
  productDisplayName,
  type ProductBatchView,
  type ProductView,
} from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { AdjustBatchDialog } from './adjust-batch-dialog';
import { BatchHistory } from './batch-history';
import { productUnitLabel } from './product-columns';
import { ProductBatchesPanel } from './product-batches-panel';

type BatchesLoadState =
  | { readonly status: 'idle' }
  /** Abierto desde fuera: la peticion sale en el efecto, justo despues de pintar. */
  | { readonly status: 'queued' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: readonly ProductBatchView[] }
  | ErrorState;

export type ProductBatchesSheetProps = {
  readonly product: ProductView;
  readonly units?: readonly UnitRef[];
  /** Falla cerrado: el permiso baja por props, esta pantalla no lo resuelve. */
  readonly canAdjust: boolean;
  /** Que lotes se piden. Sin el, todos los del producto. */
  readonly loadBatches?: () => Promise<ProductBatchesResult>;
  /** Apertura controlada desde fuera. Ausente = el panel trae su propio disparador. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
};

/**
 * Panel lateral con los lotes de un producto. Pide los lotes al abrirse por primera vez y
 * los vuelve a pedir tras un ajuste, para que la existencia nueva se vea.
 *
 * Sin `open` trae su propio disparador; con `open` lo abre quien lo monta (el menu de la fila) y
 * no pinta disparador.
 */
export function ProductBatchesSheet({
  product,
  units,
  canAdjust,
  loadBatches,
  open,
  onOpenChange,
}: ProductBatchesSheetProps) {
  const [state, setState] = useState<BatchesLoadState>({ status: 'idle' });
  const displayName = productDisplayName(product.name, productUnitLabel(product, units));

  function requestBatches() {
    const request = loadBatches ? loadBatches() : listProductBatchesAction(product.id);
    void request.then((result) => {
      setState(result.status === 'success' ? { status: 'success', data: result.data } : result);
    });
  }

  function fetchBatches() {
    setState({ status: 'loading' });
    requestBatches();
  }

  // Con apertura controlada no pasa por `handleOpenChange`: la primera apertura se detecta aqui.
  if (open === true && state.status === 'idle') setState({ status: 'queued' });

  const sendQueuedRequest = useEffectEvent(requestBatches);

  useEffect(() => {
    if (state.status === 'queued') sendQueuedRequest();
  }, [state.status]);

  function handleOpenChange(next: boolean) {
    if (next && state.status === 'idle') fetchBatches();
    onOpenChange?.(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {open === undefined ? (
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              touch
              aria-label={`Lotes de ${displayName}`}
              data-testid="product-batches-open"
            />
          }
        >
          Lotes
        </SheetTrigger>
      ) : null}
      <SheetContent data-testid="product-batches-sheet">
        <SheetHeader>
          <SheetTitle>{displayName}</SheetTitle>
        </SheetHeader>

        {state.status === 'loading' || state.status === 'queued' ? (
          <p data-testid="product-batches-loading">Cargando lotes…</p>
        ) : null}

        {state.status === 'error' ? (
          <p role="alert" data-testid="product-batches-error">
            {state.message}
          </p>
        ) : null}

        {state.status === 'success' ? (
          <ProductBatchesPanel
            batches={state.data}
            units={units}
            product={product}
            renderBatchDetail={(batch) => (
              <BatchHistory batchId={batch.id} batchLot={batch.lot} />
            )}
            renderBatchActions={(batch) => (
              <AdjustBatchDialog
                batch={batch}
                canAdjust={canAdjust}
                productType={product.type}
                wholePackages={
                  product.type === PRODUCT_TYPES.PACKAGING && product.presentationId != null
                }
                onAdjusted={fetchBatches}
              />
            )}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
