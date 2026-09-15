// T12 — Server Actions de producto (`design.md > 5`, `> 6.4`). Mockea `@/lib/composition`
// igual que `tests/unit/identity/login-action.test.ts` y `logout-action.test.ts`: la
// action se testea contra dobles, nunca contra el dominio real ni contra la sesion real.
//
// Cubre R28 (nombre EXACTO exigido por `tasks.md > Trazabilidad`), mas: que el actor sale
// de `identity.getSessionUser()` (`design.md > 5`, D17) y que cada error de dominio se
// traduce a su `code` estable sin filtrar la excepcion cruda (`design.md > 6.4`).

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
  // QC-49 (R12): la SEGUNDA cara de la sesion. La action pide las dos en paralelo y la
  // empresa sale de esta, nunca del `FormData`.
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

/**
 * QC-49 (R12, `design.md > 4.1`): el contexto de sesion del SERVIDOR. De aqui -y solo de
 * aqui- sale la empresa en cuyo nombre opera la action. `SessionUser` no la trae y no va a
 * traerla: son dos proyecciones distintas de la sesion (QC-48).
 */
const ADMIN_SESSION_CONTEXT = {
  userId: 'user-admin-1',
  companyId: 'company-a',
  roleName: 'Administrador',
};

/** El actor que la action debe construir a partir de esa sesion (QC-74, design.md > 4). */
const ADMIN_ACTOR = {
  id: 'user-admin-1',
  // QC-49 (R11): la empresa viaja DENTRO del actor, tomada del contexto de sesion.
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
  // QC-80 (R21): AQUI estaba `unitId`. El producto dejo de declarar unidad -la columna
  // `products.unit_id` ya no existe-, asi que un alta valida con TODOS los campos rellenos son
  // exactamente estos tres. Que la unidad no llegue al caso de uso NI AUNQUE alguien la meta en
  // el `FormData` tiene su propio caso, abajo.
};

/** Un `FormData` manipulado: nadie lo pinta, pero el borde no puede fiarse de eso (R21). */
const UNIDAD_COLADA = { unitId: '22222222-2222-4222-8222-222222222222' };

/**
 * QC-90 (R25): los CINCO campos del lote que el panel de alta hace viajar. Se declaran
 * aparte de `VALID_PRODUCT_FIELDS` porque la EDICION no los envia (R26) y sus casos siguen
 * usando solo el fixture del producto.
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
      expect.objectContaining({
        name: 'Bidon 20 L',
        stock: 10,
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

  // `presentationId` estuvo en esta lista desde el 2026-09-09, cuando la presentacion se
  // mudo de `products` a `product_batches` y el producto dejo de tenerla. QC-90 (R25) la
  // saca de aqui: el ALTA vuelve a enviarla, pero como campo DEL LOTE, no del producto. La
  // edicion sigue sin enviarla, y eso lo fija el caso de R26 mas abajo.
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

/**
 * QC-90 — el primer lote cruza la Server Action (T9). Cubre **R25** por el lado servidor
 * -los cinco campos escritos en el panel viajan al caso de uso-, **R26** por el lado de la
 * action -la edicion no envia ninguno- y **R4** -ningun importe pasa por coma flotante-.
 */
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
      stock: 10,
      qtyAlert: 2,
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
    // La autorizacion es la PRIMERA linea del caso de uso (R23, criterio de QC-20). Con un
    // doble que lanza `UnauthorizedError`, la action tiene que devolver el estado del
    // catalogo sin comprobar nada por su cuenta: si repitiera el permiso, el actor de la
    // sesion -que SI tiene `inventario.modificar`- pasaria y el caso de uso ni se llamaria.
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
    // `updateProductSchema` es `strictObject` y NO conoce el lote: si el candidato de la
    // edicion ganara estos cinco campos, cada edicion moriria con `invalid_input`.
    expect(candidato).toEqual({
      name: 'Bidon 20 L',
      stock: 10,
      qtyAlert: 2,
    });
    for (const campo of Object.keys(VALID_BATCH_FIELDS)) {
      expect(Object.keys(candidato)).not.toContain(campo);
    }
  });

  it('ni el alta ni la edicion leen `unitId` del FormData, aunque venga (QC-80, R21)', async () => {
    // R21 — «en ningun punto del camino», y este punto es el `FormData`. Que el formulario ya
    // no pinte el campo NO basta: un `FormData` se construye a mano, y hasta QC-80 esta action
    // leia `unitId` con `readOptionalFormString`. Lo que se exige es que no lo LEA, de modo que
    // el candidato no pueda llevarlo ni por accidente.
    //
    // Importa que el candidato salga SIN la clave y no que el caso de uso lo rechace despues:
    // `createProductWithFirstBatchSchema` y `updateProductSchema` son `strictObject`, asi que
    // colarlo aqui no seria un campo ignorado sino cada alta y cada edicion muertas con
    // `invalid_input`.
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
    // Comprobacion sobre el TEXTO del archivo, con el mismo patron que
    // `tests/unit/inventario/unit-cost.test.ts`: una conversion intermedia daria el mismo
    // resultado en los casos de arriba y aun asi seria exactamente lo que R4 prohibe.
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

    // Los comentarios se quitan primero: este archivo NOMBRA las funciones prohibidas al
    // explicar por que no las usa sobre los importes, y sin esto el barrido se cazaria a si
    // mismo.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const prohibido of ['parseFloat', 'parseInt', 'toFixed', 'Number.parse']) {
      expect(codigo.includes(prohibido), `product-actions.ts no puede usar ${prohibido}`).toBe(
        false,
      );
    }

    // `Number(` SI aparece, una sola vez: la conversion de `stock`/`qtyAlert`, que son
    // enteros y no importes. Si alguien envolviera un costo, serian dos.
    expect(codigo.match(/Number\(/g) ?? []).toHaveLength(1);
    expect(codigo).toContain('return Number(trimmed);');

    // Y ninguna linea de codigo que mencione un importe puede convertirlo ni tratarlo como
    // entero.
    for (const linea of codigo.split('\n')) {
      if (!linea.includes('unitCost') && !linea.includes('totalCost')) continue;
      expect(linea).not.toMatch(/Number\(|parseFloat|readOptionalFormInt/);
    }
  });
});

