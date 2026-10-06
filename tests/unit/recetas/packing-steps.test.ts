// Pasos de envasado en los casos de uso de `recetas`, con dobles de sus puertos: alta y edicion
// los pasan al repositorio en orden y separados de `steps`, una version nunca guarda propios y
// lee los de su original, y sin `recetas.modificar` no se toca ningun puerto.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createCreateRecipeVersion } from '@/lib/modules/recetas/domain/create-recipe-version';
import { UnauthorizedError } from '@/lib/modules/recetas/domain/errors';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import { createUpdateRecipeVersion } from '@/lib/modules/recetas/domain/update-recipe-version';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';

const EMPRESA = 'empresa-1';
const ACTOR: Actor = { id: 'actor-1', companyId: EMPRESA, permissions: ['recetas.consultar', 'recetas.modificar'] };
const SIN_MODIFICAR: Actor = { ...ACTOR, permissions: ['recetas.consultar'] };
const AHORA = new Date('2026-10-05T10:00:00.000Z');

const P_A = '11111111-1111-4111-8111-111111111111';
const P_B = '22222222-2222-4222-8222-222222222222';
const V_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function paso(text: string) {
  return { blocks: [{ kind: 'paragraph' as const, spans: [{ text }] }] };
}

const MEZCLAR = paso('Mezclar en frio');
const ENVASAR = paso('Envasar en garrafas de 5 L');
const ETIQUETAR = { blocks: [{ kind: 'checklist' as const, items: [{ spans: [{ text: 'Etiqueta con lote', bold: true }] }] }] };
const SELLAR = paso('Sellar la tapa');

const LINEAS = [
  { productId: P_A, percentage: '60.00' },
  { productId: P_B, percentage: '40.00' },
];

const ORIGINAL: RecipeRow = {
  id: 'original-1',
  name: 'Crema base',
  description: null,
  steps: [MEZCLAR],
  packingSteps: [ENVASAR, ETIQUETAR],
  imagePath: null,
  createdBy: null,
  updatedBy: null,
  createdAt: AHORA,
  updatedAt: AHORA,
  lines: [
    { id: 'l-1', productId: P_A, percentage: '60.00' },
    { id: 'l-2', productId: P_B, percentage: '40.00' },
  ],
  tools: [],
  original: null,
};

const VERSION: RecipeRow = {
  ...ORIGINAL,
  id: 'version-1',
  name: 'Sin perfume',
  steps: [],
  packingSteps: [],
  original: {
    id: ORIGINAL.id,
    name: ORIGINAL.name,
    description: null,
    imagePath: null,
    steps: [MEZCLAR],
    packingSteps: [ENVASAR, ETIQUETAR],
  },
};

function repositorio(fila: RecipeRow | null): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'nueva' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => fila),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    createVersion: vi.fn<RecipeRepository['createVersion']>(async () => ({ id: 'version-nueva' })),
    listAliveVersions: vi.fn<RecipeRepository['listAliveVersions']>(async () => []),
    replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(async () => ({
      kind: 'ok',
      propagated: [{ versionId: V_1, isUnderReview: false }],
    })),
  };
}

function montar(fila: RecipeRow | null = ORIGINAL) {
  const recipes = repositorio(fila);
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
  const deps = { recipes, products, images, now: () => AHORA };
  return {
    recipes,
    products,
    images,
    create: createCreateRecipe(deps),
    update: createUpdateRecipe(deps),
    get: createGetRecipe(deps),
    createVersion: createCreateRecipeVersion(deps),
    updateVersion: createUpdateRecipeVersion(deps),
  };
}

const ENTRADA = { name: 'Crema base', steps: [MEZCLAR], lines: LINEAS };

