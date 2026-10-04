import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_EXECUTION_TOOL_QUANTITY_TESTID,
  ORDER_EXECUTION_TOOL_TESTID,
  ORDER_EXECUTION_TOOLS_TESTID,
  OrderExecutionScreen,
  OrderExecutionTools,
  TOOL_NAME_FALLBACK,
} from '@/app/(private)/asignacion/[id]/components';
import type { AssignedOrderExecutionView, ExecutionToolView } from '@/lib/modules/asignaciones';

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-execution-actions', () => ({
  finishAssignedOrderAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

const TOOLS: readonly ExecutionToolView[] = [
  { productName: 'Agitador', quantity: 2 },
  { productName: 'Balanza', quantity: 1 },
];

function execution(tools: readonly ExecutionToolView[], orderQuantity = '250'): AssignedOrderExecutionView {
  return {
    orderId: 'order-1',
    numberText: 'PED-0007',
    status: 'EN_CURSO',
    recipeName: 'Barniz acrílico',
    orderQuantity,
    steps: [{ blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] }],
    lines: [],
    tools,
    presentationLines: [],
    unitId: null,
    unitLabel: null,
  };
}

describe('bloque de herramientas del operador', () => {
  it('R28 — pinta cada herramienta con su nombre y su cantidad', () => {
    render(<OrderExecutionTools tools={TOOLS} />);

    const block = screen.getByTestId(ORDER_EXECUTION_TOOLS_TESTID);
    expect(within(block).getByRole('heading', { name: 'Herramientas' })).toBeInTheDocument();
    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_TESTID}-0`)).toHaveTextContent('Agitador');
    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_QUANTITY_TESTID}-0`)).toHaveTextContent('2');
    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_TESTID}-1`)).toHaveTextContent('Balanza');
    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_QUANTITY_TESTID}-1`)).toHaveTextContent('1');
  });

  it('R28 — es de solo lectura: ni botones, ni enlaces, ni campos', () => {
    render(<OrderExecutionTools tools={TOOLS} />);

    const block = screen.getByTestId(ORDER_EXECUTION_TOOLS_TESTID);
    expect(within(block).queryAllByRole('button')).toHaveLength(0);
    expect(within(block).queryAllByRole('link')).toHaveLength(0);
    expect(within(block).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(block).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(within(block).queryAllByRole('combobox')).toHaveLength(0);
  });

  it('R30 — la de baja se lee «Herramienta no disponible» con su cantidad', () => {
    render(<OrderExecutionTools tools={[{ productName: null, quantity: 3 }]} />);

    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_TESTID}-0`)).toHaveTextContent(TOOL_NAME_FALLBACK);
    expect(TOOL_NAME_FALLBACK).toBe('Herramienta no disponible');
    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_QUANTITY_TESTID}-0`)).toHaveTextContent('3');
  });

  it('R31 — sin herramientas el bloque no está en el DOM', () => {
    const { container } = render(<OrderExecutionTools tools={[]} />);

    expect(screen.queryByTestId(ORDER_EXECUTION_TOOLS_TESTID)).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('R33 — el texto del bloque va a 16 px', () => {
    render(<OrderExecutionTools tools={TOOLS} />);

    expect(screen.getByText('Agitador')).toHaveClass('text-base');
    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_QUANTITY_TESTID}-0`)).toHaveClass('text-base');
  });
});

describe('bloque de herramientas dentro de la pantalla del operador', () => {
  it('R28 — la pantalla monta el bloque con las herramientas de la vista', () => {
    render(<OrderExecutionScreen execution={execution(TOOLS)} />);

    expect(screen.getByTestId(ORDER_EXECUTION_TOOLS_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_TESTID}-0`)).toHaveTextContent('Agitador');
  });

  it('R29 — la cantidad pintada es la de la receta, sea cual sea la del pedido', () => {
    const { unmount } = render(<OrderExecutionScreen execution={execution(TOOLS, '250')} />);
    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_QUANTITY_TESTID}-0`)).toHaveTextContent('2');
    unmount();

    render(<OrderExecutionScreen execution={execution(TOOLS, '9000')} />);
    expect(screen.getByTestId(`${ORDER_EXECUTION_TOOL_QUANTITY_TESTID}-0`)).toHaveTextContent('2');
  });

  it('R31 — la pantalla sin herramientas no monta el bloque', () => {
    render(<OrderExecutionScreen execution={execution([])} />);

    expect(screen.queryByTestId(ORDER_EXECUTION_TOOLS_TESTID)).toBeNull();
  });
});
