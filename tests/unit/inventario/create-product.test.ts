import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Mock } from 'vitest';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import {
  ProductNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/inventario/domain/errors';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

const EMPRESA = 'company-a';

const ADMIN: Actor = {
  id: 'admin-1',
  companyId: EMPRESA,
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

const SIN_PERMISO: Actor = { id: 'sin-permiso-1', companyId: EMPRESA, permissions: [] };

const SOLO_CONSULTA: Actor = {
  id: 'consulta-1',
  companyId: EMPRESA,
  permissions: ['inventario.consultar'],
};

const AHORA = new Date('2026-09-10T10:00:00.000Z');

const PRESENTACION = '11111111-1111-4111-8111-111111111111';

const ALTA_VALIDA = {
  name: 'Acido sulfurico',
  stock: 4,
  qtyAlert: 1,
  presentationId: PRESENTACION,
  unitCost: '12.5000',
};

/**
 * Derivado de `ProductRepository` y no escrito a mano: un metodo nuevo del puerto se nota aqui,
 * y `.mock.calls` queda TIPADO sin necesidad de `as`.
 */
type DobleDelPuerto = { [K in keyof ProductRepository]: Mock<ProductRepository[K]> };

/** La interseccion con `ProductRepository` obliga al doble a cumplir el puerto entero. */
function montarRepositorio(overrides: Partial<DobleDelPuerto> = {}): DobleDelPuerto &
  ProductRepository {
  return {
    create: vi.fn<ProductRepository['create']>(async () => ({ id: 'producto-1' })),
    findAliveById: vi.fn<ProductRepository['findAliveById']>(async () => null),
    updateAlive: vi.fn<ProductRepository['updateAlive']>(async () => true),
    softDeleteAlive: vi.fn<ProductRepository['softDeleteAlive']>(async () => true),
    listAlive: vi.fn<ProductRepository['listAlive']>(async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
    findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => null),
    createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(async () => ({
      id: 'producto-nuevo-1',
      batchId: 'lote-1',
      lot: '1',
    })),
    addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(async () => ({
      batchId: 'lote-1',
      lot: '1',
    })),
    // QC-92: sin caso en este archivo -es del alta, no del ajuste-, dobles minimos.
    adjustBatchStock: vi.fn<ProductRepository['adjustBatchStock']>(async () => null),
    findBatchesOfAliveProduct: vi.fn<ProductRepository['findBatchesOfAliveProduct']>(async () => []),
    findBatchMovements: vi.fn<ProductRepository['findBatchMovements']>(async () => null),
    ...overrides,
  };
}

type Repositorio = ReturnType<typeof montarRepositorio>;

/** Uno a uno y no en bucle sobre las claves: asi el fallo senala que metodo se llamo. */
function afirmarPuertoIntacto(products: Repositorio): void {
  expect(products.create).not.toHaveBeenCalled();
  expect(products.findAliveById).not.toHaveBeenCalled();
  expect(products.updateAlive).not.toHaveBeenCalled();
  expect(products.softDeleteAlive).not.toHaveBeenCalled();
  expect(products.listAlive).not.toHaveBeenCalled();
  expect(products.findAliveIdByNameInPresentationUnit).not.toHaveBeenCalled();
  expect(products.createWithFirstBatch).not.toHaveBeenCalled();
  expect(products.addBatchToAlive).not.toHaveBeenCalled();
}

function loteCreado(products: Repositorio): NewProductBatch {
  const llamada = products.createWithFirstBatch.mock.calls[0];
  if (llamada === undefined) throw new Error('createWithFirstBatch no fue llamado');
  return llamada[1];
}

function productoCreado(products: Repositorio): NewProduct {
  const llamada = products.createWithFirstBatch.mock.calls[0];
  if (llamada === undefined) throw new Error('createWithFirstBatch no fue llamado');
  return llamada[0];
}

describe('R23 — el permiso se comprueba antes que nada', () => {
  it.each([
    ['sin ningun permiso', SIN_PERMISO],
    ['con inventario.consultar pero sin modificar', SOLO_CONSULTA],
    ['ausente (null)', null],
    ['ausente (undefined)', undefined],
  ])('rechaza a un actor %s sin una sola llamada al repositorio', async (_etiqueta, actor) => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct(ALTA_VALIDA, actor)).rejects.toBeInstanceOf(UnauthorizedError);
    afirmarPuertoIntacto(products);
  });

  it('rechaza por permiso ANTES que por entrada invalida', async () => {
    // El orden importa y no es observable de otra forma: con una entrada que zod tambien
    // rechazaria, el error tiene que ser el de autorizacion, no el de validacion. Si zod
    // corriera primero, quien no tiene permiso averiguaria si su entrada era valida.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(
      createProduct({ campo: 'que no existe' }, SIN_PERMISO),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    afirmarPuertoIntacto(products);
  });
});

