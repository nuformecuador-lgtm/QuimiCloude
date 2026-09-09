// T6 — Los cinco casos de uso de producto, con dobles del puerto (`design.md > 3`, `> 7`,
// `tasks.md > T6`). Sin base de datos: lo que se prueba aqui es la DECISION que vive en
// `domain/`, no la implementacion Prisma (esa es T9).

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { createDeleteProduct } from '@/lib/modules/inventario/domain/delete-product';
import { NotFoundError, ValidationError } from '@/lib/modules/inventario/domain/errors';
import { createGetProduct } from '@/lib/modules/inventario/domain/get-product';
import { createListProducts } from '@/lib/modules/inventario/domain/list-products';
import { createUpdateProduct } from '@/lib/modules/inventario/domain/update-product';
import type { NewProduct, ProductView } from '@/lib/modules/inventario/domain/product-view';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

/** QC-74 (R18): el actor ya no trae nombre de rol, trae su conjunto de permisos. Este
 *  lleva los dos codigos de `inventario`, que es lo que el seed da al Administrador. */
const ADMIN: Actor = {
  id: 'admin-1',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/** Instante fijo, inyectado como dependencia (`now`): ver el comentario en `create-product.ts`. */
const AHORA = new Date('2026-09-02T10:00:00.000Z');

/** Entrada valida minima. `stock` y `qtyAlert` estan aqui desde que la decision del humano
 *  del 2026-09-03 los volvio obligatorios en `createProductSchema`. */
const PRODUCTO_VALIDO = {
  name: 'Acido sulfurico',
  stock: 0,
  qtyAlert: 0,
};

const VISTA_PRODUCTO: ProductView = {
  id: 'producto-1',
  name: 'Acido sulfurico',
  imagePath: null,
  stock: 0,
  qtyAlert: null,
  unitId: null,
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
    ...overrides,
  };
}

describe('R5 — alta de producto', () => {
  it('crea el producto y devuelve su identificador cuando el actor es Administrador', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    const resultado = await createProduct(PRODUCTO_VALIDO, ADMIN);

    expect(resultado).toEqual({ id: 'producto-1' });
    expect(products.create).toHaveBeenCalledTimes(1);
  });
});

describe('R12 — nombres duplicados', () => {
  it('acepta dos productos con el mismo nombre', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await createProduct(PRODUCTO_VALIDO, ADMIN);
    await createProduct(PRODUCTO_VALIDO, ADMIN);

    // Ninguna comprobacion de unicidad de nombre (D14): dos altas identicas, dos llamadas
    // al puerto, ninguna rechazada.
    expect(products.create).toHaveBeenCalledTimes(2);
  });
});

describe('R13 — existencia recibida al editar', () => {
  it('guarda la existencia recibida al editar, sin recalcularla', async () => {
    const products = montarRepositorio();
    const updateProduct = createUpdateProduct({ products, now: () => AHORA });

    await updateProduct('producto-1', { ...PRODUCTO_VALIDO, stock: 37 }, ADMIN);

    const [, datos]: [string, NewProduct, Date] = (
      products.updateAlive as unknown as { mock: { calls: [string, NewProduct, Date][] } }
    ).mock.calls[0];
    expect(datos.stock).toBe(37);
  });
});

describe('R14 — no encontrado al editar o al borrar', () => {
  it('devuelve no encontrado al editar o borrar un producto inexistente o ya borrado', async () => {
    const products = montarRepositorio({
      updateAlive: vi.fn<ProductRepository['updateAlive']>(async () => false),
    });
    const updateProduct = createUpdateProduct({ products, now: () => AHORA });

    await expect(updateProduct('inexistente', PRODUCTO_VALIDO, ADMIN)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('devuelve no encontrado al borrar un producto inexistente o ya borrado', async () => {
    const products = montarRepositorio({
      softDeleteAlive: vi.fn<ProductRepository['softDeleteAlive']>(async () => false),
    });
    const deleteProduct = createDeleteProduct({ products, now: () => AHORA });

    await expect(deleteProduct('inexistente', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('el borrado usa la operacion logica del puerto, nunca una fisica', () => {
  it('borrar llama a softDeleteAlive con el actor y el instante, no a un delete fisico', async () => {
    // R15, R16
    const products = montarRepositorio();
    const deleteProduct = createDeleteProduct({ products, now: () => AHORA });

    await deleteProduct('producto-1', ADMIN);

    expect(products.softDeleteAlive).toHaveBeenCalledWith('producto-1', AHORA);
    // El dominio no tiene ningun otro metodo de borrado que llamar: no hay `delete` a
    // secas en el puerto (D5), asi que "borrado logico" es la unica via posible aqui.
  });

  it('R16 — la ficha y la lista delegan el filtro de borrados en el puerto, sin `if` propio', async () => {
    const products = montarRepositorio({
      findAliveById: vi.fn<ProductRepository['findAliveById']>(async () => null),
    });
    const getProduct = createGetProduct({ products });

    await expect(getProduct('borrado', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
    expect(products.findAliveById).toHaveBeenCalledWith('borrado');
  });
});

describe('la entrada invalida se rechaza antes de tocar el puerto', () => {
  it('R9 — nombre vacio', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(
      createProduct({ ...PRODUCTO_VALIDO, name: '   ' }, ADMIN),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(products.create).not.toHaveBeenCalled();
  });

  // QC-52 R1 deroga QC-14 R10 en lo que este caso medía: el tiempo de entrega ya no es
  // del producto, asi que no se valida su signo — se rechaza el campo entero, igual que
  // el costo y la compra minima, y por el mismo motivo (`strictObject`).
  it('QC-52 R1 — costo, compra minima o tiempo de entrega en la entrada', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    for (const sobra of [{ cost: '10.0000' }, { minPurchase: 0 }, { deliveryTime: 3 }]) {
      await expect(
        createProduct({ ...PRODUCTO_VALIDO, ...sobra }, ADMIN),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    expect(products.create).not.toHaveBeenCalled();
  });

  it('R11 — nombre de mas de 120 caracteres', async () => {
    const products = montarRepositorio();
    const createProduct = createCreateProduct({ products, now: () => AHORA });

    await expect(
      createProduct({ ...PRODUCTO_VALIDO, name: 'x'.repeat(121) }, ADMIN),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(products.create).not.toHaveBeenCalled();
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
    expect(products.listAlive).toHaveBeenCalledWith({
      page: 2,
      sort: null,
      filters: {},
      search: '',
    });
  });

  it('rechaza una pagina no entera o menor que 1 sin llamar al puerto', async () => {
    const products = montarRepositorio();
    const listProducts = createListProducts({ products, log: logDoble() });

    await expect(listProducts({ page: 0 }, ADMIN)).rejects.toBeInstanceOf(ValidationError);
    expect(products.listAlive).not.toHaveBeenCalled();
  });
});
