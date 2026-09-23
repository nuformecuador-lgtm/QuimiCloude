import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  BatchDuplicateLotError,
  PRODUCT_TYPES,
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
  getSessionContextMock,
} = vi.hoisted(() => ({
  createProductMock: vi.fn(),
  updateProductMock: vi.fn(),
  deleteProductMock: vi.fn(),
  getProductMock: vi.fn(),
  listProductsMock: vi.fn(),
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
  // `SessionUser` conserva `roleName` para pintarlo; la action construye el actor sin leerlo.
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
  type: PRODUCT_TYPES.PRODUCT,
};

/** Un `FormData` manipulado: nadie lo pinta, pero el borde no puede fiarse de eso. */
const UNIDAD_COLADA = { unitId: '22222222-2222-4222-8222-222222222222' };

/**
 * Aparte de `VALID_PRODUCT_FIELDS` porque la EDICION no envia los campos del lote y sus casos
 * usan solo el fixture del producto.
 */
const VALID_BATCH_FIELDS = {
  presentationId: '11111111-1111-4111-8111-111111111111',
  unitCost: '12.3456',
  totalCost: '123.4560',
  lot: 'L-2026-001',
  expiryDate: '2027-01-31',
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
  getSessionContextMock.mockResolvedValue(ADMIN_SESSION_CONTEXT);
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
    createProductMock.mockResolvedValue({ id: 'product-42', lot: '1' });

    const result = await createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    expect(result).toEqual({ status: 'success', id: 'product-42', lot: '1' });
  });

  it('createProductAction devuelve el lote en el estado de exito (R12)', async () => {
    // El texto exacto es el que el caso de uso devuelve, sea el correlativo generado o el
    // que tecleo la persona: la action no lo reinterpreta.
    createProductMock.mockResolvedValue({ id: 'product-42', lot: 'L-2026-001' });

    const result = await createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    expect(result).toEqual({ status: 'success', id: 'product-42', lot: 'L-2026-001' });
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

  // El detalle del error ajeno va al log del servidor y solo ahi: por eso se barre el estado
  // entero, y no solo su codigo, buscando el texto del error original.
  it('devuelve el estado generico, sin filtrar el error que no es de dominio (R12, R13)', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ajeno = new Error('fallo de infraestructura');
    createProductMock.mockRejectedValue(ajeno);

    const result = await createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    expect(result).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(result)).not.toContain('fallo de infraestructura');
    for (const value of Object.values(result)) {
      expect(String(value)).not.toContain('fallo de infraestructura');
    }
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
      expect.objectContaining({
        name: 'Bidon 20 L',
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

// Con un `FormData` que SI los trae, como un formulario viejo cacheado o un `curl`: si la action
// los leyera, el `strictObject` rechazaria un alta que deberia funcionar.
describe('los campos que el producto perdio no cruzan la Server Action', () => {
  it('no los lee del FormData aunque vengan, ni al crear ni al editar', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });
    updateProductMock.mockResolvedValue(undefined);

    const conSobras = formDataOf({
      ...VALID_PRODUCT_FIELDS,
      cost: '12.5000',
      minPurchase: '1',
      deliveryTime: '3',
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

describe('el primer lote viaja del FormData al caso de uso (QC-90)', () => {
  it('hace llegar los cinco campos del lote al caso de uso, tal cual, como cadenas (R25)', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });

    await createProductAction(
      CREATE_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS }),
    );

    const [candidato] = createProductMock.mock.calls[0] as [Record<string, unknown>];
    // `toEqual` sobre el objeto EXACTO, no `objectContaining`: el esquema del alta es
    // `strictObject`, asi que un campo de mas no seria un detalle sino un `invalid_input`.
    expect(candidato).toEqual({
      name: 'Bidon 20 L',
      stock: '10',
      qtyAlert: '2',
      type: PRODUCT_TYPES.PRODUCT,
      presentationId: '11111111-1111-4111-8111-111111111111',
      unitCost: '12.3456',
      totalCost: '123.4560',
      lot: 'L-2026-001',
      expiryDate: '2027-01-31',
    });
  });

  it('pasa los importes como cadena, con sus decimales intactos, y nunca como number (R4)', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });

    await createProductAction(
      CREATE_INITIAL,
      formDataOf({
        ...VALID_PRODUCT_FIELDS,
        ...VALID_BATCH_FIELDS,
        // Cuatro decimales, que es la precision exacta de `decimal(14,4)`, y un total con
        // ceros a la derecha: convertirlo a numero los perderia y el valor que se guarda
        // dejaria de ser el que se escribio.
        unitCost: '1234.5678',
        totalCost: '9.8700',
      }),
    );

    const [candidato] = createProductMock.mock.calls[0] as [Record<string, unknown>];
    expect(typeof candidato.unitCost).toBe('string');
    expect(typeof candidato.totalCost).toBe('string');
    expect(candidato.unitCost).toBe('1234.5678');
    expect(candidato.totalCost).toBe('9.8700');
  });

  it('hace llegar un campo del lote vacio como ausente, no como cadena vacia (R12)', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });

    await createProductAction(
      CREATE_INITIAL,
      formDataOf({
        ...VALID_PRODUCT_FIELDS,
        ...VALID_BATCH_FIELDS,
        // El panel envia los campos SIEMPRE, vacios incluidos: un `<input>` sin escribir
        // viaja como ''. El esquema los admite `nullish()`, asi que `undefined` es valido y
        // una cadena vacia seria `invalid_input`.
        lot: '',
        expiryDate: '',
        totalCost: '   ',
      }),
    );

    const [candidato] = createProductMock.mock.calls[0] as [Record<string, unknown>];
    expect(candidato.lot).toBeUndefined();
    expect(candidato.expiryDate).toBeUndefined();
    expect(candidato.totalCost).toBeUndefined();
    // Ausentes de verdad, no presentes con '': el ancla evita que `toBeUndefined` pase por
    // una clave que ni siquiera se estuviera leyendo.
    expect(candidato.presentationId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('no repite el permiso ni ninguna regla: traduce el rechazo del caso de uso y ya', async () => {
    // El actor de la sesion SI tiene `inventario.modificar`: el rechazo solo puede venir del
    // doble, y la action tiene que traducirlo sin decidir el permiso por su cuenta.
    createProductMock.mockRejectedValue(new UnauthorizedError());

    const result = await createProductAction(
      CREATE_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS }),
    );

    expect(createProductMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
  });

  it('la edicion no envia ningun campo de lote aunque el FormData los traiga (R26)', async () => {
    updateProductMock.mockResolvedValue(undefined);

    await updateProductAction(
      'product-1',
      MUTATION_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS }),
    );

    const [, candidato] = updateProductMock.mock.calls[0] as [string, Record<string, unknown>];
    // `updateProductSchema` es una union discriminada `strictObject` y NO conoce el lote: si el
    // candidato de la edicion ganara estos cinco campos, cada edicion moriria con `invalid_input`.
    expect(candidato).toEqual({
      name: 'Bidon 20 L',
      qtyAlert: '2',
      type: PRODUCT_TYPES.PRODUCT,
    });
    for (const campo of Object.keys(VALID_BATCH_FIELDS)) {
      expect(Object.keys(candidato)).not.toContain(campo);
    }
  });

  it('la edicion no lee la existencia del FormData aunque venga: R9', async () => {
    updateProductMock.mockResolvedValue(undefined);

    await updateProductAction('product-1', MUTATION_INITIAL, formDataOf(VALID_PRODUCT_FIELDS));

    const [, candidato] = updateProductMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(candidato)).not.toContain('stock');
  });

  it('ni el alta ni la edicion leen `unitId` del FormData, aunque venga (QC-80, R21)', async () => {
    // Que el formulario no pinte el campo no basta: un `FormData` se construye a mano. Y el
    // candidato tiene que salir SIN la clave: los dos esquemas son `strictObject`, asi que colarla
    // mataria cada alta y cada edicion con `invalid_input`.
    createProductMock.mockResolvedValue({ id: 'producto-1' });
    updateProductMock.mockResolvedValue(undefined);

    await createProductAction(
      CREATE_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS, ...UNIDAD_COLADA }),
    );
    await updateProductAction(
      'product-1',
      MUTATION_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...UNIDAD_COLADA }),
    );

    const [candidatoAlta] = createProductMock.mock.calls[0] as [Record<string, unknown>];
    const [, candidatoEdicion] = updateProductMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(candidatoAlta)).not.toContain('unitId');
    expect(Object.keys(candidatoEdicion)).not.toContain('unitId');
  });

  it('no convierte ningun importe a numero de coma flotante en el codigo fuente (R4)', () => {
    // Sobre el TEXTO del archivo: una conversion intermedia daria el mismo resultado en los casos
    // de arriba y aun asi pasaria el importe por coma flotante.
    const fuente = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'lib',
        'modules',
        'inventario',
        'adapters',
        'driving',
        'product-actions.ts',
      ),
      'utf8',
    );

    // Los comentarios se quitan primero: un comentario que nombre una funcion prohibida no es
    // una conversion y no debe poner el barrido en rojo.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const prohibido of ['parseFloat', 'parseInt', 'toFixed', 'Number.parse']) {
      expect(codigo.includes(prohibido), `product-actions.ts no puede usar ${prohibido}`).toBe(
        false,
      );
    }

    // `stock` y `qtyAlert` son decimales y viajan como cadena, igual que los importes: ya no
    // pasan por `Number(`.
    expect(codigo).not.toMatch(/Number\(/);

    for (const linea of codigo.split('\n')) {
      if (!linea.includes('unitCost') && !linea.includes('totalCost')) continue;
      expect(linea).not.toMatch(/Number\(|parseFloat|readOptionalFormInt/);
    }
  });
});

