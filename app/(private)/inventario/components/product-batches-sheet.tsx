'use client';

import { useState } from 'react';

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
};

/**
 * Panel lateral con los lotes de un producto. Pide los lotes al abrirse por primera vez y
 * los vuelve a pedir tras un ajuste, para que la existencia nueva se vea.
 */
export function ProductBatchesSheet({
  product,
  units,
  canAdjust,
  loadBatches,
}: ProductBatchesSheetProps) {
  const [state, setState] = useState<BatchesLoadState>({ status: 'idle' });
  const displayName = productDisplayName(product.name, productUnitLabel(product, units));

  function fetchBatches() {
    setState({ status: 'loading' });
    const request = loadBatches ? loadBatches() : listProductBatchesAction(product.id);
    void request.then((result) => {
      setState(result.status === 'success' ? { status: 'success', data: result.data } : result);
    });
  }

  function handleOpenChange(open: boolean) {
    if (open && state.status === 'idle') fetchBatches();
  }

  return (
    <Sheet onOpenChange={handleOpenChange}>
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
      <SheetContent data-testid="product-batches-sheet">
        <SheetHeader>
          <SheetTitle>{displayName}</SheetTitle>
        </SheetHeader>

        {state.status === 'loading' ? (
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
