// T8 -- El test de autorizacion de los NUEVE casos de uso (design.md > 12, cuarto aviso;
// tasks.md > T8; requirements.md R1, R2, R3). Es la unica red que existe para R2/R3: un
// service test de un solo caso de uso puede seguir verde aunque `requireAdmin` desaparezca
// de otro archivo (ya paso una vez en esta feature con `create-product.ts`), asi que aqui
// se barren los nueve, uno por uno, con un doble que FALLA si lo llaman.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ADMIN_ROLE_NAME, type Actor } from '@/lib/modules/inventario/domain/actor';
import { createCreatePresentation } from '@/lib/modules/inventario/domain/create-presentation';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { createDeletePresentation } from '@/lib/modules/inventario/domain/delete-presentation';
import { createDeleteProduct } from '@/lib/modules/inventario/domain/delete-product';
import { UnauthorizedError } from '@/lib/modules/inventario/domain/errors';
import { createGetProduct } from '@/lib/modules/inventario/domain/get-product';
import { createListPresentations } from '@/lib/modules/inventario/domain/list-presentations';
import { createListProducts } from '@/lib/modules/inventario/domain/list-products';
import { createProductSchema } from '@/lib/modules/inventario/domain/product-input';
import { createUpdatePresentation } from '@/lib/modules/inventario/domain/update-presentation';
import { createUpdateProduct } from '@/lib/modules/inventario/domain/update-product';
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

const ADMIN: Actor = { id: 'admin-1', roleName: ADMIN_ROLE_NAME };
const OPERADOR: Actor = { id: 'operador-1', roleName: 'Operador' };

/** Entrada valida minima. `stock` y `qtyAlert` estan aqui desde que la decision del humano
 *  del 2026-09-03 los volvio obligatorios en `createProductSchema`; `minPurchase` se fue
 *  con QC-52 (R1), y dejarlo habria convertido este fixture en entrada INVALIDA. */
const PRODUCTO_VALIDO = {
  name: 'Acido sulfurico',
  presentationId: '11111111-1111-4111-8111-111111111111',
  stock: 0,
  qtyAlert: 0,
};

const PRESENTACION_VALIDA = { name: 'Bidon 20 L' };

/**
 * Doble del puerto de producto que FALLA si cualquiera de sus metodos es llamado
 * (design.md > 12, cuarto aviso): "un doble que registre la llamada y un
 * `expect(...).not.toHaveBeenCalled()`; si el doble es permisivo, el test pasaria con la
 * autorizacion puesta despues de la consulta". `vi.fn` registra la llamada Y lanza, asi
 * que este test puede afirmar las DOS cosas: que se rechaza con `UnauthorizedError` y que
 * ningun metodo del puerto se toco.
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
  };
}

/** Mismo criterio que arriba, para el puerto de presentacion. */
function repositorioPresentacionQueFalla(): PresentationRepository {
  const explota = () => {
    throw new Error('el repositorio no debe ser llamado');
  };
  return {
    create: vi.fn<PresentationRepository['create']>(explota),
    rename: vi.fn<PresentationRepository['rename']>(explota),
    deleteById: vi.fn<PresentationRepository['deleteById']>(explota),
    list: vi.fn<PresentationRepository['list']>(explota),
  };
}

type Repos = { readonly products: ProductRepository; readonly presentations: PresentationRepository };

function montarRepos(): Repos {
  return {
    products: repositorioProductoQueFalla(),
    presentations: repositorioPresentacionQueFalla(),
  };
}

function todosLosMetodos(repos: Repos): ReadonlyArray<() => void> {
  return [
    () => expect(repos.products.create).not.toHaveBeenCalled(),
    () => expect(repos.products.findAliveById).not.toHaveBeenCalled(),
    () => expect(repos.products.updateAlive).not.toHaveBeenCalled(),
    () => expect(repos.products.softDeleteAlive).not.toHaveBeenCalled(),
    () => expect(repos.products.listAlive).not.toHaveBeenCalled(),
    () => expect(repos.presentations.create).not.toHaveBeenCalled(),
    () => expect(repos.presentations.rename).not.toHaveBeenCalled(),
    () => expect(repos.presentations.deleteById).not.toHaveBeenCalled(),
    () => expect(repos.presentations.list).not.toHaveBeenCalled(),
  ];
}

