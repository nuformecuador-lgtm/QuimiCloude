// tests/unit/asignaciones/order-execution-actions.test.ts
//
// `finishAssignedOrderAction` termina SIEMPRE en `redirect(...)`: el `redirect` real de Next
// lanza para senializar la navegacion, asi que la confirmacion no puede viajar en el `return`
// de la action -eso es lo que este archivo prueba contra la accion REAL, con `redirect`
// doblado, en vez de contra un doble de la accion que pudiera inventar un valor que la
// implementacion real nunca emite-.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { finishAssignedOrderAction } from '@/lib/modules/asignaciones/adapters/driving/order-execution-actions';
import { OrderNotFoundError } from '@/lib/modules/asignaciones';

const { getSessionUserMock, getSessionContextMock, finishAssignedOrderMock, redirectMock } = vi.hoisted(
  () => ({
    getSessionUserMock: vi.fn(),
    getSessionContextMock: vi.fn(),
    finishAssignedOrderMock: vi.fn(),
    redirectMock: vi.fn<(ruta: string) => never>(),
  }),
);

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => 'req-1') },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
  },
  asignaciones: {
    finishAssignedOrder: finishAssignedOrderMock,
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Mismo patron que `tests/unit/identity/logout-action.test.ts`: el `redirect` real de Next
// lanza para senializar la navegacion, y el doble reproduce ese comportamiento.
vi.mock('next/navigation', () => ({
  redirect: (ruta: string): never => {
    redirectMock(ruta);
    throw new Error('NEXT_REDIRECT');
  },
}));

const SESSION_USER = {
  id: 'user-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Operador',
  permissions: ['asignaciones.consultar'],
};

const SESSION_CONTEXT = { userId: 'user-1', companyId: 'company-1', roleName: 'Operador' };

const ORDER_ID = '3f1c9b2e-8d47-4a10-9c65-2b7e4f0a1d38';

function formDataConPedido(orderId: string): FormData {
  const formData = new FormData();
  formData.append('orderId', orderId);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

describe('finishAssignedOrderAction — la confirmacion viaja en la URL de vuelta, no en el return', () => {
  it('redirige a `/asignacion?entregado=<numero>` con el numero, los envases y el producto que devuelve el caso de uso (R24)', async () => {
    finishAssignedOrderMock.mockResolvedValue({
      numberText: '2026-0000007',
      packages: '50',
      productName: 'Desengrasante industrial · Botella 1L',
    });

    await expect(
      finishAssignedOrderAction({ status: 'success' }, formDataConPedido(ORDER_ID)),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(
      '/asignacion?entregado=2026-0000007&entregado_envases=50&entregado_producto=Desengrasante+industrial+%C2%B7+Botella+1L',
    );
  });

  it('un numero con caracteres especiales viaja escapado en la cadena de consulta', async () => {
    finishAssignedOrderMock.mockResolvedValue({
      numberText: '2026/0000007',
      packages: '5',
      productName: 'Acido citrico 50% · Bidon 20L',
    });

    await expect(
      finishAssignedOrderAction({ status: 'success' }, formDataConPedido(ORDER_ID)),
    ).rejects.toThrow('NEXT_REDIRECT');

    const [ruta] = redirectMock.mock.calls[0] as [string];
    const params = new URL(ruta, 'http://localhost').searchParams;
    expect(params.get('entregado')).toBe('2026/0000007');
    expect(params.get('entregado_envases')).toBe('5');
    expect(params.get('entregado_producto')).toBe('Acido citrico 50% · Bidon 20L');
  });

  it('un error del caso de uso se traduce por su `code` y NO redirige', async () => {
    finishAssignedOrderMock.mockRejectedValue(new OrderNotFoundError());

    const resultado = await finishAssignedOrderAction(
      { status: 'success' },
      formDataConPedido(ORDER_ID),
    );

    expect(resultado).toMatchObject({ status: 'error', code: 'order_not_found' });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
