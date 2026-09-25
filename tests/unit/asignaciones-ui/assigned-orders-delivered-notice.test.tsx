import { cleanup, render, screen } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ASSIGNED_ORDER_DELIVERED_TESTID,
  AssignedOrderDeliveredNotice,
} from '@/app/(private)/asignacion/components';
import AsignacionPage from '@/app/(private)/asignacion/page';
import {
  DELIVERED_ORDER_PACKAGES_PARAM,
  DELIVERED_ORDER_PARAM,
  DELIVERED_ORDER_PRODUCT_PARAM,
} from '@/lib/shared/routes';

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 *
 * `react-dom` en jsdom no sabe ejecutar un componente `async` -se queda suspendido para siempre-,
 * asi que sin esto la seccion de la lista no llegaria a pintarse nunca. Copiado de
 * `usuarios-page.test.tsx`.
 */
async function resolverServerComponents(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) {
    return Promise.all((nodo as ReactNode[]).map((hijo) => resolverServerComponents(hijo)));
  }
  if (!isValidElement(nodo)) return nodo;

  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const tipo = elemento.type;

  if (typeof tipo === 'function' && tipo.constructor.name === 'AsyncFunction') {
    const producido = await (tipo as (props: unknown) => Promise<ReactNode>)(elemento.props);
    return resolverServerComponents(producido);
  }

  const hijos = elemento.props.children;
  if (hijos === undefined) return elemento;

  const resueltos = await resolverServerComponents(hijos);

  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

/**
 * La lista de pedidos asignados pinta el aviso de «por empacar» al volver de finalizar (R9):
 * `finishAssignedOrderAction` redirige aqui con `DELIVERED_ORDER_PARAM` en la URL, nunca con un
 * estado de exito que la propia accion no puede resolver -ver `order-execution-screen.tsx`.
 */

const { getSessionUserMock, listAssignedOrdersActionMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  listAssignedOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
  // `packing-orders-list-section.tsx` construye su traductor de errores al cargar el modulo -esta
  // en el mismo barrel que `AssignedOrderDeliveredNotice`- y sin este doble la carga revienta.
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  listAssignedOrdersAction: listAssignedOrdersActionMock,
}));

function sesionCon(permissions: readonly string[]) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'operador.prueba',
    displayName: 'Operador De Prueba',
    roleName: 'Operador',
    permissions,
  };
}

type Consulta = Record<string, string | string[] | undefined>;

async function renderPantalla(searchParams: Consulta = {}) {
  const arbol = await AsignacionPage({ searchParams: Promise.resolve(searchParams) });
  return render(await resolverServerComponents(arbol));
}

beforeEach(() => {
  getSessionUserMock.mockResolvedValue(sesionCon(['asignaciones.consultar']));
  listAssignedOrdersActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('lista de pedidos asignados — R9: aviso de «por empacar» al volver de finalizar', () => {
  it('con el parametro presente, el aviso queda visible y nombra el pedido', async () => {
    await renderPantalla({ [DELIVERED_ORDER_PARAM]: '2026-0000007' });

    const aviso = await screen.findByTestId(ASSIGNED_ORDER_DELIVERED_TESTID);
    expect(aviso).toBeVisible();
    expect(aviso).toHaveTextContent('2026-0000007');
  });

  it('sin el parametro, no pinta ningun aviso', async () => {
    await renderPantalla();

    expect(screen.queryByTestId(ASSIGNED_ORDER_DELIVERED_TESTID)).toBeNull();
  });

  it('R9: con los parametros nuevos, tambien pasa los envases y el nombre del producto al aviso', async () => {
    await renderPantalla({
      [DELIVERED_ORDER_PARAM]: '2026-0000007',
      [DELIVERED_ORDER_PACKAGES_PARAM]: '50',
      [DELIVERED_ORDER_PRODUCT_PARAM]: 'Desengrasante industrial · Botella 1L',
    });

    const aviso = await screen.findByTestId(ASSIGNED_ORDER_DELIVERED_TESTID);
    expect(aviso).toHaveTextContent(
      'Pedido 2026-0000007 por empacar. Entraron 50 envases de Desengrasante industrial · Botella 1L.',
    );
  });
});

describe('AssignedOrderDeliveredNotice — R9: envases y producto en la confirmacion de «por empacar»', () => {
  afterEach(() => {
    cleanup();
  });

  it('con envases y producto, pinta cuantos envases enteros entraron y de que producto', () => {
    render(
      <AssignedOrderDeliveredNotice
        orderNumber="2026-0000007"
        packages="50"
        productName="Desengrasante industrial · Botella 1L"
      />,
    );

    expect(screen.getByTestId(ASSIGNED_ORDER_DELIVERED_TESTID)).toHaveTextContent(
      'Pedido 2026-0000007 por empacar. Entraron 50 envases de Desengrasante industrial · Botella 1L.',
    );
  });

  it('con un solo envase, usa el singular', () => {
    render(
      <AssignedOrderDeliveredNotice
        orderNumber="2026-0000008"
        packages="1"
        productName="Barniz acrílico · Bidón 20L"
      />,
    );

    expect(screen.getByTestId(ASSIGNED_ORDER_DELIVERED_TESTID)).toHaveTextContent(
      'Pedido 2026-0000008 por empacar. Entraron 1 envase de Barniz acrílico · Bidón 20L.',
    );
  });

  it('sin envases ni producto -URL de antes de esta ficha-, pinta el aviso de siempre', () => {
    render(<AssignedOrderDeliveredNotice orderNumber="2026-0000009" />);

    expect(screen.getByTestId(ASSIGNED_ORDER_DELIVERED_TESTID)).toHaveTextContent(
      'Pedido 2026-0000009 por empacar',
    );
    expect(screen.getByTestId(ASSIGNED_ORDER_DELIVERED_TESTID)).not.toHaveTextContent('envases');
  });
});
