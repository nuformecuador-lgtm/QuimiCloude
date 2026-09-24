// T18 — Validacion de producto solo para las lineas nuevas (`design.md > 6`; pregunta 7
// cerrada por el humano en F1.4). Cierra R45, R46 (junto con lo ya cubierto en
// `recipe-service.test.ts` de Grupo B).
//
// El doble de `ProductCatalog` demuestra explicitamente CON QUE ARGUMENTOS se llama
// `findRefs`: no basta `toHaveBeenCalled`, hay que ver que la linea preexistente NUNCA
// aparece en esos argumentos (R45).

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { createCreateRecipe } from '@/lib/modules/recetas/domain/create-recipe';
import { createGetRecipe } from '@/lib/modules/recetas/domain/get-recipe';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository, RecipeRow } from '@/lib/modules/recetas/ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';

// QC-74 (R16, R18): el actor ya no lleva nombre de rol, lleva el conjunto de permisos.
// Los dos codigos de `recetas`, que es lo que exigen los cinco casos de uso.
const EMPRESA = 'empresa-1';
const ADMIN: Actor = {
  id: 'admin-1',
  companyId: EMPRESA,
  permissions: ['recetas.consultar', 'recetas.modificar'],
};
const AHORA = new Date('2026-09-03T10:00:00.000Z');

const PRODUCTO_VIEJO = '11111111-1111-4111-8111-111111111111'; // ya en la receta, de baja
const PRODUCTO_NUEVO = '22222222-2222-4222-8222-222222222222'; // se anade en esta edicion
const PRODUCTO_NUEVO_DE_BAJA = '33333333-3333-4333-8333-333333333333';

const LINEA_VIEJA = { productId: PRODUCTO_VIEJO, percentage: '60.00' };
const LINEA_NUEVA = { productId: PRODUCTO_NUEVO, percentage: '40.00' };

// `ProductRef` no lleva `stock`; la existencia sale unicamente de `stockByUnit`.
const REF_NUEVO: ProductRef = {
  id: PRODUCTO_NUEVO,
  name: 'Sosa caustica',
  type: 'PRODUCT',
  unitId: null,
  stockByUnit: [],
};

function filaConLineaVieja(): RecipeRow {
  return {
    id: 'receta-1',
    name: 'Desengrasante 5%',
    description: null,
    steps: [],
    imagePath: null,
    createdBy: ADMIN.id,
    updatedBy: ADMIN.id,
    createdAt: AHORA,
    updatedAt: AHORA,
    lines: [{ id: 'linea-1', productId: LINEA_VIEJA.productId, percentage: '100.00' }],
  };
}

function montarRepositorio(overrides: Partial<RecipeRepository> = {}): RecipeRepository {
  return {
    create: vi.fn<RecipeRepository['create']>(async () => ({ id: 'receta-1' })),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(async () => filaConLineaVieja()),
    listAlive: vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 })),
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(async () => 'ok'),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(async () => 'ok'),
    ...overrides,
  };
}

function montarAlmacenamiento(): RecipeImageStorage {
  return {
    upload: vi.fn<RecipeImageStorage['upload']>(async () => 'recetas/nueva.jpg'),
    remove: vi.fn<RecipeImageStorage['remove']>(async () => undefined),
    publicUrl: vi.fn<RecipeImageStorage['publicUrl']>((path) => `https://bucket.example/${path}`),
  };
}