describe('QC-81 — la fecha de compra viaja del FormData al caso de uso', () => {
  it('hace llegar purchaseDate al caso de uso tal cual, como la cadena civil escrita (R2, R3)', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });

    await createProductAction(
      CREATE_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS, purchaseDate: '2026-09-01' }),
    );

    const [candidato] = createProductMock.mock.calls[0] as [Record<string, unknown>];
    // Objeto EXACTO: el esquema del alta es `strictObject`, asi que un campo de mas o con otro
    // nombre no seria un detalle sino un `invalid_input`.
    expect(candidato).toEqual({
      name: 'Bidon 20 L',
      stock: '10',
      qtyAlert: '2',
      type: PRODUCT_TYPES.PRODUCT,
      presentationId: '11111111-1111-4111-8111-111111111111',
      unitCost: '12.3456',
      totalCost: '123.4560',
      lot: 'L-2026-001',
      expiryDate: '2027-01-31',
      purchaseDate: '2026-09-01',
    });
    // Cadena y no `Date`: convertir es del adaptador driven, y un `Date` aqui ya habria elegido zona.
    expect(typeof candidato.purchaseDate).toBe('string');
  });

  it('sin purchaseDate en el FormData, o vacia, llega undefined para que el caso de uso ponga hoy (R2)', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });

    // Ausente: el formulario de hoy no la pinta.
    await createProductAction(CREATE_INITIAL, formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS }));
    // Vacia y en blanco: un `<input type="date">` sin rellenar viaja como ''.
    await createProductAction(
      CREATE_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS, purchaseDate: '' }),
    );
    await createProductAction(
      CREATE_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS, purchaseDate: '   ' }),
    );

    expect(createProductMock).toHaveBeenCalledTimes(3);
    for (const [candidato] of createProductMock.mock.calls as Array<[Record<string, unknown>]>) {
      expect(candidato.purchaseDate).toBeUndefined();
      // Ancla: el candidato es el del alta y trae su lote; sin esto `toBeUndefined` pasaria por vacio.
      expect(candidato.presentationId).toBe('11111111-1111-4111-8111-111111111111');
    }
  });

  it('la edicion sigue sin ningun campo de lote, tampoco purchaseDate, aunque el FormData lo traiga', async () => {
    updateProductMock.mockResolvedValue(undefined);

    await updateProductAction(
      'product-1',
      MUTATION_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS, purchaseDate: '2026-09-01' }),
    );

    const [, candidato] = updateProductMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(candidato).toEqual({ name: 'Bidon 20 L', qtyAlert: '2', type: PRODUCT_TYPES.PRODUCT });
    for (const campo of [...Object.keys(VALID_BATCH_FIELDS), 'purchaseDate']) {
      expect(Object.keys(candidato)).not.toContain(campo);
    }
  });

  it('MACHINE lleva solo existencia y fecha de compra al caso de uso, sin qtyAlert ni presentacion', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });

    await createProductAction(
      CREATE_INITIAL,
      formDataOf({
        name: 'Instrumento de laboratorio',
        type: PRODUCT_TYPES.MACHINE,
        stock: '9',
        // El formulario no pinta presentacion ni costos para Instrumento (2026-09-23):
        // aunque lleguen en el FormData, la action no los manda.
        presentationId: VALID_BATCH_FIELDS.presentationId,
        unitCost: VALID_BATCH_FIELDS.unitCost,
        purchaseDate: '2026-09-01',
        qtyAlert: '',
      }),
    );

    const [candidato] = createProductMock.mock.calls[0] as [Record<string, unknown>];
    expect(candidato).toEqual({
      name: 'Instrumento de laboratorio',
      type: PRODUCT_TYPES.MACHINE,
      stock: 9,
      purchaseDate: '2026-09-01',
    });
    expect(Object.keys(candidato)).not.toContain('qtyAlert');
    expect(Object.keys(candidato)).not.toContain('presentationId');
    expect(Object.keys(candidato)).not.toContain('unitCost');
  });

  it('MACHINE sin purchaseDate en el FormData llega undefined, y sigue sin qtyAlert', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });

    await createProductAction(
      CREATE_INITIAL,
      formDataOf({
        name: 'Instrumento de laboratorio',
        type: PRODUCT_TYPES.MACHINE,
        stock: '1',
        presentationId: VALID_BATCH_FIELDS.presentationId,
        unitCost: VALID_BATCH_FIELDS.unitCost,
        purchaseDate: '',
      }),
    );

    const [candidato] = createProductMock.mock.calls[0] as [Record<string, unknown>];
    expect(candidato).toEqual({
      name: 'Instrumento de laboratorio',
      type: PRODUCT_TYPES.MACHINE,
      stock: 1,
      purchaseDate: undefined,
    });
    expect(Object.keys(candidato)).not.toContain('qtyAlert');
    expect(Object.keys(candidato)).not.toContain('presentationId');
    expect(Object.keys(candidato)).not.toContain('unitCost');
  });

  it('entrega batch_duplicate_lot al llamante con el texto del catalogo, como los demas codigos (R13)', async () => {
    createProductMock.mockRejectedValue(new BatchDuplicateLotError('company-a: lote L-2026-001'));

    const result = await createProductAction(
      CREATE_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS }),
    );

    // Estado EXACTO: el diagnostico (empresa y lote) va al registro del servidor y no cruza al
    // navegador.
    expect(result).toEqual({
      status: 'error',
      code: 'batch_duplicate_lot',
      message: errorMessage('batch_duplicate_lot'),
    });
    expect(JSON.stringify(result)).not.toContain('L-2026-001');
  });
});

