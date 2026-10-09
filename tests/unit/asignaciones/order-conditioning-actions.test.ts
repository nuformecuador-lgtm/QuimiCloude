// tests/unit/asignaciones/order-conditioning-actions.test.ts
//
// Las dos Server Actions del detalle del acondicionador. Esta capa no decide nada: se prueba la
// accion real con la composicion, `redirect` y `revalidatePath` doblados.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  finishConditioningAction,
  startConditioningAction,
} from '@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions';
import {
  ConditioningTeamEmptyError,
  ConditioningTeamMemberNotAllowedError,
  OrderConditioningTakenError,
  OrderNotConditionableError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones';
import { errorMessage } from '@/lib/modules/errores';

const {
  getSessionUserMock,
  getSessionContextMock,
  startConditioningMock,
  finishConditioningMock,
  redirectMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  startConditioningMock: vi.fn(),
  finishConditioningMock: vi.fn(),
  redirectMock: vi.fn<(ruta: string) => never>(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => 'req-1') },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
  },
  asignaciones: {
    startConditioning: startConditioningMock,
    finishConditioning: finishConditioningMock,
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

// El `redirect` real de Next lanza para senalizar la navegacion; el doble lo reproduce.
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
  roleName: 'Administrador de acondicionamiento',
  permissions: ['asignaciones.consultar', 'acondicionamiento.modificar'],
};

const SESSION_CONTEXT = { userId: 'user-1', companyId: 'company-1', roleName: 'Administrador de acondicionamiento' };

const ORDER_ID = '3f1c9b2e-8d47-4a10-9c65-2b7e4f0a1d38';
const BETO = '22222222-2222-4222-8222-222222222222';
const CARLA = '44444444-4444-4444-8444-444444444444';
const GRUPO = '88888888-8888-4888-8888-888888888888';

function formData(entradas: ReadonlyArray<readonly [string, string]>): FormData {
  const datos = new FormData();
  for (const [clave, valor] of entradas) datos.append(clave, valor);
  return datos;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

describe('startConditioningAction — Comenzar con equipo se queda en el detalle', () => {
  it('R27, R28: lee userIds y workGroupIds con getAll y pasa el actor de la sesion al caso de uso', async () => {
    startConditioningMock.mockResolvedValue(undefined);

    await startConditioningAction(
      { status: 'success' },
      formData([
        ['orderId', ORDER_ID],
        ['userIds', BETO],
        ['userIds', CARLA],
        ['workGroupIds', GRUPO],
      ]),
    );

    expect(startConditioningMock).toHaveBeenCalledWith(
      { id: 'user-1', companyId: 'company-1', permissions: SESSION_USER.permissions },
      { orderId: ORDER_ID, userIds: [BETO, CARLA], workGroupIds: [GRUPO] },
    );
  });

  it('R18: sin ninguna casilla marcada llegan dos listas vacias, y el caso de uso decide', async () => {
    startConditioningMock.mockRejectedValue(new ValidationError());

    const resultado = await startConditioningAction({ status: 'success' }, formData([['orderId', ORDER_ID]]));

    expect(startConditioningMock).toHaveBeenCalledWith(expect.anything(), {
      orderId: ORDER_ID,
      userIds: [],
      workGroupIds: [],
    });
    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
  });

  it('R27: exito -> revalida el detalle del pedido y no redirige', async () => {
    startConditioningMock.mockResolvedValue(undefined);

    const resultado = await startConditioningAction(
      { status: 'success' },
      formData([
        ['orderId', ORDER_ID],
        ['userIds', BETO],
      ]),
    );

    expect(resultado).toEqual({ status: 'success' });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/asignacion/acondicionamiento/${ORDER_ID}`);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unauthorized', new UnauthorizedError()],
    ['order_conditioning_taken', new OrderConditioningTakenError()],
    ['order_not_conditionable', new OrderNotConditionableError()],
    ['conditioning_team_member_not_allowed', new ConditioningTeamMemberNotAllowedError()],
    ['conditioning_team_empty', new ConditioningTeamEmptyError()],
  ] as const)('R28: %s se traduce a ErrorState con el texto del catalogo y no revalida', async (code, error) => {
    startConditioningMock.mockRejectedValue(error);

    const resultado = await startConditioningAction(
      { status: 'success' },
      formData([
        ['orderId', ORDER_ID],
        ['userIds', BETO],
      ]),
    );

    expect(resultado).toMatchObject({ status: 'error', code, message: errorMessage(code) });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('finishConditioningAction — Terminar vuelve a «Por acondicionar» con el aviso', () => {
  it('R27, D11: con el pedido ya TERMINADO, redirige a /asignacion?vista=por_acondicionar&acondicionado=<numero>', async () => {
    finishConditioningMock.mockResolvedValue({ numberText: '2026-0000007' });

    await expect(finishConditioningAction({ status: 'success' }, formData([['orderId', ORDER_ID]]))).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(finishConditioningMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), {
      orderId: ORDER_ID,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/asignacion');
    expect(redirectMock).toHaveBeenCalledWith('/asignacion?vista=por_acondicionar&acondicionado=2026-0000007');
  });

  it('R27: un numero con caracteres especiales viaja escapado en la cadena de consulta', async () => {
    finishConditioningMock.mockResolvedValue({ numberText: '2026/0000007' });

    await expect(finishConditioningAction({ status: 'success' }, formData([['orderId', ORDER_ID]]))).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    const [ruta] = redirectMock.mock.calls[0] as [string];
    const params = new URL(ruta, 'http://localhost').searchParams;
    expect(params.get('vista')).toBe('por_acondicionar');
    expect(params.get('acondicionado')).toBe('2026/0000007');
  });

  it.each([
    ['order_conditioning_taken', new OrderConditioningTakenError()],
    ['unauthorized', new UnauthorizedError()],
  ] as const)('R28, R29: %s se traduce a ErrorState y NO redirige', async (code, error) => {
    finishConditioningMock.mockRejectedValue(error);

    const resultado = await finishConditioningAction({ status: 'success' }, formData([['orderId', ORDER_ID]]));

    expect(resultado).toMatchObject({ status: 'error', code, message: errorMessage(code) });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
