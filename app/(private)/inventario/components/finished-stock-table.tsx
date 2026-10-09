'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import { listOrderBatchesAction } from '@/lib/modules/inventario/adapters/driving/batch-actions';
import type { ErrorState as OperationError } from '@/lib/modules/errores';
import type { FinishedStockProductLine, FinishedStockRow } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { DeleteProductDialog } from './delete-product-dialog';
import { buildFinishedStockColumns, type FinishedStockTableRow } from './finished-stock-columns';
import { productListHref } from './product-list-params';
import { ProductBatchesSheet } from './product-batches-sheet';
import { ProductSheet } from './product-sheet';
import { PRODUCT_TABLE_TEXTS, productTableStates, type ProductTableStatus } from './product-table';
import { ProductTypeTabs } from './product-type-tabs';

/** Otra clave que la del catalogo: las columnas fijadas de una tabla no son las de la otra. */
export const FINISHED_STOCK_TABLE_ID = 'inventario-producto-terminado';

export const FINISHED_STOCK_TABLE_TEXTS: DataTableTexts = {
  ...PRODUCT_TABLE_TEXTS,
  search: 'Buscar por número de pedido o receta',
};

export type FinishedStockTableProps = {
  readonly rows: readonly FinishedStockRow[];
  readonly params: DataTableParams;
  readonly totalPages: number;
  readonly units?: readonly UnitRef[];
  readonly canAdjust?: boolean;
  readonly status?: ProductTableStatus;
  readonly error?: OperationError;
};

function loadLineBatches(parent: FinishedStockRow, line: FinishedStockProductLine) {
  return parent.kind === 'order'
    ? () => listOrderBatchesAction(parent.orderId, line.product.id)
    : () => listOrderBatchesAction(null, parent.productId);
}

function rowId(item: FinishedStockTableRow): string {
  return item.kind === 'group' ? item.row.key : `${item.parent.key}--${item.line.product.id}`;
}

/** Pestana «Producto terminado»: una fila por pedido que se despliega en sus productos. */
export function FinishedStockTable({
  rows,
  params,
  totalPages,
  units,
  canAdjust = false,
  status = 'idle',
  error,
}: FinishedStockTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const columns = useMemo(
    () =>
      buildFinishedStockColumns({
        onToggle: (key) =>
          setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          }),
        lineActions: (parent, line) => (
          <>
            <ProductBatchesSheet
              product={line.product}
              units={units}
              canAdjust={canAdjust}
              loadBatches={loadLineBatches(parent, line)}
            />
            <ProductSheet product={line.product} units={units} />
            <DeleteProductDialog product={line.product} />
          </>
        ),
        units,
      }),
    [units, canAdjust],
  );

  const tableRows = useMemo(
    () =>
      rows.flatMap((row): FinishedStockTableRow[] => {
        const isOpen = expanded.has(row.key);
        const group: FinishedStockTableRow = { kind: 'group', row, expanded: isOpen };
        if (!isOpen) return [group];
        return [group, ...row.products.map((line) => ({ kind: 'line' as const, parent: row, line }))];
      }),
    [rows, expanded],
  );

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  const table = (
    <DataTable
      tableId={FINISHED_STOCK_TABLE_ID}
      columns={columns}
      rows={tableRows}
      getRowId={rowId}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => navigate(productListHref(next))}
      status={status}
      texts={FINISHED_STOCK_TABLE_TEXTS}
      states={productTableStates({ pageSize: params.pageSize, error })}
    />
  );

  if (status !== 'idle') return table;

  return (
    <div
      data-testid="product-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {isPending ? (
        <p className="text-xs text-muted-foreground">{FINISHED_STOCK_TABLE_TEXTS.loading}</p>
      ) : null}
      <ProductTypeTabs params={params} onNavigate={navigate} />
      {table}
    </div>
  );
}
