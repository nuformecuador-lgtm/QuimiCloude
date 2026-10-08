import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ConditioningOrderPage from '@/app/(private)/asignacion/acondicionamiento/[id]/page';
import { CONDITIONING_ORDER_SCREEN_TESTID } from '@/app/(private)/asignacion/acondicionamiento/[id]/components';
import { OrderNotFoundError, ValidationError } from '@/lib/modules/asignaciones';
import {
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';

/**
 * El detalle del acondicionador: el corte por permiso antes de leer ningún pedido y el mismo 404
 * para todo lo que el caso de uso no deja ver.
 */

const { getSessionUserMock, getSessionContextMock, getConditioningOrderMock, notFoundMock } = vi.hoisted(
  () => ({
    getSessionUserMock: vi.fn<() => Promise<unknown>>(),
    getSessionContextMock: vi.fn<() => Promise<unknown>>(),
    getConditioningOrderMock: vi.fn<(actor: unknown, input: unknown) => Promise<unknown>>(),
    // `notFound()` está tipada `(): never` y LANZA. El doble hace lo mismo para que el corte se
    // detenga donde lo haría en producción.
    notFoundMock: vi.fn<() => never>(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  asignaciones: { getConditioningOrder: getConditioningOrderMock },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '33333333-3333-4333-8333-333333333333';

function sesionCon(permissions: readonly string[]) {
  return {
    id: ACTOR_ID,
    username: 'acondicionador.prueba',
    displayName: 'Acondicionador de Prueba',
    roleName: 'CUALQUIERA',
    permissions,
  };
}

const ROW = {
  id: ORDER_ID,
  numberText: '2026-0000040',
  recipeName: 'Jarabe simple',
  quantity: '20',
  unitId: null,
  unitLabel: null,
  presentationLines: [],
  status: 'POR_ACONDICIONAR',
  conditionedByName: null,
  conditionedById: null,
};

function invocar(id: string = ORDER_ID) {
  return ConditioningOrderPage({ params: Promise.resolve({ id }) });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
  getSessionUserMock.mockResolvedValue(sesionCon(SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO] ?? []));
});

describe('con el permiso, la página pinta el detalle', () => {
  it('R15: pide getConditioningOrder con el actor y el id, y monta la pantalla', async () => {
    getConditioningOrderMock.mockResolvedValue(ROW);

    render(await invocar());

    expect(getConditioningOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: ACTOR_ID, companyId: 'company-1' }),
      { orderId: ORDER_ID },
    );
    expect(screen.getByTestId(CONDITIONING_ORDER_SCREEN_TESTID)).toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});

describe('el mismo 404 para todo lo que no se puede ver', () => {
  it('R17: con OrderNotFoundError responde con notFound()', async () => {
    getConditioningOrderMock.mockRejectedValue(new OrderNotFoundError());

    await expect(invocar()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('R17: un id que no es uuid (ValidationError) da el mismo notFound()', async () => {
    getConditioningOrderMock.mockRejectedValue(new ValidationError());

    await expect(invocar('no-es-un-uuid')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('R17: un error inesperado no se disfraza de 404', async () => {
    getConditioningOrderMock.mockRejectedValue(new Error('fallo de base de datos'));

    await expect(invocar()).rejects.toThrow('fallo de base de datos');
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});

describe('sin el permiso, 404 antes de leer ningún pedido', () => {
  it.each([ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR])(
    'R18: con los permisos sembrados de %s responde 404 sin llamar a la fachada',
    async (rol) => {
      getSessionUserMock.mockResolvedValue(sesionCon(SEED_ROLE_PERMISSIONS[rol] ?? []));

      await expect(invocar()).rejects.toThrow('NEXT_NOT_FOUND');
      expect(getConditioningOrderMock).not.toHaveBeenCalled();
    },
  );

  it('R18: sin sesión corta (redirige al login) sin llamar a la fachada', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(invocar()).rejects.toThrow();
    expect(getConditioningOrderMock).not.toHaveBeenCalled();
  });
});
