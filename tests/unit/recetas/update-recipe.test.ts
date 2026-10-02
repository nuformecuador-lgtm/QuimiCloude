// Edicion de una receta original: rechazo de versiones y propagacion a sus versiones.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import {
  ActionNotAllowedError,
  RecipeDuplicateNameError,
  RecipeNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/recetas/domain/errors';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { NewRecipe, RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';

const EMPRESA = 'empresa-1';
const ACTOR: Actor = { id: 'actor-1', companyId: EMPRESA, permissions: ['recetas.consultar', 'recetas.modificar'] };
const AHORA = new Date('2026-10-01T10:00:00.000Z');

const P_A = '11111111-1111-4111-8111-111111111111';
const P_B = '22222222-2222-4222-8222-222222222222';
const V_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const V_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const PASO = { blocks: [{ kind: 'paragraph' as const, spans: [{ text: 'Mezclar' }] }] };

const ORIGINAL: RecipeRow = {
  id: 'original-1',
  name: 'Crema base',
  description: null,
  steps: [PASO],
  imagePath: null,
  createdBy: null,
  updatedBy: null,
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
  steps: [],
  original: { id: ORIGINAL.id, name: ORIGINAL.name, description: null, imagePath: null, steps: [PASO] },
};

const ENTRADA = {
  name: 'Crema base',
  steps: [PASO],
  lines: [
    { productId: P_A, percentage: '60.00' },
    { productId: P_B, percentage: '40.00' },
  ],
};

const DATOS: NewRecipe = {
  name: 'Crema base',
  description: null,
  steps: [PASO],
  lines: ENTRADA.lines,
  imagePath: null,
};

function repositorio(fila: RecipeRow | null = ORIGINAL, overrides: Partial<RecipeRepository> = {}): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'x' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => fila),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    createVersion: vi.fn<RecipeRepository['createVersion']>(async () => 'not_found'),
    listAliveVersions: vi.fn<RecipeRepository['listAliveVersions']>(async () => []),
    replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(async () => ({
      kind: 'ok',
      propagated: [
        { versionId: V_1, isUnderReview: false },
        { versionId: V_2, isUnderReview: true },
      ],
    })),
    ...overrides,
  };
}

function montar(recipes = repositorio()) {
  const products: ProductCatalog = {
    findRefs: vi.fn<ProductCatalog['findRefs']>(async (ids) =>
      ids.map((id): ProductRef => ({ id, name: id, unitId: null, stockByUnit: [], type: 'PRODUCT' })),
    ),
    findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
      throw new Error('no se usa');
    }),
    findFinishedGoodsReceipts: vi.fn<ProductCatalog['findFinishedGoodsReceipts']>(() => {
      throw new Error('no se usa');
    }),
  };
  const images: RecipeImageStorage = {
    upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/nueva.jpg'),
    remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => path),
  };
  return { recipes, products, images, run: createUpdateRecipe({ recipes, products, images, now: () => AHORA }) };
}

describe('updateRecipe frente a versiones', () => {
  it('R38: sin recetas.modificar rechaza la propagacion antes de llamar a ningun doble', async () => {
    const { recipes, products, images, run } = montar();
    const actor = { ...ACTOR, permissions: ['recetas.consultar'] };
    await expect(run(ORIGINAL.id, { ...ENTRADA, propagateToVersionIds: [V_1] }, actor)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(recipes.findAliveById).not.toHaveBeenCalled();
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
    expect(products.findRefs).not.toHaveBeenCalled();
    expect(images.upload).not.toHaveBeenCalled();
  });

  it('R7: editar una version con la operacion de recetas originales → accion no permitida, sin escribir', async () => {
    const { recipes, products, images, run } = montar(repositorio(VERSION));
    await expect(
      run(VERSION.id, { ...ENTRADA, image: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0]) } }, ACTOR),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
    expect(products.findRefs).not.toHaveBeenCalled();
    expect(images.upload).not.toHaveBeenCalled();
  });

  it('R16: sin versiones indicadas guarda por el camino de siempre y no propaga', async () => {
    const { recipes, run } = montar();

    const resultado = await run(ORIGINAL.id, ENTRADA, ACTOR);

    expect(recipes.replaceAlive).toHaveBeenCalledWith(ORIGINAL.id, DATOS, ACTOR.id, AHORA, { companyId: EMPRESA });
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
    expect(resultado).toEqual({ id: ORIGINAL.id, warnings: [], propagated: [] });
  });

  it('R16: una lista vacia de versiones es lo mismo que no indicarla', async () => {
    const { recipes, run } = montar();
    await run(ORIGINAL.id, { ...ENTRADA, propagateToVersionIds: [] }, ACTOR);
    expect(recipes.replaceAlive).toHaveBeenCalledTimes(1);
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
  });

  it('R14, R19, R20: con versiones indicadas guarda y propaga en una sola operacion y devuelve si cada una quedo por revisar', async () => {
    const { recipes, run } = montar();

    const resultado = await run(ORIGINAL.id, { ...ENTRADA, propagateToVersionIds: [V_1, V_2] }, ACTOR);

    expect(recipes.replaceAliveWithPropagation).toHaveBeenCalledTimes(1);
    expect(recipes.replaceAliveWithPropagation).toHaveBeenCalledWith(ORIGINAL.id, DATOS, [V_1, V_2], ACTOR.id, AHORA, {
      companyId: EMPRESA,
    });
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
    expect(resultado).toEqual({
      id: ORIGINAL.id,
      warnings: [],
      propagated: [
        { versionId: V_1, isUnderReview: false },
        { versionId: V_2, isUnderReview: true },
      ],
    });
  });

  it('R17: si alguna version indicada no es una version viva de esa original rechaza la operacion entera', async () => {
    const recipes = repositorio(ORIGINAL, {
      replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(
        async () => 'version_not_found',
      ),
    });
    const { run } = montar(recipes);
    await expect(run(ORIGINAL.id, { ...ENTRADA, propagateToVersionIds: [V_1] }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it.each([
    ['repetidas', [V_1, V_1]],
    ['que no son uuid', ['version-1']],
  ])('R17: con versiones %s rechaza sin leer ni escribir', async (_caso, ids) => {
    const { recipes, run } = montar();
    await expect(run(ORIGINAL.id, { ...ENTRADA, propagateToVersionIds: ids }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(recipes.findAliveById).not.toHaveBeenCalled();
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', RecipeNotFoundError],
    ['duplicate', RecipeDuplicateNameError],
  ] as const)('R14: la propagacion que responde %s se traduce como el guardado de siempre', async (respuesta, error) => {
    const recipes = repositorio(ORIGINAL, {
      replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(async () => respuesta),
    });
    const { run } = montar(recipes);
    await expect(run(ORIGINAL.id, { ...ENTRADA, propagateToVersionIds: [V_1] }, ACTOR)).rejects.toBeInstanceOf(error);
  });
});
