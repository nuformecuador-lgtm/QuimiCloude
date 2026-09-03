// T8 -- El test de autorizacion de los CINCO casos de uso (design.md > 4, 14, cuarto
// aviso; tasks.md > T8; requirements.md R1, R2, R3). Es la unica red que existe para
// R2/R3: un service test de un solo caso de uso puede seguir verde aunque `requireAdmin`
// desaparezca de otro archivo, asi que aqui se barren los cinco, uno por uno, con dobles
// de los CUATRO puertos -repositorio, catalogo de productos, catalogo de unidades (R50) y
// almacenamiento- que FALLAN si se les llama.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ADMIN_ROLE_NAME, type Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createDeleteRecipe } from '@/lib/modules/recetas/domain/delete-recipe';
import { UnauthorizedError } from '@/lib/modules/recetas/domain/errors';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { createListRecipes } from '@/lib/modules/recetas/domain/list-recipes';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog } from '@/lib/modules/inventario';
import type { UnitCatalog } from '@/lib/modules/unidades';

const ADMIN: Actor = { id: 'admin-1', roleName: ADMIN_ROLE_NAME };
const OPERADOR: Actor = { id: 'operador-1', roleName: 'Operador' };

const RECETA_VALIDA = {
  name: 'Desengrasante 5%',
  description: null,
  steps: [],
  lines: [],
};

/**
 * Dobles de los TRES puertos que FALLAN si cualquiera de sus metodos es llamado
 * (design.md > 14, cuarto aviso): "un doble que registre la llamada y un
 * `expect(...).not.toHaveBeenCalled()`; si el doble es permisivo, el test pasaria con la
 * autorizacion puesta despues de la consulta". `vi.fn` registra la llamada Y lanza, asi
 * que este test puede afirmar las DOS cosas: que se rechaza con `UnauthorizedError` y que
 * ningun metodo de ningun puerto se toco.
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
  };
}

function catalogoQueFalla(): ProductCatalog {
  const explota = () => {
    throw new Error('el catalogo de productos no debe ser llamado');
  };
  return {
    findRefs: vi.fn<ProductCatalog['findRefs']>(explota),
  };
}

function catalogoUnidadesQueFalla(): UnitCatalog {
  const explota = () => {
    throw new Error('el catalogo de unidades no debe ser llamado');
  };
  return {
    findRefs: vi.fn<UnitCatalog['findRefs']>(explota),
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
  readonly units: UnitCatalog;
  readonly images: RecipeImageStorage;
};

function montarPuertos(): Puertos {
  return {
    recipes: repositorioQueFalla(),
    products: catalogoQueFalla(),
    units: catalogoUnidadesQueFalla(),
    images: almacenamientoQueFalla(),
  };
}

function afirmarQueNingunPuertoFueLlamado(puertos: Puertos): void {
  expect(puertos.recipes.create).not.toHaveBeenCalled();
  expect(puertos.recipes.findAliveById).not.toHaveBeenCalled();
  expect(puertos.recipes.listAlive).not.toHaveBeenCalled();
  expect(puertos.recipes.replaceAlive).not.toHaveBeenCalled();
  expect(puertos.recipes.softDeleteAlive).not.toHaveBeenCalled();
  expect(puertos.products.findRefs).not.toHaveBeenCalled();
  expect(puertos.units.findRefs).not.toHaveBeenCalled();
  expect(puertos.images.upload).not.toHaveBeenCalled();
  expect(puertos.images.remove).not.toHaveBeenCalled();
  expect(puertos.images.publicUrl).not.toHaveBeenCalled();
}

/**
 * Tabla de los CINCO casos de uso (design.md > 3): construirla como tabla, recorrida en
 * bucle, es lo que hace que anadir un caso de uso manana sea trivial y olvidarlo en el
 * test sea visible.
 */
