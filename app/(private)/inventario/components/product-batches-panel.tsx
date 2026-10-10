'use client';

import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  PRODUCT_TYPES,
  type ProductBatchView,
  type ProductView,
} from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { exactDecimalTitle, formatDecimalDisplay, trimDecimal } from '@/lib/shared/ui/decimal-display';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';

const LOT_LABEL = 'Lote';
const QUANTITY_LABEL = 'Cantidad';
const PURCHASE_DATE_LABEL = 'Fecha de compra';
const EXPIRY_DATE_LABEL = 'Vencimiento';
const RESERVED_LABEL = 'Apartado';
const AVAILABLE_LABEL = 'Disponible';
const OVER_RESERVED_LABEL = 'Sobre-reservado';
const PACKAGING_PRESENTATION_LABEL = 'Presentación del envase';
const PACKAGING_LEGACY_LABEL = 'Envase sin presentación fija';

/**
 * Panel de lotes de un producto: numero de lote, cantidad con su unidad, fecha de compra y,
 * si el lote lo tiene, vencimiento.
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
  /**
   * El producto de los lotes. Un lote de envase no lleva presentacion propia: su unidad y su
   * presentacion son las del producto.
   */
  readonly product?: Pick<ProductView, 'type' | 'unitId' | 'presentationId' | 'presentationName'>;
};

type PackagingInfo =
  | { readonly kind: 'fixed'; readonly presentationName: string }
  | { readonly kind: 'legacy' }
  | null;

function packagingInfo(product: ProductBatchesPanelProps['product']): PackagingInfo {
  if (product === undefined || product.type !== PRODUCT_TYPES.PACKAGING) return null;
  if (product.presentationId == null) return { kind: 'legacy' };
  return { kind: 'fixed', presentationName: product.presentationName ?? EMPTY_MARK };
}

/**
 * Etiqueta de una unidad a partir de su id: simbolo, nombre, o el marcador si el catalogo no la
 * trae. Sin catalogo (`units` indefinido) o sin unidad en el lote (MACHINE), devuelve `null`
 * y quien llama pinta la cantidad sola.
 */
function unitLabel(unitId: string | null, units: readonly UnitRef[] | undefined): string | null {
  if (unitId === null || units === undefined) return null;
  const unit = units.find((candidate) => candidate.id === unitId);
  return unit?.symbol ?? unit?.name ?? EMPTY_MARK;
}

/**
 * Cantidad del lote, sin convertir entre unidades: la que trae `batch.stock`, redondeada a dos
 * decimales para pintarla (`formatDecimalDisplay`). El valor guardado no cambia: esto es la
 * celda, no el dato.
 */
function quantityLabel(
  batch: ProductBatchView,
  unitId: string | null,
  units: readonly UnitRef[] | undefined,
): string {
  return formattedQuantity(batch.stock, unitId, units);
}

/** Cifra exacta de la cantidad, para quien no puede quedarse con el redondeo del pixel. */
function quantityAriaLabel(
  batch: ProductBatchView,
  unitId: string | null,
  units: readonly UnitRef[] | undefined,
): string {
  return exactQuantity(batch.stock, unitId, units);
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
 * o `null` cuando el lote no es de producto terminado o la division no es entera.
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
  product,
}: ProductBatchesPanelProps) {
  const packaging = packagingInfo(product);
  const header =
    packaging === null ? null : packaging.kind === 'legacy' ? (
      <p
        role="note"
        className="rounded-lg border px-3 py-2 text-sm font-medium"
        data-testid="product-batches-packaging-legacy"
      >
        {PACKAGING_LEGACY_LABEL}
      </p>
    ) : (
      <p className="text-sm" data-testid="product-batches-packaging-presentation">
        <span className="text-muted-foreground">{PACKAGING_PRESENTATION_LABEL}: </span>
        {packaging.presentationName}
      </p>
    );
  /** Un lote sin unidad propia (envase con presentacion fija) se cuenta en la del producto. */
  const unitOf = (batch: ProductBatchView): string | null =>
    batch.unitId ?? (packaging?.kind === 'fixed' ? (product?.unitId ?? null) : null);

  if (batches.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <div data-testid="product-batches-panel" className="p-4 text-sm text-muted-foreground">
          Este producto todavía no tiene lotes registrados.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
    {header}
    <ul data-testid="product-batches-panel" className="flex flex-col gap-3">
      {batches.map((batch) => {
        const packages = packageCountLabel(batch);
        const unitId = unitOf(batch);
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
                  <dd data-testid="product-batch-lot" className="font-mono tabular-nums">{batch.lot}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{QUANTITY_LABEL}</dt>
                  <dd
                    data-testid="product-batch-quantity"
                    className="font-mono tabular-nums"
                    title={exactDecimalTitle(batch.stock)}
                    aria-label={quantityAriaLabel(batch, unitId, units)}
                  >
                    {quantityLabel(batch, unitId, units)}
                  </dd>
                  {packages === null ? null : (
                    <span data-testid="product-batch-packages" className="text-xs text-muted-foreground">
                      {packages}
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{PURCHASE_DATE_LABEL}</dt>
                  <dd data-testid="product-batch-purchase-date" className="font-mono tabular-nums">{batch.purchaseDate}</dd>
                </div>
                {batch.expiryDate === null ? null : (
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">{EXPIRY_DATE_LABEL}</dt>
                    <dd data-testid="product-batch-expiry-date" className="font-mono tabular-nums">{batch.expiryDate}</dd>
                  </div>
                )}
                {batch.reserved === undefined ? null : (
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">{RESERVED_LABEL}</dt>
                    <dd
                      data-testid="product-batch-reserved"
                      className="font-mono tabular-nums"
                      title={exactDecimalTitle(batch.reserved)}
                      aria-label={exactQuantity(batch.reserved, unitId, units)}
                    >
                      {formattedQuantity(batch.reserved, unitId, units)}
                    </dd>
                  </div>
                )}
                {batch.available === undefined ? null : (
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">{AVAILABLE_LABEL}</dt>
                    <dd
                      data-testid="product-batch-available"
                      className="font-mono tabular-nums"
                      title={exactDecimalTitle(batch.available)}
                      aria-label={exactQuantity(batch.available, unitId, units)}
                    >
                      {formattedQuantity(batch.available, unitId, units)}
                    </dd>
                  </div>
                )}
              </dl>
              {batch.overReserved !== true ? null : (
                <Badge variant="destructive" data-testid="product-batch-over-reserved">
                  {OVER_RESERVED_LABEL}
                </Badge>
              )}
              {renderBatchActions === undefined ? null : <div>{renderBatchActions(batch)}</div>}
            </div>
            {renderBatchDetail === undefined ? null : <div>{renderBatchDetail(batch)}</div>}
          </li>
        );
      })}
    </ul>
    </div>
  );
}
