// QC-35 T8 — Las acciones de fila y los estados finales: R23, R24, R43, R45.
//
// **Migrado al menu "de los 3 puntos" por la misma decision humana puntual que ya migro
// `user-row-actions.tsx`** (ver el comentario de cabecera de `order-row-actions.tsx`): las
// cuatro acciones ya no son botones en linea, sino items de `RowActionsMenu` que aparecen al
// abrir su disparador. R45 se prueba ahora en DOS mitades: el disparador esta siempre presente y
// mide 44x44 px sin ninguna interaccion previa, y las cuatro acciones solo llegan al arbol tras
// abrirlo con un clic.
//
// **Los dobles FALLAN si se les llama.** Las seis Server Actions de `pedidos` y los tres
// callbacks de enganche estan sustituidos por funciones que lanzan: asi «no se invoca ninguna
// operacion» se comprueba de verdad, en vez de mirar un contador que un fallo silencioso podria
// dejar a cero por otra razon.
//
// **Items deshabilitados: `fireEvent.click` y no `user.click`.** `user-event` se niega a pinchar
// un elemento con `pointer-events: none` (la clase que trae `data-disabled`), que es justo la
// comprobacion visual que ya cubre `pedidos-viewport.test.tsx`. Aqui lo que se demuestra es la
// otra mitad: que aunque alguien dispare el evento nativo, el primitivo del menu no llega a
// invocar `onSelect`.
//
// **Ningun assert sobre copy** (R44): los controles se localizan por `data-testid` y por su rol
// accesible. Con el pedido en estado final no hay ningun texto de motivo que afirmar: las tres
// acciones simplemente quedan `aria-disabled` dentro del menu.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderRowActions, isFinalOrderStatus } from '@/app/(private)/pedidos/components';
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

/** Objetivo tactil minimo que exige R45: 44x44 px, que en Tailwind es `min-h-11 min-w-11`. */
const CLASES_TACTILES = ['min-h-11', 'min-w-11'] as const;

