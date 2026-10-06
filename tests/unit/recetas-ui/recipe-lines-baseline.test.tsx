import { cleanup, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import {
  RecipeLinesField,
  type RecipeLineFormValue,
} from '@/app/(private)/produccion/formulas/components';
import type { RecipeLineView } from '@/lib/modules/recetas';

const { listProductsActionMock } = vi.hoisted(() => ({ listProductsActionMock: vi.fn() }));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const EMPTY_PAGE = { items: [], totalPages: 1 };

function originalLine(
  key: string,
  percentage: string,
  productName: string | null = `Producto ${key}`,
): RecipeLineView {
  return {
    id: `line-${key}`,
    productId: `product-${key}`,
    productName,
    percentage,
    productUnitId: null,
    productStock: null,
  };
}

function lineValue(key: string, percentage: string): RecipeLineFormValue {
  return {
    key,
    productId: `product-${key}`,
    productName: `Producto ${key}`,
    percentage,
    productUnitId: null,
  };
}

function Harness({
  initialLines,
  baseline,
}: {
  initialLines: readonly RecipeLineFormValue[];
  baseline?: readonly RecipeLineView[];
}) {
  const [lines, setLines] = useState(initialLines);
  return (
    <RecipeLinesField
      lines={lines}
      onChange={setLines}
      units={[]}
      initialProductPage={EMPTY_PAGE}
      tools={[]}
      onToolsChange={() => {}}
      initialMachinePage={EMPTY_PAGE}
      baseline={baseline}
    />
  );
}

const BASELINE: readonly RecipeLineView[] = [
  originalLine('a', '50.00'),
  originalLine('b', '30.00'),
  originalLine('c', '20.00'),
  originalLine('d', '0.00', null),
];

describe('RecipeLinesField con la original como referencia', () => {
  it('R17 — sin baseline no pinta ninguna marca ni el bloque de quitados', () => {
    render(<Harness initialLines={[lineValue('a', '50'), lineValue('x', '10')]} />);

    expect(screen.queryByTestId('recipe-line-mark-0')).toBeNull();
    expect(screen.queryByTestId('recipe-line-mark-1')).toBeNull();
    expect(document.querySelector('[data-mark]')).toBeNull();
    expect(screen.queryByTestId('recipe-lines-removed')).toBeNull();
    expect(screen.queryByText('Quitados de la original')).toBeNull();
  });

  it('R17 — cada línea lleva su marca y la cambiada muestra el % de la original', () => {
    render(
      <Harness
        baseline={BASELINE}
        initialLines={[lineValue('a', '50'), lineValue('b', '25,5'), lineValue('x', '10')]}
      />,
    );

    const same = screen.getByTestId('recipe-line-mark-0');
    expect(same).toHaveAttribute('data-mark', 'same');
    expect(same).toHaveTextContent('Igual');

    const changed = screen.getByTestId('recipe-line-mark-1');
    expect(changed).toHaveAttribute('data-mark', 'changed');
    expect(changed).toHaveTextContent('Cambiado');
    expect(screen.getByTestId('recipe-line-original-1')).toHaveTextContent('Original: 30,00 %');

    const added = screen.getByTestId('recipe-line-mark-2');
    expect(added).toHaveAttribute('data-mark', 'added');
    expect(added).toHaveTextContent('Añadido');

    expect(screen.queryByTestId('recipe-line-original-0')).toBeNull();
    expect(screen.queryByTestId('recipe-line-original-2')).toBeNull();
  });

  it('R17 — la fila en blanco sin ingrediente no lleva marca', () => {
    render(<Harness baseline={BASELINE} initialLines={[]} />);

    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(1);
    expect(screen.queryByTestId('recipe-line-mark-0')).toBeNull();
  });

  it('R18, R11 — los quitados se listan fuera de las filas y la suma no los cuenta', () => {
    render(<Harness baseline={BASELINE} initialLines={[lineValue('a', '50')]} />);

    const removed = screen.getByTestId('recipe-lines-removed');
    expect(removed).toHaveTextContent('Quitados de la original');
    for (const row of screen.getAllByTestId('recipe-line-row')) {
      expect(row).not.toContainElement(removed);
      expect(removed).not.toContainElement(row);
    }

    const first = within(removed).getByTestId('recipe-line-removed-0');
    expect(first).toHaveTextContent('Producto b');
    expect(first).toHaveTextContent('30,00 %');
    expect(within(removed).getByTestId('recipe-line-removed-1')).toHaveTextContent('Producto c');
    const unavailable = within(removed).getByTestId('recipe-line-removed-2');
    expect(unavailable).toHaveTextContent('Ingrediente no disponible');
    expect(unavailable).toHaveTextContent('0,00 %');

    expect(screen.getByTestId('recipe-lines-sum')).toHaveTextContent(
      'Suma: 50,00 % — faltan 50,00 %',
    );
  });

  it('R19 — teclear un % cambia la marca en el mismo render', async () => {
    const user = setupUser();
    render(<Harness baseline={BASELINE} initialLines={[lineValue('a', '')]} />);

    expect(screen.getByTestId('recipe-line-mark-0')).toHaveAttribute('data-mark', 'changed');

    await user.type(screen.getByTestId('recipe-line-percentage-0'), '50');
    expect(screen.getByTestId('recipe-line-mark-0')).toHaveAttribute('data-mark', 'same');
    expect(screen.queryByTestId('recipe-line-original-0')).toBeNull();

    await user.type(screen.getByTestId('recipe-line-percentage-0'), ',5');
    expect(screen.getByTestId('recipe-line-mark-0')).toHaveAttribute('data-mark', 'changed');
    expect(screen.getByTestId('recipe-line-original-0')).toHaveTextContent('Original: 50,00 %');
  });

  it('R19, R18 — quitar una línea la pasa a quitados y recalcula las marcas', async () => {
    const user = setupUser();
    render(
      <Harness
        baseline={[originalLine('a', '50.00'), originalLine('b', '50.00')]}
        initialLines={[lineValue('a', '50'), lineValue('b', '50')]}
      />,
    );

    expect(screen.queryByTestId('recipe-lines-removed')).toBeNull();

    await user.click(screen.getByTestId('recipe-line-remove-0'));

    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(1);
    expect(screen.getByTestId('recipe-line-mark-0')).toHaveAttribute('data-mark', 'same');
    expect(screen.queryByTestId('recipe-line-mark-1')).toBeNull();
    const removed = screen.getByTestId('recipe-lines-removed');
    expect(within(removed).getByTestId('recipe-line-removed-0')).toHaveTextContent('Producto a');
    expect(screen.getByTestId('recipe-lines-sum')).toHaveTextContent(
      'Suma: 50,00 % — faltan 50,00 %',
    );
  });
});
