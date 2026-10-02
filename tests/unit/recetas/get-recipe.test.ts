// Detalle de una receta original o de una version, con dobles de sus puertos.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { RecipeNotFoundError, UnauthorizedError } from '@/lib/modules/recetas/domain/errors';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';

const EMPRESA = 'empresa-1';
const ACTOR: Actor = { id: 'actor-1', companyId: EMPRESA, permissions: ['recetas.consultar'] };
const AHORA = new Date('2026-10-01T10:00:00.000Z');
const P_A = '11111111-1111-4111-8111-111111111111';
const P_B = '22222222-2222-4222-8222-222222222222';

const PASO_ORIGINAL = { blocks: [{ kind: 'paragraph' as const, spans: [{ text: 'Mezclar en frio' }] }] };
const PASO_ENVASAR = { blocks: [{ kind: 'paragraph' as const, spans: [{ text: 'Envasar' }] }] };

const ORIGINAL: RecipeRow = {
  id: 'original-1',
  name: 'Crema base',
  description: 'Descripcion de la original',
  steps: [PASO_ORIGINAL, PASO_ENVASAR],
  imagePath: 'recetas/crema.jpg',
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

function version(percentages: readonly string[]): RecipeRow {
  return {
    ...ORIGINAL,
    id: 'version-1',
    name: 'Sin perfume',
    description: null,
    steps: [],
    imagePath: null,
    lines: percentages.map((percentage, i) => ({ id: `v-l${i}`, productId: i === 0 ? P_A : P_B, percentage })),
    original: {
      id: ORIGINAL.id,
      name: ORIGINAL.name,
      description: ORIGINAL.description,
      imagePath: ORIGINAL.imagePath,
      steps: ORIGINAL.steps,
    },
  };
}

function montar(fila: RecipeRow | null) {
  const recipes: RecipeRepository = {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'x' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => fila),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    createVersion: vi.fn<RecipeRepository['createVersion']>(async () => 'not_found'),
    listAliveVersions: vi.fn<RecipeRepository['listAliveVersions']>(async () => []),
    replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(async () => 'not_found'),
  };
  const products: ProductCatalog = {
    findRefs: vi.fn<ProductCatalog['findRefs']>(async (ids) =>
      ids.map((id): ProductRef => ({ id, name: `producto ${id}`, unitId: null, stockByUnit: [], type: 'PRODUCT' })),
    ),
    findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
      throw new Error('no se usa');
    }),
    findFinishedGoodsReceipts: vi.fn<ProductCatalog['findFinishedGoodsReceipts']>(() => {
      throw new Error('no se usa');
    }),
  };
  const images: RecipeImageStorage = {
    upload: vi.fn<RecipeImageStorage['upload']>(async () => 'x'),
    remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => `https://bucket.example/${path}`),
  };
  return { recipes, products, images, run: createGetRecipe({ recipes, products, images }) };
}

describe('getRecipe frente a versiones', () => {
  it('R38: sin recetas.consultar rechaza antes de llamar a ningun doble', async () => {
    const { recipes, products, run } = montar(version(['50.00', '50.00']));
    await expect(run('version-1', { ...ACTOR, permissions: ['recetas.modificar'] })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(recipes.findAliveById).not.toHaveBeenCalled();
    expect(products.findRefs).not.toHaveBeenCalled();
  });

  it('R8, R11: el detalle de una version trae los pasos, la descripcion y la imagen de su original, y sus propias lineas', async () => {
    const { run } = montar(version(['50.00', '50.00']));

    const detalle = await run('version-1', ACTOR);

    expect(detalle.id).toBe('version-1');
    expect(detalle.name).toBe('Sin perfume');
    expect(detalle.displayName).toBe('Crema base · Sin perfume');
    expect(detalle.original).toEqual({ id: ORIGINAL.id, name: 'Crema base' });
    expect(detalle.steps).toEqual([PASO_ORIGINAL, PASO_ENVASAR]);
    expect(detalle.stepCount).toBe(2);
    expect(detalle.description).toBe('Descripcion de la original');
    expect(detalle.imageUrl).toBe('https://bucket.example/recetas/crema.jpg');
    expect(detalle.lines.map((line) => line.percentage)).toEqual(['50.00', '50.00']);
    expect(detalle.isUnderReview).toBe(false);
  });

  it.each([
    ['que no suma 100', ['50.00', '40.00']],
    ['sin lineas', []],
  ])('R21: una version %s sale por revisar', async (_caso, percentages) => {
    const { run } = montar(version(percentages));
    expect((await run('version-1', ACTOR)).isUnderReview).toBe(true);
  });

  it('R11, R21: una original se muestra con su nombre, sin original, y nunca por revisar aunque no tenga lineas', async () => {
    const { run } = montar({ ...ORIGINAL, lines: [] });

    const detalle = await run(ORIGINAL.id, ACTOR);

    expect(detalle.displayName).toBe('Crema base');
    expect(detalle.original).toBeNull();
    expect(detalle.isUnderReview).toBe(false);
    expect(detalle.steps).toEqual(ORIGINAL.steps);
    expect(detalle.description).toBe(ORIGINAL.description);
    expect(detalle.imageUrl).toBe('https://bucket.example/recetas/crema.jpg');
  });

  it('R40: una receta inexistente, de baja o de otra empresa → receta no encontrada', async () => {
    const { recipes, run } = montar(null);
    await expect(run('version-1', ACTOR)).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(recipes.findAliveById).toHaveBeenCalledWith('version-1', { companyId: EMPRESA });
  });
});
