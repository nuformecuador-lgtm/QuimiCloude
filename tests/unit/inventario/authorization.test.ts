// T9 -- El test de autorizacion de los DOCE casos de uso de `inventario`, reescrito por
// QC-74 (requirements.md R12-R18; design.md > 5; tasks.md bloque E). Sustituye al barrido
// por rol de QC-20/QC-54: ahora cada caso de uso exige un CODIGO del catalogo
// (`inventario.consultar` / `inventario.modificar`), y este archivo es la unica red que
// existe para R16/R17 -las guardias de texto no pueden ver si el codigo exigido es el
// correcto (design.md > 6.2, ultimo parrafo)-.
//
// AMPLIADO por QC-92 (T8): entran los tres casos de uso del libro de inventario
// -`adjust-batch-stock`, `list-product-batches` y `list-batch-movements`-, y con ellos el puerto
// de personas de `identity`, del que el historial saca el nombre del autor del asiento.
//
// Sigue siendo un barrido de los doce, con dobles de puerto que FALLAN si los llaman: un
// service test de un solo caso de uso puede quedarse verde aunque la comprobacion
// desaparezca de otro archivo (ya paso una vez en esta feature con `create-product.ts`).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PERMISSIONS, type PeopleDirectory, type PermissionCode } from '@/lib/modules/identity';
import type { Actor } from '@/lib/modules/inventario/domain/actor';
import { createAdjustBatchStock } from '@/lib/modules/inventario/domain/adjust-batch-stock';
import { createCreatePresentation } from '@/lib/modules/inventario/domain/create-presentation';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { createDeletePresentation } from '@/lib/modules/inventario/domain/delete-presentation';
import { createDeleteProduct } from '@/lib/modules/inventario/domain/delete-product';
import {
  InventarioError,
  PresentationNotFoundError,
  ProductNotFoundError,
  UnauthorizedError,
} from '@/lib/modules/inventario/domain/errors';
import { createGetProduct } from '@/lib/modules/inventario/domain/get-product';
import { createListBatchMovements } from '@/lib/modules/inventario/domain/list-batch-movements';
import { createListProductBatches } from '@/lib/modules/inventario/domain/list-product-batches';
import { createListPresentations } from '@/lib/modules/inventario/domain/list-presentations';
import { createListProducts } from '@/lib/modules/inventario/domain/list-products';
import { createProductWithFirstBatchSchema } from '@/lib/modules/inventario/domain/product-batch-input';
import { createProductSchema } from '@/lib/modules/inventario/domain/product-input';
import { createUpdatePresentation } from '@/lib/modules/inventario/domain/update-presentation';
import { createUpdateProduct } from '@/lib/modules/inventario/domain/update-product';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

/** Los dos codigos de este modulo (R16). `satisfies` los ata a la union del catalogo: un
 *  codigo mal escrito aqui no compila, no falla en tiempo de ejecucion. */
const CONSULTAR = 'inventario.consultar' satisfies PermissionCode;
const MODIFICAR = 'inventario.modificar' satisfies PermissionCode;

/**
 * QC-49 (R11, R24): la empresa EN CUYO NOMBRE opera el actor. Esta aqui porque el `Actor` la
 * exige desde QC-49, pero NO cambia una sola expectativa de este archivo: la empresa FILTRA y
 * no AUTORIZA, asi que ningun caso de abajo se concede ni se rechaza por ella.
 */
const EMPRESA_DEL_ACTOR = 'company-a';

/** Otra empresa, para el bloque de R24: el ambito ajeno no adelanta al permiso. */
const OTRA_EMPRESA = 'company-b';

/** Actor con un conjunto de permisos EXACTO: es lo que hace visible el cruce de R13. */
function actorCon(...permissions: readonly PermissionCode[]): Actor {
  return {
    id: `actor-${permissions.join('+') || 'sin-permisos'}`,
    companyId: EMPRESA_DEL_ACTOR,
    permissions,
  };
}

/** Entrada valida minima de la EDICION, que ya no conoce la existencia (R9): el esquema es
 *  `strictObject` y `qtyAlert` sigue siendo obligatorio desde la decision del humano del
 *  2026-09-03. `minPurchase` se fue con QC-52 (R1), y `presentationId` con la mudanza a
 *  `product_batches` (2026-09-09). */
const PRODUCTO_VALIDO = {
  name: 'Acido sulfurico',
  qtyAlert: 0,
};

/** QC-90 (R1): el ALTA ya no acepta un producto pelado -siempre crea su primer lote-, asi
 *  que el fixture del alta lleva ademas la existencia del lote, presentacion y costo. */
