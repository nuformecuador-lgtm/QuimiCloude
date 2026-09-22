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

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { ListQuery } from '@/lib/modules/inventario/domain/list-query';
import type { Page } from '@/lib/modules/inventario/domain/page';
import type { PresentationView } from '@/lib/modules/inventario/domain/presentation-view';
import type { ProductView } from '@/lib/modules/inventario/domain/product-view';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';
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

/** QC-74 (R13, R14): actor con el conjunto VACIO. Sustituye al viejo "rol Operador": desde
 *  QC-74 el Operador SI tiene `inventario.consultar`, asi que ya no sirve como caso de rechazo. */
const SIN_PERMISO: Actor = { id: 'sin-permiso-1', companyId: EMPRESA, permissions: [] };

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
    findAliveIdByNameInPresentationUnit: vi.fn<
      ProductRepository['findAliveIdByNameInPresentationUnit']
    >(),
    createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(),
    addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(),
    // QC-92: mismo criterio, el listado tampoco los usa.
    adjustBatchStock: vi.fn<ProductRepository['adjustBatchStock']>(),
    findBatchesOfAliveProduct: vi.fn<ProductRepository['findBatchesOfAliveProduct']>(),
    findBatchMovements: vi.fn<ProductRepository['findBatchMovements']>(),
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

/**
 * La consulta que llego al puerto en la ultima llamada.
 *
 * QC-49 (R13, R31): el puerto pasa a recibir DOS argumentos -la consulta y el AMBITO-, asi
 * que el tipo de `mock.calls` cambio. Lo que este ayudante devuelve NO cambia: sigue siendo
 * la consulta, el primer argumento, que es lo que afirma todo el archivo. El ambito se lee
 * con `ambitoRecibido`, abajo, y tiene sus propios casos.
 */
function consultaRecibida(recibidas: readonly (readonly [ListQuery, InventoryScope])[]): ListQuery {
  const ultima = recibidas.at(-1);
  if (ultima === undefined) throw new Error('el puerto no fue llamado');
  return ultima[0];
}

