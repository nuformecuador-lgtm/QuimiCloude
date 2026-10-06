import {
  adjustBatchStockAction,
  listBatchMovementsAction,
  listProductBatchesAction,
  type AdjustBatchStockFormState,
} from '@/lib/modules/inventario/adapters/driving/batch-actions';
import { errorMessage } from '@/lib/modules/errores';
import {
  BatchNotFoundError,
  BatchStockNegativeError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/inventario';
import { createAdjustBatchStock } from '@/lib/modules/inventario/domain/adjust-batch-stock';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

const {
  adjustBatchStockMock,
  listProductBatchesMock,
  listBatchMovementsMock,
  getSessionUserMock,
  getSessionContextMock,
} = vi.hoisted(() => ({
  adjustBatchStockMock: vi.fn(),
  listProductBatchesMock: vi.fn(),
  listBatchMovementsMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
}));

const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  inventario: {
    adjustBatchStock: adjustBatchStockMock,
    listProductBatches: listProductBatchesMock,
    listBatchMovements: listBatchMovementsMock,
  },
}));

const BATCH_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/** La empresa sale solo de aqui: `SessionUser` no la trae. */
const ADMIN_SESSION_CONTEXT = {
  userId: 'user-admin-1',
  companyId: 'company-a',
  roleName: 'Administrador',
};

const ADMIN_ACTOR = {
  id: 'user-admin-1',
  companyId: 'company-a',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

const OPERADOR_SESSION_USER = {
  id: 'user-operador-1',
  username: 'luis.mora',
  displayName: 'Luis Mora',
  roleName: 'Operador',
  permissions: ['inventario.consultar'],
};

const OPERADOR_SESSION_CONTEXT = {
  userId: 'user-operador-1',
  companyId: 'company-a',
  roleName: 'Operador',
};

const INITIAL: AdjustBatchStockFormState = { status: 'idle' };

const VALID_ADJUST_FIELDS = {
  batchId: BATCH_ID,
  countedStock: '5',
  seenStock: '10',
  reason: 'merma',
};

function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
  getSessionContextMock.mockResolvedValue(ADMIN_SESSION_CONTEXT);
});

