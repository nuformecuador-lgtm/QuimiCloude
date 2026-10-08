// tests/unit/pedidos/update-order-presentation-lines.test.ts — R7, R11-R14, R35, R36, R38, R41,
// R42, R46, R48, [D3']. QC-195 R45-R47: el importe que guarda.
//
// `updateOrderPresentationLines` (`design.md > 4.2`): la edicion ACOTADA del reparto y la
// unidad, aparte de `updateOrder`. Bloquea la fila ANTES de validar, comprueba
// `REPARTO_EDITABLE_STATUSES` (no `assertTransition`), resuelve presentaciones y unidades, corre
// `validateDistribution` con la cantidad de la fila BLOQUEADA, y solo si todo pasa escribe la
// unidad y reemplaza el reparto, y sincroniza lo apartado de sus envases, dentro de la MISMA
// unidad de trabajo compartida con `inventario`.

import { describe, expect, it, vi } from 'vitest';

import {
  createUpdateOrderPresentationLines,
  REPARTO_EDITABLE_STATUSES,
  type UpdateOrderPresentationLinesDeps,
} from '@/lib/modules/pedidos/domain/update-order-presentation-lines';
import { OrderPresentationLineNotEditableError } from '@/lib/modules/pedidos/domain/errors';

import type { Actor } from '@/lib/modules/pedidos/domain/actor';
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification';
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view';
import type { LockedOrderRow, OrderWriteRepository } from '@/lib/modules/pedidos/ports/order-write-repository';
import type {
  CostingBatch,
  MaterialReservations,
  PackagingCostingBatch,
  PresentationCatalog,
  ProductCatalog,
  ReservationOutcome,
} from '@/lib/modules/inventario';
import type { RecipeCatalog, RecipeExecutionLine } from '@/lib/modules/recetas';
import {
  fakeFinishedGoodsIntake,
  fakeScopeProducts,
  fakeScopeUnits,
  fakeMaterialReservations,
  fakeOrderUnitOfWork,
  fakeRecipeExecutionReader,
} from '../../helpers/order-unit-of-work-double';
import type { UnitCatalog, UnitConversion, UnitRef } from '@/lib/modules/unidades';
import type { OrderTransactionScope } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import { fakePackagingCatalog, packagingRef } from '../../helpers/packaging-catalog-double';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PEDIDO = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = 'admin-a';
const ACTOR: Actor = { id: ACTOR_ID, companyId: EMPRESA, permissions: ['pedidos.modificar'] };
const UNIT_ID = '77777777-7777-4777-8777-777777777777';
const OTRA_UNIDAD_COMPATIBLE = '10101010-1010-4101-8101-101010101010';
const OTRA_UNIDAD_INCOMPATIBLE = '20202020-2020-4202-8202-202020202020';
const PRESENTACION_A = '66666666-6666-4666-8666-666666666666';
const PRESENTACION_B = '99999999-9999-4999-8999-999999999999';

const AHORA = new Date('2026-09-27T10:00:00.000Z');

function filaBloqueada(overrides: Partial<LockedOrderRow> = {}): LockedOrderRow {
  const base: OrderRow = {
    id: PEDIDO,
    number: { year: 2026, sequence: 7 },
    recipeId: 'receta-1',
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: ACTOR_ID,
    updatedBy: ACTOR_ID,
    presentationLines: [],
    unitId: UNIT_ID,
    customerId: null,
  };
  return { ...base, reservedAt: null, packagingCost: null, ...overrides };
}

/** Doble de `OrderWriteRepository`: los metodos que este caso de uso llama -bloquear, escribir el
 *  reparto, mover el estado, vaciar el importe y fijar `reserved_at`-; el resto explota. */
function ordersDoble(
  fila: LockedOrderRow | null,
  updateResult: 'ok' | 'not_found' = 'ok',
): {
  readonly orders: OrderWriteRepository;
  readonly updatePresentationLinesAlive: ReturnType<typeof vi.fn>;
  readonly setStatus: ReturnType<typeof vi.fn>;
  readonly setIngredientsCost: ReturnType<typeof vi.fn>;
  readonly setReservedAt: ReturnType<typeof vi.fn>;
} {
  const lockAliveById = vi.fn(async () => fila);
  const updatePresentationLinesAlive = vi.fn(async () => updateResult);
  const setStatus = vi.fn(async () => 'ok' as const);
  const setIngredientsCost = vi.fn(async () => 'ok' as const);
  const setReservedAt = vi.fn(async () => undefined);
  const orders = {
    lockAliveById,
    updatePresentationLinesAlive,
    setStatus,
    setIngredientsCost,
    setReservedAt,
    // El resto del puerto no lo llama este caso de uso: si lo hiciera, el test que lo comprueba
    // (mas abajo, "no toca...") fallaria por una llamada inesperada al doble.
    create: vi.fn(async () => {
      throw new Error('create no deberia llamarse');
    }),
    updateAlive: vi.fn(async () => {
      throw new Error('updateAlive no deberia llamarse');
    }),
    cancelAlive: vi.fn(async () => {
      throw new Error('cancelAlive no deberia llamarse');
    }),
    softDeleteAlive: vi.fn(async () => {
      throw new Error('softDeleteAlive no deberia llamarse');
    }),
  } as unknown as OrderWriteRepository;
  return { orders, updatePresentationLinesAlive, setStatus, setIngredientsCost, setReservedAt };
}

