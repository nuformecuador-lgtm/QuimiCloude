// tests/unit/asignaciones/order-execution-actions.test.ts
//
// `finishAssignedOrderAction` termina SIEMPRE en `redirect(...)`: el `redirect` real de Next
// lanza para senializar la navegacion, asi que la confirmacion no puede viajar en el `return`
// de la action -eso es lo que este archivo prueba contra la accion REAL, con `redirect`
// doblado, en vez de contra un doble de la accion que pudiera inventar un valor que la
// implementacion real nunca emite-.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelAssignedOrderAction,
  finishAssignedOrderAction,
  recordStepMoveAction,
} from '@/lib/modules/asignaciones/adapters/driving/order-execution-actions';
import {
  NotCancellableError,
  OrderBlockedError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones';

const {
  getSessionUserMock,
  getSessionContextMock,
  finishAssignedOrderMock,
  cancelAssignedOrderMock,
  recordStepMoveMock,
  redirectMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  finishAssignedOrderMock: vi.fn(),
  cancelAssignedOrderMock: vi.fn(),
  recordStepMoveMock: vi.fn(),
  redirectMock: vi.fn<(ruta: string) => never>(),
}));

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => 'req-1') },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
  },
  asignaciones: {
    finishAssignedOrder: finishAssignedOrderMock,
    cancelAssignedOrder: cancelAssignedOrderMock,
    recordStepMove: recordStepMoveMock,
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
  // R15, R16: Finalizar ya no da de alta ningun lote, asi que la confirmacion ya no
  // lleva envases ni producto -esa notificacion pasa a Terminar el empaque (T14)-.
  it('redirige a `/asignacion?entregado=<numero>` con el numero que devuelve el caso de uso', async () => {
    finishAssignedOrderMock.mockResolvedValue({ numberText: '2026-0000007' });

    await expect(
      finishAssignedOrderAction({ status: 'success' }, formDataConPedido(ORDER_ID)),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith('/asignacion?entregado=2026-0000007');
  });

  it('un numero con caracteres especiales viaja escapado en la cadena de consulta', async () => {
    finishAssignedOrderMock.mockResolvedValue({ numberText: '2026/0000007' });

    await expect(
      finishAssignedOrderAction({ status: 'success' }, formDataConPedido(ORDER_ID)),
    ).rejects.toThrow('NEXT_REDIRECT');

    const [ruta] = redirectMock.mock.calls[0] as [string];
    const params = new URL(ruta, 'http://localhost').searchParams;
    expect(params.get('entregado')).toBe('2026/0000007');
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

const ACTOR = { id: 'user-1', companyId: 'company-1', permissions: ['asignaciones.consultar'] };

function formDataDe(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.append(clave, valor);
  return formData;
}

describe('finishAssignedOrderAction — la posicion del ultimo paso', () => {
  it('R21: envia al caso de uso la posicion del formulario como numero', async () => {
    finishAssignedOrderMock.mockResolvedValue({ numberText: '2026-0000007' });

    await expect(
      finishAssignedOrderAction({ status: 'success' }, formDataDe({ orderId: ORDER_ID, stepPosition: '4' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(finishAssignedOrderMock).toHaveBeenCalledWith(ACTOR, { orderId: ORDER_ID, stepPosition: 4 });
  });

  it('R5: una posicion vacia es una receta sin pasos y viaja como `null`', async () => {
    finishAssignedOrderMock.mockResolvedValue({ numberText: '2026-0000007' });

    await expect(
      finishAssignedOrderAction({ status: 'success' }, formDataDe({ orderId: ORDER_ID, stepPosition: '' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(finishAssignedOrderMock).toHaveBeenCalledWith(ACTOR, { orderId: ORDER_ID, stepPosition: null });
  });

  it('R21: sin el campo, la posicion no se inventa y el caso de uso la rechaza como `invalid_input`', async () => {
    finishAssignedOrderMock.mockRejectedValue(new ValidationError());

    const resultado = await finishAssignedOrderAction({ status: 'success' }, formDataDe({ orderId: ORDER_ID }));

    expect(finishAssignedOrderMock).toHaveBeenCalledWith(ACTOR, { orderId: ORDER_ID, stepPosition: undefined });
    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('cancelAssignedOrderAction — cancela y vuelve a la lista con la confirmacion', () => {
  it('R22, R25: envia pedido, posicion y motivo tal cual y redirige a `/asignacion?cancelado=<numero>`', async () => {
    cancelAssignedOrderMock.mockResolvedValue({ numberText: '2026-0000007' });

    await expect(
      cancelAssignedOrderAction(
        { status: 'success' },
        formDataDe({ orderId: ORDER_ID, stepPosition: '2', reason: 'El cliente lo anulo' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(cancelAssignedOrderMock).toHaveBeenCalledWith(ACTOR, {
      orderId: ORDER_ID,
      stepPosition: 2,
      reason: 'El cliente lo anulo',
    });
    expect(redirectMock).toHaveBeenCalledWith('/asignacion?cancelado=2026-0000007');
  });

  it('R25: el numero viaja escapado en la cadena de consulta', async () => {
    cancelAssignedOrderMock.mockResolvedValue({ numberText: '2026/0000007' });

    await expect(
      cancelAssignedOrderAction({ status: 'success' }, formDataDe({ orderId: ORDER_ID, stepPosition: '1', reason: 'x' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    const [ruta] = redirectMock.mock.calls[0] as [string];
    expect(new URL(ruta, 'http://localhost').searchParams.get('cancelado')).toBe('2026/0000007');
  });

  it.each([
    ['not_cancellable', new NotCancellableError()],
    ['order_not_found', new OrderNotFoundError()],
    ['invalid_input', new ValidationError()],
    ['unauthorized', new UnauthorizedError()],
  ])('R24, R29: un error con `code` %s se devuelve como estado y NO redirige', async (code, error) => {
    cancelAssignedOrderMock.mockRejectedValue(error);

    const resultado = await cancelAssignedOrderAction(
      { status: 'success' },
      formDataDe({ orderId: ORDER_ID, stepPosition: '1', reason: 'motivo' }),
    );

    expect(resultado).toMatchObject({ status: 'error', code });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('recordStepMoveAction — anota el paso y devuelve un estado que la pantalla puede ignorar', () => {
  it.each([
    ['advance', 2],
    ['go_back', 1],
  ] as const)('R17, R18: `%s` llega al caso de uso con la posicion %s y devuelve exito', async (direction, stepPosition) => {
    recordStepMoveMock.mockResolvedValue(undefined);

    const resultado = await recordStepMoveAction({ orderId: ORDER_ID, direction, stepPosition });

    expect(recordStepMoveMock).toHaveBeenCalledWith(ACTOR, { orderId: ORDER_ID, direction, stepPosition });
    expect(resultado).toEqual({ status: 'success' });
  });

  it.each([
    ['order_blocked', new OrderBlockedError()],
    ['order_not_found', new OrderNotFoundError()],
    ['unauthorized', new UnauthorizedError()],
  ])('R19, R20: un error con `code` %s se devuelve como estado, sin lanzar', async (code, error) => {
    recordStepMoveMock.mockRejectedValue(error);

    const resultado = await recordStepMoveAction({ orderId: ORDER_ID, direction: 'advance', stepPosition: 2 });

    expect(resultado).toMatchObject({ status: 'error', code });
  });
});
