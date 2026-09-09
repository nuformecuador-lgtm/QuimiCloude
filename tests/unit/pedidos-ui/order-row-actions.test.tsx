// QC-35 T8 — Las acciones de fila y los estados finales: R23, R24, R43, R45.
//
// **Los dobles FALLAN si se les llama.** Las seis Server Actions de `pedidos` y los tres
// callbacks de enganche estan sustituidos por funciones que lanzan: asi «no se invoca ninguna
// operacion» se comprueba de verdad, en vez de mirar un contador que un fallo silencioso podria
// dejar a cero por otra razon.
//
// **Ningun assert sobre copy** (R44): los controles se localizan por `data-testid` y por su rol
// accesible, y el motivo visible se afirma por identificador, no por su texto.

import { cleanup, render, screen } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FINAL_ORDER_REASON,
  OrderRowActions,
  isFinalOrderStatus,
} from '@/app/(private)/pedidos/components';
import {
  ORDER_STATUS_VALUES,
  formatOrderNumber,
  type OrderStatus,
  type OrderSummary,
} from '@/lib/modules/pedidos';

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde las acciones de fila`);
  };
  return {
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
  };
});

function pedido(status: OrderStatus, overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: '22222222-2222-4222-8222-222222222222',
    recipeName: 'Esmalte azul',
    quantity: '12.5000',
    priority: 'MEDIA',
    status,
    cancellationReason: status === 'CANCELADO' ? 'Cliente anuló el encargo' : null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

/** Los tres callbacks de enganche, como dobles que FALLAN si alguien los llama. */
function enganchesQueFallan() {
  return {
    onEdit: vi.fn(() => {
      throw new Error('no se debe abrir la edicion de un pedido cerrado');
    }),
    onCancel: vi.fn(() => {
      throw new Error('no se debe abrir la cancelacion de un pedido cerrado');
    }),
    onDelete: vi.fn(() => {
      throw new Error('no se debe abrir el borrado de un pedido cerrado');
    }),
  };
}

const CONTROLES = ['order-action-edit', 'order-action-cancel', 'order-action-delete'] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('las tres acciones estan SIEMPRE visibles (R23, R45)', () => {
  it('editar, cancelar y borrar existen en el DOM sin ninguna interaccion previa', () => {
    render(<OrderRowActions order={pedido('PENDIENTE')} />);

    for (const testId of CONTROLES) {
      const control = screen.getByTestId(testId);
      expect(control).toBeVisible();
      // Identificable por su rol accesible, no por el texto de un icono (R44).
      expect(control).toHaveAccessibleName();
      // Area tactil de al menos 44x44 px: nada que dependa del puntero fino.
      expect(control.className).toContain('min-h-11');
      expect(control.className).toContain('min-w-11');
    }
  });

  it('ninguna accion se descubre con `:hover`: no hay clase de visibilidad condicionada al puntero', () => {
    const { container } = render(<OrderRowActions order={pedido('PENDIENTE')} />);

    expect(container.innerHTML).not.toContain('group-hover');
    expect(container.innerHTML).not.toContain('hover:opacity');
    expect(container.innerHTML).not.toContain('invisible');
  });

  it('con el pedido abierto, pulsar una accion emite su enganche con la fila recibida por props (R43)', async () => {
    const user = setupUser();
    const onEdit = vi.fn();
    render(<OrderRowActions order={pedido('EN_CURSO')} onEdit={onEdit} />);

    await user.click(screen.getByTestId('order-action-edit'));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(pedido('EN_CURSO'));
  });
});

describe('con el pedido en estado final las tres acciones estan deshabilitadas (R24)', () => {
  it.each(['ENTREGADO', 'CANCELADO'] as const)(
    'con un pedido %s: los tres controles `disabled`, el motivo visible y ninguna operacion invocada',
    async (status) => {
      const user = setupUser();
      const enganches = enganchesQueFallan();
      render(<OrderRowActions order={pedido(status)} {...enganches} />);

      for (const testId of CONTROLES) {
        expect(screen.getByTestId(testId)).toBeDisabled();
      }

      // El motivo se PINTA y se localiza por `data-testid`: `title` no existe en tactil.
      const motivo = screen.getByTestId('order-row-actions-reason');
      expect(motivo).toBeVisible();
      expect(motivo).toHaveTextContent(FINAL_ORDER_REASON);

      // Pulsar no abre nada: los dobles lanzarian si se les llamara.
      for (const testId of CONTROLES) {
        await user.click(screen.getByTestId(testId));
      }
      expect(enganches.onEdit).not.toHaveBeenCalled();
      expect(enganches.onCancel).not.toHaveBeenCalled();
      expect(enganches.onDelete).not.toHaveBeenCalled();
    },
  );

  it.each(['PENDIENTE', 'EN_CURSO'] as const)(
    'con un pedido %s no hay motivo de bloqueo y los tres controles estan habilitados',
    (status) => {
      render(<OrderRowActions order={pedido(status)} />);

      for (const testId of CONTROLES) {
        expect(screen.getByTestId(testId)).toBeEnabled();
      }
      expect(screen.queryByTestId('order-row-actions-reason')).toBeNull();
    },
  );
});

describe('el predicado de estado final es UNO solo y sale del contrato (R24)', () => {
  it('exactamente `ENTREGADO` y `CANCELADO` de los valores que publica `pedidos`', () => {
    const finales = ORDER_STATUS_VALUES.filter((status) => isFinalOrderStatus(status));

    expect(finales).toEqual(['ENTREGADO', 'CANCELADO']);
  });
});
