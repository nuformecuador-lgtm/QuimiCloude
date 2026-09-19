// T6 — Los cinco casos de uso de producto, con dobles del puerto (`design.md > 3`, `> 7`,
// `tasks.md > T6`). Sin base de datos: lo que se prueba aqui es la DECISION que vive en
// `domain/`, no la implementacion Prisma (esa es T9).

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { createDeleteProduct } from '@/lib/modules/inventario/domain/delete-product';
import { ProductNotFoundError, ValidationError } from '@/lib/modules/inventario/domain/errors';
import { createGetProduct } from '@/lib/modules/inventario/domain/get-product';
import { createListProducts } from '@/lib/modules/inventario/domain/list-products';
import { createUpdateProduct } from '@/lib/modules/inventario/domain/update-product';
import type { ProductView } from '@/lib/modules/inventario/domain/product-view';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

/** QC-74 (R18): el actor ya no trae nombre de rol, trae su conjunto de permisos. Este
 *  lleva los dos codigos de `inventario`, que es lo que el seed da al Administrador. */
/** QC-49 (R11): la empresa EN CUYO NOMBRE opera el actor. El caso de uso la convierte en
 *  `InventoryScope` y se la pasa al puerto; no autoriza nada por si sola. */
const EMPRESA = 'company-a';