/** Catalogo de unidades: `UNIT_ID` -la del pedido, por defecto- siempre resuelve, ademas de las
 *  que el test anada. */
function catalogoDeUnidades(extra: ReadonlyMap<string, UnitConversion> = new Map()) {
  const UNIDAD_PEDIDO: UnitConversion = { id: UNIT_ID, baseUnitId: null, factor: null };
  const combinadas = new Map<string, UnitConversion>([[UNIT_ID, UNIDAD_PEDIDO], ...extra]);
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const unidad = combinadas.get(id);
      return unidad === undefined ? [] : [unidad];
    }),
  );
  const findMassVolumeBridge = vi.fn(async () => null);
  return {
    units: { findRefs, findRefsSharingBaseInCompany: vi.fn(async () => []), findMassVolumeBridge } as unknown as UnitCatalog,
    findRefs,
  };
}

/** Envase de cada presentacion del catalogo: el reparto nombra envases, y cada uno lleva su
 *  presentacion fija. */
const ENVASE_A = 'e6e6e6e6-e6e6-4e6e-8e6e-e6e6e6e6e6e6';
const ENVASE_B = 'e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9';
const ENVASE_DE: Readonly<Record<string, string>> = { [PRESENTACION_A]: ENVASE_A, [PRESENTACION_B]: ENVASE_B };

/** Catalogos de presentaciones y de envases: `PRESENTACION_A` (y su `ENVASE_A`) con
 *  `content`/`unitId` configurables; con `presentaciones` explicito, se reemplazan enteros (para
 *  probar mas de una linea o una ausente). */
function catalogoDePresentaciones(
  presentaciones: ReadonlyMap<string, { readonly content: string | null; readonly unitId: string }> = new Map([
    [PRESENTACION_A, { content: '5.0000', unitId: UNIT_ID }],
  ]),
  lotesDeEnvase: readonly PackagingCostingBatch[] = [],
) {
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const p = presentaciones.get(id);
      return p === undefined ? [] : [{ id, name: 'Presentacion', content: p.content, unitId: p.unitId }];
    }),
  );
  const packaging = fakePackagingCatalog(
    [...presentaciones].map(([presentationId, p]) =>
      packagingRef({ id: ENVASE_DE[presentationId] ?? presentationId, presentationId, content: p.content, unitId: p.unitId }),
    ),
    lotesDeEnvase,
  );
  return { presentations: { findRefs } as unknown as PresentationCatalog, packaging, findRefs };
}

const UNIDAD_MATERIA = '30303030-3030-4303-8303-303030303030';

/** Catalogos del importe: la receta (`recipes`) y los lotes de sus ingredientes (`products`),
 *  que se leen fuera del cliente de la transaccion. */
function catalogosDeCosto(recipeLines: readonly RecipeExecutionLine[], lotes: readonly CostingBatch[]) {
  const findExecutionContentById = vi.fn(async (id: string) => ({
    id,
    name: 'Receta',
    isDeleted: false,
    steps: [],
    lines: recipeLines,
    tools: [],
  }));
  const recipes = { findExecutionContentById, findRefsIncludingDeleted: vi.fn() } as unknown as RecipeCatalog;
  const findCostingBatches = vi.fn(async () => lotes);
  const findRefs = vi.fn(async (ids: readonly string[]) => ids.map((id) => ({ id, unitId: UNIDAD_MATERIA })));
  const products = { findCostingBatches, findRefs } as unknown as ProductCatalog;
  return { recipes, products, findExecutionContentById, findCostingBatches };
}

