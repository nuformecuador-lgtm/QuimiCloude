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
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/modules/inventario';

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

vi.mock('@/lib/composition', () => ({
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
  roleName: 'Administrador',
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
  presentationId: '11111111-1111-4111-8111-111111111111',
  stock: '10',
  cost: '12.5000',
  minPurchase: '1',
  deliveryTime: '3',
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
    expect(actor).toEqual({ id: 'user-admin-1', roleName: 'Administrador' });
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

  it('relanza un error que no es de dominio, sin traducirlo', async () => {
    createProductMock.mockRejectedValue(new Error('fallo de infraestructura'));

    await expect(
      createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS)),
    ).rejects.toThrow('fallo de infraestructura');
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
        minPurchase: 1,
        unitId: '22222222-2222-4222-8222-222222222222',
      }),
      { id: 'user-admin-1', roleName: 'Administrador' },
    );
  });

  it('traduce not_found a su code estable', async () => {
    updateProductMock.mockRejectedValue(new NotFoundError());

    const result = await updateProductAction(
      'no-existe',
      MUTATION_INITIAL,
      formDataOf(VALID_PRODUCT_FIELDS),
    );

    expect(result).toEqual({ status: 'error', code: 'not_found', message: expect.any(String) });
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

    expect(deleteProductMock).toHaveBeenCalledWith('product-1', {
      id: 'user-admin-1',
      roleName: 'Administrador',
    });
    expect(result).toEqual({ status: 'success' });
  });
});

describe('getProductAction', () => {
  it('toma el actor de la sesion y traduce el resultado', async () => {
    const view = { id: 'product-1', name: 'Bidon 20 L' };
    getProductMock.mockResolvedValue(view);

    const result = await getProductAction('product-1');

    expect(getProductMock).toHaveBeenCalledWith('product-1', {
      id: 'user-admin-1',
      roleName: 'Administrador',
    });
    expect(result).toEqual({ status: 'success', data: view });
  });

  it('traduce not_found sin filtrar la excepcion', async () => {
    getProductMock.mockRejectedValue(new NotFoundError());

    const result = await getProductAction('no-existe');

    expect(result).toEqual({ status: 'error', code: 'not_found', message: expect.any(String) });
  });
});

describe('listProductsAction', () => {
  it('pasa la consulta y el actor tal cual al caso de uso, sin revalidar aqui', async () => {
    const page = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
    listProductsMock.mockResolvedValue(page);

    const result = await listProductsAction({ page: 1, pageSize: 10 });

    expect(listProductsMock).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      { id: 'user-admin-1', roleName: 'Administrador' },
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
