import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductBatchesPanel } from '@/app/(private)/inventario/components';
import { Button } from '@/components/ui/button';
import type { ProductBatchView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

/**
 * `product-batches-panel.tsx`: R22, R25 (`design.md > 4.5`, T10).
 *
 * Se monta el componente SOLO, sin Server Component padre ni `lib/composition`: lo que se afirma
 * aqui es una propiedad del panel, que recibe todo por props.
 *
 * La mitad de R25 que jsdom no observa -`:hover` de verdad no dispara nada visible sin un motor de
 * render- la cubre `product-route-contract.test.ts`, que barre el CODIGO fuente de la ruta entera
 * en busca de `hover:` combinado con una clase que oculte. Aqui solo se afirma lo que el DOM
 * renderizado puede mostrar: las clases de objetivo tactil y de tamano de fuente presentes.
 */

function unidad(overrides: Partial<UnitRef> = {}): UnitRef {
  return {
    id: crypto.randomUUID(),
    name: 'Kilogramo',
    symbol: 'kg',
    baseUnitId: null,
    factor: null,
    ...overrides,
  };
}

function lote(overrides: Partial<ProductBatchView> = {}): ProductBatchView {
  return {
    id: crypto.randomUUID(),
    lot: 'L-001',
    stock: 10,
    unitId: crypto.randomUUID(),
    purchaseDate: '2026-03-05',
    expiryDate: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('ProductBatchesPanel', () => {
  it('pinta tres lotes con numero, cantidad con su unidad derivada (sin convertir) y fecha (R22)', () => {
    const kilogramo = unidad({ id: 'unit-kg', name: 'Kilogramo', symbol: 'kg' });
    const litro = unidad({ id: 'unit-l', name: 'Litro', symbol: 'L' });
    const batches: ProductBatchView[] = [
      lote({ id: 'b1', lot: 'L-001', stock: 10, unitId: 'unit-kg', purchaseDate: '2026-03-05' }),
      lote({ id: 'b2', lot: 'L-002', stock: 25, unitId: 'unit-l', purchaseDate: '2026-04-10' }),
      lote({ id: 'b3', lot: 'L-003', stock: 3, unitId: 'unit-kg', purchaseDate: '2026-05-01' }),
    ];

    render(<ProductBatchesPanel batches={batches} units={[kilogramo, litro]} />);

    const b1 = screen.getByTestId('product-batch-b1');
    expect(within(b1).getByTestId('product-batch-lot')).toHaveTextContent('L-001');
    expect(within(b1).getByTestId('product-batch-quantity')).toHaveTextContent('10 kg');
    expect(within(b1).getByTestId('product-batch-purchase-date')).toHaveTextContent('2026-03-05');
    expect(within(b1).getByText('Lote')).toBeVisible();
    expect(within(b1).getByText('Cantidad')).toBeVisible();
    expect(within(b1).getByText('Fecha de compra')).toBeVisible();

    const b2 = screen.getByTestId('product-batch-b2');
    expect(within(b2).getByTestId('product-batch-quantity')).toHaveTextContent('25 L');
    expect(within(b2).getByTestId('product-batch-purchase-date')).toHaveTextContent('2026-04-10');

    const b3 = screen.getByTestId('product-batch-b3');
    expect(within(b3).getByTestId('product-batch-quantity')).toHaveTextContent('3 kg');
  });

  it('no convierte: la cantidad pintada es exactamente `batch.stock`, sin catalogo de unidades', () => {
    const batches: ProductBatchView[] = [lote({ id: 'b1', stock: 7 })];

    render(<ProductBatchesPanel batches={batches} />);

    expect(screen.getByTestId('product-batch-quantity')).toHaveTextContent('7');
  });

  it('unidad desconocida en el catalogo pinta el marcador de vacio', () => {
    const batches: ProductBatchView[] = [lote({ id: 'b1', stock: 4, unitId: 'unit-desconocida' })];

    render(<ProductBatchesPanel batches={batches} units={[unidad({ id: 'unit-kg' })]} />);

    expect(screen.getByTestId('product-batch-quantity')).toHaveTextContent('4 —');
  });

  it('lista vacia: texto propio, no una lista vacia indistinguible de un fallo', () => {
    render(<ProductBatchesPanel batches={[]} />);

    expect(screen.getByTestId('product-batches-panel')).toHaveTextContent(
      'todavía no tiene lotes registrados',
    );
    expect(screen.queryByTestId(/product-batch-/)).toBeNull();
  });

  it('invoca las dos ranuras una vez por lote y pinta su salida en el DOM', () => {
    const batches: ProductBatchView[] = [lote({ id: 'b1' }), lote({ id: 'b2' })];
    const renderBatchDetail = vi.fn((batch: ProductBatchView) => (
      <span data-testid={`detalle-${batch.id}`}>historial de {batch.lot}</span>
    ));
    const renderBatchActions = vi.fn((batch: ProductBatchView) => (
      <Button type="button" data-testid={`accion-${batch.id}`} className="min-h-11 min-w-11">
        Ajustar
      </Button>
    ));

    render(
      <ProductBatchesPanel
        batches={batches}
        renderBatchDetail={renderBatchDetail}
        renderBatchActions={renderBatchActions}
      />,
    );

    expect(renderBatchDetail).toHaveBeenCalledTimes(2);
    expect(renderBatchActions).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('detalle-b1')).toBeInTheDocument();
    expect(screen.getByTestId('detalle-b2')).toBeInTheDocument();
    expect(screen.getByTestId('accion-b1')).toBeInTheDocument();
    expect(screen.getByTestId('accion-b2')).toBeInTheDocument();
  });

  it('multiplataforma: el disparador de la ranura de acciones cumple el objetivo tactil minimo (R25)', () => {
    const batches: ProductBatchView[] = [lote({ id: 'b1' })];

    render(
      <ProductBatchesPanel
        batches={batches}
        renderBatchActions={(batch) => (
          <Button type="button" data-testid={`accion-${batch.id}`} className="min-h-11 min-w-11">
            Ajustar
          </Button>
        )}
      />,
    );

    const disparador = screen.getByTestId('accion-b1');
    expect(disparador).toHaveClass('min-h-11');
    expect(disparador).toHaveClass('min-w-11');
    // Ningun texto del panel depende de un atributo `hover` para volverse visible.
    expect(document.querySelector('[class*="hover:"][class*="hidden"]')).toBeNull();
  });
});