function montar(deps: {
  readonly orders: OrderWriteRepository;
  readonly catalogos?: ReturnType<typeof catalogoDePresentaciones>;
  readonly units?: UnitCatalog;
  readonly reservations?: MaterialReservations;
  readonly recipeLines?: readonly RecipeExecutionLine[];
  readonly costo?: ReturnType<typeof catalogosDeCosto>;
  readonly scopeProducts?: OrderTransactionScope['products'];
  readonly scopeUnits?: OrderTransactionScope['units'];
}) {
  const reservations = deps.reservations ?? fakeMaterialReservations();
  const recipes = fakeRecipeExecutionReader({
    findExecutionContentById: vi.fn(async (id: string) => ({
      id,
      name: 'Receta',
      isDeleted: false,
      steps: [],
      lines: deps.recipeLines ?? [],
      tools: [],
    })),
  });
  const catalogos = deps.catalogos ?? catalogoDePresentaciones();
  const costo = deps.costo ?? catalogosDeCosto(deps.recipeLines ?? [], []);
  const fullDeps: UpdateOrderPresentationLinesDeps = {
    recipes: costo.recipes,
    products: costo.products,
    presentations: catalogos.presentations,
    packaging: catalogos.packaging,
    units: deps.units ?? catalogoDeUnidades().units,
    unitOfWork: fakeOrderUnitOfWork({
      orders: deps.orders,
      reservations,
      recipes,
      finishedGoods: fakeFinishedGoodsIntake(),
      products: deps.scopeProducts ?? fakeScopeProducts(),
      units: deps.scopeUnits ?? fakeScopeUnits(),
    }),
    now: () => AHORA,
  };
  return createUpdateOrderPresentationLines(fullDeps);
}

describe("updateOrderPresentationLines — R11-R14, [D3']: ventana de estados editables", () => {
  it('REPARTO_EDITABLE_STATUSES es exactamente PENDIENTE, EN_CURSO, POR_EMPACAR y BLOQUEADO (QC-138)', () => {
    expect(REPARTO_EDITABLE_STATUSES).toEqual(['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'BLOQUEADO']);
  });

  it.each<OrderStatus>(['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'BLOQUEADO'])(
    'acepta %s: ok',
    async (status) => {
      const { orders } = ordersDoble(filaBloqueada({ status }));
      const update = montar({ orders });

      await expect(
        update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
      ).resolves.toBe('ok');
    },
  );

  it.each<OrderStatus>(['EN_EMPAQUE', 'ENTREGADO', 'CANCELADO'])(
    'rechaza %s con not_editable, sin escribir la unidad ni las lineas',
    async (status) => {
      const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ status }));
      const update = montar({ orders });

      await expect(
        update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
      ).resolves.toBe('not_editable');
      expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
    },
  );

  // QC-215 R19 (texto corregido por D13): la edicion acotada de un pedido de acondicionamiento o
  // `TERMINADO` rechaza con `order_presentation_line_not_editable`, como `ENTREGADO`, y NO con
  // `invalid_transition`. El dominio devuelve `not_editable`; el adaptador driving lo traduce a
  // `OrderPresentationLineNotEditableError` (`order-actions-distribution.test.ts`).
  it('R19 (QC-215, D13): not_editable es el codigo order_presentation_line_not_editable, no invalid_transition', () => {
    expect(new OrderPresentationLineNotEditableError().code).toBe('order_presentation_line_not_editable');
  });

  it.each<OrderStatus>(['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'])(
    'R19, R30 (QC-215, D13): rechaza %s como ENTREGADO, con not_editable (order_presentation_line_not_editable), sin escribir nada',
    async (status) => {
      const { orders, updatePresentationLinesAlive, setStatus, setIngredientsCost, setReservedAt } = ordersDoble(
        filaBloqueada({ status }),
      );
      const syncForOrder = vi.fn(async (): Promise<ReservationOutcome> => ({ kind: 'reserved' }));
      const update = montar({ orders, reservations: fakeMaterialReservations({ syncForOrder }) });

      await expect(
        update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
      ).resolves.toBe('not_editable');
      expect(REPARTO_EDITABLE_STATUSES).not.toContain(status);
      expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
      expect(setStatus).not.toHaveBeenCalled();
      expect(setIngredientsCost).not.toHaveBeenCalled();
      expect(setReservedAt).not.toHaveBeenCalled();
      expect(syncForOrder).not.toHaveBeenCalled();
    },
  );

  it('not_found: la fila no existe, esta de baja o es de otra empresa', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(null);
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [] }),
    ).resolves.toBe('not_found');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });
});

describe('updateOrderPresentationLines — bloquea antes de validar (R37, R48)', () => {
  it('llama lockAliveById con el pedido y el ambito de empresa antes de tocar ningun catalogo', async () => {
    const { orders } = ordersDoble(filaBloqueada());
    const cat = catalogoDePresentaciones();
    const update = montar({ orders, catalogos: cat });

    await update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [] });

    expect(orders.lockAliveById).toHaveBeenCalledWith(PEDIDO, { companyId: EMPRESA });
  });
});