describe('alta y edicion pasan los pasos de envasado al repositorio', () => {
  it('R4: el alta los pasa en el orden recibido y separados de steps', async () => {
    const { recipes, create } = montar();

    await create({ ...ENTRADA, packingSteps: [SELLAR, ENVASAR, ETIQUETAR] }, ACTOR);

    const datos = vi.mocked(recipes.create).mock.calls[0]?.[0];
    expect(datos?.packingSteps).toEqual([SELLAR, ENVASAR, ETIQUETAR]);
    expect(datos?.steps).toEqual([MEZCLAR]);
  });

  it('R4: el alta sin packingSteps pasa una lista vacia', async () => {
    const { recipes, create } = montar();

    await create(ENTRADA, ACTOR);

    expect(vi.mocked(recipes.create).mock.calls[0]?.[0].packingSteps).toEqual([]);
  });

  it('R4: la edicion sin propagacion los pasa a replaceAlive en orden', async () => {
    const { recipes, update } = montar();

    await update(ORIGINAL.id, { ...ENTRADA, packingSteps: [ETIQUETAR, SELLAR] }, ACTOR);

    const datos = vi.mocked(recipes.replaceAlive).mock.calls[0]?.[1];
    expect(datos?.packingSteps).toEqual([ETIQUETAR, SELLAR]);
    expect(datos?.steps).toEqual([MEZCLAR]);
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
  });

  it('R4: la edicion con propagacion a versiones los pasa a replaceAliveWithPropagation en orden', async () => {
    const { recipes, update } = montar();

    await update(ORIGINAL.id, { ...ENTRADA, packingSteps: [SELLAR, ENVASAR], propagateToVersionIds: [V_1] }, ACTOR);

    const datos = vi.mocked(recipes.replaceAliveWithPropagation).mock.calls[0]?.[1];
    expect(datos?.packingSteps).toEqual([SELLAR, ENVASAR]);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });

  it('R1: la edicion que omite packingSteps los deja en lista vacia', async () => {
    const { recipes, update } = montar();

    await update(ORIGINAL.id, ENTRADA, ACTOR);

    expect(vi.mocked(recipes.replaceAlive).mock.calls[0]?.[1].packingSteps).toEqual([]);
  });
});

describe('versiones', () => {
  it('R10: editar una version escribe packingSteps: [] aunque la entrada los traiga', async () => {
    const { recipes, updateVersion } = montar(VERSION);

    await updateVersion(VERSION.id, { name: 'Sin perfume', lines: LINEAS, packingSteps: [SELLAR] }, ACTOR);

    const datos = vi.mocked(recipes.replaceAlive).mock.calls[0]?.[1];
    expect(datos?.packingSteps).toEqual([]);
    expect(datos?.steps).toEqual([]);
  });

  it('R10: crear una version no pasa ningun paso de envasado al repositorio aunque la entrada los traiga', async () => {
    const { recipes, createVersion } = montar(ORIGINAL);

    await createVersion(ORIGINAL.id, { name: 'Sin perfume', packingSteps: [SELLAR] }, ACTOR);

    const datos = vi.mocked(recipes.createVersion).mock.calls[0]?.[1];
    expect(datos).toBeDefined();
    expect(datos).not.toHaveProperty('packingSteps');
    expect(JSON.stringify(datos)).not.toContain('Sellar');
  });

  it('R11: el detalle de una version devuelve los pasos de envasado de su original', async () => {
    const { get } = montar(VERSION);

    const detalle = await get(VERSION.id, ACTOR);

    expect(detalle.packingSteps).toEqual([ENVASAR, ETIQUETAR]);
    expect(detalle.steps).toEqual([MEZCLAR]);
  });

  it('R4: el detalle de una original devuelve sus dos listas intactas y separadas', async () => {
    const { get } = montar(ORIGINAL);

    const detalle = await get(ORIGINAL.id, ACTOR);

    expect(detalle.packingSteps).toEqual([ENVASAR, ETIQUETAR]);
    expect(detalle.steps).toEqual([MEZCLAR]);
  });
});

describe('autorizacion', () => {
  it('R6: sin recetas.modificar el alta con pasos de envasado se rechaza sin tocar ningun puerto', async () => {
    const { recipes, products, images, create } = montar();

    await expect(create({ ...ENTRADA, packingSteps: [ENVASAR] }, SIN_MODIFICAR)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(recipes.create).not.toHaveBeenCalled();
    expect(products.findRefs).not.toHaveBeenCalled();
    expect(images.upload).not.toHaveBeenCalled();
  });

  it('R6: sin recetas.modificar la edicion se rechaza antes de validar, incluso con una entrada invalida', async () => {
    const { recipes, products, images, update } = montar();

    await expect(
      update(ORIGINAL.id, { ...ENTRADA, packingSteps: 'no es una lista' }, SIN_MODIFICAR),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(recipes.findAliveById).not.toHaveBeenCalled();
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
    expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
    expect(products.findRefs).not.toHaveBeenCalled();
    expect(images.upload).not.toHaveBeenCalled();
  });
});
