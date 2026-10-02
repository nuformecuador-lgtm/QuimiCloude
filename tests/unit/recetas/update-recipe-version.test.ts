// Edicion de una version de receta, con dobles de sus puertos.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import {
  ActionNotAllowedError,
  RecipeDuplicateNameError,
  RecipeNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/recetas/domain/errors';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { createUpdateRecipeVersion } from '@/lib/modules/recetas/domain/update-recipe-version';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { NewRecipe, RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';

const EMPRESA = 'empresa-1';
const ACTOR: Actor = { id: 'actor-1', companyId: EMPRESA, permissions: ['recetas.consultar', 'recetas.modificar'] };
const AHORA = new Date('2026-10-01T10:00:00.000Z');

const P_A = '11111111-1111-4111-8111-111111111111';
const P_B = '22222222-2222-4222-8222-222222222222';
const P_C = '33333333-3333-4333-8333-333333333333';

function ref(id: string, type: ProductRef['type'] = 'PRODUCT'): ProductRef {
  return { id, name: `producto ${id}`, unitId: null, stockByUnit: [], type };
}

const ORIGINAL: RecipeRow = {
  id: 'original-1',
  name: 'Crema base',
  description: 'Base',
  steps: [{ blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] }],
  imagePath: null,
  createdBy: 'actor-1',
  updatedBy: 'actor-1',
  createdAt: AHORA,
  updatedAt: AHORA,
  lines: [
    { id: 'l-1', productId: P_A, percentage: '70.00' },
    { id: 'l-2', productId: P_B, percentage: '30.00' },
  ],
  original: null,
};

const VERSION: RecipeRow = {
  ...ORIGINAL,
  id: 'version-1',
  name: 'Sin perfume',
  description: null,
  steps: [],
  lines: [
    { id: 'l-3', productId: P_A, percentage: '50.00' },
    { id: 'l-4', productId: P_B, percentage: '50.00' },
  ],
  original: { id: ORIGINAL.id, name: ORIGINAL.name, description: 'Base', imagePath: null, steps: ORIGINAL.steps },
};

function repositorio(fila: RecipeRow | null = VERSION, overrides: Partial<RecipeRepository> = {}): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'x' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => fila),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    createVersion: vi.fn<RecipeRepository['createVersion']>(async () => 'not_found'),
    listAliveVersions: vi.fn<RecipeRepository['listAliveVersions']>(async () => []),
    replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(async () => 'not_found'),
    ...overrides,
  };
}

function catalogo(refs: readonly ProductRef[] = [ref(P_A), ref(P_B), ref(P_C)]): ProductCatalog {
  return {
    findRefs: vi.fn<ProductCatalog['findRefs']>(async (ids) => refs.filter((r) => ids.includes(r.id))),
    findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
      throw new Error('no se usa');
    }),
    findFinishedGoodsReceipts: vi.fn<ProductCatalog['findFinishedGoodsReceipts']>(() => {
      throw new Error('no se usa');
    }),
  };
}

function montar(recipes = repositorio(), products = catalogo()) {
  return { recipes, products, run: createUpdateRecipeVersion({ recipes, products, now: () => AHORA }) };
}

const LINEAS = [
  { productId: P_A, percentage: '40.00' },
  { productId: P_C, percentage: '60.00' },
];

