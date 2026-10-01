import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { OrderDistributionLabel } from '@/components/shared/order-distribution-label';

afterEach(() => {
  cleanup();
});

describe('OrderDistributionLabel', () => {
  it('R26: con una sola linea pinta «envases × nombre» sin «+0»', () => {
    render(<OrderDistributionLabel lines={[{ presentationName: 'Botella 200 ml', packages: 5 }]} />);

    const label = screen.getByTestId('order-distribution');
    expect(label.textContent).toBe('5 × Botella 200 ml');
    expect(label).not.toHaveAttribute('data-empty');
  });

  it('R26: con varias lineas pinta la primera y «+N» con el resto; el title las lista todas', () => {
    render(
      <OrderDistributionLabel
        lines={[
          { presentationName: 'Botella 200 ml', packages: 5 },
          { presentationName: 'Bidón 20L', packages: 2 },
          { presentationName: 'Caja x 12', packages: 1 },
        ]}
      />,
    );

    const label = screen.getByTestId('order-distribution');
    expect(label.textContent).toBe('5 × Botella 200 ml +2');
    expect(label).toHaveAttribute('title', '5 × Botella 200 ml, 2 × Bidón 20L, 1 × Caja x 12');
  });

  it('R27: con el reparto vacio pinta «Sin presentación»', () => {
    render(<OrderDistributionLabel lines={[]} />);

    const label = screen.getByTestId('order-distribution');
    expect(label.textContent).toBe('Sin presentación');
    expect(label).toHaveAttribute('data-empty', 'true');
  });

  it('una linea cuyo nombre no se pudo resolver lleva el marcador de ausencia, no el id', () => {
    render(<OrderDistributionLabel lines={[{ presentationName: null, packages: 3 }]} />);

    expect(screen.getByTestId('order-distribution').textContent).toBe('3 × —');
  });
});
