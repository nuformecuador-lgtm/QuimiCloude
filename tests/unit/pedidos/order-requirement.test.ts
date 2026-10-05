import {
  buildOrderRequirement,
  buildRequirement,
  packagingLinesOf,
  type RequirementSourceLine,
  type RequirementUnits,
} from '@/lib/modules/pedidos/domain/order-requirement';
import type { MassVolumeBridge, UnitConversion } from '@/lib/modules/unidades';

function line(productId: string, percentage: string): RequirementSourceLine {
  return { productId, percentage };
}

/** Pedido sin unidad: la necesidad se lee tal cual, como antes de convertir. */
const SIN_UNIDAD: RequirementUnits = { orderUnitId: null, orderUnit: null, bridge: null, productUnits: new Map() };

function lineas(result: ReturnType<typeof buildRequirement>) {
  if (result.kind !== 'ok') throw new Error(`se esperaba ok y llego ${result.kind}`);
  return result.lines;
}

describe('buildRequirement', () => {
  it('calcula la necesidad de cada linea como cantidad del pedido por porcentaje, sin multiplicacion propia', () => {
    const result = buildRequirement([line('p1', '25')], '3.0000', SIN_UNIDAD);
    expect(lineas(result)).toEqual([{ productId: 'p1', quantity: '0.75' }]);
  });

  it('R11: un pedido de 0.0001 con un ingrediente al 0.01 % da una necesidad exacta de 0.00000001, sin redondear', () => {
    const result = buildRequirement([line('p1', '0.01')], '0.0001', SIN_UNIDAD);
    expect(lineas(result)[0]?.quantity).toBe('0.00000001');
  });

  it('R11: 200 por 10 % da 20 exacto', () => {
    const result = buildRequirement([line('p1', '10')], '200', SIN_UNIDAD);
    expect(lineas(result)[0]?.quantity).toBe('20');
  });

  it('R49: receta vacia produce una necesidad vacia', () => {
    expect(buildRequirement([], '2.0000', SIN_UNIDAD)).toEqual({ kind: 'ok', lines: [] });
  });

  it('conserva el orden y el producto de cada linea', () => {
    const result = buildRequirement([line('p1', '50'), line('p2', '25')], '2.0000', SIN_UNIDAD);
    expect(lineas(result)).toEqual([
      { productId: 'p1', quantity: '1' },
      { productId: 'p2', quantity: '0.5' },
    ]);
  });
});

describe('QC-195 buildOrderRequirement — receta y envases en una sola necesidad', () => {
  it('R15: un reparto de 40 botellas pide 40 envases, junto a la receta, antes de consumir', () => {
    const result = buildOrderRequirement({
      recipeLines: [line('materia', '25')],
      quantity: '20',
      packagingLines: [{ productId: 'botella', packages: 40 }],
      phase: 'before_consumption',
      units: SIN_UNIDAD,
    });
    expect(lineas(result)).toEqual([
      { productId: 'materia', quantity: '5' },
      { productId: 'botella', quantity: '40' },
    ]);
  });

  it('R24: con la receta ya consumida (POR_EMPACAR) solo quedan los envases', () => {
    const result = buildOrderRequirement({
      recipeLines: [line('materia', '25')],
      quantity: '20',
      packagingLines: [{ productId: 'botella', packages: 40 }],
      phase: 'materials_consumed',
      units: SIN_UNIDAD,
    });
    expect(lineas(result)).toEqual([{ productId: 'botella', quantity: '40' }]);
  });

  it('un mismo producto en la receta y en el reparto sale una vez, con la suma exacta', () => {
    const result = buildOrderRequirement({
      recipeLines: [line('p1', '12.5')],
      quantity: '0.0001',
      packagingLines: [{ productId: 'p1', packages: 3 }],
      phase: 'before_consumption',
      units: SIN_UNIDAD,
    });
    // 0.0001 x 12.5 % = 0.0000125: la suma no recorta a cuatro decimales.
    expect(lineas(result)).toEqual([{ productId: 'p1', quantity: '3.0000125' }]);
  });

  it('R32, R35: sin envases la necesidad es la de la receta, igual que hoy', () => {
    const recipeLines = [line('p1', '25'), line('p2', '75')];
    expect(
      buildOrderRequirement({
        recipeLines,
        quantity: '3.0000',
        packagingLines: [],
        phase: 'before_consumption',
        units: SIN_UNIDAD,
      }),
    ).toEqual(buildRequirement(recipeLines, '3.0000', SIN_UNIDAD));
  });

  it('R32, R35: las lineas antiguas, sin envase, no aportan envases', () => {
    expect(
      packagingLinesOf([
        { packagingProductId: null, packages: 3 },
        { packagingProductId: 'botella', packages: 40 },
      ]),
    ).toEqual([{ productId: 'botella', packages: 40 }]);
  });
});