describe('updateOrderPresentationLines — orden de comprobacion (design.md > 4.2)', () => {
  it('unit_not_found: la unidad nueva no existe o no es visible, sin escribir nada', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const update = montar({ orders, units: catalogoDeUnidades().units });

    await expect(
      update(PEDIDO, ACTOR, { unitId: 'unidad-inexistente', lines: [] }),
    ).resolves.toBe('unit_not_found');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('QC-195 R11: packaging_not_found: una linea nombra un envase que no vuelve del catalogo', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const update = montar({ orders, catalogos: catalogoDePresentaciones(new Map()) });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
    ).resolves.toBe('packaging_not_found');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R35 / QC-195 R13: presentation_without_content (la presentacion del envase no tiene contenido), sin escribir nada', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const cat = catalogoDePresentaciones(new Map([[PRESENTACION_A, { content: null, unitId: UNIT_ID }]]));
    const update = montar({ orders, catalogos: cat });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
    ).resolves.toBe('presentation_without_content');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R7: incompatible_units, incluida la unidad NUEVA que deja el reparto inconvertible (R38)', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const units = catalogoDeUnidades(
      new Map([
        [OTRA_UNIDAD_INCOMPATIBLE, { id: OTRA_UNIDAD_INCOMPATIBLE, baseUnitId: null, factor: null }],
      ]),
    ).units;
    const catalogos = catalogoDePresentaciones(
      new Map([[PRESENTACION_A, { content: '5.0000', unitId: OTRA_UNIDAD_INCOMPATIBLE }]]),
    );
    const update = montar({ orders, units, catalogos });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
    ).resolves.toBe('incompatible_units');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R36: exceeds_quantity cuando el reparto pasa de la cantidad de la fila BLOQUEADA, sin escribir nada', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 3 }] }),
    ).resolves.toBe('exceeds_quantity');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });
});

describe('updateOrderPresentationLines — R8, R9: igual al total, menor, y vacio', () => {
  it('un reparto exactamente igual al total se acepta', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 2 }] }),
    ).resolves.toBe('ok');
    expect(updatePresentationLinesAlive).toHaveBeenCalledTimes(1);
  });

  it('un reparto menor que el total se acepta', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 1 }] }),
    ).resolves.toBe('ok');
    expect(updatePresentationLinesAlive).toHaveBeenCalledTimes(1);
  });

  it('R9: un reparto vacio (vaciar el reparto) se acepta', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const update = montar({ orders });

    await expect(update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [] })).resolves.toBe('ok');
    expect(updatePresentationLinesAlive).toHaveBeenCalledWith(PEDIDO, UNIT_ID, [], ACTOR_ID, AHORA, {
      companyId: EMPRESA,
    });
  });
});

describe('updateOrderPresentationLines — escritura conjunta y reemplazo completo', () => {
  it('guarda la unidad NUEVA y TODAS las lineas nuevas juntas, con el contenido copiado en este instante', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    // La unidad NUEVA del pedido (distinta de `UNIT_ID`) tiene que poder resolverse en el
    // catalogo, y las presentaciones se declaran en ESA misma unidad para que el reparto sea
    // convertible (R38): lo que se prueba aqui es que unidad y lineas se escriben JUNTAS, no la
    // conversion en si -esa ya la prueba `order-distribution.test.ts`-.
    const units = catalogoDeUnidades(
      new Map([[OTRA_UNIDAD_COMPATIBLE, { id: OTRA_UNIDAD_COMPATIBLE, baseUnitId: null, factor: null }]]),
    ).units;
    const catalogos = catalogoDePresentaciones(
      new Map([
        [PRESENTACION_A, { content: '3.0000', unitId: OTRA_UNIDAD_COMPATIBLE }],
        [PRESENTACION_B, { content: '2.0000', unitId: OTRA_UNIDAD_COMPATIBLE }],
      ]),
    );
    const update = montar({ orders, units, catalogos });

    await expect(
      update(PEDIDO, ACTOR, {
        unitId: OTRA_UNIDAD_COMPATIBLE,
        lines: [
          { packagingProductId: ENVASE_A, packages: 1 },
          { packagingProductId: ENVASE_B, packages: 1 },
        ],
      }),
    ).resolves.toBe('ok');

    expect(updatePresentationLinesAlive).toHaveBeenCalledWith(
      PEDIDO,
      OTRA_UNIDAD_COMPATIBLE,
      [
        { presentationId: PRESENTACION_A, packages: 1, content: '3.0000', packagingProductId: ENVASE_A },
        { presentationId: PRESENTACION_B, packages: 1, content: '2.0000', packagingProductId: ENVASE_B },
      ],
      ACTOR_ID,
      AHORA,
      { companyId: EMPRESA },
    );
  });
});

