import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AssignedOrderExecutionPage from '@/app/(private)/asignacion/[id]/page';
import { ORDER_EXECUTION_ERROR_TESTID, ORDER_EXECUTION_SCREEN_TESTID } from '@/app/(private)/asignacion/[id]/components';
import { LOGIN_ROUTE_SESSION_ENDED } from '@/lib/shared/routes';

/**
 * La pagina de ejecucion: el corte por permiso (R1, R2, R3) y el reparto de la lectura (R6, R7).
 */

const { getSessionUserMock, notFoundMock, redirectMock, startAssignedOrderActionMock } =
  vi.hoisted(() => ({
    getSessionUserMock: vi.fn<() => Promise<unknown>>(),
    // `notFound()` y `redirect()` estan tipadas `(): never` y LANZAN. El doble hace lo mismo: si
    // no lanzara, el corte seguiria ejecutandose y el test mediria otra cosa.
    notFoundMock: vi.fn<() => never>(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn<(ruta: string) => never>(() => {
      throw new Error('NEXT_REDIRECT');
    }),
    startAssignedOrderActionMock: vi.fn(),
  }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-execution-actions', () => ({
  startAssignedOrderAction: startAssignedOrderActionMock,
  finishAssignedOrderAction: vi.fn(),
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

const EXECUCION_MINIMA = {
  orderId: 'order-1',
  numberText: 'PED-0007',
  status: 'EN_CURSO' as const,
  recipeName: 'Barniz acrílico',
  orderQuantity: '250',
  steps: [],
  lines: [],
  tools: [],
  presentationLines: [],
  unitId: null,
  unitLabel: null,
};

function arbolDeLaPagina(id = 'order-1') {
  return AssignedOrderExecutionPage({ params: Promise.resolve({ id }) });
}

beforeEach(() => {
  getSessionUserMock.mockResolvedValue(sesionCon(['asignaciones.consultar', 'asignaciones.ejecutar']));
  startAssignedOrderActionMock.mockResolvedValue({ status: 'success', data: EXECUCION_MINIMA });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('pagina de ejecucion — el corte por permiso ocurre ANTES de leer nada (R2, R3)', () => {
  it('sin sesion redirige al login y no responde 404', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(arbolDeLaPagina()).rejects.toThrow();

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(startAssignedOrderActionMock).not.toHaveBeenCalled();
  });

  it('R8: con sesion pero sin `asignaciones.ejecutar` responde 404, nunca 403', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(['inventario.consultar']));

    await expect(arbolDeLaPagina()).rejects.toThrow();

    expect(notFoundMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(startAssignedOrderActionMock).not.toHaveBeenCalled();
  });

  it('R8: con los permisos del Empacador (consulta pero no ejecuta) responde 404 sin comenzar el pedido', async () => {
    getSessionUserMock.mockResolvedValue(
      sesionCon(['asignaciones.consultar', 'terminados.consultar', 'empaque.modificar']),
    );

    await expect(arbolDeLaPagina()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(startAssignedOrderActionMock).not.toHaveBeenCalled();
  });

  it('R8: con `asignaciones.ejecutar` aunque no tenga `asignaciones.consultar`, entra y abre el pedido', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(['asignaciones.ejecutar']));

    render(await arbolDeLaPagina());

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(startAssignedOrderActionMock).toHaveBeenCalledWith('order-1');
    expect(screen.getByTestId(ORDER_EXECUTION_SCREEN_TESTID)).toBeInTheDocument();
  });

  it('R8: con el permiso, entra y abre el pedido', async () => {
    const arbol = await arbolDeLaPagina();
    render(arbol);

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(startAssignedOrderActionMock).toHaveBeenCalledWith('order-1');
    expect(screen.getByTestId(ORDER_EXECUTION_SCREEN_TESTID)).toBeInTheDocument();
  });
});

describe('pagina de ejecucion — «no existe» y «no es tuyo» pintan lo mismo (R6)', () => {
  it('presenta el estado de error cuando la operacion rechaza con `order_not_found`', async () => {
    startAssignedOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'order_not_found',
      message: 'El pedido solicitado no existe.',
    });

    const arbol = await arbolDeLaPagina();
    render(arbol);

    expect(screen.getByTestId(ORDER_EXECUTION_ERROR_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_EXECUTION_SCREEN_TESTID)).toBeNull();
  });
});
