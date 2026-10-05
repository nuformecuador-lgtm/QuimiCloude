// Herramientas de la receta en los casos de uso de `recetas`, con dobles de sus puertos.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createCreateRecipeVersion } from '@/lib/modules/recetas/domain/create-recipe-version';
import { UnauthorizedError, ValidationError } from '@/lib/modules/recetas/domain/errors';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { assertToolsValid } from '@/lib/modules/recetas/domain/recipe-tools';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import { createUpdateRecipeVersion } from '@/lib/modules/recetas/domain/update-recipe-version';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';

const EMPRESA = 'empresa-1';
const ACTOR: Actor = { id: 'actor-1', companyId: EMPRESA, permissions: ['recetas.consultar', 'recetas.modificar'] };
const SOLO_CONSULTA: Actor = { ...ACTOR, permissions: ['recetas.consultar'] };
const AHORA = new Date('2026-10-03T10:00:00.000Z');

const INGREDIENTE = '11111111-1111-4111-8111-111111111111';
const BATIDORA = '22222222-2222-4222-8222-222222222222';
const MEZCLADORA = '33333333-3333-4333-8333-333333333333';
/** Producto MACHINE que el catalogo ya no devuelve: dado de baja, de otra empresa o inexistente. */
const DE_BAJA = '44444444-4444-4444-8444-444444444444';
const ENVASE = '55555555-5555-4555-8555-555555555555';

function ref(id: string, type: ProductRef['type']): ProductRef {
  return { id, name: `producto ${id.slice(0, 4)}`, unitId: null, stockByUnit: [], type };
}

const VIVOS: readonly ProductRef[] = [
  ref(INGREDIENTE, 'PRODUCT'),
  ref(BATIDORA, 'MACHINE'),
  ref(MEZCLADORA, 'MACHINE'),
  ref(ENVASE, 'PACKAGING'),
];

const LINEAS = [{ productId: INGREDIENTE, percentage: '100.00' }];

const ORIGINAL: RecipeRow = {
  id: 'original-1',
  name: 'Crema base',
  description: null,
  steps: [],
  packingSteps: [],
  imagePath: null,
  createdBy: 'actor-1',
  updatedBy: 'actor-1',
  createdAt: AHORA,
  updatedAt: AHORA,
  lines: [{ id: 'l-1', productId: INGREDIENTE, percentage: '100.00' }],
  tools: [
    { id: 't-1', productId: BATIDORA, quantity: 2 },
    { id: 't-2', productId: DE_BAJA, quantity: 1 },
  ],
  original: null,
};

const VERSION: RecipeRow = {
  ...ORIGINAL,
  id: 'version-1',
  name: 'Sin perfume',
  original: { id: ORIGINAL.id, name: ORIGINAL.name, description: null, imagePath: null, packingSteps: [], steps: [] },
};

function repositorio(row: RecipeRow = ORIGINAL): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'nueva' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => row),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    createVersion: vi.fn<RecipeRepository['createVersion']>(async () => ({ id: 'version-nueva' })),
    listAliveVersions: vi.fn<RecipeRepository['listAliveVersions']>(async () => []),
    replaceAliveWithPropagation: vi.fn<RecipeRepository['replaceAliveWithPropagation']>(async () => ({
      kind: 'ok',
      propagated: [],
    })),
  };
}

function catalogo(refs: readonly ProductRef[] = VIVOS): ProductCatalog {
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

function imagenes(): RecipeImageStorage {
  return {
    upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/x.jpg'),
    remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => `https://cdn/${path}`),
  };
}

function montar(row: RecipeRow = ORIGINAL, refs: readonly ProductRef[] = VIVOS) {
  const recipes = repositorio(row);
  const products = catalogo(refs);
  const images = imagenes();
  return {
    recipes,
    products,
    create: createCreateRecipe({ recipes, products, images, now: () => AHORA }),
    update: createUpdateRecipe({ recipes, products, images, now: () => AHORA }),
    createVersion: createCreateRecipeVersion({ recipes, products, now: () => AHORA }),
    updateVersion: createUpdateRecipeVersion({ recipes, products, now: () => AHORA }),
    get: createGetRecipe({ recipes, products, images }),
  };
}

