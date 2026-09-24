'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import {
  EMPTY_SHOWCASE_FILTERS,
  showcaseHref,
  type ShowcaseFilters,
} from './supplier-showcase-params';

/**
 * Los dos filtros del catalogo visual de proveedores: producto y proveedor.
 *
 * Cambiar cualquiera de los dos navega a la URL nueva con `router.replace` dentro de una
 * transicion, con el mismo rebote que la busqueda global de la tabla compartida: sin eso, cada
 * tecla dispararia una navegacion. «Limpiar» vacia los dos y navega de inmediato, sin esperar al
 * rebote.
 */

const TOUCH_TARGET = 'min-h-11';
const FIELD_TEXT = 'text-base md:text-base';

export const SHOWCASE_FILTERS_TEXTS = {
  productLabel: 'Producto',
  supplierLabel: 'Proveedor',
  clear: 'Limpiar filtros',
} as const;

export type SupplierShowcaseFiltersProps = {
  readonly filters: ShowcaseFilters;
};

export function SupplierShowcaseFilters({ filters }: SupplierShowcaseFiltersProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState(filters);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza el borrador con la URL cuando esta cambia por fuera (atras del navegador, un
  // enlace externo): ajustar el estado DURANTE el render, no en un efecto, evita el render en
  // cascada que `react-hooks/set-state-in-effect` prohibe.
  const [filtrosPrevios, setFiltrosPrevios] = useState(filters);
  if (filtrosPrevios !== filters) {
    setFiltrosPrevios(filters);
    setDraft(filters);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  const navigate = (next: ShowcaseFilters) => {
    startTransition(() => {
      router.replace(showcaseHref(next));
    });
  };

  const handleChange = (next: ShowcaseFilters) => {
    setDraft(next);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(next), SEARCH_DEBOUNCE_MS);
  };

  const handleClear = () => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    setDraft(EMPTY_SHOWCASE_FILTERS);
    navigate(EMPTY_SHOWCASE_FILTERS);
  };

  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="supplier-showcase-filters">
      <div className="flex flex-col gap-1">
        <label htmlFor="supplier-showcase-product" className="text-xs text-muted-foreground">
          {SHOWCASE_FILTERS_TEXTS.productLabel}
        </label>
        <Input
          id="supplier-showcase-product"
          type="search"
          value={draft.productSearch}
          placeholder={SHOWCASE_FILTERS_TEXTS.productLabel}
          data-testid="supplier-showcase-product-filter"
          className={cn(TOUCH_TARGET, FIELD_TEXT)}
          onChange={(event) => handleChange({ ...draft, productSearch: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="supplier-showcase-supplier" className="text-xs text-muted-foreground">
          {SHOWCASE_FILTERS_TEXTS.supplierLabel}
        </label>
        <Input
          id="supplier-showcase-supplier"
          type="search"
          value={draft.supplierSearch}
          placeholder={SHOWCASE_FILTERS_TEXTS.supplierLabel}
          data-testid="supplier-showcase-supplier-filter"
          className={cn(TOUCH_TARGET, FIELD_TEXT)}
          onChange={(event) => handleChange({ ...draft, supplierSearch: event.target.value })}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        className={TOUCH_TARGET}
        data-testid="supplier-showcase-filters-clear"
        onClick={handleClear}
      >
        {SHOWCASE_FILTERS_TEXTS.clear}
      </Button>
    </div>
  );
}