describe('QC-195 updateOrderPresentationLines — lineas antiguas y dos envases con la misma presentacion', () => {
  it('R35: una linea antigua que llega igual a la guardada se conserva sin envase', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(
      filaBloqueada({ presentationLines: [{ presentationId: PRESENTACION_A, packages: 1, packagingProductId: null }] }),
    );
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ presentationId: PRESENTACION_A, packages: 1 }] }),
    ).resolves.toBe('ok');
    expect(updatePresentationLinesAlive).toHaveBeenCalledWith(
      PEDIDO,
      UNIT_ID,
      [{ presentationId: PRESENTACION_A, packages: 1, content: '5.0000', packagingProductId: null }],
      ACTOR_ID,
      AHORA,
      { companyId: EMPRESA },
    );
  });

  it('R34: una linea antigua con los envases cambiados -> invalid_lines, sin escribir', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(
      filaBloqueada({ presentationLines: [{ presentationId: PRESENTACION_A, packages: 1, packagingProductId: null }] }),
    );
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ presentationId: PRESENTACION_A, packages: 2 }] }),
    ).resolves.toBe('invalid_lines');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R34: una linea por presentacion que el pedido no tenia -> invalid_lines, sin escribir', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada());
    const update = montar({ orders });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ presentationId: PRESENTACION_A, packages: 1 }] }),
    ).resolves.toBe('invalid_lines');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });

  it('R12: dos envases con la misma presentacion -> invalid_lines, sin escribir', async () => {
    const { orders, updatePresentationLinesAlive } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const GEMELO = 'eaeaeaea-eaea-4eae-8eae-eaeaeaeaeaea';
    const catalogos = {
      ...catalogoDePresentaciones(),
      packaging: fakePackagingCatalog([
        packagingRef({ id: ENVASE_A, presentationId: PRESENTACION_A, content: '1.0000', unitId: UNIT_ID }),
        packagingRef({ id: GEMELO, presentationId: PRESENTACION_A, content: '1.0000', unitId: UNIT_ID }),
      ]),
    };
    const update = montar({ orders, catalogos });

    await expect(
      update(PEDIDO, ACTOR, {
        unitId: UNIT_ID,
        lines: [
          { packagingProductId: ENVASE_A, packages: 1 },
          { packagingProductId: GEMELO, packages: 1 },
        ],
      }),
    ).resolves.toBe('invalid_lines');
    expect(updatePresentationLinesAlive).not.toHaveBeenCalled();
  });
});

describe('updateOrderPresentationLines — R46: no toca quantity ni receta; QC-195 R15, R20: la reserva si, porque el reparto aparta sus envases', () => {
  it('QC-195 R45: las dependencias declaradas son las del reparto mas recipes y products para el importe', () => {
    const costo = catalogosDeCosto([], []);
    const fullDeps: UpdateOrderPresentationLinesDeps = {
      recipes: costo.recipes,
      products: costo.products,
      presentations: catalogoDePresentaciones().presentations,
      packaging: catalogoDePresentaciones().packaging,
      units: catalogoDeUnidades().units,
      unitOfWork: { run: () => Promise.reject(new Error('no se usa')) },
      now: () => AHORA,
    };
    expect(Object.keys(fullDeps).sort()).toEqual([
      'now',
      'packaging',
      'presentations',
      'products',
      'recipes',
      'unitOfWork',
      'units',
    ]);
  });

  it('R46: no escribe cantidad ni receta -ni create, ni updateAlive- y, con todo apartado, no mueve el estado', async () => {
    const { orders, setStatus } = ordersDoble(filaBloqueada());
    const update = montar({ orders });

    // Si este caso de uso llamara a `create`/`updateAlive`/`cancelAlive`/`softDeleteAlive`, los
    // dobles de `ordersDoble` lanzarian y esta llamada rechazaria en vez de resolver 'ok'.
    await expect(update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [] })).resolves.toBe('ok');
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('R15, R20: la reserva se sincroniza con la necesidad completa -receta y envases del reparto nuevo-, en la misma unidad de trabajo', async () => {
    const { orders, setReservedAt } = ordersDoble(filaBloqueada({ quantity: '10.0000' }));
    const reservations = fakeMaterialReservations();
    const update = montar({
      orders,
      reservations,
      recipeLines: [{ productId: 'materia', productName: null, percentage: '100.00' }],
    });

    await expect(
      update(PEDIDO, ACTOR, { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 2 }] }),
    ).resolves.toBe('ok');

    expect(reservations.syncForOrder).toHaveBeenCalledWith({
      orderId: PEDIDO,
      companyId: EMPRESA,
      requirement: [
        { productId: 'materia', quantity: '10' },
        { productId: ENVASE_A, quantity: '2' },
      ],
      actorId: ACTOR_ID,
      now: AHORA,
    });
    expect(setReservedAt).toHaveBeenCalledWith(PEDIDO, AHORA, { companyId: EMPRESA });
  });
});

