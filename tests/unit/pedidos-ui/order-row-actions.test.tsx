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

// El barrel de la ruta arrastra el formulario de edicion, que importa el selector de
// presentacion: se aisla igual que `order-actions` de aqui arriba.
vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(() => {
    throw new Error('listPresentationsAction no debe invocarse desde las acciones de fila');
  }),
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde las acciones de fila');
  }),
}));

function pedido(status: OrderStatus, overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: '22222222-2222-4222-8222-222222222222',
    recipeName: 'Esmalte azul',
    recipeVersion: null,
    quantity: '12.5000',
    priority: 'MEDIA',
    status,
    cancellationReason: status === 'CANCELADO' ? 'Cliente anuló el encargo' : null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [],
    unitId: null,
    unitLabel: null,
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

describe('con el pedido en estado final las tres acciones estan deshabilitadas (R24, R42)', () => {
  it.each(['ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE'] as const)(
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

describe('el predicado de estado final es UNO solo y sale del contrato (R24, R42)', () => {
  it('exactamente `ENTREGADO`, `CANCELADO`, `POR_EMPACAR` y `EN_EMPAQUE` de los valores que publica `pedidos`', () => {
    const finales = ORDER_STATUS_VALUES.filter((status) => isFinalOrderStatus(status));

    expect(finales).toEqual(['ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE']);
  });
});

// ---------------------------------------------------------------------------------------------
// QC-102 T13 — La CUARTA accion de la fila, «Responsables»: R24.
//
// Lo que este bloque protege es la asimetria deliberada de `design.md > 3.2`: las tres acciones
// de QC-35 mueren con el pedido cerrado porque lo MODIFICAN; esta solo abre el panel para VER, y
// QC-87 R13 permite consultar responsables en los cuatro estados. Si alguien "uniformara" la fila
// deshabilitando las cuatro, aqui se pone rojo.
// ---------------------------------------------------------------------------------------------

const RESPONSABLES_TESTID = 'order-action-responsibles';

describe('QC-102 — la entrada propia «Responsables» (R24)', () => {
  it('existe en la fila, visible, con nombre accesible y objetivo tactil de 44x44', () => {
    render(<OrderRowActions order={pedido('PENDIENTE')} />);

    const control = screen.getByTestId(RESPONSABLES_TESTID);
    expect(control).toBeVisible();
    expect(control).toHaveAccessibleName();
    expect(control.className).toContain('min-h-11');
    expect(control.className).toContain('min-w-11');
  });

  it('pulsarla emite su enganche con la fila: ver responsables NO exige abrir la edicion', async () => {
    const user = setupUser();
    const onResponsibles = vi.fn();
    const onEdit = vi.fn(() => {
      throw new Error('ver responsables no debe abrir el formulario de edicion');
    });
    render(
      <OrderRowActions
        order={pedido('EN_CURSO')}
        onEdit={onEdit}
        onResponsibles={onResponsibles}
      />,
    );

    await user.click(screen.getByTestId(RESPONSABLES_TESTID));

    expect(onResponsibles).toHaveBeenCalledTimes(1);
    expect(onResponsibles).toHaveBeenCalledWith(pedido('EN_CURSO'));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it.each(['ENTREGADO', 'CANCELADO'] as const)(
    'con un pedido %s sigue ACTIVA, mientras las otras tres siguen deshabilitadas y el motivo visible',
    async (status) => {
      const user = setupUser();
      const enganches = enganchesQueFallan();
      const onResponsibles = vi.fn();
      render(
        <OrderRowActions
          order={pedido(status)}
          {...enganches}
          onResponsibles={onResponsibles}
        />,
      );

      // Las tres de QC-35, intactas: `disabled` y con su motivo a la vista.
      for (const testId of CONTROLES) {
        expect(screen.getByTestId(testId)).toBeDisabled();
      }
      expect(screen.getByTestId('order-row-actions-reason')).toHaveTextContent(FINAL_ORDER_REASON);

      // Y la cuarta, viva: se puede pulsar y emite.
      const control = screen.getByTestId(RESPONSABLES_TESTID);
      expect(control).toBeEnabled();
      await user.click(control);
      expect(onResponsibles).toHaveBeenCalledTimes(1);

      // Sin haber abierto nada de lo que el pedido cerrado prohibe.
      expect(enganches.onEdit).not.toHaveBeenCalled();
      expect(enganches.onCancel).not.toHaveBeenCalled();
      expect(enganches.onDelete).not.toHaveBeenCalled();
    },
  );
});
