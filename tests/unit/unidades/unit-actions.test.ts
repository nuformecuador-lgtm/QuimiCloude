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
//
// QC-76 (R19): la sesion tiene DOS caras y la action resuelve las dos —`getSessionUser()` para
// el id y los permisos, `getSessionContext()` para la EMPRESA—. Si falta CUALQUIERA de las dos
// el actor es `null`, y con actor `null` el caso de uso rechaza SIN consultar el repositorio: se
// cubren las cuatro combinaciones, y las tres que dan actor `null` se prueban ademas contra el
// caso de uso REAL con un repositorio doble que revienta si alguien lo llama.

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { UnauthorizedError } from '@/lib/modules/unidades';
import { createListUnits } from '@/lib/modules/unidades/domain/list-units';

import type { Actor } from '@/lib/modules/unidades/domain/actor';
import type { ListQueryLog } from '@/lib/modules/unidades/ports/list-query-log';
import type { UnitRepository } from '@/lib/modules/unidades/ports/unit-repository';

const { listUnitsMock, getSessionUserMock, getSessionContextMock } = vi.hoisted(() => ({
  listUnitsMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
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

/** La OTRA cara de la sesion (QC-48): de aqui sale la EMPRESA, nunca de la entrada del
 *  llamante (QC-76 R19). `roleName` viaja pero la action no lo mira: se autoriza por permiso. */
const SESSION_CONTEXT = {
  userId: 'user-admin-1',
  companyId: 'company-1',
  roleName: 'Administrador',
};

const CATALOG = [
  { id: 'unit-1', name: 'Gramo', symbol: 'g' },
  { id: 'unit-2', name: 'Litro', symbol: 'L' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER_CON_PERMISO);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
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
    // QC-76 (R19): la empresa la pone `getSessionContext()`. Que el aserto siga siendo de
    // igualdad ESTRICTA es lo que pone en rojo un `companyId` que llegara de otro sitio.
    expect(getSessionContextMock).toHaveBeenCalledTimes(1);
    expect(listUnitsMock).toHaveBeenCalledWith(undefined, {
      id: 'user-admin-1',
      companyId: 'company-1',
      permissions: ['unidades.consultar'],
    });
    expect(resultado).toEqual({ status: 'success', data: CATALOG });
  });

  it('sin sesion invoca el caso de uso con actor null, sin decidir nada por su cuenta', async () => {
    getSessionUserMock.mockResolvedValue(null);
    getSessionContextMock.mockResolvedValue(null);
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
      companyId: 'company-1',
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

/**
 * QC-76 R19 — LAS DOS CARAS DE LA SESION. La empresa sale del contexto de sesion del servidor y
 * nunca de la entrada del llamante; si no hay contexto, se rechaza sin consultar el repositorio.
 * Las cuatro combinaciones: solo la que trae usuario Y contexto construye un actor.
 */
describe('listUnitsAction — la empresa sale del contexto de sesion (QC-76 R19)', () => {
  const ACTOR_COMPLETO: Actor = {
    id: 'user-admin-1',
    companyId: 'company-1',
    permissions: ['unidades.consultar'],
  };

  const COMBINACIONES: ReadonlyArray<{
    readonly nombre: string;
    readonly usuario: unknown;
    readonly contexto: unknown;
    readonly actorEsperado: Actor | null;
  }> = [
    {
      nombre: 'con usuario y con contexto',
      usuario: SESSION_USER_CON_PERMISO,
      contexto: SESSION_CONTEXT,
      actorEsperado: ACTOR_COMPLETO,
    },
    {
      nombre: 'con usuario pero SIN contexto',
      usuario: SESSION_USER_CON_PERMISO,
      contexto: null,
      actorEsperado: null,
    },
    {
      nombre: 'SIN usuario pero con contexto',
      usuario: null,
      contexto: SESSION_CONTEXT,
      actorEsperado: null,
    },
    { nombre: 'sin usuario y sin contexto', usuario: null, contexto: null, actorEsperado: null },
  ];

  for (const caso of COMBINACIONES) {
    const forma = caso.actorEsperado === null ? 'actor null' : 'el actor completo';
    it(`${caso.nombre} construye ${forma}`, async () => {
      getSessionUserMock.mockResolvedValue(caso.usuario);
      getSessionContextMock.mockResolvedValue(caso.contexto);
      listUnitsMock.mockResolvedValue(CATALOG);

      await listUnitsAction();

      expect(listUnitsMock).toHaveBeenCalledWith(undefined, caso.actorEsperado);
    });
  }

  /** Repositorio doble que REVIENTA si alguien lo llama: asi «sin consultar el repositorio» se
   *  prueba de verdad y no por ausencia de asercion. */
  function repositorioQueNoDebeLlamarse(): UnitRepository {
    return {
      listAll: vi.fn(async () => {
        throw new Error('listAll no debia invocarse: la sesion estaba incompleta');
      }),
      listPage: vi.fn(async () => {
        throw new Error('listPage no debia invocarse: la sesion estaba incompleta');
      }),
    };
  }

  const LOG_MUDO: ListQueryLog = { ignoredFields: vi.fn() };

  for (const caso of COMBINACIONES.filter((c) => c.actorEsperado === null)) {
    it(`${caso.nombre}: el caso de uso REAL rechaza sin consultar el repositorio`, async () => {
      // Aqui `listUnits` NO es un doble: es el caso de uso de verdad, cableado con un
      // repositorio que falla si se le toca. Es lo que convierte R19 en una afirmacion sobre el
      // COMPORTAMIENTO —falla cerrado— y no solo sobre la forma del actor.
      const units = repositorioQueNoDebeLlamarse();
      const listUnitsReal = createListUnits({ units, log: LOG_MUDO });
      getSessionUserMock.mockResolvedValue(caso.usuario);
      getSessionContextMock.mockResolvedValue(caso.contexto);
      listUnitsMock.mockImplementation((input: unknown, actor: Actor | null) =>
        listUnitsReal(input, actor),
      );

      const resultado = await listUnitsAction();

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      expect(units.listAll).not.toHaveBeenCalled();
      expect(units.listPage).not.toHaveBeenCalled();
    });
  }
});
