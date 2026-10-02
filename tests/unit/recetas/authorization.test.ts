// QC-74 T10 — Test de autorizacion POR PERMISO de los CINCO casos de uso de `recetas`
// (`requirements.md` R12-R18, R24; `design.md > 5`; `tasks.md > T10`).
//
// Sustituye al centinela por ROL de QC-54: ya no existe nombre de rol en el `Actor` (R18), asi
// que la pregunta pasa de «es Administrador» a «su conjunto contiene el codigo exigido». Es la
// unica red que existe para R16: un service test de un solo caso de uso puede seguir verde
// aunque el codigo exigido en otro archivo sea el equivocado, asi que aqui se barren los cinco,
// uno por uno, con dobles de los TRES puertos -repositorio, catalogo de productos y
// almacenamiento- que FALLAN si se les llama.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createDeleteRecipe } from '@/lib/modules/recetas/domain/delete-recipe';
import { RecetasError, UnauthorizedError } from '@/lib/modules/recetas/domain/errors';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { createListRecipes } from '@/lib/modules/recetas/domain/list-recipes';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import { PERMISSIONS } from '@/lib/modules/identity';
import type { ProductCatalog } from '@/lib/modules/inventario';

/** Los dos codigos que este modulo puede exigir (R16). */
const CONSULTAR = 'recetas.consultar';
const MODIFICAR = 'recetas.modificar';

/** Un actor con exactamente los permisos que se le pasen, y ninguno mas. */
function actorCon(...permisos: readonly string[]): Actor {
  return { id: 'actor-1', companyId: 'empresa-1', permissions: permisos };
}

const AHORA = new Date('2026-09-07T10:00:00.000Z');

const PRODUCTO_ID = '11111111-1111-4111-8111-111111111111';

// Una entrada valida ya no puede ir sin lineas -0 lineas suman 0,00 %-, asi que la que usan
// los casos "concede" trae una linea al 100 %.
const RECETA_VALIDA = {
  name: 'Desengrasante 5%',
  description: null,
  steps: [],
  lines: [{ productId: PRODUCTO_ID, percentage: '100.00' }],
};

/**
 * Entrada que zod RECHAZARIA (`name` en blanco). Sirve para R12: si el permiso se comprobara
 * despues de validar, un actor sin permiso recibiria `ValidationError` y sabria algo del
 * sistema sin tener derecho a preguntarlo.
 */
const RECETA_INVALIDA = {
  name: '   ',
  description: null,
  steps: [],
  lines: [],
};

/**
 * Dobles de los CUATRO puertos que FALLAN si cualquiera de sus metodos es llamado: `vi.fn`
 * registra la llamada Y lanza, asi que el test puede afirmar las DOS cosas -que se rechaza con
 * `UnauthorizedError` y que ningun puerto se toco (R12, R14)-. Un doble permisivo dejaria pasar
 * una autorizacion puesta despues de la consulta.
 */
function repositorioQueFalla(): RecipeRepository {
  const explota = () => {
    throw new Error('el repositorio no debe ser llamado');
  };
  return {
    create: vi.fn<RecipeRepository['create']>(explota),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(explota),
    listAlive: vi.fn<RecipeRepository['listAlive']>(explota),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(explota),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(explota),
    createVersion: vi.fn<RecipeRepository['createVersion']>(explota),
    listAliveVersions: vi.fn<RecipeRepository['listAliveVersions']>(explota),
    replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(explota),
  };
}

function catalogoQueFalla(): ProductCatalog {
  const explota = () => {
    throw new Error('el catalogo de productos no debe ser llamado');
  };
  return {
    findRefs: vi.fn<ProductCatalog['findRefs']>(explota),
    findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(explota),
    findFinishedGoodsReceipts: vi.fn<ProductCatalog['findFinishedGoodsReceipts']>(explota),
  };
}

function almacenamientoQueFalla(): RecipeImageStorage {
  const explota = () => {
    throw new Error('el almacenamiento de imagenes no debe ser llamado');
  };
  return {
    upload: vi.fn<RecipeImageStorage['upload']>(explota),
    remove: vi.fn<RecipeImageStorage['remove']>(explota),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>(explota),
  };
}

type Puertos = {
  readonly recipes: RecipeRepository;
  readonly products: ProductCatalog;
  readonly images: RecipeImageStorage;
};

function montarPuertosQueFallan(): Puertos {
  return {
    recipes: repositorioQueFalla(),
    products: catalogoQueFalla(),
    images: almacenamientoQueFalla(),
  };
}

