import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ConditioningOrderPage from '@/app/(private)/asignacion/acondicionamiento/[id]/page';
import {
  CONDITIONING_ACTIONS_TEXTS,
  CONDITIONING_BATCH_DATA_SECTION_TESTID,
  CONDITIONING_ORDER_BACK_LINK_TESTID,
  CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID,
  CONDITIONING_ORDER_CANDIDATES_ERROR_TESTID,
  CONDITIONING_ORDER_SCREEN_TESTID,
} from '@/app/(private)/asignacion/acondicionamiento/[id]/components';
import { OrderNotFoundError, UnauthorizedError, ValidationError } from '@/lib/modules/asignaciones';
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

const {
  getSessionUserMock,
  getSessionContextMock,
  getConditioningOrderMock,
  listConditioningTeamCandidatesMock,
  notFoundMock,
} = vi.hoisted(
  () => ({
    getSessionUserMock: vi.fn<() => Promise<unknown>>(),
    getSessionContextMock: vi.fn<() => Promise<unknown>>(),
    getConditioningOrderMock: vi.fn<(actor: unknown, input: unknown) => Promise<unknown>>(),
    listConditioningTeamCandidatesMock: vi.fn<(actor: unknown, input: unknown) => Promise<unknown>>(),
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
  asignaciones: {
    getConditioningOrder: getConditioningOrderMock,
    listConditioningTeamCandidates: listConditioningTeamCandidatesMock,
  },
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
  team: [],
  batchData: null,
};

const CANDIDATES = {
  people: [{ id: '44444444-4444-4444-8444-444444444444', displayName: 'Carla Gómez' }],
  workGroups: [],
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
  listConditioningTeamCandidatesMock.mockResolvedValue(CANDIDATES);
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

describe('qué acción se ofrece y qué se lee para ella', () => {
  it('R1: en POR_ACONDICIONAR pide los candidatos con el actor y ofrece «Acondicionar»', async () => {
    getConditioningOrderMock.mockResolvedValue(ROW);

    render(await invocar());

    expect(listConditioningTeamCandidatesMock).toHaveBeenCalledTimes(1);
    expect(listConditioningTeamCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: ACTOR_ID, companyId: 'company-1' }),
      {},
    );
    expect(screen.getByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.start })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish })).toBeNull();
  });

  it('R2: en EN_ACONDICIONAMIENTO del propio actor ofrece «Terminar» sin pedir candidatos', async () => {
    getConditioningOrderMock.mockResolvedValue({
      ...ROW,
      status: 'EN_ACONDICIONAMIENTO',
      conditionedById: ACTOR_ID,
      conditionedByName: 'Acondicionador de Prueba',
    });

    render(await invocar());

    expect(listConditioningTeamCandidatesMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.start })).toBeNull();
  });

  it('R3: en EN_ACONDICIONAMIENTO de otra persona no ofrece nada ni pide candidatos', async () => {
    getConditioningOrderMock.mockResolvedValue({
      ...ROW,
      status: 'EN_ACONDICIONAMIENTO',
      conditionedById: '22222222-2222-4222-8222-222222222222',
      conditionedByName: 'Berta Ruiz',
    });

    render(await invocar());

    expect(listConditioningTeamCandidatesMock).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Lo acondiciona Berta Ruiz.')).toBeInTheDocument();
  });

  it('R3: en TERMINADO no ofrece nada ni pide candidatos, aunque lo terminara el propio actor', async () => {
    getConditioningOrderMock.mockResolvedValue({
      ...ROW,
      status: 'TERMINADO',
      conditionedById: ACTOR_ID,
      conditionedByName: 'Acondicionador de Prueba',
    });

    render(await invocar());

    expect(listConditioningTeamCandidatesMock).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('R1: si los candidatos fallan con un error del módulo, pinta el detalle sin «Acondicionar» y con el aviso', async () => {
    getConditioningOrderMock.mockResolvedValue(ROW);
    listConditioningTeamCandidatesMock.mockRejectedValue(new UnauthorizedError());

    render(await invocar());

    expect(screen.getByTestId(CONDITIONING_ORDER_SCREEN_TESTID)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.start })).toBeNull();
    const aviso = screen.getByTestId(CONDITIONING_ORDER_CANDIDATES_ERROR_TESTID);
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(aviso).toHaveAttribute('data-code', 'unauthorized');
  });

  it('un error inesperado de los candidatos no se disfraza de aviso', async () => {
    getConditioningOrderMock.mockResolvedValue(ROW);
    listConditioningTeamCandidatesMock.mockRejectedValue(new Error('fallo de base de datos'));

    await expect(invocar()).rejects.toThrow('fallo de base de datos');
  });
});