describe('R24 — la entrada invalida se rechaza sin tocar el puerto', () => {
  it.each([
    ['sin presentacion (R2)', { presentationId: undefined }],
    ['con una presentacion que no es uuid (R2)', { presentationId: 'bidon-20l' }],
    ['sin ninguno de los dos costos (R11)', { unitCost: undefined }],
    ['con un costo de cero (R5)', { unitCost: '0.0000' }],
    ['con un importe de coma flotante (R4)', { unitCost: 12.5 }],
    ['con un importe con signo (R4)', { unitCost: '-12.5' }],
    ['con un importe de cinco decimales (R4)', { unitCost: '12.50001' }],
    ['con un lote de mas de 60 caracteres (R14)', { lot: 'x'.repeat(61) }],
    ['con una expiracion que no es una fecha civil (R13)', { expiryDate: '10/09/2026' }],
    ['con un campo desconocido (R24)', { colorDelBidon: 'azul' }],
    ['con una fecha de compra sin forma YYYY-MM-DD (QC-81 R6)', { purchaseDate: '10/09/2026' }],
    ['con una fecha de compra que no existe (QC-81 R6)', { purchaseDate: '2026-02-30' }],
  ])('rechaza el alta %s', async (_etiqueta, sobra) => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct({ ...ALTA_VALIDA, ...sobra }, ADMIN)).rejects.toBeInstanceOf(
      ValidationError,
    );
    afirmarPuertoIntacto(products);
  });

  it('rechaza solo-costo-total con existencia 0 (R8) y con un total insuficiente (R9)', async () => {
    // Los dos los caza ya el esquema; lo que se mide es que el CASO DE USO los convierte en
    // `ValidationError` y no llega a escribir.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const sinExistencia = { ...ALTA_VALIDA, unitCost: undefined, totalCost: '10', stock: 0 };
    await expect(createProduct(sinExistencia, ADMIN)).rejects.toBeInstanceOf(ValidationError);

    const totalInsuficiente = {
      ...ALTA_VALIDA,
      unitCost: undefined,
      totalCost: '0.0001',
      stock: 5,
    };
    await expect(createProduct(totalInsuficiente, ADMIN)).rejects.toBeInstanceOf(ValidationError);

    afirmarPuertoIntacto(products);
  });
});