const PRODUCTO_VALIDO_CON_LOTE = {
  ...PRODUCTO_VALIDO,
  stock: 0,
  presentationId: '11111111-1111-4111-8111-111111111111',
  unitCost: '10.0000',
};

/** QC-80 (R10): la unidad es obligatoria en el alta y en la edicion, asi que la entrada
 *  valida minima la lleva. Es un uuid cualquiera: aqui no hay base, y lo que este archivo
 *  afirma es el ORDEN -permiso antes que zod-, no la existencia de la unidad. */
const PRESENTACION_VALIDA = {
  name: 'Bidon 20 L',
  unitId: '11111111-1111-4111-8111-111111111111',
};

/** QC-92 (R3, R8): entrada valida minima del AJUSTE. Delta entero distinto de cero y motivo del
 *  conjunto cerrado; el `batchId` es un uuid cualquiera porque aqui no hay base. */
const AJUSTE_VALIDO = {
  batchId: '22222222-2222-4222-8222-222222222222',
  delta: 2,
  reason: 'merma',
};

/** Entrada que zod rechaza sin dudarlo: es la que demuestra R12 -el permiso se mira ANTES
 *  de validar-. */
const ENTRADA_INVALIDA = { campo: 'que no existe', name: 42 };

/**
 * Doble del puerto de producto que FALLA si cualquiera de sus metodos es llamado
 * (design.md de QC-20 > 12, cuarto aviso): "un doble que registre la llamada y un
 * `expect(...).not.toHaveBeenCalled()`; si el doble es permisivo, el test pasaria con la
 * autorizacion puesta despues de la consulta". `vi.fn` registra la llamada Y lanza, asi
 * que este test puede afirmar las DOS cosas: que se rechaza con `UnauthorizedError` y que
 * ningun metodo del puerto se toco (QC-74 R12, R14).
 */
function repositorioProductoQueFalla(): ProductRepository {
  const explota = () => {
    throw new Error('el repositorio no debe ser llamado');
  };
  return {
    create: vi.fn<ProductRepository['create']>(explota),
    findAliveById: vi.fn<ProductRepository['findAliveById']>(explota),
    updateAlive: vi.fn<ProductRepository['updateAlive']>(explota),
    softDeleteAlive: vi.fn<ProductRepository['softDeleteAlive']>(explota),
    listAlive: vi.fn<ProductRepository['listAlive']>(explota),
    // QC-90 (R23): los tres del alta con primer lote tambien EXPLOTAN. Sin ellos aqui, el
    // camino nuevo del alta seria justo el que se escapa de esta red.
    findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(explota),
    createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(explota),
    addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(explota),
    // QC-92: los tres del libro de inventario tambien EXPLOTAN, por la misma razon.
    adjustBatchStock: vi.fn<ProductRepository['adjustBatchStock']>(explota),
    findBatchesOfAliveProduct: vi.fn<ProductRepository['findBatchesOfAliveProduct']>(explota),
    findBatchMovements: vi.fn<ProductRepository['findBatchMovements']>(explota),
  };
}

/** Mismo criterio que arriba, para el puerto de presentacion. */
function repositorioPresentacionQueFalla(): PresentationRepository {
  const explota = () => {
    throw new Error('el repositorio no debe ser llamado');
  };
  return {
    create: vi.fn<PresentationRepository['create']>(explota),
    replace: vi.fn<PresentationRepository['replace']>(explota),
    deleteById: vi.fn<PresentationRepository['deleteById']>(explota),
    list: vi.fn<PresentationRepository['list']>(explota),
  };
}

/**
 * QC-57 (T7): los dos casos de uso de listado reciben ademas el puerto del log de campos
 * omitidos. Aqui es un doble que tambien EXPLOTA: el permiso se comprueba antes de sanear la
 * consulta, asi que un actor sin permiso no puede haber llegado ni siquiera a loguear nada.
 */
function logQueFalla(): ListQueryLog {
  return {
    ignoredFields: vi.fn<ListQueryLog['ignoredFields']>(() => {
      throw new Error('el log no debe ser llamado');
    }),
  };
}

/**
 * QC-92 (T8): el historial del lote resuelve el nombre del autor contra el puerto de personas de
 * `identity`. Mismo criterio que los repositorios: aqui EXPLOTA, porque sin permiso el caso de uso
 * no puede haber llegado ni a preguntar por un nombre.
 */
