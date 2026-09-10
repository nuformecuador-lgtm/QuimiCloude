// T12 — Server Actions de producto (`design.md > 5`, `> 6.4`). Mockea `@/lib/composition`
// igual que `tests/unit/identity/login-action.test.ts` y `logout-action.test.ts`: la
// action se testea contra dobles, nunca contra el dominio real ni contra la sesion real.
//
// Cubre R28 (nombre EXACTO exigido por `tasks.md > Trazabilidad`), mas: que el actor sale
// de `identity.getSessionUser()` (`design.md > 5`, D17) y que cada error de dominio se
// traduce a su `code` estable sin filtrar la excepcion cruda (`design.md > 6.4`).

import {
  createProductAction,
  deleteProductAction,
  getProductAction,
  listProductsAction,
  updateProductAction,
  type CreateProductFormState,
  type ProductMutationFormState,
} from '@/lib/modules/inventario/adapters/driving/product-actions';
import { errorMessage } from '@/lib/modules/errores';
import {
  ProductNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/inventario';

const {
  createProductMock,
  updateProductMock,
  deleteProductMock,
  getProductMock,
  listProductsMock,
  getSessionUserMock,
} = vi.hoisted(() => ({
  createProductMock: vi.fn(),
  updateProductMock: vi.fn(),
  deleteProductMock: vi.fn(),
  getProductMock: vi.fn(),
  listProductsMock: vi.fn(),
  getSessionUserMock: vi.fn(),
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
  identity: { getSessionUser: getSessionUserMock },
  inventario: {
    createProduct: createProductMock,
    updateProduct: updateProductMock,
    deleteProduct: deleteProductMock,
    getProduct: getProductMock,
    listProducts: listProductsMock,
  },
}));

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  // `roleName` se queda porque `SessionUser` lo conserva para pintar (display), pero la
  // action YA NO lo lee: QC-74 (R18) construye el actor con `permissions` y nada mas.
  roleName: 'Administrador',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/** El actor que la action debe construir a partir de esa sesion (QC-74, design.md > 4). */
const ADMIN_ACTOR = {
  id: 'user-admin-1',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }
  return formData;
}

const CREATE_INITIAL: CreateProductFormState = { status: 'idle' };
const MUTATION_INITIAL: ProductMutationFormState = { status: 'idle' };

const VALID_PRODUCT_FIELDS = {
  name: 'Bidon 20 L',
  stock: '10',
  qtyAlert: '2',
  // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. El formulario ya no
  // envia `unit: 'litro'` (texto libre) sino `unitId`, el identificador de la unidad elegida
  // del catalogo. Cambia el NOMBRE y la FORMA del campo del `FormData`, no lo que este
  // fixture representa: un alta valida con todos los campos rellenos.
  unitId: '22222222-2222-4222-8222-222222222222',
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
});