describe('QC-195 updateOrderPresentationLines — falta de envases y bloqueo', () => {
  const FALTA: ReservationOutcome = { kind: 'insufficient', productIds: [ENVASE_A] };

  function conFalta() {
    return fakeMaterialReservations({ syncForOrder: vi.fn(async () => FALTA) });
  }

  const LINEAS = { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 2 }] };

  it.each<OrderStatus>(['PENDIENTE', 'BLOQUEADO'])(
    'R17: en %s, sin confirmacion, falta de envase -> would_block, sin mover estado ni importe',
    async (status) => {
      const { orders, setStatus, setIngredientsCost } = ordersDoble(filaBloqueada({ status, quantity: '10.0000' }));
      const update = montar({ orders, reservations: conFalta() });

      await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('would_block');
      expect(setStatus).not.toHaveBeenCalled();
      expect(setIngredientsCost).not.toHaveBeenCalled();
    },
  );

  it('R17: con la confirmacion, un PENDIENTE pasa a BLOQUEADO sin importe y sin reserved_at', async () => {
    const { orders, setStatus, setIngredientsCost, setReservedAt } = ordersDoble(
      filaBloqueada({ status: 'PENDIENTE', quantity: '10.0000', ingredientsCost: '12.0000' }),
    );
    const update = montar({ orders, reservations: conFalta() });

    await expect(update(PEDIDO, ACTOR, { ...LINEAS, confirmBlocked: true })).resolves.toBe('ok');
    expect(setStatus).toHaveBeenCalledWith(PEDIDO, 'PENDIENTE', 'BLOQUEADO', ACTOR_ID, AHORA, { companyId: EMPRESA });
    expect(setIngredientsCost).toHaveBeenCalledWith(PEDIDO, null, ACTOR_ID, AHORA, { companyId: EMPRESA });
    expect(setReservedAt).toHaveBeenCalledWith(PEDIDO, null, { companyId: EMPRESA });
  });

  it('R17: con la confirmacion, un BLOQUEADO sigue BLOQUEADO sin volver a moverse', async () => {
    const { orders, setStatus } = ordersDoble(filaBloqueada({ status: 'BLOQUEADO', quantity: '10.0000' }));
    const update = montar({ orders, reservations: conFalta() });

    await expect(update(PEDIDO, ACTOR, { ...LINEAS, confirmBlocked: true })).resolves.toBe('ok');
    expect(setStatus).not.toHaveBeenCalled();
  });

  it.each<OrderStatus>(['EN_CURSO', 'POR_EMPACAR'])(
    'R18: en %s, falta de envase -> insufficient_material aunque llegue la confirmacion',
    async (status) => {
      const { orders, setStatus } = ordersDoble(filaBloqueada({ status, quantity: '10.0000' }));
      const update = montar({ orders, reservations: conFalta() });

      await expect(update(PEDIDO, ACTOR, { ...LINEAS, confirmBlocked: true })).resolves.toBe('insufficient_material');
      expect(setStatus).not.toHaveBeenCalled();
    },
  );

  it('R19: un BLOQUEADO cuyo reparto nuevo ya queda cubierto pasa a PENDIENTE con reserved_at', async () => {
    const { orders, setStatus, setReservedAt } = ordersDoble(filaBloqueada({ status: 'BLOQUEADO', quantity: '10.0000' }));
    const update = montar({ orders });

    await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
    expect(setStatus).toHaveBeenCalledWith(PEDIDO, 'BLOQUEADO', 'PENDIENTE', ACTOR_ID, AHORA, { companyId: EMPRESA });
    expect(setReservedAt).toHaveBeenCalledWith(PEDIDO, AHORA, { companyId: EMPRESA });
  });

  it('R24: en POR_EMPACAR solo se sincronizan los envases: la receta ni se lee', async () => {
    const { orders } = ordersDoble(filaBloqueada({ status: 'POR_EMPACAR', quantity: '10.0000' }));
    const reservations = fakeMaterialReservations();
    const recipeLines = [{ productId: 'materia', productName: null, percentage: '100.00' }];
    const update = montar({ orders, reservations, recipeLines });

    await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
    expect(reservations.syncForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ requirement: [{ productId: ENVASE_A, quantity: '2' }] }),
    );
  });
});

