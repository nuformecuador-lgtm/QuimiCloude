// QC-57 T8/T9 — Los dos casos de uso de listado de `inventario` con el CONTRATO GENERICO de
// consulta, con el repositorio y el log MOCKEADOS (`design.md > 1`, `> 12`).
//
// Cubre R5, R6, R8, R11, R13, R15, R16, R20, R24, R30, R33 y R34. Lo que NO se prueba aqui es
// como se traduce la consulta a SQL: eso es de `tests/integration/inventario/` -un doble del
// puerto no puede demostrar que la base filtro antes de paginar-.
//
// EL TEST QUE NO PUEDE FALTAR (`design.md > 12`): pedir orden por `deletedAt` y comprobar LAS
// TRES COSAS A LA VEZ -que la consulta no falla, que el orden aplicado es el de por defecto y
// que el log recibio el campo-. Comprobar solo la primera pasa en verde con un `catch` vacio.

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import { UnauthorizedError, ValidationError } from '@/lib/modules/inventario/domain/errors';
import { createListPresentations } from '@/lib/modules/inventario/domain/list-presentations';
import { createListProducts } from '@/lib/modules/inventario/domain/list-products';

import type { ListQuery } from '@/lib/modules/inventario/domain/list-query';
import type { Page } from '@/lib/modules/inventario/domain/page';
import type { PresentationView } from '@/lib/modules/inventario/domain/presentation-view';
import type { ProductView } from '@/lib/modules/inventario/domain/product-view';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

/** QC-74 (R18): el actor ya no trae nombre de rol, trae su conjunto de permisos. Este
 *  lleva los dos codigos de `inventario`, que es lo que el seed da al Administrador. */