function directorioQueFalla(): PeopleDirectory {
  const explota = () => {
    throw new Error('el directorio de personas no debe ser llamado');
  };
  return {
    findAliveRefsInCompany: vi.fn<PeopleDirectory['findAliveRefsInCompany']>(explota),
    findRefsIncludingDeletedInCompany: vi.fn<PeopleDirectory['findRefsIncludingDeletedInCompany']>(
      explota,
    ),
  };
}

type Repos = {
  readonly products: ProductRepository;
  readonly presentations: PresentationRepository;
  readonly log: ListQueryLog;
  readonly people: PeopleDirectory;
};

function montarReposQueFallan(): Repos {
  return {
    products: repositorioProductoQueFalla(),
    presentations: repositorioPresentacionQueFalla(),
    log: logQueFalla(),
    people: directorioQueFalla(),
  };
}

const PRODUCTO_EN_BASE = {
  id: 'producto-1',
  name: 'Acido sulfurico',
  imagePath: null,
  stockByUnit: [],
  qtyAlert: 0,
  // QC-80 (R21, R22): el producto ya no declara unidad; la derivada del lote mas reciente es
  // `latestBatchUnitId`, y este doble no tiene lotes.
  latestBatchUnitId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const PAGINA_VACIA = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };

/**
 * Dobles PERMISIVOS: los de la mitad de la CONCESION (R17). Devuelven lo minimo para que el
 * caso de uso llegue hasta el final sin lanzar, de modo que la ausencia de error demuestre
 * que el permiso concedio de verdad, y no que el caso murio antes por otra razon.
 */
function montarReposPermisivos(): Repos {
  return {
    products: {
      create: vi.fn<ProductRepository['create']>(async () => ({ id: 'producto-1' })),
      findAliveById: vi.fn<ProductRepository['findAliveById']>(async () => PRODUCTO_EN_BASE),
      updateAlive: vi.fn<ProductRepository['updateAlive']>(async () => true),
      softDeleteAlive: vi.fn<ProductRepository['softDeleteAlive']>(async () => true),
      listAlive: vi.fn<ProductRepository['listAlive']>(async () => PAGINA_VACIA),
      // QC-90: sin producto vivo homonimo, el alta cae al camino de creacion (R16).
      findAliveIdByName: vi.fn<ProductRepository['findAliveIdByName']>(async () => null),
      createWithFirstBatch: vi.fn<ProductRepository['createWithFirstBatch']>(async () => ({
        id: 'producto-1',
        batchId: 'lote-1',
        lot: '1',
      })),
      addBatchToAlive: vi.fn<ProductRepository['addBatchToAlive']>(async () => ({
        batchId: 'lote-1',
        lot: '1',
      })),
      adjustBatchStock: vi.fn<ProductRepository['adjustBatchStock']>(async () => ({ stock: 1 })),
      findBatchesOfAliveProduct: vi.fn<ProductRepository['findBatchesOfAliveProduct']>(async () => []),
      findBatchMovements: vi.fn<ProductRepository['findBatchMovements']>(async () => []),
    },
    presentations: {
      create: vi.fn<PresentationRepository['create']>(async () => ({ id: 'presentacion-1' })),
      replace: vi.fn<PresentationRepository['replace']>(async () => 'ok'),
      deleteById: vi.fn<PresentationRepository['deleteById']>(async () => 'deleted'),
      list: vi.fn<PresentationRepository['list']>(async () => PAGINA_VACIA),
    },
    log: { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>(() => undefined) },
    // Sin ningun nombre que devolver: el historial permisivo tampoco tiene asientos.
    people: {
      findAliveRefsInCompany: vi.fn<PeopleDirectory['findAliveRefsInCompany']>(async () => []),
      findRefsIncludingDeletedInCompany: vi.fn<
        PeopleDirectory['findRefsIncludingDeletedInCompany']
      >(async () => []),
    },
  };
}