const CASOS_DE_USO: ReadonlyArray<{
  readonly nombre: string;
  readonly invocar: (puertos: Puertos, actor: Actor | null | undefined) => Promise<unknown>;
}> = [
  {
    nombre: 'create-recipe',
    invocar: (puertos, actor) =>
      createCreateRecipe({
        recipes: puertos.recipes,
        products: puertos.products,
        units: puertos.units,
        images: puertos.images,
      })(RECETA_VALIDA, actor),
  },
  {
    nombre: 'get-recipe',
    invocar: (puertos, actor) =>
      createGetRecipe({ recipes: puertos.recipes, products: puertos.products, images: puertos.images })(
        'receta-1',
        actor,
      ),
  },
  {
    nombre: 'list-recipes',
    invocar: (puertos, actor) =>
      createListRecipes({
        recipes: puertos.recipes,
        images: puertos.images,
        toOffsetLimit: () => ({ offset: 0, limit: 10 }),
        buildPage: (items, total, page, pageSize) => ({ items, total, page, pageSize, totalPages: 1 }),
      })({}, actor),
  },
  {
    nombre: 'update-recipe',
    invocar: (puertos, actor) =>
      createUpdateRecipe({
        recipes: puertos.recipes,
        products: puertos.products,
        units: puertos.units,
        images: puertos.images,
      })('receta-1', RECETA_VALIDA, actor),
  },
  {
    nombre: 'delete-recipe',
    invocar: (puertos, actor) => createDeleteRecipe({ recipes: puertos.recipes })('receta-1', actor),
  },
];

describe('R2 — rechazo de Operador', () => {
  it('un actor con rol Operador es rechazado en los cinco casos de uso sin llamar a ningun puerto', async () => {
    expect(CASOS_DE_USO).toHaveLength(5);

    for (const caso of CASOS_DE_USO) {
      const puertos = montarPuertos();

      await expect(
        caso.invocar(puertos, OPERADOR),
        `${caso.nombre} deberia rechazar al Operador`,
      ).rejects.toBeInstanceOf(UnauthorizedError);
      afirmarQueNingunPuertoFueLlamado(puertos);
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
    { etiqueta: 'rol desconocido, Fantasma', actor: { id: 'fantasma-1', roleName: 'Fantasma' } },
  ];

  it('un actor ausente, con rol nulo o con rol desconocido es rechazado igual que el Operador', async () => {
    for (const { etiqueta, actor } of actoresInvalidos) {
      for (const caso of CASOS_DE_USO) {
        const puertos = montarPuertos();

        await expect(
          caso.invocar(puertos, actor),
          `${caso.nombre} deberia rechazar con ${etiqueta}`,
        ).rejects.toBeInstanceOf(UnauthorizedError);
        afirmarQueNingunPuertoFueLlamado(puertos);
      }
    }
  });
});

describe('R1 — el actor entra por parametro', () => {
  it('cada caso de uso recibe el actor por parametro y no lee ninguna sesion', async () => {
    // El doble aqui es PERMISIVO a proposito (a diferencia de los de arriba): lo que se
    // prueba en esta mitad no es "no llega al repositorio" (eso ya lo cierra R2), sino que
    // el resultado depende UNICAMENTE del actor que se pasa por parametro.
    const recipes: RecipeRepository = {
      create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'receta-1' })),
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => null),
      listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
      replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
      softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    };
    const products: ProductCatalog = { findRefs: vi.fn<ProductCatalog['findRefs']>(async () => []) };
    const units: UnitCatalog = { findRefs: vi.fn<UnitCatalog['findRefs']>(async () => []) };
    const images: RecipeImageStorage = {
      upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/x.jpg'),
      remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
      publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => `https://bucket.example/${path}`),
    };
    const createRecipe = createCreateRecipe({ recipes, products, units, images });

    await expect(createRecipe(RECETA_VALIDA, ADMIN)).resolves.toEqual({ id: 'receta-1' });
    await expect(createRecipe(RECETA_VALIDA, OPERADOR)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('ningun archivo de domain/ lee sesion, cookie ni cabecera por su cuenta', () => {
    const directorioDominio = path.join(process.cwd(), 'lib', 'modules', 'recetas', 'domain');
    const archivos = readdirSync(directorioDominio).filter((archivo) => archivo.endsWith('.ts'));

    // Un barrido sobre cero archivos pasa siempre y no vigila nada: si esto llega a 0, el
    // test de abajo es un placebo y hay que fallar aqui mismo, antes de leer nada.
    expect(archivos.length).toBeGreaterThan(0);

    const patronesProhibidos = ['next/headers', 'cookies(', 'headers(', 'getSessionUser', 'lib/composition'];

    for (const archivo of archivos) {
      const contenidoCrudo = readFileSync(path.join(directorioDominio, archivo), 'utf-8');
      const contenido = contenidoCrudo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      for (const patron of patronesProhibidos) {
        expect(
          contenido.includes(patron),
          `${archivo} no deberia contener "${patron}" fuera de un comentario (R1: el actor entra por parametro)`,
        ).toBe(false);
      }
    }
  });
});
