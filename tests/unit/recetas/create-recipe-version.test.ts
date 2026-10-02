// Alta de una version de receta, con dobles de sus puertos.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipeVersion } from '@/lib/modules/recetas/domain/create-recipe-version';
import {
  ActionNotAllowedError,
  RecipeDuplicateNameError,
  RecipeNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/recetas/domain/errors';
import type { RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

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

const VERSION: RecipeRow = {
  ...ORIGINAL,
  id: 'version-1',
  name: 'Sin perfume',
  description: null,
  steps: [],
  imagePath: null,
  original: { id: ORIGINAL.id, name: ORIGINAL.name, description: 'Base', imagePath: null, steps: [] },
};

function repositorio(overrides: Partial<RecipeRepository> = {}): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'x' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => ORIGINAL),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    createVersion: vi.fn<RecipeRepository['createVersion']>(async () => ({ id: 'version-nueva' })),
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
  return { recipes, products, run: createCreateRecipeVersion({ recipes, products, now: () => AHORA }) };
}

const LINEAS_VERSION = [
  { productId: P_A, percentage: '50.00' },
  { productId: P_C, percentage: '50.00' },
];

describe('createRecipeVersion', () => {
  it.each([
    ['sin actor', null],
    ['solo con recetas.consultar', { ...ACTOR, permissions: ['recetas.consultar'] }],
  ])('R38: %s rechaza antes de llamar a ningun doble', async (_caso, actor) => {
    const { recipes, products, run } = montar();
    await expect(run(ORIGINAL.id, { name: 'Sin perfume', lines: LINEAS_VERSION }, actor)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(recipes.findAliveById).not.toHaveBeenCalled();
    expect(recipes.createVersion).not.toHaveBeenCalled();
    expect(products.findRefs).not.toHaveBeenCalled();
  });

  it('R1, R40: crea la version con sus lineas, vinculada a la original, en la empresa del actor y sin tocar la original', async () => {
    const { recipes, run } = montar();

    const resultado = await run(ORIGINAL.id, { name: '  Sin perfume ', lines: LINEAS_VERSION }, ACTOR);

    expect(resultado).toEqual({ id: 'version-nueva' });
    expect(recipes.findAliveById).toHaveBeenCalledWith(ORIGINAL.id, { companyId: EMPRESA });
    expect(recipes.createVersion).toHaveBeenCalledWith(
      ORIGINAL.id,
      { name: 'Sin perfume', lines: LINEAS_VERSION },
      ACTOR.id,
      AHORA,
      { companyId: EMPRESA },
    );
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
    expect(recipes.create).not.toHaveBeenCalled();
  });

  it('R2: sin lineas, la version nace con una copia de las de la original', async () => {
    const { recipes, products, run } = montar();

    await run(ORIGINAL.id, { name: 'Copia' }, ACTOR);

    expect(recipes.createVersion).toHaveBeenCalledWith(
      ORIGINAL.id,
      {
        name: 'Copia',
        lines: [
          { productId: P_A, percentage: '70.00' },
          { productId: P_B, percentage: '30.00' },
        ],
      },
      ACTOR.id,
      AHORA,
      { companyId: EMPRESA },
    );
    expect(products.findRefs).toHaveBeenCalledWith([P_A, P_B], EMPRESA);
  });

  it('R2, R3: sin lineas y con una original que no suma 100, rechaza la copia sin crear nada', async () => {
    const recipes = repositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => ({
        ...ORIGINAL,
        lines: [{ id: 'l-1', productId: P_A, percentage: '70.00' }],
      })),
    });
    const { run } = montar(recipes);

    await expect(run(ORIGINAL.id, { name: 'Copia' }, ACTOR)).rejects.toBeInstanceOf(ValidationError);
    expect(recipes.createVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['que no suman 100', [{ productId: P_A, percentage: '60.00' }, { productId: P_C, percentage: '30.00' }]],
    ['que suman mas de 100', [{ productId: P_A, percentage: '60.00' }, { productId: P_C, percentage: '40.01' }]],
    ['vacias', []],
    ['con un producto repetido', [{ productId: P_A, percentage: '50.00' }, { productId: P_A, percentage: '50.00' }]],
    ['con tres decimales', [{ productId: P_A, percentage: '99.995' }, { productId: P_C, percentage: '0.005' }]],
  ])('R3: con lineas %s rechaza sin crear nada', async (_caso, lines) => {
    const { recipes, run } = montar();
    await expect(run(ORIGINAL.id, { name: 'Mala', lines }, ACTOR)).rejects.toBeInstanceOf(ValidationError);
    expect(recipes.createVersion).not.toHaveBeenCalled();
  });

  it('R3: con un producto terminado como ingrediente → accion no permitida, sin crear nada', async () => {
    const { recipes, run } = montar(repositorio(), catalogo([ref(P_A), ref(P_C, 'FINISHED_PRODUCT')]));
    await expect(run(ORIGINAL.id, { name: 'Mala', lines: LINEAS_VERSION }, ACTOR)).rejects.toBeInstanceOf(
      ActionNotAllowedError,
    );
    expect(recipes.createVersion).not.toHaveBeenCalled();
  });

  it('R3: con un producto que no existe en la empresa rechaza sin crear nada', async () => {
    const { recipes, run } = montar(repositorio(), catalogo([ref(P_A)]));
    await expect(run(ORIGINAL.id, { name: 'Mala', lines: LINEAS_VERSION }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(recipes.createVersion).not.toHaveBeenCalled();
  });

  it('R12: un nombre ya usado por otra version viva de la misma original → nombre duplicado', async () => {
    const recipes = repositorio({
      createVersion: vi.fn<RecipeRepository['createVersion']>(async () => 'duplicate'),
    });
    const { run } = montar(recipes);
    await expect(run(ORIGINAL.id, { name: 'Sin perfume', lines: LINEAS_VERSION }, ACTOR)).rejects.toBeInstanceOf(
      RecipeDuplicateNameError,
    );
  });

  it('R4: crear desde una version → accion no permitida, sin crear nada', async () => {
    const recipes = repositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => VERSION),
    });
    const { products, run } = montar(recipes);
    await expect(run(VERSION.id, { name: 'Nieta', lines: LINEAS_VERSION }, ACTOR)).rejects.toBeInstanceOf(
      ActionNotAllowedError,
    );
    expect(recipes.createVersion).not.toHaveBeenCalled();
    expect(products.findRefs).not.toHaveBeenCalled();
  });

  it('R5, R40: original inexistente, de baja o de otra empresa → receta no encontrada, sin crear nada', async () => {
    const recipes = repositorio({
      findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => null),
    });
    const { run } = montar(recipes);
    await expect(run(ORIGINAL.id, { name: 'Sin perfume', lines: LINEAS_VERSION }, ACTOR)).rejects.toBeInstanceOf(
      RecipeNotFoundError,
    );
    expect(recipes.createVersion).not.toHaveBeenCalled();
  });

  it('R5: si la original deja de estar viva entre la lectura y el alta, el repositorio dice not_found → receta no encontrada', async () => {
    const recipes = repositorio({
      createVersion: vi.fn<RecipeRepository['createVersion']>(async () => 'not_found'),
    });
    const { run } = montar(recipes);
    await expect(run(ORIGINAL.id, { name: 'Sin perfume', lines: LINEAS_VERSION }, ACTOR)).rejects.toBeInstanceOf(
      RecipeNotFoundError,
    );
  });

  it('un nombre vacio rechaza antes de leer la original', async () => {
    const { recipes, run } = montar();
    await expect(run(ORIGINAL.id, { name: '   ', lines: LINEAS_VERSION }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(recipes.findAliveById).not.toHaveBeenCalled();
  });
});
