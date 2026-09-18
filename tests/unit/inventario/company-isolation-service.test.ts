// T12 (QC-49) — EL RECHAZO CRUZADO ENTRE EMPRESAS, EN EL SERVICE Y CON DOBLES.
//
// Cubre R11, R15, R16, R17, R18 y R24.
//
// POR QUE ES UN TEST DE SERVICE Y NO DE BASE. `docs/architecture.md > Acceso a datos y
// autorizacion`: Prisma se conecta como dueno de las tablas y Postgres NO le aplica RLS, asi
// que la frontera REAL del aislamiento es el caso de uso, no la policy. Este archivo mide esa
// frontera: que el ambito que llega al puerto sale del ACTOR y de ningun otro sitio, y que lo
// ajeno se responde exactamente igual que lo inexistente.
//
// EL DOBLE HONRA EL AMBITO A PROPOSITO. Un `vi.fn()` que devolviera siempre la fila haria
// verde cualquier caso de uso, tuviera ambito o no. Los dobles de aqui llevan filas CON EMPRESA
// y aplican el filtro que aplicaria la base: si el caso de uso dejara de pasar el ambito -o
// pasara el de la entrada en vez del del actor-, el doble devolveria la fila ajena y las
// aserciones caerian. Lo que este archivo NO puede demostrar es que el SQL filtre: eso es
// `tests/integration/inventario/company-scope-queries.int.test.ts` (T13).

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import { createCreatePresentation } from '@/lib/modules/inventario/domain/create-presentation';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { createDeletePresentation } from '@/lib/modules/inventario/domain/delete-presentation';
import { createDeleteProduct } from '@/lib/modules/inventario/domain/delete-product';
import {
  PresentationNotFoundError,
  ProductNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/inventario/domain/errors';
import { createGetProduct } from '@/lib/modules/inventario/domain/get-product';
import { createListPresentations } from '@/lib/modules/inventario/domain/list-presentations';
import { createListProducts } from '@/lib/modules/inventario/domain/list-products';
import { normalizeProductName } from '@/lib/modules/inventario/domain/product-name';
import { createUpdatePresentation } from '@/lib/modules/inventario/domain/update-presentation';
import { createUpdateProduct } from '@/lib/modules/inventario/domain/update-product';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { Page } from '@/lib/modules/inventario/domain/page';
import type { PresentationView } from '@/lib/modules/inventario/domain/presentation-view';
import type { ProductView } from '@/lib/modules/inventario/domain/product-view';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

const EMPRESA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMPRESA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const UNIDAD = '11111111-1111-4111-8111-111111111111';
const PRESENTACION = '22222222-2222-4222-8222-222222222222';

/** Quien opera: de la empresa A y con los dos permisos del modulo. */
const ACTOR_A: Actor = {
  id: 'user-a',
  companyId: EMPRESA_A,
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/** El mismo humano, la misma sesion, OTRA empresa. Es el que ve -o no ve- lo de A. */
const ACTOR_B: Actor = { ...ACTOR_A, id: 'user-b', companyId: EMPRESA_B };

const PRODUCTO_DE_A = 'product-de-a';
const PRESENTACION_DE_A = 'presentation-de-a';

const ALTA_VALIDA = {
  name: 'Acido sulfurico',
  stock: 10,
  qtyAlert: 2,
  presentationId: PRESENTACION,
  unitCost: '10.0000',
};

const EDICION_VALIDA = { name: 'Acido sulfurico', qtyAlert: 2 };
const PRESENTACION_VALIDA = { name: 'Bidon 20 L', unitId: UNIDAD };

const AHORA = new Date('2026-09-11T10:00:00.000Z');

function vista(id: string, name: string): ProductView {
  return {
    id,
    name,
    imagePath: null,
    stockByUnit: [],
    qtyAlert: 2,
    latestBatchUnitId: null,
    createdAt: AHORA,
    updatedAt: AHORA,
  };
}

function pagina<T>(items: readonly T[]): Page<T> {
  return { items: [...items], total: items.length, page: 1, pageSize: 10, totalPages: 1 };
}

type FilaProducto = { id: string; name: string; companyId: string; alive: boolean };
type FilaPresentacion = { id: string; name: string; companyId: string };

/**
 * Repositorios dobles QUE APLICAN EL AMBITO, con una fila de la empresa A cada uno. Devuelven
 * exactamente lo mismo ante «de otra empresa» y ante «no existe» -`null`, `false`,
 * `'not_found'`-, que es lo que el puerto promete (`design.md > 6.1`) y lo que impide que el
 * dominio pueda distinguirlos aunque quisiera.
 */
function montar() {
  const productos: FilaProducto[] = [
    { id: PRODUCTO_DE_A, name: 'Acido sulfurico', companyId: EMPRESA_A, alive: true },
  ];
  const presentaciones: FilaPresentacion[] = [
    { id: PRESENTACION_DE_A, name: 'Bidon 20 L', companyId: EMPRESA_A },
  ];
  /** Cada escritura de alta queda registrada con la empresa que el ambito dijo (R17). */
  const creados: Array<{ tipo: string; companyId: string; productId?: string }> = [];

  function productoVisible(id: string, scope: InventoryScope): FilaProducto | undefined {
    return productos.find(
      (fila) => fila.id === id && fila.alive && fila.companyId === scope.companyId,
    );
  }

  const products = {
    create: vi.fn<ProductRepository['create']>(async (_data, _now, scope) => {
      const id = `product-nuevo-${productos.length}`;
      productos.push({ id, name: 'nuevo', companyId: scope.companyId, alive: true });
      creados.push({ tipo: 'product', companyId: scope.companyId });
      return { id };
    }),
    findAliveById: vi.fn<ProductRepository['findAliveById']>(async (id, scope) => {
      const fila = productoVisible(id, scope);
      return fila === undefined ? null : vista(fila.id, fila.name);
    }),
    updateAlive: vi.fn<ProductRepository['updateAlive']>(
      async (id, _data, _now, scope) => productoVisible(id, scope) !== undefined,
    ),
    softDeleteAlive: vi.fn<ProductRepository['softDeleteAlive']>(async (id, _now, scope) => {
      const fila = productoVisible(id, scope);
      if (fila === undefined) return false;
      fila.alive = false;
      return true;
    }),
    listAlive: vi.fn<ProductRepository['listAlive']>(async (_query, scope) =>
      pagina(
        productos
          .filter((fila) => fila.alive && fila.companyId === scope.companyId)
          .map((fila) => vista(fila.id, fila.name)),
      ),
    ),
    // R18: solo los homonimos VIVOS de la empresa del ambito. Es el filtro entero de la regla.
    findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(async (name, scope) => {
      const fila = productos.find(
        (candidata) =>
          candidata.alive &&
          candidata.companyId === scope.companyId &&
          normalizeProductName(candidata.name) === normalizeProductName(name),
      );
      return fila?.id ?? null;
    }),
    createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(
      async (product, _batch, _now, scope) => {
        const id = `product-nuevo-${productos.length}`;
        productos.push({ id, name: product.name, companyId: scope.companyId, alive: true });
        creados.push({ tipo: 'product+batch', companyId: scope.companyId, productId: id });
        return { id, batchId: `batch-de-${id}`, lot: `lote-de-${id}` };
      },
    ),
    addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(
      async (productId, _batch, _now, scope) => {
        const fila = productoVisible(productId, scope);
        if (fila === undefined) return null;
        creados.push({ tipo: 'batch', companyId: scope.companyId, productId });
        return { batchId: `batch-de-${productId}`, lot: `lote-de-${productId}` };
      },
    ),
    // QC-92: sin caso en este archivo -es de otro modulo de reglas-, asi que dobles minimos.
    adjustBatchStock: vi.fn<ProductRepository['adjustBatchStock']>(async () => null),
    findBatchesOfAliveProduct: vi.fn<ProductRepository['findBatchesOfAliveProduct']>(async () => []),
    findBatchMovements: vi.fn<ProductRepository['findBatchMovements']>(async () => null),
  } satisfies ProductRepository;

  const presentations = {
    create: vi.fn<PresentationRepository['create']>(async (data, scope) => {
      const id = `presentation-nueva-${presentaciones.length}`;
      presentaciones.push({ id, name: data.name, companyId: scope.companyId });
      creados.push({ tipo: 'presentation', companyId: scope.companyId });
      return { id };
    }),
    replace: vi.fn<PresentationRepository['replace']>(async (id, _data, scope) => {
      const fila = presentaciones.find(
        (candidata) => candidata.id === id && candidata.companyId === scope.companyId,
      );
      return fila === undefined ? 'not_found' : 'ok';
    }),
    deleteById: vi.fn<PresentationRepository['deleteById']>(async (id, scope) => {
      const indice = presentaciones.findIndex(
        (candidata) => candidata.id === id && candidata.companyId === scope.companyId,
      );
      if (indice < 0) return 'not_found';
      presentaciones.splice(indice, 1);
      return 'deleted';
    }),
    list: vi.fn<PresentationRepository['list']>(async (_query, scope) =>
      pagina<PresentationView>(
        presentaciones
          .filter((fila) => fila.companyId === scope.companyId)
          .map((fila) => ({
            id: fila.id,
            name: fila.name,
            nameNormalized: fila.name.toLowerCase(),
            unitId: UNIDAD,
            createdAt: AHORA,
            updatedAt: AHORA,
          })),
      ),
    ),
  } satisfies PresentationRepository;

  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
  const now = (): Date => AHORA;

  return {
    products,
    presentations,
    log,
    productos,
    presentaciones,
    creados,
    createProduct: createCreateProduct({ products, now }),
    updateProduct: createUpdateProduct({ products, now }),
    deleteProduct: createDeleteProduct({ products, now }),
    getProduct: createGetProduct({ products }),
    listProducts: createListProducts({ products, log }),
    createPresentation: createCreatePresentation({ presentations }),
    updatePresentation: createUpdatePresentation({ presentations }),
    deletePresentation: createDeletePresentation({ presentations }),
    listPresentations: createListPresentations({ presentations, log }),
  };
}

type Montaje = ReturnType<typeof montar>;

/**
 * Los NUEVE casos de uso, invocados con su firma real. Recorrer la tabla en bucle es lo que
 * hace que anadir un caso de uso manana sea trivial y olvidarlo aqui, visible.
 */
const CASOS_DE_USO: ReadonlyArray<{
  readonly nombre: string;
  readonly invocar: (m: Montaje, actor: Actor) => Promise<unknown>;
  /** El doble del puerto al que llega, para leerle el ambito recibido. */
  readonly puerto: (m: Montaje) => { mock: { calls: unknown[][] } };
}> = [
  {
    nombre: 'create-product',
    invocar: (m, actor) => m.createProduct(ALTA_VALIDA, actor),
    puerto: (m) => m.products.findAliveIdByName,
  },
  {
    nombre: 'update-product',
    invocar: (m, actor) => m.updateProduct(PRODUCTO_DE_A, EDICION_VALIDA, actor),
    puerto: (m) => m.products.updateAlive,
  },
  {
    nombre: 'delete-product',
    invocar: (m, actor) => m.deleteProduct(PRODUCTO_DE_A, actor),
    puerto: (m) => m.products.softDeleteAlive,
  },
  {
    nombre: 'get-product',
    invocar: (m, actor) => m.getProduct(PRODUCTO_DE_A, actor),
    puerto: (m) => m.products.findAliveById,
  },
  {
    nombre: 'list-products',
    invocar: (m, actor) => m.listProducts({ page: 1 }, actor),
    puerto: (m) => m.products.listAlive,
  },
  {
    nombre: 'create-presentation',
    invocar: (m, actor) => m.createPresentation(PRESENTACION_VALIDA, actor),
    puerto: (m) => m.presentations.create,
  },
  {
    nombre: 'update-presentation',
    invocar: (m, actor) => m.updatePresentation(PRESENTACION_DE_A, PRESENTACION_VALIDA, actor),
    puerto: (m) => m.presentations.replace,
  },
  {
    nombre: 'delete-presentation',
    invocar: (m, actor) => m.deletePresentation(PRESENTACION_DE_A, actor),
    puerto: (m) => m.presentations.deleteById,
  },
  {
    nombre: 'list-presentations',
    invocar: (m, actor) => m.listPresentations({ page: 1 }, actor),
    puerto: (m) => m.presentations.list,
  },
];

/** El ultimo argumento que recibio un doble del puerto: por contrato, el ambito. */
function ambitoRecibido(doble: { mock: { calls: unknown[][] } }): unknown {
  const llamada = doble.mock.calls.at(-1);
  if (llamada === undefined) throw new Error('el puerto no fue llamado');
  return llamada.at(-1);
}

describe('QC-49 R11 — el ambito sale del ACTOR y de ningun otro sitio', () => {
  it('la tabla que se barre es la de los nueve casos de uso', () => {
    // Ancla contra el verde por vacuidad: si la tabla se quedara corta, todo lo de abajo
    // seguiria en verde midiendo menos de lo que dice medir.
    expect(CASOS_DE_USO).toHaveLength(9);
  });

  it('los nueve pasan al puerto la empresa del actor que los invoca', async () => {
    for (const caso of CASOS_DE_USO) {
      const m = montar();

      await caso.invocar(m, ACTOR_A);

      expect(ambitoRecibido(caso.puerto(m)), caso.nombre).toEqual({ companyId: EMPRESA_A });
    }
  });

  it('cambiar de actor cambia el ambito: no hay ninguna empresa cableada', async () => {
    // Falsable de verdad: un caso de uso que ignorase `actor.companyId` -o que leyera la
    // empresa de un sitio fijo- daria el mismo ambito con los dos actores.
    for (const caso of CASOS_DE_USO) {
      const m = montar();

      // Con el actor de B lo de A no se ve, asi que varios casos rechazan. El ambito RECIBIDO
      // es lo que se mide aqui, y llega igual: la consulta se hizo, acotada a B.
      await caso.invocar(m, ACTOR_B).catch(() => undefined);

      expect(ambitoRecibido(caso.puerto(m)), caso.nombre).toEqual({ companyId: EMPRESA_B });
    }
  });
});

describe('QC-49 R15/R16 — lo ajeno se responde como lo inexistente, nunca como «no puedes»', () => {
  /**
   * Las cinco operaciones que apuntan a una fila CONCRETA de la empresa A, invocadas por el
   * actor de B con el identificador REAL -conocerlo no ayuda, que es justo el punto de R15-.
   */
  const CRUCES: ReadonlyArray<{
    readonly nombre: string;
    readonly invocar: (m: Montaje) => Promise<unknown>;
    readonly error: new () => Error;
  }> = [
    {
      nombre: 'ficha de un producto ajeno (R15)',
      invocar: (m) => m.getProduct(PRODUCTO_DE_A, ACTOR_B),
      error: ProductNotFoundError,
    },
    {
      nombre: 'edicion de un producto ajeno (R16)',
      invocar: (m) => m.updateProduct(PRODUCTO_DE_A, EDICION_VALIDA, ACTOR_B),
      error: ProductNotFoundError,
    },
    {
      nombre: 'borrado de un producto ajeno (R16)',
      invocar: (m) => m.deleteProduct(PRODUCTO_DE_A, ACTOR_B),
      error: ProductNotFoundError,
    },
    {
      nombre: 'edicion de una presentacion ajena (R16)',
      invocar: (m) => m.updatePresentation(PRESENTACION_DE_A, PRESENTACION_VALIDA, ACTOR_B),
      error: PresentationNotFoundError,
    },
    {
      nombre: 'borrado de una presentacion ajena (R16)',
      invocar: (m) => m.deletePresentation(PRESENTACION_DE_A, ACTOR_B),
      error: PresentationNotFoundError,
    },
  ];

  it('cada cruce lanza el error de «no existe» del recurso, y NUNCA UnauthorizedError', async () => {
    for (const cruce of CRUCES) {
      const m = montar();

      await expect(cruce.invocar(m), cruce.nombre).rejects.toBeInstanceOf(cruce.error);
      // La mitad que R15 subraya: distinguir «no puedes» de «no existe» sobre datos ajenos es
      // un ORACULO DE EXISTENCIA -quien sondea identificadores aprenderia que filas tienen las
      // demas empresas-. Con el permiso en la mano, el codigo NO puede ser el de autorizacion.
      await expect(cruce.invocar(montar()), cruce.nombre).rejects.not.toBeInstanceOf(
        UnauthorizedError,
      );
    }
  });

  it('el mismo identificador, en su propia empresa, SI resuelve: el rechazo es por empresa', async () => {
    // Sin esto, los cinco rechazos de arriba podrian venir de un doble roto y este archivo
    // estaria midiendo un error de fixture en vez del aislamiento.
    const m = montar();

    await expect(m.getProduct(PRODUCTO_DE_A, ACTOR_A)).resolves.toMatchObject({
      id: PRODUCTO_DE_A,
    });
    await expect(m.updateProduct(PRODUCTO_DE_A, EDICION_VALIDA, ACTOR_A)).resolves.toBeUndefined();
    await expect(
      m.updatePresentation(PRESENTACION_DE_A, PRESENTACION_VALIDA, ACTOR_A),
    ).resolves.toBeUndefined();
    await expect(m.deleteProduct(PRODUCTO_DE_A, ACTOR_A)).resolves.toBeUndefined();
    await expect(m.deletePresentation(PRESENTACION_DE_A, ACTOR_A)).resolves.toBeUndefined();
  });

  it('agregar un lote a un producto ajeno se rechaza como «no existe» y no escribe nada', async () => {
    // R16, el caso del LOTE: el alta con un nombre que existe en A, pedida desde B. `B` no ve
    // el homonimo, asi que el camino correcto es crear uno NUEVO en B -nunca colgarle el lote
    // al producto de A-. Lo que no puede pasar bajo ningun concepto es que se escriba un lote
    // con `productId` del producto de A.
    const m = montar();

    await m.createProduct(ALTA_VALIDA, ACTOR_B);

    expect(m.products.addBatchToAlive).not.toHaveBeenCalled();
    expect(m.creados.every((escritura) => escritura.productId !== PRODUCTO_DE_A)).toBe(true);
  });

  it('el rechazo cruzado no modifica NI la fila ajena NI ninguna propia', async () => {
    const m = montar();
    const antes = JSON.stringify({ productos: m.productos, presentaciones: m.presentaciones });

    await m.updateProduct(PRODUCTO_DE_A, EDICION_VALIDA, ACTOR_B).catch(() => undefined);
    await m.deleteProduct(PRODUCTO_DE_A, ACTOR_B).catch(() => undefined);
    await m
      .updatePresentation(PRESENTACION_DE_A, PRESENTACION_VALIDA, ACTOR_B)
      .catch(() => undefined);
    await m.deletePresentation(PRESENTACION_DE_A, ACTOR_B).catch(() => undefined);

    expect(JSON.stringify({ productos: m.productos, presentaciones: m.presentaciones })).toBe(
      antes,
    );
    expect(m.creados).toEqual([]);
  });
});

describe('QC-49 R24 — el permiso se exige ANTES del ambito', () => {
  /** Sin permiso Y de otra empresa: los dos motivos de rechazo a la vez, para ver cual gana. */
  const ACTOR_SIN_PERMISO_DE_B: Actor = { id: 'user-b', companyId: EMPRESA_B, permissions: [] };

  it('los nueve rechazan por autorizacion, SIN tocar el puerto', async () => {
    for (const caso of CASOS_DE_USO) {
      const m = montar();

      await expect(caso.invocar(m, ACTOR_SIN_PERMISO_DE_B), caso.nombre).rejects.toBeInstanceOf(
        UnauthorizedError,
      );

      // «Sin tocar el puerto» se afirma CONTANDO invocaciones de los doce dobles, no mirando
      // que lanza: si el ambito se resolviera primero, alguno se habria llamado ya.
      for (const doble of [
        ...Object.values(m.products),
        ...Object.values(m.presentations),
        m.log.ignoredFields,
      ]) {
        expect(doble, caso.nombre).not.toHaveBeenCalled();
      }
    }
  });

  it('el rechazo por permiso no es el de «no existe»: el ambito ajeno no adelanta', async () => {
    // Si el orden se invirtiera -ambito primero-, las operaciones sobre filas de A pedidas
    // desde B devolverian `product_not_found`/`presentation_not_found` y esto caeria.
    const m = montar();

    await expect(
      m.getProduct(PRODUCTO_DE_A, ACTOR_SIN_PERMISO_DE_B),
    ).rejects.not.toBeInstanceOf(ProductNotFoundError);
    await expect(
      m.deletePresentation(PRESENTACION_DE_A, ACTOR_SIN_PERMISO_DE_B),
    ).rejects.not.toBeInstanceOf(PresentationNotFoundError);
  });
});

describe('QC-49 R17 — la empresa de la entrada no se escribe, no cuenta y se rechaza', () => {
  it('una companyId en el alta de producto es campo desconocido: invalid_input', async () => {
    // `createProductWithFirstBatchSchema` es `strictObject`, asi que la empresa colada no se
    // ignora en silencio: se RECHAZA. Quien la envio se entera de que no se guardo.
    const m = montar();

    await expect(
      m.createProduct({ ...ALTA_VALIDA, companyId: EMPRESA_B }, ACTOR_A),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.products.createWithFirstBatch).not.toHaveBeenCalled();
    expect(m.creados).toEqual([]);
  });

  it('una companyId en la edicion de producto tambien es invalid_input', async () => {
    const m = montar();

    await expect(
      m.updateProduct(PRODUCTO_DE_A, { ...EDICION_VALIDA, companyId: EMPRESA_B }, ACTOR_A),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.products.updateAlive).not.toHaveBeenCalled();
  });

  it('una companyId en el alta de presentacion es campo desconocido: invalid_input', async () => {
    // Este caso nacio DOCUMENTANDO UN HUECO: `createPresentationSchema` era `z.object` y no
    // `z.strictObject`, asi que la empresa colada se PODABA en silencio. Las dos primeras
    // mitades de R17 -«no la escribe» y «no la tiene en cuenta»- se cumplian; la tercera
    // -«rechazar por campo desconocido»- no. Cerrado el 2026-09-11 con `z.strictObject` en
    // `domain/presentation-input.ts`, que es lo que este caso afirma ahora: la presentacion
    // se comporta como el producto, cuyos dos esquemas ya eran estrictos.
    const m = montar();
    const antes = JSON.stringify(m.presentaciones);

    await expect(
      m.createPresentation({ ...PRESENTACION_VALIDA, companyId: EMPRESA_B }, ACTOR_A),
    ).rejects.toBeInstanceOf(ValidationError);

    // No se escribio NADA: ni con la empresa colada ni con la del actor. El rechazo es antes
    // del puerto, no una correccion posterior. Se compara el estado ENTERO del fixture, no su
    // longitud: una escritura que reemplazara la fila sembrada no cambiaria el conteo.
    expect(m.presentations.create).not.toHaveBeenCalled();
    expect(JSON.stringify(m.presentaciones)).toBe(antes);
  });

  it('una companyId en la edicion de presentacion tambien es invalid_input', async () => {
    // La edicion reutiliza el MISMO esquema (`updatePresentationSchema === createPresentationSchema`),
    // asi que la estrictez vale para las dos puertas. Se afirma aparte para que quitarla de una
    // sola de ellas manana ponga esto rojo.
    const m = montar();

    await expect(
      m.updatePresentation(
        PRESENTACION_DE_A,
        { ...PRESENTACION_VALIDA, companyId: EMPRESA_B },
        ACTOR_A,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.presentations.replace).not.toHaveBeenCalled();
  });

  it('el alta de presentacion SIN empresa colada escribe la del actor', async () => {
    // La mitad positiva del caso de arriba: rechazar la colada no basta si la correcta no se
    // escribe. Sin este caso, un esquema que rechazara TODO dejaria el anterior en verde.
    const m = montar();

    const creada = await m.createPresentation(PRESENTACION_VALIDA, ACTOR_A);

    expect(m.presentaciones.find((fila) => fila.id === creada.id)?.companyId).toBe(EMPRESA_A);
    const [datos, ambito] = m.presentations.create.mock.calls.at(-1) ?? [];
    expect(JSON.stringify(datos)).not.toContain('companyId');
    expect(JSON.stringify(datos)).not.toContain(EMPRESA_B);
    expect(ambito).toEqual({ companyId: EMPRESA_A });
  });

  it('el alta escribe la empresa DEL ACTOR, no la de la entrada', async () => {
    // Las tres creaciones del modulo -producto con su lote, lote suelto y presentacion- quedan
    // con la empresa del ambito. Es la mitad positiva de R17: no basta con rechazar la colada,
    // hay que escribir la correcta.
    const m = montar();

    await m.createProduct(ALTA_VALIDA, ACTOR_B);
    await m.createPresentation(PRESENTACION_VALIDA, ACTOR_B);

    expect(m.creados.map((escritura) => escritura.companyId)).toEqual([EMPRESA_B, EMPRESA_B]);
    // Y lo que viajo al puerto NO lleva la empresa dentro del dato: va por el `scope`, aparte.
    const [datosDelProducto] = m.products.createWithFirstBatch.mock.calls.at(-1) ?? [];
    const [datosDeLaPresentacion] = m.presentations.create.mock.calls.at(-1) ?? [];
    expect(JSON.stringify(datosDelProducto)).not.toContain('companyId');
    expect(JSON.stringify(datosDeLaPresentacion)).not.toContain('companyId');
  });
});

describe('QC-49 R18 — el homonimo de otra empresa no existe para quien da de alta', () => {
  it('el alta en B con el nombre de un producto de A crea uno NUEVO en B', async () => {
    // El fixture tiene «Acido sulfurico» VIVO en la empresa A. Quien da de alta desde B escribe
    // el mismo nombre: si `findAliveIdByName` no estuviera acotado, el caso de uso le colgaria
    // el lote al producto de A -una escritura en la empresa ajena, por el camino mas tonto-.
    const m = montar();

    const resultado = await m.createProduct(ALTA_VALIDA, ACTOR_B);

    expect(m.products.findAliveIdByName).toHaveBeenCalledTimes(1);
    expect(ambitoRecibido(m.products.findAliveIdByName)).toEqual({ companyId: EMPRESA_B });
    expect(m.products.addBatchToAlive).not.toHaveBeenCalled();
    expect(m.products.createWithFirstBatch).toHaveBeenCalledTimes(1);
    expect(resultado.id).not.toBe(PRODUCTO_DE_A);
    // El producto nuevo es de B, y el de A sigue vivo e intacto.
    expect(m.productos.find((fila) => fila.id === resultado.id)?.companyId).toBe(EMPRESA_B);
    expect(m.productos.find((fila) => fila.id === PRODUCTO_DE_A)).toEqual({
      id: PRODUCTO_DE_A,
      name: 'Acido sulfurico',
      companyId: EMPRESA_A,
      alive: true,
    });
  });

  it('el mismo alta en A SI encuentra su homonimo y le agrega el lote', async () => {
    // La mitad simetrica, y lo que impide leer el caso de arriba como «el alta nunca reusa».
    // Si esto no estuviera, un `findAliveIdByName` que devolviera siempre `null` -o sea, el
    // ambito roto por el otro lado- pasaria el test anterior sin despeinarse.
    const m = montar();

    const resultado = await m.createProduct(ALTA_VALIDA, ACTOR_A);

    expect(resultado).toEqual({ id: PRODUCTO_DE_A, lot: `lote-de-${PRODUCTO_DE_A}` });
    expect(m.products.addBatchToAlive).toHaveBeenCalledTimes(1);
    expect(m.products.createWithFirstBatch).not.toHaveBeenCalled();
    expect(m.creados).toEqual([
      { tipo: 'batch', companyId: EMPRESA_A, productId: PRODUCTO_DE_A },
    ]);
  });

  it('los listados de B no ven ni una fila de A (R14 visto desde el service)', async () => {
    const m = montar();

    const productosDeB = await m.listProducts({ page: 1 }, ACTOR_B);
    const presentacionesDeB = await m.listPresentations({ page: 1 }, ACTOR_B);

    expect(productosDeB.items).toEqual([]);
    expect(productosDeB.total).toBe(0);
    expect(presentacionesDeB.items).toEqual([]);
    expect(presentacionesDeB.total).toBe(0);

    // Y desde A si estan: el doble no esta devolviendo vacio por estar roto.
    const productosDeA = await m.listProducts({ page: 1 }, ACTOR_A);
    expect(productosDeA.items.map((fila) => fila.id)).toEqual([PRODUCTO_DE_A]);
  });
});
