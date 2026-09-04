// T6 — Los cinco casos de uso de producto, con dobles del puerto (`design.md > 3`, `> 7`,
// `tasks.md > T6`). Sin base de datos: lo que se prueba aqui es la DECISION que vive en
// `domain/`, no la implementacion Prisma (esa es T9).

import { ADMIN_ROLE_NAME, type Actor } from '@/lib/modules/inventario/domain/actor';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { createDeleteProduct } from '@/lib/modules/inventario/domain/delete-product';
import { NotFoundError, ValidationError } from '@/lib/modules/inventario/domain/errors';
import { createGetProduct } from '@/lib/modules/inventario/domain/get-product';
import { createListProducts } from '@/lib/modules/inventario/domain/list-products';
import { createUpdateProduct } from '@/lib/modules/inventario/domain/update-product';
import type { NewProduct, ProductView } from '@/lib/modules/inventario/domain/product-view';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

const ADMIN: Actor = { id: 'admin-1', roleName: ADMIN_ROLE_NAME };

/** Instante fijo, inyectado como dependencia (`now`): ver el comentario en `create-product.ts`. */
const AHORA = new Date('2026-09-02T10:00:00.000Z');

/** Entrada valida minima. `stock` y `qtyAlert` estan aqui desde que la decision del humano
 *  del 2026-09-03 los volvio obligatorios en `createProductSchema`. */
const PRODUCTO_VALIDO = {
  name: 'Acido sulfurico',
  presentationId: '11111111-1111-4111-8111-111111111111',
  stock: 0,
  qtyAlert: 0,
};

const VISTA_PRODUCTO: ProductView = {
  id: 'producto-1',
  name: 'Acido sulfurico',
  presentationId: '11111111-1111-4111-8111-111111111111',
  presentationName: 'Bidon 20 L',
  stock: 0,
  qtyAlert: null,
  // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Se conserva lo que
  // este fixture decia -un producto SIN unidad declarada, que sigue siendo valido porque la
  // unidad del producto sigue siendo OPCIONAL (QC-14 R5, QC-32 R10)-; solo cambia el campo
  // que lo expresa: `unit: null` (texto ausente) pasa a `unitId: null` (sin referencia al
  // catalogo).
  unitId: null,
  createdAt: AHORA,
  updatedAt: AHORA,
  createdBy: 'admin-1',
  updatedBy: 'admin-1',
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

describe(
  'R6 — autoria de creacion y de modificacion',
  () => {
    it('guarda al actor como autor de creacion y de modificacion al crear, y solo como autor de modificacion al editar y al borrar', async () => {
      const products = montarRepositorio();
      const createProduct = createCreateProduct({ products, now: () => AHORA });
      const updateProduct = createUpdateProduct({ products, now: () => AHORA });
      const deleteProduct = createDeleteProduct({ products, now: () => AHORA });

      await createProduct(PRODUCTO_VALIDO, ADMIN);
      // El puerto solo expone un `actorId` en `create`: el service NO distingue "autor de
      // creacion" de "autor de modificacion" en su firma -es la propia semantica de
      // `create` (frente a `updateAlive`) la que dice cual es cual (design.md > 2.1).
      expect(products.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: PRODUCTO_VALIDO.name }),
        ADMIN.id,
        AHORA,
      );

      await updateProduct('producto-1', PRODUCTO_VALIDO, ADMIN);
      expect(products.updateAlive).toHaveBeenCalledWith(
        'producto-1',
        expect.objectContaining({ name: PRODUCTO_VALIDO.name }),
        ADMIN.id,
        AHORA,
      );

      await deleteProduct('producto-1', ADMIN);
      expect(products.softDeleteAlive).toHaveBeenCalledWith('producto-1', ADMIN.id, AHORA);

      // HONESTIDAD SOBRE R6 (ver la nota del prompt y la bitacora de progress/): esto NO
      // demuestra que `created_by` sobreviva intacto tras un `updateAlive`, porque el
      // puerto `ProductRepository.updateAlive` ni siquiera expone `createdBy` en su firma
      // -el doble no tiene forma de "olvidarlo" ni de "recordarlo"-. Lo que se cierra aqui
      // es la mitad que SI vive en el dominio: que `create` recibe el actor como autor y
      // que `updateAlive`/`softDeleteAlive` reciben el mismo actor como autor de la
      // ultima modificacion, con el instante inyectado. La conservacion REAL de
      // `created_by` a traves de un `UPDATE` la cierran el adaptador Prisma (T9, que
      // debe escribir un `UPDATE` que toque solo `updated_by`) y el test de integracion
      // contra Postgres real (T14, `product-crud.int.test.ts`), no este archivo.
    });
  },
);

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

    const [, datos]: [string, NewProduct, string, Date] = (
      products.updateAlive as unknown as { mock: { calls: [string, NewProduct, string, Date][] } }
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

    expect(products.softDeleteAlive).toHaveBeenCalledWith('producto-1', ADMIN.id, AHORA);
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

describe('listar tambien exige Administrador y delega la paginacion en el puerto', () => {
  it('lista pasando la query tal cual al puerto y devuelve la pagina que este responde', async () => {
    // R23, R24, R25, R26, R35, R36
    const products = montarRepositorio();
    const listProducts = createListProducts({ products });

    const pagina = await listProducts({ page: 2 }, ADMIN);

    expect(pagina.items).toEqual([VISTA_PRODUCTO]);
    expect(products.listAlive).toHaveBeenCalledWith({ page: 2 });
  });

  it('rechaza una pagina no entera o menor que 1 sin llamar al puerto', async () => {
    const products = montarRepositorio();
    const listProducts = createListProducts({ products });

    await expect(listProducts({ page: 0 }, ADMIN)).rejects.toBeInstanceOf(ValidationError);
    expect(products.listAlive).not.toHaveBeenCalled();
  });
});