describe('QC-49 R12 — la empresa sale de getSessionContext y nunca del FormData', () => {
  const INVOCACIONES: ReadonlyArray<{
    readonly nombre: string;
    readonly mock: ReturnType<typeof vi.fn>;
    readonly invocar: (formData: FormData) => Promise<unknown>;
  }> = [
    {
      nombre: 'createProductAction',
      mock: createProductMock,
      invocar: (formData) => createProductAction(CREATE_INITIAL, formData),
    },
    {
      nombre: 'updateProductAction',
      mock: updateProductMock,
      invocar: (formData) => updateProductAction('product-1', MUTATION_INITIAL, formData),
    },
    {
      nombre: 'deleteProductAction',
      mock: deleteProductMock,
      invocar: () => deleteProductAction(MUTATION_INITIAL, formDataOf({ id: 'product-1' })),
    },
    {
      nombre: 'getProductAction',
      mock: getProductMock,
      invocar: () => getProductAction('product-1'),
    },
    {
      nombre: 'listProductsAction',
      mock: listProductsMock,
      invocar: () => listProductsAction({ page: 1, pageSize: 10 }),
    },
  ];

  function actorRecibido(mock: ReturnType<typeof vi.fn>): unknown {
    const llamada = mock.mock.calls.at(-1);
    if (llamada === undefined) throw new Error('el caso de uso no fue llamado');
    return llamada.at(-1);
  }

  it('las cinco actions piden LAS DOS caras de la sesion y componen el actor con la empresa', async () => {
    for (const { nombre, mock, invocar } of INVOCACIONES) {
      vi.clearAllMocks();
      getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER);
      getSessionContextMock.mockResolvedValue(ADMIN_SESSION_CONTEXT);
      mock.mockResolvedValue({ id: 'x', items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });

      await invocar(formDataOf(VALID_PRODUCT_FIELDS));

      expect(getSessionUserMock, nombre).toHaveBeenCalledTimes(1);
      expect(getSessionContextMock, nombre).toHaveBeenCalledTimes(1);
      expect(actorRecibido(mock), nombre).toEqual(ADMIN_ACTOR);
    }
  });

  it('sin contexto de sesion el actor es null ENTERO, no un actor a medias sin empresa', async () => {
    // Lo que se impide es un actor a medias, con `companyId: undefined`: el ambito que llegaria
    // a la consulta no seria de nadie.
    const AUSENCIAS = [
      { etiqueta: 'sin contexto de sesion', user: ADMIN_SESSION_USER, context: null },
      { etiqueta: 'sin usuario de sesion', user: null, context: ADMIN_SESSION_CONTEXT },
      { etiqueta: 'sin ninguna de las dos', user: null, context: null },
    ];

    for (const { etiqueta, user, context } of AUSENCIAS) {
      for (const { nombre, mock, invocar } of INVOCACIONES) {
        vi.clearAllMocks();
        getSessionUserMock.mockResolvedValue(user);
        getSessionContextMock.mockResolvedValue(context);
        mock.mockRejectedValue(new UnauthorizedError());

        const resultado = await invocar(formDataOf(VALID_PRODUCT_FIELDS));

        expect(actorRecibido(mock), `${nombre} ${etiqueta}`).toBeNull();
        expect(resultado, `${nombre} ${etiqueta}`).toEqual({
          status: 'error',
          code: 'unauthorized',
          message: expect.any(String),
        });
      }
    }
  });

  it('una companyId en el FormData no cambia la empresa ni llega al caso de uso', async () => {
    // Un campo oculto manipulado, o un `curl`: si el borde leyera la entrada, quien invoca la
    // action ELEGIRIA la empresa en cuyo nombre se escribe.
    createProductMock.mockResolvedValue({ id: 'product-1' });
    updateProductMock.mockResolvedValue(undefined);

    const conEmpresaColada = formDataOf({
      ...VALID_PRODUCT_FIELDS,
      ...VALID_BATCH_FIELDS,
      companyId: 'company-b',
      company_id: 'company-b',
    });

    await createProductAction(CREATE_INITIAL, conEmpresaColada);
    await updateProductAction('product-1', MUTATION_INITIAL, conEmpresaColada);

    for (const mock of [createProductMock, updateProductMock]) {
      const llamada = mock.mock.calls.at(-1);
      if (llamada === undefined) throw new Error('el caso de uso no fue llamado');

      expect(llamada.at(-1)).toEqual(ADMIN_ACTOR);
      // Si la empresa llegara en el candidato, el `strictObject` del esquema rechazaria el alta.
      const serializado = JSON.stringify(llamada.slice(0, -1));
      expect(serializado).not.toContain('companyId');
      expect(serializado).not.toContain('company_id');
      expect(serializado).not.toContain('company-b');
    }
  });
});