const FILA_RECETA: RecipeRow = {
  id: 'receta-1',
  name: 'Desengrasante 5%',
  description: null,
  steps: [],
  imagePath: null,
  createdBy: 'actor-1',
  updatedBy: 'actor-1',
  createdAt: AHORA,
  updatedAt: AHORA,
  lines: [],
  original: null,
};

/** Dobles PERMISIVOS, para la mitad de CONCESION: aqui el caso de uso debe llegar al puerto. */
function montarPuertosPermisivos(): Puertos {
  return {
    recipes: {
      create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'receta-1' })),
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => FILA_RECETA),
      listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
      replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
      softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
      createVersion: vi.fn<RecipeRepository['createVersion']>(async () => 'not_found'),
      listAliveVersions: vi.fn<RecipeRepository['listAliveVersions']>(async () => []),
      replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(async () => 'not_found'),
    },
    products: {
      // Resuelve el producto de `RECETA_VALIDA`: sin esto, `createRecipe`/`updateRecipe`
      // rechazarian por producto inexistente antes de llegar al repositorio.
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [
        { id: PRODUCTO_ID, name: 'Acido sulfurico', unitId: null, stockByUnit: [], type: 'PRODUCT' },
      ]),
      findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
        throw new Error('recetas no debe costear nada');
      }),
      findFinishedGoodsReceipts: vi.fn<ProductCatalog['findFinishedGoodsReceipts']>(() => {
        throw new Error('recetas no debe leer envases de empaque');
      }),
    },
    images: {
      upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/x.jpg'),
      remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
      publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((ruta) => `https://bucket.example/${ruta}`),
    },
  };
}

function afirmarQueNingunPuertoFueLlamado(puertos: Puertos): void {
  expect(puertos.recipes.create).not.toHaveBeenCalled();
  expect(puertos.recipes.findAliveById).not.toHaveBeenCalled();
  expect(puertos.recipes.listAlive).not.toHaveBeenCalled();
  expect(puertos.recipes.replaceAlive).not.toHaveBeenCalled();
  expect(puertos.recipes.softDeleteAlive).not.toHaveBeenCalled();
  expect(puertos.products.findRefs).not.toHaveBeenCalled();
  expect(puertos.images.upload).not.toHaveBeenCalled();
  expect(puertos.images.remove).not.toHaveBeenCalled();
  expect(puertos.images.publicUrl).not.toHaveBeenCalled();
}

/**
 * La fila R16 de este modulo: cinco casos de uso, dos codigos. Construirla como tabla,
 * recorrida en bucle, es lo que hace que anadir un caso de uso manana sea trivial y olvidarlo
 * en el test sea visible.
 */
const CASOS_DE_USO: ReadonlyArray<{
  readonly nombre: string;
  readonly permiso: string;
  readonly invocar: (
    puertos: Puertos,
    actor: Actor | null | undefined,
    entrada?: unknown,
  ) => Promise<unknown>;
}> = [
  {
    nombre: 'getRecipe',
    permiso: CONSULTAR,
    invocar: (puertos, actor) =>
      createGetRecipe({
        recipes: puertos.recipes,
        products: puertos.products,
        images: puertos.images,
      })('receta-1', actor),
  },
  {
    nombre: 'listRecipes',
    permiso: CONSULTAR,
    invocar: (puertos, actor, entrada) =>
      createListRecipes({
        recipes: puertos.recipes,
        images: puertos.images,
        // Doble mudo: este archivo comprueba el PERMISO, no el log de campos omitidos.
        log: { ignoredFields: vi.fn() },
        toOffsetLimit: () => ({ offset: 0, limit: 10 }),
        buildPage: (items, total, page, pageSize) => ({
          items,
          total,
          page,
          pageSize,
          totalPages: 1,
        }),
      })(entrada ?? {}, actor),
  },
  {
    nombre: 'createRecipe',
    permiso: MODIFICAR,
    invocar: (puertos, actor, entrada) =>
      createCreateRecipe({
        recipes: puertos.recipes,
        products: puertos.products,
        images: puertos.images,
      })(entrada ?? RECETA_VALIDA, actor),
  },
  {
    nombre: 'updateRecipe',
    permiso: MODIFICAR,
    invocar: (puertos, actor, entrada) =>
      createUpdateRecipe({
        recipes: puertos.recipes,
        products: puertos.products,
        images: puertos.images,
      })('receta-1', entrada ?? RECETA_VALIDA, actor),
  },
  {
    nombre: 'deleteRecipe',
    permiso: MODIFICAR,
    invocar: (puertos, actor) => createDeleteRecipe({ recipes: puertos.recipes })('receta-1', actor),
  },
];

