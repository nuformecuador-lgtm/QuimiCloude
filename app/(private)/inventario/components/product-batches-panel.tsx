'use client';

import type { ReactNode } from 'react';

import type { ProductBatchView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { exactDecimalTitle, formatDecimalDisplay, trimDecimal } from '@/lib/shared/ui/decimal-display';

import { EMPTY_CELL } from './product-columns';

const LOT_LABEL = 'Lote';
const QUANTITY_LABEL = 'Cantidad';
const PURCHASE_DATE_LABEL = 'Fecha de compra';
const RESERVED_LABEL = 'Apartado';
const AVAILABLE_LABEL = 'Disponible';
const OVER_RESERVED_LABEL = 'Sobre-reservado';

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

/**
 * Cantidad del lote, sin convertir entre unidades: la que trae `batch.stock`, redondeada a dos
 * decimales para pintarla (`formatDecimalDisplay`). El valor guardado no cambia: esto es la
 * celda, no el dato.
 */
function quantityLabel(batch: ProductBatchView, units: readonly UnitRef[] | undefined): string {
  return formattedQuantity(batch.stock, batch.unitId, units);
}

/** Cifra exacta de la cantidad, para quien no puede quedarse con el redondeo del pixel. */
function quantityAriaLabel(batch: ProductBatchView, units: readonly UnitRef[] | undefined): string {
  return exactQuantity(batch.stock, batch.unitId, units);
}

/** La misma composicion «cantidad · unidad» que `quantityLabel`, para un valor cualquiera del
 *  lote -apartado, disponible-, no solo su existencia. */
function formattedQuantity(
  value: string,
  unitId: string | null,
  units: readonly UnitRef[] | undefined,
): string {
  const label = unitLabel(unitId, units);
  const amount = formatDecimalDisplay(value);
  return label === null ? amount : `${amount} ${label}`;
}

/** Cifra exacta de `formattedQuantity`, para el `title` y el `aria-label`. */
function exactQuantity(
  value: string,
  unitId: string | null,
  units: readonly UnitRef[] | undefined,
): string {
  const label = unitLabel(unitId, units);
  const amount = trimDecimal(value);
  return label === null ? amount : `${amount} ${label}`;
}

const PACKAGE_CONTENT_SCALE = 4;
const PACKAGE_DECIMAL_PATTERN = /^\d+(?:\.\d{1,4})?$/;

/** Decimal no negativo en texto -> entero escalado a cuatro decimales, o `null` si no tiene esa
 *  forma. Aritmetica exacta de enteros: nada de `Number` ni `parseFloat`. */
function toScaledPackageContent(value: string): bigint | null {
  if (!PACKAGE_DECIMAL_PATTERN.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(PACKAGE_CONTENT_SCALE, '0'));
}

/**
 * Numero de envases del lote -`stock / packageContent`, con el contenido guardado en el lote-,
 * o `null` cuando el lote no es de producto terminado o la division no es entera (R25).
 */
function packageCountLabel(batch: ProductBatchView): string | null {
  if (batch.packageContent === null) return null;

  const stock = toScaledPackageContent(batch.stock);
  const content = toScaledPackageContent(batch.packageContent);
  if (stock === null || content === null || content === BigInt(0)) return null;
  if (stock % content !== BigInt(0)) return null;

  const packages = stock / content;
  return packages === BigInt(1) ? '1 envase' : `${packages.toString()} envases`;
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
      {batches.map((batch) => {
        const packages = packageCountLabel(batch);
        return (
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
                  <dd
                    data-testid="product-batch-quantity"
                    title={exactDecimalTitle(batch.stock)}
                    aria-label={quantityAriaLabel(batch, units)}
                  >
                    {quantityLabel(batch, units)}
                  </dd>
                  {packages === null ? null : (
                    <span data-testid="product-batch-packages" className="text-xs text-muted-foreground">
                      {packages}
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{PURCHASE_DATE_LABEL}</dt>
                  <dd data-testid="product-batch-purchase-date">{batch.purchaseDate}</dd>
                </div>
                {batch.reserved === undefined ? null : (
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">{RESERVED_LABEL}</dt>
                    <dd
                      data-testid="product-batch-reserved"
                      title={exactDecimalTitle(batch.reserved)}
                      aria-label={exactQuantity(batch.reserved, batch.unitId, units)}
                    >
                      {formattedQuantity(batch.reserved, batch.unitId, units)}
                    </dd>
                  </div>
                )}
                {batch.available === undefined ? null : (
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">{AVAILABLE_LABEL}</dt>
                    <dd
                      data-testid="product-batch-available"
                      title={exactDecimalTitle(batch.available)}
                      aria-label={exactQuantity(batch.available, batch.unitId, units)}
                    >
                      {formattedQuantity(batch.available, batch.unitId, units)}
                    </dd>
                  </div>
                )}
              </dl>
              {batch.overReserved !== true ? null : (
                <span
                  data-testid="product-batch-over-reserved"
                  className="rounded-full border border-destructive/40 px-2 py-0.5 text-xs font-medium text-destructive"
                >
                  {OVER_RESERVED_LABEL}
                </span>
              )}
              {renderBatchActions === undefined ? null : <div>{renderBatchActions(batch)}</div>}
            </div>
            {renderBatchDetail === undefined ? null : <div>{renderBatchDetail(batch)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
