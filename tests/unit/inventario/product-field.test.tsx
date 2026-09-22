import { cleanup, render, screen } from '@testing-library/react';

import { ProductField, ProductForm } from '@/app/(private)/inventario/components';
import { Sheet } from '@/components/ui/sheet';
import type { ProductView } from '@/lib/modules/inventario';

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn().mockResolvedValue({ status: 'success', data: [] }),
  createPresentationAction: vi.fn(),
}));

function producto(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: crypto.randomUUID(),
    name: 'Hidróxido de sodio',
    imagePath: null,
    stock: 0,
    unitId: null,
    qtyAlert: 5,
    type: 'PRODUCT' as const,
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Objetivo tactil del disparador de ayuda de `ProductField` (QC-90, correccion M1).
 *
 * **Por que un archivo propio y no `product-page.test.tsx`**: alli ya vive el caso funcional de la
 * ayuda -`type="button"`, nombre accesible y que el texto no este hasta que se pide-, pero cada
 * caso de ese archivo monta la pantalla entera, abre el panel y espera al formulario. Lo que se
 * afirma aqui es una propiedad del COMPONENTE, no de la pantalla: se comprueba montandolo solo, en
 * milisegundos y sin mocks de Server Actions, que es ademas como se prueban los otros dos
 * disparadores compartidos del repo (`data-table-header-menu`, `data-table-filter-date`). De paso,
 * no se toca un archivo de 36 casos para anadir dos `expect`.
 *
 * `docs/architecture.md > Componentes > Regla: multiplataforma` pide 44x44 px como minimo, y el
 * `design.md` de QC-90 no declara ninguna excepcion de escritorio.
 */

afterEach(() => {
  cleanup();
});

describe('ProductField · disparador de la ayuda', () => {
  it('el disparador cumple el objetivo tactil minimo', () => {
    render(
      <ProductField
        name="stock"
        label="Existencia"
        type="number"
        defaultValue="0"
        helper="Se guarda tal cual."
      />,
    );

    const ayuda = screen.getByTestId('product-helper-stock');
    expect(ayuda).toHaveClass('min-h-11');
    expect(ayuda).toHaveClass('min-w-11');
    // Lo que crece es el blanco de toque del boton; el icono dibujado sigue siendo pequeno.
    expect(ayuda).not.toHaveClass('size-6');
  });

  it('sin `helper` no hay disparador que medir', () => {
    render(<ProductField name="name" label="Nombre" type="text" defaultValue="" />);

    expect(screen.queryByTestId('product-helper-name')).toBeNull();
  });
});

describe('ProductForm · campo de existencia', () => {
  it('R9, R10 — el alta pide la existencia del lote y la edicion no la muestra', () => {
    const { unmount } = render(
      <Sheet open>
        <ProductForm onSaved={() => {}} />
      </Sheet>,
    );
    expect(screen.getByTestId('product-field-stock')).toBeInTheDocument();
    unmount();

    render(
      <Sheet open>
        <ProductForm product={producto()} onSaved={() => {}} />
      </Sheet>,
    );
    expect(screen.queryByTestId('product-field-stock')).toBeNull();
  });
});
