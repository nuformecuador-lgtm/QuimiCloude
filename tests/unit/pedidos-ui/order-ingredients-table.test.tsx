// El componente es puramente presentacional (lineas, unidades y estado de la consulta llegan
// por props), asi que se prueba montandolo directo, sin `OrderForm` alrededor.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ORDER_INGREDIENTS_EMPTY_TESTID,
  ORDER_INGREDIENTS_ERROR_TESTID,
  ORDER_INGREDIENTS_TABLE_TESTID,
  OrderIngredientsTable,
} from '@/app/(private)/pedidos/components';
import type { RecipeLineView } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';

const UNIDADES: readonly UnitView[] = [
  { id: 'u-litro', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
];

const LINEA: RecipeLineView = {
  id: 'linea-1',
  productId: 'producto-1',
  productName: 'Hipoclorito',
  percentage: '10.00',
  productUnitId: 'u-litro',
  productStock: 15,
};

afterEach(() => {
  cleanup();
});

function renderTabla(overrides: {
  lines?: readonly RecipeLineView[];
  quantity?: string;
  loading?: boolean;
  error?: string | null;
} = {}) {
  return render(
    <OrderIngredientsTable
      lines={overrides.lines ?? [LINEA]}
      units={UNIDADES}
      quantity={overrides.quantity ?? '200'}
      loading={overrides.loading ?? false}
      error={overrides.error ?? null}
    />,
  );
}

describe('R25 — el porcentaje se pinta con coma y dos decimales', () => {
  it('una linea al 10 % se lee «10,00 %»', () => {
    renderTabla();

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-percentage')).toHaveTextContent('10,00 %');
  });
});

describe('R17 — la cantidad requerida y el restante escalan con la cantidad del pedido', () => {
  it('pedido 200 y linea al 10 % en L con existencia 15: unidad L, requerida 20, restante -5 resaltado', () => {
    renderTabla({ quantity: '200' });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-unit')).toHaveTextContent('L');
    expect(within(tabla).getByTestId('order-ingredient-stock')).toHaveTextContent('15');
    expect(within(tabla).getByTestId('order-ingredient-required')).toHaveTextContent('20');

    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    expect(restante).toHaveTextContent('-5');
    expect(restante.firstElementChild).toHaveClass('text-destructive');
  });

  it('sin cantidad escrita, la requerida es 0', () => {
    renderTabla({ quantity: '' });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-required')).toHaveTextContent('0');
  });
});

describe('R24 — un insumo sin unidad resoluble se muestra sin unidad', () => {
  it('con `productUnitId: null` se pinta el marcador, y el porcentaje y la requerida se siguen mostrando', () => {
    const linea: RecipeLineView = { ...LINEA, productUnitId: null, productStock: null };
    renderTabla({ lines: [linea], quantity: '200' });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-unit')).toHaveTextContent('—');
    expect(within(tabla).getByTestId('order-ingredient-percentage')).toHaveTextContent('10,00 %');
    expect(within(tabla).getByTestId('order-ingredient-required')).toHaveTextContent('20');
    // Sin stock (insumo sin unidad tampoco tiene existencia resuelta), el restante es el marcador.
    expect(within(tabla).getByTestId('order-ingredient-remaining')).toHaveTextContent('—');
  });
});

describe('otros estados de la tabla, sin cambios por esta ficha', () => {
  it('un producto de baja se dice «Producto no disponible»', () => {
    renderTabla({ lines: [{ ...LINEA, productName: null }] });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-product')).toHaveTextContent(
      'Producto no disponible',
    );
  });

  it('una receta sin ingredientes se dice, no se pinta una tabla vacia', () => {
    renderTabla({ lines: [] });

    expect(screen.getByTestId(ORDER_INGREDIENTS_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_INGREDIENTS_TABLE_TESTID)).toBeNull();
  });

  it('un fallo de la consulta se pinta como alerta, sin tabla', () => {
    renderTabla({ error: 'No se pudo cargar la receta.' });

    expect(screen.getByTestId(ORDER_INGREDIENTS_ERROR_TESTID)).toHaveTextContent(
      'No se pudo cargar la receta.',
    );
    expect(screen.queryByTestId(ORDER_INGREDIENTS_TABLE_TESTID)).toBeNull();
  });
});
