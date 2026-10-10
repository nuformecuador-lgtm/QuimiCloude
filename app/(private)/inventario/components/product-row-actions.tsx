'use client';

import { LayersIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';
import { productDisplayName, type ProductView } from '@/lib/modules/inventario';
import type { ProductBatchesResult } from '@/lib/modules/inventario/adapters/driving/batch-actions';
import type { UnitRef } from '@/lib/modules/unidades';

import { DeleteProductDialog } from './delete-product-dialog';
import { ProductBatchesSheet } from './product-batches-sheet';
import { productUnitLabel } from './product-columns';
import { ProductSheet } from './product-sheet';

/**
 * Las acciones de fila de un producto -lotes, editar y borrar- en el menu de tres puntos de la
 * fila. La usan el catalogo y la pestana de producto terminado.
 *
 * El disparador nombra el producto, con su unidad, en su nombre accesible; los items dicen solo el
 * verbo.
 *
 * El panel de lotes, el de edicion y el dialogo de baja quedan montados y se abren por estado:
 * asi el cierre anima su salida.
 */

export const PRODUCT_ROW_ACTIONS_TESTID = 'product-row-actions';
export const PRODUCT_ACTION_BATCHES_TESTID = 'product-batches-open';
export const PRODUCT_ACTION_EDIT_TESTID = 'product-edit-open';
export const PRODUCT_ACTION_DELETE_TESTID = 'product-delete-open';

const BATCHES_ACTION_LABEL = 'Lotes';
const EDIT_ACTION_LABEL = 'Editar';
const DELETE_ACTION_LABEL = 'Borrar';

/** Nombre accesible del disparador del menu de la fila. */
export function productRowActionsLabel(name: string): string {
  return `Acciones de ${name}`;
}

export type ProductRowActionsProps = {
  readonly product: ProductView;
  readonly units?: readonly UnitRef[];
  /** Falla cerrado: el permiso baja por props, esta pantalla no lo resuelve. */
  readonly canAdjust: boolean;
  /** Que lotes pide el panel. Sin el, todos los del producto. */
  readonly loadBatches?: () => Promise<ProductBatchesResult>;
};

export function ProductRowActions({ product, units, canAdjust, loadBatches }: ProductRowActionsProps) {
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const items: RowActionMenuItem[] = [
    {
      key: 'batches',
      label: BATCHES_ACTION_LABEL,
      icon: LayersIcon,
      onSelect: () => setBatchesOpen(true),
      testId: PRODUCT_ACTION_BATCHES_TESTID,
    },
    {
      key: 'edit',
      label: EDIT_ACTION_LABEL,
      icon: PencilIcon,
      onSelect: () => setEditOpen(true),
      testId: PRODUCT_ACTION_EDIT_TESTID,
    },
    {
      key: 'delete',
      label: DELETE_ACTION_LABEL,
      icon: Trash2Icon,
      onSelect: () => setDeleteOpen(true),
      destructive: true,
      testId: PRODUCT_ACTION_DELETE_TESTID,
    },
  ];

  return (
    <>
      <RowActionsMenu
        items={items}
        triggerLabel={productRowActionsLabel(
          productDisplayName(product.name, productUnitLabel(product, units)),
        )}
        triggerTestId={PRODUCT_ROW_ACTIONS_TESTID}
        triggerDataAttributes={{ 'data-product-id': product.id }}
      />

      <ProductBatchesSheet
        product={product}
        units={units}
        canAdjust={canAdjust}
        loadBatches={loadBatches}
        open={batchesOpen}
        onOpenChange={setBatchesOpen}
      />
      <ProductSheet product={product} units={units} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteProductDialog product={product} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
