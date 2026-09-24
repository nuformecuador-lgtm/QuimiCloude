import { SHOWCASE_LINE_BATCH, SHOWCASE_SUPPLIER_BATCH } from '@/lib/modules/proveedores';

/**
 * Esqueleto de la tanda inicial: tantas filas como el tamaño de tanda de proveedores, y en cada
 * fila tantas tarjetas como el tamaño de tanda de líneas. Los dos números vienen del contrato
 * público del módulo para que el esqueleto no pueda divergir de lo que la tanda real trae.
 */
export function SupplierShowcaseSkeleton() {
  return (
    <div
      data-testid="supplier-showcase-skeleton"
      aria-busy="true"
      className="flex flex-col divide-y"
    >
      {Array.from({ length: SHOWCASE_SUPPLIER_BATCH }, (_, rowIndex) => (
        <div
          key={rowIndex}
          data-testid="supplier-showcase-row-skeleton"
          className="flex flex-col gap-2 py-3"
        >
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
          <div className="flex gap-3 overflow-x-hidden">
            {Array.from({ length: SHOWCASE_LINE_BATCH }, (__, cardIndex) => (
              <div
                key={cardIndex}
                data-testid="showcase-line-card-skeleton"
                className="flex w-20 shrink-0 flex-col items-center gap-1"
              >
                <div className="size-[60px] animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
