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
import { formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';
import type { RecipeLineView } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';

const UNIDADES: readonly UnitView[] = [
  { id: 'u-litro', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
  { id: 'u-kilo', name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null, isSystem: true },
  { id: 'u-gramo', name: 'Gramo', symbol: 'g', baseUnitId: null, factor: null, isSystem: true },
  { id: 'u-unidad', name: 'Unidad', symbol: null, baseUnitId: null, factor: null, isSystem: false },
];

const LINEA: RecipeLineView = {
  id: 'linea-1',
  productId: 'producto-1',
  productName: 'Hipoclorito',
  percentage: '10.00',
  productUnitId: 'u-litro',
  productStock: '15.0000',
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
  it('pedido 200 y linea al 10 % en L con existencia 15: requerida 20 L, restante -5 L resaltado', () => {
    renderTabla({ quantity: '200' });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-stock').textContent).toBe(
      `${formatDecimalDisplay(LINEA.productStock ?? '')} L`,
    );
    const requerida = within(tabla).getByTestId('order-ingredient-required');
    expect(requerida.textContent).toBe('20 L');
    expect(requerida).toHaveAttribute('aria-label', '20 L');

    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    expect(restante).toHaveTextContent('-5 L');
    expect(restante.firstElementChild).toHaveClass('text-destructive');
  });

  it('sin cantidad escrita, la requerida es 0', () => {
    renderTabla({ quantity: '' });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-required')).toHaveTextContent('0');
  });

  it.each([
    ['negativa', '-200'],
    ['cero', '0'],
    ['no numerica', 'abc'],
  ])('con una cantidad %s, la requerida no se calcula y queda en 0', (_caso, cantidad) => {
    renderTabla({ quantity: cantidad });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-required')).toHaveTextContent('0');
  });
});

describe('R24 — un insumo sin unidad resoluble se muestra sin unidad', () => {
  it('con `productUnitId: null`, el porcentaje y la requerida se siguen mostrando', () => {
    const linea: RecipeLineView = { ...LINEA, productUnitId: null, productStock: null };
    renderTabla({ lines: [linea], quantity: '200' });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-percentage')).toHaveTextContent('10,00 %');
    expect(within(tabla).getByTestId('order-ingredient-required').textContent).toBe('20');
    // Sin stock (insumo sin unidad tampoco tiene existencia resuelta), el restante es el marcador.
    expect(within(tabla).getByTestId('order-ingredient-remaining')).toHaveTextContent('—');
  });
});

describe('la unidad del producto va pegada a la cifra de stock y restante', () => {
  it('no hay columna «Unidad» propia', () => {
    renderTabla();

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).queryByTestId('order-ingredient-unit')).toBeNull();
    expect(within(tabla).queryByRole('columnheader', { name: 'Unidad' })).toBeNull();
  });

  it.each([
    ['L', 'u-litro'],
    ['kg', 'u-kilo'],
    ['g', 'u-gramo'],
  ])('stock 720 en %s se lee «720 %s», tambien en el restante y en su aria-label', (simbolo, unitId) => {
    renderTabla({ lines: [{ ...LINEA, productUnitId: unitId, productStock: '720.0000' }], quantity: '' });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    const stock = within(tabla).getByTestId('order-ingredient-stock');
    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    expect(stock.textContent).toBe(`720 ${simbolo}`);
    expect(stock).toHaveAttribute('aria-label', `720 ${simbolo}`);
    expect(restante.textContent).toBe(`720 ${simbolo}`);
    expect(restante).toHaveAttribute('aria-label', `720 ${simbolo}`);
  });

  it('sin simbolo se usa el nombre de la unidad', () => {
    renderTabla({ lines: [{ ...LINEA, productUnitId: 'u-unidad', productStock: '720.0000' }], quantity: '' });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-stock').textContent).toBe('720 Unidad');
  });

  it.each([
    ['sin `productUnitId`', null],
    ['con un id que no esta en el catalogo', 'u-inexistente'],
  ])('%s se pinta solo la cifra, sin marcador pegado', (_caso, unitId) => {
    renderTabla({ lines: [{ ...LINEA, productUnitId: unitId, productStock: '720.0000' }], quantity: '' });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    const stock = within(tabla).getByTestId('order-ingredient-stock');
    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    expect(stock.textContent).toBe('720');
    expect(stock).toHaveAttribute('aria-label', '720');
    expect(restante.textContent).toBe('720');
    expect(restante).toHaveAttribute('aria-label', '720');
  });

  it('sin stock se pinta solo el marcador, aunque la unidad se resuelva', () => {
    renderTabla({ lines: [{ ...LINEA, productStock: null }] });

    const tabla = screen.getByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-stock').textContent).toBe('—');
    expect(within(tabla).getByTestId('order-ingredient-remaining').textContent).toBe('—');
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