describe('QC-204 — la necesidad que se aparta va convertida a la unidad del insumo', () => {
  const GRAMO: UnitConversion = { id: 'g', baseUnitId: null, factor: null };
  const KILOGRAMO: UnitConversion = { id: 'kg', baseUnitId: 'g', factor: '1000' };
  const MILILITRO: UnitConversion = { id: 'ml', baseUnitId: null, factor: null };
  const PIEZA: UnitConversion = { id: 'pieza', baseUnitId: null, factor: null };
  const PUENTE: MassVolumeBridge = { volumeBaseId: MILILITRO.id, massBaseId: GRAMO.id };

  function pedidoEnGramos(productUnits: ReadonlyMap<string, UnitConversion | null>): RequirementUnits {
    return { orderUnitId: GRAMO.id, orderUnit: GRAMO, bridge: PUENTE, productUnits };
  }

  it('R10 1000 g al 10 % sobre insumo en kg pide 0.1', () => {
    const result = buildRequirement([line('p1', '10')], '1000', pedidoEnGramos(new Map([['p1', KILOGRAMO]])));
    expect(result).toEqual({ kind: 'ok', lines: [{ productId: 'p1', quantity: '0.1' }] });
  });

  it('R10 dos lineas del mismo insumo en unidades distintas se suman ya convertidas', () => {
    const result = buildOrderRequirement({
      recipeLines: [line('p1', '10'), line('p1', '20')],
      quantity: '1000',
      packagingLines: [],
      phase: 'before_consumption',
      units: pedidoEnGramos(new Map([['p1', KILOGRAMO]])),
    });
    // 100 g y 200 g pasan a 0.1 kg y 0.2 kg antes de sumar; sin convertir serian 300.
    expect(result).toEqual({ kind: 'ok', lines: [{ productId: 'p1', quantity: '0.3' }] });
  });

  it('R4 una linea no convertible da not_convertible con su productId', () => {
    const units = pedidoEnGramos(
      new Map([
        ['p1', KILOGRAMO],
        ['p2', PIEZA],
      ]),
    );
    const recipeLines = [line('p1', '10'), line('p2', '20')];

    expect(buildRequirement(recipeLines, '1000', units)).toEqual({ kind: 'not_convertible', productIds: ['p2'] });
    expect(
      buildOrderRequirement({
        recipeLines,
        quantity: '1000',
        packagingLines: [{ productId: 'botella', packages: 4 }],
        phase: 'before_consumption',
        units,
      }),
    ).toEqual({ kind: 'not_convertible', productIds: ['p2'] });
  });

  it('R20 pedido sin unidad pide como antes', () => {
    const result = buildRequirement([line('p1', '10')], '1000', {
      ...SIN_UNIDAD,
      bridge: PUENTE,
      productUnits: new Map([['p1', KILOGRAMO]]),
    });
    expect(result).toEqual({ kind: 'ok', lines: [{ productId: 'p1', quantity: '100' }] });
  });

  it('R21 insumo sin unidad pasa la cifra sin convertir', () => {
    const result = buildRequirement([line('p1', '10')], '1000', pedidoEnGramos(new Map([['p1', null]])));
    expect(result).toEqual({ kind: 'ok', lines: [{ productId: 'p1', quantity: '100' }] });
  });
});