/** Entrada invalida por caso de uso, para R12. Los que no toman entrada no aparecen aqui. */
const ENTRADA_INVALIDA: Readonly<Record<string, unknown>> = {
  listRecipes: { page: -7, pageSize: 'muchas' },
  createRecipe: RECETA_INVALIDA,
  updateRecipe: RECETA_INVALIDA,
};

describe('QC-74 R16/R17 — cada caso de uso exige exactamente el codigo de la tabla', () => {
  it('los dos codigos de este modulo existen en el catalogo real de `identity`', () => {
    const codigos = PERMISSIONS.map((permiso) => permiso.code);
    expect(codigos).toContain(CONSULTAR);
    expect(codigos).toContain(MODIFICAR);
  });

  it('R16 — la tabla cubre los cinco casos de uso de `recetas`, cada uno con su codigo', () => {
    expect(CASOS_DE_USO).toHaveLength(5);
    expect(CASOS_DE_USO.map((caso) => `${caso.nombre}:${caso.permiso}`)).toEqual([
      'getRecipe:recetas.consultar',
      'listRecipes:recetas.consultar',
      'createRecipe:recetas.modificar',
      'updateRecipe:recetas.modificar',
      'deleteRecipe:recetas.modificar',
    ]);
  });

  it('R17 — con el codigo exacto en su conjunto, el caso de uso CONCEDE', async () => {
    for (const caso of CASOS_DE_USO) {
      const puertos = montarPuertosPermisivos();

      await expect(
        caso.invocar(puertos, actorCon(caso.permiso)),
        `${caso.nombre} deberia conceder con ${caso.permiso}`,
      ).resolves.not.toThrow();
    }
  });

  it('R17 — concede sea cual sea el resto del conjunto: el rol ya no interviene (R18)', async () => {
    for (const caso of CASOS_DE_USO) {
      const puertos = montarPuertosPermisivos();

      await expect(
        caso.invocar(puertos, actorCon('inventario.consultar', caso.permiso, 'pedidos.modificar')),
        `${caso.nombre} deberia conceder con ${caso.permiso} entre otros`,
      ).resolves.not.toThrow();
    }
  });

  it('R16 — sin el codigo exigido se rechaza, aunque tenga los de otros modulos', async () => {
    for (const caso of CASOS_DE_USO) {
      const puertos = montarPuertosQueFallan();

      await expect(
        caso.invocar(
          puertos,
          actorCon('inventario.consultar', 'inventario.modificar', 'pedidos.modificar'),
        ),
        `${caso.nombre} deberia rechazar sin ${caso.permiso}`,
      ).rejects.toBeInstanceOf(UnauthorizedError);
      afirmarQueNingunPuertoFueLlamado(puertos);
    }
  });
});

