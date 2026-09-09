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

import { UnauthorizedError, ValidationError } from '@/lib/modules/unidades';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';

import type { Page } from '@/lib/modules/unidades/domain/page';
import type { UnitView } from '@/lib/modules/unidades/domain/unit-view';

const { listUnitsMock, getSessionUserMock, getSessionContextMock } = vi.hoisted(() => ({
  listUnitsMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
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

describe('errores: por el codigo estable de la clase, nunca por el texto', () => {
  it('un error de dominio se traduce a { status: error, code } con el codigo de la clase', async () => {
    listUnitsMock.mockRejectedValue(new UnauthorizedError('sin permiso'));

    const resultado = await listUnitsAction({ page: 1 });

    expect(resultado).toEqual({ status: 'error', code: 'unauthorized', message: 'sin permiso' });
  });

  it('un error AJENO al dominio se relanza y no se traduce', async () => {
    listUnitsMock.mockRejectedValue(new Error('fallo de infraestructura'));

    await expect(listUnitsAction({ page: 1 })).rejects.toThrow('fallo de infraestructura');
  });
});
