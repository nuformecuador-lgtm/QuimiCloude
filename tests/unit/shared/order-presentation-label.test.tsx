import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { OrderPresentationLabel } from '@/components/shared/order-presentation-label';

afterEach(() => {
  cleanup();
});

describe('OrderPresentationLabel', () => {
  it('pinta el nombre de la presentación', () => {
    render(<OrderPresentationLabel name="Bidón 20L" />);

    const label = screen.getByTestId('order-presentation');
    expect(label).toHaveTextContent('Bidón 20L');
    expect(label).not.toHaveAttribute('data-missing');
  });

  it('pinta «Sin presentación» con data-missing cuando no hay nombre', () => {
    render(<OrderPresentationLabel name={null} />);

    const label = screen.getByTestId('order-presentation');
    expect(label).toHaveTextContent('Sin presentación');
    expect(label).toHaveAttribute('data-missing', 'true');
  });
});