describe('QC-49 R19/R31 — ni la empresa sale al navegador ni cambian las firmas publicas', () => {
  it('ningun estado devuelto por las cinco actions contiene la empresa (R19)', async () => {
    createProductMock.mockResolvedValue({ id: 'product-1' });
    updateProductMock.mockResolvedValue(undefined);
    deleteProductMock.mockResolvedValue(undefined);
    getProductMock.mockResolvedValue({ id: 'product-1', name: 'Bidon 20 L' });
    listProductsMock.mockResolvedValue({
      items: [{ id: 'product-1', name: 'Bidon 20 L' }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const estados: readonly unknown[] = [
      await createProductAction(CREATE_INITIAL, formDataOf(VALID_PRODUCT_FIELDS)),
      await updateProductAction('product-1', MUTATION_INITIAL, formDataOf(VALID_PRODUCT_FIELDS)),
      await deleteProductAction(MUTATION_INITIAL, formDataOf({ id: 'product-1' })),
      await getProductAction('product-1'),
      await listProductsAction({ page: 1, pageSize: 10 }),
    ];

    // Ancla: los cinco estados tienen que ser de EXITO, o el barrido estaria mirando estados de
    // error vacios y pasaria en verde sin haber visto una sola salida con datos dentro.
    for (const estado of estados) {
      expect(estado).toMatchObject({ status: 'success' });
      const serializado = JSON.stringify(estado);
      expect(serializado).not.toContain('companyId');
      expect(serializado).not.toContain(ADMIN_SESSION_CONTEXT.companyId);
    }
  });

  it('las cinco Server Actions conservan su firma publica (R31)', () => {
    // Un parametro de mas -la empresa colada como argumento, por ejemplo- cambiaria el contrato
    // que consume la pantalla. La empresa entra por la sesion; la firma no se mueve.
    expect(createProductAction).toHaveLength(2);
    expect(updateProductAction).toHaveLength(3);
    expect(deleteProductAction).toHaveLength(2);
    expect(getProductAction).toHaveLength(1);
    expect(listProductsAction).toHaveLength(1);
  });
});