const ADMIN: Actor = {
  id: 'admin-1',
  companyId: EMPRESA,
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/** Instante fijo, inyectado como dependencia (`now`): ver el comentario en `create-product.ts`. */
const AHORA = new Date('2026-09-02T10:00:00.000Z');

/** Entrada valida minima de la EDICION, que ya no conoce la existencia (R9). `qtyAlert`
 *  sigue obligatorio desde la decision del humano del 2026-09-03. */
const PRODUCTO_VALIDO = {
  name: 'Acido sulfurico',
  qtyAlert: 0,
};

/** QC-90 (R1): el ALTA siempre crea su primer lote, asi que su entrada valida minima lleva
 *  ademas la existencia del lote, presentacion y uno de los dos costos. Los casos propios
 *  de QC-90 -derivacion, producto ya existente, autoria del lote- viven en
 *  `create-product.test.ts`. */
const ALTA_VALIDA = {
  ...PRODUCTO_VALIDO,
  stock: 0,
  presentationId: '11111111-1111-4111-8111-111111111111',
  unitCost: '10.0000',
};

const VISTA_PRODUCTO: ProductView = {
  id: 'producto-1',
  name: 'Acido sulfurico',
  imagePath: null,
  stockByUnit: [],
  qtyAlert: null,
  // QC-80 (R22): `unitId` dejo de ser un campo del producto; lo que la vista trae es la unidad
  // DERIVADA del lote mas reciente, `null` mientras no haya ninguno.
  latestBatchUnitId: null,
  createdAt: AHORA,
  updatedAt: AHORA,
};

/**
 * Doble del puerto que REGISTRA cada llamada (`vi.fn`), tipado con la firma exacta del
 * puerto, para poder afirmar `not.toHaveBeenCalled()` cuando haga falta y para que el
 * compilador vigile los argumentos.
 */
function montarRepositorio(overrides: Partial<ProductRepository> = {}): ProductRepository {
  return {
    create: vi.fn<ProductRepository['create']>(async () => ({ id: 'producto-1' })),
    findAliveById: vi.fn<ProductRepository['findAliveById']>(async () => VISTA_PRODUCTO),
    updateAlive: vi.fn<ProductRepository['updateAlive']>(async () => true),
    softDeleteAlive: vi.fn<ProductRepository['softDeleteAlive']>(async () => true),
    listAlive: vi.fn<ProductRepository['listAlive']>(async () => ({
      items: [VISTA_PRODUCTO],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
    // QC-90 (T4): los tres metodos del alta con primer lote. Por defecto NO hay producto
    // vivo homonimo, asi que el alta cae al camino de creacion (R16).
    findAliveIdByNameInPresentationUnit: vi.fn<
      ProductRepository['findAliveIdByNameInPresentationUnit']
    >(async () => null),
    createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(async () => ({
      id: 'producto-1',
      batchId: 'lote-1',
      lot: '1',
    })),
    addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(async () => ({
      batchId: 'lote-1',
      lot: '1',
    })),
    // QC-92: sin caso en este archivo, dobles minimos.
    adjustBatchStock: vi.fn<ProductRepository['adjustBatchStock']>(async () => null),
    findBatchesOfAliveProduct: vi.fn<ProductRepository['findBatchesOfAliveProduct']>(async () => []),
    findBatchMovements: vi.fn<ProductRepository['findBatchMovements']>(async () => null),
    ...overrides,
  };
}

describe('R5 — alta de producto', () => {
  it('crea el producto y devuelve su identificador cuando el actor es Administrador', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const resultado = await createProduct(ALTA_VALIDA, ADMIN);

    expect(resultado).toEqual({ id: 'producto-1', lot: '1' });
    // QC-90 (R1): el alta pasa por `createWithFirstBatch`, no por `create`. `create` sigue
    // en el puerto para otros usos, pero el alta ya no puede escribir un producto sin lote.
    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(products.create).not.toHaveBeenCalled();
  });
});

describe('R12 — nombres duplicados', () => {
  it('acepta dos productos con el mismo nombre', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(ALTA_VALIDA, ADMIN);
    await createProduct(ALTA_VALIDA, ADMIN);

    // Ninguna comprobacion de unicidad de nombre (D14): dos altas identicas, dos llamadas
    // al puerto, ninguna rechazada.
    //
    // QC-90 acota lo que este caso mide, y conviene decirlo: quien decide si hay homonimo
    // es el PUERTO (`findAliveIdByNameInPresentationUnit`), y aqui devuelve `null` -no hay producto vivo con
    // ese nombre-. Lo que sigue vigente es que el DOMINIO no rechaza por nombre repetido;
    // con un producto vivo homonimo, el alta agrega lote en vez de crear (R17), y eso se
    // prueba en `create-product.test.ts`.
    expect(products.createWithFirstBatch).toHaveBeenCalledTimes(2);
  });
});

describe('R9 — la edicion rechaza la existencia', () => {
  it('rechaza la edicion que trae stock, sin llamar al puerto', async () => {
    const products = montarRepositorio();
    const updateProduct = createUpdateProduct({ products, now: () => AHORA });

    await expect(
      updateProduct('producto-1', { ...PRODUCTO_VALIDO, stock: 37 }, ADMIN),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(products.updateAlive).not.toHaveBeenCalled();
  });
});

describe('R14 — no encontrado al editar o al borrar', () => {
  it('devuelve no encontrado al editar o borrar un producto inexistente o ya borrado', async () => {
    const products = montarRepositorio({
      updateAlive: vi.fn<ProductRepository['updateAlive']>(async () => false),
    });
    const updateProduct = createUpdateProduct({ products, now: () => AHORA });

    await expect(updateProduct('inexistente', PRODUCTO_VALIDO, ADMIN)).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });

  it('devuelve no encontrado al borrar un producto inexistente o ya borrado', async () => {
    const products = montarRepositorio({
      softDeleteAlive: vi.fn<ProductRepository['softDeleteAlive']>(async () => false),
    });
    const deleteProduct = createDeleteProduct({ products, now: () => AHORA });

    await expect(deleteProduct('inexistente', ADMIN)).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe('el borrado usa la operacion logica del puerto, nunca una fisica', () => {
  it('borrar llama a softDeleteAlive con el actor y el instante, no a un delete fisico', async () => {
    // R15, R16
    const products = montarRepositorio();
    const deleteProduct = createDeleteProduct({ products, now: () => AHORA });

    await deleteProduct('producto-1', ADMIN);

    expect(products.softDeleteAlive).toHaveBeenCalledWith('producto-1', AHORA, {
      companyId: EMPRESA,
    });
    // El dominio no tiene ningun otro metodo de borrado que llamar: no hay `delete` a
    // secas en el puerto (D5), asi que "borrado logico" es la unica via posible aqui.
  });

  it('R16 — la ficha y la lista delegan el filtro de borrados en el puerto, sin `if` propio', async () => {
    const products = montarRepositorio({
      findAliveById: vi.fn<ProductRepository['findAliveById']>(async () => null),
    });
    const getProduct = createGetProduct({ products });

    await expect(getProduct('borrado', ADMIN)).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(products.findAliveById).toHaveBeenCalledWith('borrado', { companyId: EMPRESA });
  });
});

/** QC-90: «no toca el puerto» ya no es una sola llamada. El alta puede pasar por tres
 *  metodos distintos, y afirmar solo sobre `create` dejaria verde un alta que consulto por
 *  nombre o escribio un lote pese al rechazo. */
function afirmarPuertoIntacto(products: ProductRepository): void {
  expect(products.create).not.toHaveBeenCalled();
  expect(products.findAliveIdByNameInPresentationUnit).not.toHaveBeenCalled();
  expect(products.createWithFirstBatch).not.toHaveBeenCalled();
  expect(products.addBatchToAlive).not.toHaveBeenCalled();
}

describe('la entrada invalida se rechaza antes de tocar el puerto', () => {
  it('R9 — nombre vacio', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(createProduct({ ...ALTA_VALIDA, name: '   ' }, ADMIN)).rejects.toBeInstanceOf(
      ValidationError,
    );
    afirmarPuertoIntacto(products);
  });

  // QC-52 R1 deroga QC-14 R10 en lo que este caso medía: el tiempo de entrega ya no es
  // del producto, asi que no se valida su signo — se rechaza el campo entero, igual que
  // el costo y la compra minima, y por el mismo motivo (`strictObject`).
  it('QC-52 R1 — costo, compra minima o tiempo de entrega en la entrada', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    for (const sobra of [{ cost: '10.0000' }, { minPurchase: 0 }, { deliveryTime: 3 }]) {
      await expect(createProduct({ ...ALTA_VALIDA, ...sobra }, ADMIN)).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    afirmarPuertoIntacto(products);
  });

  it('R11 — nombre de mas de 120 caracteres', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(
      createProduct({ ...ALTA_VALIDA, name: 'x'.repeat(121) }, ADMIN),
    ).rejects.toBeInstanceOf(ValidationError);
    afirmarPuertoIntacto(products);
  });
});

/** Doble del puerto del log de campos omitidos (QC-57 T7). */
function logDoble(): ListQueryLog {
  return { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
}

describe('listar tambien exige Administrador y delega la paginacion en el puerto', () => {
  it('lista pasando la consulta YA SANEADA al puerto y devuelve la pagina que este responde', async () => {
    // R23, R24, R25, R26, R35, R36 de QC-20 + QC-57 R24: el caso de uso ya no pasa «la query
    // tal cual», pasa la consulta del contrato generico saneada contra `PRODUCT_QUERYABLE`
    // -con sus defectos ya aplicados-, que es lo que R13 exige que llegue a la base.
    const products = montarRepositorio();
    const listProducts = createListProducts({ products, log: logDoble() });

    const pagina = await listProducts({ page: 2 }, ADMIN);

    expect(pagina.items).toEqual([VISTA_PRODUCTO]);
    expect(products.listAlive).toHaveBeenCalledWith(
      {
        page: 2,
        sort: null,
        filters: {},
        search: '',
      },
      { companyId: EMPRESA },
    );
  });

  it('rechaza una pagina no entera o menor que 1 sin llamar al puerto', async () => {
    const products = montarRepositorio();
    const listProducts = createListProducts({ products, log: logDoble() });

    await expect(listProducts({ page: 0 }, ADMIN)).rejects.toBeInstanceOf(ValidationError);
    expect(products.listAlive).not.toHaveBeenCalled();
  });
});