/**
 * QC-81 (T10) — la fecha de compra cruza la Server Action, y el lote duplicado vuelve con su codigo.
 *
 * Cubre el lado BORDE de **R2** -ausente o vacia, la fecha llega `undefined` y el caso de uso pone
 * «hoy»; escrita, llega tal cual-, **QC-90 R26** reafirmado con el campo nuevo -la edicion sigue sin
 * ningun campo de lote- y el lado borde de **R13** -`BatchDuplicateLotError` sale al llamante con
 * `batch_duplicate_lot` y el texto del catalogo, como los demas codigos de `inventario`-.
 */
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
      stock: 10,
      qtyAlert: 2,
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

    // Ausente: el formulario de hoy no la pinta (la pantalla es QC-103).
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
    // `updateProductSchema` es `strictObject` y no conoce el lote (QC-90 R26).
    expect(candidato).toEqual({ name: 'Bidon 20 L', stock: 10, qtyAlert: 2 });
    for (const campo of [...Object.keys(VALID_BATCH_FIELDS), 'purchaseDate']) {
      expect(Object.keys(candidato)).not.toContain(campo);
    }
  });

  it('entrega batch_duplicate_lot al llamante con el texto del catalogo, como los demas codigos (R13)', async () => {
    createProductMock.mockRejectedValue(new BatchDuplicateLotError('company-a: lote L-2026-001'));

    const result = await createProductAction(
      CREATE_INITIAL,
      formDataOf({ ...VALID_PRODUCT_FIELDS, ...VALID_BATCH_FIELDS }),
    );

    // Estado EXACTO: codigo propio, mensaje del catalogo y NADA mas. El diagnostico (empresa y lote)
    // va al registro del servidor y no cruza al navegador (QC-70 R28-R30).
    expect(result).toEqual({
      status: 'error',
      code: 'batch_duplicate_lot',
      message: errorMessage('batch_duplicate_lot'),
    });
    expect(JSON.stringify(result)).not.toContain('L-2026-001');
  });
});

// AMPLIACION 2026-09-11 (QC-49, T14) — LA EMPRESA SALE DE LA SESION Y NO VUELVE AL NAVEGADOR.
//
// Cubre R12 (la empresa sale del contexto de sesion del servidor y el borde falla cerrado sin
// el), R19 (ninguna salida publica la lleva) y R31 (las firmas publicas no cambian).
describe('QC-49 R12 — la empresa sale de getSessionContext y nunca del FormData', () => {
  /** Las cinco actions, invocadas con su firma real y con el doble del caso de uso resuelto. */
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

  /** El actor que recibio el caso de uso en la ultima llamada del doble. */
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
    // FALLA CERRADO (R12, `design.md > 4.1`): si falta cualquiera de las dos caras, el actor es
    // `null` y `requirePermission` -primera linea de los nueve casos de uso- rechaza antes de
    // tocar el repositorio. Lo que este caso impide es lo OTRO: que el borde construya un actor
    // a medias, con `companyId: undefined`, y lo deje bajar; el ambito que llegaria entonces a
    // la consulta no seria de nadie.
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
    // El caso hostil: un campo oculto manipulado, o un `curl`. La empresa de la sesion es A y el
    // `FormData` pide B. Si el borde leyera la entrada, quien invoca la action ELEGIRIA la
    // empresa en cuyo nombre se escribe, que es el agujero entero que esta ficha cierra.
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

      // El actor sigue siendo el de la SESION, empresa A incluida.
      expect(llamada.at(-1)).toEqual(ADMIN_ACTOR);
      // Y el candidato no lleva la empresa por ningun nombre: no se LEE del `FormData`, asi que
      // no queda nada que el `strictObject` del esquema tenga que rechazar despues.
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