describe('QC-195 updateOrderPresentationLines — R45, R46, R47: el importe que guarda', () => {
  const ESCOPO = { companyId: EMPRESA };
  const LINEAS = { unitId: UNIT_ID, lines: [{ packagingProductId: ENVASE_A, packages: 2 }] };
  const RECETA: readonly RecipeExecutionLine[] = [{ productId: 'materia', productName: null, percentage: '100.00' }];
  // 10 de materia a 2.0000 = 20.0000 de ingredientes.
  const LOTE_MATERIA: CostingBatch = {
    productId: 'materia',
    unitId: UNIDAD_MATERIA,
    lot: '1',
    stock: '100',
    available: '100',
    unitCost: '2.0000',
    purchaseDate: '2026-01-01',
  };
  // Dos lotes del envase a 0.50 y 0.70: 2 envases x 0.60 = 1.2000.
  const LOTES_ENVASE: readonly PackagingCostingBatch[] = [
    { productId: ENVASE_A, unitCost: '0.5000', available: '100' },
    { productId: ENVASE_A, unitCost: '0.7000', available: '50' },
  ];

  function montarConCosto(fila: LockedOrderRow, lotesEnvase: readonly PackagingCostingBatch[] = LOTES_ENVASE) {
    const doble = ordersDoble(fila);
    const costo = catalogosDeCosto(RECETA, [LOTE_MATERIA]);
    const catalogos = catalogoDePresentaciones(undefined, lotesEnvase);
    const update = montar({
      orders: doble.orders,
      catalogos,
      units: catalogoDeUnidades(new Map([[UNIDAD_MATERIA, { id: UNIDAD_MATERIA, baseUnitId: UNIT_ID, factor: '1' }]])).units,
      recipeLines: RECETA,
      costo,
    });
    return { ...doble, update, costo, packaging: catalogos.packaging };
  }

  it.each<OrderStatus>(['PENDIENTE', 'EN_CURSO'])(
    'R45: en %s guarda el importe nuevo -ingredientes 20 + envases 1.2- con el apartado del propio pedido',
    async (status) => {
      const { update, setIngredientsCost, costo, packaging } = montarConCosto(
        filaBloqueada({ status, ingredientsCost: '99.0000', packagingCost: '0.0000' }),
      );

      await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
      expect(setIngredientsCost).toHaveBeenCalledTimes(1);
      expect(setIngredientsCost).toHaveBeenCalledWith(
        PEDIDO,
        { total: '21.2000', packaging: '1.2000' },
        ACTOR_ID,
        AHORA,
        ESCOPO,
      );
      expect(costo.findCostingBatches).toHaveBeenCalledWith(['materia'], EMPRESA, { excludeOrderId: PEDIDO });
      expect(packaging.findCostingBatches).toHaveBeenCalledWith([ENVASE_A], EMPRESA, { excludeOrderId: PEDIDO });
    },
  );

  it('R45: un envase sin lote con costo deja el pedido sin importe (null), como la cotizacion', async () => {
    const { update, setIngredientsCost } = montarConCosto(
      filaBloqueada({ status: 'PENDIENTE', ingredientsCost: '99.0000', packagingCost: '0.0000' }),
      [],
    );

    await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
    expect(setIngredientsCost).toHaveBeenCalledWith(PEDIDO, null, ACTOR_ID, AHORA, ESCOPO);
  });

  it('R46: BLOQUEADO -> PENDIENTE escribe el importe calculado, no lo deja sin importe', async () => {
    const { update, setStatus, setIngredientsCost } = montarConCosto(filaBloqueada({ status: 'BLOQUEADO' }));

    await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
    expect(setStatus).toHaveBeenCalledWith(PEDIDO, 'BLOQUEADO', 'PENDIENTE', ACTOR_ID, AHORA, ESCOPO);
    expect(setIngredientsCost).toHaveBeenCalledWith(
      PEDIDO,
      { total: '21.2000', packaging: '1.2000' },
      ACTOR_ID,
      AHORA,
      ESCOPO,
    );
  });

  it('R45, R17: si queda BLOQUEADO el importe es null y no se calcula', async () => {
    const doble = ordersDoble(filaBloqueada({ status: 'PENDIENTE', ingredientsCost: '12.0000', packagingCost: '0.0000' }));
    const costo = catalogosDeCosto(RECETA, [LOTE_MATERIA]);
    const update = montar({
      orders: doble.orders,
      reservations: fakeMaterialReservations({
        syncForOrder: vi.fn(async (): Promise<ReservationOutcome> => ({ kind: 'insufficient', productIds: [ENVASE_A] })),
      }),
      recipeLines: RECETA,
      costo,
    });

    await expect(update(PEDIDO, ACTOR, { ...LINEAS, confirmBlocked: true })).resolves.toBe('ok');
    expect(doble.setIngredientsCost).toHaveBeenCalledTimes(1);
    expect(doble.setIngredientsCost).toHaveBeenCalledWith(PEDIDO, null, ACTOR_ID, AHORA, ESCOPO);
    expect(costo.findCostingBatches).not.toHaveBeenCalled();
  });

  it('R47: en POR_EMPACAR conserva la parte de ingredientes guardada (25 - 5 = 20) y suma los envases nuevos (1.2)', async () => {
    const { update, setIngredientsCost, costo, packaging } = montarConCosto(
      filaBloqueada({ status: 'POR_EMPACAR', ingredientsCost: '25.0000', packagingCost: '5.0000' }),
    );

    await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
    expect(setIngredientsCost).toHaveBeenCalledWith(
      PEDIDO,
      { total: '21.2000', packaging: '1.2000' },
      ACTOR_ID,
      AHORA,
      ESCOPO,
    );
    // Los ingredientes no se recalculan: ni la receta ni sus lotes se leen.
    expect(costo.findExecutionContentById).not.toHaveBeenCalled();
    expect(costo.findCostingBatches).not.toHaveBeenCalled();
    expect(packaging.findCostingBatches).toHaveBeenCalledWith([ENVASE_A], EMPRESA, { excludeOrderId: PEDIDO });
  });

  it('R47: en POR_EMPACAR sin importe guardado queda sin importe', async () => {
    const { update, setIngredientsCost } = montarConCosto(filaBloqueada({ status: 'POR_EMPACAR' }));

    await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
    expect(setIngredientsCost).toHaveBeenCalledWith(PEDIDO, null, ACTOR_ID, AHORA, ESCOPO);
  });

  it('R47: en POR_EMPACAR, si el costo de los envases nuevos es «sin importe», queda sin importe', async () => {
    const { update, setIngredientsCost } = montarConCosto(
      filaBloqueada({ status: 'POR_EMPACAR', ingredientsCost: '25.0000', packagingCost: '5.0000' }),
      [],
    );

    await expect(update(PEDIDO, ACTOR, LINEAS)).resolves.toBe('ok');
    expect(setIngredientsCost).toHaveBeenCalledWith(PEDIDO, null, ACTOR_ID, AHORA, ESCOPO);
  });
});

