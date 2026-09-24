import Link from 'next/link';

import { SupplierSheet } from '@/components/shared/supplier';
import { buttonVariants } from '@/components/ui/button';
import { listSupplierShowcaseAction } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { cn } from '@/lib/utils';

import { SupplierListEmpty } from './supplier-list-empty';
import { SupplierListError } from './supplier-list-error';
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
    return <SupplierListError error={result} />;
  }

  const { items, hasMore } = result.data;
  const activo = hasActiveFilters(filters);

  if (items.length === 0 && !activo) {
    return (
      <SupplierListEmpty>
        <SupplierSheet />
      </SupplierListEmpty>
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
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
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