describe('QC-74 R13 — pertenencia exacta, sin implicacion entre permisos', () => {
  it('R13 — solo `recetas.consultar` NO abre ninguna de las tres escrituras', async () => {
    const escrituras = CASOS_DE_USO.filter((caso) => caso.permiso === MODIFICAR);
    expect(escrituras).toHaveLength(3);

    for (const caso of escrituras) {
      const puertos = montarPuertosQueFallan();

      await expect(
        caso.invocar(puertos, actorCon(CONSULTAR)),
        `${caso.nombre} no deberia abrirse con ${CONSULTAR}`,
      ).rejects.toBeInstanceOf(UnauthorizedError);
      afirmarQueNingunPuertoFueLlamado(puertos);
    }
  });

  it('R13 — solo `recetas.modificar` NO abre ninguna de las dos lecturas', async () => {
    const lecturas = CASOS_DE_USO.filter((caso) => caso.permiso === CONSULTAR);
    expect(lecturas).toHaveLength(2);

    for (const caso of lecturas) {
      const puertos = montarPuertosQueFallan();

      await expect(
        caso.invocar(puertos, actorCon(MODIFICAR)),
        `${caso.nombre} no deberia abrirse con ${MODIFICAR}`,
      ).rejects.toBeInstanceOf(UnauthorizedError);
      afirmarQueNingunPuertoFueLlamado(puertos);
    }
  });

  it('R13 — un prefijo o una variante del codigo no se cuela por coincidencia parcial', async () => {
    const impostores = [
      'recetas',
      'recetas.',
      'recetas.consultar.todo',
      'RECETAS.CONSULTAR',
      'consultar',
    ];

    for (const caso of CASOS_DE_USO) {
      for (const impostor of impostores) {
        const puertos = montarPuertosQueFallan();

        await expect(
          caso.invocar(puertos, actorCon(impostor)),
          `${caso.nombre} no deberia aceptar "${impostor}"`,
        ).rejects.toBeInstanceOf(UnauthorizedError);
        afirmarQueNingunPuertoFueLlamado(puertos);
      }
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
    { etiqueta: 'conjunto de permisos vacio', actor: actorCon() },
    // Un actor que llegue de un borde sin tipar puede no traer el campo: se rechaza igual.
    { etiqueta: 'sin campo de permisos', actor: { id: 'sin-permisos-1' } as unknown as Actor },
  ];

  it('R14 — actor ausente, sin conjunto o con el conjunto vacio se rechaza en los cinco casos, sin efectos', async () => {
    for (const { etiqueta, actor } of actoresInvalidos) {
      for (const caso of CASOS_DE_USO) {
        const puertos = montarPuertosQueFallan();

        await expect(
          caso.invocar(puertos, actor),
          `${caso.nombre} deberia rechazar con ${etiqueta}`,
        ).rejects.toBeInstanceOf(UnauthorizedError);
        afirmarQueNingunPuertoFueLlamado(puertos);
      }
    }
  });
});

describe('QC-74 R15 — el error de autorizacion es el del propio modulo', () => {
  it('R15 — el rechazo lanza el `UnauthorizedError` de `recetas`, que ES un `RecetasError`', async () => {
    for (const caso of CASOS_DE_USO) {
      const puertos = montarPuertosQueFallan();
      const error = await caso.invocar(puertos, actorCon()).catch((e: unknown) => e);

      expect(error, `${caso.nombre} deberia lanzar UnauthorizedError`).toBeInstanceOf(
        UnauthorizedError,
      );
      // Lo que hace que el adaptador driving NO cambie su bloque de traduccion de errores.
      expect(error, `${caso.nombre} deberia lanzar un RecetasError`).toBeInstanceOf(RecetasError);
      expect((error as UnauthorizedError).code).toBe('unauthorized');
    }
  });
});

describe('QC-74 R12 — el permiso se comprueba antes de zod y antes de todo puerto', () => {
  it('R12 — con entrada invalida, el rechazo es por PERMISO y no por validacion', async () => {
    for (const caso of CASOS_DE_USO) {
      const puertos = montarPuertosQueFallan();
      const entrada = ENTRADA_INVALIDA[caso.nombre];
      const error = await caso.invocar(puertos, actorCon(), entrada).catch((e: unknown) => e);

      // `ValidationError` tambien es `RecetasError`: la afirmacion util es la clase EXACTA.
      expect(
        error,
        `${caso.nombre} con entrada invalida deberia rechazar por permiso, no por validacion`,
      ).toBeInstanceOf(UnauthorizedError);
      afirmarQueNingunPuertoFueLlamado(puertos);
    }
  });

  it('R12 — ningun archivo de domain/ lee sesion, cookie ni cabecera por su cuenta', () => {
    const directorioDominio = path.join(process.cwd(), 'lib', 'modules', 'recetas', 'domain');
    const archivos = readdirSync(directorioDominio).filter((archivo) => archivo.endsWith('.ts'));

    // Un barrido sobre cero archivos pasa siempre y no vigila nada.
    expect(archivos.length).toBeGreaterThan(0);

    const patronesProhibidos = [
      'next/headers',
      'cookies(',
      'headers(',
      'getSessionUser',
      'lib/composition',
    ];

    for (const archivo of archivos) {
      const contenidoCrudo = readFileSync(path.join(directorioDominio, archivo), 'utf-8');
      const contenido = contenidoCrudo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      for (const patron of patronesProhibidos) {
        expect(
          contenido.includes(patron),
          `${archivo} no deberia contener "${patron}" fuera de un comentario (el actor entra por parametro)`,
        ).toBe(false);
      }
    }
  });
});

describe('QC-74 R18 — el `Actor` de `recetas` no tiene nombre de rol', () => {
  it('R18 — ni el tipo ni el adaptador driving nombran el rol del actor', () => {
    const raiz = path.join(process.cwd(), 'lib', 'modules', 'recetas');
    const rutaAcciones = path.join(raiz, 'adapters', 'driving', 'recipe-actions.ts');
    const archivos = [path.join(raiz, 'domain', 'actor.ts'), rutaAcciones];

    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      for (const patron of ['roleName', 'ROLE_ADMINISTRADOR', 'assertAdminRole', 'requireAdmin']) {
        expect(
          contenido.includes(patron),
          `${path.basename(archivo)} no deberia contener "${patron}" (R18)`,
        ).toBe(false);
      }
    }

    // Y en positivo: el actor se arma con el conjunto de permisos de la sesion.
    expect(readFileSync(rutaAcciones, 'utf-8')).toMatch(/permissions:\s*sessionUser\.permissions/);
  });
});