describe('R45 — la linea preexistente se admite sin preguntar al catalogo por ella', () => {
  it('reenviar la linea que ya tenia la receta, con su producto de baja, no la incluye en la consulta al catalogo', async () => {
    const recipes = montarRepositorio();
    const products: ProductCatalog = {
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => []),
      findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
        throw new Error('recetas no debe costear nada');
      }),
    };
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, images, now: () => AHORA });

    // La receta solo reenvia la linea que YA tenia, ahora al 100 %: ningun producto nuevo que validar.
    const lineaViejaCompleta = { productId: LINEA_VIEJA.productId, percentage: '100.00' };
    const resultado = await updateRecipe(
      'receta-1',
      { name: 'Desengrasante 5%', description: null, steps: [], lines: [lineaViejaCompleta] },
      ADMIN,
    );

    expect(resultado.id).toBe('receta-1');
    // No se le pregunta al catalogo por NADA: la unica linea es la preexistente.
    expect(products.findRefs).not.toHaveBeenCalled();
    expect(recipes.replaceAlive).toHaveBeenCalledWith(
      'receta-1',
      expect.objectContaining({ lines: [lineaViejaCompleta] }),
      ADMIN.id,
      AHORA,
      { companyId: EMPRESA },
    );
  });

  it('con una linea vieja y una nueva, findRefs se llama SOLO con el id de la nueva', async () => {
    const recipes = montarRepositorio();
    const products: ProductCatalog = {
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [REF_NUEVO]),
      findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
        throw new Error('recetas no debe costear nada');
      }),
    };
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, images, now: () => AHORA });

    await updateRecipe(
      'receta-1',
      { name: 'Desengrasante 5%', description: null, steps: [], lines: [LINEA_VIEJA, LINEA_NUEVA] },
      ADMIN,
    );

    // Argumentos exactos: ni el id viejo se cuela, ni falta el nuevo.
    expect(products.findRefs).toHaveBeenCalledTimes(1);
    expect(products.findRefs).toHaveBeenCalledWith([PRODUCTO_NUEVO], EMPRESA);
  });
});

describe('R46 — anadir una linea nueva cuyo producto no existe o esta de baja se rechaza', () => {
  it('rechaza la edicion cuando el producto de la linea nueva no viene en findRefs (inexistente o de baja)', async () => {
    const recipes = montarRepositorio();
    const products: ProductCatalog = {
      // El catalogo no devuelve nada para PRODUCTO_NUEVO_DE_BAJA: no existe o esta de baja.
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => []),
      findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
        throw new Error('recetas no debe costear nada');
      }),
    };
    const images = montarAlmacenamiento();
    const updateRecipe = createUpdateRecipe({ recipes, products, images, now: () => AHORA });

    await expect(
      updateRecipe(
        'receta-1',
        {
          name: 'Desengrasante 5%',
          description: null,
          steps: [],
          lines: [LINEA_VIEJA, { productId: PRODUCTO_NUEVO_DE_BAJA, percentage: '40.00' }],
        },
        ADMIN,
      ),
    ).rejects.toThrow();

    expect(products.findRefs).toHaveBeenCalledWith([PRODUCTO_NUEVO_DE_BAJA], EMPRESA);
    expect(recipes.replaceAlive).not.toHaveBeenCalled();
  });

  it('el NULL de una linea MACHINE se admite en el alta', async () => {
    const MAQUINA = '44444444-4444-4444-8444-444444444444';
    const recipes = montarRepositorio();
    const products: ProductCatalog = {
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [
        REF_NUEVO,
        { id: MAQUINA, name: 'Agitador', type: 'MACHINE', unitId: null, stockByUnit: [] },
      ]),
      findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
        throw new Error('recetas no debe costear nada');
      }),
    };
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    // 100 % en definidos + la maquina sin %: el alta pasa y la linea viaja con null.
    await createRecipe(
      {
        name: 'Receta con maquina',
        description: null,
        steps: [],
        lines: [
          { productId: PRODUCTO_NUEVO, percentage: '100.00' },
          { productId: MAQUINA, percentage: null },
        ],
      },
      ADMIN,
    );

    expect(recipes.create).toHaveBeenCalledTimes(1);
    const [datos] = (recipes.create as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { lines: readonly { productId: string; percentage: string | null }[] },
    ];
    expect(datos.lines).toEqual([
      { productId: PRODUCTO_NUEVO, percentage: '100.00' },
      { productId: MAQUINA, percentage: null },
    ]);
  });

  it('el NULL de una linea PRODUCT se rechaza en el alta aunque la suma de definidos de 100', async () => {
    const OTRO_PRODUCTO = '55555555-5555-4555-8555-555555555555';
    const recipes = montarRepositorio();
    const products: ProductCatalog = {
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [
        REF_NUEVO,
        { id: OTRO_PRODUCTO, name: 'Otro insumo', type: 'PRODUCT', unitId: null, stockByUnit: [] },
      ]),
      findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
        throw new Error('recetas no debe costear nada');
      }),
    };
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await expect(
      createRecipe(
        {
          name: 'Receta con producto sin porcentaje',
          description: null,
          steps: [],
          lines: [
            { productId: PRODUCTO_NUEVO, percentage: '100.00' },
            { productId: OTRO_PRODUCTO, percentage: null },
          ],
        },
        ADMIN,
      ),
    ).rejects.toThrow();

    expect(recipes.create).not.toHaveBeenCalled();
  });

  it('en edicion, la linea preexistente NULL sin ref (baja) pasa; la NULL de un PRODUCT vivo se rechaza', async () => {
    const MAQUINA_VIVA = '66666666-6666-4666-8666-666666666666';
    // La receta YA trae una linea NULL cuyo producto esta de baja: el catalogo no la devuelve.
    const filaConMaquinaDeBaja: RecipeRow = {
      ...filaConLineaVieja(),
      lines: [{ id: 'linea-0', productId: PRODUCTO_VIEJO, percentage: null }],
    };
    const products: ProductCatalog = {
      findRefs: vi.fn<ProductCatalog['findRefs']>(async (ids: readonly string[]) =>
        ids.flatMap((id) => {
          if (id === MAQUINA_VIVA) {
            return [{ id, name: 'Agitador', type: 'MACHINE', unitId: null, stockByUnit: [] }];
          }
          if (id === PRODUCTO_NUEVO) return [REF_NUEVO];
          return [];
        }),
      ),
      findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
        throw new Error('recetas no debe costear nada');
      }),
    };
    const images = montarAlmacenamiento();

    const repositorioConMaquina = montarRepositorio({ findAliveById: vi.fn(async () => filaConMaquinaDeBaja) });
    const updateRecipe = createUpdateRecipe({
      recipes: repositorioConMaquina,
      products,
      images,
      now: () => AHORA,
    });

    // Reenviar la linea NULL de baja + sumar la maquina viva NULL: pasa sin escribir de mas.
    await updateRecipe(
      'receta-1',
      {
        name: 'Desengrasante 5%',
        description: null,
        steps: [],
        lines: [
          { productId: PRODUCTO_VIEJO, percentage: null },
          { productId: PRODUCTO_NUEVO, percentage: '100.00' },
          { productId: MAQUINA_VIVA, percentage: null },
        ],
      },
      ADMIN,
    );

    expect(repositorioConMaquina.replaceAlive).toHaveBeenCalledTimes(1);
  });

  it('en el alta se tratan todas las lineas como nuevas: findRefs se llama con todos los ids', async () => {
    const recipes = montarRepositorio();
    const products: ProductCatalog = {
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => [
        REF_NUEVO,
        { id: PRODUCTO_VIEJO, name: 'Acido sulfurico', type: 'PRODUCT', unitId: null, stockByUnit: [] },
      ]),
      findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
        throw new Error('recetas no debe costear nada');
      }),
    };
    const images = montarAlmacenamiento();
    const createRecipe = createCreateRecipe({ recipes, products, images, now: () => AHORA });

    await createRecipe(
      { name: 'Receta nueva', description: null, steps: [], lines: [LINEA_VIEJA, LINEA_NUEVA] },
      ADMIN,
    );

    expect(products.findRefs).toHaveBeenCalledWith([PRODUCTO_VIEJO, PRODUCTO_NUEVO], EMPRESA);
  });
});