function todosLosMetodos(repos: Repos): ReadonlyArray<() => void> {
  return [
    () => expect(repos.products.create).not.toHaveBeenCalled(),
    () => expect(repos.products.findAliveById).not.toHaveBeenCalled(),
    () => expect(repos.products.updateAlive).not.toHaveBeenCalled(),
    () => expect(repos.products.softDeleteAlive).not.toHaveBeenCalled(),
    () => expect(repos.products.listAlive).not.toHaveBeenCalled(),
    // QC-90 (R23): «sin una sola llamada al repositorio» incluye los tres metodos del alta
    // con primer lote. Un metodo nuevo en el puerto que no se anada aqui es un hueco.
    () => expect(repos.products.findAliveIdByName).not.toHaveBeenCalled(),
    () => expect(repos.products.createWithFirstBatch).not.toHaveBeenCalled(),
    () => expect(repos.products.addBatchToAlive).not.toHaveBeenCalled(),
    // QC-92 (T8): los tres del libro de inventario. Faltaban, y eran justo el hueco por el que un
    // caso de uso nuevo se escaparia de esta red sin que nadie lo notara.
    () => expect(repos.products.adjustBatchStock).not.toHaveBeenCalled(),
    () => expect(repos.products.findBatchesOfAliveProduct).not.toHaveBeenCalled(),
    () => expect(repos.products.findBatchMovements).not.toHaveBeenCalled(),
    () => expect(repos.presentations.create).not.toHaveBeenCalled(),
    () => expect(repos.presentations.replace).not.toHaveBeenCalled(),
    () => expect(repos.presentations.deleteById).not.toHaveBeenCalled(),
    () => expect(repos.presentations.list).not.toHaveBeenCalled(),
    // QC-57 R34 / QC-74 R12: sin permiso no se toca el repositorio NI se registra nada en el log.
    () => expect(repos.log.ignoredFields).not.toHaveBeenCalled(),
    // QC-92: sin permiso tampoco se pregunta por el nombre del autor de ningun asiento.
    () => expect(repos.people.findAliveRefsInCompany).not.toHaveBeenCalled(),
    () => expect(repos.people.findRefsIncludingDeletedInCompany).not.toHaveBeenCalled(),
  ];
}

function afirmarQueNingunMetodoFueLlamado(repos: Repos): void {
  for (const afirmar of todosLosMetodos(repos)) afirmar();
}

type Invocacion = (repos: Repos, actor: Actor | null | undefined) => Promise<unknown>;

/**
 * La tabla de R16 hecha codigo: los DOCE casos de uso con el codigo EXACTO que cada uno
 * exige. Recorrerla en bucle es lo que hace que anadir un caso de uso manana sea trivial y
 * olvidarlo aqui, visible. `invocar` recibe el repositorio como parametro (no capturado por
 * closure), asi cada iteracion monta un repositorio NUEVO y el aislamiento es real.
 * `invocarConEntradaInvalida` es `null` en los casos que no reciben entrada validable
 * -solo un identificador-.
 */
const CASOS_DE_USO: ReadonlyArray<{
  readonly nombre: string;
  readonly permiso: PermissionCode;
  readonly invocar: Invocacion;
  readonly invocarConEntradaInvalida: Invocacion | null;
}> = [
  {
    nombre: 'create-product',
    permiso: MODIFICAR,
    invocar: (repos, actor) =>
      createCreateProduct({ products: repos.products })(PRODUCTO_VALIDO_CON_LOTE, actor),
    invocarConEntradaInvalida: (repos, actor) =>
      createCreateProduct({ products: repos.products })(ENTRADA_INVALIDA, actor),
  },
  {
    nombre: 'update-product',
    permiso: MODIFICAR,
    invocar: (repos, actor) =>
      createUpdateProduct({ products: repos.products })('producto-1', PRODUCTO_VALIDO, actor),
    invocarConEntradaInvalida: (repos, actor) =>
      createUpdateProduct({ products: repos.products })('producto-1', ENTRADA_INVALIDA, actor),
  },
  {
    nombre: 'delete-product',
    permiso: MODIFICAR,
    invocar: (repos, actor) =>
      createDeleteProduct({ products: repos.products })('producto-1', actor),
    invocarConEntradaInvalida: null,
  },
  {
    nombre: 'create-presentation',
    permiso: MODIFICAR,
    invocar: (repos, actor) =>
      createCreatePresentation({ presentations: repos.presentations })(PRESENTACION_VALIDA, actor),
    invocarConEntradaInvalida: (repos, actor) =>
      createCreatePresentation({ presentations: repos.presentations })(ENTRADA_INVALIDA, actor),
  },
  {
    nombre: 'update-presentation',
    permiso: MODIFICAR,
    invocar: (repos, actor) =>
      createUpdatePresentation({ presentations: repos.presentations })(
        'presentacion-1',
        PRESENTACION_VALIDA,
        actor,
      ),
    invocarConEntradaInvalida: (repos, actor) =>
      createUpdatePresentation({ presentations: repos.presentations })(
        'presentacion-1',
        ENTRADA_INVALIDA,
        actor,
      ),
  },
  {
    nombre: 'delete-presentation',
    permiso: MODIFICAR,
    invocar: (repos, actor) =>
      createDeletePresentation({ presentations: repos.presentations })('presentacion-1', actor),
    invocarConEntradaInvalida: null,
  },
  {
    nombre: 'get-product',
    permiso: CONSULTAR,
    invocar: (repos, actor) => createGetProduct({ products: repos.products })('producto-1', actor),
    invocarConEntradaInvalida: null,
  },
  {
    nombre: 'list-products',
    permiso: CONSULTAR,
    invocar: (repos, actor) =>
      createListProducts({ products: repos.products, log: repos.log })({}, actor),
    invocarConEntradaInvalida: (repos, actor) =>
      createListProducts({ products: repos.products, log: repos.log })(ENTRADA_INVALIDA, actor),
  },
  {
    nombre: 'list-presentations',
    permiso: CONSULTAR,
    invocar: (repos, actor) =>
      createListPresentations({ presentations: repos.presentations, log: repos.log })({}, actor),
    invocarConEntradaInvalida: (repos, actor) =>
      createListPresentations({ presentations: repos.presentations, log: repos.log })(
        ENTRADA_INVALIDA,
        actor,
      ),
  },
  {
    nombre: 'adjust-batch-stock',
    permiso: MODIFICAR,
    invocar: (repos, actor) =>
      createAdjustBatchStock({ products: repos.products })(AJUSTE_VALIDO, actor),
    invocarConEntradaInvalida: (repos, actor) =>
      createAdjustBatchStock({ products: repos.products })(ENTRADA_INVALIDA, actor),
  },
  {
    nombre: 'list-product-batches',
    permiso: CONSULTAR,
    invocar: (repos, actor) =>
      createListProductBatches({ products: repos.products })('producto-1', actor),
    invocarConEntradaInvalida: null,
  },
  {
    nombre: 'list-batch-movements',
    permiso: CONSULTAR,
    invocar: (repos, actor) =>
      createListBatchMovements({ products: repos.products, people: repos.people })('lote-1', actor),
    invocarConEntradaInvalida: null,
  },
];

