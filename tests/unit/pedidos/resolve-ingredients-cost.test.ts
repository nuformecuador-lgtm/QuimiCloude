// tests/unit/pedidos/resolve-ingredients-cost.test.ts
//
// `resolveIngredientsCost` es el orquestador entre los tres catalogos (`recetas`, `inventario`,
// `unidades`) y el calculo puro de `order-cost.ts`. Los dobles son `vi.fn()` porque lo que
// importa aqui es CUANTAS VECES y CON QUE se llama a cada catalogo, no solo el resultado.

import { describe, expect, it, vi } from 'vitest';

import { resolveIngredientsCost, resolveLotIngredientsCost } from '@/lib/modules/pedidos/domain/resolve-ingredients-cost';

import type { CostingBatch, ProductCatalog, ProductRef } from '@/lib/modules/inventario';
import type { RecipeCatalog, RecipeExecutionContent } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitConversion } from '@/lib/modules/unidades';

const COMPANY_ID = 'company-1';
const RECIPE_ID = 'recipe-1';
const PRODUCT_A = 'product-a';

const LITRO: UnitConversion = { id: 'l', baseUnitId: null, factor: null };

function contenido(overrides: Partial<RecipeExecutionContent> = {}): RecipeExecutionContent {
  return {
    id: RECIPE_ID,
    name: 'Receta de prueba',
    isDeleted: false,
    steps: [],
    lines: [{ productId: PRODUCT_A, productName: null, percentage: '100.00' }],
    ...overrides,
  };
}

function catalogoDeRecetas(content: RecipeExecutionContent | null = contenido()) {
  const findExecutionContentById = vi.fn(async () => content);
  const findRefsIncludingDeleted = vi.fn(async () => []);
  const findIdsMatchingName = vi.fn(async () => null);
  const findAliveByNormalizedName = vi.fn(async () => null);
  return {
    recipes: {
      findExecutionContentById,
      findRefsIncludingDeleted,
      findIdsMatchingName,
      findAliveByNormalizedName,
    } as RecipeCatalog,
    findExecutionContentById,
  };
}

function catalogoDeProductos(
  refs: readonly ProductRef[] = [{ id: PRODUCT_A, name: 'A', unitId: LITRO.id, stockByUnit: [], type: 'PRODUCT' }],
  batches: readonly CostingBatch[] = [],
) {
  const findRefs = vi.fn(async () => refs);
  const findCostingBatches = vi.fn(async () => batches);
  const findFinishedGoodsReceipts = vi.fn(async () => []);
  return {
    products: { findRefs, findCostingBatches, findFinishedGoodsReceipts } as ProductCatalog,
    findRefs,
    findCostingBatches,
  };
}

function catalogoDeUnidades(unidades: ReadonlyMap<string, UnitConversion> = new Map([[LITRO.id, LITRO]])) {
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const unidad = unidades.get(id);
      return unidad === undefined ? [] : [unidad];
    }),
  );
  const findRefsSharingBaseInCompany = vi.fn(async () => []);
  return { units: { findRefs, findRefsSharingBaseInCompany } as unknown as UnitCatalog, findRefs };
}

function lote(overrides: Partial<CostingBatch> = {}): CostingBatch {
  const stock = overrides.stock ?? '50.0000';
  return {
    productId: PRODUCT_A,
    lot: '1',
    stock,
    unitCost: '2.0000',
    unitId: LITRO.id,
    purchaseDate: '2026-01-01',
    available: stock,
    ...overrides,
  };
}