describe('«Datos de lote» y Terminar bloqueado', () => {
  const MINE = {
    ...ROW,
    status: 'EN_ACONDICIONAMIENTO',
    conditionedById: ACTOR_ID,
    conditionedByName: 'Acondicionador de Prueba',
  };
  const LINE = {
    batchId: '55555555-5555-4555-8555-555555555555',
    presentationId: 'pres-1',
    presentationName: 'Botella',
    packagingName: '1 L',
    packages: 10,
    provisionalLot: '0000042',
    lot: null,
    expiryDate: null,
    productionDate: null,
  };

  it('R4: con líneas sin datos, «Terminar» se pinta deshabilitado con el aviso', async () => {
    getConditioningOrderMock.mockResolvedValue({
      ...MINE,
      batchData: { lines: [LINE, { ...LINE, batchId: 'otro' }], missingCount: 2 },
    });

    render(await invocar());

    expect(screen.getByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish })).toBeDisabled();
    expect(screen.getByTestId(CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID)).toHaveTextContent(
      'Faltan los datos de lote de 2 líneas.',
    );
    expect(screen.getByTestId(CONDITIONING_BATCH_DATA_SECTION_TESTID)).toBeInTheDocument();
  });

  it('R4: con todas las líneas con datos, «Terminar» se habilita', async () => {
    getConditioningOrderMock.mockResolvedValue({
      ...MINE,
      batchData: {
        lines: [{ ...LINE, provisionalLot: null, lot: 'L-1', expiryDate: '2027-01-01', productionDate: '2026-10-01' }],
        missingCount: 0,
      },
    });

    render(await invocar());

    expect(screen.getByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish })).toBeEnabled();
    expect(screen.queryByTestId(CONDITIONING_ORDER_BATCH_DATA_MISSING_TESTID)).toBeNull();
  });

  it('R18: en TERMINADO propio pinta la sección editable y no ofrece «Terminar»', async () => {
    getConditioningOrderMock.mockResolvedValue({
      ...MINE,
      status: 'TERMINADO',
      batchData: { lines: [LINE], missingCount: 1 },
    });

    render(await invocar());

    expect(screen.getByTestId(CONDITIONING_BATCH_DATA_SECTION_TESTID)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish })).toBeNull();
    expect(listConditioningTeamCandidatesMock).not.toHaveBeenCalled();
  });

  it('R21: en ENTREGADO propio pinta la sección, sin «Acondicionar» ni «Terminar», y vuelve a «Entregados»', async () => {
    getConditioningOrderMock.mockResolvedValue({
      ...MINE,
      status: 'ENTREGADO',
      batchData: { lines: [LINE], missingCount: 1 },
    });

    render(await invocar());

    expect(listConditioningTeamCandidatesMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(CONDITIONING_BATCH_DATA_SECTION_TESTID)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.start })).toBeNull();
    expect(screen.queryByRole('button', { name: CONDITIONING_ACTIONS_TEXTS.finish })).toBeNull();
    expect(screen.getAllByRole('button').map((boton) => boton.textContent)).toEqual(['Guardar datos de lote']);
    const back = screen.getByTestId(CONDITIONING_ORDER_BACK_LINK_TESTID);
    expect(back).toHaveTextContent('Volver a «Entregados»');
    expect(back).toHaveAttribute('href', '/asignacion?vista=acondicionados_entregados');
  });

  it('R21: un ENTREGADO que no deja ver el caso de uso sigue dando 404', async () => {
    getConditioningOrderMock.mockRejectedValue(new OrderNotFoundError());

    await expect(invocar()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
