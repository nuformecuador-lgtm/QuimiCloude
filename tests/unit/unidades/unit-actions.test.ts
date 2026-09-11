// T7 — Server Action `listUnitsAction` (`design.md > 9`; `tasks.md > T7`). Mockea
// `@/lib/composition` igual que `recipe-actions.test.ts` de `recetas`: la action se
// testea contra dobles, nunca contra el dominio real ni contra la sesion real.
//
// Cubre R41 (la action no decide nada: el rechazo lo prueba `list-units.test.ts` contra el
// dominio real) y R42 (la action traduce el error de dominio a estado serializable sin
// relanzar).
//
// QC-70 (R7, R12, R13): dos cosas cambian aqui y ninguna se relaja. (a) El mensaje ya NO se
// pasa al construir el error: sale del catalogo, asi que el caso que fijaba un texto propio
// ahora fija `errorMessage(code)` y el texto que se le pasaba viaja como DIAGNOSTICO, que no
// puede aparecer en el estado. (b) El error que NO es de dominio ya no se RELANZA -los cuatro
// casos que fijaban `rejects.toThrow(...)` se reescriben-: se devuelve como `unexpected` con
// su mensaje neutro, y ademas se comprueba que NINGUN campo del estado arrastra el texto del
// error original.
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

import {
  createUnitAction,
  deleteUnitAction,
  listUnitsAction,
  updateUnitAction,
} from '@/lib/modules/unidades/adapters/driving/unit-actions';
import {
  DuplicateSymbolError,
  InvalidDerivationError,
  SystemUnitError,
  UnauthorizedError,
  UnitDuplicateNameError,
  UnitInUseError,
  UnitNotFoundError,
  ValidationError,
} from '@/lib/modules/unidades';
import { createListUnits } from '@/lib/modules/unidades/domain/list-units';
import { errorMessage } from '@/lib/modules/errores';

import type { Actor } from '@/lib/modules/unidades/domain/actor';
import type { ListQueryLog } from '@/lib/modules/unidades/ports/list-query-log';
import type { UnitRepository } from '@/lib/modules/unidades/ports/unit-repository';

const {
  listUnitsMock,
  createUnitMock,
  updateUnitMock,
  deleteUnitMock,
  getSessionUserMock,
  getSessionContextMock,
} = vi.hoisted(() => ({
  listUnitsMock: vi.fn(),
  createUnitMock: vi.fn(),
  updateUnitMock: vi.fn(),
  deleteUnitMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
}));

// QC-71 (T7, R7, R13): el adaptador driving pide a la composicion la LECTURA de la cabecera
// del identificador y se la pasa al traductor unico de errores. Sin ella en el doble, el
// modulo ni siquiera carga; con ella, el estado del error inesperado vuelve con ESE id.
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  unidades: {
    listUnits: listUnitsMock,
    createUnit: createUnitMock,
    updateUnit: updateUnitMock,
    deleteUnit: deleteUnitMock,
  },
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

/**
 * QC-70 (R13, R29): el detalle interno —el texto del error ajeno, el diagnostico de un error
 * de dominio— no puede aparecer en NINGUN campo del estado que cruza al navegador. Se
 * comprueba sobre el objeto serializado ENTERO, no campo a campo, para que un campo nuevo no
 * se cuele sin que este aserto se entere.
 */
