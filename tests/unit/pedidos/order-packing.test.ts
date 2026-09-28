// `createStartPacking`: implementa `OrderCatalog['startPackingAliveById']` sobre
// `OrderPackingRepository`, un simple `UPDATE` condicional fuera de la unidad de trabajo.
//
// `createFinishPacking` (T14, R17-R21): implementa `OrderCatalog['finishPackingAliveById']`
// sobre la unidad de trabajo compartida con `inventario`. Doble de `OrderUnitOfWork` y de los
// catalogos globales, sin base de datos: lo que se prueba es el ORDEN de llamadas, el coste
// unitario UNICO derivado de la cantidad total producida (R18), el rollback entero si alguna
// linea da `presentation_without_content` (R19), y que el `'ok'` lleva un `FinishedGoodsReceipt`
// por linea.

import { describe, expect, it, vi } from 'vitest';

import { createFinishPacking, createStartPacking, type FinishPackingDeps } from '@/lib/modules/pedidos/domain/order-packing';
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double';

import type { OrderPackingRepository } from '@/lib/modules/pedidos/ports/order-packing-repository';
import type { FinishPackingLine, FinishPackingUpdateOutcome } from '@/lib/modules/pedidos/ports/order-write-repository';
import type { FinishedGoodsIntake, PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

const EMPRESA = 'c-1';
const PEDIDO = 'o-1';
const EMPACADOR = 'u-1';
const RECETA = 'r-1';
const AHORA = new Date('2026-09-25T12:00:00Z');

function packingDoble(overrides: Partial<OrderPackingRepository> = {}): OrderPackingRepository {
  return {
    startPackingAlive: vi.fn(async () => {
      throw new Error('startPackingAlive no configurado en este test');
    }),
    ...overrides,
  };
}

function lineaDe(overrides: Partial<FinishPackingLine> = {}): FinishPackingLine {
  return {
    id: 'linea-1',
    presentationId: 'p-1',
    packages: 10,
    presentationContent: '1.0000',
    ...overrides,
  };
}

/** `RecipeCatalog`/`ProductCatalog`/`UnitCatalog`/`PresentationCatalog` globales: por defecto
 *  una receta viva sin lineas (asi `resolveLotIngredientsCost` da `'0.0000'` sin inventar
 *  ingredientes) y ninguna presentacion vigente que rescatar. */
function catalogosGlobales(overrides: {
  readonly recipeName?: string;
  readonly recipeFound?: boolean;
  readonly presentationRefs?: readonly { readonly id: string; readonly content: string | null }[];
} = {}): {
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
  readonly presentations: Pick<PresentationCatalog, 'findRefs'>;
  readonly findRefsIncludingDeleted: ReturnType<typeof vi.fn>;
  readonly findPresentationRefs: ReturnType<typeof vi.fn>;
} {
  const findRefsIncludingDeleted = vi.fn(async () =>
    overrides.recipeFound === false ? [] : [{ id: RECETA, name: overrides.recipeName ?? 'Desengrasante', isDeleted: false }],
  );
  const findExecutionContentById = vi.fn(async () => ({ id: RECETA, name: 'Desengrasante', isDeleted: false, steps: [], lines: [] }));
  const findPresentationRefs = vi.fn(async () =>
    (overrides.presentationRefs ?? []).map((ref) => ({ id: ref.id, name: 'Presentacion', content: ref.content, unitId: 'unidad-1' })),
  );

  return {
    recipes: {
      findRefsIncludingDeleted,
      findExecutionContentById,
      findIdsMatchingName: async () => {
        throw new Error('sin uso en este test');
      },
      findAliveByNormalizedName: async () => {
        throw new Error('sin uso en este test');
      },
    },
    products: {
      findRefs: async () => [],
      findCostingBatches: async () => [],
      findFinishedGoodsReceipts: async () => {
        throw new Error('sin uso en este test');
      },
    } as unknown as ProductCatalog,
    units: {
      findRefs: async () => [],
      findRefsSharingBaseInCompany: async () => {
        throw new Error('sin uso en este test');
      },
    } as unknown as UnitCatalog,
    presentations: { findRefs: findPresentationRefs },
    findRefsIncludingDeleted,
    findPresentationRefs,
  };
}

describe('createStartPacking (R10, R18-R20, R23, R24)', () => {
  it('R18: ok delega en startPackingAlive con el companyId como scope, y devuelve ok', async () => {
    const startPackingAlive = vi.fn(async () => 'ok' as const);
    const packing = packingDoble({ startPackingAlive });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('ok');

    expect(startPackingAlive).toHaveBeenCalledWith(PEDIDO, EMPACADOR, AHORA, { companyId: EMPRESA });
    expect(startPackingAlive).toHaveBeenCalledTimes(1);
  });

  it('R20: already_mine (el mismo empacador repite Comenzar) se devuelve tal cual', async () => {
    const packing = packingDoble({ startPackingAlive: vi.fn(async () => 'already_mine' as const) });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('already_mine');
  });

  it('R19, R20: taken (EN_EMPAQUE a nombre de otro, o la carrera del segundo Comenzar) se devuelve tal cual', async () => {
    const packing = packingDoble({ startPackingAlive: vi.fn(async () => 'taken' as const) });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('taken');
  });

  it('R23: not_packable (el pedido no esta POR_EMPACAR) se devuelve tal cual', async () => {
    const packing = packingDoble({ startPackingAlive: vi.fn(async () => 'not_packable' as const) });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('not_packable');
  });

  it('R10: without_distribution (POR_EMPACAR sin ninguna linea de reparto) se devuelve tal cual', async () => {
    const packing = packingDoble({
      startPackingAlive: vi.fn(async () => 'without_distribution' as const),
    });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe(
      'without_distribution',
    );
  });

  it('R24: not_found (no existe, esta de baja o es de otra empresa) se devuelve tal cual', async () => {
    const packing = packingDoble({ startPackingAlive: vi.fn(async () => 'not_found' as const) });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('not_found');
  });
});

describe('createFinishPacking (T14, R17-R21)', () => {
  function montar(options: {
    readonly finishPackingAlive?: FinishPackingUpdateOutcome;
    readonly lines?: readonly FinishPackingLine[];
    readonly receiveFromOrder?: ReturnType<typeof vi.fn>;
    readonly catalogos?: ReturnType<typeof catalogosGlobales>;
  } = {}): {
    readonly finishPackingAliveById: ReturnType<typeof createFinishPacking>;
    readonly finishPackingAlive: ReturnType<typeof vi.fn>;
    readonly findPresentationLinesForFinish: ReturnType<typeof vi.fn>;
    readonly receiveFromOrder: ReturnType<typeof vi.fn>;
    readonly catalogos: ReturnType<typeof catalogosGlobales>;
  } {
    const catalogos = options.catalogos ?? catalogosGlobales();
    const finishPackingAlive = vi.fn(
      async (): Promise<FinishPackingUpdateOutcome> =>
        options.finishPackingAlive ?? { kind: 'ok', recipeId: RECETA, quantity: '10.0000', ingredientsCost: '20.0000' },
    );
    const findPresentationLinesForFinish = vi.fn(async () => options.lines ?? [lineaDe()]);
    const receiveFromOrder =
      options.receiveFromOrder ??
      vi.fn(async (input: { readonly presentationId: string; readonly packages: number }) => ({
        kind: 'received' as const,
        productId: `producto-${input.presentationId}`,
        productName: `Desengrasante · Presentacion ${input.presentationId}`,
        packages: String(input.packages),
      }));

    const { unitOfWork } = fakeUnitOfWork({
      orders: { finishPackingAlive, findPresentationLinesForFinish },
      finishedGoods: { receiveFromOrder: receiveFromOrder as unknown as FinishedGoodsIntake['receiveFromOrder'] },
    });

    const deps: FinishPackingDeps = {
      packing: packingDoble(),
      unitOfWork,
      recipes: catalogos.recipes,
      products: catalogos.products,
      units: catalogos.units,
      presentations: catalogos.presentations,
    };

    return {
      finishPackingAliveById: createFinishPacking(deps),
      finishPackingAlive,
      findPresentationLinesForFinish,
      receiveFromOrder,
      catalogos,
    };
  }

  it('R22, R23, R24: not_packer/not_packable/not_found se devuelven tal cual, sin leer lineas', async () => {
    for (const kind of ['not_packer', 'not_packable', 'not_found'] as const) {
      const { finishPackingAliveById, findPresentationLinesForFinish } = montar({
        finishPackingAlive: { kind },
      });

      await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe(kind);
      expect(findPresentationLinesForFinish).not.toHaveBeenCalled();
    }
  });

  it('sin ninguna linea de reparto, ok vuelve con finishedGoods vacio y no toca ningun catalogo', async () => {
    const catalogos = catalogosGlobales();
    const { finishPackingAliveById, receiveFromOrder } = montar({ lines: [], catalogos });

    await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toEqual({
      kind: 'ok',
      finishedGoods: [],
    });
    expect(receiveFromOrder).not.toHaveBeenCalled();
    expect(catalogos.findRefsIncludingDeleted).not.toHaveBeenCalled();
  });

  it('R17: da de alta un lote por cada linea del reparto, en el orden que las devuelve la lectura', async () => {
    const lineas = [lineaDe({ id: 'linea-1', presentationId: 'p-1', packages: 5 }), lineaDe({ id: 'linea-2', presentationId: 'p-2', packages: 3 })];
    const { finishPackingAliveById, receiveFromOrder } = montar({ lines: lineas });

    const resultado = await finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA);

    expect(resultado).toMatchObject({
      kind: 'ok',
      finishedGoods: [
        { productName: 'Desengrasante · Presentacion p-1', packages: '5' },
        { productName: 'Desengrasante · Presentacion p-2', packages: '3' },
      ],
    });
    expect(receiveFromOrder).toHaveBeenCalledTimes(2);
    expect(receiveFromOrder.mock.calls[0]![0]).toMatchObject({ presentationId: 'p-1', orderPresentationLineId: 'linea-1', packages: 5 });
    expect(receiveFromOrder.mock.calls[1]![0]).toMatchObject({ presentationId: 'p-2', orderPresentationLineId: 'linea-2', packages: 3 });
  });

  it('R18: deriva un unico coste unitario del importe guardado entre la cantidad TOTAL producida, y lo pasa igual a todas las lineas', async () => {
    const lineas = [lineaDe({ id: 'linea-1', packages: 5, presentationContent: '1.0000' }), lineaDe({ id: 'linea-2', presentationId: 'p-2', packages: 5, presentationContent: '1.0000' })];
    const { finishPackingAliveById, receiveFromOrder } = montar({
      lines: lineas,
      finishPackingAlive: { kind: 'ok', recipeId: RECETA, quantity: '10.0000', ingredientsCost: '20.0000' },
    });

    await finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA);

    // 20.0000 / (5 + 5) = 2.0000, el MISMO valor en las dos llamadas.
    expect(receiveFromOrder.mock.calls[0]![0]).toMatchObject({ unitCost: '2.0000' });
    expect(receiveFromOrder.mock.calls[1]![0]).toMatchObject({ unitCost: '2.0000' });
  });

  it('R18: sin importe guardado, recalcula el coste del lote con la receta que el pedido tiene AHORA', async () => {
    const catalogos = catalogosGlobales();
    const { finishPackingAliveById } = montar({
      lines: [lineaDe({ packages: 10, presentationContent: '1.0000' })],
      finishPackingAlive: { kind: 'ok', recipeId: RECETA, quantity: '10.0000', ingredientsCost: null },
      catalogos,
    });

    await finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA);

    expect(catalogos.findRefsIncludingDeleted).toHaveBeenCalledWith([RECETA], EMPRESA);
  });

  it('R19: una linea sin contenido copiado ni vigente rechaza con presentation_without_content y NO da de alta ningun lote', async () => {
    const lineas = [lineaDe({ id: 'linea-1', packages: 5 }), lineaDe({ id: 'linea-2', presentationId: 'p-2', packages: 5, presentationContent: null })];
    const catalogos = catalogosGlobales({ presentationRefs: [{ id: 'p-2', content: null }] });
    const { finishPackingAliveById, receiveFromOrder } = montar({ lines: lineas, catalogos });

    await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('presentation_without_content');
    expect(receiveFromOrder).not.toHaveBeenCalled();
  });

  it('R19: una linea sin contenido copiado se rescata con el contenido vigente de la presentacion', async () => {
    const lineas = [lineaDe({ id: 'linea-1', presentationId: 'p-2', packages: 4, presentationContent: null })];
    const catalogos = catalogosGlobales({ presentationRefs: [{ id: 'p-2', content: '2.0000' }] });
    const { finishPackingAliveById, receiveFromOrder } = montar({ lines: lineas, catalogos });

    await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toMatchObject({ kind: 'ok' });
    expect(receiveFromOrder).toHaveBeenCalledWith(expect.objectContaining({ orderContent: '2.0000' }));
  });

  it('R19: el `receiveFromOrder` de la primera linea rechazando (defensa de inventario) tambien deshace todo', async () => {
    const lineas = [lineaDe({ id: 'linea-1' }), lineaDe({ id: 'linea-2', presentationId: 'p-2' })];
    const receiveFromOrder = vi.fn(async () => ({ kind: 'presentation_without_content' as const }));
    const { finishPackingAliveById } = montar({ lines: lineas, receiveFromOrder });

    await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('presentation_without_content');
    expect(receiveFromOrder).toHaveBeenCalledTimes(1);
  });

  it('recipe_not_found: la receta del pedido ya no existe para esa empresa, sin dar de alta nada', async () => {
    const catalogos = catalogosGlobales({ recipeFound: false });
    const { finishPackingAliveById, receiveFromOrder } = montar({ catalogos });

    await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('recipe_not_found');
    expect(receiveFromOrder).not.toHaveBeenCalled();
  });
});