describe('QC-103 — el lote asignado viaja de vuelta con el resultado del alta', () => {
  it('createProduct devuelve el lote asignado al crear un producto nuevo (R12)', async () => {
    const products = montarRepositorio({
      createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(async () => ({
        id: 'producto-nuevo-1',
        batchId: 'lote-1',
        lot: '42',
      })),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const resultado = await createProduct(ALTA_VALIDA, ADMIN);

    expect(resultado).toEqual({ id: 'producto-nuevo-1', lot: '42' });
  });

  it('createProduct devuelve el lote asignado al agregar batch a un producto existente (R13)', async () => {
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => 'producto-9'),
      addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(async () => ({
        batchId: 'lote-2',
        lot: 'ACME-2026-07',
      })),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const resultado = await createProduct(ALTA_VALIDA, ADMIN);

    expect(resultado).toEqual({ id: 'producto-9', lot: 'ACME-2026-07' });
  });

  it('createProduct rechaza sin el permiso inventario.modificar (R10)', async () => {
    // El permiso REAL, no el nombre del rol: `SOLO_CONSULTA` tiene `inventario.consultar`
    // pero no `inventario.modificar`, y eso basta para que se rechace antes de tocar el puerto.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct(ALTA_VALIDA, SOLO_CONSULTA)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    afirmarPuertoIntacto(products);
  });
});

describe('R15, R16, R21 — producto nuevo', () => {
  it('busca por el nombre ESCRITO y la presentacion recibida, y crea producto y lote en una sola operacion del puerto', async () => {
    // Normalizar el nombre, resolver la unidad de la presentacion y descartar los borrados es
    // del adaptador: el caso de uso pasa el nombre y la presentacion tal cual y USA lo que el
    // puerto devuelva.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const resultado = await createProduct(ALTA_VALIDA, ADMIN);

    expect(products.findAliveIdByNameInPresentationUnit).toHaveBeenCalledWith(
      'Acido sulfurico',
      PRESENTACION,
      { companyId: EMPRESA },
    );
    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(products.addBatchToAlive).not.toHaveBeenCalled();
    expect(resultado).toEqual({ id: 'producto-nuevo-1', lot: '1' });
    // UNA operacion del puerto para las dos filas: el dominio no tiene dos llamadas que
    // descoordinar, y la transaccion es del adaptador.
    expect(products.createWithFirstBatch.mock.calls[0][2]).toBe(AHORA);
  });

  it('escribe la existencia UNICAMENTE en el lote, nunca en el producto (R10)', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, stock: 7 }, ADMIN);

    expect(loteCreado(products).stock).toBe(7);
    expect(Object.keys(productoCreado(products))).not.toContain('stock');
  });

  it('R1 — ningun camino escribe un producto sin lote', async () => {
    // `create` es el metodo del puerto que escribiria un producto sin lote.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, ADMIN);
    await createProduct({ ...ALTA_VALIDA, stock: 0 }, ADMIN);

    expect(products.create).not.toHaveBeenCalled();
  });
});

describe('R3 — existencia cero', () => {
  it('crea el lote igualmente, con stock 0', async () => {
    // El `CHECK` de la columna es `>= 0`: el 0 solo se rechaza junto a «solo costo total», caso
    // que se prueba arriba.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, stock: 0 }, ADMIN);

    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(loteCreado(products).stock).toBe(0);
  });
});

describe('R6, R7, R10 — el costo que se guarda', () => {
  it('R6 — guarda el costo unitario recibido tal cual, con sus cuatro decimales', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, unitCost: '1234.5678' }, ADMIN);

    expect(loteCreado(products).unitCost).toBe('1234.5678');
  });

  it('R7 — con solo el costo total, escribe el unitario DERIVADO', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(
      { ...ALTA_VALIDA, unitCost: undefined, totalCost: '10', stock: 3 },
      ADMIN,
    );

    // 10/3 redondeado a los cuatro decimales de la columna.
    expect(loteCreado(products).unitCost).toBe('3.3333');
  });

  it('R10 — con los dos costos, guarda el unitario e ignora el total sin rechazar', async () => {
    // No se comparan a proposito: `total / existencia` redondea, y una discrepancia de un centimo
    // seria un rechazo incorregible. Por eso el total es incoherente con el unitario.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(
      { ...ALTA_VALIDA, unitCost: '12.5000', totalCost: '999999', stock: 4 },
      ADMIN,
    );

    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(loteCreado(products).unitCost).toBe('12.5000');
    expect(Object.keys(loteCreado(products))).not.toContain('totalCost');
  });
});