/** Abre el menu pulsando su disparador. Mismo patron que `user-row-actions.test.tsx`. */
function abrirMenu(): void {
  fireEvent.click(screen.getByTestId('order-row-actions'));
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
const RESPONSABLES_TESTID = 'order-action-responsibles';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('el disparador esta SIEMPRE en el DOM, sin ninguna accion detras hasta abrirlo (R23, R45)', () => {
  it('existe sin interaccion previa, mide al menos 44x44 px y ninguna accion esta aun en el arbol', () => {
    render(<OrderRowActions order={pedido('PENDIENTE')} />);

    const disparador = screen.getByTestId('order-row-actions');
    expect(disparador).toBeInTheDocument();
    for (const clase of CLASES_TACTILES) {
      expect(disparador.className, `disparador sin ${clase}`).toContain(clase);
    }

    for (const testId of [...CONTROLES, RESPONSABLES_TESTID]) {
      expect(screen.queryByTestId(testId)).toBeNull();
    }
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('no depende de `:hover`: nada en su clase condiciona la visibilidad al puntero', () => {
    render(<OrderRowActions order={pedido('PENDIENTE')} />);

    const disparador = screen.getByTestId('order-row-actions');
    expect(disparador.className).not.toContain('group-hover');
    expect(disparador.className).not.toContain('hover:opacity');
  });

  it('lleva el identificador de la fila como DATO, no como texto visible', () => {
    const elPedido = pedido('PENDIENTE');
    render(<OrderRowActions order={elPedido} />);

    const disparador = screen.getByTestId('order-row-actions');
    expect(disparador).toHaveAttribute('data-order-id', elPedido.id);
    expect(disparador.textContent).not.toContain(elPedido.id);
  });
});

describe('al abrir el disparador, el menu trae las CUATRO acciones y ninguna mas (R23, R41)', () => {
  it('editar, cancelar, borrar y responsables, las cuatro presentes y ninguna otra', async () => {
    render(<OrderRowActions order={pedido('PENDIENTE')} />);

    abrirMenu();

    expect(await screen.findByTestId('order-action-edit')).toBeInTheDocument();
    expect(screen.getByTestId('order-action-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('order-action-delete')).toBeInTheDocument();
    expect(screen.getByTestId(RESPONSABLES_TESTID)).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
  });

  // Decision humana puntual (2026-10-04): los items dicen solo el verbo; el numero queda en el
  // disparador.
  it('R41 — ningun item repite el numero del pedido', async () => {
    const elPedido = pedido('PENDIENTE');
    render(<OrderRowActions order={elPedido} />);

    abrirMenu();
    await screen.findByTestId('order-action-edit');

    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.textContent).not.toContain(elPedido.numberText);
    }
  });
});

describe('con el pedido abierto, pulsar una accion emite su enganche con la fila recibida por props (R43)', () => {
  it('editar', async () => {
    const onEdit = vi.fn();
    render(<OrderRowActions order={pedido('EN_CURSO')} onEdit={onEdit} />);

    abrirMenu();
    fireEvent.click(await screen.findByTestId('order-action-edit'));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(pedido('EN_CURSO'));
  });

  it('cancelar', async () => {
    const onCancel = vi.fn();
    render(<OrderRowActions order={pedido('EN_CURSO')} onCancel={onCancel} />);

    abrirMenu();
    fireEvent.click(await screen.findByTestId('order-action-cancel'));

    expect(onCancel).toHaveBeenCalledExactlyOnceWith(pedido('EN_CURSO'));
  });

  it('borrar', async () => {
    const onDelete = vi.fn();
    render(<OrderRowActions order={pedido('EN_CURSO')} onDelete={onDelete} />);

    abrirMenu();
    fireEvent.click(await screen.findByTestId('order-action-delete'));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(pedido('EN_CURSO'));
  });

  it('sin manejadores —el panel y los dialogos aun no existen— pulsar no rompe nada', async () => {
    render(<OrderRowActions order={pedido('EN_CURSO')} />);

    abrirMenu();
    fireEvent.click(await screen.findByTestId('order-action-edit'));

    expect(screen.getByTestId('order-row-actions')).toBeInTheDocument();
  });
});

describe('con el pedido en estado final las tres acciones estan deshabilitadas (R24, R42)', () => {
  it.each(['ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE'] as const)(
    'con un pedido %s: las tres marcadas `aria-disabled` y ninguna operacion invocada',
    async (status) => {
      const enganches = enganchesQueFallan();
      render(<OrderRowActions order={pedido(status)} {...enganches} />);

      abrirMenu();
      for (const testId of CONTROLES) {
        expect(await screen.findByTestId(testId)).toHaveAttribute('aria-disabled', 'true');
      }

      // El primitivo deja el item en el arbol pero bloquea su `onSelect`: se dispara el evento
      // nativo a mano (sin pasar por la comprobacion de `pointer-events` de `user-event`, que ya
      // cubre `pedidos-viewport.test.tsx`) y se confirma que ningun enganche llega a invocarse.
      for (const testId of CONTROLES) {
        fireEvent.click(screen.getByTestId(testId));
      }
      expect(enganches.onEdit).not.toHaveBeenCalled();
      expect(enganches.onCancel).not.toHaveBeenCalled();
      expect(enganches.onDelete).not.toHaveBeenCalled();
    },
  );

  it.each(['PENDIENTE', 'EN_CURSO'] as const)(
    'con un pedido %s las tres acciones no llevan `aria-disabled`',
    async (status) => {
      render(<OrderRowActions order={pedido(status)} />);

      abrirMenu();
      for (const testId of CONTROLES) {
        expect(await screen.findByTestId(testId)).not.toHaveAttribute('aria-disabled');
      }
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
// QC-102 T13 — La CUARTA accion del menu, «Responsables»: R24.
//
// Lo que este bloque protege es la asimetria deliberada de `design.md > 3.2`: las tres acciones
// de QC-35 mueren con el pedido cerrado porque lo MODIFICAN; esta solo abre el panel para VER, y
// QC-87 R13 permite consultar responsables en los cuatro estados. Si alguien "uniformara" el
// menu deshabilitando las cuatro, aqui se pone rojo.
// ---------------------------------------------------------------------------------------------

describe('QC-102 — la entrada propia «Responsables» (R24)', () => {
  it('existe en el menu, visible, con nombre accesible y sin `aria-disabled`', async () => {
    render(<OrderRowActions order={pedido('PENDIENTE')} />);

    abrirMenu();

    const item = await screen.findByTestId(RESPONSABLES_TESTID);
    expect(item).toBeVisible();
    expect(item).toHaveAccessibleName();
    expect(item).not.toHaveAttribute('aria-disabled');
  });

  it('pulsarla emite su enganche con la fila: ver responsables NO exige abrir la edicion', async () => {
    const user = setupUser();
    const onResponsibles = vi.fn();
    const onEdit = vi.fn(() => {
      throw new Error('ver responsables no debe abrir el formulario de edicion');
    });
    render(
      <OrderRowActions order={pedido('EN_CURSO')} onEdit={onEdit} onResponsibles={onResponsibles} />,
    );

    abrirMenu();
    await user.click(await screen.findByTestId(RESPONSABLES_TESTID));

    expect(onResponsibles).toHaveBeenCalledExactlyOnceWith(pedido('EN_CURSO'));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it.each(['ENTREGADO', 'CANCELADO'] as const)(
    'con un pedido %s sigue ACTIVA, mientras las otras tres siguen deshabilitadas',
    async (status) => {
      const enganches = enganchesQueFallan();
      const onResponsibles = vi.fn();
      render(
        <OrderRowActions order={pedido(status)} {...enganches} onResponsibles={onResponsibles} />,
      );

      abrirMenu();

      // Las tres de QC-35, intactas: `aria-disabled`.
      for (const testId of CONTROLES) {
        expect(await screen.findByTestId(testId)).toHaveAttribute('aria-disabled', 'true');
      }

      // Y la cuarta, viva: se puede pulsar y emite.
      const item = screen.getByTestId(RESPONSABLES_TESTID);
      expect(item).not.toHaveAttribute('aria-disabled');
      fireEvent.click(item);
      expect(onResponsibles).toHaveBeenCalledExactlyOnceWith(pedido(status));

      // Sin haber abierto nada de lo que el pedido cerrado prohibe.
      expect(enganches.onEdit).not.toHaveBeenCalled();
      expect(enganches.onCancel).not.toHaveBeenCalled();
      expect(enganches.onDelete).not.toHaveBeenCalled();
    },
  );
});