describe('adjustBatchStockAction', () => {
  it('devuelve la existencia nueva que calculo el caso de uso', async () => {
    adjustBatchStockMock.mockResolvedValue({ stock: 12 });

    const result = await adjustBatchStockAction(INITIAL, formDataOf(VALID_ADJUST_FIELDS));

    expect(result).toEqual({ status: 'success', stock: 12 });
  });

  it('R18 — el actor sale de la sesion del servidor y llega al caso de uso', async () => {
    adjustBatchStockMock.mockResolvedValue({ stock: 1 });

    await adjustBatchStockAction(INITIAL, formDataOf(VALID_ADJUST_FIELDS));

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionContextMock).toHaveBeenCalledTimes(1);
    const [, actor] = adjustBatchStockMock.mock.calls[0] as [unknown, unknown];
    expect(actor).toEqual(ADMIN_ACTOR);
  });

  it('R18 — una empresa colada en el FormData no cambia el actor ni el candidato', async () => {
    adjustBatchStockMock.mockResolvedValue({ stock: 1 });

    await adjustBatchStockAction(
      INITIAL,
      formDataOf({ ...VALID_ADJUST_FIELDS, companyId: 'company-b' }),
    );

    const [candidato, actor] = adjustBatchStockMock.mock.calls[0] as [
      Record<string, unknown>,
      unknown,
    ];
    expect(actor).toEqual(ADMIN_ACTOR);
    expect(Object.keys(candidato)).not.toContain('companyId');
    expect(JSON.stringify(candidato)).not.toContain('company-b');
  });

  it('pasa un actor null al caso de uso cuando no hay usuario de sesion', async () => {
    getSessionUserMock.mockResolvedValue(null);
    adjustBatchStockMock.mockRejectedValue(new UnauthorizedError());

    await adjustBatchStockAction(INITIAL, formDataOf(VALID_ADJUST_FIELDS));

    const [, actor] = adjustBatchStockMock.mock.calls[0] as [unknown, unknown];
    expect(actor).toBeNull();
  });

  it('pasa un actor null al caso de uso cuando no hay contexto de empresa', async () => {
    getSessionContextMock.mockResolvedValue(null);
    adjustBatchStockMock.mockRejectedValue(new UnauthorizedError());

    await adjustBatchStockAction(INITIAL, formDataOf(VALID_ADJUST_FIELDS));

    const [, actor] = adjustBatchStockMock.mock.calls[0] as [unknown, unknown];
    expect(actor).toBeNull();
  });

  it('R20 — el Operador, que solo consulta, recibe el error de autorizacion del ajuste', async () => {
    getSessionUserMock.mockResolvedValue(OPERADOR_SESSION_USER);
    getSessionContextMock.mockResolvedValue(OPERADOR_SESSION_CONTEXT);
    adjustBatchStockMock.mockRejectedValue(new UnauthorizedError());

    const result = await adjustBatchStockAction(INITIAL, formDataOf(VALID_ADJUST_FIELDS));

    const [, actor] = adjustBatchStockMock.mock.calls[0] as [unknown, unknown];
    expect(actor).toEqual({
      id: 'user-operador-1',
      companyId: 'company-a',
      permissions: ['inventario.consultar'],
    });
    expect(result).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
  });

  it('el total contado y la existencia vista llegan al caso de uso tal cual, sin diferencia calculada', async () => {
    adjustBatchStockMock.mockResolvedValue({ stock: '3.0000', reserved: '0.0000', overReserved: false });

    await adjustBatchStockAction(
      INITIAL,
      formDataOf({ ...VALID_ADJUST_FIELDS, countedStock: '3', seenStock: '10' }),
    );

    const [candidato] = adjustBatchStockMock.mock.calls[0] as [Record<string, unknown>];
    expect(candidato).toEqual({ batchId: BATCH_ID, countedStock: '3', seenStock: '10', reason: 'merma' });
  });

  it.each(['1e3', 'doce', '-3', '12.'])(
    'un total contado %j no decimal termina en invalid_input del caso de uso, sin escribir',
    async (countedStock) => {
      const repoAdjust = vi.fn();
      const casoDeUsoReal = createAdjustBatchStock({
        products: { adjustBatchStock: repoAdjust } as unknown as ProductRepository,
      });
      adjustBatchStockMock.mockImplementation(casoDeUsoReal);

      const result = await adjustBatchStockAction(
        INITIAL,
        formDataOf({ ...VALID_ADJUST_FIELDS, countedStock }),
      );

      const [candidato] = adjustBatchStockMock.mock.calls[0] as [Record<string, unknown>];
      expect(candidato.delta).toBeUndefined();
      expect(result).toEqual({
        status: 'error',
        code: 'invalid_input',
        message: errorMessage('invalid_input'),
      });
      expect(repoAdjust).not.toHaveBeenCalled();
    },
  );

  it('el motivo viaja tal cual: la forma la valida el caso de uso y devuelve invalid_input', async () => {
    adjustBatchStockMock.mockRejectedValue(new ValidationError());

    const result = await adjustBatchStockAction(
      INITIAL,
      formDataOf({ ...VALID_ADJUST_FIELDS, reason: 'motivo-inventado' }),
    );

    const [candidato] = adjustBatchStockMock.mock.calls[0] as [Record<string, unknown>];
    expect(candidato.reason).toBe('motivo-inventado');
    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: errorMessage('invalid_input'),
    });
  });

  it('traduce batch_not_found con el texto del catalogo y sin el diagnostico', async () => {
    adjustBatchStockMock.mockRejectedValue(new BatchNotFoundError(`company-a: lote ${BATCH_ID}`));

    const result = await adjustBatchStockAction(INITIAL, formDataOf(VALID_ADJUST_FIELDS));

    expect(result).toEqual({
      status: 'error',
      code: 'batch_not_found',
      message: errorMessage('batch_not_found'),
    });
    expect(JSON.stringify(result)).not.toContain('company-a');
  });

  it('traduce batch_stock_negative con el texto del catalogo y sin el diagnostico', async () => {
    adjustBatchStockMock.mockRejectedValue(new BatchStockNegativeError(`lote ${BATCH_ID}: -3`));

    const result = await adjustBatchStockAction(INITIAL, formDataOf(VALID_ADJUST_FIELDS));

    expect(result).toEqual({
      status: 'error',
      code: 'batch_stock_negative',
      message: errorMessage('batch_stock_negative'),
    });
    expect(JSON.stringify(result)).not.toContain(BATCH_ID);
  });
});