const ADMIN: Actor = {
  id: 'admin-1',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/** QC-74 (R13, R14): actor con el conjunto VACIO. Sustituye al viejo "rol Operador": desde
 *  QC-74 el Operador SI tiene `inventario.consultar`, asi que ya no sirve como caso de rechazo. */
const SIN_PERMISO: Actor = { id: 'sin-permiso-1', permissions: [] };

function paginaVacia<T>(): Page<T> {
  return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
}

function montarProductos() {
  const listAlive = vi.fn<ProductRepository['listAlive']>(async () => paginaVacia<ProductView>());
  const products = {
    create: vi.fn<ProductRepository['create']>(),
    findAliveById: vi.fn<ProductRepository['findAliveById']>(),
    updateAlive: vi.fn<ProductRepository['updateAlive']>(),
    softDeleteAlive: vi.fn<ProductRepository['softDeleteAlive']>(),
    // QC-90 (T4): el doble cumple el puerto ENTERO. El listado no los usa; estan para que
    // el compilador siga vigilando la forma completa de `ProductRepository`.
    findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(),
    createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(),
    addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(),
    listAlive,
  } satisfies ProductRepository;
  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
  return { products, log, listProducts: createListProducts({ products, log }) };
}

function montarPresentaciones() {
  const list = vi.fn<PresentationRepository['list']>(async () => paginaVacia<PresentationView>());
  const presentations = {
    create: vi.fn<PresentationRepository['create']>(),
    replace: vi.fn<PresentationRepository['replace']>(),
    deleteById: vi.fn<PresentationRepository['deleteById']>(),
    list,
  } satisfies PresentationRepository;
  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
  return {
    presentations,
    log,
    listPresentations: createListPresentations({ presentations, log }),
  };
}

/** La consulta que llego al puerto en la ultima llamada. */
function consultaRecibida(recibidas: readonly (readonly [ListQuery])[]): ListQuery {
  const ultima = recibidas.at(-1);
  if (ultima === undefined) throw new Error('el puerto no fue llamado');
  return ultima[0];
}

describe('list-products: autorizacion antes que todo (R33, R34)', () => {
  // R34 exige probarlo DOS veces: con una consulta valida y con una que traiga campos no
  // declarados. Si el permiso se comprobara despues de sanear, el segundo caso fallaria por
  // otro motivo y nadie lo notaria.
  const CONSULTAS: ReadonlyArray<{ readonly nombre: string; readonly entrada: unknown }> = [
    { nombre: 'consulta valida', entrada: { page: 1, pageSize: 10 } },
    {
      nombre: 'consulta con campos no declarados',
      entrada: {
        sort: { columnId: 'deletedAt', direction: 'asc' },
        filters: { nombre: { kind: 'text', value: 'x' } },
      },
    },
  ];

  for (const caso of CONSULTAS) {
    it(`rechaza al actor sin permiso con ${caso.nombre} sin tocar el repositorio`, async () => {
      // R34 — se afirma CONTANDO invocaciones del doble, no solo mirando que lanza.
      const { products, log, listProducts } = montarProductos();

      await expect(listProducts(caso.entrada, SIN_PERMISO)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      expect(products.listAlive).toHaveBeenCalledTimes(0);
      expect(log.ignoredFields).toHaveBeenCalledTimes(0);
    });

    it(`rechaza al actor ausente con ${caso.nombre} sin tocar el repositorio`, async () => {
      // R34 — sin actor es el mismo caso que con rol insuficiente.
      const { products, log, listProducts } = montarProductos();

      await expect(listProducts(caso.entrada, null)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(products.listAlive).toHaveBeenCalledTimes(0);
      expect(log.ignoredFields).toHaveBeenCalledTimes(0);
    });
  }
});

describe('list-products: el campo no declarado se omite, no rompe y se anota (R5, R6, R7, R8, R11)', () => {
  it('ordenar por deletedAt: no falla, aplica el orden por defecto Y el log recibe el campo', async () => {
    // R5 + R7 + R11 + R6, LAS TRES COSAS A LA VEZ (`design.md > 12`). `deletedAt` no es
    // consultable en ninguna lista (R7) y `sanitizeListQuery` lo poda ademas por su cuenta.
    const { products, log, listProducts } = montarProductos();

    const pagina = await listProducts(
      { page: 1, sort: { columnId: 'deletedAt', direction: 'desc' } },
      ADMIN,
    );

    // (a) la consulta NO falla
    expect(pagina.items).toEqual([]);
    // (b) el orden aplicado es el de por defecto: `sort: null` -quien lo traduce a
    //     `name ASC, id ASC` es el adaptador (R11)-
    expect(products.listAlive).toHaveBeenCalledTimes(1);
    expect(consultaRecibida(products.listAlive.mock.calls).sort).toBeNull();
    // (c) el log recibio el campo, con el nombre del listado
    expect(log.ignoredFields).toHaveBeenCalledWith('products', ['deletedAt']);
  });

  it('un filtro con la forma equivocada se omite y se anota, sin fallar (R8)', async () => {
    // R8 — `stock` es `numberRange`; pedirlo como texto no puede romper la consulta.
    const { products, log, listProducts } = montarProductos();

    await listProducts({ filters: { stock: { kind: 'text', value: '5' } } }, ADMIN);

    expect(consultaRecibida(products.listAlive.mock.calls).filters).toEqual({});
    expect(log.ignoredFields).toHaveBeenCalledWith('products', ['stock']);
  });

  it('el log recibe NOMBRES de campo y nunca el valor buscado ni el del filtro (R6, PII)', async () => {
    // R6 + anti-patron de PII: lo que se registra no puede contener lo que la persona escribio.
    const TERMINO = 'acido del cliente Perez';
    const VALOR_DE_FILTRO = 'cliente-secreto';
    const { log, listProducts } = montarProductos();

    await listProducts(
      {
        search: TERMINO,
        sort: { columnId: 'inventado', direction: 'asc' },
        filters: { tambienInventado: { kind: 'select', values: [VALOR_DE_FILTRO] } },
      },
      ADMIN,
    );

    expect(log.ignoredFields).toHaveBeenCalledTimes(1);
    const argumentos = JSON.stringify(vi.mocked(log.ignoredFields).mock.calls[0]);
    expect(argumentos).toContain('inventado');
    expect(argumentos).toContain('tambienInventado');
    expect(argumentos).not.toContain(TERMINO);
    expect(argumentos).not.toContain(VALOR_DE_FILTRO);
  });

  it('una consulta limpia tambien llama al log, pero con la lista vacia (R6)', async () => {
    // R6 — quien decide no emitir nada es la implementacion del puerto, no el caso de uso: asi
    // el test de arriba puede espiar SIEMPRE la llamada.
    const { log, listProducts } = montarProductos();

    await listProducts({ page: 1, sort: { columnId: 'name', direction: 'asc' } }, ADMIN);

    expect(log.ignoredFields).toHaveBeenCalledWith('products', []);
  });
});

describe('list-products: lo que llega al repositorio (R11, R13, R15, R20, R24, R30)', () => {
  it('sin orden, la consulta llega con sort nulo: el orden de hoy (R11)', async () => {
    const { products, listProducts } = montarProductos();

    await listProducts({ page: 3, pageSize: 25 }, ADMIN);

    expect(consultaRecibida(products.listAlive.mock.calls)).toEqual({
      page: 3,
      pageSize: 25,
      sort: null,
      filters: {},
      search: '',
    });
  });

  it('el selector de ingredientes encuentra por nombre A TRAVES DEL CONTRATO (R24)', async () => {
    // R24 — el listado de productos ya no tiene parametro de busqueda propio
    // (`productQuerySchema` no existe): la busqueda entra por `search` del contrato y llega
    // -sin tocar- al repositorio, que es quien la lleva al motor (R13, R16).
    const { products, log, listProducts } = montarProductos();

    await listProducts({ page: 1, pageSize: 25, search: 'solucion' }, ADMIN);

    expect(consultaRecibida(products.listAlive.mock.calls).search).toBe('solucion');
    expect(log.ignoredFields).toHaveBeenCalledWith('products', []);
  });

  it('una busqueda de solo espacios es ausencia de busqueda (R20)', async () => {
    const { products, listProducts } = montarProductos();

    await listProducts({ search: '   ' }, ADMIN);

    expect(consultaRecibida(products.listAlive.mock.calls).search).toBe('');
  });

  it('los filtros declarados llegan intactos y todos a la vez (R15)', async () => {
    const { products, listProducts } = montarProductos();

    await listProducts(
      {
        filters: {
          // Los dos filtros son de `PRODUCT_QUERYABLE`. El segundo era `unitId` hasta QC-80
          // (R21): dejo de estar declarado -`products.unit_id` no existe-, asi que un caso de
          // «llegan intactos» no puede apoyarse en el, o mediria la omision en vez del paso.
          stock: { kind: 'numberRange', min: 5, max: null },
          qtyAlert: { kind: 'numberRange', min: null, max: 3 },
        },
      },
      ADMIN,
    );

    expect(consultaRecibida(products.listAlive.mock.calls).filters).toEqual({
      stock: { kind: 'numberRange', min: 5, max: null },
      qtyAlert: { kind: 'numberRange', min: null, max: 3 },
    });
  });

  it('la entrada que no cumple la FORMA se rechaza antes de tocar el repositorio (R30)', async () => {
    // R30 — validar es del caso de uso, con zod, ANTES del repositorio. Un campo no declarado
    // se omite (R5); una pagina 0 es otra cosa: la forma esta mal y se rechaza.
    const { products, log, listProducts } = montarProductos();

    await expect(listProducts({ page: 0 }, ADMIN)).rejects.toBeInstanceOf(ValidationError);
    expect(products.listAlive).toHaveBeenCalledTimes(0);
    expect(log.ignoredFields).toHaveBeenCalledTimes(0);
  });
});

describe('list-presentations: mismo contrato, misma disciplina', () => {
  it('rechaza al actor sin permiso sin tocar el repositorio, con consulta valida y con campos no declarados (R34)', async () => {
    for (const entrada of [{ page: 1 }, { sort: { columnId: 'deletedAt', direction: 'asc' } }]) {
      const { presentations, log, listPresentations } = montarPresentaciones();

      await expect(listPresentations(entrada, SIN_PERMISO)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      expect(presentations.list).toHaveBeenCalledTimes(0);
      expect(log.ignoredFields).toHaveBeenCalledTimes(0);
    }
  });

  it('ordenar por un campo no declarado: no falla, orden por defecto y log (R5, R6, R11)', async () => {
    const { presentations, log, listPresentations } = montarPresentaciones();

    const pagina = await listPresentations(
      { sort: { columnId: 'stock', direction: 'asc' } },
      ADMIN,
    );

    expect(pagina.items).toEqual([]);
    expect(consultaRecibida(presentations.list.mock.calls).sort).toBeNull();
    expect(log.ignoredFields).toHaveBeenCalledWith('presentations', ['stock']);
  });

  it('la busqueda del contrato llega al repositorio (R16)', async () => {
    const { presentations, listPresentations } = montarPresentaciones();

    await listPresentations({ search: 'bidon' }, ADMIN);

    expect(consultaRecibida(presentations.list.mock.calls).search).toBe('bidon');
  });
});