const CASOS_DE_LECTURA = CASOS_DE_USO.filter((caso) => caso.permiso === CONSULTAR);
const CASOS_DE_ESCRITURA = CASOS_DE_USO.filter((caso) => caso.permiso === MODIFICAR);

/** Rechazo + ningun efecto, en una sola afirmacion reutilizable (R12, R14, R15). */
async function esperarRechazoSinEfectos(
  invocar: Invocacion,
  actor: Actor | null | undefined,
  mensaje: string,
): Promise<void> {
  const repos = montarReposQueFallan();

  await expect(invocar(repos, actor), mensaje).rejects.toBeInstanceOf(UnauthorizedError);
  // R15: el error de autorizacion es el del PROPIO modulo y subclase de su error raiz, que
  // es lo que hace que los adaptadores driving lo sigan serializando con su comprobacion
  // `error instanceof InventarioError` y con el mismo codigo estable.
  await expect(invocar(montarReposQueFallan(), actor), mensaje).rejects.toBeInstanceOf(
    InventarioError,
  );
  afirmarQueNingunMetodoFueLlamado(repos);
}

/** Concesion: no basta con «no lanzo UnauthorizedError», tiene que no lanzar NADA (R17). */
async function esperarConcesion(
  invocar: Invocacion,
  actor: Actor,
  mensaje: string,
): Promise<void> {
  const repos = montarReposPermisivos();
  let capturado: unknown = null;

  try {
    await invocar(repos, actor);
  } catch (error) {
    capturado = error;
  }

  expect(capturado, mensaje).toBeNull();
}

/**
 * Anclas contra el verde por vacuidad. Si la tabla se quedara corta -o el fixture dejara de
 * ser entrada valida-, todo lo de abajo seguiria en verde midiendo otra cosa.
 */
