// QC-39 T2 — `listUnitsAction` acepta la consulta y la deja pasar (`design.md > 3`).
//
// Cubre R5 (la operacion de consulta acepta los parametros de lista: con `page`/`pageSize`
// devuelve una pagina con su `total` y su `totalPages`; sin ningun parametro devuelve el
// catalogo completo, exactamente como hoy) y su mitad negativa: aceptar parametros NO anade
// logica de consulta -la action no valida, no sanea, no traduce y no elige metodo-.
//
// El archivo hermano `unit-actions.test.ts` (QC-32/QC-38) sigue cubriendo el resto de la action
// -actor, sesion incompleta y las tres escrituras- y no se reescribe aqui: lo unico nuevo de
// esta ficha es el PARAMETRO, y esto es lo que se prueba.
//
// Mismo patron de siempre: `@/lib/composition` mockeado, la action contra dobles.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorMessage } from '@/lib/modules/errores';
import { UnauthorizedError, ValidationError } from '@/lib/modules/unidades';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';

import type { Page } from '@/lib/modules/unidades/domain/page';
import type { UnitView } from '@/lib/modules/unidades/domain/unit-view';

const { listUnitsMock, getSessionUserMock, getSessionContextMock } = vi.hoisted(() => ({
  listUnitsMock: vi.fn(),
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
    createUnit: vi.fn(),
    updateUnit: vi.fn(),
    deleteUnit: vi.fn(),
  },
}));

const SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['unidades.consultar'],
};

const SESSION_CONTEXT = { userId: 'user-admin-1', companyId: 'company-1' };

const ACTOR_ESPERADO = {
  id: 'user-admin-1',
  companyId: 'company-1',
  permissions: ['unidades.consultar'],
};

const KILOGRAMO: UnitView = {
  id: 'unit-kg',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const SACO: UnitView = {
  id: 'unit-saco',
  name: 'Saco',
  symbol: null,
  baseUnitId: 'unit-kg',
  factor: '25.0000',
  isSystem: false,
};

const CATALOGO: readonly UnitView[] = [KILOGRAMO, SACO];

const PAGINA: Page<UnitView> = {
  items: [SACO],
  total: 3,
  page: 2,
  pageSize: 10,
  totalPages: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

describe('listUnitsAction sin argumentos: el catalogo completo, como hoy (R5, R4)', () => {
  it('devuelve el ARRAY del catalogo y llama al caso de uso con undefined', async () => {
    listUnitsMock.mockResolvedValue(CATALOGO);

    const resultado = await listUnitsAction();

    expect(listUnitsMock).toHaveBeenCalledWith(undefined, ACTOR_ESPERADO);
    expect(resultado).toEqual({ status: 'success', data: CATALOGO });
    // R4: los llamantes de hoy reciben un ARRAY, no una union que estrechar. El aserto en
    // ejecucion acompana a la sobrecarga, que es la que lo garantiza en compilacion.
    const datos = resultado.status === 'success' ? resultado.data : [];
    expect(Array.isArray(datos)).toBe(true);
  });

  it('cada unidad del catalogo llega con su equivalencia y su ambito derivado (R1, R2)', async () => {
    listUnitsMock.mockResolvedValue(CATALOGO);

    const resultado = await listUnitsAction();

    expect(resultado).toMatchObject({ status: 'success' });
    if (resultado.status !== 'success') return;
    expect(resultado.data[1]).toEqual(SACO);
    expect(typeof resultado.data[1]?.factor).toBe('string');
  });
});

describe('listUnitsAction con parametros de lista: una pagina (R5)', () => {
  it('devuelve la pagina con su total y su total de paginas', async () => {
    listUnitsMock.mockResolvedValue(PAGINA);

    const resultado = await listUnitsAction({ page: 2, pageSize: 10 });

    expect(resultado).toEqual({ status: 'success', data: PAGINA });
    if (resultado.status !== 'success') return;
    expect(resultado.data.total).toBe(3);
    expect(resultado.data.totalPages).toBe(2);
  });

  it('la consulta llega al caso de uso SIN TRADUCIR: el mismo objeto que recibio', async () => {
    // R5 en su mitad negativa: la action no valida, no sanea, no acota y no renombra nada. Si
    // algun dia se colara aqui una traduccion de parametros -o un `sanitizeListQuery` repetido-,
    // este aserto de IDENTIDAD DE REFERENCIA lo pondria rojo.
    listUnitsMock.mockResolvedValue(PAGINA);
    const consulta = {
      page: 2,
      pageSize: 25,
      sort: { columnId: 'symbol', direction: 'desc' },
      search: 'kilo',
      filters: {},
    };

    await listUnitsAction(consulta);

    expect(listUnitsMock).toHaveBeenCalledWith(consulta, ACTOR_ESPERADO);
    expect(listUnitsMock.mock.calls[0]?.[0]).toBe(consulta);
  });

  it('una consulta basura tambien viaja tal cual: quien valida es el dominio (R23)', async () => {
    // El acotado es de la pantalla y la validacion del caso de uso. La action no se interpone:
    // pasa lo que le den y traduce lo que el dominio conteste.
    listUnitsMock.mockRejectedValue(new ValidationError());
    const basura = { page: 'abc', sort: 'equivalencia:arriba' };

    const resultado = await listUnitsAction(basura);

    expect(listUnitsMock).toHaveBeenCalledWith(basura, ACTOR_ESPERADO);
    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
  });
});

// QC-70 (R10, R12, R13, R14) cambia las DOS mitades de este bloque, y la ficha entera existe
// para eso. El `code` estable sigue mandando —esa es la parte de QC-39 que no se toca—, pero:
//   - el MENSAJE ya no es el texto que se le paso a la clase. Ese texto es ahora el DIAGNOSTICO,
//     que va al registro del servidor y solo ahi; el mensaje al navegador lo pone el catalogo
//     unico, `errorMessage(code)`. Se afirma contra la funcion, no contra una copia del texto.
//   - un error AJENO al dominio ya NO se relanza. Relanzar dejaba al navegador en la pantalla de
//     error del framework y con la traza a la vista. Ahora se traduce a `unexpected` con mensaje
//     neutro, y el error original viaja al registro entero y a ningun campo del estado.
describe('errores: por el codigo estable de la clase, nunca por el texto', () => {
  it('un error de dominio se traduce a { status: error, code } con el codigo de la clase', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    listUnitsMock.mockRejectedValue(new UnauthorizedError('sin permiso'));

    const resultado = await listUnitsAction({ page: 1 });

    expect(resultado).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
    // El texto que se le paso a la clase es diagnostico: al registro, nunca al estado.
    expect(JSON.stringify(resultado)).not.toContain('sin permiso');
    expect(log).toHaveBeenCalledWith({ code: 'unauthorized', diagnostic: 'sin permiso' });
    log.mockRestore();
  });

  it('un error AJENO al dominio se traduce a `unexpected` y no filtra su texto', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ajeno = new Error('fallo de infraestructura');
    listUnitsMock.mockRejectedValue(ajeno);

    const resultado = await listUnitsAction({ page: 1 });

    expect(resultado).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      // QC-71 (R13): el estado del error INESPERADO vuelve con el identificador de la
      // peticion —el mismo que se escribio en la linea del registro—, y su ausencia ya no
      // compila (R16). El catalogado sigue sin el (R15).
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(resultado)).not.toContain('fallo de infraestructura');
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