describe('createProductAction', () => {
  it('la Server Action rechaza la entrada invalida antes de llamar al caso de uso', async () => {
    const formData = formDataOf({ ...VALID_PRODUCT_FIELDS, stock: 'no-es-un-numero' });

    const result = await createProductAction(CREATE_INITIAL, formData);

    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('estado inesperado');
    expect(result.code).toBe('invalid_input');
    expect(createProductMock).not.toHaveBeenCalled();
  });

  it('toma el actor de identity.getSessionUser() y se lo pasa al caso de uso', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });

    await createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(createProductMock).toHaveBeenCalledTimes(1);
    const [, actor] = createProductMock.mock.calls[0] as [unknown, unknown];
    expect(actor).toEqual(ADMIN_ACTOR);
  });

  it('pasa un actor null al caso de uso cuando no hay sesion (falla cerrado, R3)', async () => {
    getSessionUserMock.mockResolvedValue(null);
    createProductMock.mockRejectedValue(new UnauthorizedError());

    const result = await createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    const [, actor] = createProductMock.mock.calls[0] as [unknown, unknown];
    expect(actor).toBeNull();
    expect(result).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: expect.any(String),
    });
  });

  it('devuelve exito con el id creado cuando el caso de uso resuelve', async () => {
    createProductMock.mockResolvedValue({ id: 'product-42' });

    const result = await createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    expect(result).toEqual({ status: 'success', id: 'product-42' });
  });

  it('traduce cada error de dominio a su code serializable sin filtrar la excepcion', async () => {
    createProductMock.mockRejectedValue(new ValidationError());

    const result = await createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
  });

  // QC-70 (R12, R13): antes este caso fijaba el RELANZADO (`rejects.toThrow`). La decision
  // cerrada del 2026-09-08 lo cambia: el error ajeno a la familia se traduce a `unexpected`
  // con el mensaje neutro del catalogo, y el detalle real va al log del servidor y solo ahi.
  // Por eso el caso no solo mira el codigo: comprueba que NINGUN campo del estado -ni el
  // serializado entero- contiene el texto del error original.
  it('devuelve el estado generico, sin filtrar el error que no es de dominio (R12, R13)', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ajeno = new Error('fallo de infraestructura');
    createProductMock.mockRejectedValue(ajeno);

    const result = await createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    expect(result).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      // QC-71 (R13): el estado del error INESPERADO vuelve con el identificador de la
      // peticion —el mismo que se escribio en la linea del registro—, y su ausencia ya no
      // compila (R16). El catalogado sigue sin el (R15).
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(result)).not.toContain('fallo de infraestructura');
    for (const value of Object.values(result)) {
      expect(String(value)).not.toContain('fallo de infraestructura');
    }
    // R14: el detalle si llega al registro del servidor, que es el unico sitio donde aparece.
    // QC-71 (R10, R12): la linea del registro deja de ser el objeto de QC-70 y pasa a ser UNA
    // linea de texto con el identificador, el origen, el codigo y el detalle del error —nombre,
    // mensaje y traza, y nada mas—. Lo que este caso fijaba NO se relaja: el texto del error
    // original sigue llegando entero al registro, y solo ahi.
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[error] requestId=${REQUEST_ID_DE_PRUEBA} origen=borde code=unexpected error=${ajeno.name}: ${ajeno.message}`),
    );

    logSpy.mockRestore();
  });
});

describe('updateProductAction', () => {
  it('rechaza la entrada invalida antes de llamar al caso de uso', async () => {
    const formData = formDataOf({ ...VALID_PRODUCT_FIELDS, qtyAlert: 'abc' });

    const result = await updateProductAction('product-1', MUTATION_INITIAL, formData);

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it('llama al caso de uso con el id, la entrada convertida y el actor de la sesion', async () => {
    updateProductMock.mockResolvedValue(undefined);

    await updateProductAction('product-1', MUTATION_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    expect(updateProductMock).toHaveBeenCalledWith(
      'product-1',
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Se anade `unitId`
      // a la asercion para que el campo nuevo SIGA MORDIENDO: la Server Action tiene que
      // leerlo del `FormData` con su nombre nuevo y pasarlo al caso de uso tal cual, sin
      // interpretarlo (la unidad sigue siendo anotativa, QC-32 R14).
      expect.objectContaining({
        name: 'Bidon 20 L',
        stock: 10,
        unitId: '22222222-2222-4222-8222-222222222222',
      }),
      ADMIN_ACTOR,
    );
  });

  it('traduce product_not_found a su code estable (QC-70 R17)', async () => {
    updateProductMock.mockRejectedValue(new ProductNotFoundError());

    const result = await updateProductAction(
      'no-existe',
      MUTATION_INITIAL,
      formDataOf(VALID_PRODUCT_FIELDS),
    );

    expect(result).toEqual({ status: 'error', code: 'product_not_found', message: expect.any(String) });
  });
});

// QC-52 (R1, R5): la Server Action dejo de leer `cost`, `minPurchase` y `deliveryTime`
// del `FormData`. Se prueba con el caso hostil -un `FormData` que SI los trae, como lo
// enviaria un formulario viejo cacheado o un `curl`-: el candidato que llega al caso de
// uso no puede contenerlos, porque si los leyera el `strictObject` rechazaria un alta que
// deberia funcionar. `presentationId` entro al mismo club el 2026-09-09, al mudarse la
// presentacion a `product_batches`.
describe('los campos que el producto perdio no cruzan la Server Action', () => {
  it('no los lee del FormData aunque vengan, ni al crear ni al editar', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });
    updateProductMock.mockResolvedValue(undefined);

    const conSobras = formDataOf({
      ...VALID_PRODUCT_FIELDS,
      cost: '12.5000',
      minPurchase: '1',
      deliveryTime: '3',
      presentationId: '11111111-1111-4111-8111-111111111111',
    });

    await createProductAction(CREATE_INITIAL, conSobras);
    await updateProductAction('product-1', MUTATION_INITIAL, conSobras);

    for (const mock of [createProductMock, updateProductMock]) {
      const candidato = mock.mock.calls[0]?.[mock === createProductMock ? 0 : 1] as Record<
        string,
        unknown
      >;
      // Ancla: si `candidato` no fuera el argumento correcto (o fuera `undefined`), los
      // `not.toContain` pasarian por vacio y el test no mediria nada.
      expect(Object.keys(candidato)).toContain('name');
      expect(Object.keys(candidato)).not.toContain('cost');
      expect(Object.keys(candidato)).not.toContain('minPurchase');
      expect(Object.keys(candidato)).not.toContain('deliveryTime');
      expect(Object.keys(candidato)).not.toContain('presentationId');
    }
  });
});

describe('deleteProductAction', () => {
  it('rechaza cuando falta el id, sin llamar al caso de uso', async () => {
    const result = await deleteProductAction(MUTATION_INITIAL, formDataOf({}));

    expect(result.status).toBe('error');
    expect(deleteProductMock).not.toHaveBeenCalled();
  });

  it('llama al caso de uso con el id y el actor, y traduce exito', async () => {
    deleteProductMock.mockResolvedValue(undefined);

    const result = await deleteProductAction(MUTATION_INITIAL, formDataOf({ id: 'product-1' }));

    expect(deleteProductMock).toHaveBeenCalledWith('product-1', ADMIN_ACTOR);
    expect(result).toEqual({ status: 'success' });
  });
});

describe('getProductAction', () => {
  it('toma el actor de la sesion y traduce el resultado', async () => {
    const view = { id: 'product-1', name: 'Bidon 20 L' };
    getProductMock.mockResolvedValue(view);

    const result = await getProductAction('product-1');

    expect(getProductMock).toHaveBeenCalledWith('product-1', ADMIN_ACTOR);
    expect(result).toEqual({ status: 'success', data: view });
  });

  it('traduce product_not_found sin filtrar la excepcion (QC-70 R17)', async () => {
    getProductMock.mockRejectedValue(new ProductNotFoundError());

    const result = await getProductAction('no-existe');

    expect(result).toEqual({ status: 'error', code: 'product_not_found', message: expect.any(String) });
  });
});

describe('listProductsAction', () => {
  it('pasa la consulta y el actor tal cual al caso de uso, sin revalidar aqui', async () => {
    const page = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
    listProductsMock.mockResolvedValue(page);

    const result = await listProductsAction({ page: 1, pageSize: 10 });

    expect(listProductsMock).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      ADMIN_ACTOR,
    );
    expect(result).toEqual({ status: 'success', data: page });
  });

  it('traduce invalid_input cuando el caso de uso rechaza la consulta', async () => {
    listProductsMock.mockRejectedValue(new ValidationError());

    const result = await listProductsAction({ page: 0 });

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: expect.any(String),
    });
  });
});