function afirmarQueNingunMetodoFueLlamado(repos: Repos): void {
  for (const afirmar of todosLosMetodos(repos)) afirmar();
}

/**
 * Tabla de los NUEVE casos de uso (design.md > 3): construirla como tabla, recorrida en
 * bucle, es lo que el prompt pide para que anadir un caso de uso manana sea trivial y
 * olvidarlo en el test sea visible -en vez de nueve bloques copiados a mano. `invocar`
 * recibe el repositorio como parametro (no capturado por closure), asi cada iteracion del
 * bucle puede montar un repositorio NUEVO por caso y el aislamiento es real.
 */
const CASOS_DE_USO: ReadonlyArray<{
  readonly nombre: string;
  readonly invocar: (repos: Repos, actor: Actor | null | undefined) => Promise<unknown>;
}> = [
  {
    nombre: 'create-product',
    invocar: (repos, actor) =>
      createCreateProduct({ products: repos.products })(PRODUCTO_VALIDO, actor),
  },
  {
    nombre: 'get-product',
    invocar: (repos, actor) => createGetProduct({ products: repos.products })('producto-1', actor),
  },
  {
    nombre: 'list-products',
    invocar: (repos, actor) => createListProducts({ products: repos.products })({}, actor),
  },
  {
    nombre: 'update-product',
    invocar: (repos, actor) =>
      createUpdateProduct({ products: repos.products })('producto-1', PRODUCTO_VALIDO, actor),
  },
  {
    nombre: 'delete-product',
    invocar: (repos, actor) => createDeleteProduct({ products: repos.products })('producto-1', actor),
  },
  {
    nombre: 'create-presentation',
    invocar: (repos, actor) =>
      createCreatePresentation({ presentations: repos.presentations })(PRESENTACION_VALIDA, actor),
  },
  {
    nombre: 'update-presentation',
    invocar: (repos, actor) =>
      createUpdatePresentation({ presentations: repos.presentations })(
        'presentacion-1',
        PRESENTACION_VALIDA,
        actor,
      ),
  },
  {
    nombre: 'delete-presentation',
    invocar: (repos, actor) =>
      createDeletePresentation({ presentations: repos.presentations })('presentacion-1', actor),
  },
  {
    nombre: 'list-presentations',
    invocar: (repos, actor) => createListPresentations({ presentations: repos.presentations })({}, actor),
  },
];

/**
 * QC-52 (R25): el fixture tiene que ser entrada VALIDA. Si dejara de serlo -y con el
 * `strictObject` de R1 basta un campo de mas para que lo sea-, los casos de abajo
 * seguirian rojos... por `ValidationError`, no por `UnauthorizedError`, y el test dejaria
 * de medir que el permiso se comprueba ANTES de zod y ANTES de tocar el puerto. Este
 * ancla lo hace imposible de pasar por alto.
 */
describe('QC-52 R25 — el fixture con el que se mide el permiso es entrada valida', () => {
  it('PRODUCTO_VALIDO pasa createProductSchema, asi que el rechazo solo puede venir del permiso', () => {
    expect(createProductSchema.safeParse(PRODUCTO_VALIDO).success).toBe(true);
  });

  it('las cinco operaciones del producto estan en la tabla que se barre', () => {
    // R25 nombra las cinco por su nombre: crear, listar, consultar ficha, editar y dar de
    // baja. Si alguna se cayera de `CASOS_DE_USO`, el bucle seguiria verde con cuatro.
    const nombres = CASOS_DE_USO.map((caso) => caso.nombre);
    expect(nombres).toEqual(
      expect.arrayContaining([
        'create-product',
        'list-products',
        'get-product',
        'update-product',
        'delete-product',
      ]),
    );
  });
});