describe('resolveIngredientsCost', () => {
  it('pedido 200, 10 % de un insumo en L con un lote de 50 L a 2,0000 -> 40,0000 (R13, R15)', async () => {
    const cat = catalogoDeRecetas(
      contenido({ lines: [{ productId: PRODUCT_A, productName: null, percentage: '10.00' }] }),
    );
    const prod = catalogoDeProductos(
      [{ id: PRODUCT_A, name: 'A', unitId: LITRO.id, stockByUnit: [], type: 'PRODUCT' }],
      [lote({ stock: '50.0000', unitCost: '2.0000' })],
    );
    const uni = catalogoDeUnidades();

    const resultado = await resolveIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
    );

    expect(resultado).toBe('40.0000');
  });

  it('receta sin lineas devuelve sin importe (R16)', async () => {
    const cat = catalogoDeRecetas(contenido({ lines: [] }));
    const prod = catalogoDeProductos();
    const uni = catalogoDeUnidades();

    const resultado = await resolveIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
    );

    expect(resultado).toBeNull();
    // Sin lineas no hay producto ni unidad que resolver.
    expect(prod.findRefs).toHaveBeenCalledWith([], COMPANY_ID);
  });

  it('existencia insuficiente devuelve sin importe (R16)', async () => {
    const cat = catalogoDeRecetas();
    const prod = catalogoDeProductos(
      [{ id: PRODUCT_A, name: 'A', unitId: LITRO.id, stockByUnit: [], type: 'PRODUCT' }],
      [lote({ stock: '1.0000', unitCost: '2.0000' })],
    );
    const uni = catalogoDeUnidades();

    const resultado = await resolveIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
    );

    expect(resultado).toBeNull();
  });

  it('una linea de un insumo sin lotes -unidad `null`- devuelve sin importe', async () => {
    const cat = catalogoDeRecetas();
    // `findRefs` no devuelve nada para ese producto: sin lotes, sin `ProductRef`.
    const prod = catalogoDeProductos([], [lote()]);
    const uni = catalogoDeUnidades();

    const resultado = await resolveIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
    );

    expect(resultado).toBeNull();
  });

  it('los lotes en una unidad hermana se siguen convirtiendo', async () => {
    const KILOGRAMO: UnitConversion = { id: 'kg', baseUnitId: 'g', factor: '1000.0000' };
    const GRAMO: UnitConversion = { id: 'g', baseUnitId: null, factor: null };
    const cat = catalogoDeRecetas(
      contenido({ lines: [{ productId: PRODUCT_A, productName: null, percentage: '10.00' }] }),
    );
    const prod = catalogoDeProductos(
      [{ id: PRODUCT_A, name: 'A', unitId: GRAMO.id, stockByUnit: [], type: 'PRODUCT' }],
      [lote({ unitId: KILOGRAMO.id, stock: '2.0000', unitCost: '5.0000' })],
    );
    const uni = catalogoDeUnidades(new Map([[GRAMO.id, GRAMO], [KILOGRAMO.id, KILOGRAMO]]));

    // necesaria = 200 * 10 / 100 = 20 g; el lote trae 2 kg = 2000 g a 5.0000/kg = 0.005/g.
    const resultado = await resolveIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
    );

    expect(resultado).toBe('0.1000');
  });

  it('el numero de llamadas a cada catalogo no crece con el numero de lineas', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({
      productId: `${PRODUCT_A}-${i % 4}`,
      productName: null,
      percentage: '5.00',
    }));
    const refs = Array.from({ length: 4 }, (_, i) => ({
      id: `${PRODUCT_A}-${i}`,
      name: `producto ${i}`,
      unitId: LITRO.id,
      stockByUnit: [],
      type: 'PRODUCT' as const,
    }));
    const batches = Array.from({ length: 4 }, (_, i) =>
      lote({ productId: `${PRODUCT_A}-${i}`, stock: '1000.0000', unitCost: '1.0000' }),
    );
    const cat = catalogoDeRecetas(contenido({ lines }));
    const prod = catalogoDeProductos(refs, batches);
    const uni = catalogoDeUnidades();

    await resolveIngredientsCost(cat.recipes, prod.products, uni.units, RECIPE_ID, '200.0000', COMPANY_ID);

    expect(cat.findExecutionContentById).toHaveBeenCalledTimes(1);
    expect(prod.findRefs).toHaveBeenCalledTimes(1);
    expect(prod.findCostingBatches).toHaveBeenCalledTimes(1);
    expect(uni.findRefs).toHaveBeenCalledTimes(1);
  });

  it('la misma receta con pedidos de 200 y 300 da cantidades consumidas en proporcion 2:3 (R21)', async () => {
    const cat = catalogoDeRecetas(
      contenido({ lines: [{ productId: PRODUCT_A, productName: null, percentage: '10.00' }] }),
    );
    const prod = catalogoDeProductos(
      [{ id: PRODUCT_A, name: 'A', unitId: LITRO.id, stockByUnit: [], type: 'PRODUCT' }],
      [lote({ stock: '1000.0000', unitCost: '1.0000' })],
    );
    const uni = catalogoDeUnidades();

    const con200 = await resolveIngredientsCost(cat.recipes, prod.products, uni.units, RECIPE_ID, '200.0000', COMPANY_ID);
    const con300 = await resolveIngredientsCost(cat.recipes, prod.products, uni.units, RECIPE_ID, '300.0000', COMPANY_ID);

    // 200 * 10 % = 20 -> 20.0000; 300 * 10 % = 30 -> 30.0000; misma proporcion que las cantidades
    // de pedido (2:3), con los mismos porcentajes.
    expect(con200).toBe('20.0000');
    expect(con300).toBe('30.0000');
  });

  it('sin `options.orderId` pide los lotes sin excluir ningun pedido; con el, lo reenvia como `excludeOrderId` (R65)', async () => {
    const cat = catalogoDeRecetas();
    const prod = catalogoDeProductos([{ id: PRODUCT_A, name: 'A', unitId: LITRO.id, stockByUnit: [], type: 'PRODUCT' }], [lote()]);
    const uni = catalogoDeUnidades();

    await resolveIngredientsCost(cat.recipes, prod.products, uni.units, RECIPE_ID, '200.0000', COMPANY_ID);
    expect(prod.findCostingBatches).toHaveBeenLastCalledWith([PRODUCT_A], COMPANY_ID, { excludeOrderId: undefined });

    await resolveIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
      { orderId: 'pedido-1' },
    );
    expect(prod.findCostingBatches).toHaveBeenLastCalledWith([PRODUCT_A], COMPANY_ID, { excludeOrderId: 'pedido-1' });
  });
});