describe('QC-74 R16 — la tabla que se barre es la tabla del requisito', () => {
  it('cubre los doce casos de uso: siete de modificacion y cinco de consulta', () => {
    expect(CASOS_DE_USO).toHaveLength(12);
    expect(CASOS_DE_ESCRITURA.map((caso) => caso.nombre)).toEqual([
      'create-product',
      'update-product',
      'delete-product',
      'create-presentation',
      'update-presentation',
      'delete-presentation',
      'adjust-batch-stock',
    ]);
    expect(CASOS_DE_LECTURA.map((caso) => caso.nombre)).toEqual([
      'get-product',
      'list-products',
      'list-presentations',
      'list-product-batches',
      'list-batch-movements',
    ]);
  });

  it('los dos codigos exigidos existen en el catalogo real de identity', () => {
    // Derivado del catalogo, no de una copia a mano: si `PERMISSIONS` dejara de declarar
    // uno de los dos, esto es rojo aqui y no una FK rota en el despliegue.
    const codigos = PERMISSIONS.map((permiso) => permiso.code);
    expect(codigos).toContain(CONSULTAR);
    expect(codigos).toContain(MODIFICAR);
  });

  it('PRODUCTO_VALIDO pasa createProductSchema y ENTRADA_INVALIDA no', () => {
    // QC-52 R25: si el fixture dejara de ser entrada valida -y con `strictObject` basta un
    // campo de mas-, los rechazos de abajo seguirian rojos por `ValidationError` y este
    // archivo dejaria de medir el permiso. El segundo `expect` ancla lo simetrico: la
    // entrada invalida tiene que ser invalida de verdad para que R12 signifique algo.
    expect(createProductSchema.safeParse(PRODUCTO_VALIDO).success).toBe(true);
    expect(createProductSchema.safeParse(ENTRADA_INVALIDA).success).toBe(false);
    // QC-90: el fixture del ALTA se ancla contra SU esquema, que es otro. Si dejara de ser
    // entrada valida, la mitad de la concesion se pondria verde por el motivo equivocado.
    expect(createProductWithFirstBatchSchema.safeParse(PRODUCTO_VALIDO_CON_LOTE).success).toBe(
      true,
    );
    expect(createProductWithFirstBatchSchema.safeParse(ENTRADA_INVALIDA).success).toBe(false);
  });
});

describe('QC-74 R17 — concesion con el permiso exigido', () => {
  it('cada caso de uso concede al actor cuyo conjunto contiene su codigo exacto', async () => {
    for (const caso of CASOS_DE_USO) {
      await esperarConcesion(
        caso.invocar,
        actorCon(caso.permiso),
        `${caso.nombre} deberia conceder a un actor con ${caso.permiso}`,
      );
    }
  });

  it('concede sea cual sea el nombre del rol: solo cuenta el conjunto de permisos', async () => {
    // El nombre del rol ya no existe en el `Actor` (R18). Lo unico que decide es la
    // pertenencia del codigo al conjunto, aunque vengan los diez del catalogo.
    const todos = PERMISSIONS.map((permiso) => permiso.code);

    for (const caso of CASOS_DE_USO) {
      await esperarConcesion(
        caso.invocar,
        { id: 'actor-con-el-catalogo-entero', companyId: EMPRESA_DEL_ACTOR, permissions: todos },
        `${caso.nombre} deberia conceder a un actor con el catalogo completo`,
      );
    }
  });
});

describe('QC-74 R12/R15 — rechazo sin el permiso exigido, sin efectos y con el error del modulo', () => {
  it('cada caso de uso rechaza con UnauthorizedError, que es un InventarioError, sin tocar ningun puerto', async () => {
    for (const caso of CASOS_DE_USO) {
      await esperarRechazoSinEfectos(
        caso.invocar,
        actorCon(),
        `${caso.nombre} deberia rechazar a un actor sin ${caso.permiso}`,
      );
    }
  });

  it('rechaza por permiso ANTES de validar la entrada, incluso con entrada invalida', async () => {
    // R12 en su forma exacta: la comprobacion va antes de zod. Si el orden se invirtiera,
    // aqui saldria `ValidationError` -y un actor sin permiso habria averiguado algo del
    // sistema que no tenia derecho a preguntar-.
    const conEntrada = CASOS_DE_USO.filter((caso) => caso.invocarConEntradaInvalida !== null);
    expect(conEntrada).toHaveLength(7);

    for (const caso of conEntrada) {
      const invocar = caso.invocarConEntradaInvalida;
      if (invocar === null) throw new Error('inalcanzable: ya filtrado');

      await esperarRechazoSinEfectos(
        invocar,
        actorCon(),
        `${caso.nombre} con entrada invalida deberia rechazar por permiso, no por validacion`,
      );
    }
  });
});

