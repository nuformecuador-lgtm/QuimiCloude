import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createCreateRecipeVersion } from '@/lib/modules/recetas/domain/create-recipe-version';
import { ActionNotAllowedError } from '@/lib/modules/recetas/domain/errors';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import { createUpdateRecipeVersion } from '@/lib/modules/recetas/domain/update-recipe-version';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import { isIngredientType, PRODUCT_TYPES, type ProductCatalog, type ProductRef } from '@/lib/modules/inventario';

const EMPRESA = 'empresa-1';
const ACTOR: Actor = { id: 'actor-1', companyId: EMPRESA, permissions: ['recetas.consultar', 'recetas.modificar'] };
const AHORA = new Date('2026-10-03T10:00:00.000Z');

const MATERIA = '11111111-1111-4111-8111-111111111111';
const ENVASE = '22222222-2222-4222-8222-222222222222';
const OTRA_MATERIA = '33333333-3333-4333-8333-333333333333';
const ENVASE_NUEVO = '44444444-4444-4444-8444-444444444444';

function ref(id: string, type: ProductRef['type']): ProductRef {
  return { id, name: `producto ${id}`, unitId: null, stockByUnit: [], type };
}

const REFS = [
  ref(MATERIA, PRODUCT_TYPES.PRODUCT),
  ref(OTRA_MATERIA, PRODUCT_TYPES.MACHINE),
  ref(ENVASE, PRODUCT_TYPES.PACKAGING),
  ref(ENVASE_NUEVO, PRODUCT_TYPES.PACKAGING),
];

/** Una receta que ya tiene un envase como ingrediente, de antes de que se prohibiera. */
const ORIGINAL_CON_ENVASE: RecipeRow = {
  id: 'original-1',
  name: 'Crema base',
  description: null,
  steps: [],
  imagePath: null,
  createdBy: 'actor-1',
  updatedBy: 'actor-1',
  createdAt: AHORA,
  updatedAt: AHORA,
  lines: [
    { id: 'l-1', productId: MATERIA, percentage: '90.00' },
    { id: 'l-2', productId: ENVASE, percentage: '10.00' },
  ],
  tools: [],
  original: null,
};

const VERSION_CON_ENVASE: RecipeRow = {
  ...ORIGINAL_CON_ENVASE,
  id: 'version-1',
  name: 'Sin perfume',
  original: { id: ORIGINAL_CON_ENVASE.id, name: ORIGINAL_CON_ENVASE.name, description: null, imagePath: null, steps: [] },
};

function repositorio(fila: RecipeRow): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'receta-nueva' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => fila),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    createVersion: vi.fn<RecipeRepository['createVersion']>(async () => ({ id: 'version-nueva' })),
    listAliveVersions: vi.fn<RecipeRepository['listAliveVersions']>(async () => []),
    replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(async () => ({ kind: 'ok', propagated: [] })),
  };
}

function catalogo(): ProductCatalog {
  return {
    findRefs: vi.fn<ProductCatalog['findRefs']>(async (ids) => REFS.filter((r) => ids.includes(r.id))),
    findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
      throw new Error('no se usa');
    }),
    findFinishedGoodsReceipts: vi.fn<ProductCatalog['findFinishedGoodsReceipts']>(() => {
      throw new Error('no se usa');
    }),
  };
}

function almacenamiento(): RecipeImageStorage {
  return {
    upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/x.jpg'),
    remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => `https://bucket.example/${path}`),
  };
}

function receta(lines: readonly { productId: string; percentage: string }[]) {
  return { name: 'Jabon', description: null, steps: [], lines };
}

