'use client';

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import type { DataTableColumn } from '@/components/shared/data-table';
import { EntityImage } from '@/components/shared/entity-image';
import { Button } from '@/components/ui/button';
import type {
  FinishedStockProductLine,
  FinishedStockRow,
  PackagedStockEntry,
} from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { cn } from '@/lib/utils';

import {
  ACTIONS_COLUMN_ID,
  ACTIONS_COLUMN_LABEL,
  EMPTY_CELL,
  IMAGE_COLUMN_ID,
  IMAGE_COLUMN_LABEL,
  isBelowAlert,
  productUnitLabel,
  qtyAlertCell,
  stockAmountCell,
  unitLabel,
} from './product-columns';

/** Fila que pinta la tabla: la del pedido (o sin pedido) y, desplegada, una por producto. */
export type FinishedStockTableRow =
  | { readonly kind: 'group'; readonly row: FinishedStockRow; readonly expanded: boolean }
  | {
      readonly kind: 'line';
      readonly parent: FinishedStockRow;
      readonly line: FinishedStockProductLine;
    };

/** «6 × Botella 250 ml, 1 × Botella 1 L»; el resto que no llena un envase va tras un «+». */
export function packagedStockLabel(
  entries: readonly PackagedStockEntry[],
  units: readonly UnitRef[] | undefined,
): string {
  return entries
    .map((entry) => {
      const packages = `${entry.packages} × ${entry.name}`;
      if (entry.remainder === null) return packages;
      const symbol = unitLabel(entry.unitId, units);
      return symbol === null
        ? `${packages} + ${entry.remainder}`
        : `${packages} + ${entry.remainder} ${symbol}`;
    })
    .join(', ');
}

/** Nombre visible de la fila agrupadora. */
export function finishedStockRowTitle(row: FinishedStockRow): string {
  if (row.kind === 'withoutOrder') return `Sin pedido · ${row.products[0].product.name}`;
  const order = `Pedido ${row.numberText}`;
  return row.recipeName === null ? order : `${order} · ${row.recipeName}`;
}

function packagedStockCell(
  entries: readonly PackagedStockEntry[] | null,
  units: readonly UnitRef[] | undefined,
  alerted = false,
): ReactNode {
  if (entries === null) return EMPTY_CELL;
  const label = packagedStockLabel(entries, units);

  return (
    <span
      data-testid="finished-stock-packaged"
      data-alert={alerted ? 'true' : undefined}
      className={alerted ? 'font-semibold text-destructive' : undefined}
      title={label}
      aria-label={label}
    >
      {label}
    </span>
  );
}

function groupStockCell(row: FinishedStockRow, units: readonly UnitRef[] | undefined): ReactNode {
  if (row.kind === 'order') return packagedStockCell(row.packagedStock, units);
  const label = row.unitId === null ? null : unitLabel(row.unitId, units);
  return stockAmountCell(row.stock, label, false);
}

function lineStockCell(
  line: FinishedStockProductLine,
  units: readonly UnitRef[] | undefined,
): ReactNode {
  const alerted = isBelowAlert(line.product);
  if (line.packagedStock !== null) return packagedStockCell(line.packagedStock, units, alerted);
  return stockAmountCell(line.stock, productUnitLabel(line.product, units), alerted);
}

export type FinishedStockColumnsDeps = {
  readonly onToggle: (key: string) => void;
  /** Acciones de producto de una sub-fila: las enchufa quien monta la tabla. */
  readonly lineActions: (parent: FinishedStockRow, line: FinishedStockProductLine) => ReactNode;
  readonly units?: readonly UnitRef[];
};

export function buildFinishedStockColumns({
  onToggle,
  lineActions,
  units,
}: FinishedStockColumnsDeps): readonly DataTableColumn<FinishedStockTableRow>[] {
  return [
    {
      id: IMAGE_COLUMN_ID,
      label: IMAGE_COLUMN_LABEL,
      align: 'start',
      defaultPinned: 'left',
      cell: (item) =>
        item.kind === 'group' ? (
          <EntityImage
            path={null}
            name={finishedStockRowTitle(item.row)}
            testId="finished-stock-image"
          />
        ) : (
          <EntityImage
            path={item.line.product.imagePath}
            name={item.line.product.name}
            testId="product-image"
          />
        ),
    },
    {
      id: 'name',
      label: 'Nombre',
      align: 'start',
      width: 500,
      hideText: false,
      cell: (item) => {
        if (item.kind === 'line') {
          return (
            <span className="block pl-12" data-testid="finished-stock-line-name">
              {item.line.product.name}
            </span>
          );
        }
        const title = finishedStockRowTitle(item.row);
        return (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 shrink-0"
              aria-expanded={item.expanded}
              aria-label={`Productos de ${title}`}
              data-testid="finished-stock-toggle"
              onClick={() => onToggle(item.row.key)}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn('transition-transform', item.expanded && 'rotate-90')}
              />
            </Button>
            <span className="font-medium" data-testid="finished-stock-name">
              {title}
            </span>
          </div>
        );
      },
    },
    {
      id: 'stock',
      label: 'Existencia',
      align: 'center',
      cell: (item) =>
        item.kind === 'group' ? groupStockCell(item.row, units) : lineStockCell(item.line, units),
    },
    {
      id: 'qtyAlert',
      label: 'Alerta de cantidad',
      align: 'center',
      cell: (item) => (item.kind === 'line' ? qtyAlertCell(item.line.product) : null),
    },
    {
      id: ACTIONS_COLUMN_ID,
      label: ACTIONS_COLUMN_LABEL,
      align: 'end',
      defaultPinned: 'right',
      cell: (item) =>
        item.kind === 'line' ? (
          <div className="flex justify-end gap-1">{lineActions(item.parent, item.line)}</div>
        ) : null,
    },
  ];
}