function noFiltra(estado: unknown, texto: string): boolean {
  return !JSON.stringify(estado).includes(texto);
}

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

  it('la action traduce el error de dominio a estado serializable sin relanzar, con el mensaje del catalogo', async () => {
    // QC-70 (R7, R28): lo que antes era un mensaje a medida ahora es el DIAGNOSTICO. El
    // estado lleva el texto que el catalogo da para el codigo, y el diagnostico no cruza.
    const dominioError = new UnauthorizedError('sin permiso');
    listUnitsMock.mockRejectedValue(dominioError);

    const resultado = await listUnitsAction();

    expect(resultado).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
    expect(noFiltra(resultado, 'sin permiso')).toBe(true);
  });

  it('un error que no es de dominio se traduce a `unexpected` y no filtra su texto', async () => {
    // QC-70 (R12, R13, R14): antes esto era `rejects.toThrow('fallo de infraestructura')`.
    // Ahora la action devuelve estado, el navegador ve el mensaje neutro y el error original
    // va al registro del servidor, que es el unico sitio donde ese texto aparece.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ajeno = new Error('fallo de infraestructura');
    listUnitsMock.mockRejectedValue(ajeno);

    const resultado = await listUnitsAction();

    expect(resultado).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      // QC-71 (R13): el estado del error INESPERADO vuelve con el identificador de la
      // peticion —el mismo que se escribio en la linea del registro—, y su ausencia ya no
      // compila (R16). El catalogado sigue sin el (R15).
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(noFiltra(resultado, 'fallo de infraestructura')).toBe(true);
    // QC-71 (R10, R12): la linea del registro pasa a ser UNA linea de texto con el
    // identificador, el origen, el codigo y el detalle del error. El texto del error original
    // sigue llegando entero al registro, que es lo que este caso fijaba.
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`[error] requestId=${REQUEST_ID_DE_PRUEBA} origen=borde code=unexpected error=${ajeno.name}: ${ajeno.message}`),
    );
    log.mockRestore();
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

/**
 * QC-38 (T9, `design.md > 8`, R27, R29, R30, R31, R36). Las tres Server Actions NUEVAS:
 * `createUnitAction`, `updateUnitAction`, `deleteUnitAction`. Se testean contra dobles de
 * `@/lib/composition`, igual que `listUnitsAction`.
 */
