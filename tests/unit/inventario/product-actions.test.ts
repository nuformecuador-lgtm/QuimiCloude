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
    });
    expect(JSON.stringify(result)).not.toContain('fallo de infraestructura');
    for (const value of Object.values(result)) {
      expect(String(value)).not.toContain('fallo de infraestructura');
    }
    // R14: el detalle si llega al registro del servidor, que es el unico sitio donde aparece.
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ cause: ajeno }));

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