describe('QC-74 R13 — pertenencia exacta, sin jerarquia ni implicacion entre permisos', () => {
  it('un actor con solo inventario.consultar es rechazado en los siete casos de escritura', async () => {
    expect(CASOS_DE_ESCRITURA).toHaveLength(7);

    for (const caso of CASOS_DE_ESCRITURA) {
      await esperarRechazoSinEfectos(
        caso.invocar,
        actorCon(CONSULTAR),
        `${caso.nombre} no debe concederse por tener ${CONSULTAR}`,
      );
    }
  });

  it('un actor con solo inventario.modificar es rechazado en los cinco casos de lectura', async () => {
    expect(CASOS_DE_LECTURA).toHaveLength(5);

    for (const caso of CASOS_DE_LECTURA) {
      await esperarRechazoSinEfectos(
        caso.invocar,
        actorCon(MODIFICAR),
        `${caso.nombre} no debe concederse por tener ${MODIFICAR}`,
      );
    }
  });

  it('no hay coincidencia parcial, comodin ni normalizacion del codigo', async () => {
    // `inventario.consultarlo` contiene al codigo como prefijo y `INVENTARIO.CONSULTAR`
    // solo se diferencia en las mayusculas: un `startsWith`, un `trim` o un `toLowerCase`
    // dentro de la regla dejaria pasar a alguno de estos cinco.
    const casiPermisos = [
      'inventario.consultarlo',
      'INVENTARIO.CONSULTAR',
      ' inventario.consultar',
      'inventario',
      '*',
    ];
    const consultar = CASOS_DE_LECTURA[0];
    if (consultar === undefined) throw new Error('la tabla se quedo sin casos de lectura');

    for (const casi of casiPermisos) {
      await esperarRechazoSinEfectos(
        consultar.invocar,
        { id: 'actor-casi', companyId: EMPRESA_DEL_ACTOR, permissions: [casi] },
        `"${casi}" no deberia conceder ${CONSULTAR}`,
      );
    }
  });
});

describe('QC-74 R14 — falla cerrado', () => {
  const actoresInvalidos: ReadonlyArray<{
    readonly etiqueta: string;
    readonly actor: Actor | null | undefined;
  }> = [
    { etiqueta: 'actor undefined', actor: undefined },
    { etiqueta: 'actor null', actor: null },
    {
      etiqueta: 'conjunto de permisos vacio',
      actor: { id: 'sin-permisos-1', companyId: EMPRESA_DEL_ACTOR, permissions: [] },
    },
    // Un actor que llega sin el campo -una sesion vieja, un doble mal montado-: la regla
    // tiene que rechazarlo igual, no explotar con un TypeError que nadie traduce.
    {
      etiqueta: 'sin campo permissions',
      actor: { id: 'sin-campo-1', companyId: EMPRESA_DEL_ACTOR } as unknown as Actor,
    },
  ];

  it('un actor ausente, sin conjunto de permisos o con el conjunto vacio es rechazado en los doce', async () => {
    for (const { etiqueta, actor } of actoresInvalidos) {
      for (const caso of CASOS_DE_USO) {
        await esperarRechazoSinEfectos(
          caso.invocar,
          actor,
          `${caso.nombre} deberia rechazar con ${etiqueta}`,
        );
      }
    }
  });
});

