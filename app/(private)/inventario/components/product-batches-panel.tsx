'use client';

import type { ReactNode } from 'react';

import type { ProductBatchView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { EMPTY_CELL } from './product-columns';

const LOT_LABEL = 'Lote';
const QUANTITY_LABEL = 'Cantidad';
const PURCHASE_DATE_LABEL = 'Fecha de compra';

/**
 * Panel de lotes de un producto: numero de lote, cantidad con su unidad y fecha de compra.
 *
 * Puramente presentacional: recibe los lotes y el catalogo de unidades por props y no pide nada
 * por su cuenta. El detalle del historial y las acciones de ajuste son dos ranuras -el mismo
 * patron que `buildProductColumns({ rowActions })`- para que este archivo no importe ninguno de
 * los dos: los monta quien compone la pantalla.
 */

export type ProductBatchesPanelProps = {
  readonly batches: readonly ProductBatchView[];
  /** Catalogo de unidades para resolver el simbolo de cada lote. Sin el, la cantidad se pinta sola. */
  readonly units?: readonly UnitRef[];
  /** Ranura del historial del lote. */
  readonly renderBatchDetail?: (batch: ProductBatchView) => ReactNode;
  /** Ranura de las acciones del lote (el ajuste). */
  readonly renderBatchActions?: (batch: ProductBatchView) => ReactNode;
};

/**
 * Etiqueta de una unidad a partir de su id: simbolo, nombre, o el marcador si el catalogo no la
 * trae. Sin catalogo (`units` indefinido) o sin unidad en el lote (MACHINE), devuelve `null`
 * y quien llama pinta la cantidad sola.
 */
function unitLabel(unitId: string | null, units: readonly UnitRef[] | undefined): string | null {
  if (unitId === null || units === undefined) return null;
  const unit = units.find((candidate) => candidate.id === unitId);
  return unit?.symbol ?? unit?.name ?? EMPTY_CELL;
}

/** Cantidad del lote, sin convertir entre unidades: la que trae `batch.stock`, tal cual. */
function quantityLabel(batch: ProductBatchView, units: readonly UnitRef[] | undefined): string {
  const label = unitLabel(batch.unitId, units);
  return label === null ? String(batch.stock) : `${batch.stock} ${label}`;
}

export function ProductBatchesPanel({
  batches,
  units,
  renderBatchDetail,
  renderBatchActions,
}: ProductBatchesPanelProps) {
  if (batches.length === 0) {
    return (
      <div data-testid="product-batches-panel" className="p-4 text-sm text-muted-foreground">
        Este producto todavía no tiene lotes registrados.
      </div>
    );
  }

  return (
    <ul data-testid="product-batches-panel" className="flex flex-col gap-3">
      {batches.map((batch) => (
        <li
          key={batch.id}
          data-testid={`product-batch-${batch.id}`}
          className="flex flex-col gap-2 rounded-lg border p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dl className="flex flex-wrap gap-4 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{LOT_LABEL}</dt>
                <dd data-testid="product-batch-lot">{batch.lot}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{QUANTITY_LABEL}</dt>
                <dd data-testid="product-batch-quantity">{quantityLabel(batch, units)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{PURCHASE_DATE_LABEL}</dt>
                <dd data-testid="product-batch-purchase-date">{batch.purchaseDate}</dd>
              </div>
            </dl>
            {renderBatchActions === undefined ? null : <div>{renderBatchActions(batch)}</div>}
          </div>
          {renderBatchDetail === undefined ? null : <div>{renderBatchDetail(batch)}</div>}
        </li>
      ))}
    </ul>
  );
}