const RECETA = { name: 'Crema', steps: [], lines: LINEAS };
const VERSION_INPUT = { name: 'Intensa', lines: LINEAS };

/** Ids que el caso de uso pidio al catalogo, en todas sus llamadas. */
function pedidos(products: ProductCatalog): readonly string[] {
  return vi.mocked(products.findRefs).mock.calls.flatMap(([ids]) => [...ids]);
}

describe('assertToolsValid', () => {
  it('R3: una herramienta nueva que no es MACHINE es invalida', async () => {
    for (const id of [INGREDIENTE, ENVASE]) {
      await expect(assertToolsValid([{ productId: id, quantity: 1 }], [], catalogo(), EMPRESA)).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
  });

  it('R5: una herramienta nueva que el catalogo no devuelve (inexistente, de otra empresa o de baja) es invalida', async () => {
    await expect(
      assertToolsValid([{ productId: DE_BAJA, quantity: 1 }], [], catalogo(), EMPRESA),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('R19: la que ya estaba no se consulta, aunque este de baja', async () => {
    const products = catalogo();
    await assertToolsValid(
      [
        { productId: DE_BAJA, quantity: 3 },
        { productId: BATIDORA, quantity: 1 },
      ],
      [{ productId: DE_BAJA }],
      products,
      EMPRESA,
    );
    expect(products.findRefs).toHaveBeenCalledTimes(1);
    expect(products.findRefs).toHaveBeenCalledWith([BATIDORA], EMPRESA);
  });

  it('sin herramientas nuevas no consulta el catalogo', async () => {
    const products = catalogo();
    await assertToolsValid([{ productId: BATIDORA, quantity: 9 }], [{ productId: BATIDORA }], products, EMPRESA);
    await assertToolsValid([], [], products, EMPRESA);
    expect(products.findRefs).not.toHaveBeenCalled();
  });
});

describe('createRecipe con herramientas', () => {
  it('R1: pasa las herramientas validadas al repositorio', async () => {
    const { recipes, create } = montar();
    const tools = [
      { productId: BATIDORA, quantity: 2 },
      { productId: MEZCLADORA, quantity: 1 },
    ];
    await create({ ...RECETA, tools }, ACTOR);
    expect(vi.mocked(recipes.create).mock.calls[0]?.[0].tools).toEqual(tools);
  });

  it('R2: sin tools llega [] al repositorio', async () => {
    const { recipes, create } = montar();
    await create(RECETA, ACTOR);
    expect(vi.mocked(recipes.create).mock.calls[0]?.[0].tools).toEqual([]);
  });

  it('R3: una herramienta que no es MACHINE da ValidationError sin llamar al repositorio', async () => {
    const { recipes, create } = montar();
    await expect(create({ ...RECETA, tools: [{ productId: ENVASE, quantity: 1 }] }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(recipes.create).not.toHaveBeenCalled();
  });

  it('R5: una herramienta inexistente, de otra empresa o de baja da ValidationError sin llamar al repositorio', async () => {
    const { recipes, create } = montar();
    await expect(create({ ...RECETA, tools: [{ productId: DE_BAJA, quantity: 1 }] }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(recipes.create).not.toHaveBeenCalled();
  });
});

describe('updateRecipe con herramientas', () => {
  it('R17: sin tools llega tools null al repositorio y no consulta el catalogo por herramientas', async () => {
    const { recipes, products, update } = montar();
    await update(ORIGINAL.id, RECETA, ACTOR);
    expect(vi.mocked(recipes.replaceAlive).mock.calls[0]?.[1].tools).toBeNull();
    expect(pedidos(products)).not.toContain(BATIDORA);
  });

  it('R17: con [] llega [] (quitarlas todas)', async () => {
    const { recipes, update } = montar();
    await update(ORIGINAL.id, { ...RECETA, tools: [] }, ACTOR);
    expect(vi.mocked(recipes.replaceAlive).mock.calls[0]?.[1].tools).toEqual([]);
  });

  it('R19: conserva la preexistente de baja y solo valida la nueva', async () => {
    const { recipes, products, update } = montar();
    const tools = [
      { productId: DE_BAJA, quantity: 1 },
      { productId: BATIDORA, quantity: 5 },
      { productId: MEZCLADORA, quantity: 1 },
    ];
    await update(ORIGINAL.id, { ...RECETA, tools }, ACTOR);
    expect(vi.mocked(recipes.replaceAlive).mock.calls[0]?.[1].tools).toEqual(tools);
    expect(pedidos(products)).toContain(MEZCLADORA);
    expect(pedidos(products)).not.toContain(DE_BAJA);
    expect(pedidos(products)).not.toContain(BATIDORA);
  });

  it('R3, R5: una nueva que no es MACHINE o no esta viva da ValidationError sin escribir', async () => {
    for (const productId of [ENVASE, '66666666-6666-4666-8666-666666666666']) {
      const { recipes, update } = montar();
      await expect(update(ORIGINAL.id, { ...RECETA, tools: [{ productId, quantity: 1 }] }, ACTOR)).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(recipes.replaceAlive).not.toHaveBeenCalled();
      expect(recipes.replaceAliveWithPropagation).not.toHaveBeenCalled();
    }
  });

  it('R14: con propagacion pasa las herramientas a replaceAliveWithPropagation', async () => {
    const { recipes, update } = montar();
    const tools = [{ productId: BATIDORA, quantity: 4 }];
    await update(
      ORIGINAL.id,
      { ...RECETA, tools, propagateToVersionIds: ['77777777-7777-4777-8777-777777777777'] },
      ACTOR,
    );
    expect(vi.mocked(recipes.replaceAliveWithPropagation).mock.calls[0]?.[1].tools).toEqual(tools);
  });
});

describe('createRecipeVersion con herramientas', () => {
  it('R11: sin tools copia las de la original, incluida la de baja, sin consultarlas al catalogo', async () => {
    const { recipes, products, createVersion } = montar();
    await createVersion(ORIGINAL.id, VERSION_INPUT, ACTOR);
    expect(vi.mocked(recipes.createVersion).mock.calls[0]?.[1].tools).toEqual([
      { productId: BATIDORA, quantity: 2 },
      { productId: DE_BAJA, quantity: 1 },
    ]);
    expect(pedidos(products)).not.toContain(BATIDORA);
    expect(pedidos(products)).not.toContain(DE_BAJA);
  });

  it('R12: con tools solo valida las que no estan en la original', async () => {
    const { recipes, products, createVersion } = montar();
    const tools = [
      { productId: DE_BAJA, quantity: 7 },
      { productId: MEZCLADORA, quantity: 1 },
    ];
    await createVersion(ORIGINAL.id, { ...VERSION_INPUT, tools }, ACTOR);
    expect(vi.mocked(recipes.createVersion).mock.calls[0]?.[1].tools).toEqual(tools);
    expect(pedidos(products)).toContain(MEZCLADORA);
    expect(pedidos(products)).not.toContain(DE_BAJA);
  });

  it('R3: una nueva que no es MACHINE da ValidationError sin crear la version', async () => {
    const { recipes, createVersion } = montar();
    await expect(
      createVersion(ORIGINAL.id, { ...VERSION_INPUT, tools: [{ productId: INGREDIENTE, quantity: 1 }] }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(recipes.createVersion).not.toHaveBeenCalled();
  });

  it('R11: con tools [] la version nace sin herramientas', async () => {
    const { recipes, createVersion } = montar();
    await createVersion(ORIGINAL.id, { ...VERSION_INPUT, tools: [] }, ACTOR);
    expect(vi.mocked(recipes.createVersion).mock.calls[0]?.[1].tools).toEqual([]);
  });
});

describe('updateRecipeVersion con herramientas', () => {
  it('R17: sin tools llega null; con [] llega []', async () => {
    const { recipes, updateVersion } = montar(VERSION);
    await updateVersion(VERSION.id, VERSION_INPUT, ACTOR);
    await updateVersion(VERSION.id, { ...VERSION_INPUT, tools: [] }, ACTOR);
    const calls = vi.mocked(recipes.replaceAlive).mock.calls;
    expect(calls[0]?.[1].tools).toBeNull();
    expect(calls[1]?.[1].tools).toEqual([]);
  });

  it('R13, R19: valida solo contra las de la propia version y conserva la de baja', async () => {
    const { recipes, products, updateVersion } = montar(VERSION);
    const tools = [
      { productId: DE_BAJA, quantity: 1 },
      { productId: MEZCLADORA, quantity: 3 },
    ];
    await updateVersion(VERSION.id, { ...VERSION_INPUT, tools }, ACTOR);
    expect(vi.mocked(recipes.replaceAlive).mock.calls[0]?.[0]).toBe(VERSION.id);
    expect(vi.mocked(recipes.replaceAlive).mock.calls[0]?.[1].tools).toEqual(tools);
    expect(pedidos(products)).not.toContain(DE_BAJA);
  });

  it('R5: una nueva de baja da ValidationError sin escribir', async () => {
    const { recipes, updateVersion } = montar({ ...VERSION, tools: [] });
    await expect(
      updateVersion(VERSION.id, { ...VERSION_INPUT, tools: [{ productId: DE_BAJA, quantity: 1 }] }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });
});

describe('R32: sin recetas.modificar ninguna escritura con herramientas llega al repositorio', () => {
  const tools = [{ productId: BATIDORA, quantity: 1 }];
  const casos: ReadonlyArray<readonly [string, (m: ReturnType<typeof montar>, actor: Actor | null) => Promise<unknown>]> = [
    ['createRecipe', (m, actor) => m.create({ ...RECETA, tools }, actor)],
    ['updateRecipe', (m, actor) => m.update(ORIGINAL.id, { ...RECETA, tools }, actor)],
    ['createRecipeVersion', (m, actor) => m.createVersion(ORIGINAL.id, { ...VERSION_INPUT, tools }, actor)],
    ['updateRecipeVersion', (m, actor) => m.updateVersion(VERSION.id, { ...VERSION_INPUT, tools }, actor)],
  ];

  for (const [nombre, llamar] of casos) {
    it.each([
      ['sin actor', null],
      ['solo con recetas.consultar', SOLO_CONSULTA],
    ])(`R32: ${nombre} %s rechaza sin tocar repositorio ni catalogo`, async (_caso, actor) => {
      const m = montar();
      await expect(llamar(m, actor)).rejects.toBeInstanceOf(UnauthorizedError);
      for (const fn of Object.values(m.recipes)) expect(fn).not.toHaveBeenCalled();
      expect(m.products.findRefs).not.toHaveBeenCalled();
    });
  }
});

describe('getRecipe con herramientas', () => {
  it('R20: devuelve las herramientas en orden con su nombre, la de baja con productName null, en un solo findRefs', async () => {
    const { products, get } = montar();
    const detalle = await get(ORIGINAL.id, ACTOR);

    expect(detalle.tools).toEqual([
      { id: 't-1', productId: BATIDORA, productName: `producto ${BATIDORA.slice(0, 4)}`, quantity: 2 },
      { id: 't-2', productId: DE_BAJA, productName: null, quantity: 1 },
    ]);
    expect(products.findRefs).toHaveBeenCalledTimes(1);
    expect([...(vi.mocked(products.findRefs).mock.calls[0]?.[0] ?? [])].sort()).toEqual(
      [INGREDIENTE, BATIDORA, DE_BAJA].sort(),
    );
  });

  it('R22: una version devuelve sus propias herramientas, no las de la original', async () => {
    const propia: RecipeRow = { ...VERSION, tools: [{ id: 't-9', productId: MEZCLADORA, quantity: 6 }] };
    const { get } = montar(propia);
    const detalle = await get(VERSION.id, ACTOR);
    expect(detalle.tools.map((t) => [t.productId, t.quantity])).toEqual([[MEZCLADORA, 6]]);
  });
});