describe('updateRecipeVersion', () => {
  it.each([
    ['sin actor', null],
    ['solo con recetas.consultar', { ...ACTOR, permissions: ['recetas.consultar'] }],
  ])('R38: %s rechaza antes de llamar a ningun doble', async (_caso, actor) => {
    const { recipes, products, run } = montar();
    await expect(run(VERSION.id, { name: 'X', lines: LINEAS }, actor)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(recipes.findAliveById).not.toHaveBeenCalled();
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
    expect(products.findRefs).not.toHaveBeenCalled();
  });

  it('R6, R8, R40: reemplaza nombre y lineas de la version, sin pasos, descripcion ni imagen propios, y sin tocar la original', async () => {
    const { recipes, run } = montar();

    const resultado = await run(VERSION.id, { name: 'Sin perfume 2', lines: LINEAS }, ACTOR);

    expect(resultado).toEqual({ id: VERSION.id });
    expect(recipes.findAliveById).toHaveBeenCalledWith(VERSION.id, { companyId: EMPRESA });
    expect(recipes.replaceAlive).toHaveBeenCalledTimes(1);
    const datos: NewRecipe = { name: 'Sin perfume 2', description: null, steps: [], lines: LINEAS, imagePath: null };
    expect(recipes.replaceAlive).toHaveBeenCalledWith(VERSION.id, datos, ACTOR.id, AHORA, { companyId: EMPRESA });
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
  });

  it('R6: solo valida contra el catalogo el producto que la version no tenia', async () => {
    const { products, run } = montar();
    await run(VERSION.id, { name: 'X', lines: LINEAS }, ACTOR);
    expect(products.findRefs).toHaveBeenCalledWith([P_C], EMPRESA);
  });

  it('R7: editar una original con la operacion de versiones → accion no permitida, sin escribir', async () => {
    const recipes = repositorio(ORIGINAL);
    const { products, run } = montar(recipes);
    await expect(run(ORIGINAL.id, { name: 'X', lines: LINEAS }, ACTOR)).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
    expect(products.findRefs).not.toHaveBeenCalled();
  });

  it('R40: una version inexistente, de baja o de otra empresa → receta no encontrada, sin escribir', async () => {
    const recipes = repositorio(null);
    const { run } = montar(recipes);
    await expect(run(VERSION.id, { name: 'X', lines: LINEAS }, ACTOR)).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });

  it.each([
    ['que no suman 100', [{ productId: P_A, percentage: '40.00' }]],
    ['vacias', []],
    ['con un producto repetido', [{ productId: P_A, percentage: '50.00' }, { productId: P_A, percentage: '50.00' }]],
  ])('R3: con lineas %s rechaza sin escribir', async (_caso, lines) => {
    const { recipes, run } = montar();
    await expect(run(VERSION.id, { name: 'X', lines }, ACTOR)).rejects.toBeInstanceOf(ValidationError);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });

  it('R3: un producto terminado nuevo → accion no permitida, sin escribir', async () => {
    const { recipes, run } = montar(repositorio(), catalogo([ref(P_A), ref(P_C, 'FINISHED_PRODUCT')]));
    await expect(run(VERSION.id, { name: 'X', lines: LINEAS }, ACTOR)).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });

  it('R12: un nombre ya usado por otra version viva de la misma original → nombre duplicado', async () => {
    const recipes = repositorio(VERSION, {
      replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'duplicate'),
    });
    const { run } = montar(recipes);
    await expect(run(VERSION.id, { name: 'Otra', lines: LINEAS }, ACTOR)).rejects.toBeInstanceOf(
      RecipeDuplicateNameError,
    );
  });

  it('R22: editar una version por revisar con lineas validas la deja de considerar por revisar', async () => {
    let fila: RecipeRow = {
      ...VERSION,
      lines: [{ id: 'l-3', productId: P_A, percentage: '90.00' }],
    };
    const recipes = repositorio(VERSION, {
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => fila),
      replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async (_id, datos) => {
        fila = { ...fila, name: datos.name, lines: datos.lines.map((l, i) => ({ ...l, id: `n-${i}` })) };
        return 'ok';
      }),
    });
    const products = catalogo();
    const images: RecipeImageStorage = {
      upload: vi.fn<RecipeImageStorage['upload']>(async () => 'x'),
      remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
      publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => `https://bucket.example/${path}`),
    };
    const getRecipe = createGetRecipe({ recipes, products, images });
    const updateRecipeVersion = createUpdateRecipeVersion({ recipes, products, now: () => AHORA });

    expect((await getRecipe(VERSION.id, ACTOR)).isUnderReview).toBe(true);
    await updateRecipeVersion(VERSION.id, { name: 'Sin perfume', lines: LINEAS }, ACTOR);
    expect((await getRecipe(VERSION.id, ACTOR)).isUnderReview).toBe(false);
  });
});