describe('QC-81 R8, R10 y QC-90 R12 — lote que pide generarse y expiracion opcional', () => {
  // El correlativo lo calcula el adaptador dentro de la transaccion que escribe, y el doble no
  // genera nada: aqui solo se afirma que el dominio PIDE la generacion con `lot: null`.
  it('pasa lot null al puerto -«generalo»- cuando el lote no viene, y deja la expiracion en null', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, ADMIN);
    expect(loteCreado(products).lot).toBeNull();
    expect(loteCreado(products).expiryDate).toBeNull();

    const otros = montarRepositorio();
    await createCreateProduct({ products: otros, now: () => AHORA })(
      { ...ALTA_VALIDA, lot: null, expiryDate: null },
      ADMIN,
    );
    expect(loteCreado(otros).lot).toBeNull();
    expect(loteCreado(otros).expiryDate).toBeNull();
  });

  it('pide la generacion tambien por el camino del producto que ya existe', async () => {
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => 'producto-9'),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, ADMIN);

    expect(products.addBatchToAlive.mock.calls[0][1].lot).toBeNull();
  });

  it('pasa el lote escrito tal cual, recortado, sin sustituirlo -QC-81 R10-', async () => {
    // Un lote con forma numerica tampoco se reinterpreta: el dominio no decide si «7» es de la
    // serie o no, lo pasa escrito.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, lot: '  7  ' }, ADMIN);

    expect(loteCreado(products).lot).toBe('7');
  });

  it('los guarda cuando vienen, con el lote recortado (R14) y la fecha como texto civil (R13)', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, lot: '  L-2026-01  ', expiryDate: '2026-12-31' }, ADMIN);

    expect(loteCreado(products).lot).toBe('L-2026-01');
    // Viaja como CADENA `YYYY-MM-DD`, no como `Date`: convertirla en el dominio es justo por
    // donde se cuela el corrimiento de dia por zona horaria.
    expect(loteCreado(products).expiryDate).toBe('2026-12-31');
  });
});

describe('R22 — autoria del lote', () => {
  it('escribe el identificador del actor de la sesion en el lote', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, { id: 'usuario-42', companyId: EMPRESA, permissions: ['inventario.modificar'] });

    expect(loteCreado(products).createdBy).toBe('usuario-42');
  });

  it('tambien por el camino del producto que ya existe', async () => {
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => 'producto-9'),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, { id: 'usuario-42', companyId: EMPRESA, permissions: ['inventario.modificar'] });

    expect(products.addBatchToAlive.mock.calls[0][1].createdBy).toBe('usuario-42');
  });
});

describe('R17, R18 — el nombre corresponde a un producto que ya existe', () => {
  function montarConExistente() {
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => 'producto-9'),
    });
    return { products, createProduct: createCreateProduct({ products, now: () => AHORA }) };
  }

  it('R17 — le agrega el lote y NO crea otro producto', async () => {
    const { products, createProduct } = montarConExistente();

    const resultado = await createProduct(ALTA_VALIDA, ADMIN);

    expect(products.addBatchToAlive).toHaveBeenCalledTimes(1);
    expect(products.createWithFirstBatch).not.toHaveBeenCalled();
    expect(products.create).not.toHaveBeenCalled();
    expect(resultado).toEqual({ id: 'producto-9', lot: '1' });
  });

  it('R18 — el candidato del producto NO viaja al puerto', async () => {
    // Lo que no viaja al puerto no se puede escribir por accidente.
    const { products, createProduct } = montarConExistente();

    await createProduct({ ...ALTA_VALIDA, stock: 999, qtyAlert: 888, name: 'Otro nombre' }, ADMIN);

    const llamada = products.addBatchToAlive.mock.calls[0];
    expect(llamada).toHaveLength(4);
    expect(llamada[0]).toBe('producto-9');
    expect(llamada[2]).toBe(AHORA);
    expect(llamada[3]).toEqual({ companyId: EMPRESA });
    // `stock` y `purchaseDate` son del lote que se agrega; no hay ningun campo del producto.
    expect(Object.keys(llamada[1]).sort()).toEqual([
      'createdBy',
      'expiryDate',
      'lot',
      'presentationId',
      'purchaseDate',
      'stock',
      'unitCost',
    ]);
  });

  it('R20 — usa el identificador que el puerto devuelve, sea cual sea', async () => {
    // El desempate entre homonimos vivos es del ADAPTADOR, con su `orderBy`, y se prueba contra
    // la base. Al caso de uso solo le toca no aplicar ningun criterio propio.
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => 'el-mas-viejo'),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct(ALTA_VALIDA, ADMIN)).resolves.toEqual({ id: 'el-mas-viejo', lot: '1' });
    expect(products.addBatchToAlive.mock.calls[0][0]).toBe('el-mas-viejo');
  });

  it('rechaza si el producto dejo de estar vivo entre la consulta y la escritura', async () => {
    // Se LANZA en vez de crear: crear escribiria en silencio el nombre, la existencia y la alerta
    // del panel, que en este camino se ignoran. Quien reintenta vuelve a pasar por
    // `findAliveIdByNameInPresentationUnit`, que ya dira `null`, y creara.
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => 'producto-9'),
      addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(async () => null),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct(ALTA_VALIDA, ADMIN)).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(products.createWithFirstBatch).not.toHaveBeenCalled();
    expect(products.create).not.toHaveBeenCalled();
  });
});