describe('R1 / QC-74 R18 — el actor entra por parametro y no trae nombre de rol', () => {
  it('el resultado depende UNICAMENTE del actor que se pasa por parametro', async () => {
    // El doble aqui es PERMISIVO a proposito: lo que se prueba en esta mitad no es "no
    // llega al repositorio" (eso ya lo cierran los bloques de arriba), sino que el mismo
    // caso de uso con el mismo doble da resultados distintos cambiando solo `actor`.
    const repos = montarReposPermisivos();
    const createProduct = createCreateProduct({ products: repos.products });

    await expect(createProduct(PRODUCTO_VALIDO_CON_LOTE, actorCon(MODIFICAR))).resolves.toEqual({
      id: 'producto-1',
      lot: '1',
    });
    await expect(
      createProduct(PRODUCTO_VALIDO_CON_LOTE, actorCon(CONSULTAR)),
    ).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('ningun archivo de domain/ lee sesion, cookie, cabecera ni nombre de rol', () => {
    const directorioDominio = path.join(process.cwd(), 'lib', 'modules', 'inventario', 'domain');
    const archivos = readdirSync(directorioDominio).filter((archivo) => archivo.endsWith('.ts'));

    // Un barrido sobre cero archivos pasa siempre y no vigila nada: si esto llega a 0, el
    // test de abajo es un placebo y hay que fallar aqui mismo, antes de leer nada.
    expect(archivos.length).toBeGreaterThan(0);

    const patronesProhibidos = [
      'next/headers',
      'cookies(',
      'headers(',
      'getSessionUser',
      'lib/composition',
      // QC-74 R18: el nombre del rol no entra en este modulo, ni como campo del actor ni
      // como comparacion. La guardia de `tests/guards/` lo vigila para los cinco modulos;
      // esto lo ancla tambien aqui, junto al resto del contrato del actor.
      'roleName',
      'ROLE_ADMINISTRADOR',
      'ROLE_OPERADOR',
      'assertAdminRole',
      'requireAdmin',
    ];

    for (const archivo of archivos) {
      const contenidoCrudo = readFileSync(path.join(directorioDominio, archivo), 'utf-8');
      // Se quitan los comentarios de bloque y de linea antes de comparar: este mismo
      // modulo documenta la regla en prosa ("no se lee `next/headers`..."), y esa PROSA
      // no debe hacer fallar al barrido -lo que vigila el test es CODIGO, no comentarios.
      const contenido = contenidoCrudo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      for (const patron of patronesProhibidos) {
        expect(
          contenido.includes(patron),
          `${archivo} no deberia contener "${patron}" fuera de un comentario (R1, QC-74 R18)`,
        ).toBe(false);
      }
    }
  });
});

// AMPLIACION 2026-09-11 (QC-49, R24) — EL PERMISO SE EXIGE ANTES QUE EL AMBITO.
//
// QC-49 mete la empresa DENTRO del `Actor` y con ella nace un orden que se puede equivocar: si
// un caso de uso mirase primero la empresa -o si el rechazo por «es de otra empresa» adelantara
// al de permiso-, un actor SIN PERMISO recibiria `product_not_found`/`presentation_not_found` en
// vez del error de autorizacion, y eso ya seria haber contestado una pregunta que no tenia
// derecho a hacer. El requisito lo fija al reves: permiso PRIMERO, en la primera linea, antes de
// zod y antes de tocar el repositorio; la empresa FILTRA y no AUTORIZA.
//
// Se reusa la tabla de los doce y `esperarRechazoSinEfectos`, que ya afirma que ningun metodo
// del puerto se llamo: es justo lo que hace visible que el ambito NUNCA llego a la consulta.
describe('QC-49 R24 — el permiso va antes que el ambito de empresa', () => {
  /** Sin permiso Y de otra empresa: los dos motivos de rechazo a la vez, para ver cual gana. */
  const SIN_PERMISO_Y_DE_OTRA_EMPRESA: Actor = {
    id: 'actor-ajeno-sin-permiso',
    companyId: OTRA_EMPRESA,
    permissions: [],
  };

  it('un actor sin permiso y de otra empresa se rechaza por autorizacion, sin tocar el puerto', async () => {
    for (const caso of CASOS_DE_USO) {
      await esperarRechazoSinEfectos(
        caso.invocar,
        SIN_PERMISO_Y_DE_OTRA_EMPRESA,
        `${caso.nombre} deberia rechazar por permiso aunque el actor sea de otra empresa`,
      );
    }
  });

  it('el error NO es el de «no existe»: la empresa ajena no adelanta a la comprobacion de permiso', async () => {
    // Falsable: si alguien invirtiera el orden -ambito primero, permiso despues-, los casos
    // que consultan por identificador devolverian `ProductNotFoundError` /
    // `PresentationNotFoundError` y estas dos afirmaciones caerian.
    for (const caso of CASOS_DE_USO) {
      const repos = montarReposQueFallan();
      const promesa = caso.invocar(repos, SIN_PERMISO_Y_DE_OTRA_EMPRESA);

      await expect(promesa, `${caso.nombre} no debe filtrar existencia`).rejects.not.toBeInstanceOf(
        ProductNotFoundError,
      );
      await expect(
        caso.invocar(montarReposQueFallan(), SIN_PERMISO_Y_DE_OTRA_EMPRESA),
        `${caso.nombre} no debe filtrar existencia`,
      ).rejects.not.toBeInstanceOf(PresentationNotFoundError);
    }
  });

  it('con el permiso exigido, la empresa del actor NO cambia el desenlace: filtra, no autoriza', async () => {
    // La otra mitad de R24, y lo que impide leer el bloque de arriba como «la empresa ajena
    // rechaza»: con el codigo exacto en el conjunto, el caso de uso concede IGUAL sea cual sea
    // la empresa. Lo que la empresa hace es entrar en la consulta, no decidir el permiso.
    for (const caso of CASOS_DE_USO) {
      await esperarConcesion(
        caso.invocar,
        { id: 'actor-de-otra-empresa', companyId: OTRA_EMPRESA, permissions: [caso.permiso] },
        `${caso.nombre} deberia conceder a un actor con ${caso.permiso} de cualquier empresa`,
      );
    }
  });
});
