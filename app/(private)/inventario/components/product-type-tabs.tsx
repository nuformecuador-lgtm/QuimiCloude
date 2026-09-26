'use client';

import { useMemo } from 'react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PRODUCT_TYPE_VALUES, type ProductType } from '@/lib/modules/inventario';
import { productListHref, TYPE_COLUMN_ID } from './product-list-params';
import type { DataTableParams } from '@/components/shared/data-table';

export type ProductTypeTabsProps = {
  readonly params: DataTableParams;
  readonly onNavigate: (href: string) => void;
};

const TYPE_LABELS: Record<ProductType, string> = {
  PRODUCT: 'Producto',
  MACHINE: 'Máquina',
  PACKAGING: 'Envase',
  FINISHED_PRODUCT: 'Producto terminado',
};

export function ProductTypeTabs({ params, onNavigate }: ProductTypeTabsProps) {
  const currentType = useMemo(() => {
    const filter = params.filters[TYPE_COLUMN_ID];
    if (filter?.kind === 'select' && filter.values.length > 0) {
      return filter.values[0] as ProductType;
    }
    return 'all' as const;
  }, [params.filters]);

  const tabs = useMemo(
    () => [
      { value: 'all', label: 'Todos' },
      ...PRODUCT_TYPE_VALUES.map((type) => ({
        value: type,
        label: TYPE_LABELS[type],
      })),
    ],
    [],
  );

  function handleChange(value: string) {
    const nextParams = { ...params, page: 1 };
    if (value !== 'all') {
      nextParams.filters = {
        ...params.filters,
        [TYPE_COLUMN_ID]: { kind: 'select', values: [value as ProductType] },
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [TYPE_COLUMN_ID]: _typeFilter, ...restFilters } = params.filters;
      nextParams.filters = restFilters;
    }
    onNavigate(productListHref(nextParams));
  }

  return (
    <Tabs value={currentType ?? 'all'} onValueChange={handleChange}>
      <TabsList className="w-full" role="tablist" aria-label="Filtrar por tipo de producto">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex-1">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={currentType} className="pt-4">
        {currentType === 'all' ? (
          <p className="text-sm text-muted-foreground">Mostrando todos los tipos</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Filtrando por: <strong>{TYPE_LABELS[currentType]}</strong>
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}