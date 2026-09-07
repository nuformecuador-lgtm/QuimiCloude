// T7 — Server Action `listUnitsAction` (`design.md > 9`; `tasks.md > T7`). Mockea
// `@/lib/composition` igual que `recipe-actions.test.ts` de `recetas`: la action se
// testea contra dobles, nunca contra el dominio real ni contra la sesion real.
//
// Cubre R41 (la action no decide nada: el rechazo lo prueba `list-units.test.ts` contra el
// dominio real) y R42 (la action traduce el error de dominio a estado serializable sin
// relanzar, y relanza cualquier otro error).
//
// QC-74 (R15, R18): la action construye el actor con `{ id, permissions }` —el nombre del rol
// ya no llega al modulo— y su bloque de traduccion de errores NO cambia: sigue mirando
// `error instanceof UnidadesError`.

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

/** La sesion conserva `roleName` porque es DISPLAY (lo pinta `nav-user`), pero la action ya no
 *  lo mira: lo que pasa al caso de uso es el conjunto de permisos (R18). */
const SESSION_USER_CON_PERMISO = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['unidades.consultar'],
};

/** La conversion del antiguo caso «rol Operador»: sesion valida SIN el permiso exigido. */
const SESSION_USER_SIN_PERMISO = {
  ...SESSION_USER_CON_PERMISO,
  id: 'user-operador-1',
  roleName: 'Operador',
  permissions: ['inventario.consultar'],
};

const CATALOG = [
  { id: 'unit-1', name: 'Gramo', symbol: 'g' },
  { id: 'unit-2', name: 'Litro', symbol: 'L' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER_CON_PERMISO);
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
    // QC-74 (R18): el actor que sale de la action es `{ id, permissions }` y NADA MAS. Que el
    // aserto sea de igualdad ESTRICTA es lo que pone en rojo un `roleName` que vuelva.
    expect(listUnitsMock).toHaveBeenCalledWith(undefined, {
      id: 'user-admin-1',
      permissions: ['unidades.consultar'],
    });
    expect(resultado).toEqual({ status: 'success', data: CATALOG });
  });

  it('sin sesion invoca el caso de uso con actor null, sin decidir nada por su cuenta', async () => {
    getSessionUserMock.mockResolvedValue(null);
    listUnitsMock.mockRejectedValue(new UnauthorizedError());

    await listUnitsAction();

    expect(listUnitsMock).toHaveBeenCalledWith(undefined, null);
  });

  it('con sesion SIN el permiso pasa el conjunto tal cual y traduce el rechazo del dominio', async () => {
    // La action no decide: entrega los permisos que tiene la sesion y deja que el caso de uso
    // rechace. El estado serializado conserva el `code` estable (R15).
    getSessionUserMock.mockResolvedValue(SESSION_USER_SIN_PERMISO);
    listUnitsMock.mockRejectedValue(new UnauthorizedError());

    const resultado = await listUnitsAction();

    expect(listUnitsMock).toHaveBeenCalledWith(undefined, {
      id: 'user-operador-1',
      permissions: ['inventario.consultar'],
    });
    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
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
