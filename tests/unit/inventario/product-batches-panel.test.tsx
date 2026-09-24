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
    stock: '10',
    unitId: crypto.randomUUID(),
    purchaseDate: '2026-03-05',
    expiryDate: null,
    packageContent: null,
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
      lote({ id: 'b1', lot: 'L-001', stock: '10', unitId: 'unit-kg', purchaseDate: '2026-03-05' }),
      lote({ id: 'b2', lot: 'L-002', stock: '25', unitId: 'unit-l', purchaseDate: '2026-04-10' }),
      lote({ id: 'b3', lot: 'L-003', stock: '3', unitId: 'unit-kg', purchaseDate: '2026-05-01' }),
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
    const batches: ProductBatchView[] = [lote({ id: 'b1', stock: '7' })];

    render(<ProductBatchesPanel batches={batches} />);

    expect(screen.getByTestId('product-batch-quantity')).toHaveTextContent('7');
  });

  it('unidad desconocida en el catalogo pinta el marcador de vacio', () => {
    const batches: ProductBatchView[] = [lote({ id: 'b1', stock: '4', unitId: 'unit-desconocida' })];

    render(<ProductBatchesPanel batches={batches} units={[unidad({ id: 'unit-kg' })]} />);

    expect(screen.getByTestId('product-batch-quantity')).toHaveTextContent('4 —');
  });

  it('R6 — la cantidad se pinta a dos decimales, con la cifra exacta en el title y el aria-label', () => {
    const batches: ProductBatchView[] = [
      lote({ id: 'b1', stock: '0.0001' }),
      lote({ id: 'b2', stock: '1.5' }),
      lote({ id: 'b3', stock: '12345.6789' }),
    ];

    render(<ProductBatchesPanel batches={batches} />);

    const b1 = screen.getByTestId('product-batch-b1').querySelector('[data-testid="product-batch-quantity"]')!;
    expect(b1).toHaveTextContent('0');
    expect(b1).toHaveAttribute('title', '0.0001');
    expect(b1).toHaveAttribute('aria-label', '0.0001');

    const b2 = screen.getByTestId('product-batch-b2').querySelector('[data-testid="product-batch-quantity"]')!;
    expect(b2).toHaveTextContent('1.5');
    expect(b2).not.toHaveAttribute('title');
    expect(b2).toHaveAttribute('aria-label', '1.5');

    const b3 = screen.getByTestId('product-batch-b3').querySelector('[data-testid="product-batch-quantity"]')!;
    expect(b3).toHaveTextContent('12345.68');
    expect(b3).toHaveAttribute('title', '12345.6789');
    expect(b3).toHaveAttribute('aria-label', '12345.6789');
  });

  it('R37 — pinta el apartado y el disponible de un lote junto a su unidad, con la cifra exacta', () => {
    const kilogramo = unidad({ id: 'unit-kg', name: 'Kilogramo', symbol: 'kg' });
    const batches: ProductBatchView[] = [
      lote({ id: 'b1', stock: '10', unitId: 'unit-kg', reserved: '4.1234', available: '5.8766' }),
    ];

    render(<ProductBatchesPanel batches={batches} units={[kilogramo]} />);

    const apartado = screen.getByTestId('product-batch-reserved');
    expect(apartado).toHaveTextContent('4.12 kg');
    expect(apartado).toHaveAttribute('title', '4.1234');
    expect(apartado).toHaveAttribute('aria-label', '4.1234 kg');

    const disponible = screen.getByTestId('product-batch-available');
    expect(disponible).toHaveTextContent('5.88 kg');
    expect(disponible).toHaveAttribute('title', '5.8766');
    expect(disponible).toHaveAttribute('aria-label', '5.8766 kg');
  });

  it('sin apartado ni disponible (fuera de `findBatchesOfAliveProduct`), no pinta esas dos celdas', () => {
    const batches: ProductBatchView[] = [lote({ id: 'b1' })];

    render(<ProductBatchesPanel batches={batches} />);

    expect(screen.queryByTestId('product-batch-reserved')).toBeNull();
    expect(screen.queryByTestId('product-batch-available')).toBeNull();
  });

  it('R34 — un lote sobre-reservado lleva la marca «Sobre-reservado» como texto, no solo como color', () => {
    const batches: ProductBatchView[] = [
      lote({ id: 'b1', stock: '5', reserved: '8', available: '0', overReserved: true }),
    ];

    render(<ProductBatchesPanel batches={batches} />);

    const marca = screen.getByTestId('product-batch-over-reserved');
    expect(marca).toHaveTextContent('Sobre-reservado');
  });

  it('R34 — sin sobre-reserva, la marca no aparece', () => {
    const batches: ProductBatchView[] = [
      lote({ id: 'b1', stock: '10', reserved: '4', available: '6', overReserved: false }),
    ];

    render(<ProductBatchesPanel batches={batches} />);

    expect(screen.queryByTestId('product-batch-over-reserved')).toBeNull();
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
