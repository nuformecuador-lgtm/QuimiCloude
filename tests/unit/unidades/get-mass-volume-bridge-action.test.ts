// `getMassVolumeBridgeAction`: la action resuelve el actor como `listUnitsAction` y delega en el
// caso de uso real, cableado aqui contra un catalogo doble.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorMessage } from '@/lib/modules/errores';
import type { MassVolumeBridge, UnitCatalog } from '@/lib/modules/unidades';
import { getMassVolumeBridgeAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';

const { findMassVolumeBridgeMock, getSessionUserMock, getSessionContextMock } = vi.hoisted(() => ({
  findMassVolumeBridgeMock: vi.fn<UnitCatalog['findMassVolumeBridge']>(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
}));

vi.mock('@/lib/composition', async () => {
  const { createGetMassVolumeBridge: create } = await import('@/lib/modules/unidades');
  return {
    observabilidad: { readRequestIdHeader: vi.fn(async () => null) },
    identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
    unidades: {
      listUnits: vi.fn(),
      createUnit: vi.fn(),
      updateUnit: vi.fn(),
      deleteUnit: vi.fn(),
      getMassVolumeBridge: create({ units: { findMassVolumeBridge: findMassVolumeBridgeMock } }),
    },
  };
});

const BRIDGE: MassVolumeBridge = { volumeBaseId: 'unit-ml', massBaseId: 'unit-g' };

const SESSION_USER = {
  id: 'user-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['unidades.consultar'],
};

const SESSION_CONTEXT = { userId: 'user-1', companyId: 'company-1' };

beforeEach(() => {
  vi.clearAllMocks();
  findMassVolumeBridgeMock.mockResolvedValue(BRIDGE);
});

describe('getMassVolumeBridgeAction', () => {
  it('R13 la accion devuelve el puente del catalogo', async () => {
    getSessionUserMock.mockResolvedValue(SESSION_USER);
    getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);

    await expect(getMassVolumeBridgeAction()).resolves.toEqual({ status: 'success', data: BRIDGE });
    expect(findMassVolumeBridgeMock).toHaveBeenCalledTimes(1);
  });

  it('R13 sin sesion se rechaza', async () => {
    getSessionUserMock.mockResolvedValue(null);
    getSessionContextMock.mockResolvedValue(null);

    await expect(getMassVolumeBridgeAction()).resolves.toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
    expect(findMassVolumeBridgeMock).not.toHaveBeenCalled();
  });

  it('R13 sin unidades.consultar se rechaza sin leer el catalogo', async () => {
    getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: ['pedidos.modificar'] });
    getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);

    const result = await getMassVolumeBridgeAction();

    expect(result).toMatchObject({ status: 'error', code: 'unauthorized' });
    expect(findMassVolumeBridgeMock).not.toHaveBeenCalled();
  });
});