describe('QC-195 — el envase no es ingrediente', () => {
  it('isIngredientType: solo PRODUCT y MACHINE son ingredientes', () => {
    expect(isIngredientType(PRODUCT_TYPES.PRODUCT)).toBe(true);
    expect(isIngredientType(PRODUCT_TYPES.MACHINE)).toBe(true);
    expect(isIngredientType(PRODUCT_TYPES.PACKAGING)).toBe(false);
    expect(isIngredientType(PRODUCT_TYPES.FINISHED_PRODUCT)).toBe(false);
  });

  it('R39 — el alta de una receta con un envase como ingrediente se rechaza con action_not_allowed sin escribir', async () => {
    const recipes = repositorio(ORIGINAL_CON_ENVASE);
    const run = createCreateRecipe({ recipes, products: catalogo(), images: almacenamiento(), now: () => AHORA });

    await expect(run(receta([{ productId: ENVASE, percentage: '100.00' }]), ACTOR)).rejects.toBeInstanceOf(
      ActionNotAllowedError,
    );
    expect(recipes.create).not.toHaveBeenCalled();
  });

  it('R39, R42 — el alta de una version con un envase que la original no tenia se rechaza con action_not_allowed sin escribir', async () => {
    const recipes = repositorio(ORIGINAL_CON_ENVASE);
    const run = createCreateRecipeVersion({ recipes, products: catalogo(), now: () => AHORA });

    await expect(
      run(
        ORIGINAL_CON_ENVASE.id,
        { name: 'Otra', lines: [{ productId: MATERIA, percentage: '90.00' }, { productId: ENVASE_NUEVO, percentage: '10.00' }] },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(recipes.createVersion).not.toHaveBeenCalled();
  });

  it('R42 — una version que copia las lineas de una original con un envase se crea', async () => {
    const recipes = repositorio(ORIGINAL_CON_ENVASE);
    const run = createCreateRecipeVersion({ recipes, products: catalogo(), now: () => AHORA });

    await expect(run(ORIGINAL_CON_ENVASE.id, { name: 'Copia' }, ACTOR)).resolves.toEqual({ id: 'version-nueva' });
    expect(recipes.createVersion).toHaveBeenCalledTimes(1);
    const escritas = vi.mocked(recipes.createVersion).mock.calls[0]![1].lines.map((l) => l.productId);
    expect(escritas).toContain(ENVASE);
  });

  it('R42 — una version que repite el envase que ya tenia la original (como lo envia el formulario) se crea', async () => {
    const recipes = repositorio(ORIGINAL_CON_ENVASE);
    const run = createCreateRecipeVersion({ recipes, products: catalogo(), now: () => AHORA });

    await expect(
      run(
        ORIGINAL_CON_ENVASE.id,
        { name: 'Ajustada', lines: [{ productId: MATERIA, percentage: '95.00' }, { productId: ENVASE, percentage: '5.00' }] },
        ACTOR,
      ),
    ).resolves.toEqual({ id: 'version-nueva' });
  });

  it('R40 — editar una receta anadiendo un envase que no tenia se rechaza sin modificarla', async () => {
    const recipes = repositorio({ ...ORIGINAL_CON_ENVASE, lines: [{ id: 'l-1', productId: MATERIA, percentage: '100.00' }] });
    const run = createUpdateRecipe({ recipes, products: catalogo(), images: almacenamiento(), now: () => AHORA });

    await expect(
      run(
        ORIGINAL_CON_ENVASE.id,
        receta([{ productId: MATERIA, percentage: '90.00' }, { productId: ENVASE_NUEVO, percentage: '10.00' }]),
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
  });

  it('P4 — editar una receta que ya tenia un envase como ingrediente lo conserva y se guarda', async () => {
    const recipes = repositorio(ORIGINAL_CON_ENVASE);
    const run = createUpdateRecipe({ recipes, products: catalogo(), images: almacenamiento(), now: () => AHORA });

    await run(
      ORIGINAL_CON_ENVASE.id,
      receta([{ productId: MATERIA, percentage: '85.00' }, { productId: ENVASE, percentage: '15.00' }]),
      ACTOR,
    );
    const writes =
      vi.mocked(recipes.replaceAlive).mock.calls.length + vi.mocked(recipes.replaceAliveWithPropagation).mock.calls.length;
    expect(writes).toBe(1);
  });

  it('R40 — editar una version anadiendo un envase que no tenia se rechaza sin modificarla', async () => {
    const recipes = repositorio({ ...VERSION_CON_ENVASE, lines: [{ id: 'l-1', productId: MATERIA, percentage: '100.00' }] });
    const run = createUpdateRecipeVersion({ recipes, products: catalogo(), now: () => AHORA });

    await expect(
      run(
        VERSION_CON_ENVASE.id,
        { name: 'Sin perfume', lines: [{ productId: MATERIA, percentage: '90.00' }, { productId: ENVASE_NUEVO, percentage: '10.00' }] },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ActionNotAllowedError);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });

  it('P4 — editar una version que ya tenia un envase lo conserva y se guarda', async () => {
    const recipes = repositorio(VERSION_CON_ENVASE);
    const run = createUpdateRecipeVersion({ recipes, products: catalogo(), now: () => AHORA });

    await run(
      VERSION_CON_ENVASE.id,
      { name: 'Sin perfume', lines: [{ productId: MATERIA, percentage: '80.00' }, { productId: ENVASE, percentage: '20.00' }] },
      ACTOR,
    );
    expect(recipes.replaceAlive).toHaveBeenCalledTimes(1);
  });

  it('R39 — PRODUCT y MACHINE siguen entrando como ingrediente en el alta', async () => {
    const recipes = repositorio(ORIGINAL_CON_ENVASE);
    const run = createCreateRecipe({ recipes, products: catalogo(), images: almacenamiento(), now: () => AHORA });

    await run(receta([{ productId: MATERIA, percentage: '60.00' }, { productId: OTRA_MATERIA, percentage: '40.00' }]), ACTOR);
    expect(recipes.create).toHaveBeenCalledTimes(1);
  });
});
