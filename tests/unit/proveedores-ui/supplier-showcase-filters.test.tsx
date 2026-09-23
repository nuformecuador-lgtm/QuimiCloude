import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SEARCH_DEBOUNCE_MS } from '@/components/shared/data-table';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

const { routerMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

import { SupplierShowcaseFilters } from '@/app/(private)/proveedores/components/supplier-showcase-filters';
import { EMPTY_SHOWCASE_FILTERS } from '@/app/(private)/proveedores/components/supplier-showcase-params';

afterEach(() => {
  routerMock.replace.mockClear();
  vi.useRealTimers();
});

describe('SupplierShowcaseFilters: los dos campos y sus clases (R39)', () => {
  it('monta el campo de producto y el de proveedor', () => {
    render(<SupplierShowcaseFilters filters={EMPTY_SHOWCASE_FILTERS} />);

    expect(screen.getByTestId('supplier-showcase-product-filter')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-showcase-supplier-filter')).toBeInTheDocument();
  });

  it('los dos campos cumplen text-base (>=16px) y min-h-11', () => {
    render(<SupplierShowcaseFilters filters={EMPTY_SHOWCASE_FILTERS} />);

    for (const testId of ['supplier-showcase-product-filter', 'supplier-showcase-supplier-filter']) {
      const campo = screen.getByTestId(testId);
      expect(campo.className).toMatch(/text-base/);
      expect(campo.className).toMatch(/min-h-11/);
    }
  });

  it('el boton de limpiar cumple min-h-11', () => {
    render(<SupplierShowcaseFilters filters={EMPTY_SHOWCASE_FILTERS} />);

    expect(screen.getByTestId('supplier-showcase-filters-clear').className).toMatch(/min-h-11/);
  });

  it('el boton de limpiar no se esconde tras :hover: nada de opacity-0 ni hidden en su clase', () => {
    render(<SupplierShowcaseFilters filters={EMPTY_SHOWCASE_FILTERS} />);

    const limpiar = screen.getByTestId('supplier-showcase-filters-clear');
    expect(limpiar.className).not.toMatch(/\b(opacity-0|invisible|hidden)\b/);
  });
});

describe('SupplierShowcaseFilters: cambiar un filtro navega a la URL sin pagina (R25)', () => {
  it('escribir en el campo de producto navega con router.replace tras el rebote', async () => {
    vi.useFakeTimers();
    render(<SupplierShowcaseFilters filters={EMPTY_SHOWCASE_FILTERS} />);

    fireEvent.change(screen.getByTestId('supplier-showcase-product-filter'), {
      target: { value: 'acido' },
    });

    expect(routerMock.replace).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(routerMock.replace).toHaveBeenCalledTimes(1);
    const destino = routerMock.replace.mock.calls[0]?.[0] as string;
    expect(destino.startsWith(SUPPLIERS_ROUTE)).toBe(true);
    expect(destino).toContain('acido');
  });

  it('escribir en el campo de proveedor navega con router.replace tras el rebote', async () => {
    vi.useFakeTimers();
    render(<SupplierShowcaseFilters filters={EMPTY_SHOWCASE_FILTERS} />);

    fireEvent.change(screen.getByTestId('supplier-showcase-supplier-filter'), {
      target: { value: 'pacifico' },
    });

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(routerMock.replace).toHaveBeenCalledTimes(1);
    const destino = routerMock.replace.mock.calls[0]?.[0] as string;
    expect(destino).toContain('pacifico');
  });
});

describe('SupplierShowcaseFilters: limpiar vacia los dos filtros (R24)', () => {
  it('el boton de limpiar navega de inmediato a la ruta sin ningun filtro', () => {
    render(
      <SupplierShowcaseFilters filters={{ supplierSearch: 'quimicos', productSearch: 'sosa' }} />,
    );

    fireEvent.click(screen.getByTestId('supplier-showcase-filters-clear'));

    expect(routerMock.replace).toHaveBeenCalledWith(SUPPLIERS_ROUTE);
  });

  it('tras limpiar, los dos campos quedan vacios', () => {
    render(
      <SupplierShowcaseFilters filters={{ supplierSearch: 'quimicos', productSearch: 'sosa' }} />,
    );

    fireEvent.click(screen.getByTestId('supplier-showcase-filters-clear'));

    expect(screen.getByTestId('supplier-showcase-product-filter')).toHaveValue('');
    expect(screen.getByTestId('supplier-showcase-supplier-filter')).toHaveValue('');
  });
});