describe('listProductBatchesAction', () => {
  it('devuelve los lotes del producto', async () => {
    const lotes = [{ id: BATCH_ID, lot: 'L-2026-001', stock: 10 }];
    listProductBatchesMock.mockResolvedValue(lotes);

    const result = await listProductBatchesAction(PRODUCT_ID);

    expect(result).toEqual({ status: 'success', data: lotes });
    expect(listProductBatchesMock).toHaveBeenCalledWith(PRODUCT_ID, ADMIN_ACTOR);
  });

  it('R18 — sin contexto de empresa el caso de uso recibe un actor null', async () => {
    getSessionContextMock.mockResolvedValue(null);
    listProductBatchesMock.mockRejectedValue(new UnauthorizedError());

    const result = await listProductBatchesAction(PRODUCT_ID);

    expect(listProductBatchesMock).toHaveBeenCalledWith(PRODUCT_ID, null);
    expect(result).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
  });

  it('traduce el identificador invalido a invalid_input', async () => {
    listProductBatchesMock.mockRejectedValue(new ValidationError());

    const result = await listProductBatchesAction('no-es-un-uuid');

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: errorMessage('invalid_input'),
    });
  });
});

describe('listBatchMovementsAction', () => {
  it('devuelve el historial del lote', async () => {
    const asientos = [{ id: 'mov-1', quantity: -2, reason: 'merma', authorName: 'Ana Perez' }];
    listBatchMovementsMock.mockResolvedValue(asientos);

    const result = await listBatchMovementsAction(BATCH_ID);

    expect(result).toEqual({ status: 'success', data: asientos });
    expect(listBatchMovementsMock).toHaveBeenCalledWith(BATCH_ID, ADMIN_ACTOR);
  });

  it('pasa un actor null cuando no hay usuario de sesion', async () => {
    getSessionUserMock.mockResolvedValue(null);
    listBatchMovementsMock.mockRejectedValue(new UnauthorizedError());

    const result = await listBatchMovementsAction(BATCH_ID);

    expect(listBatchMovementsMock).toHaveBeenCalledWith(BATCH_ID, null);
    expect(result).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
  });

  it('traduce batch_not_found con el texto del catalogo y sin el diagnostico', async () => {
    listBatchMovementsMock.mockRejectedValue(new BatchNotFoundError('company-a: lote ajeno'));

    const result = await listBatchMovementsAction(BATCH_ID);

    expect(result).toEqual({
      status: 'error',
      code: 'batch_not_found',
      message: errorMessage('batch_not_found'),
    });
    expect(JSON.stringify(result)).not.toContain('company-a');
  });

  it('traduce el error generico sin filtrar el detalle al navegador', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    listBatchMovementsMock.mockRejectedValue(new Error('fallo de infraestructura'));

    const result = await listBatchMovementsAction(BATCH_ID);

    expect(result).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(result)).not.toContain('fallo de infraestructura');

    logSpy.mockRestore();
  });
});