describe('R19 — sin id del puerto, el alta crea producto nuevo', () => {
  // Vivo contra borrado lo distingue el ADAPTADOR (`deleted_at IS NULL`): desde el dominio, sin
  // homonimo y con el homonimo borrado son el mismo `null`. Lo borrado se prueba contra Postgres
  // en `tests/integration/inventario/product-batch-write.int.test.ts`.
  it('crea un producto nuevo en vez de agregarle el lote a otro', async () => {
    // El `null` explicito repite el valor por defecto del doble a proposito: deja el escenario
    // escrito en el propio caso en vez de obligar a ir a leer `montarRepositorio`.
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => null),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, ADMIN);

    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(products.addBatchToAlive).not.toHaveBeenCalled();
  });
});

describe('QC-121 R6 — mismo nombre en otra unidad: nace otro producto, sin aviso', () => {
  it('el puerto no encuentra homonimo en la unidad de esta presentacion y el alta crea sin rechazar', async () => {
    // El adaptador es quien decide «misma unidad»; el dominio solo actua sobre lo que devuelve.
    // Un `null` aqui es indistinguible de «no existe ningun homonimo»: es el mismo caso que R19,
    // pero el motivo de fondo es distinto (hay homonimo, en otra unidad).
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<
        ProductRepository['findAliveIdByNameInPresentationUnit']
      >(async () => null),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct(ALTA_VALIDA, ADMIN)).resolves.toEqual({
      id: 'producto-nuevo-1',
      lot: '1',
    });
    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
  });
});

describe('QC-121 R7 — con varios homonimos en la misma unidad, usa el que el puerto elige', () => {
  it('no aplica ningun criterio propio de desempate: usa el id que devuelve el puerto', async () => {
    // El desempate -el mas antiguo, por id ascendente- es del ADAPTADOR, contra la base
    // (`product-prisma.test.ts`, `product-unit.int.test.ts`). Aqui solo se afirma que el
    // dominio no reimplementa ese criterio.
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<
        ProductRepository['findAliveIdByNameInPresentationUnit']
      >(async () => 'el-mas-viejo'),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct(ALTA_VALIDA, ADMIN)).resolves.toEqual({
      id: 'el-mas-viejo',
      lot: '1',
    });
    expect(products.createWithFirstBatch).not.toHaveBeenCalled();
  });
});