describe('R2 — rechazo de Operador', () => {
  it('un actor con rol Operador es rechazado en los nueve casos de uso sin llamar al repositorio', async () => {
    // Verificacion de que la tabla cubre las nueve factories reales -si un caso de uso
    // nuevo se anade a domain/ y no se agrega aqui, este numero deja de coincidir.
    expect(CASOS_DE_USO).toHaveLength(9);

    // Repositorio NUEVO por caso: un fallo en cualquiera de los nueve queda aislado.
    for (const caso of CASOS_DE_USO) {
      const repos = montarRepos();

      await expect(
        caso.invocar(repos, OPERADOR),
        `${caso.nombre} deberia rechazar al Operador`,
      ).rejects.toBeInstanceOf(UnauthorizedError);
      afirmarQueNingunMetodoFueLlamado(repos);
    }
  });
});

describe('R3 — rechazo de actores invalidos', () => {
  const actoresInvalidos: ReadonlyArray<{ readonly etiqueta: string; readonly actor: Actor | null | undefined }> = [
    { etiqueta: 'actor undefined', actor: undefined },
    { etiqueta: 'actor null', actor: null },
    { etiqueta: 'roleName null', actor: { id: 'sin-rol-1', roleName: null } },
    { etiqueta: 'roleName vacio', actor: { id: 'sin-rol-2', roleName: '' } },
    {
      etiqueta: 'rol desconocido, no colado por un includes parcial',
      actor: { id: 'externo-1', roleName: 'Administradores externos' },
    },
  ];

  it('un actor ausente, con rol nulo o con rol desconocido es rechazado igual que el Operador', async () => {
    for (const { etiqueta, actor } of actoresInvalidos) {
      for (const caso of CASOS_DE_USO) {
        const repos = montarRepos();

        await expect(
          caso.invocar(repos, actor),
          `${caso.nombre} deberia rechazar con ${etiqueta}`,
        ).rejects.toBeInstanceOf(UnauthorizedError);
        afirmarQueNingunMetodoFueLlamado(repos);
      }
    }
  });
});

describe('R1 — el actor entra por parametro', () => {
  it('cada caso de uso recibe el actor por parametro y no lee ninguna sesion', async () => {
    // El doble aqui es PERMISIVO a proposito (a diferencia de los de arriba): lo que se
    // prueba en esta mitad no es "no llega al repositorio" (eso ya lo cierra R2), sino que
    // el resultado depende UNICAMENTE del actor que se pasa por parametro -mismo caso de
    // uso, mismo doble, solo cambia el argumento `actor`.
    const products: ProductRepository = {
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
    };
    const createProduct = createCreateProduct({ products });

    await expect(createProduct(PRODUCTO_VALIDO, ADMIN)).resolves.toEqual({ id: 'producto-1' });
    await expect(createProduct(PRODUCTO_VALIDO, OPERADOR)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('ningun archivo de domain/ lee sesion, cookie ni cabecera por su cuenta', () => {
    const directorioDominio = path.join(process.cwd(), 'lib', 'modules', 'inventario', 'domain');
    const archivos = readdirSync(directorioDominio).filter((archivo) => archivo.endsWith('.ts'));

    // Un barrido sobre cero archivos pasa siempre y no vigila nada: si esto llega a 0, el
    // test de abajo es un placebo y hay que fallar aqui mismo, antes de leer nada.
    expect(archivos.length).toBeGreaterThan(0);

    const patronesProhibidos = [
      "next/headers",
      "cookies(",
      "headers(",
      "getSessionUser",
      "lib/composition",
    ];

    for (const archivo of archivos) {
      const contenidoCrudo = readFileSync(path.join(directorioDominio, archivo), 'utf-8');
      // Se quitan los comentarios de bloque y de linea antes de comparar: este mismo
      // modulo documenta la regla en prosa ("no se lee `next/headers`..."), y esa PROSA
      // no debe hacer fallar al barrido -lo que vigila el test es CODIGO, no comentarios.
      const contenido = contenidoCrudo
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      for (const patron of patronesProhibidos) {
        expect(
          contenido.includes(patron),
          `${archivo} no deberia contener "${patron}" fuera de un comentario (R1: el actor entra por parametro)`,
        ).toBe(false);
      }
    }
  });
});