describe('R18 — productName del detalle sigue pidiendose sobre TODAS las lineas', () => {
  it('el producto de baja sale con productName null en el detalle, aunque la edicion no lo valide', async () => {
    const recipes = montarRepositorio();
    const products: ProductCatalog = {
      // El detalle SI pregunta por la linea vieja (decora, no valida): no viene -> null.
      findRefs: vi.fn<ProductCatalog['findRefs']>(async () => []),
      findCostingBatches: vi.fn<ProductCatalog['findCostingBatches']>(() => {
        throw new Error('recetas no debe costear nada');
      }),
    };
    const images = montarAlmacenamiento();
    const getRecipe = createGetRecipe({ recipes, products, images });

    const detalle = await getRecipe('receta-1', ADMIN);

    expect(products.findRefs).toHaveBeenCalledWith([PRODUCTO_VIEJO], EMPRESA);
    expect(detalle.lines).toEqual([
      // El producto no vino de `findRefs`, asi que NO hay nada que decorar: `productName`,
      // `productUnitId` y `productStock` salen todos en `null` (R14, R24).
      {
        id: 'linea-1',
        productId: PRODUCTO_VIEJO,
        productName: null,
        percentage: '100.00',
        productUnitId: null,
        productStock: null,
      },
    ]);
  });
});