describe('QC-121 R3 — el rechazo de la base por unidad llega al llamante como invalid_input', () => {
  it('propaga el ValidationError del puerto sin envolverlo ni escribir nada mas, al crear', async () => {
    // Simula la carrera en la que la presentacion cambio de unidad entre la busqueda y la
    // escritura, y el adaptador traduce el 23514 del disparador a ValidationError ANTES de que
    // este caso de uso la vea. Aqui solo se mide que no la atrapa ni la sustituye.
    const products = montarRepositorio({
      createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(async () => {
        throw new ValidationError('lote en otra unidad que la del producto');
      }),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const error = await capturarRechazo(createProduct(ALTA_VALIDA, ADMIN));
    expect(error.code).toBe('invalid_input');
  });

  it('lo mismo por el camino del producto que ya existe', async () => {
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<
        ProductRepository['findAliveIdByNameInPresentationUnit']
      >(async () => 'producto-9'),
      addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(async () => {
        throw new ValidationError('lote en otra unidad que la del producto');
      }),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const error = await capturarRechazo(createProduct(ALTA_VALIDA, ADMIN));
    expect(error.code).toBe('invalid_input');
  });
});

/** `AHORA` es 2026-09-10T10:00Z: «hoy» civil en UTC es este dia. */
const HOY = '2026-09-10';
const MANANA = '2026-09-11';
const SEMANA_PASADA = '2026-09-03';

async function capturarRechazo(promesa: Promise<unknown>): Promise<ValidationError> {
  const error = await promesa.then(
    () => {
      throw new Error('se esperaba un rechazo y el alta resolvio');
    },
    (motivo: unknown) => motivo,
  );
  expect(error).toBeInstanceOf(ValidationError);
  return error as ValidationError;
}

describe('QC-81 R2 — sin fecha de compra, al puerto le llega HOY del mismo reloj', () => {
  it('pasa al puerto la fecha civil UTC del now inyectado, y el MISMO instante como now', async () => {
    // 23:30 UTC a proposito: en una zona al este de UTC ya seria el dia siguiente. Si «hoy» se
    // calculara con la zona local del proceso, este caso cambiaria de resultado segun la maquina.
    const instante = new Date('2026-03-05T23:30:00.000Z');
    const now = vi.fn(() => instante);
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now });

    await createProduct(ALTA_VALIDA, ADMIN);

    expect(loteCreado(products).purchaseDate).toBe('2026-03-05');
    // Un solo reloj: con dos, un alta justo en el cambio de dia guardaria compra y creacion en
    // dias distintos.
    expect(now).toHaveBeenCalledTimes(1);
    expect(products.createWithFirstBatch.mock.calls[0][2]).toBe(instante);
  });

  it('tambien cuando la fecha viene explicitamente en null, y por el camino del producto existente', async () => {
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => 'producto-9'),
    });
    const now = vi.fn(() => AHORA);
    const createProduct = createCreateProduct({ products, now });

    await createProduct({ ...ALTA_VALIDA, purchaseDate: null }, ADMIN);

    const llamada = products.addBatchToAlive.mock.calls[0];
    expect(llamada[1].purchaseDate).toBe(HOY);
    expect(now).toHaveBeenCalledTimes(1);
    expect(llamada[2]).toBe(AHORA);
  });
});

describe('QC-81 R3, R5 — la fecha escrita, si no es futura, llega al puerto identica', () => {
  it('pasa tal cual una fecha de la semana pasada', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, purchaseDate: SEMANA_PASADA }, ADMIN);

    expect(loteCreado(products).purchaseDate).toBe(SEMANA_PASADA);
  });

  it('acepta hoy y una fecha de meses atras sin corregirlas', async () => {
    // Hoy es el limite exacto: ahi es donde un `>=` mal puesto rechazaria.
    for (const fecha of [HOY, '2026-01-15', '2019-12-31']) {
      const products = montarRepositorio();
      await createCreateProduct({ products, now: () => AHORA })(
        { ...ALTA_VALIDA, purchaseDate: fecha },
        ADMIN,
      );
      expect(loteCreado(products).purchaseDate, `${fecha} deberia llegar identica`).toBe(fecha);
    }
  });

  it('pasa la fecha escrita identica tambien al agregar el lote a un producto existente', async () => {
    const products = montarRepositorio({
      findAliveIdByNameInPresentationUnit: vi.fn<ProductRepository['findAliveIdByNameInPresentationUnit']>(async () => 'producto-9'),
    });
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct({ ...ALTA_VALIDA, purchaseDate: SEMANA_PASADA }, ADMIN);

    expect(products.addBatchToAlive.mock.calls[0][1].purchaseDate).toBe(SEMANA_PASADA);
  });
});