// `resolveLotIngredientsCost`: la hermana que orquesta las mismas lecturas pero
// termina en `calculateLotIngredientsCost` -un ingrediente sin costo cuenta cero- en vez de
// `calculateIngredientsCost`. Comparte firma completa, incluido `options.orderId`: el
// pedido que se finaliza tiene su propio material apartado, que cuenta como disponible para si.
describe('resolveLotIngredientsCost', () => {
  it('pedido 200, 10 % de un insumo en L con un lote de 50 L a 2,0000 -> 40,0000, igual que resolveIngredientsCost', async () => {
    const cat = catalogoDeRecetas(
      contenido({ lines: [{ productId: PRODUCT_A, productName: null, percentage: '10.00' }] }),
    );
    const prod = catalogoDeProductos(
      [{ id: PRODUCT_A, name: 'A', unitId: LITRO.id, stockByUnit: [], type: 'PRODUCT' }],
      [lote({ stock: '50.0000', unitCost: '2.0000' })],
    );
    const uni = catalogoDeUnidades();

    const resultado = await resolveLotIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
    );

    expect(resultado).toBe('40.0000');
  });

  it('un insumo sin existencia disponible cuenta cero y el resultado nunca es nulo (R42)', async () => {
    const cat = catalogoDeRecetas();
    const prod = catalogoDeProductos(
      [{ id: PRODUCT_A, name: 'A', unitId: LITRO.id, stockByUnit: [], type: 'PRODUCT' }],
      [lote({ stock: '1.0000', unitCost: '2.0000' })],
    );
    const uni = catalogoDeUnidades();

    // El disponible (1) no cubre lo necesario (200): resolveIngredientsCost da null, la hermana
    // cuenta cero y devuelve '0.0000'.
    const resultado = await resolveLotIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
    );

    expect(resultado).toBe('0.0000');
  });

  it('receta sin lineas da 0.0000, no null', async () => {
    const cat = catalogoDeRecetas(contenido({ lines: [] }));
    const prod = catalogoDeProductos();
    const uni = catalogoDeUnidades();

    const resultado = await resolveLotIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
    );

    expect(resultado).toBe('0.0000');
  });

  it('reenvia options.orderId a findCostingBatches como excludeOrderId (C5: el pedido a finalizar cuenta su propio apartado como disponible)', async () => {
    const cat = catalogoDeRecetas();
    const prod = catalogoDeProductos([{ id: PRODUCT_A, name: 'A', unitId: LITRO.id, stockByUnit: [], type: 'PRODUCT' }], [lote()]);
    const uni = catalogoDeUnidades();

    await resolveLotIngredientsCost(
      cat.recipes,
      prod.products,
      uni.units,
      RECIPE_ID,
      '200.0000',
      COMPANY_ID,
      { orderId: 'pedido-1' },
    );

    expect(prod.findCostingBatches).toHaveBeenLastCalledWith([PRODUCT_A], COMPANY_ID, { excludeOrderId: 'pedido-1' });
  });
});
