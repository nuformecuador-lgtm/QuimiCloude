// tests/unit/asignaciones/execution-trace-actions.test.ts
//
// Las dos lecturas del recorrido: la accion resuelve el actor, pone el instante y traduce el
// error por su `code`. Se prueba contra la accion real con la composicion doblada.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getExecutionTraceAction,
  listExecutionTracesAction,
} from '@/lib/modules/asignaciones/adapters/driving/execution-trace-actions';
import { OrderNotFoundError, UnauthorizedError, ValidationError } from '@/lib/modules/asignaciones';

const { getSessionUserMock, getSessionContextMock, listExecutionTracesMock, getExecutionTraceMock } = vi.hoisted(
  () => ({
    getSessionUserMock: vi.fn(),
    getSessionContextMock: vi.fn(),
    listExecutionTracesMock: vi.fn(),
    getExecutionTraceMock: vi.fn(),
  }),
);

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => 'req-1') },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
  },
  asignaciones: {
    listExecutionTraces: listExecutionTracesMock,
    getExecutionTrace: getExecutionTraceMock,
  },
}));

const SESSION_USER = {
  id: 'user-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['dashboard.consultar'],
};
const SESSION_CONTEXT = { userId: 'user-1', companyId: 'company-1', roleName: 'Administrador' };
const ACTOR = { id: 'user-1', companyId: 'company-1', permissions: ['dashboard.consultar'] };
const ORDER_ID = '3f1c9b2e-8d47-4a10-9c65-2b7e4f0a1d38';

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

describe('listExecutionTracesAction', () => {
  it('R19: pasa el actor de la sesion, la entrada tal cual y un instante puesto por la accion', async () => {
    const data = { page: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 }, personOptions: [] };
    listExecutionTracesMock.mockResolvedValue(data);
    const antes = Date.now();

    const resultado = await listExecutionTracesAction({ page: 2, orderNumber: '42' });

    expect(resultado).toEqual({ status: 'success', data });
    const [actor, input, now] = listExecutionTracesMock.mock.calls[0] as [unknown, unknown, Date];
    expect(actor).toEqual(ACTOR);
    expect(input).toEqual({ page: 2, orderNumber: '42' });
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('R19: sin sesion, el actor llega ausente y el rechazo lo da el caso de uso, no la accion', async () => {
    getSessionUserMock.mockResolvedValue(null);
    listExecutionTracesMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await listExecutionTracesAction({});

    expect(listExecutionTracesMock.mock.calls[0]![0]).toBeNull();
    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
  });

  it('R19: un actor sin el permiso llega igual al caso de uso: la accion no comprueba permisos', async () => {
    getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: [] });
    listExecutionTracesMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await listExecutionTracesAction({});

    expect(listExecutionTracesMock).toHaveBeenCalledTimes(1);
    expect(listExecutionTracesMock.mock.calls[0]![0]).toEqual({ ...ACTOR, permissions: [] });
    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
  });

  it('una entrada invalida se traduce por su `code`', async () => {
    listExecutionTracesMock.mockRejectedValue(new ValidationError());
    await expect(listExecutionTracesAction({})).resolves.toMatchObject({ status: 'error', code: 'invalid_input' });
  });
});

describe('getExecutionTraceAction', () => {
  it('R24: pide el recorrido al caso de uso del modulo con el id y un instante de la accion', async () => {
    const data = { orderId: ORDER_ID };
    getExecutionTraceMock.mockResolvedValue(data);

    const resultado = await getExecutionTraceAction(ORDER_ID);

    expect(resultado).toEqual({ status: 'success', data });
    const [actor, input, now] = getExecutionTraceMock.mock.calls[0] as [unknown, unknown, Date];
    expect(actor).toEqual(ACTOR);
    expect(input).toEqual({ orderId: ORDER_ID });
    expect(now).toBeInstanceOf(Date);
  });

  it('R18: sin recorrido, el error sale como `order_not_found` para que la pagina responda 404', async () => {
    getExecutionTraceMock.mockRejectedValue(new OrderNotFoundError());
    await expect(getExecutionTraceAction(ORDER_ID)).resolves.toMatchObject({
      status: 'error',
      code: 'order_not_found',
    });
  });

  it('R19: el rechazo de autorizacion lo da el caso de uso y la accion lo traduce', async () => {
    getExecutionTraceMock.mockRejectedValue(new UnauthorizedError());
    await expect(getExecutionTraceAction(ORDER_ID)).resolves.toMatchObject({ status: 'error', code: 'unauthorized' });
  });

  it('un error inesperado no se filtra: sale como estado de error con referencia', async () => {
    getExecutionTraceMock.mockRejectedValue(new Error('boom'));
    const resultado = await getExecutionTraceAction(ORDER_ID);
    expect(resultado).toMatchObject({ status: 'error', reference: expect.any(String) });
  });
});