/** El ambito que llego al puerto en la ultima llamada (QC-49 R13). */
function ambitoRecibido(
  recibidas: readonly (readonly [ListQuery, InventoryScope])[],
): InventoryScope {
  const ultima = recibidas.at(-1);
  if (ultima === undefined) throw new Error('el puerto no fue llamado');
  return ultima[1];
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
    // R8 — `qtyAlert` es `numberRange`; pedirlo como texto no puede romper la consulta.
    const { products, log, listProducts } = montarProductos();

    await listProducts({ filters: { qtyAlert: { kind: 'text', value: '5' } } }, ADMIN);

    expect(consultaRecibida(products.listAlive.mock.calls).filters).toEqual({});
    expect(log.ignoredFields).toHaveBeenCalledWith('products', ['qtyAlert']);
  });

  it('ordenar y filtrar por existencia llega intacto al puerto (R15)', async () => {
    const { products, log, listProducts } = montarProductos();

    await listProducts(
      { sort: { columnId: 'stock', direction: 'desc' }, filters: { stock: { kind: 'numberRange', min: 0, max: 10 } } },
      ADMIN,
    );

    expect(consultaRecibida(products.listAlive.mock.calls).sort).toEqual({
      columnId: 'stock',
      direction: 'desc',
    });
    expect(consultaRecibida(products.listAlive.mock.calls).filters).toEqual({
      stock: { kind: 'numberRange', min: 0, max: 10 },
    });
    expect(log.ignoredFields).toHaveBeenCalledWith('products', []);
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
          // Los dos filtros son de `PRODUCT_QUERYABLE`. `unitId` no lo es: no hay entrada de
          // eleccion por unidad en el listado.
          qtyAlert: { kind: 'numberRange', min: null, max: 3 },
          createdAt: { kind: 'dateRange', from: '2026-01-01', to: null },
        },
      },
      ADMIN,
    );

    expect(consultaRecibida(products.listAlive.mock.calls).filters).toEqual({
      qtyAlert: { kind: 'numberRange', min: null, max: 3 },
      createdAt: { kind: 'dateRange', from: '2026-01-01', to: null },
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

// AMPLIACION 2026-09-11 (QC-49, R31) — LO QUE NO PUEDE CAMBIAR.
//
// QC-49 acota los dos listados a la empresa de la sesion y NADA MAS: el orden por defecto, la
// busqueda, el filtrado, la paginacion y la FORMA del resultado se quedan como estaban, y las
// firmas de los dos casos de uso tampoco cambian. Todo lo de arriba en este archivo sigue
// midiendo exactamente eso -y sigue verde-, asi que este bloque no lo repite: ancla lo que la
// ficha AÑADE sin romperlo, que es donde esta el riesgo.
describe('QC-49 R31 — el ambito se anade al puerto y no cambia ni la firma ni la salida', () => {
  it('los dos casos de uso siguen recibiendo (entrada, actor) y devolviendo la misma Page', async () => {
    const { listProducts } = montarProductos();
    const { listPresentations } = montarPresentaciones();

    // La firma: DOS parametros, ni uno mas. Si alguien hubiera colado la empresa como tercer
    // argumento -en vez de dentro del actor-, `length` seria 3 y esto cae.
    expect(listProducts).toHaveLength(2);
    expect(listPresentations).toHaveLength(2);

    // La forma de la salida: las cinco claves de `Page`, sin ninguna de empresa (R19).
    const paginaProductos = await listProducts({ page: 1 }, ADMIN);
    const paginaPresentaciones = await listPresentations({ page: 1 }, ADMIN);

    for (const pagina of [paginaProductos, paginaPresentaciones]) {
      expect(Object.keys(pagina).sort()).toEqual(['items', 'page', 'pageSize', 'total', 'totalPages']);
    }
    expect(paginaProductos).toEqual(paginaVacia());
    expect(paginaPresentaciones).toEqual(paginaVacia());
  });

  it('la empresa viaja en el SEGUNDO argumento del puerto y no se cuela dentro de la consulta', async () => {
    // R13/R31 a la vez: el ambito llega, y llega APARTE. Si alguien lo fundiera en la consulta
    // -un `companyId` dentro de `filters`, o una clave suelta en el objeto de `ListQuery`-, la
    // segunda afirmacion cae: el contrato generico de QC-57 tiene cinco claves y solo cinco.
    const { products, listProducts } = montarProductos();
    const { presentations, listPresentations } = montarPresentaciones();

    await listProducts({ page: 2, pageSize: 25, search: 'bidon' }, ADMIN);
    await listPresentations({ page: 2, pageSize: 25, search: 'bidon' }, ADMIN);

    expect(ambitoRecibido(products.listAlive.mock.calls)).toEqual({ companyId: EMPRESA });
    expect(ambitoRecibido(presentations.list.mock.calls)).toEqual({ companyId: EMPRESA });

    for (const consulta of [
      consultaRecibida(products.listAlive.mock.calls),
      consultaRecibida(presentations.list.mock.calls),
    ]) {
      expect(Object.keys(consulta).sort()).toEqual([
        'filters',
        'page',
        'pageSize',
        'search',
        'sort',
      ]);
      expect(JSON.stringify(consulta)).not.toContain('companyId');
      expect(JSON.stringify(consulta)).not.toContain(EMPRESA);
    }
  });

  it('la empresa sale del ACTOR, no de la entrada: cambiar de actor cambia el ambito', async () => {
    // Falsable de verdad: si el caso de uso leyera la empresa de la entrada -o la tuviera
    // cableada-, el ambito de la segunda llamada seguiria siendo el de la primera.
    const { products, listProducts } = montarProductos();
    const OTRA_EMPRESA = 'company-b';

    await listProducts({ page: 1 }, ADMIN);
    expect(ambitoRecibido(products.listAlive.mock.calls)).toEqual({ companyId: EMPRESA });

    await listProducts(
      { page: 1, filters: {}, search: '' },
      { ...ADMIN, companyId: OTRA_EMPRESA },
    );
    expect(ambitoRecibido(products.listAlive.mock.calls)).toEqual({ companyId: OTRA_EMPRESA });
  });
});