describe('createUnitAction / updateUnitAction / deleteUnitAction', () => {
  const ACTOR_ESPERADO: Actor = {
    id: 'user-admin-1',
    companyId: 'company-1',
    permissions: ['unidades.consultar'],
  };

  function formData(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  describe('sesion y contexto ausentes (R29): el actor llega null, sin tocar el repositorio', () => {
    it('createUnitAction: sin sesion invoca el caso de uso con actor null', async () => {
      getSessionUserMock.mockResolvedValue(null);
      getSessionContextMock.mockResolvedValue(null);
      createUnitMock.mockRejectedValue(new UnauthorizedError());

      const resultado = await createUnitAction(
        { status: 'idle' },
        formData({ name: 'Kilogramo' }),
      );

      expect(createUnitMock).toHaveBeenCalledWith(expect.anything(), null);
      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
    });

    it('updateUnitAction: sin contexto de sesion invoca el caso de uso con actor null', async () => {
      getSessionUserMock.mockResolvedValue({
        id: 'user-admin-1',
        permissions: ['unidades.consultar'],
      });
      getSessionContextMock.mockResolvedValue(null);
      updateUnitMock.mockRejectedValue(new UnauthorizedError());

      const resultado = await updateUnitAction(
        'unit-1',
        { status: 'idle' },
        formData({ name: 'Kilogramo' }),
      );

      expect(updateUnitMock).toHaveBeenCalledWith('unit-1', expect.anything(), null);
      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
    });

    it('deleteUnitAction: sin sesion ni contexto invoca el caso de uso con actor null', async () => {
      getSessionUserMock.mockResolvedValue(null);
      getSessionContextMock.mockResolvedValue(null);
      deleteUnitMock.mockRejectedValue(new UnauthorizedError());

      const resultado = await deleteUnitAction({ status: 'idle' }, formData({ id: 'unit-1' }));

      expect(deleteUnitMock).toHaveBeenCalledWith('unit-1', null);
      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
    });
  });

  describe('con sesion completa, resuelve el actor y lo pasa al caso de uso', () => {
    beforeEach(() => {
      getSessionUserMock.mockResolvedValue({
        id: 'user-admin-1',
        permissions: ['unidades.consultar'],
      });
      getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
    });

    it('createUnitAction: alta valida devuelve success con el id', async () => {
      createUnitMock.mockResolvedValue({ id: 'unit-nueva' });

      const resultado = await createUnitAction(
        { status: 'idle' },
        formData({ name: 'Kilogramo' }),
      );

      expect(createUnitMock).toHaveBeenCalledWith(
        { name: 'Kilogramo', symbol: undefined, baseUnitId: undefined, factor: undefined },
        ACTOR_ESPERADO,
      );
      expect(resultado).toEqual({ status: 'success', id: 'unit-nueva' });
    });

    it('updateUnitAction: edicion valida devuelve success', async () => {
      updateUnitMock.mockResolvedValue(undefined);

      const resultado = await updateUnitAction(
        'unit-1',
        { status: 'idle' },
        formData({ name: 'Kilogramo' }),
      );

      expect(updateUnitMock).toHaveBeenCalledWith(
        'unit-1',
        { name: 'Kilogramo', symbol: undefined, baseUnitId: undefined, factor: undefined },
        ACTOR_ESPERADO,
      );
      expect(resultado).toEqual({ status: 'success' });
    });

    it('deleteUnitAction: borrado valido devuelve success', async () => {
      deleteUnitMock.mockResolvedValue(undefined);

      const resultado = await deleteUnitAction({ status: 'idle' }, formData({ id: 'unit-1' }));

      expect(deleteUnitMock).toHaveBeenCalledWith('unit-1', ACTOR_ESPERADO);
      expect(resultado).toEqual({ status: 'success' });
    });

    // R30: cada clase de error de dominio se traduce a su `code` estable, nunca al texto.
    const CASOS_DE_ERROR: ReadonlyArray<{ readonly error: Error; readonly code: string }> = [
      { error: new ValidationError(), code: 'invalid_input' },
      { error: new UnitNotFoundError(), code: 'unit_not_found' },
      { error: new SystemUnitError(), code: 'system_unit' },
      { error: new UnitDuplicateNameError(), code: 'unit_duplicate_name' },
      { error: new DuplicateSymbolError(), code: 'duplicate_symbol' },
      { error: new InvalidDerivationError(), code: 'invalid_derivation' },
      { error: new UnitInUseError(), code: 'unit_in_use' },
      { error: new UnauthorizedError(), code: 'unauthorized' },
    ];

    for (const caso of CASOS_DE_ERROR) {
      it(`createUnitAction traduce ${caso.error.constructor.name} a { code: '${caso.code}' }`, async () => {
        createUnitMock.mockRejectedValue(caso.error);

        const resultado = await createUnitAction(
          { status: 'idle' },
          formData({ name: 'Kilogramo' }),
        );

        expect(resultado).toMatchObject({ status: 'error', code: caso.code });
      });

      it(`updateUnitAction traduce ${caso.error.constructor.name} a { code: '${caso.code}' }`, async () => {
        updateUnitMock.mockRejectedValue(caso.error);

        const resultado = await updateUnitAction(
          'unit-1',
          { status: 'idle' },
          formData({ name: 'Kilogramo' }),
        );

        expect(resultado).toMatchObject({ status: 'error', code: caso.code });
      });

      it(`deleteUnitAction traduce ${caso.error.constructor.name} a { code: '${caso.code}' }`, async () => {
        deleteUnitMock.mockRejectedValue(caso.error);

        const resultado = await deleteUnitAction({ status: 'idle' }, formData({ id: 'unit-1' }));

        expect(resultado).toMatchObject({ status: 'error', code: caso.code });
      });
    }

    // R30 + QC-70 (R12, R13, R14): un error que NO es de dominio ya no se relanza —eso dejaba
    // al navegador en la pantalla de error del framework—, se traduce a `unexpected` con
    // mensaje neutro. Lo que estos tres casos fijan ahora, ademas del estado: que el texto del
    // error original NO aparece en ningun campo del estado y SI llega al registro.
    const ESTADO_INESPERADO = {
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      // QC-71 (R13): el estado inesperado vuelve con el identificador de la peticion, el mismo
      // que la linea del registro. Sin el no compilaria (R16).
      reference: REQUEST_ID_DE_PRUEBA,
    };

    it('createUnitAction traduce a `unexpected` un error que no es de dominio, sin filtrar su texto', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ajeno = new TypeError('fallo inesperado');
      createUnitMock.mockRejectedValue(ajeno);

      const resultado = await createUnitAction(
        { status: 'idle' },
        formData({ name: 'Kilogramo' }),
      );

      expect(resultado).toEqual(ESTADO_INESPERADO);
      expect(noFiltra(resultado, 'fallo inesperado')).toBe(true);
      // QC-71 (R10, R12): la linea del registro deja de ser el objeto de QC-70 y pasa a ser UNA
      // linea de texto con el identificador, el origen, el codigo y el detalle del error —nombre,
      // mensaje y traza, y nada mas—. Lo que este caso fijaba NO se relaja: el texto del error
      // original sigue llegando entero al registro, y solo ahi.
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(`[error] requestId=${REQUEST_ID_DE_PRUEBA} origen=borde code=unexpected error=${ajeno.name}: ${ajeno.message}`),
      );
      log.mockRestore();
    });

    it('updateUnitAction traduce a `unexpected` un error que no es de dominio, sin filtrar su texto', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ajeno = new TypeError('fallo inesperado');
      updateUnitMock.mockRejectedValue(ajeno);

      const resultado = await updateUnitAction(
        'unit-1',
        { status: 'idle' },
        formData({ name: 'Kilogramo' }),
      );

      expect(resultado).toEqual(ESTADO_INESPERADO);
      expect(noFiltra(resultado, 'fallo inesperado')).toBe(true);
      // QC-71 (R10, R12): la linea del registro deja de ser el objeto de QC-70 y pasa a ser UNA
      // linea de texto con el identificador, el origen, el codigo y el detalle del error —nombre,
      // mensaje y traza, y nada mas—. Lo que este caso fijaba NO se relaja: el texto del error
      // original sigue llegando entero al registro, y solo ahi.
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(`[error] requestId=${REQUEST_ID_DE_PRUEBA} origen=borde code=unexpected error=${ajeno.name}: ${ajeno.message}`),
      );
      log.mockRestore();
    });

    it('deleteUnitAction traduce a `unexpected` un error que no es de dominio, sin filtrar su texto', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ajeno = new TypeError('fallo inesperado');
      deleteUnitMock.mockRejectedValue(ajeno);

      const resultado = await deleteUnitAction({ status: 'idle' }, formData({ id: 'unit-1' }));

      expect(resultado).toEqual(ESTADO_INESPERADO);
      expect(noFiltra(resultado, 'fallo inesperado')).toBe(true);
      // QC-71 (R10, R12): la linea del registro deja de ser el objeto de QC-70 y pasa a ser UNA
      // linea de texto con el identificador, el origen, el codigo y el detalle del error —nombre,
      // mensaje y traza, y nada mas—. Lo que este caso fijaba NO se relaja: el texto del error
      // original sigue llegando entero al registro, y solo ahi.
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(`[error] requestId=${REQUEST_ID_DE_PRUEBA} origen=borde code=unexpected error=${ajeno.name}: ${ajeno.message}`),
      );
      log.mockRestore();
    });
  });

  /**
   * R36 en el borde: `formData.has('symbol')` distingue la clave AUSENTE (legal, R10) de la
   * clave PRESENTE pero vacia (rechazada, R36). Sin `has(...)`, `FormData.get` devuelve `null`
   * en el primer caso y `''` en el segundo, pero un `?? ''` los confundiria: es justo lo que
   * este par de casos demuestra.
   */
  describe('FormData: clave `symbol` ausente frente a clave presente y vacia (R36 vs R10)', () => {
    beforeEach(() => {
      getSessionUserMock.mockResolvedValue({
        id: 'user-admin-1',
        permissions: ['unidades.consultar'],
      });
      getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
    });

    it('sin la clave symbol, el candidato lleva symbol: undefined (pasa al caso de uso)', async () => {
      createUnitMock.mockResolvedValue({ id: 'unit-nueva' });
      const data = new FormData();
      data.set('name', 'Kilogramo');

      await createUnitAction({ status: 'idle' }, data);

      expect(createUnitMock).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: undefined }),
        ACTOR_ESPERADO,
      );
    });

    it('con la clave symbol vacia, el candidato lleva symbol: "" y el dominio rechaza invalid_input', async () => {
      createUnitMock.mockRejectedValue(new ValidationError());
      const data = new FormData();
      data.set('name', 'Kilogramo');
      data.set('symbol', '');

      const resultado = await createUnitAction({ status: 'idle' }, data);

      expect(createUnitMock).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: '' }),
        ACTOR_ESPERADO,
      );
      expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    });
  });
});
