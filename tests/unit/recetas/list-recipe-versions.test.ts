// Versiones de una receta original, con un doble del repositorio.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { RecipeNotFoundError, UnauthorizedError } from '@/lib/modules/recetas/domain/errors';
import { createListRecipeVersions } from '@/lib/modules/recetas/domain/list-recipe-versions';
import type { RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

const EMPRESA = 'empresa-1';
const ACTOR: Actor = { id: 'actor-1', companyId: EMPRESA, permissions: ['recetas.consultar'] };
const AHORA = new Date('2026-10-01T10:00:00.000Z');
const P_A = '11111111-1111-4111-8111-111111111111';
const P_B = '22222222-2222-4222-8222-222222222222';

const ORIGINAL: RecipeRow = {
  id: 'original-1',
  name: 'Crema base',
  description: null,
  steps: [],
  imagePath: null,
  createdBy: null,
  updatedBy: null,
  createdAt: AHORA,
  updatedAt: AHORA,
  lines: [],
  tools: [],
  original: null,
};

const COMO_VERSION = { id: ORIGINAL.id, name: ORIGINAL.name, description: null, imagePath: null, steps: [] };

function version(id: string, name: string, percentages: readonly string[], updatedAt = AHORA): RecipeRow {
  return {
    ...ORIGINAL,
    id,
    name,
    updatedAt,
    lines: percentages.map((percentage, i) => ({ id: `${id}-l${i}`, productId: i === 0 ? P_A : P_B, percentage })),
    original: COMO_VERSION,
  };
}

const VERSIONES = [
  version('v-1', 'Con perfume', ['60.00', '40.00']),
  version('v-2', 'Ligera', ['60.00', '30.00'], new Date('2026-10-02T00:00:00.000Z')),
  version('v-3', 'Sin perfume', []),
];

function repositorio(fila: RecipeRow | null = ORIGINAL): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'x' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => fila),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    createVersion: vi.fn<RecipeRepository['createVersion']>(async () => 'not_found'),
    listAliveVersions: vi.fn<RecipeRepository['listAliveVersions']>(async () => VERSIONES),
    replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(async () => 'not_found'),
  };
}

describe('listRecipeVersions', () => {
  it.each([
    ['sin actor', null],
    ['solo con recetas.modificar', { ...ACTOR, permissions: ['recetas.modificar'] }],
  ])('R38: %s rechaza antes de llamar a ningun doble', async (_caso, actor) => {
    const recipes = repositorio();
    await expect(createListRecipeVersions({ recipes })(ORIGINAL.id, actor)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(recipes.findAliveById).not.toHaveBeenCalled();
    expect(recipes.listAliveVersions).not.toHaveBeenCalled();
  });

  it('R10, R11, R21, R40: devuelve las versiones vivas en el orden del repositorio, con nombre propio, nombre mostrado y si estan por revisar', async () => {
    const recipes = repositorio();

    const resultado = await createListRecipeVersions({ recipes })(ORIGINAL.id, ACTOR);

    expect(recipes.findAliveById).toHaveBeenCalledWith(ORIGINAL.id, { companyId: EMPRESA });
    expect(recipes.listAliveVersions).toHaveBeenCalledWith(ORIGINAL.id, { companyId: EMPRESA });
    expect(resultado).toEqual([
      { id: 'v-1', name: 'Con perfume', displayName: 'Crema base · Con perfume', isUnderReview: false, updatedAt: AHORA },
      {
        id: 'v-2',
        name: 'Ligera',
        displayName: 'Crema base · Ligera',
        isUnderReview: true,
        updatedAt: new Date('2026-10-02T00:00:00.000Z'),
      },
      { id: 'v-3', name: 'Sin perfume', displayName: 'Crema base · Sin perfume', isUnderReview: true, updatedAt: AHORA },
    ]);
  });

  it('R10, R40: una receta inexistente, de baja o de otra empresa → receta no encontrada', async () => {
    const recipes = repositorio(null);
    await expect(createListRecipeVersions({ recipes })(ORIGINAL.id, ACTOR)).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(recipes.listAliveVersions).not.toHaveBeenCalled();
  });

  it('R10: pedir las versiones de una version → receta no encontrada', async () => {
    const recipes = repositorio(VERSIONES[0] as RecipeRow);
    await expect(createListRecipeVersions({ recipes })('v-1', ACTOR)).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(recipes.listAliveVersions).not.toHaveBeenCalled();
  });
});
