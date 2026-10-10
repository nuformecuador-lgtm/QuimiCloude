import Link from 'next/link';

import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { SupplierSheet } from '@/components/shared/supplier';
import { buttonVariants } from '@/components/ui/button';
import { listSupplierShowcaseAction } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { cn } from '@/lib/utils';

import { EMPTY_SHOWCASE_FILTERS, showcaseHref, type ShowcaseFilters } from './supplier-showcase-params';
import { SupplierShowcaseList } from './supplier-showcase-list';

const FIRST_PAGE = 1;

type SupplierShowcaseSectionProps = {
  readonly filters: ShowcaseFilters;
};

function hasActiveFilters(filters: ShowcaseFilters): boolean {
  return filters.supplierSearch !== '' || filters.productSearch !== '';
}

/**
 * Pide la tanda inicial y despacha entre error, vacío, sin resultados o la lista. La `key` de
 * `SupplierShowcaseList` cambia en cada render para remontarla desde la primera tanda.
 */
export async function SupplierShowcaseSection({ filters }: SupplierShowcaseSectionProps) {
  const result = await listSupplierShowcaseAction({
    page: FIRST_PAGE,
    supplierSearch: filters.supplierSearch,
    productSearch: filters.productSearch,
  });

  if (result.status === 'error') {
    return (
      <ErrorState
        error={result}
        title="No se pudo cargar la lista de proveedores."
        testId="supplier-list-error"
        messageTestId="supplier-list-error-message"
        codeTestId="supplier-list-error-code"
        retry={{ kind: 'refresh' }}
        retryTestId="supplier-list-retry"
      />
    );
  }

  const { items, hasMore } = result.data;
  const activo = hasActiveFilters(filters);

  if (items.length === 0 && !activo) {
    return (
      <EmptyState testId="supplier-list-empty" message="Todavía no hay proveedores dados de alta.">
        <SupplierSheet />
      </EmptyState>
    );
  }

  if (items.length === 0 && activo) {
    return (
      <div
        data-testid="supplier-showcase-no-results"
        className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
      >
        <p className="text-sm text-muted-foreground">
          Ningún proveedor coincide con la búsqueda o el filtro.
        </p>
        <Link
          href={showcaseHref(EMPTY_SHOWCASE_FILTERS)}
          data-slot="button"
          data-testid="supplier-showcase-clear-filters"
          className={cn(buttonVariants({ variant: 'outline', touch: true }))}
        >
          Limpiar filtros
        </Link>
      </div>
    );
  }

  return (
    <SupplierShowcaseList
      key={crypto.randomUUID()}
      initialPage={{ items, hasMore }}
      filters={filters}
    />
  );
}