describe('QC-204 updateOrderPresentationLines — la necesidad y el importe con la unidad nueva', () => {
  const ESCOPO = { companyId: EMPRESA };
  const GRAMO: UnitRef = { id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', name: 'Gramo', symbol: 'g', baseUnitId: null, factor: null };
  const KILO: UnitRef = { id: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', name: 'Kilogramo', symbol: 'kg', baseUnitId: GRAMO.id, factor: '1000' };
  const PIEZA: UnitRef = { id: 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', name: 'Pieza', symbol: 'pz', baseUnitId: null, factor: null };
  const MATERIA = 'materia';
  const RECETA: readonly RecipeExecutionLine[] = [{ productId: MATERIA, productName: null, percentage: '10.00' }];

  /** El pedido esta guardado en kg (1000 kg); el reparto lo pasa a gramos, sin lineas. */
  function montarConUnidad(insumoUnitId: string) {
    const doble = ordersDoble(filaBloqueada({ status: 'PENDIENTE', quantity: '1000.0000', unitId: KILO.id }));
    const lote: CostingBatch = {
      productId: MATERIA,
      unitId: insumoUnitId,
      lot: '1',
      stock: '1000',
      available: '1000',
      unitCost: '2.0000',
      purchaseDate: '2026-01-01',
    };
    const costo = catalogosDeCosto(RECETA, [lote]);
    costo.products.findRefs = vi.fn(async (ids: readonly string[]) =>
      ids.map((id) => ({ id, name: id, unitId: insumoUnitId, stockByUnit: [], type: 'PRODUCT' as const })),
    );
    const syncForOrder = vi.fn(async (): Promise<ReservationOutcome> => ({ kind: 'reserved' }));
    const update = montar({
      orders: doble.orders,
      reservations: fakeMaterialReservations({ syncForOrder }),
      units: catalogoDeUnidades(new Map([[GRAMO.id, GRAMO], [KILO.id, KILO], [PIEZA.id, PIEZA]])).units,
      recipeLines: RECETA,
      costo,
      scopeProducts: fakeScopeProducts([{ id: MATERIA, name: MATERIA, unitId: insumoUnitId, stockByUnit: [], type: 'PRODUCT' }]),
      scopeUnits: fakeScopeUnits([GRAMO, KILO, PIEZA]),
    });
    return { ...doble, update, syncForOrder };
  }

  const EN_GRAMOS = { unitId: GRAMO.id, lines: [] };

  it('R5 cambiar la unidad desde el reparto recalcula con la unidad nueva', async () => {
    const m = montarConUnidad(KILO.id);

    await expect(m.update(PEDIDO, ACTOR, EN_GRAMOS)).resolves.toBe('ok');

    // 1000 g al 10 % son 0.1 kg a 2.0000: 0.2000. Con la unidad guardada (kg) serian 200.0000.
    expect(m.setIngredientsCost).toHaveBeenCalledWith(
      PEDIDO,
      { total: '0.2000', packaging: '0.0000' },
      ACTOR_ID,
      AHORA,
      ESCOPO,
    );
    const entrada = (m.syncForOrder.mock.calls[0] as unknown as readonly [{ requirement: readonly { quantity: string }[] }])[0];
    expect(Number(entrada.requirement[0]?.quantity)).toBe(0.1);
  });

  it('R12 la edicion y el reparto con una linea no convertible se rechazan con order_unit_not_convertible', async () => {
    const m = montarConUnidad(PIEZA.id);

    await expect(m.update(PEDIDO, ACTOR, EN_GRAMOS)).resolves.toBe('unit_not_convertible');
    expect(m.updatePresentationLinesAlive).not.toHaveBeenCalled();
    expect(m.syncForOrder).not.toHaveBeenCalled();
    expect(m.setIngredientsCost).not.toHaveBeenCalled();
    expect(m.setReservedAt).not.toHaveBeenCalled();
  });
});
