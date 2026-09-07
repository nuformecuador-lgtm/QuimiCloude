// T7 — Server Action `listUnitsAction` (`design.md > 9`; `tasks.md > T7`). Mockea
// `@/lib/composition` igual que `recipe-actions.test.ts` de `recetas`: la action se
// testea contra dobles, nunca contra el dominio real ni contra la sesion real.
//
// Cubre R41 (la action no decide nada: el rechazo por rol lo prueba `list-units.test.ts`
// contra el dominio real) y R42 (la action traduce el error de dominio a estado
// serializable sin relanzar, y relanza cualquier otro error).

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { UnauthorizedError } from '@/lib/modules/unidades';

const { listUnitsMock, getSessionUserMock } = vi.hoisted(() => ({
  listUnitsMock: vi.fn(),
  getSessionUserMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
  unidades: { listUnits: listUnitsMock },
}));

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
};

const CATALOG = [
  { id: 'unit-1', name: 'Gramo', symbol: 'g' },
  { id: 'unit-2', name: 'Litro', symbol: 'L' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
});

describe('listUnitsAction', () => {
  it('resuelve el actor con identity.getSessionUser y responde success con el catalogo del caso de uso', async () => {
    listUnitsMock.mockResolvedValue(CATALOG);

    const resultado = await listUnitsAction();

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(listUnitsMock).toHaveBeenCalledTimes(1);
    // QC-57: el caso de uso pasa a `listUnits(input, actor)` con la consulta OPCIONAL. La
    // action sigue pidiendo el CATALOGO ENTERO, o sea `undefined` de consulta, que es lo que
    // mantiene su firma -y la de las tres pantallas que la llaman- sin tocar. Cambia la forma
    // de la llamada, no lo que este caso verifica.
    expect(listUnitsMock).toHaveBeenCalledWith(undefined, {
      id: 'user-admin-1',
      roleName: 'Administrador',
    });
    expect(resultado).toEqual({ status: 'success', data: CATALOG });
  });

  it('sin sesion invoca el caso de uso con actor null, sin decidir nada por su cuenta', async () => {
    getSessionUserMock.mockResolvedValue(null);
    listUnitsMock.mockRejectedValue(new UnauthorizedError());

    await listUnitsAction();

    expect(listUnitsMock).toHaveBeenCalledWith(undefined, null);
  });

  it('la action traduce el error de dominio a estado serializable sin relanzar', async () => {
    const dominioError = new UnauthorizedError('sin permiso');
    listUnitsMock.mockRejectedValue(dominioError);

    const resultado = await listUnitsAction();

    expect(resultado).toEqual({ status: 'error', code: 'unauthorized', message: 'sin permiso' });
  });

  it('un error que no es de dominio se relanza y no se traduce', async () => {
    listUnitsMock.mockRejectedValue(new Error('fallo de infraestructura'));

    await expect(listUnitsAction()).rejects.toThrow('fallo de infraestructura');
  });
});