describe('QC-81 R4 — la fecha de compra futura se rechaza sin tocar el puerto', () => {
  it('rechaza la fecha de manana con ValidationError senalando purchaseDate y cero llamadas al repositorio', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const error = await capturarRechazo(
      createProduct({ ...ALTA_VALIDA, purchaseDate: MANANA }, ADMIN),
    );

    expect(error.code).toBe('invalid_input');
    // `ValidationError` no lleva ruta de campo: el campo solo puede senalarse en el diagnostico.
    expect(error.diagnostic).toContain('purchaseDate');
    afirmarPuertoIntacto(products);
  });

  it('decide «futura» contra el dia UTC del now inyectado, no contra el reloj de la maquina', async () => {
    // Con un `now` de 1999, una fecha de 2000 ya es futura aunque en el reloj real sea pasado:
    // prueba que no hay un segundo reloj escondido.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({
      products,
      now: () => new Date('1999-12-31T23:59:59.000Z'),
    });

    await capturarRechazo(createProduct({ ...ALTA_VALIDA, purchaseDate: '2000-01-01' }, ADMIN));
    afirmarPuertoIntacto(products);
  });

  it('valida la forma con zod ANTES de mirar si la fecha es futura', async () => {
    // Un rechazo de zod no lleva diagnostico y el de la fecha si: eso delata cual de los dos gano.
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const error = await capturarRechazo(
      createProduct({ ...ALTA_VALIDA, purchaseDate: MANANA, colorDelBidon: 'azul' }, ADMIN),
    );

    expect(error.diagnostic).toBeUndefined();
    afirmarPuertoIntacto(products);
  });
});

describe('QC-81 R34 — un lote tecleado de 60 digitos se rechaza sin tocar el puerto', () => {
  it('R34: con un lote de 60 digitos lanza ValidationError (invalid_input) y el repositorio recibe cero llamadas', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const error = await capturarRechazo(createProduct({ ...ALTA_VALIDA, lot: '9'.repeat(60) }, ADMIN));

    expect(error.code).toBe('invalid_input');
    afirmarPuertoIntacto(products);
  });
});

describe('QC-81 R24 — sin permiso no se valida, no se toca el puerto ni se calcula ninguna fecha', () => {
  it.each([
    ['sin ningun permiso', SIN_PERMISO],
    ['con inventario.consultar pero sin modificar', SOLO_CONSULTA],
    ['ausente (null)', null],
    ['ausente (undefined)', undefined],
  ])('rechaza a un actor %s con UnauthorizedError sin llamar al reloj ni al puerto', async (_etiqueta, actor) => {
    // Una fecha FUTURA a proposito: si la fecha se resolviera antes del permiso, el error seria el
    // de validacion y no el de autorizacion.
    const now = vi.fn(() => AHORA);
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now });

    await expect(
      createProduct({ ...ALTA_VALIDA, purchaseDate: MANANA }, actor),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(now).not.toHaveBeenCalled();
    afirmarPuertoIntacto(products);
  });
});

describe('R4 — ningun importe pasa por coma flotante', () => {
  it('el caso de uso no convierte ningun importe a numero en su codigo fuente', () => {
    // Sobre el TEXTO del archivo y no sobre su comportamiento: un `Number()` intermedio daria el
    // mismo resultado en todos los casos de arriba y aun asi pasaria el importe por coma flotante.
    const fuente = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'lib',
        'modules',
        'inventario',
        'domain',
        'create-product.ts',
      ),
      'utf8',
    );

    for (const prohibido of ['Number(', 'parseFloat', 'parseInt', 'toFixed']) {
      expect(fuente.includes(prohibido), `create-product.ts no puede usar ${prohibido}`).toBe(
        false,
      );
    }
  });
});
